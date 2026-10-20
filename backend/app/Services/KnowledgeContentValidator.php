<?php

namespace App\Services;

class KnowledgeContentValidator
{
    public function validate(string $sourceType, array $chunks, array $metadata): array
    {
        $findings = [];
        $content = implode("\n", array_column($chunks, 'content'));

        if (preg_match('/\b(ignore|disregard|override|bypass)\b.{0,80}\b(previous|system|developer|instruction|prompt|safety)\b|\b(system prompt|developer message|jailbreak)\b/i', $content)) {
            $findings[] = $this->finding('error', 'prompt_injection_candidate', 'Instruction-like content may attempt to influence the assistant and requires explicit review.', true);
        }

        if ($sourceType === 'cutoff-points') {
            $required = ['programme_code', 'academic_year', 'intake', 'entry_scheme', 'cutoff'];
            $headings = array_map(fn ($heading) => strtolower(trim(preg_replace('/[^a-z0-9]+/i', '_', (string) $heading), '_')), $metadata['headings'] ?? []);
            if (($metadata['format'] ?? null) !== 'csv') {
                $findings[] = $this->finding('error', 'structured_cutoff_file_required', 'Cut-off points must be uploaded as a CSV using the approved column template.', true);
            } else {
                $missing = array_values(array_diff($required, $headings));
                if ($missing !== []) {
                    $findings[] = $this->finding('error', 'missing_cutoff_columns', 'Required cut-off columns are missing: '.implode(', ', $missing).'.', true, ['missing' => $missing]);
                }
            }
        }

        if ($sourceType === 'calculation-rules') {
            $requirements = [
                'required inputs' => '/\b(required inputs?|input fields?)\b/i',
                'formula or steps' => '/\b(formula|calculation steps?|algorithm)\b/i',
                'rounding rule' => '/\b(rounding|round up|round down|decimal places?)\b/i',
                'missing-data rule' => '/\b(missing (data|value|input)|incomplete input)\b/i',
                'worked example' => '/\b(worked example|example calculation)\b/i',
            ];
            $missing = [];
            foreach ($requirements as $label => $pattern) {
                if (! preg_match($pattern, $content)) {
                    $missing[] = $label;
                }
            }
            if ($missing !== []) {
                $findings[] = $this->finding('error', 'incomplete_calculation_guidance', 'Calculation guidance is incomplete. Add: '.implode(', ', $missing).'.', true, ['missing' => $missing]);
            }
            $findings[] = $this->finding('warning', 'deterministic_implementation_required', 'Release does not execute formulas automatically; an administrator must approve a deterministic backend implementation.', true);
        }

        return $findings;
    }

    private function finding(string $severity, string $code, string $message, bool $blocksRelease, array $details = []): array
    {
        return compact('severity', 'code', 'message', 'details') + ['blocks_release' => $blocksRelease];
    }
}
