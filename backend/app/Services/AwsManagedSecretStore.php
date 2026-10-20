<?php

namespace App\Services;

use App\Contracts\ManagedSecretStore;
use Aws\Credentials\CredentialProvider;
use Aws\Exception\AwsException;
use Aws\SecretsManager\SecretsManagerClient;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class AwsManagedSecretStore implements ManagedSecretStore
{
    private ?SecretsManagerClient $client = null;

    public function statuses(): array
    {
        return collect($this->definitions())->map(function (array $definition, string $key): array {
            $base = [
                'key' => $key,
                'label' => $definition['label'],
                'description' => $definition['description'],
                'provider' => 'AWS Secrets Manager',
                'configured' => false,
                'available' => false,
                'last_changed_at' => null,
            ];

            if (! $this->enabled() || empty($definition['secret_id'])) {
                return $base + ['state' => 'not-connected'];
            }

            try {
                $result = $this->client()->describeSecret(['SecretId' => $definition['secret_id']]);

                return array_replace($base, [
                    'configured' => true,
                    'available' => true,
                    'state' => 'ready',
                    'last_changed_at' => isset($result['LastChangedDate'])
                        ? $result['LastChangedDate']->format(DATE_ATOM)
                        : null,
                ]);
            } catch (Throwable $exception) {
                Log::warning('Managed credential status check failed.', [
                    'credential_key' => $key,
                    'provider_code' => $this->providerCode($exception),
                ]);

                return array_replace($base, ['configured' => true, 'state' => 'unavailable']);
            }
        })->values()->all();
    }

    public function get(string $key): ?string
    {
        $definition = $this->definition($key);
        if (! $this->enabled()) {
            return null;
        }
        if (empty($definition['secret_id'])) {
            throw new RuntimeException('The managed credential mapping is incomplete.');
        }

        try {
            $result = $this->client()->getSecretValue(['SecretId' => $definition['secret_id']]);
            $secret = $result['SecretString'] ?? null;

            if (! is_string($secret) || $secret === '') {
                return null;
            }
            $decoded = json_decode($secret, true);
            $field = $definition['json_field'] ?? null;
            if (is_string($field) && is_array($decoded)) {
                $fieldValue = $decoded[$field] ?? null;

                $value = is_string($fieldValue) && $fieldValue !== '' ? $fieldValue : null;
            } else {
                $value = is_string($decoded) ? $decoded : $secret;
            }
        } catch (Throwable $exception) {
            Log::warning('Managed credential retrieval failed.', [
                'credential_key' => $key,
                'provider_code' => $this->providerCode($exception),
            ]);
            throw new RuntimeException('Secure credential storage is unavailable.');
        }
        if (! is_string($value) || $value === '') {
            throw new RuntimeException('The managed credential has no usable value.');
        }

        return $value;
    }

    public function replace(string $key, string $value): array
    {
        $definition = $this->definition($key);
        if (! $this->enabled() || empty($definition['secret_id'])) {
            throw new RuntimeException('Secure credential storage is not connected on this server.');
        }

        try {
            $secretString = isset($definition['json_field'])
                ? json_encode([$definition['json_field'] => $value], JSON_THROW_ON_ERROR)
                : $value;
            $result = $this->client()->putSecretValue([
                'SecretId' => $definition['secret_id'],
                'SecretString' => $secretString,
            ]);
        } catch (Throwable $exception) {
            Log::warning('Managed credential replacement failed.', [
                'credential_key' => $key,
                'provider_code' => $this->providerCode($exception),
            ]);
            throw new RuntimeException('Secure credential storage rejected the replacement.');
        }
        return [
            'key' => $key,
            'version_id' => isset($result['VersionId']) ? (string) $result['VersionId'] : null,
            'changed_at' => now()->toAtomString(),
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private function definitions(): array
    {
        return config('managed_secrets.definitions', []);
    }

    /** @return array<string, mixed> */
    private function definition(string $key): array
    {
        $definition = $this->definitions()[$key] ?? null;
        if (! is_array($definition)) {
            throw new InvalidArgumentException('This credential is not approved for portal-managed rotation.');
        }

        return $definition;
    }

    private function enabled(): bool
    {
        return (bool) config('managed_secrets.enabled', false);
    }

    private function client(): SecretsManagerClient
    {
        $options = [
            'version' => 'latest',
            'region' => (string) config('managed_secrets.region'),
        ];
        $profile = trim((string) config('managed_secrets.profile'));
        if ($profile !== '') {
            $options['credentials'] = CredentialProvider::sso('profile '.$profile);
        }

        return $this->client ??= new SecretsManagerClient($options);
    }

    private function providerCode(Throwable $exception): string
    {
        return $exception instanceof AwsException
            ? (string) ($exception->getAwsErrorCode() ?: 'aws_request_failed')
            : 'credential_provider_unavailable';
    }
}
