<?php

return [

    'nvidia' => [
        'base_url' => env('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com'),
        'api_key' => env('NVIDIA_API_KEY'),
        'embed_model' => env('NVIDIA_EMBED_MODEL', 'nvidia/llama-nemotron-embed-vl-1b-v2'),
        'chat_models' => array_values(array_filter(array_map('trim', explode(',', env(
            'NVIDIA_CHAT_MODELS',
            'openai/gpt-oss-20b,minimaxai/minimax-m3,moonshotai/kimi-k3,meta/muse-glimmer-30b'
        ))))),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
