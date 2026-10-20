<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\ApplicationCall;
use App\Models\Programme;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\UserAssignment;
use App\Services\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ApplicationCallController extends Controller
{
    private ?int $closingSoonDays = null;

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $this->closeExpiredCalls($request);
        $perPage = max(5, min(100, (int) $request->query('per_page', 10)));
        $base = $this->visibleQuery($request->user());
        $counts = (clone $base)->selectRaw('status, count(*) AS total')->groupBy('status')->pluck('total', 'status');
        if ($search = trim((string) $request->query('search'))) {
            $needle = '%'.Str::lower($search).'%';
            $base->where(fn (Builder $query) => $query
                ->whereRaw('LOWER(intake) LIKE ?', [$needle])
                ->orWhereHas('programme', fn (Builder $programme) => $programme
                    ->whereRaw('LOWER(name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(code) LIKE ?', [$needle])));
        }
        $effectiveStatus = (string) $request->query('status', 'all');
        $closingSoonDays = SystemSetting::integer('closing_soon_days', 7);
        match ($effectiveStatus) {
            'draft' => $base->where('status', 'draft'),
            'scheduled' => $base->where('status', 'open')->whereDate('opening_date', '>', today()),
            'open' => $base->where('status', 'open')->whereDate('opening_date', '<=', today())->whereDate('deadline', '>', today()->addDays($closingSoonDays)),
            'closing-soon' => $base->where('status', 'open')->whereDate('opening_date', '<=', today())->whereDate('deadline', '>=', today())->whereDate('deadline', '<=', today()->addDays($closingSoonDays)),
            'closed' => $base->where('status', 'closed'),
            default => null,
        };
        $page = $base->with(['programme:id,name,code', 'creator:id,title,first_name,last_name', 'assignments.user:id,title,first_name,last_name'])
            ->orderByRaw("CASE
                WHEN status = 'open' AND DATE(opening_date) <= ? AND DATE(deadline) >= ? THEN 0
                WHEN status = 'open' AND DATE(opening_date) > ? THEN 1
                WHEN status = 'draft' THEN 2
                ELSE 3 END", [today()->toDateString(), today()->toDateString(), today()->toDateString()])
            ->orderBy('deadline')
            ->latest('opening_date')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (ApplicationCall $call) => $this->payload($call, $request->user())),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'total' => $page->total(), 'status_counts' => $counts,
            ],
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, [UserRole::SYSADMIN, UserRole::REGISTRAR, UserRole::ADMISSIONS_OFFICER], true), 403);
        $assignments = $request->user()->assignments()->effective()->get();
        $createProgrammeIds = $assignments
            ->filter(fn (UserAssignment $assignment): bool => (bool) ($assignment->permissions['create'] ?? false))
            ->pluck('programme_id')->filter()->unique();
        $programmes = Programme::publiclyAvailable();
        if ($request->user()->role === UserRole::ADMISSIONS_OFFICER) {
            $programmes->whereIn('id', $createProgrammeIds);
        }

        return response()->json(['data' => [
            'programmes' => $programmes->orderBy('name')->get(['id', 'name', 'code']),
            'officers' => User::where('role', UserRole::ADMISSIONS_OFFICER)->where('status', UserStatus::ACTIVE)->orderBy('first_name')->get(['id', 'title', 'first_name', 'last_name', 'email']),
            'capabilities' => [
                'can_create' => in_array($request->user()->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)
                    || $createProgrammeIds->isNotEmpty(),
            ],
            'closing_soon_days' => SystemSetting::integer('closing_soon_days', 7),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedCall($request);
        $this->authorizeCreate($request->user(), $data['programme_id']);
        $publish = $request->boolean('publish');
        $this->ensurePublishedProgramme($data['programme_id']);
        if ($publish) {
            $this->ensurePublishableDeadline($data['deadline']);
        }

        $call = ApplicationCall::create($data + [
            'status' => $publish ? 'open' : 'draft',
            'published_at' => $publish ? now() : null,
            'created_by' => $request->user()->id,
        ]);
        if ($request->user()->role === UserRole::ADMISSIONS_OFFICER) {
            $this->saveAssignment($call, $request->user(), $request->user(), ['create' => true, 'monitor' => true, 'close' => false]);
        }
        $this->audit->record($request, $publish ? 'application_call.published' : 'application_call.created', $request->user(), [], ApplicationCall::class, $call->id);

        return response()->json(['data' => $this->payload($call->load(['programme', 'creator', 'assignments.user']), $request->user())], 201);
    }

    public function update(Request $request, ApplicationCall $applicationCall): JsonResponse
    {
        $this->authorizeCallAction($request->user(), $applicationCall, 'create');
        if (! $this->isEditable($applicationCall)) {
            throw ValidationException::withMessages(['call' => ['Only draft calls or published calls that have not opened yet can be edited.']]);
        }

        $data = $this->validatedCall($request, $applicationCall);
        if ($applicationCall->status === 'open' && today()->startOfDay()->gt($data['opening_date'])) {
            throw ValidationException::withMessages(['opening_date' => ['A published call cannot be moved to a past opening date.']]);
        }
        $this->ensurePublishedProgramme($data['programme_id']);
        $before = $applicationCall->only(['programme_id', 'intake', 'opening_date', 'deadline', 'requirements']);
        $applicationCall->update($data);
        $after = $applicationCall->fresh()->only(['programme_id', 'intake', 'opening_date', 'deadline', 'requirements']);
        $this->audit->record($request, 'application_call.updated', $request->user(), [], ApplicationCall::class, $applicationCall->id, $before, $after);

        return response()->json(['data' => $this->payload($applicationCall->load(['programme', 'creator', 'assignments.user']), $request->user())]);
    }

    public function publish(Request $request, ApplicationCall $applicationCall): JsonResponse
    {
        $this->authorizeCallAction($request->user(), $applicationCall, 'create');
        if ($applicationCall->status !== 'draft') {
            throw ValidationException::withMessages(['call' => ['Only a draft call can be published.']]);
        }
        $this->ensurePublishedProgramme($applicationCall->programme_id);
        $this->ensurePublishableDeadline($applicationCall->deadline);
        $applicationCall->update(['status' => 'open', 'published_at' => now()]);
        $this->audit->record($request, 'application_call.published', $request->user(), [], ApplicationCall::class, $applicationCall->id, ['status' => 'draft'], ['status' => 'open']);

        return response()->json(['data' => $this->payload($applicationCall->load(['programme', 'creator', 'assignments.user']), $request->user())]);
    }

    public function close(Request $request, ApplicationCall $applicationCall): JsonResponse
    {
        $this->authorizeCallAction($request->user(), $applicationCall, 'close');
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']]);
        if ($applicationCall->status === 'closed') {
            throw ValidationException::withMessages(['call' => ['This call is already closed.']]);
        }
        $before = ['status' => $applicationCall->status];
        $applicationCall->update(['status' => 'closed', 'closed_reason' => trim($data['reason']), 'closed_at' => now()]);
        $this->audit->record($request, 'application_call.closed', $request->user(), ['reason' => trim($data['reason'])], ApplicationCall::class, $applicationCall->id, $before, ['status' => 'closed']);

        return response()->json(['data' => $this->payload($applicationCall->load(['programme', 'creator', 'assignments.user']), $request->user())]);
    }

    public function reopen(Request $request, ApplicationCall $applicationCall): JsonResponse
    {
        abort_unless(in_array($request->user()->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true), 403);
        if ($applicationCall->status !== 'closed') {
            throw ValidationException::withMessages(['call' => ['Only a closed call can be reopened.']]);
        }
        $data = $request->validate([
            'opening_date' => ['required', 'date', 'after_or_equal:today'],
            'deadline' => ['required', 'date', 'after:opening_date'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);
        $this->ensurePublishedProgramme($applicationCall->programme_id);
        $before = $applicationCall->only(['status', 'opening_date', 'deadline', 'closed_reason', 'closed_at']);
        $applicationCall->update([
            'status' => 'open',
            'opening_date' => $data['opening_date'],
            'deadline' => $data['deadline'],
            'closed_reason' => null,
            'closed_at' => null,
            'published_at' => now(),
        ]);
        $this->audit->record($request, 'application_call.reopened', $request->user(), ['reason' => trim($data['reason'])], ApplicationCall::class, $applicationCall->id, $before, $applicationCall->fresh()->only(['status', 'opening_date', 'deadline', 'closed_reason', 'closed_at']));

        return response()->json(['data' => $this->payload($applicationCall->load(['programme', 'creator', 'assignments.user']), $request->user())]);
    }

    public function delegate(Request $request, ApplicationCall $applicationCall): JsonResponse
    {
        abort_unless(in_array($request->user()->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true), 403);
        $data = $request->validate([
            'officer_id' => ['required', 'uuid', Rule::exists('users', 'id')->where(fn ($query) => $query
                ->where('role', UserRole::ADMISSIONS_OFFICER->value)
                ->where('status', UserStatus::ACTIVE->value))],
            'permissions' => ['required', 'array'],
            'permissions.create' => ['required', 'boolean'],
            'permissions.monitor' => ['required', 'boolean'],
            'permissions.close' => ['required', 'boolean'],
        ]);
        if (! collect($data['permissions'])->contains(true)) {
            throw ValidationException::withMessages(['permissions' => ['Select at least one permission for this officer.']]);
        }
        $officer = User::findOrFail($data['officer_id']);
        $assignment = $this->saveAssignment($applicationCall, $officer, $request->user(), $data['permissions']);
        $this->audit->record($request, 'application_call.delegated', $request->user(), ['officer_id' => $officer->id, 'permissions' => $assignment->permissions], ApplicationCall::class, $applicationCall->id);

        return response()->json(['data' => $this->payload($applicationCall->load(['programme', 'creator', 'assignments.user']), $request->user())]);
    }

    private function validatedCall(Request $request, ?ApplicationCall $applicationCall = null): array
    {
        return $request->validate([
            'programme_id' => ['required', 'uuid', 'exists:programmes,id'],
            'intake' => [
                'required', 'string', 'max:255',
                Rule::unique('application_calls', 'intake')
                    ->where(fn ($query) => $query->where('programme_id', $request->input('programme_id')))
                    ->ignore($applicationCall?->id),
            ],
            'opening_date' => ['required', 'date'],
            'deadline' => ['required', 'date', 'after:opening_date'],
            'requirements' => ['nullable', 'string', 'max:10000'],
        ]);
    }

    private function visibleQuery(User $user): Builder
    {
        $query = ApplicationCall::query();
        if (in_array($user->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)) {
            return $query;
        }
        abort_unless($user->role === UserRole::ADMISSIONS_OFFICER, 403);

        return $query->whereHas('assignments', fn (Builder $builder) => $builder->where('user_id', $user->id)->effective());
    }

    private function authorizeCreate(User $user, string $programmeId): void
    {
        if (in_array($user->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)) {
            return;
        }
        abort_unless($user->role === UserRole::ADMISSIONS_OFFICER && $user->assignments()->effective()->get()->contains(
            fn (UserAssignment $assignment): bool => $assignment->programme_id === $programmeId
                && (bool) ($assignment->permissions['create'] ?? false)
        ), 403);
    }

    private function authorizeCallAction(User $user, ApplicationCall $call, string $permission): void
    {
        if (in_array($user->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)) {
            return;
        }
        $assignment = $call->assignments()->where('user_id', $user->id)->effective()->first();
        abort_unless($user->role === UserRole::ADMISSIONS_OFFICER && (bool) ($assignment?->permissions[$permission] ?? false), 403);
    }

    private function isEditable(ApplicationCall $call): bool
    {
        return $call->status === 'draft'
            || ($call->status === 'open' && $call->opening_date->gte(today()));
    }

    private function ensurePublishedProgramme(string $programmeId): void
    {
        if (! Programme::whereKey($programmeId)->publiclyAvailable()->exists()) {
            throw ValidationException::withMessages(['programme_id' => ['Calls can only be attached to a published programme.']]);
        }
    }

    private function ensurePublishableDeadline(mixed $deadline): void
    {
        $date = $deadline instanceof \DateTimeInterface ? $deadline : date_create_immutable((string) $deadline);
        if (! $date || $date < today()->startOfDay()) {
            throw ValidationException::withMessages(['deadline' => ['An application call cannot be published after its deadline has passed.']]);
        }
    }

    private function saveAssignment(ApplicationCall $call, User $officer, User $actor, array $permissions): UserAssignment
    {
        return DB::transaction(function () use ($call, $officer, $actor, $permissions) {
            $call->loadMissing('programme:id,faculty_id,department_id');
            $assignment = UserAssignment::firstOrNew(['user_id' => $officer->id, 'application_call_id' => $call->id]);
            $assignment->fill([
                'role' => UserRole::ADMISSIONS_OFFICER,
                'faculty_id' => $call->programme?->faculty_id,
                'department_id' => $call->programme?->department_id,
                'programme_id' => $call->programme_id,
                'permissions' => array_intersect_key($permissions, array_flip(['create', 'monitor', 'close'])),
                'is_active' => true,
                'assigned_by' => $actor->id,
            ])->save();

            return $assignment;
        });
    }

    private function closeExpiredCalls(Request $request): void
    {
        $expired = $this->visibleQuery($request->user())->where('status', 'open')->whereDate('deadline', '<', today())->get();
        foreach ($expired as $call) {
            $call->update(['status' => 'closed', 'closed_reason' => 'Automatically closed when the application deadline passed.', 'closed_at' => now()]);
            $this->audit->record($request, 'application_call.auto_closed', null, [], ApplicationCall::class, $call->id, ['status' => 'open'], ['status' => 'closed']);
        }
    }

    private function payload(ApplicationCall $call, User $viewer): array
    {
        $viewerAssignment = $call->assignments->firstWhere('user_id', $viewer->id);
        $effective = $call->status;
        if ($effective === 'open' && $call->opening_date->isFuture()) {
            $effective = 'scheduled';
        } elseif ($effective === 'open' && $call->deadline->lte(today()->addDays($this->closingSoonDays ??= SystemSetting::integer('closing_soon_days', 7)))) {
            $effective = 'closing-soon';
        }

        return [
            'id' => $call->id,
            'programme_id' => $call->programme_id,
            'programme' => $call->programme?->name ?? 'Unavailable programme',
            'intake' => $call->intake,
            'opening_date' => $call->opening_date->toDateString(),
            'deadline' => $call->deadline->toDateString(),
            'requirements' => $call->requirements ?? '',
            'status' => $call->status,
            'effective_status' => $effective,
            'closed_reason' => $call->closed_reason,
            'created_by' => $call->creator?->name ?? 'System',
            'permissions' => in_array($viewer->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)
                ? ['create' => true, 'monitor' => true, 'close' => true]
                : ($viewerAssignment?->permissions ?? ['create' => false, 'monitor' => true, 'close' => false]),
            'can_edit' => $this->isEditable($call) && (
                in_array($viewer->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)
                || (bool) ($viewerAssignment?->permissions['create'] ?? false)
            ),
            'assignments' => $call->assignments->map(fn (UserAssignment $assignment) => [
                'officer_id' => $assignment->user_id,
                'officer' => $assignment->user?->name ?? 'Unavailable officer',
                'permissions' => $assignment->permissions,
            ])->values(),
        ];
    }
}
