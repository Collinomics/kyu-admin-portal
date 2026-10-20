#!/usr/bin/env bash
set -euo pipefail

TOKEN="$(curl --fail --silent --show-error --request PUT \
  --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
  http://169.254.169.254/latest/api/token)"
ROLE="$(curl --fail --silent --show-error \
  --header "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/)"

if [ -z "$ROLE" ]; then
  echo NO_INSTANCE_ROLE
  exit 1
fi

printf 'INSTANCE_ROLE=%s\n' "$ROLE"
