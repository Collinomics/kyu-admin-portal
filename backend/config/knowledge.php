<?php

return [
    'max_upload_kilobytes' => (int) env('KNOWLEDGE_MAX_UPLOAD_KB', 12288),
    'max_archive_entries' => (int) env('KNOWLEDGE_MAX_ARCHIVE_ENTRIES', 5000),
    'max_uncompressed_bytes' => (int) env('KNOWLEDGE_MAX_UNCOMPRESSED_BYTES', 104857600),
    'antivirus_binary' => env('KNOWLEDGE_ANTIVIRUS_BINARY'),
    'antivirus_database' => env('KNOWLEDGE_ANTIVIRUS_DATABASE'),
    'antivirus_timeout_seconds' => (int) env('KNOWLEDGE_ANTIVIRUS_TIMEOUT', 240),
    'max_extracted_characters' => (int) env('KNOWLEDGE_MAX_EXTRACTED_CHARACTERS', 2000000),
    'max_csv_rows' => (int) env('KNOWLEDGE_MAX_CSV_ROWS', 20000),
    'max_csv_columns' => (int) env('KNOWLEDGE_MAX_CSV_COLUMNS', 100),
    'chunk_characters' => (int) env('KNOWLEDGE_CHUNK_CHARACTERS', 3000),
];
