<?php

namespace App\Http\Middleware;

use App\Enums\UserRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSystemAdministrator
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== UserRole::SYSADMIN) {
            return response()->json([
                'code' => 'FORBIDDEN',
                'message' => 'System Administrator access is required.',
            ], 403);
        }

        return $next($request);
    }
}
