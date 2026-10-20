<?php

namespace App\Http\Middleware;

use App\Enums\UserStatus;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActivePortalAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->status !== UserStatus::ACTIVE) {
            $user->currentAccessToken()?->delete();

            return new JsonResponse([
                'code' => 'ACCOUNT_UNAVAILABLE',
                'message' => 'This session is no longer available. Sign in again or contact the System Administrator.',
            ], 403);
        }

        return $next($request);
    }
}
