#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/var/www/kyu-portal
BACKEND_ROOT="$APP_ROOT/backend"
PATCH_ARCHIVE=/home/ubuntu/kyu-otp-patch.tgz
ENV_FILE="$BACKEND_ROOT/.env"

test -f "$PATCH_ARCHIVE"
test -f "$ENV_FILE"

tar -xzf "$PATCH_ARCHIVE" -C "$APP_ROOT"

if grep -q '^PCS_SHOW_DEVELOPMENT_OTP=' "$ENV_FILE"; then
  sed -i 's/^PCS_SHOW_DEVELOPMENT_OTP=.*/PCS_SHOW_DEVELOPMENT_OTP=true/' "$ENV_FILE"
else
  printf '\nPCS_SHOW_DEVELOPMENT_OTP=true\n' >> "$ENV_FILE"
fi

cd "$BACKEND_ROOT"
php artisan config:clear
php artisan config:cache
php -r '$app = require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); exit(config("app.expose_admin_onboarding_otp") ? 0 : 1);'
sudo systemctl reload php8.5-fpm
sudo systemctl restart kyu-queue

rm -f "$PATCH_ARCHIVE"
echo DEVELOPMENT_OTP_ENABLED
