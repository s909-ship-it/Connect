#!/usr/bin/env bash
# Copies the secret settings from .env.local to the Railway service, without printing them.
# Each value is piped to the Railway CLI on stdin, so it never appears on screen or in the process list.
# A fresh SESSION_SECRET is made for production instead of reusing the development one.
# Run from the project folder after `railway login` and `railway link`:  bash scripts/railway-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SERVICE="${SERVICE:-connect}"
KEYS=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET GEMINI_API_KEY GEMINI_MODEL GEMINI_FALLBACK_MODEL
      VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY CLOUDFLARE_TURN_KEY_ID CLOUDFLARE_TURN_API_TOKEN METERED_DOMAIN METERED_API_KEY
      TURN_URLS TURN_USERNAME TURN_CREDENTIAL SMTP_URL RESEND_API_KEY MAIL_FROM CONTACT_EMAIL)

[ -f .env.local ] || { echo "No .env.local here."; exit 1; }
value() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- || true; }

set_secret() { printf '%s' "$2" | railway variable set "$1" --stdin --service "$SERVICE" --skip-deploys >/dev/null; echo "  set $1"; }

echo "Copying secrets to Railway service '$SERVICE'..."
for k in "${KEYS[@]}"; do
  v="$(value "$k")"
  if [ -n "$v" ]; then set_secret "$k" "$v"; else echo "  skip $k (empty)"; fi
done
set_secret SESSION_SECRET "$(openssl rand -hex 32)"
echo "Done. Nothing was deployed yet."
