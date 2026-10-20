<?php

declare(strict_types=1);

use App\Contracts\ManagedSecretStore;
use Aws\Exception\AwsException;
use Aws\SecretsManager\SecretsManagerClient;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;

require '/var/www/kyu-portal/backend/vendor/autoload.php';

$app = require '/var/www/kyu-portal/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$store = $app->make(ManagedSecretStore::class);
$statuses = $store->statuses();
$safeStatuses = array_map(static fn (array $status): array => [
    'key' => $status['key'] ?? null,
    'provider' => $status['provider'] ?? null,
    'configured' => $status['configured'] ?? false,
    'available' => $status['available'] ?? false,
    'state' => $status['state'] ?? null,
], $statuses);

$retrievable = false;
$retrievalError = null;
try {
    $retrievable = $store->get('nvidia_api_key') !== '';
} catch (Throwable $exception) {
    // This diagnostic never prints the credential value or request payload.
    $retrievalError = [
        'type' => $exception::class,
        'message' => $exception->getMessage(),
    ];
}

$directRetrievable = false;
$directError = null;
try {
    $client = new SecretsManagerClient([
        'version' => 'latest',
        'region' => (string) config('managed_secrets.region'),
    ]);
    $result = $client->getSecretValue([
        'SecretId' => (string) config('managed_secrets.definitions.nvidia_api_key.secret_id'),
    ]);
    $directRetrievable = isset($result['SecretString']) && $result['SecretString'] !== '';
} catch (Throwable $exception) {
    $directError = [
        'type' => $exception::class,
        'provider_code' => $exception instanceof AwsException ? $exception->getAwsErrorCode() : null,
        'message' => $exception->getMessage(),
    ];
}

$cacheWritable = false;
$cacheError = null;
try {
    Cache::put('managed-secret-diagnostic', 'ok', 30);
    $cacheWritable = Cache::get('managed-secret-diagnostic') === 'ok';
    Cache::forget('managed-secret-diagnostic');
} catch (Throwable $exception) {
    $cacheError = [
        'type' => $exception::class,
        'message' => $exception->getMessage(),
    ];
}

echo json_encode([
    'statuses' => $safeStatuses,
    'retrievable' => $retrievable,
    'retrieval_error' => $retrievalError,
    'direct_retrievable' => $directRetrievable,
    'direct_error' => $directError,
    'cache_store' => (string) config('cache.default'),
    'cache_writable' => $cacheWritable,
    'cache_error' => $cacheError,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;

exit($retrievable && $directRetrievable ? 0 : 1);
