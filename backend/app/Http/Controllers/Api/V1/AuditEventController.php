<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AuditEventController extends Controller
{
    private const CATEGORIES = ['account', 'programme', 'admissions', 'security', 'system'];

    private const OUTCOMES = ['success', 'blocked', 'warning'];

    public function __invoke(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', Rule::in(self::CATEGORIES)],
            'outcome' => ['nullable', Rule::in(self::OUTCOMES)],
            'range' => ['nullable', Rule::in(['24h', '7d', '30d', '90d', 'all'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $rangeQuery = AuditEvent::query();
        $this->applyRange($rangeQuery, $filters['range'] ?? '30d');
        $actionCounts = (clone $rangeQuery)->selectRaw('action, count(*) AS total')->groupBy('action')->pluck('total', 'action');

        $query = clone $rangeQuery;
        $this->applySearch($query, trim((string) ($filters['search'] ?? '')));
        $this->applyCategory($query, $filters['category'] ?? null);
        $this->applyOutcome($query, $filters['outcome'] ?? null);
        $page = $query->with('actor:id,title,first_name,last_name,email,role')->latest('created_at')
            ->paginate((int) ($filters['per_page'] ?? 10));

        return response()->json([
            'data' => collect($page->items())->map(fn (AuditEvent $event) => $this->payload($event)),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'total' => $page->total(),
                'stats' => [
                    'recorded' => $actionCounts->sum(),
                    'blocked' => $actionCounts->filter(fn ($count, string $action) => $this->outcome($action) === 'blocked')->sum(),
                    'security' => $actionCounts->filter(fn ($count, string $action) => $this->category($action) === 'security')->sum(),
                ],
            ],
        ]);
    }

    private function applyRange(Builder $query, string $range): void
    {
        $cutoff = match ($range) {
            '24h' => now()->subDay(),
            '7d' => now()->subDays(7),
            '30d' => now()->subDays(30),
            '90d' => now()->subDays(90),
            default => null,
        };
        if ($cutoff) {
            $query->where('created_at', '>=', $cutoff);
        }
    }

    private function applySearch(Builder $query, string $search): void
    {
        if ($search === '') {
            return;
        }
        $needle = '%'.Str::lower($search).'%';
        $query->where(function (Builder $builder) use ($needle) {
            $builder->whereRaw('LOWER(action) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(ip_address, ?)) LIKE ?', ['', $needle])
                ->orWhereRaw('LOWER(CAST(request_id AS TEXT)) LIKE ?', [$needle])
                ->orWhereHas('actor', fn (Builder $actor) => $actor
                    ->whereRaw('LOWER(email) LIKE ?', [$needle])
                    ->orWhereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$needle]));
        });
    }

    private function applyCategory(Builder $query, ?string $category): void
    {
        match ($category) {
            'account' => $query->where('action', 'like', 'user.%'),
            'programme' => $query->where('action', 'like', 'programme.%'),
            'admissions' => $query->where('action', 'like', 'application_call.%'),
            'security' => $query->where('action', 'like', 'auth.%'),
            'system' => $query->where('action', 'not like', 'user.%')->where('action', 'not like', 'programme.%')->where('action', 'not like', 'application_call.%')->where('action', 'not like', 'auth.%'),
            default => null,
        };
    }

    private function applyOutcome(Builder $query, ?string $outcome): void
    {
        match ($outcome) {
            'blocked' => $query->where('action', 'auth.login_failed'),
            'warning' => $query->where(fn (Builder $builder) => $builder->where('action', 'like', '%.rejected')->orWhere('action', 'like', '%.auto_closed')),
            'success' => $query->where('action', '!=', 'auth.login_failed')->where('action', 'not like', '%.rejected')->where('action', 'not like', '%.auto_closed'),
            default => null,
        };
    }

    private function category(string $action): string
    {
        return match (true) {
            str_starts_with($action, 'user.') => 'account',
            str_starts_with($action, 'programme.') => 'programme',
            str_starts_with($action, 'application_call.') => 'admissions',
            str_starts_with($action, 'auth.') => 'security',
            default => 'system',
        };
    }

    private function outcome(string $action): string
    {
        return match (true) {
            $action === 'auth.login_failed' => 'blocked',
            str_ends_with($action, '.rejected'), str_ends_with($action, '.auto_closed') => 'warning',
            default => 'success',
        };
    }

    private function payload(AuditEvent $event): array
    {
        return [
            'id' => $event->id,
            'created_at' => $event->created_at->toIso8601String(),
            'actor' => $event->actor?->name ?? 'System',
            'actor_email' => $event->actor?->email,
            'role' => $event->actor?->role?->value ?? 'SYSTEM',
            'action' => $event->action,
            'category' => $this->category($event->action),
            'outcome' => $this->outcome($event->action),
            'target_type' => $event->target_type ? class_basename($event->target_type) : null,
            'target_id' => $event->target_id,
            'ip_address' => $event->ip_address,
            'request_id' => $event->request_id,
            'metadata' => $event->metadata,
        ];
    }
}
