<?php
/** Public, read-only widget appearance configuration. */

declare(strict_types=1);

require_once __DIR__ . '/db_rest.php';
require_once __DIR__ . '/http_security.php';

apply_cors('PUBLIC_WIDGET_ORIGINS', ['GET', 'OPTIONS']);
header('Content-Type: application/json');
header('Cache-Control: public, max-age=60');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_error(405, 'GET required');
}

$all = [];
try {
    $all = get_all_settings();
} catch (Throwable $e) {
    error_log('Unable to load public widget settings: ' . $e->getMessage());
    json_error(503, 'widget settings are temporarily unavailable');
}
$publicKeys = ['bot_name', 'accent_color', 'greeting', 'suggestions', 'profile_avatar'];
$settings = [];
foreach ($publicKeys as $key) {
    if (array_key_exists($key, $all)) {
        $settings[$key] = (string) $all[$key];
    }
}

echo json_encode(['settings' => $settings]);
