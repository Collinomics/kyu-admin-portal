<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApplicationCall;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\SystemSetting;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class PublicCatalogueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $configuration = SystemSetting::publicCatalogue();
        $configuration['background_refresh_enabled'] = (bool) SystemSetting::decoded('background_refresh_enabled', true);
        $perPage = max(6, min(24, (int) $request->query('per_page', $configuration['results_per_page'])));
        $query = Programme::query()->publiclyAvailable()->with([
            'faculty:id,name',
            'department:id,name',
            'applicationCalls' => fn ($builder) => $builder
                ->where('status', 'open')
                ->whereDate('deadline', '>=', today())
                ->orderBy('opening_date'),
        ]);

        if ($search = trim((string) $request->query('search'))) {
            $needle = '%'.Str::lower($search).'%';
            $query->where(fn (Builder $builder) => $builder
                ->whereRaw('LOWER('.$this->publicField('name').') LIKE ?', [$needle])
                ->orWhereRaw('LOWER('.$this->publicField('code').') LIKE ?', [$needle])
                ->orWhereRaw('LOWER('.$this->publicField('faculty_name').') LIKE ?', [$needle]));
        }
        if ($category = trim((string) $request->query('category'))) {
            $query->whereRaw('LOWER('.$this->publicField('category').') = ?', [Str::lower($category)]);
        }
        if ($facultyId = trim((string) $request->query('faculty_id'))) {
            $query->whereRaw($this->publicField('faculty_id').' = ?', [$facultyId]);
        }

        $today = today()->toDateString();
        $page = $query
            ->orderByRaw("CASE
                WHEN EXISTS (SELECT 1 FROM application_calls WHERE application_calls.programme_id = programmes.id AND application_calls.status = 'open' AND DATE(application_calls.opening_date) <= ? AND DATE(application_calls.deadline) >= ?) THEN 0
                WHEN EXISTS (SELECT 1 FROM application_calls WHERE application_calls.programme_id = programmes.id AND application_calls.status = 'open' AND DATE(application_calls.opening_date) > ? AND DATE(application_calls.deadline) >= ?) THEN 1
                ELSE 2 END", [$today, $today, $today, $today])
            ->orderByRaw($this->publicFeaturedOrder().' DESC')
            ->orderByRaw($this->publicPriorityOrder().' DESC')
            ->orderByRaw($this->publicField('name'))
            ->paginate($perPage);
        $closingSoonDays = SystemSetting::integer('closing_soon_days', 7);

        return response()->json([
            'data' => collect($page->items())->map(fn (Programme $programme) => $this->payload($programme, $closingSoonDays)),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'revision' => $this->catalogueRevision(),
            ],
            'summary' => [
                'published_programmes' => Programme::publiclyAvailable()->count(),
                'academic_units' => Programme::publiclyAvailable()->get()->map(fn (Programme $programme) => $programme->publishedValue('faculty_id'))->filter()->unique()->count(),
                'calls_closing_soon' => ApplicationCall::where('status', 'open')->whereDate('opening_date', '<=', today())->whereDate('deadline', '>=', today())->whereDate('deadline', '<=', today()->addDays($closingSoonDays))->count(),
            ],
            'filters' => [
                'faculties' => Faculty::where('is_active', true)->whereHas('programmes', fn (Builder $builder) => $builder->publiclyAvailable())->orderBy('name')->get(['id', 'name']),
                'categories' => Programme::publiclyAvailable()->get()->map(fn (Programme $programme) => $programme->publishedValue('category'))->filter()->unique()->sort()->values(),
            ],
            'configuration' => $configuration,
        ]);
    }

    public function revision(): JsonResponse
    {
        return response()->json(['data' => ['revision' => $this->catalogueRevision()]]);
    }

    public function show(Programme $programme): JsonResponse
    {
        abort_unless($programme->status === 'published' || $programme->published_snapshot, 404);
        $programme->load([
            'faculty:id,name',
            'department:id,name',
            'applicationCalls' => fn ($builder) => $builder
                ->where('status', 'open')
                ->whereDate('deadline', '>=', today())
                ->orderBy('opening_date'),
        ]);

        return response()->json(['data' => $this->payload($programme, SystemSetting::integer('closing_soon_days', 7))]);
    }

    private function payload(Programme $programme, int $closingSoonDays): array
    {
        $call = $programme->applicationCalls
            ->filter(fn (ApplicationCall $candidate) => $candidate->opening_date->lte(today()))
            ->sortBy('deadline')
            ->first()
            ?? $programme->applicationCalls
                ->filter(fn (ApplicationCall $candidate) => $candidate->opening_date->isFuture())
                ->sortBy('opening_date')
                ->first();
        $effectiveStatus = 'closed';
        if ($call && $call->deadline->gte(today())) {
            $effectiveStatus = $call->opening_date->isFuture()
                ? 'scheduled'
                : ($call->deadline->lte(today()->addDays($closingSoonDays)) ? 'closing-soon' : 'open');
        }

        return [
            'id' => $programme->id,
            'code' => $programme->publishedValue('code'),
            'name' => $programme->publishedValue('name'),
            'category' => $programme->publishedValue('category'),
            'faculty' => $programme->publishedValue('faculty_name') ?? $programme->faculty?->name,
            'faculty_id' => $programme->publishedValue('faculty_id') ?? $programme->faculty_id,
            'department' => $programme->publishedValue('department_name') ?? $programme->department?->name,
            'overview' => $programme->publishedValue('overview') ?? '',
            'objective_impact' => $programme->publishedValue('objective_impact') ?? '',
            'philosophy_originality' => $programme->publishedValue('philosophy_originality') ?? '',
            'career_prospects' => $programme->publishedValue('career_prospects') ?? '',
            'admission_requirements' => $programme->publishedValue('admission_requirements') ?? '',
            'structure_content' => $programme->publishedValue('structure_content') ?? '',
            'duration' => $programme->publishedValue('duration') ?? '',
            'campus' => $programme->publishedValue('campus') ?? '',
            'study_modes' => $programme->publishedValue('study_modes') ?? [],
            'is_featured' => (bool) ($programme->publishedValue('is_featured') ?? false),
            'display_priority' => (int) ($programme->publishedValue('display_priority') ?? 0),
            'published_at' => $programme->publishedValue('published_at') ?? $programme->published_at?->toIso8601String(),
            'application' => $call ? [
                'id' => $call->id,
                'intake' => $call->intake,
                'opening_date' => $call->opening_date->toDateString(),
                'deadline' => $call->deadline->toDateString(),
                'requirements' => $call->requirements ?? '',
                'status' => $effectiveStatus,
            ] : null,
        ];
    }

    private function publicField(string $key): string
    {
        $driver = DB::connection()->getDriverName();
        $fallback = match ($key) {
            'faculty_name' => '(select name from faculties where faculties.id = programmes.faculty_id)',
            // Snapshot values extracted with ->> are text. PostgreSQL requires
            // every COALESCE argument to share a compatible type.
            'faculty_id' => $driver === 'pgsql' ? 'CAST(faculty_id AS TEXT)' : 'faculty_id',
            default => $key,
        };

        return $driver === 'pgsql'
            ? "COALESCE(published_snapshot->>'{$key}', {$fallback})"
            : "COALESCE(json_extract(published_snapshot, '$.{$key}'), {$fallback})";
    }

    private function catalogueRevision(): string
    {
        return Cache::remember('public-catalogue-revision', 5, function (): string {
            $parts = [
                Programme::publiclyAvailable()->max('updated_at'),
                ApplicationCall::max('updated_at'),
                Faculty::max('updated_at'),
                SystemSetting::whereIn('key', ['public_catalogue_configuration', 'closing_soon_days', 'background_refresh_enabled'])->max('updated_at'),
                today()->toDateString(),
            ];

            return hash('sha256', implode('|', array_map(fn ($value) => (string) $value, $parts)));
        });
    }

    private function publicFeaturedOrder(): string
    {
        return DB::connection()->getDriverName() === 'pgsql'
            ? "CASE WHEN LOWER(COALESCE(published_snapshot->>'is_featured', CASE WHEN is_featured THEN 'true' ELSE 'false' END)) IN ('true', '1') THEN 1 ELSE 0 END"
            : "CASE WHEN COALESCE(json_extract(published_snapshot, '$.is_featured'), is_featured, 0) IN (1, 'true') THEN 1 ELSE 0 END";
    }

    private function publicPriorityOrder(): string
    {
        return DB::connection()->getDriverName() === 'pgsql'
            ? "CAST(COALESCE(published_snapshot->>'display_priority', CAST(display_priority AS TEXT), '0') AS INTEGER)"
            : "CAST(COALESCE(json_extract(published_snapshot, '$.display_priority'), display_priority, 0) AS INTEGER)";
    }
}
