#!/usr/bin/env bash
#
# One-command deploy to the LIVE site (vincent.fraillon.com).
#
# The live Cloudflare Pages project `welcome-hub` lives in the PERSONAL CF
# account (a different account than the wrangler CLI's default q4o login), and
# it is a direct-upload project — so `git push` does NOT deploy it. This script
# builds and uploads with a scoped Pages token read from .deploy.env.
#
# One-time setup — create .deploy.env (gitignored) in the repo root:
#   CLOUDFLARE_API_TOKEN=<scoped "Account · Cloudflare Pages · Edit" token>
#   CLOUDFLARE_ACCOUNT_ID=e895da33f6beb3b63d4f2b64d126fe67
#
# Then just:  npm run deploy
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .deploy.env ]]; then
  echo "❌ .deploy.env not found. Create it in the repo root with:" >&2
  echo "   CLOUDFLARE_API_TOKEN=<your scoped Pages:Edit token>" >&2
  echo "   CLOUDFLARE_ACCOUNT_ID=e895da33f6beb3b63d4f2b64d126fe67" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .deploy.env
set +a

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in .deploy.env}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID in .deploy.env}"

echo "▶ Building…"
npm run build

echo "▶ Deploying to welcome-hub (personal account)…"
npx wrangler pages deploy dist \
  --project-name welcome-hub \
  --branch main \
  --commit-dirty=true

echo "✅ Deployed. Live at https://vincent.fraillon.com/"
