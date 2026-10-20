#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/var/www/kyu-portal
BACKEND_ROOT="$APP_ROOT/backend"

sudo install -m 644 /home/ubuntu/kyu-nginx.conf /etc/nginx/sites-available/kyu-portal
sudo ln -sfn /etc/nginx/sites-available/kyu-portal /etc/nginx/sites-enabled/kyu-portal
if [ -L /etc/nginx/sites-enabled/default ]; then
    sudo mv /etc/nginx/sites-enabled/default /home/ubuntu/nginx-default-site.disabled
fi

sudo install -m 644 /home/ubuntu/kyu-queue.service /etc/systemd/system/kyu-queue.service
sudo install -m 644 /home/ubuntu/kyu-scheduler.service /etc/systemd/system/kyu-scheduler.service
sudo chown -R ubuntu:www-data "$BACKEND_ROOT/storage" "$BACKEND_ROOT/bootstrap/cache"
sudo chmod -R ug+rwX "$BACKEND_ROOT/storage" "$BACKEND_ROOT/bootstrap/cache"

cd "$BACKEND_ROOT"
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now php8.5-fpm nginx kyu-queue kyu-scheduler
sudo systemctl reload nginx
