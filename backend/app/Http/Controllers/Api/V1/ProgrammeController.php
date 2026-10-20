<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\ProgrammeReview;
use App\Models\ProgrammeVersion;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProgrammeController extends Controller
{
    private const STATUSES = ['draft', 'submitted', 'hod-reviewed', 'published', 'rejected'];

    private const CATEGORIES = ['Diploma', 'Undergraduate', 'Postgraduate', 'Vocational'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $perPage = max(5, min(100, (int) $request->query('per_page', 12)));
        $baseQuery = $this->visibleQuery($request->user());
        $statusCounts = (clone $baseQuery)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $query = $baseQuery->with(['faculty:id,name', 'department:id,name', 'coordinator:id,title,first_name,last_name', 'reviews.actor:id,title,first_name,last_name']);
        if ($search = trim((string) $request->query('search'))) {
            $needle = '%'.Str::lower($search).'%';
            $query->where(fn (Builder $builder) => $builder->whereRaw('LOWER(name) LIKE ?', [$needle])->orWhereRaw('LOWER(code) LIKE ?', [$needle]));
        }
        if (in_array($request->query('status'), self::STATUSES, true)) {
            $query->where('status', $request->query('status'));
        }
        $page = $query->orderBy('name')->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (Programme $programme) => $this->payload($programme)),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'total' => $page->total(),
                'status_counts' => $statusCounts,
            ],
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        $actor = $request->user();
        $faculties = Faculty::query()
            ->where('is_active', true)
            ->with(['departments' => fn ($query) => $query->where('is_active', true)->orderBy('name')]);

        if ($actor->role !== UserRole::SYSADMIN) {
            $assignments = $actor->assignments()->effective()->get();
            $facultyIds = match ($actor->role) {
                UserRole::COORDINATOR => Programme::query()
                    ->whereIn('id', $assignments->pluck('programme_id')->filter())
                    ->pluck('faculty_id')->filter(),
                UserRole::HOD, UserRole::DEAN => $assignments->pluck('faculty_id')->filter(),
                default => collect(),
            };
            $faculties->whereIn('id', $facultyIds);
        }

        return response()->json(['data' => [
            'faculties' => $faculties->orderBy('name')->get(),
            'programmes' => [],
            'calls' => [],
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === UserRole::SYSADMIN, 403);
        $data = $this->validatedProfile($request);
        $intent = $this->intent($request);
        $this->ensureUniqueCode($data['code']);

        $programme = DB::transaction(function () use ($request, $data, $intent) {
            $programme = Programme::create($data + [
                'status' => $this->statusForIntent($request->user(), $intent),
                'version' => 1,
                'coordinator_id' => $request->user()->role === UserRole::COORDINATOR ? $request->user()->id : null,
                'created_by' => $request->user()->id,
                'published_at' => $intent === 'publish' ? now() : null,
            ]);
            if ($programme->status === 'published') {
                $this->capturePublishedSnapshot($programme);
            }
            $this->snapshot($programme, $request->user());
            $this->review($programme, $request->user(), $programme->status);
            if ($programme->status === 'published') {
                $this->queuePublication($programme);
            }

            return $programme;
        });
        $this->audit->record($request, 'programme.created', $request->user(), ['status' => $programme->status], Programme::class, $programme->id);

        return response()->json(['data' => $this->payload($programme->load(['faculty', 'department', 'coordinator']))], 201);
    }

    public function update(Request $request, Programme $programme): JsonResponse
    {
        $expectedVersion = (int) $request->validate(['expected_version' => ['required', 'integer', 'min:1']])['expected_version'];
        $data = $this->validatedProfile($request);
        $intent = $this->intent($request);
        $this->ensureUniqueCode($data['code'], $programme->id);
        $before = [];

        DB::transaction(function () use ($request, &$programme, $data, $intent, $expectedVersion, &$before) {
            $programme = Programme::query()->lockForUpdate()->findOrFail($programme->id);
            $this->authorizeEdit($request->user(), $programme);
            if ($request->user()->role === UserRole::COORDINATOR
                && (($data['faculty_id'] ?? null) !== $programme->faculty_id
                    || ($data['department_id'] ?? null) !== $programme->department_id)) {
                throw ValidationException::withMessages([
                    'faculty_id' => ['A Programme Coordinator cannot move an assigned programme to another academic unit. Ask the System Administrator to change its organisation assignment.'],
                ]);
            }
            abort_if($programme->version !== $expectedVersion, 409, 'This programme was changed by another user. Close the editor, review the latest version and try again.');
            if ($programme->status === 'published' && ! $programme->published_snapshot) {
                $this->capturePublishedSnapshot($programme);
                $programme->refresh();
            }
            $before = $this->snapshotData($programme);
            $programme->fill($data);
            $programme->version++;
            $programme->status = $this->statusForIntent($request->user(), $intent);
            $programme->rejection_comment = null;
            if ($programme->status === 'published') {
                $programme->published_at = now();
            }
            $programme->save();
            if ($programme->status === 'published') {
                $this->capturePublishedSnapshot($programme);
            }
            $this->snapshot($programme, $request->user());
            $this->review($programme, $request->user(), $programme->status);
            if ($programme->status === 'published') {
                $this->queuePublication($programme);
            }
        });
        $this->audit->record($request, 'programme.updated', $request->user(), ['version' => $programme->version], Programme::class, $programme->id, $before, $this->snapshotData($programme));

        return response()->json(['data' => $this->payload($programme->load(['faculty', 'department', 'coordinator', 'reviews.actor']))]);
    }

    public function action(Request $request, Programme $programme): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['submit', 'forward', 'publish', 'unpublish', 'reject', 'recommend'])],
            'comment' => ['nullable', 'string', 'max:4000', Rule::requiredIf(in_array($request->input('action'), ['unpublish', 'reject', 'recommend'], true))],
            'expected_version' => ['required', 'integer', 'min:1'],
            'expected_status' => ['required', Rule::in(self::STATUSES)],
        ]);
        $before = [];
        DB::transaction(function () use ($request, &$programme, $data, &$before) {
            $programme = Programme::query()->lockForUpdate()->findOrFail($programme->id);
            abort_if($programme->version !== (int) $data['expected_version'] || $programme->status !== $data['expected_status'], 409, 'This programme was changed by another user. Refresh the programme before taking a review action.');
            $this->authorizeAction($request->user(), $programme, $data['action']);
            if ($data['action'] === 'submit') {
                $this->ensureCompleteForReview($programme);
            }
            if ($data['action'] === 'unpublish' && $programme->applicationCalls()->where('status', 'open')->exists()) {
                throw ValidationException::withMessages(['programme' => ['Close every open or scheduled application call for this programme before unpublishing it.']]);
            }
            $status = match ($data['action']) {
                'submit' => 'submitted',
                'forward' => 'hod-reviewed',
                'publish' => 'published',
                'unpublish' => 'hod-reviewed',
                'reject' => 'rejected',
                'recommend' => $programme->status,
            };
            $before = ['status' => $programme->status];
            if ($data['action'] !== 'recommend') {
                $programme->status = $status;
                $programme->rejection_comment = $data['action'] === 'reject' ? ($data['comment'] ?? null) : null;
                if ($status === 'published') {
                    $programme->published_at = now();
                }
                if ($data['action'] === 'unpublish') {
                    $programme->published_at = null;
                    $programme->published_snapshot = null;
                }
                $programme->save();
                if ($status === 'published') {
                    $this->capturePublishedSnapshot($programme);
                }
            }
            $this->review($programme, $request->user(), $data['action'], $data['comment'] ?? null);
            if ($status === 'published') {
                $this->queuePublication($programme);
            } elseif ($data['action'] === 'unpublish') {
                $this->queueUnpublication($programme);
            }
        });
        $this->audit->record($request, 'programme.'.$data['action'], $request->user(), [], Programme::class, $programme->id, $before, ['status' => $programme->status]);

        return response()->json(['data' => $this->payload($programme->load(['faculty', 'department', 'coordinator', 'reviews.actor']))]);
    }

    public function destroy(Request $request, Programme $programme): JsonResponse
    {
        abort_unless($request->user()->role === UserRole::SYSADMIN, 403);
        $request->validate(['current_password' => ['required', 'string', 'max:1024']]);
        if (! Hash::check($request->string('current_password')->toString(), $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }
        if (! in_array($programme->status, ['draft', 'rejected'], true)) {
            throw ValidationException::withMessages(['programme' => ['Only draft or rejected programmes can be permanently deleted.']]);
        }
        $snapshot = $this->snapshotData($programme);
        $id = $programme->id;
        $programme->delete();
        $this->audit->record($request, 'programme.deleted', $request->user(), [], Programme::class, $id, $snapshot);

        return response()->json([], 204);
    }

    private function visibleQuery(User $user): Builder
    {
        $query = Programme::query();
        if ($user->role === UserRole::SYSADMIN) {
            return $query;
        }
        $assignments = $user->assignments()->effective()->get();

        return match ($user->role) {
            UserRole::COORDINATOR => $query->whereIn('id', $assignments->pluck('programme_id')->filter()),
            UserRole::HOD => $query->whereIn('faculty_id', $assignments->pluck('faculty_id')->filter()),
            UserRole::DEAN => $query->whereIn('faculty_id', $assignments->pluck('faculty_id')->filter()),
            default => $query->whereRaw('1 = 0'),
        };
    }

    private function authorizeEdit(User $user, Programme $programme): void
    {
        if ($user->role === UserRole::SYSADMIN) {
            return;
        }
        abort_unless($user->role === UserRole::COORDINATOR && $this->visibleQuery($user)->whereKey($programme->id)->exists() && in_array($programme->status, ['draft', 'rejected', 'published'], true), 403);
    }

    private function authorizeAction(User $user, Programme $programme, string $action): void
    {
        $validState = match ($action) {
            'submit' => in_array($programme->status, ['draft', 'rejected'], true),
            'forward' => $programme->status === 'submitted',
            'publish', 'recommend' => $programme->status === 'hod-reviewed',
            'unpublish' => $programme->status === 'published',
            'reject' => in_array($programme->status, ['submitted', 'hod-reviewed'], true),
            default => false,
        };
        abort_unless($validState, 403, 'That review action is not available at the programme’s current stage.');

        if ($user->role === UserRole::SYSADMIN) {
            return;
        }
        $allowed = match ($action) {
            'submit' => $user->role === UserRole::COORDINATOR && $this->visibleQuery($user)->whereKey($programme->id)->exists() && in_array($programme->status, ['draft', 'rejected'], true),
            'forward' => $user->role === UserRole::HOD && $this->visibleQuery($user)->whereKey($programme->id)->exists() && $programme->status === 'submitted',
            'publish' => $user->role === UserRole::DEAN && $this->visibleQuery($user)->whereKey($programme->id)->exists() && $programme->status === 'hod-reviewed',
            'unpublish' => $user->role === UserRole::DEAN && $this->visibleQuery($user)->whereKey($programme->id)->exists() && $programme->status === 'published',
            'reject' => (($user->role === UserRole::HOD && $programme->status === 'submitted')
                    || ($user->role === UserRole::DEAN && $programme->status === 'hod-reviewed'))
                && $this->visibleQuery($user)->whereKey($programme->id)->exists(),
            'recommend' => $user->role === UserRole::DEAN && $programme->status === 'hod-reviewed'
                && $this->visibleQuery($user)->whereKey($programme->id)->exists(),
            default => false,
        };
        abort_unless($allowed, 403);
    }

    private function validatedProfile(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:40'],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'faculty_id' => ['nullable', 'uuid', 'exists:faculties,id'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'overview' => ['nullable', 'string'],
            'objective_impact' => ['nullable', 'string'],
            'philosophy_originality' => ['nullable', 'string'],
            'career_prospects' => ['nullable', 'string'],
            'admission_requirements' => ['nullable', 'string'],
            'structure_content' => ['nullable', 'string'],
            'duration' => ['nullable', 'string', 'max:60'],
            'campus' => ['nullable', 'string', 'max:120'],
            'study_modes' => ['nullable', 'array', 'max:5'],
            'study_modes.*' => ['string', Rule::in(['Day', 'Evening', 'Weekend', 'Distance', 'Online'])],
            'is_featured' => ['sometimes', 'boolean'],
            'display_priority' => ['sometimes', 'integer', 'min:0', 'max:1000'],
            'intent' => ['required', Rule::in(['draft', 'submit', 'publish'])],
        ]);
        $data['code'] = Str::upper(trim($data['code']));
        $data['name'] = trim($data['name']);
        $data['duration'] = ($duration = trim((string) ($data['duration'] ?? ''))) !== '' ? $duration : null;
        $data['campus'] = ($campus = trim((string) ($data['campus'] ?? ''))) !== '' ? $campus : null;
        $data['study_modes'] = array_values(array_unique($data['study_modes'] ?? []));
        if ($request->user()->role !== UserRole::SYSADMIN) {
            unset($data['is_featured'], $data['display_priority']);
        }
        if (($data['intent'] ?? 'draft') !== 'draft') {
            if (empty($data['faculty_id'])) {
                throw ValidationException::withMessages(['faculty_id' => ['A faculty or school is required before review or publication.']]);
            }
            foreach (['overview', 'objective_impact', 'philosophy_originality', 'career_prospects', 'admission_requirements', 'structure_content'] as $field) {
                if (trim((string) ($data[$field] ?? '')) === '') {
                    throw ValidationException::withMessages([$field => ['Every programme section is required before review or publication.']]);
                }
            }
        }
        if (! empty($data['faculty_id']) && ! Faculty::whereKey($data['faculty_id'])->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['faculty_id' => ['The selected faculty or school is inactive or unavailable.']]);
        }
        if (! empty($data['department_id']) && ! Department::whereKey($data['department_id'])->where('faculty_id', $data['faculty_id'] ?? '')->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['department_id' => ['The department must be active and belong to the selected faculty.']]);
        }

        return $data;
    }

    private function ensureCompleteForReview(Programme $programme): void
    {
        if (empty($programme->faculty_id)) {
            throw ValidationException::withMessages(['faculty_id' => ['A faculty or school is required before review or publication.']]);
        }
        foreach (['overview', 'objective_impact', 'philosophy_originality', 'career_prospects', 'admission_requirements', 'structure_content'] as $field) {
            if (trim((string) $programme->{$field}) === '') {
                throw ValidationException::withMessages([$field => ['Every programme section is required before review or publication.']]);
            }
        }
    }

    private function intent(Request $request): string
    {
        return $request->string('intent')->toString();
    }

    private function statusForIntent(User $user, string $intent): string
    {
        if ($intent === 'publish') {
            abort_unless($user->role === UserRole::SYSADMIN, 403);

            return 'published';
        }
        if ($intent === 'submit') {
            return 'submitted';
        }

        return 'draft';
    }

    private function ensureUniqueCode(string $code, ?string $exceptId = null): void
    {
        $query = Programme::whereRaw('LOWER(code) = ?', [Str::lower(trim($code))]);
        if ($exceptId) {
            $query->whereKeyNot($exceptId);
        }
        if ($query->exists()) {
            throw ValidationException::withMessages(['code' => ['That programme code is already in use.']]);
        }
    }

    private function snapshot(Programme $programme, User $actor): void
    {
        ProgrammeVersion::create(['programme_id' => $programme->id, 'version' => $programme->version, 'snapshot' => $this->snapshotData($programme), 'created_by' => $actor->id, 'created_at' => now()]);
    }

    private function review(Programme $programme, User $actor, string $action, ?string $comment = null): void
    {
        ProgrammeReview::create(['programme_id' => $programme->id, 'programme_version' => $programme->version, 'action' => $action, 'actor_id' => $actor->id, 'comment' => $comment, 'created_at' => now()]);
    }

    private function queuePublication(Programme $programme): void
    {
        DB::table('integration_outbox')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'event_type' => 'programme.published', 'aggregate_id' => $programme->id,
            'aggregate_version' => $programme->version, 'payload' => json_encode($this->snapshotData($programme), JSON_THROW_ON_ERROR),
            'attempts' => 0, 'available_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function queueUnpublication(Programme $programme): void
    {
        DB::table('integration_outbox')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'event_type' => 'programme.unpublished', 'aggregate_id' => $programme->id,
            'aggregate_version' => $programme->version, 'payload' => json_encode(['id' => $programme->id], JSON_THROW_ON_ERROR),
            'attempts' => 0, 'available_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function capturePublishedSnapshot(Programme $programme): void
    {
        $programme->loadMissing(['faculty:id,name', 'department:id,name']);
        $programme->forceFill(['published_snapshot' => $programme->only([
            'source_ref', 'code', 'name', 'category', 'faculty_id', 'department_id',
            'overview', 'objective_impact', 'philosophy_originality', 'career_prospects',
            'admission_requirements', 'structure_content', 'duration', 'campus', 'study_modes',
            'is_featured', 'display_priority',
        ]) + [
            'faculty_name' => $programme->faculty?->name,
            'department_name' => $programme->department?->name,
            'published_at' => $programme->published_at?->toIso8601String(),
            'version' => $programme->version,
            'live_version' => $programme->published_snapshot['version'] ?? ($programme->status === 'published' ? $programme->version : null),
        ]])->save();
    }

    private function snapshotData(Programme $programme): array
    {
        return $programme->only(['source_ref', 'code', 'name', 'category', 'faculty_id', 'department_id', 'coordinator_id', 'status', 'overview', 'objective_impact', 'philosophy_originality', 'career_prospects', 'admission_requirements', 'structure_content', 'duration', 'campus', 'study_modes', 'is_featured', 'display_priority']);
    }

    private function payload(Programme $programme): array
    {
        return [
            'id' => $programme->id, 'name' => $programme->name, 'code' => $programme->code, 'category' => $programme->category,
            'faculty_id' => $programme->faculty_id, 'faculty' => $programme->faculty?->name ?? 'Not assigned',
            'department_id' => $programme->department_id, 'department' => $programme->department?->name ?? 'Not assigned',
            'status' => $programme->status, 'coordinator' => $programme->coordinator?->name ?? 'Not assigned',
            'updated_at' => $programme->updated_at?->toDateString(), 'rejection_comment' => $programme->rejection_comment,
            'overview' => $programme->overview ?? '', 'objective_impact' => $programme->objective_impact ?? '',
            'philosophy_originality' => $programme->philosophy_originality ?? '', 'career_prospects' => $programme->career_prospects ?? '',
            'admission_requirements' => $programme->admission_requirements ?? '', 'structure_content' => $programme->structure_content ?? '',
            'duration' => $programme->duration ?? '', 'campus' => $programme->campus ?? '',
            'study_modes' => $programme->study_modes ?? [], 'is_featured' => (bool) $programme->is_featured,
            'display_priority' => (int) $programme->display_priority,
            'version' => $programme->version,
            'live_version' => $programme->published_snapshot['version'] ?? null,
            'reviews' => $programme->relationLoaded('reviews') ? $programme->reviews->sortBy('created_at')->values()->map(fn (ProgrammeReview $review) => [
                'id' => $review->id,
                'version' => $review->programme_version,
                'action' => $review->action,
                'comment' => $review->comment,
                'actor' => $review->actor?->name ?? 'System',
                'created_at' => $review->created_at?->toIso8601String(),
            ])->all() : [],
        ];
    }
}
