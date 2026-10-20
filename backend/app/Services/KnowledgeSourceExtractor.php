<?php

namespace App\Services;

use DOMDocument;
use DOMXPath;
use PharData;
use RuntimeException;
use Smalot\PdfParser\Parser as PdfParser;
use ZipArchive;

class KnowledgeSourceExtractor
{
    public function extract(string $path, string $extension): array
    {
        $result = match ($extension) {
            'csv' => $this->csv($path),
            'md' => $this->markdown($path),
            'docx' => $this->docx($path),
            'xlsx' => $this->xlsx($path),
            'pdf' => $this->pdf($path),
            default => throw new RuntimeException('No safe extractor is configured for this file type.'),
        };

        $characterCount = array_sum(array_map(fn (array $chunk) => mb_strlen($chunk['content']), $result['chunks']));
        if ($characterCount === 0) {
            throw new RuntimeException('No readable content could be extracted from the document.');
        }
        if ($characterCount > (int) config('knowledge.max_extracted_characters', 2000000)) {
            throw new RuntimeException('The extracted document exceeds the safe processing limit.');
        }

        $result['metadata']['character_count'] = $characterCount;
        $result['metadata']['chunk_count'] = count($result['chunks']);

        return $result;
    }

    private function csv(string $path): array
    {
        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('The CSV file could not be opened.');
        }
        $sample = (string) fgets($handle);
        rewind($handle);
        $delimiter = $this->detectDelimiter($sample);
        $rows = [];
        $headings = null;
        $rowNumber = 0;
        $formulaCells = 0;
        $maxRows = (int) config('knowledge.max_csv_rows', 20000);
        $maxColumns = (int) config('knowledge.max_csv_columns', 100);
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            $rowNumber++;
            if ($rowNumber > $maxRows) {
                fclose($handle);
                throw new RuntimeException('The CSV exceeds the maximum permitted row count.');
            }
            if (count($row) > $maxColumns) {
                fclose($handle);
                throw new RuntimeException("CSV row {$rowNumber} exceeds the maximum permitted column count.");
            }
            $row = array_map(fn ($value) => trim((string) $value), $row);
            foreach ($row as $value) {
                $formulaCells += preg_match('/^[=+@]/', ltrim($value)) === 1 ? 1 : 0;
            }
            if ($headings === null) {
                $headings = $row;

                continue;
            }
            if (array_filter($row, fn ($value) => $value !== '') === []) {
                continue;
            }
            $pairs = [];
            foreach ($row as $index => $value) {
                $label = trim((string) ($headings[$index] ?? 'Column '.($index + 1)));
                $pairs[] = ($label !== '' ? $label : 'Column '.($index + 1)).': '.$value;
            }
            $rows[] = ['section' => 'Row '.($rowNumber - 1), 'content' => implode("\n", $pairs), 'metadata' => ['row' => $rowNumber]];
        }
        fclose($handle);

        return [
            'chunks' => $this->normaliseChunks($rows),
            'metadata' => ['format' => 'csv', 'rows' => max(0, $rowNumber - 1), 'columns' => count($headings ?? []), 'headings' => $headings ?? [], 'formula_cells' => $formulaCells],
            'findings' => $formulaCells > 0 ? [[
                'severity' => 'warning', 'code' => 'spreadsheet_formula_candidate',
                'message' => 'Formula-like CSV cells were preserved as text and require review.',
                'blocks_release' => true,
            ]] : [],
        ];
    }

    private function markdown(string $path): array
    {
        $text = (string) file_get_contents($path);
        $text = preg_replace('/<[^>]*>/', '', $text) ?? $text;
        $sections = preg_split('/(?=^#{1,6}\s+)/m', $text) ?: [$text];
        $chunks = [];
        foreach ($sections as $section) {
            $lines = preg_split('/\R/', trim($section)) ?: [];
            $heading = null;
            if (isset($lines[0]) && preg_match('/^#{1,6}\s+(.+)$/', $lines[0], $match)) {
                $heading = trim($match[1]);
                array_shift($lines);
            }
            $chunks[] = ['section' => $heading, 'content' => implode("\n", $lines), 'metadata' => []];
        }

        return ['chunks' => $this->normaliseChunks($chunks), 'metadata' => ['format' => 'markdown'], 'findings' => []];
    }

    private function docx(string $path): array
    {
        $xml = $this->archiveEntry($path, 'word/document.xml');
        $xpath = $this->xpath($xml, 'w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $chunks = [];
        foreach ($xpath->query('//w:body/w:p | //w:body/w:tbl') ?: [] as $index => $node) {
            $text = $this->normaliseText($node->textContent);
            if ($text !== '') {
                $chunks[] = ['section' => $node->localName === 'tbl' ? 'Table' : 'Document', 'content' => $text, 'metadata' => ['element' => $index + 1]];
            }
        }

        return ['chunks' => $this->normaliseChunks($chunks), 'metadata' => ['format' => 'docx'], 'findings' => []];
    }

    private function xlsx(string $path): array
    {
        $sharedStrings = [];
        $sharedXml = $this->archiveEntry($path, 'xl/sharedStrings.xml', false);
        if ($sharedXml !== null) {
            $xpath = $this->xpath($sharedXml, 's', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            foreach ($xpath->query('//s:si') ?: [] as $node) {
                $sharedStrings[] = $this->normaliseText($node->textContent);
            }
        }

        $entries = array_values(array_filter($this->archiveNames($path), fn (string $name) => preg_match('#^xl/worksheets/sheet\d+\.xml$#i', $name)));
        sort($entries, SORT_NATURAL);
        $chunks = [];
        $formulaCells = 0;
        $totalRows = 0;
        $largestColumnCount = 0;
        $maxRows = (int) config('knowledge.max_csv_rows', 20000);
        $maxColumns = (int) config('knowledge.max_csv_columns', 100);
        foreach ($entries as $sheetIndex => $entry) {
            $xpath = $this->xpath($this->archiveEntry($path, $entry), 's', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            foreach ($xpath->query('//s:sheetData/s:row') ?: [] as $row) {
                $totalRows++;
                if ($totalRows > $maxRows) {
                    throw new RuntimeException('The workbook exceeds the maximum permitted row count.');
                }
                $values = [];
                $cells = $xpath->query('./s:c', $row);
                $columnCount = $cells?->length ?? 0;
                $largestColumnCount = max($largestColumnCount, $columnCount);
                if ($columnCount > $maxColumns) {
                    $rowNumber = $row->attributes?->getNamedItem('r')?->nodeValue ?: $totalRows;
                    throw new RuntimeException("Workbook row {$rowNumber} exceeds the maximum permitted column count.");
                }
                foreach ($cells ?: [] as $cell) {
                    $reference = $cell->attributes?->getNamedItem('r')?->nodeValue ?: 'cell';
                    $type = $cell->attributes?->getNamedItem('t')?->nodeValue;
                    $formula = $xpath->query('./s:f', $cell)?->item(0)?->textContent;
                    $value = $xpath->query('./s:v', $cell)?->item(0)?->textContent ?? $xpath->query('./s:is', $cell)?->item(0)?->textContent ?? '';
                    if ($type === 's') {
                        $value = $sharedStrings[(int) $value] ?? '';
                    }
                    if ($formula !== null && trim($formula) !== '') {
                        $formulaCells++;
                        $value = '[Formula stored as text: '.$formula.'] Result: '.$value;
                    }
                    $values[] = $reference.': '.$this->normaliseText($value);
                }
                if ($values !== []) {
                    $rowNumber = $row->attributes?->getNamedItem('r')?->nodeValue;
                    $chunks[] = ['section' => 'Sheet '.($sheetIndex + 1).' row '.$rowNumber, 'content' => implode("\n", $values), 'metadata' => ['sheet' => $sheetIndex + 1, 'row' => $rowNumber]];
                }
            }
        }

        return [
            'chunks' => $this->normaliseChunks($chunks),
            'metadata' => ['format' => 'xlsx', 'sheets' => count($entries), 'rows' => $totalRows, 'columns' => $largestColumnCount, 'formula_cells' => $formulaCells],
            'findings' => $formulaCells > 0 ? [[
                'severity' => 'warning', 'code' => 'spreadsheet_formula_present',
                'message' => 'Workbook formulas were not executed; their expressions and cached results require administrator review.',
                'blocks_release' => true,
            ]] : [],
        ];
    }

    private function pdf(string $path): array
    {
        $parser = new PdfParser;
        $text = $parser->parseFile($path)->getText();

        return ['chunks' => $this->normaliseChunks([['section' => 'PDF', 'content' => $text, 'metadata' => []]]), 'metadata' => ['format' => 'pdf'], 'findings' => []];
    }

    private function normaliseChunks(array $chunks): array
    {
        $normalised = [];
        $limit = max(500, (int) config('knowledge.chunk_characters', 3000));
        foreach ($chunks as $chunk) {
            $content = $this->normaliseText((string) ($chunk['content'] ?? ''));
            while ($content !== '') {
                $part = mb_substr($content, 0, $limit);
                $content = trim(mb_substr($content, mb_strlen($part)));
                $normalised[] = ['section' => $chunk['section'] ?? null, 'content' => $part, 'metadata' => $chunk['metadata'] ?? []];
            }
        }

        return $normalised;
    }

    private function xpath(string $xml, string $prefix, string $namespace): DOMXPath
    {
        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument;
        $loaded = $document->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (! $loaded) {
            throw new RuntimeException('The document contains invalid XML.');
        }
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace($prefix, $namespace);

        return $xpath;
    }

    private function archiveEntry(string $path, string $entry, bool $required = true): ?string
    {
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive;
            if ($zip->open($path) !== true) {
                throw new RuntimeException('The Office archive could not be opened.');
            }
            $content = $zip->getFromName($entry);
            $zip->close();
        } else {
            $archive = new PharData($path);
            $content = isset($archive[$entry]) ? $archive[$entry]->getContent() : false;
        }
        if ($content === false && $required) {
            throw new RuntimeException("Required Office document part {$entry} is missing.");
        }

        return $content === false ? null : (string) $content;
    }

    private function archiveNames(string $path): array
    {
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive;
            if ($zip->open($path) !== true) {
                throw new RuntimeException('The Office archive could not be opened.');
            }
            $names = [];
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $names[] = (string) $zip->getNameIndex($index);
            }
            $zip->close();

            return $names;
        }
        $archive = new PharData($path);
        $prefix = 'phar://'.str_replace('\\', '/', $path).'/';
        $names = [];
        foreach (new \RecursiveIteratorIterator($archive) as $file) {
            $name = str_replace('\\', '/', $file->getPathName());
            $names[] = str_starts_with($name, $prefix) ? substr($name, strlen($prefix)) : $name;
        }

        return $names;
    }

    private function detectDelimiter(string $sample): string
    {
        $counts = [];
        foreach ([',', ';', "\t", '|'] as $delimiter) {
            $counts[$delimiter] = substr_count($sample, $delimiter);
        }
        arsort($counts);

        return (string) array_key_first($counts);
    }

    private function normaliseText(string $text): string
    {
        $text = str_replace(["\u{00A0}", "\r"], [' ', ''], $text);
        $text = preg_replace('/[ \t]+/', ' ', $text) ?? $text;
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

        return trim($text);
    }
}
