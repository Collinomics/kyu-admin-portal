<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\AffiliatedInstitution;
use App\Models\ApplicationCall;
use App\Models\AuditEvent;
use App\Models\Programme;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\ManagedUserScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly ManagedUserScope $managedUsers) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $programmeQuery = $this->visibleProgrammes($user);
        $isSystemAdministrator = $user->role === UserRole::SYSADMIN;
        $accountQuery = $this->managedUsers->query($user);
        $accountCounts = $accountQuery->selectRaw("COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active")->first();
        $programmeCounts = (clone $programmeQuery)->selectRaw(<<<'SQL'
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
            SUM(CASE WHEN status = 'published' OR published_snapshot IS NOT NULL THEN 1 ELSE 0 END) AS published,
            SUM(CASE WHEN status IN ('submitted', 'hod-reviewed') THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        SQL)->first();
        $callRows = $this->visibleCalls($user)->get(['id', 'status', 'opening_date', 'deadline']);
        $openCalls = $callRows->where('status', 'open')->filter(fn (ApplicationCall $call) =>
            $call->opening_date->lte(today()) && $call->deadline->gte(today())
        )->count();
        $closingSoonDays = SystemSetting::integer('closing_soon_days', 7);
        $closingSoonCalls = $callRows->where('status', 'open')->filter(fn (ApplicationCall $call) =>
            $call->opening_date->lte(today()) && $call->deadline->between(today(), today()->addDays($closingSoonDays))
        )->count();
        $focusCalls = $this->visibleCalls($user)->with('programme:id,name')->latest('opening_date')->limit(8)->get();
        $year = (int) now()->format('Y');
        $audit = $isSystemAdministrator
            ? AuditEvent::query()->with('actor:id,title,first_name,last_name')->latest('created_at')->limit(100)->get()
            : collect();
        $monthly = collect(range(1, 12))->map(fn (int $month) => [
            'month' => now()->setMonth($month)->format('M'),
            'value' => $audit->filter(fn (AuditEvent $event) => (int) $event->created_at->format('Y') === $year && (int) $event->created_at->format('n') === $month)->count(),
        ])->all();
        $focusProgrammes = (clone $programmeQuery)
            ->with(['faculty:id,name', 'department:id,name', 'coordinator:id,title,first_name,last_name'])
            ->latest('updated_at')->limit(8)->get();

        return response()->json(['data' => [
            'counts' => [
                'accounts' => (int) $accountCounts->total,
                'active_accounts' => (int) $accountCounts->active,
                'programmes' => (int) $programmeCounts->total,
                'draft_programmes' => (int) $programmeCounts->drafts,
                'published_programmes' => (int) $programmeCounts->published,
                'pending_programmes' => (int) $programmeCounts->pending,
                'rejected_programmes' => (int) $programmeCounts->rejected,
                'affiliated_institutions' => $isSystemAdministrator ? AffiliatedInstitution::where('is_published', true)->count() : 0,
                'open_calls' => $openCalls,
                'closing_soon_calls' => $closingSoonCalls,
                'draft_calls' => $callRows->where('status', 'draft')->count(),
                'closed_calls' => $callRows->where('status', 'closed')->count(),
                'assigned_calls' => $callRows->count(),
            ],
            'monthly_activity' => $monthly,
            'focus_programmes' => $focusProgrammes->map(fn (Programme $programme) => [
                'id' => $programme->id,
                'name' => $programme->name,
                'code' => $programme->code,
                'status' => $programme->status,
                'faculty' => $programme->faculty?->name ?? 'Not assigned',
                'department' => $programme->department?->name ?? 'Not assigned',
                'coordinator' => $programme->coordinator?->name ?? 'Not assigned',
            ])->values(),
            'focus_calls' => $focusCalls->map(fn (ApplicationCall $call) => [
                'id' => $call->id,
                'programme' => $call->programme?->name ?? 'Unavailable programme',
                'intake' => $call->intake,
                'opening_date' => $call->opening_date->toDateString(),
                'deadline' => $call->deadline->toDateString(),
                'status' => $call->status,
                'effective_status' => $call->status !== 'open' ? $call->status
                    : ($call->deadline->lt(today()) ? 'closed'
                        : ($call->opening_date->isFuture() ? 'scheduled'
                            : ($call->deadline->lte(today()->addDays($closingSoonDays)) ? 'closing-soon' : 'open'))),
            ])->values(),
            'recent_audit' => $audit->take(5)->map(fn (AuditEvent $event) => [
                'id' => $event->id,
                'time' => $event->created_at->format('H:i'),
                'actor' => $event->actor?->name ?? 'System',
                'action' => $event->action,
            ])->values(),
        ]]);
    }

    private function visibleProgrammes(User $user): Builder
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

    private function visibleCalls(User $user): Builder
    {
        $query = ApplicationCall::query();
        if (in_array($user->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)) {
            return $query;
        }
        if ($user->role === UserRole::ADMISSIONS_OFFICER) {
            return $query->whereHas('assignments', fn (Builder $builder) => $builder->where('user_id', $user->id)->effective());
        }

        return $query->whereRaw('1 = 0');
    }
}
