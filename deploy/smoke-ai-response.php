<?php

declare(strict_types=1);

use App\Services\PublicAiAssistant;
use Illuminate\Contracts\Console\Kernel;

require '/var/www/kyu-portal/backend/vendor/autoload.php';

$app = require '/var/www/kyu-portal/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$startedAt = microtime(true);
$result = $app->make(PublicAiAssistant::class)->chat(
    'Briefly introduce the Kyambogo University programme catalogue assistant.',
    [],
    null,
    'deployment-smoke-check',
    '127.0.0.1',
);
$answer = (string) ($result['answer'] ?? '');
$fallback = str_contains(strtolower($answer), 'trouble answering');

echo json_encode([
    'answered' => $answer !== '' && ! $fallback,
    'fallback_used' => $fallback,
    'answer_characters' => mb_strlen($answer),
    'elapsed_seconds' => round(microtime(true) - $startedAt, 2),
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;

exit($answer !== '' && ! $fallback ? 0 : 1);
