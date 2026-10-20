<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SmokePortalHttp extends Command
{
    protected $signature = 'pcs:smoke-portal-http';

    protected $description = 'Verify real login and AI Monitor HTTP endpoints without exposing credentials';

    public function handle(): int
    {
        $base = 'http://127.0.0.1:8000/api/v1';
        $login = Http::acceptJson()->post($base.'/auth/login', [
            'email' => env('PCS_BOOTSTRAP_ADMIN_EMAIL', 'sysadmin@kyu.ac.ug'),
            'password' => env('PCS_BOOTSTRAP_ADMIN_PASSWORD'),
            'device_name' => 'integration-smoke',
        ]);
        if (! $login->successful() || ! is_string($login->json('data.token'))) {
            throw new RuntimeException('Real HTTP login failed with status '.$login->status().'.');
        }

        $client = Http::acceptJson()->withToken($login->json('data.token'));
        $checks = [
            'identity' => $client->get($base.'/auth/me'),
            'monitor overview' => $client->get($base.'/admin/ai-monitor', ['endpoint' => 'overview', 'range' => '7d']),
            'monitor data sources' => $client->get($base.'/admin/ai-monitor', ['endpoint' => 'doc-stats']),
            'AI settings' => $client->get($base.'/admin/ai-settings', ['endpoint' => 'get']),
            'user accounts' => $client->get($base.'/admin/users'),
            'user assignment options' => $client->get($base.'/admin/users/options'),
            'dashboard' => $client->get($base.'/dashboard'),
            'programme catalogue' => $client->get($base.'/programmes', ['page' => 1, 'per_page' => 10]),
            'application calls' => $client->get($base.'/application-calls', ['page' => 1, 'per_page' => 10]),
            'admissions options' => $client->get($base.'/application-calls/options'),
            'system audit trail' => $client->get($base.'/admin/audit-events', ['range' => '30d', 'page' => 1, 'per_page' => 10]),
            'runtime settings' => $client->get($base.'/system-settings/runtime'),
            'system settings' => $client->get($base.'/admin/system-settings'),
        ];

        foreach ($checks as $name => $response) {
            if (! $response->successful()) {
                throw new RuntimeException("{$name} failed with status {$response->status()}.");
            }
        }
        if ((int) $checks['monitor data sources']->json('count') !== 284
            || (int) $checks['monitor data sources']->json('chunks') !== 567) {
            throw new RuntimeException('AI data-source counts do not match the verified index.');
        }
        if (count($checks['user accounts']->json('data', [])) < 1
            || count($checks['user assignment options']->json('data.faculties', [])) < 1
            || count($checks['user assignment options']->json('data.programmes', [])) < 1) {
            throw new RuntimeException('User Management accounts or assignment options are missing.');
        }
        if ((int) $checks['dashboard']->json('data.counts.programmes') < 1
            || count($checks['programme catalogue']->json('data', [])) < 1
            || (int) $checks['programme catalogue']->json('meta.total') < 1) {
            throw new RuntimeException('Dashboard or programme catalogue data is missing.');
        }
        if ((int) $checks['system audit trail']->json('meta.stats.recorded') < 1) {
            throw new RuntimeException('The system audit trail did not return recorded events.');
        }
        if ((int) $checks['runtime settings']->json('data.closing_soon_days') < 1
            || (int) $checks['system settings']->json('data.session_timeout_minutes') < 5) {
            throw new RuntimeException('Shared system settings are missing or invalid.');
        }

        $logout = $client->post($base.'/auth/logout');
        if ($logout->status() !== 204) {
            throw new RuntimeException('Real HTTP logout failed.');
        }

        $this->info('Real portal login, Dashboard, Programmes, Admissions, Audit Log, User Management, AI Monitor, System Settings, and logout endpoints verified.');

        return self::SUCCESS;
    }
}
