<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AuditLogger
{
    public function record(
        Request $request,
        string $action,
        ?User $actor = null,
        array $metadata = [],
        ?string $targetType = null,
        ?string $targetId = null,
        ?array $before = null,
        ?array $after = null,
    ): void {
        $suppliedRequestId = (string) $request->headers->get('X-Request-ID');
        AuditEvent::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'target_type' => $targetType ?? ($actor ? User::class : null),
            'target_id' => $targetId ?? $actor?->id,
            'before_state' => $before,
            'after_state' => $after,
            'metadata' => $metadata ?: null,
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 1000),
            'request_id' => Str::isUuid($suppliedRequestId) ? $suppliedRequestId : (string) Str::uuid(),
            'created_at' => now(),
        ]);
    }
}
