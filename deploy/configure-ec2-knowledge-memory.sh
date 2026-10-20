#!/usr/bin/env bash
set -euo pipefail

SWAP_FILE=/swapfile-kyu-knowledge
SWAP_SIZE=2G
FSTAB_LINE="$SWAP_FILE none swap sw 0 0"

available_kb="$(df --output=avail -k / | tail -1 | tr -d ' ')"
if [ ! -f "$SWAP_FILE" ]; then
  if [ "$available_kb" -lt 3145728 ]; then
    echo 'At least 3 GB of free disk space is required before adding protected knowledge-processing swap.' >&2
    exit 1
  fi
  sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE" >/dev/null
fi

if ! swapon --show=NAME --noheadings | grep -Fxq "$SWAP_FILE"; then
  sudo swapon "$SWAP_FILE"
fi

if ! grep -Fqx "$FSTAB_LINE" /etc/fstab; then
  printf '%s\n' "$FSTAB_LINE" | sudo tee -a /etc/fstab >/dev/null
fi

echo KNOWLEDGE_SWAP_CONFIGURED
