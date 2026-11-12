#!/usr/bin/env bash
# 以管理員帳號登入並把 data/questions/*.json 匯入 Supabase（呼叫 import-questions Edge Function）
# 需要 .env.local：SUPABASE_URL、SUPABASE_ANON_KEY、ADMIN_EMAIL、ADMIN_PASSWORD
set -euo pipefail
cd "$(dirname "$0")/.."
source .env.local
ADMIN_EMAIL="${ADMIN_EMAIL:-${QA_ADMIN_EMAIL:-}}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${QA_ADMIN_PASSWORD:-}}"

TOKEN=$(curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

for f in data/questions/*.json; do
  python3 -c "import json,sys; json.dump({'questions': json.load(open('$f'))}, open('/tmp/_import.json','w'), ensure_ascii=False)"
  printf '%s -> ' "$f"
  curl -sS "$SUPABASE_URL/functions/v1/import-questions" \
    -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data-binary @/tmp/_import.json
  echo
done
