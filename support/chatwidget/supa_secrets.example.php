<?php
/**
 * Local-only fallback for hosts that cannot provide environment variables.
 * Copy to supa_secrets.php and fill values there. Never commit or distribute
 * the resulting file. Rotate credentials immediately if it is shared.
 */
define('SUPA_URL', 'https://YOUR_PROJECT.supabase.co');
define('SUPA_KEY', 'YOUR_ROTATED_SERVICE_ROLE_KEY');
define('PUBLIC_WIDGET_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173');
define('CONSOLE_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173');
define('PCS_CONSOLE_TOKEN', 'GENERATE_A_LONG_RANDOM_SERVER_SIDE_TOKEN');

// Enable only when PHP is reachable exclusively through a trusted proxy.
define('TRUST_PROXY_HEADERS', '0');
