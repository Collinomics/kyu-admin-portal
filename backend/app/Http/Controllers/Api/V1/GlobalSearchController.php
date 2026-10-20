<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ApplicationCall;
use App\Models\Programme;
use App\Models\User;
use App\Services\ManagedUserScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class GlobalSearchController extends Controller
{
    private const RESULT_LIMIT = 4;

    public function __construct(private readonly ManagedUserScope $managedUsers) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']]);
        $term = trim($data['q']);
        $needle = '%'.Str::lower($term).'%';
        $actor = $request->user();
        $results = collect();

        if (in_array($actor->role, [UserRole::SYSADMIN, UserRole::DEAN, UserRole::HOD, UserRole::REGISTRAR], true)) {
            $users = $this->managedUsers->query($actor);
            $results->push(...$users
                ->where(fn (Builder $query) => $query
                    ->whereRaw('LOWER(first_name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(last_name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(role) LIKE ?', [$needle]))
                ->orderBy('first_name')->orderBy('last_name')->limit(self::RESULT_LIMIT)->get()
                ->map(fn (User $user): array => [
                    'id' => $user->id,
                    'type' => 'user',
                    'label' => $user->name,
                    'sub' => $user->email.' · '.Str::headline($user->role->value),
                    'search' => $user->email,
                ]));
        }

        $programmes = $this->visibleProgrammes($actor);
        if ($programmes !== null) {
            $results->push(...$programmes
                ->with('faculty:id,name')
                ->where(fn (Builder $query) => $query
                    ->whereRaw('LOWER(name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(code) LIKE ?', [$needle])
                    ->orWhereHas('faculty', fn (Builder $faculty) => $faculty->whereRaw('LOWER(name) LIKE ?', [$needle])))
                ->orderBy('name')->limit(self::RESULT_LIMIT)->get()
                ->map(fn (Programme $programme): array => [
                    'id' => $programme->id,
                    'type' => 'programme',
                    'label' => $programme->name,
                    'sub' => $programme->code.' · '.($programme->faculty?->name ?? 'Academic unit not assigned'),
                    'search' => $programme->code,
                ]));
        }

        $calls = $this->visibleCalls($actor);
        if ($calls !== null) {
            $results->push(...$calls
                ->with('programme:id,name,code')
                ->where(fn (Builder $query) => $query
                    ->whereRaw('LOWER(intake) LIKE ?', [$needle])
                    ->orWhereHas('programme', fn (Builder $programme) => $programme
                        ->whereRaw('LOWER(name) LIKE ?', [$needle])
                        ->orWhereRaw('LOWER(code) LIKE ?', [$needle])))
                ->latest('opening_date')->limit(self::RESULT_LIMIT)->get()
                ->map(fn (ApplicationCall $call): array => [
                    'id' => $call->id,
                    'type' => 'call',
                    'label' => $call->intake,
                    'sub' => ($call->programme?->name ?? 'Unavailable programme').' · '.$call->status,
                    'search' => $call->intake,
                ]));
        }

        return response()->json(['data' => $results->values()]);
    }

    private function visibleProgrammes(User $actor): ?Builder
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
            default => null,
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

        return ApplicationCall::query()->whereHas('assignments', fn (Builder $query) => $query
            ->where('user_id', $actor->id)->effective());
    }
}
