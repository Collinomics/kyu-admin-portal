<?php

/** Restricted PostgreSQL connection used only by the AI runtime. */

declare(strict_types=1);

function ai_local_environment(): array
{
    static $values = null;
    if ($values !== null) return $values;

    $values = [];
    $path = dirname(__DIR__, 2) . '/backend/.env';
    if (!is_file($path)) return $values;

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $value = trim($value);
        if (strlen($value) >= 2 && $value[0] === '"' && $value[strlen($value) - 1] === '"') {
            $value = substr($value, 1, -1);
            $value = str_replace(['\\\\', '\\"', '\\$'], ['\\', '"', '$'], $value);
        }
        $values[trim($key)] = $value;
    }
    return $values;
}

function ai_database_env(string $name, string $backendName, string $default = ''): string
{
    $value = getenv($name);
    if ($value !== false && $value !== '') return $value;
    if (defined($name) && constant($name) !== '') return (string) constant($name);
    return (string) (ai_local_environment()[$backendName] ?? $default);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $username = ai_database_env('AI_DB_USERNAME', 'AI_RUNTIME_DB_USERNAME');
    $password = ai_database_env('AI_DB_PASSWORD', 'AI_RUNTIME_DB_PASSWORD');
    if ($username === '' || $password === '') {
        throw new RuntimeException('AI database credentials are not configured.');
    }
    $dsn = sprintf(
        'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
        ai_database_env('AI_DB_HOST', 'DB_HOST', '127.0.0.1'),
        ai_database_env('AI_DB_PORT', 'DB_PORT', '5432'),
        ai_database_env('AI_DB_DATABASE', 'DB_DATABASE', 'postgres'),
        ai_database_env('AI_DB_SSLMODE', 'DB_SSLMODE', 'require')
    );
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('set search_path = ai, extensions, pg_catalog');
    return $pdo;
}

function to_pgvector(array $embedding): string
{
    return '[' . implode(',', array_map('floatval', $embedding)) . ']';
}

