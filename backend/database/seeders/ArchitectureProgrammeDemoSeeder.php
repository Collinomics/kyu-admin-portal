<?php

namespace Database\Seeders;

use App\Models\Programme;
use Illuminate\Database\Seeder;
use RuntimeException;

class ArchitectureProgrammeDemoSeeder extends Seeder
{
    /**
     * Populate one complete catalogue record for local presentation testing.
     * Descriptive copy remains editable and must pass the normal KYU review
     * process before it is treated as approved institutional wording.
     */
    public function run(): void
    {
        $programme = Programme::query()
            ->where('code', 'ARD')
            ->with(['faculty:id,name', 'department:id,name'])
            ->first();

        if (! $programme) {
            throw new RuntimeException('The Bachelor of Architecture programme (ARD) was not found.');
        }

        $content = [
            'overview' => <<<'TEXT'
Bachelor of Architecture is a five-year undergraduate programme offered by the Department of Architecture in the School of Built Environment. It develops knowledge and practical ability in architectural design, built-environment studies, construction technology, visual communication and responsible professional practice.

Students progress from foundational design exploration to increasingly complex projects that respond to people, place, climate, culture and the wider needs of society.
TEXT,
            'objective_impact' => <<<'TEXT'
The programme prepares graduates to contribute thoughtfully to Uganda's built environment through creative, technically informed and socially responsible design.

- Develop architectural ideas from research, analysis and a clear understanding of user needs.
- Communicate design proposals through drawings, models, digital media and professional presentations.
- Integrate environmental, structural and construction considerations into design decisions.
- Promote inclusive, safe and sustainable spaces that respond to local and regional contexts.
TEXT,
            'philosophy_originality' => <<<'TEXT'
Architectural education is approached as a balance of imagination, evidence and making. Studio-based learning encourages students to test ideas, receive critique and refine their work while connecting design decisions to technology, history, environment and community.

Originality is developed through inquiry and experimentation, with emphasis on solutions that are appropriate to their context rather than the imitation of existing forms.
TEXT,
            'career_prospects' => <<<'TEXT'
The programme establishes a foundation for work and further development across architecture and the wider built-environment sector. Professional titles and independent practice remain subject to the registration requirements of the relevant professional bodies.

- Architectural design and documentation teams
- Building and construction project coordination
- Urban design and physical-planning support
- Digital modelling, visualisation and presentation
- Building research, conservation and community-based design
- Postgraduate study, teaching and specialised built-environment practice
TEXT,
            'admission_requirements' => <<<'TEXT'
Direct-entry applicants require two (2) Principal Passes at A'level obtained at the same sitting in Mathematics, Physics, Fine Art or Technical Drawing.

Applicants using diploma, certificate, mature-age or other recognised entry routes should consult the current Kyambogo University admissions notice for the applicable requirements, available places and year of entry.
TEXT,
            'structure_content' => <<<'TEXT'
The programme is organised over five years, with design studio serving as an integrating environment for knowledge developed across the programme.

1. Year One — foundations in design thinking, visual communication, representation and understanding the built environment.
2. Year Two — development of spatial, material and construction awareness through more detailed design problems.
3. Year Three — integration of building technology, environmental response and increasingly complex user requirements.
4. Year Four — advanced design investigation, professional awareness, research and work at broader building or urban scales.
5. Year Five — independent synthesis through major design and research work demonstrating readiness for continued professional development.

The definitive course-unit sequence, credit load and assessment requirements are governed by the approved curriculum and current University regulations.
TEXT,
            'duration' => '5 Years',
            'campus' => 'Kyambogo Main Campus',
            'study_modes' => ['Day'],
            'is_featured' => true,
            'display_priority' => 100,
        ];

        $programme->fill($content)->save();
        $programme->refresh()->load(['faculty:id,name', 'department:id,name']);

        $snapshot = array_merge($programme->published_snapshot ?? [], $content, [
            'source_ref' => $programme->source_ref,
            'code' => $programme->code,
            'name' => $programme->name,
            'category' => $programme->category,
            'faculty_id' => $programme->faculty_id,
            'department_id' => $programme->department_id,
            'faculty_name' => $programme->faculty?->name,
            'department_name' => $programme->department?->name,
            'published_at' => $programme->published_at?->toIso8601String(),
            'version' => $programme->version,
        ]);

        $programme->forceFill(['published_snapshot' => $snapshot])->save();

        $this->command?->info("Updated {$programme->name} ({$programme->code}) for the local catalogue demonstration.");
    }
}
