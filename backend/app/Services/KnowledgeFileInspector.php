<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use PharData;
use RecursiveIteratorIterator;
use Symfony\Component\Process\Process;
use Throwable;
use ZipArchive;

class KnowledgeFileInspector
{
    private const ALLOWED_MIME_TYPES = [
        'pdf' => ['application/pdf', 'application/x-pdf'],
        'csv' => ['text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel'],
        'md' => ['text/plain', 'text/markdown'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
    ];

    private const EXECUTABLE_EXTENSIONS = [
        'bat', 'cmd', 'com', 'dll', 'exe', 'hta', 'htaccess', 'html', 'jar', 'js', 'msi',
        'phtml', 'php', 'phar', 'pl', 'ps1', 'py', 'scr', 'sh', 'svg', 'vbs', 'xhtml',
    ];

    public function inspect(UploadedFile $file, bool $runAntivirus = true): array
    {
        $path = $file->getRealPath();
        $originalName = $file->getClientOriginalName();
        $extension = strtolower($file->getClientOriginalExtension());
        $mimeType = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $findings = [];
        $fatal = false;

        if (! array_key_exists($extension, self::ALLOWED_MIME_TYPES)) {
            $this->finding($findings, 'critical', 'unsupported_file_type', 'Only CSV, XLSX, PDF, DOCX and Markdown files are permitted.', true);
            $fatal = true;
        }

        $segments = array_map('strtolower', explode('.', $originalName));
        array_pop($segments);
        if (array_intersect($segments, self::EXECUTABLE_EXTENSIONS)) {
            $this->finding($findings, 'critical', 'disguised_executable_name', 'The filename contains a prohibited executable extension.', true);
            $fatal = true;
        }

        if (isset(self::ALLOWED_MIME_TYPES[$extension]) && ! in_array($mimeType, self::ALLOWED_MIME_TYPES[$extension], true)) {
            $this->finding($findings, 'critical', 'mime_type_mismatch', "The detected content type {$mimeType} does not match .{$extension}.", true);
            $fatal = true;
        }

        $head = (string) file_get_contents($path, false, null, 0, 16);
        if ($extension === 'pdf' && ! str_starts_with($head, '%PDF-')) {
            $this->finding($findings, 'critical', 'invalid_pdf_signature', 'The file does not have a valid PDF signature.', true);
            $fatal = true;
        }
        if (in_array($extension, ['xlsx', 'docx'], true) && ! str_starts_with($head, 'PK')) {
            $this->finding($findings, 'critical', 'invalid_office_signature', 'The Office document is not a valid OOXML archive.', true);
            $fatal = true;
        }

        if (! $fatal && in_array($extension, ['xlsx', 'docx'], true)) {
            $fatal = $this->inspectOfficeArchive($path, $extension, $findings) || $fatal;
        }
        if (! $fatal && $extension === 'pdf') {
            $fatal = $this->inspectPdf($path, $findings) || $fatal;
        }
        if (! $fatal && in_array($extension, ['csv', 'md'], true)) {
            $fatal = $this->inspectText($path, $extension, $findings) || $fatal;
        }

        $scanStatus = 'not_run';
        if (! $fatal && $runAntivirus) {
            [$scanStatus, $scanFatal] = $this->antivirusScan($path, $findings);
            $fatal = $scanFatal || $fatal;
        } elseif (! $fatal) {
            $scanStatus = 'pending';
        }

        return [
            'extension' => $extension,
            'mime_type' => $mimeType,
            'sha256' => hash_file('sha256', $path),
            'scan_status' => $scanStatus,
            'findings' => $findings,
            'fatal' => $fatal,
        ];
    }

    /** @return array{status: string, fatal: bool, findings: array<int, array<string, mixed>>} */
    public function scan(string $path): array
    {
        $findings = [];
        [$status, $fatal] = $this->antivirusScan($path, $findings);

        return ['status' => $status, 'fatal' => $fatal, 'findings' => $findings];
    }

    private function inspectOfficeArchive(string $path, string $extension, array &$findings): bool
    {
        try {
            $entries = $this->officeArchiveEntries($path);
        } catch (Throwable) {
            $this->finding($findings, 'critical', 'invalid_office_archive', 'The Office document archive is damaged or unreadable.', true);

            return true;
        }

        $fatal = false;
        $totalBytes = 0;
        $requiredPart = $extension === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml';
        $hasRequiredPart = false;
        $maxEntries = max(1, (int) config('knowledge.max_archive_entries', 5000));
        $maxBytes = max(1048576, (int) config('knowledge.max_uncompressed_bytes', 104857600));

        if (count($entries) > $maxEntries) {
            $this->finding($findings, 'critical', 'archive_entry_limit_exceeded', 'The Office document contains too many internal files.', true);
            $fatal = true;
        }

        foreach ($entries as $entry) {
            $name = str_replace('\\', '/', $entry['name']);
            $lower = strtolower($name);
            $totalBytes += max(0, $entry['size']);
            $hasRequiredPart = $hasRequiredPart || $lower === $requiredPart;

            if (str_starts_with($name, '/') || preg_match('#(^|/)\.\.(/|$)#', $name)) {
                $this->finding($findings, 'critical', 'archive_path_traversal', 'The Office archive contains an unsafe internal path.', true, $name);
                $fatal = true;
            }
            if (str_contains($lower, 'vbaproject.bin') || str_ends_with($lower, '.exe') || str_ends_with($lower, '.dll')) {
                $this->finding($findings, 'critical', 'active_content_detected', 'Macros or executable content are prohibited.', true, $name);
                $fatal = true;
            }
            if (str_contains($lower, '/embeddings/') || str_contains($lower, '/oleobject')) {
                $this->finding($findings, 'critical', 'embedded_object_detected', 'Embedded objects are prohibited in knowledge documents.', true, $name);
                $fatal = true;
            }
            if (str_contains($lower, '/externallinks/')) {
                $this->finding($findings, 'warning', 'external_link_detected', 'The workbook contains an external data link that must be reviewed.', true, $name);
            }
        }

        if ($totalBytes > $maxBytes) {
            $this->finding($findings, 'critical', 'archive_expansion_limit_exceeded', 'The expanded Office document exceeds the safe processing limit.', true);
            $fatal = true;
        }
        if (! $hasRequiredPart) {
            $this->finding($findings, 'critical', 'invalid_office_structure', 'The required Office document structure is missing.', true);
            $fatal = true;
        }

        return $fatal;
    }

    private function officeArchiveEntries(string $path): array
    {
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive;
            if ($zip->open($path) !== true) {
                throw new \RuntimeException('Invalid archive.');
            }
            $entries = [];
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $stat = $zip->statIndex($index);
                if (is_array($stat)) {
                    $entries[] = ['name' => (string) ($stat['name'] ?? ''), 'size' => (int) ($stat['size'] ?? 0)];
                }
            }
            $zip->close();

            return $entries;
        }

