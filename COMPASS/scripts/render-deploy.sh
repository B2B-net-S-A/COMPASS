#!/usr/bin/env bash
# Trigger Render deploy with optional cache clear
# Usage: ./scripts/render-deploy.sh [--clear-cache]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env.local"

if [ -f "$ENV_FILE" ]; then
    RENDER_API_KEY="${RENDER_API_KEY:-$(grep -s '^RENDER_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)}"
    RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-$(grep -s '^RENDER_SERVICE_ID=' "$ENV_FILE" | cut -d'=' -f2-)}"
fi

if [ -z "$RENDER_API_KEY" ] || [ -z "$RENDER_SERVICE_ID" ]; then
    echo "❌ Brak RENDER_API_KEY lub RENDER_SERVICE_ID."
    echo "   Ustaw w .env.local lub jako zmienne srodowiskowe."
    echo "   RENDER_API_KEY — z Render Dashboard > Account Settings > API Keys"
    echo "   RENDER_SERVICE_ID — z Render Dashboard > Service > Settings (srv-xxxxx)"
    exit 1
fi

CLEAR_CACHE="do_not_clear"
if [ "$1" = "--clear-cache" ]; then
    CLEAR_CACHE="clear"
    echo "🔄 Deploy z czyszczeniem cache..."
else
    echo "🚀 Deploy bez czyszczenia cache..."
fi

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -d "{\"clearCache\": \"${CLEAR_CACHE}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "202" ]; then
    DEPLOY_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$DEPLOY_ID" ]; then
        echo "✅ Deploy uruchomiony! ID: $DEPLOY_ID"
        echo "   https://dashboard.render.com/web/${RENDER_SERVICE_ID}/deploys/${DEPLOY_ID}"
    else
        echo "✅ Deploy przyjety (HTTP $HTTP_CODE). Sprawdz status na Render Dashboard."
    fi
else
    echo "❌ Blad deployu (HTTP $HTTP_CODE):"
    echo "$BODY"
    exit 1
fi
