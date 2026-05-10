#!/usr/bin/env bash
#
# scripts/dev-certs.sh — generate self-signed certs so the cycle-1.1b nginx
# HTTPS config can be exercised on a developer's laptop or a staging box
# without real DNS / Let's Encrypt.
#
# Output: ./nginx/dev-ssl/<domain>/{fullchain.pem,privkey.pem}
#
# These certs WILL trigger a browser warning. That's the point — they are
# loud about not being trustworthy. Real prod certs come from certbot, see
# docs/RUNBOOK.md.
#
# Run from repo root:
#   ./scripts/dev-certs.sh

set -euo pipefail

DOMAINS=(
  exam.yourschool.edu
  console.yourschool.edu
  api.yourschool.edu
  platform.secureexam.app
)

OUT_ROOT="$(dirname "$0")/../nginx/dev-ssl"
mkdir -p "$OUT_ROOT"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found; install it (apt-get install openssl / brew install openssl)" >&2
  exit 1
fi

for domain in "${DOMAINS[@]}"; do
  out_dir="$OUT_ROOT/$domain"
  mkdir -p "$out_dir"
  if [[ -f "$out_dir/fullchain.pem" && -f "$out_dir/privkey.pem" ]]; then
    echo "[skip] $domain — certs already present at $out_dir"
    continue
  fi

  echo "[gen]  $domain"
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "$out_dir/privkey.pem" \
    -out "$out_dir/fullchain.pem" \
    -subj "/CN=$domain" \
    -addext "subjectAltName=DNS:$domain" \
    >/dev/null 2>&1

  chmod 600 "$out_dir/privkey.pem"
  chmod 644 "$out_dir/fullchain.pem"
done

echo
echo "Done. Add these to /etc/hosts (or your equivalent) for local dev:"
for d in "${DOMAINS[@]}"; do
  echo "  127.0.0.1  $d"
done
