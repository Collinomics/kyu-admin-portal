<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\ManagedSecretStore;
use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use App\Models\Faculty;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class SystemSettingsController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly ManagedSecretStore $secrets,
    ) {}

    public function runtime(): JsonResponse
    {
        return response()->json(['data' => $this->values()]);
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->adminValues() + [
            'backup_management' => 'provider-managed',
            'backup_portal_connected' => false,
            'catalogue_academic_units' => Faculty::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'closing_soon_days' => ['required', 'integer', 'min:1', 'max:60'],
            'session_timeout_minutes' => ['required', 'integer', 'min:5', 'max:240'],
            'background_refresh_enabled' => ['sometimes', 'boolean'],
            'operational_refresh_seconds' => ['sometimes', 'integer', 'min:3', 'max:300'],
            'admin_refresh_seconds' => ['sometimes', 'integer', 'min:3', 'max:300'],
            'public_catalogue' => ['sometimes', 'array'],
            'public_catalogue.hero_badge' => ['required_with:public_catalogue', 'string', 'max:60'],
            'public_catalogue.hero_title' => ['required_with:public_catalogue', 'string', 'max:90'],
            'public_catalogue.hero_accent' => ['required_with:public_catalogue', 'string', 'max:90'],
            'public_catalogue.hero_description' => ['required_with:public_catalogue', 'string', 'max:240'],
            'public_catalogue.results_per_page' => ['required_with:public_catalogue', 'integer', 'in:6,9,12,18,24'],
            'public_catalogue.show_hero_statistics' => ['required_with:public_catalogue', 'boolean'],
            'public_catalogue.show_card_descriptions' => ['required_with:public_catalogue', 'boolean'],
            'public_catalogue.show_bookmarks' => ['required_with:public_catalogue', 'boolean'],
            'public_catalogue.show_application_links' => ['required_with:public_catalogue', 'boolean'],
            'public_catalogue.application_portal_url' => ['required_with:public_catalogue', 'url', 'starts_with:https://', 'max:255'],
            'public_catalogue.background_refresh_seconds' => ['sometimes', 'integer', 'min:10', 'max:600'],
            'public_catalogue.academic_unit_colours' => ['sometimes', 'array', 'max:100'],
            'public_catalogue.academic_unit_colours.*' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'current_password' => ['required', 'string', 'max:1024'],
        ]);
        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }

        $before = $this->adminValues();
        DB::transaction(function () use ($data, $request) {
            foreach (['closing_soon_days', 'session_timeout_minutes', 'background_refresh_enabled', 'operational_refresh_seconds', 'admin_refresh_seconds'] as $key) {
                if (array_key_exists($key, $data)) {
                    SystemSetting::query()->updateOrCreate(['key' => $key], ['value' => $data[$key], 'updated_by' => $request->user()->id]);
                }
            }
            if (isset($data['public_catalogue'])) {
                $allowedUnits = Faculty::query()->where('is_active', true)->pluck('id')->all();
                $data['public_catalogue']['academic_unit_colours'] = collect($data['public_catalogue']['academic_unit_colours'] ?? [])
                    ->only($allowedUnits)
                    ->map(fn (string $colour) => strtoupper($colour))
                    ->all();
                SystemSetting::query()->updateOrCreate(
                    ['key' => 'public_catalogue_configuration'],
                    ['value' => $data['public_catalogue'], 'updated_by' => $request->user()->id],
                );
            }
        });
        $after = $this->adminValues();
        $this->audit->record($request, 'system.settings_updated', $request->user(), [], SystemSetting::class, null, $before, $after);

        return response()->json(['data' => $after + [
            'backup_management' => 'provider-managed',
            'backup_portal_connected' => false,
            'catalogue_academic_units' => Faculty::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]]);
    }

    public function secretStatuses(): JsonResponse
    {
        return response()->json(['data' => $this->secrets->statuses()]);
    }

    public function replaceSecret(Request $request, string $key): JsonResponse
    {
        $definition = config("managed_secrets.definitions.{$key}");
        if (! is_array($definition)) {
            abort(404);
        }

        $data = $request->validate([
            'value' => [
                'required',
                'string',
                'min:'.(int) ($definition['minimum_length'] ?? 20),
                'max:'.(int) ($definition['maximum_length'] ?? 4096),
            ],
            'change_reason' => ['required', 'string', 'min:8', 'max:500'],
            'current_password' => ['required', 'string', 'max:1024'],
        ]);
        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }

        try {
            $result = $this->secrets->replace($key, $data['value']);
        } catch (RuntimeException $exception) {
            report($exception);

            return response()->json([
                'message' => 'Secure credential storage is unavailable. No credential was changed.',
            ], 503);
        }

        $this->audit->record(
            $request,
            'system.credential_rotated',
            $request->user(),
            [
                'credential_key' => $key,
                'change_reason' => $data['change_reason'],
                'provider' => 'AWS Secrets Manager',
            ],
            'managed_credential',
            $key,
            ['configured' => true],
            ['configured' => true, 'changed_at' => $result['changed_at'] ?? now()->toAtomString()],
        );

        return response()->json([
            'message' => 'Credential replaced securely. The saved value cannot be viewed from the portal.',
            'data' => collect($this->secrets->statuses())->firstWhere('key', $key),
        ]);
    }

    private function values(): array
    {
        return SystemSetting::integers([
            'closing_soon_days' => 7,
            'session_timeout_minutes' => 30,
            'max_failed_login_attempts' => 5,
            'operational_refresh_seconds' => 10,
            'admin_refresh_seconds' => 15,
        ]) + [
            'background_refresh_enabled' => (bool) SystemSetting::decoded('background_refresh_enabled', true),
        ];
    }

    private function adminValues(): array
    {
        return $this->values() + ['public_catalogue' => SystemSetting::publicCatalogue()];
    }
}
