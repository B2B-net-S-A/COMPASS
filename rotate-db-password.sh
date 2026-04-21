#!/bin/bash
#
# Po zmianie hasła bazy w Supabase Dashboard, uruchom:
#   bash rotate-db-password.sh NOWE_HASLO
#

if [ -z "$1" ]; then
  echo "Uzycie: bash rotate-db-password.sh <NOWE_HASLO>"
  echo ""
  echo "Najpierw zmien haslo w Supabase Dashboard:"
  echo "  https://supabase.com/dashboard/project/txzflesacqvlyhxwfjxk/settings/database"
  exit 1
fi

NEW_PASS="$1"
DB_HOST="db.txzflesacqvlyhxwfjxk.supabase.co"
NEW_URL="postgresql://postgres:${NEW_PASS}@${DB_HOST}:5432/postgres?sslmode=no-verify"

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

update_env() {
  local file="$1"
  if [ -f "$file" ]; then
    if grep -q "^DATABASE_URL=" "$file"; then
      sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_URL}|" "$file"
      rm -f "${file}.bak"
      echo "  Zaktualizowano: $file"
    else
      echo "DATABASE_URL=${NEW_URL}" >> "$file"
      echo "  Dodano do: $file"
    fi
  fi
}

echo "=== Aktualizacja DATABASE_URL ==="
update_env "$BASE_DIR/APK-COMPASS/.env.local"
update_env "$BASE_DIR/compass-umowa-konsultant/.env.local"

echo ""
echo "=== Aktualizacja Render env vars ==="

RENDER_API_KEY=""
if [ -f "$BASE_DIR/APK-COMPASS/.env.local" ]; then
  RENDER_API_KEY=$(grep "^RENDER_API_KEY=" "$BASE_DIR/APK-COMPASS/.env.local" | cut -d= -f2)
fi

if [ -z "$RENDER_API_KEY" ]; then
  echo "  RENDER_API_KEY nie znaleziony - pominam Render"
else
  for SVC_ID in "srv-d6cnncnpm1nc739b0e00" "srv-d6guq1lm5p6s73bapcag"; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      "https://api.render.com/v1/services/$SVC_ID/env-vars/DATABASE_URL" \
      -H "Accept: application/json" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -d "{\"value\": \"$NEW_URL\"}")
    echo "  Render $SVC_ID: HTTP $HTTP_CODE"
  done
fi

echo ""
echo "=== Weryfikacja polaczenia ==="
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: '$NEW_URL', ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query('SELECT 1'))
  .then(() => { console.log('  Polaczenie OK'); c.end(); })
  .catch(e => { console.error('  BLAD:', e.message); process.exit(1); });
" 2>&1

echo ""
echo "Gotowe! Pamietaj o ponownym wdrozeniu na Render (push do main lub scripts/render-deploy.sh)"
