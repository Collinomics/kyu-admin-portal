<?php

use App\Http\Middleware\EnsureActivePortalAccount;
use App\Http\Middleware\EnsureSystemAdministrator;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi();
        $middleware->alias([
            'active.portal.account' => EnsureActivePortalAccount::class,
            'sysadmin' => EnsureSystemAdministrator::class,
        ]);
    })
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->command('pcs:close-expired-calls')->hourly()->withoutOverlapping();
        $schedule->command('pcs:process-ai-outbox --limit=50')->everyMinute()->withoutOverlapping(10);
        $schedule->command('pcs:prune-ai-telemetry --days=90')->dailyAt('02:30')->withoutOverlapping();
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (ModelNotFoundException $exception, Request $request) {
            if (! $request->is('api/v1/admin/knowledge-sources*')) {
                return null;
            }

            return response()->json([
                'message' => 'This knowledge source is no longer available.',
            ], 404);
        });

        $exceptions->render(function (QueryException $exception, Request $request) {
            if (! $request->is('api/v1/admin/knowledge-sources*')) {
                return null;
            }

            report($exception);

            return response()->json([
                'message' => 'The secure knowledge service is temporarily unavailable. Please try again.',
            ], 503);
        });
    })->create();
