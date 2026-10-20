<?php

namespace Tests\Unit;

use App\Services\KnowledgeSourceExtractor;
use Phar;
use PharData;
use RuntimeException;
use Tests\TestCase;

class KnowledgeSourceExtractorTest extends TestCase
{
    public function test_docx_is_read_without_executing_embedded_content(): void
    {
        $result = app(KnowledgeSourceExtractor::class)->extract(
            base_path('../support/Kyambogo_PCS_SystemDesign_Illustrated.docx'),
            'docx'
        );

        $this->assertSame('docx', $result['metadata']['format']);
        $this->assertGreaterThan(0, $result['metadata']['chunk_count']);
        $this->assertStringContainsStringIgnoringCase('Kyambogo', implode(' ', array_column($result['chunks'], 'content')));
    }

    public function test_pdf_text_is_extracted_by_the_vetted_parser(): void
    {
        $result = app(KnowledgeSourceExtractor::class)->extract(
            base_path('vendor/smalot/pdfparser/samples/SimpleInvoiceFilledExample1.pdf'),
            'pdf'
        );

        $this->assertSame('pdf', $result['metadata']['format']);
        $this->assertGreaterThan(0, $result['metadata']['character_count']);
        $this->assertNotEmpty($result['chunks']);
    }

    public function test_xlsx_rows_are_extracted_without_executing_formulas(): void
    {
        $path = $this->workbookFixture();

        try {
            $result = app(KnowledgeSourceExtractor::class)->extract($path, 'xlsx');
        } finally {
            @unlink($path);
        }

        $content = implode("\n", array_column($result['chunks'], 'content'));
        $this->assertSame('xlsx', $result['metadata']['format']);
        $this->assertSame(1, $result['metadata']['sheets']);
        $this->assertSame(2, $result['metadata']['rows']);
        $this->assertSame(3, $result['metadata']['columns']);
        $this->assertSame(1, $result['metadata']['formula_cells']);
        $this->assertStringContainsString('Bachelor of Architecture', $content);
        $this->assertStringContainsString('[Formula stored as text: B2*2] Result: 10', $content);
        $this->assertSame('spreadsheet_formula_present', $result['findings'][0]['code']);
        $this->assertTrue($result['findings'][0]['blocks_release']);
    }

    public function test_xlsx_column_limit_is_enforced(): void
    {
        config(['knowledge.max_csv_columns' => 2]);
        $path = $this->workbookFixture();

        try {
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('maximum permitted column count');
            app(KnowledgeSourceExtractor::class)->extract($path, 'xlsx');
        } finally {
            @unlink($path);
        }
    }

    private function workbookFixture(): string
    {
        $path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'pcs-xlsx-'.bin2hex(random_bytes(6)).'.xlsx';
        $archive = new PharData($path, 0, null, Phar::ZIP);
        $archive->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>');
        $archive->addFromString('xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Programme</t></si><si><t>Duration</t></si><si><t>Calculated</t></si><si><t>Bachelor of Architecture</t></si></sst>');
        $archive->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>5</v></c><c r="C2"><f>B2*2</f><v>10</v></c></row></sheetData></worksheet>');
        unset($archive);

        return $path;
    }
}
