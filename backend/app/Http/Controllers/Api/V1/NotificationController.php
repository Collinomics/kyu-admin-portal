<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ApplicationCall;
use App\Models\Programme;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $actor = $request->user();
        $alerts = collect();

        $programmeStatuses = match ($actor->role) {
            UserRole::SYSADMIN => ['submitted', 'hod-reviewed', 'rejected'],
            UserRole::HOD => ['submitted'],
            UserRole::DEAN => ['hod-reviewed'],
            UserRole::COORDINATOR => ['rejected'],
            default => [],
        };
        if ($programmeStatuses !== []) {
            $alerts->push(...$this->visibleProgrammes($actor)
                ->whereIn('status', $programmeStatuses)
                ->latest('updated_at')->limit(6)->get()
                ->map(fn (Programme $programme): array => [
                    'id' => "programme:{$programme->id}:{$programme->status}:{$programme->updated_at->timestamp}",
                    'type' => $programme->status === 'rejected' ? 'warning' : 'review',
                    'text' => $this->programmeMessage($programme),
                    'occurred_at' => $programme->updated_at,
                    'path' => '/admin/programmes?'.http_build_query(['search' => $programme->code, 'target' => $programme->id]),
                ]));
        }

        $calls = $this->visibleCalls($actor);
        if ($calls !== null) {
            $closingSoonDays = SystemSetting::integer('closing_soon_days', 7);
            $alerts->push(...$calls
                ->with('programme:id,name')
                ->where('status', 'open')
                ->whereDate('opening_date', '<=', today())
                ->whereDate('deadline', '>=', today())
                ->whereDate('deadline', '<=', today()->addDays($closingSoonDays))
                ->orderBy('deadline')->limit(5)->get()
                ->map(fn (ApplicationCall $call): array => [
                    'id' => "call:{$call->id}:closing:{$call->deadline->toDateString()}",
                    'type' => 'deadline',
                    'text' => ($call->programme?->name ?? 'An application call').' closes '.$call->deadline->diffForHumans().'.',
                    'occurred_at' => $call->updated_at,
                    'path' => '/admin/admissions?'.http_build_query(['search' => $call->intake, 'target' => $call->id]),
                ]));
        }

        if ($actor->role === UserRole::SYSADMIN) {
            $alerts->push(...User::query()->where('locked_until', '>', now())->latest('locked_until')->limit(5)->get()
                ->map(fn (User $user): array => [
                    'id' => "security:{$user->id}:locked:{$user->locked_until->timestamp}",
                    'type' => 'security',
                    'text' => "{$user->email} is temporarily locked after repeated failed sign-in attempts.",
                    'occurred_at' => $user->updated_at,
                    'path' => '/admin/users?'.http_build_query(['search' => $user->email, 'target' => $user->id]),
                ]));
        }

        return response()->json(['data' => $alerts
            ->sortByDesc('occurred_at')->take(10)->values()
            ->map(fn (array $alert): array => [
                'id' => $alert['id'],
                'type' => $alert['type'],
                'text' => $alert['text'],
                'occurred_at' => $alert['occurred_at']?->toIso8601String(),
                'path' => $alert['path'],
            ])]);
    }

    private function visibleProgrammes(User $actor): Builder
    {
        $query = Programme::query();
        if ($actor->role === UserRole::SYSADMIN) {
            return $query;
        }
        $assignments = $actor->assignments()->effective()->get();

        return match ($actor->role) {
            UserRole::COORDINATOR => $query->whereIn('id', $assignments->pluck('programme_id')->filter()),
            UserRole::HOD => $query->whereIn('faculty_id', $assignments->pluck('faculty_id')->filter()),
            UserRole::DEAN => $query->whereIn('faculty_id', $assignments->pluck('faculty_id')->filter()),
            default => $query->whereRaw('1 = 0'),
        };
    }

    private function visibleCalls(User $actor): ?Builder
    {
        if (in_array($actor->role, [UserRole::SYSADMIN, UserRole::REGISTRAR], true)) {
            return ApplicationCall::query();
        }
        if ($actor->role !== UserRole::ADMISSIONS_OFFICER) {
            return null;
        }

        return ApplicationCall::query()->whereHas('assignments', fn (Builder $builder) => $builder
            ->where('user_id', $actor->id)->effective());
    }

    private function programmeMessage(Programme $programme): string
    {
        return match ($programme->status) {
            'submitted' => "{$programme->name} is waiting for HOD review.",
            'hod-reviewed' => "{$programme->name} is waiting for the Dean's decision.",
            'rejected' => "{$programme->name} was returned for corrections.",
            default => "{$programme->name} requires attention.",
        };
    }
}
