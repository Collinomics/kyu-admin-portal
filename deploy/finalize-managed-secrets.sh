#!/usr/bin/env bash
set -euo pipefail

BACKEND_ROOT=/var/www/kyu-portal/backend
ENV_FILE="$BACKEND_ROOT/.env"
ENV_BACKUP=/home/ubuntu/kyu-env-before-api-key-removal.bak

test -f "$ENV_FILE"
php /home/ubuntu/verify-managed-secrets.php >/dev/null

install -m 600 "$ENV_FILE" "$ENV_BACKUP"

if grep -q '^NVIDIA_API_KEY=' "$ENV_FILE"; then
  sed -i 's#^NVIDIA_API_KEY=.*#NVIDIA_API_KEY=#' "$ENV_FILE"
fi

cd "$BACKEND_ROOT"
php artisan config:clear
php artisan config:cache
sudo systemctl restart kyu-queue kyu-scheduler php8.5-fpm

php /home/ubuntu/verify-managed-secrets.php >/dev/null
echo MANAGED_SECRETS_FINALIZED
