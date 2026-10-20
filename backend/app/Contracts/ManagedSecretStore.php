<?php

namespace App\Contracts;

interface ManagedSecretStore
{
    /** @return array<int, array<string, mixed>> */
    public function statuses(): array;

    public function get(string $key): ?string;

    /** @return array<string, mixed> */
    public function replace(string $key, string $value): array;
}
