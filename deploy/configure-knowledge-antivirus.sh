#!/usr/bin/env bash
set -euo pipefail

BACKEND_ROOT=/var/www/kyu-portal/backend
ENV_FILE="$BACKEND_ROOT/.env"
CLAMSCAN_BINARY=/usr/bin/clamscan
ENV_BACKUP=/home/ubuntu/kyu-env-before-knowledge-antivirus.bak

test -f "$ENV_FILE"
test -x "$CLAMSCAN_BINARY"

# Preserve the production configuration before changing the scanner setting.
install -m 600 "$ENV_FILE" "$ENV_BACKUP"

if grep -q '^KNOWLEDGE_ANTIVIRUS_BINARY=' "$ENV_FILE"; then
  sed -i "s#^KNOWLEDGE_ANTIVIRUS_BINARY=.*#KNOWLEDGE_ANTIVIRUS_BINARY=$CLAMSCAN_BINARY#" "$ENV_FILE"
else
  printf '\nKNOWLEDGE_ANTIVIRUS_BINARY=%s\n' "$CLAMSCAN_BINARY" >> "$ENV_FILE"
fi

if grep -q '^KNOWLEDGE_ANTIVIRUS_TIMEOUT=' "$ENV_FILE"; then
  sed -i 's#^KNOWLEDGE_ANTIVIRUS_TIMEOUT=.*#KNOWLEDGE_ANTIVIRUS_TIMEOUT=240#' "$ENV_FILE"
else
  printf 'KNOWLEDGE_ANTIVIRUS_TIMEOUT=240\n' >> "$ENV_FILE"
fi

echo KNOWLEDGE_ANTIVIRUS_CONFIGURED
