#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/var/www/kyu-portal
BACKEND_ROOT="$APP_ROOT/backend"
ARCHIVE=/home/ubuntu/kyu-update.tgz
STAGE=/home/ubuntu/kyu-release-stage
BACKUP=/home/ubuntu/kyu-before-update.tgz

test -f "$ARCHIVE"
test -f "$BACKEND_ROOT/.env"

rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
test -f "$STAGE/backend/artisan"
if [ -f "$STAGE/.ec2-dist/index.html" ]; then
  FRONTEND_STAGE="$STAGE/.ec2-dist"
else
  FRONTEND_STAGE="$STAGE/dist"
fi
test -f "$FRONTEND_STAGE/index.html"
test -f "$STAGE/deploy/kyu-queue.service"
test -f "$STAGE/deploy/kyu-scheduler.service"

# Keep one compact rollback snapshot of the currently running code and frontend.
tar -czf "$BACKUP" -C "$APP_ROOT" \
  --exclude='backend/.env' \
  --exclude='backend/vendor' \
  --exclude='backend/storage' \
  backend dist

rsync -a --delete \
  --exclude='.env' \
  --exclude='vendor/' \
  --exclude='storage/' \
  "$STAGE/backend/" "$BACKEND_ROOT/"
rsync -a --delete "$FRONTEND_STAGE/" "$APP_ROOT/dist/"

mkdir -p "$BACKEND_ROOT/bootstrap/cache" "$BACKEND_ROOT/storage/framework/cache" "$BACKEND_ROOT/storage/framework/sessions" "$BACKEND_ROOT/storage/framework/views" "$BACKEND_ROOT/storage/logs"
sudo chown -R ubuntu:www-data "$BACKEND_ROOT/storage" "$BACKEND_ROOT/bootstrap/cache"
sudo chmod -R ug+rwX "$BACKEND_ROOT/storage" "$BACKEND_ROOT/bootstrap/cache"

cd "$BACKEND_ROOT"
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader
php artisan migrate --force
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

sudo install -m 644 "$STAGE/deploy/kyu-queue.service" /etc/systemd/system/kyu-queue.service
sudo install -m 644 "$STAGE/deploy/kyu-scheduler.service" /etc/systemd/system/kyu-scheduler.service
sudo systemctl daemon-reload
sudo systemctl enable kyu-queue
sudo systemctl enable kyu-scheduler
sudo systemctl restart kyu-queue
sudo systemctl restart kyu-scheduler
sudo systemctl reload php8.5-fpm
sudo nginx -t
sudo systemctl reload nginx

rm -rf "$STAGE"
rm -f "$ARCHIVE"

curl --fail --silent --show-error --insecure https://127.0.0.1/ -H 'Host: 98.86.198.226' >/dev/null
echo DEPLOYMENT_OK
