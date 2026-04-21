#!/usr/bin/env bash
# Push to GitHub. Uses GITHUB_TOKEN from env or from .env.github (gitignored).
# One-time setup: copy .env.github.example to .env.github and add your token.
set -e
cd "$(dirname "$0")/.."
if [ -z "$GITHUB_TOKEN" ] && [ -f .env.github ]; then
  set -a
  # shellcheck source=/dev/null
  . .env.github
  set +a
fi
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Set GITHUB_TOKEN: add it to .env.github (see .env.github.example) or run: export GITHUB_TOKEN=ghp_YourToken"
  exit 1
fi
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/biurko2015-eng/aplikacja-zbyszka.git"
git push -u origin main
git remote set-url origin "https://github.com/biurko2015-eng/aplikacja-zbyszka.git"
echo "Push done. Remote URL reset to HTTPS (token not saved)."
