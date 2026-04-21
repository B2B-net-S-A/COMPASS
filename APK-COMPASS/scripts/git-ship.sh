#!/usr/bin/env bash
# Commit i push zmian z katalogu ak-qualrix (uruchamiaj z ak-qualrix: npm run ship [opis commita])
set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

git add ak-qualrix/
if git diff --staged --quiet; then
  echo "Brak zmian do commita w ak-qualrix."
  exit 0
fi

MSG="${1:-chore(ak-qualrix): update}"
git commit -m "$MSG"
git push
echo "Wypchnięto na origin."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/render-deploy.sh" ]; then
    echo ""
    "$SCRIPT_DIR/render-deploy.sh" "$2"
fi