        $archive = new PharData($path);
        $prefix = 'phar://'.str_replace('\\', '/', $path).'/';
        $entries = [];
        foreach (new RecursiveIteratorIterator($archive) as $file) {
            $name = str_replace('\\', '/', $file->getPathName());
            $entries[] = ['name' => str_starts_with($name, $prefix) ? substr($name, strlen($prefix)) : $name, 'size' => (int) $file->getSize()];
        }

        return $entries;
    }

    private function inspectPdf(string $path, array &$findings): bool
    {
        $contents = (string) file_get_contents($path);
        $fatal = false;
        foreach (['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile'] as $token) {
            if (stripos($contents, $token) !== false) {
                $this->finding($findings, 'critical', 'active_pdf_content', 'Active or embedded PDF content is prohibited.', true, $token);
                $fatal = true;
            }
        }
        if (stripos($contents, '/Encrypt') !== false) {
            $this->finding($findings, 'critical', 'encrypted_pdf', 'Password-protected or encrypted PDFs are not permitted.', true);
            $fatal = true;
        }
        if (! str_contains(substr($contents, -2048), '%%EOF')) {
            $this->finding($findings, 'critical', 'incomplete_pdf', 'The PDF appears incomplete or damaged.', true);
            $fatal = true;
        }

        return $fatal;
    }

    private function inspectText(string $path, string $extension, array &$findings): bool
    {
        $contents = (string) file_get_contents($path);
        if (str_contains($contents, "\0") || ! mb_check_encoding($contents, 'UTF-8')) {
            $this->finding($findings, 'critical', 'invalid_text_encoding', 'Text sources must be valid UTF-8 and cannot contain binary data.', true);

            return true;
        }

        if ($extension === 'csv' && preg_match('/(?:^|[,;\r\n])\s*[=+@]/m', $contents)) {
            $this->finding($findings, 'warning', 'spreadsheet_formula_candidate', 'The CSV contains formula-like cells that require review before release.', true);
        }
        if (preg_match('/\b(ignore|disregard|override)\b.{0,50}\b(previous|system|developer|instruction|prompt)\b|\b(system prompt|developer message)\b/i', $contents)) {
            $this->finding($findings, 'warning', 'prompt_injection_candidate', 'The document contains instruction-like text that may attempt to influence the assistant.', true);
        }

        return false;
    }

    private function antivirusScan(string $path, array &$findings): array
    {
        $binary = trim((string) config('knowledge.antivirus_binary'));
        if ($binary === '') {
            $this->finding($findings, 'error', 'antivirus_unavailable', 'Antivirus scanning is not configured. This version cannot be released.', true);

            return ['unavailable', false];
        }

        try {
            $command = [$binary];
            $database = trim((string) config('knowledge.antivirus_database'));
            if ($database !== '') {
                $command[] = '--database='.$database;
            }
            array_push($command, '--no-summary', '--infected', $path);
            $process = new Process($command);
            $process->setTimeout(max(5, (int) config('knowledge.antivirus_timeout_seconds', 30)));
            $process->run();
            if ($process->getExitCode() === 0) {
                return ['passed', false];
            }
            if ($process->getExitCode() === 1) {
                $this->finding($findings, 'critical', 'malware_detected', 'The upload was rejected because malware was detected.', true);

                return ['infected', true];
            }
        } catch (Throwable) {
            // Report a fail-closed finding below without exposing process details.
        }

        $this->finding($findings, 'error', 'antivirus_failed', 'Antivirus scanning did not complete. This version cannot be released.', true);

        return ['failed', false];
    }

    private function finding(array &$findings, string $severity, string $code, string $message, bool $blocksRelease, ?string $location = null): void
    {
        $findings[] = compact('severity', 'code', 'message', 'location') + ['blocks_release' => $blocksRelease];
    }
}
