<?php

return [
    'enabled' => (bool) env('AWS_SECRETS_MANAGER_ENABLED', false),
    'region' => env('AWS_SECRETS_MANAGER_REGION', env('AWS_DEFAULT_REGION', 'us-east-1')),
    'profile' => env('AWS_SECRETS_MANAGER_PROFILE'),
    'cache_seconds' => (int) env('AWS_SECRETS_MANAGER_CACHE_SECONDS', 300),

    /*
     * Only rotation-safe application credentials belong here. Bootstrap and
     * infrastructure secrets (APP_KEY, database, IAM/AWS and SSH credentials)
     * must never be writable through the portal.
     */
    'definitions' => [
        'nvidia_api_key' => [
            'label' => 'NVIDIA AI API key',
            'description' => 'Used for catalogue assistant responses and knowledge indexing.',
            'secret_id' => env('AWS_SECRET_NVIDIA_API_KEY_ID'),
            'json_field' => 'NVIDIA_API_KEY',
            'minimum_length' => 20,
            'maximum_length' => 4096,
        ],
    ],
];
