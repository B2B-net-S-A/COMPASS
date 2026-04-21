#!/usr/bin/env bash
# Automatyczna synchronizacja z GitHub: pull (merge) + push.
# Nie używa rebase ani vim – bezpieczne dla codziennego użycia.
# Uruchom z katalogu projektu: ./scripts/git-sync-push.sh

set -e
cd "$(dirname "$0")/.."

export GIT_EDITOR=true
export GIT_TERMINAL_PROMPT=1

echo "=== Git sync & push ==="
echo ""

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo "Masz niezapisane zmiany w commitach."
  read -r -p "Schować je na chwilę (stash), żeby zrobić pull? [y/N] " answer
  if [[ "$answer" =~ ^[yY] ]]; then
    git stash push -m "auto-stash przed sync $(date +%Y%m%d-%H%M)"
    echo "Zmiany schowane. Po pushu odzyskasz je: git stash pop"
    echo ""
  else
    echo "Bez stashu. Pull może się nie udać przy konfliktach."
    echo ""
  fi
fi

echo "Pobieram zmiany z GitHub (merge, bez rebase)..."
git pull origin main --no-rebase || true

echo ""
echo "Wysyłam zmiany na GitHub..."
git push origin main

echo ""
echo "Gotowe."
