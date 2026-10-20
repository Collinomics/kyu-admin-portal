#!/usr/bin/env bash
set -euo pipefail

BACKEND_ROOT=/var/www/kyu-portal/backend
ENV_FILE="$BACKEND_ROOT/.env"
SECRET_ID="${1:-}"
ENV_BACKUP=/home/ubuntu/kyu-env-before-managed-secrets.bak

test -f "$ENV_FILE"
case "$SECRET_ID" in
  arn:aws:secretsmanager:us-east-1:*:secret:*) ;;
  *) echo 'A complete us-east-1 Secrets Manager ARN is required.' >&2; exit 1 ;;
esac

install -m 600 "$ENV_FILE" "$ENV_BACKUP"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

upsert_env AWS_SECRETS_MANAGER_ENABLED true
upsert_env AWS_SECRETS_MANAGER_REGION us-east-1
upsert_env AWS_SECRETS_MANAGER_PROFILE ''
upsert_env AWS_SECRETS_MANAGER_CACHE_SECONDS 300
upsert_env AWS_SECRET_NVIDIA_API_KEY_ID "$SECRET_ID"

echo AWS_MANAGED_SECRETS_CONFIGURED
