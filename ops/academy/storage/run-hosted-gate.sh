#!/usr/bin/env bash
set -euo pipefail
# All Docker / Supabase service operations in this file are restricted to hosted CI.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  printf '%s\n' 'This gate runs only on a GitHub-hosted Linux runner.' >&2
  exit 2
fi
mode="${1:-}"
if [[ "$mode" != academy-fixture && "$mode" != historical-replay ]]; then exit 2; fi
repo_dir="$(cd "$(dirname "$0")/../../.." && pwd)"
gate_work="$(mktemp -d "$RUNNER_TEMP/academy-storage-XXXXXX")"
chmod 700 "$gate_work"
mkdir -p "$gate_work/bin" "$gate_work/supabase/migrations"
cp "$repo_dir/ops/academy/storage/config.toml" "$gate_work/supabase/config.toml"
cli_version=2.117.0
curl --fail --silent --show-error --location --max-time 120 \
 "https://github.com/supabase/cli/releases/download/v$cli_version/supabase_${cli_version}_linux_amd64.tar.gz" -o "$gate_work/cli.tar.gz"
printf '%s  %s\n' '69c05f85b9e47ee706d30f1a6ca8a526b4e337bfd12c7ef1ef522d24e7280d24' "$gate_work/cli.tar.gz" | sha256sum --check --status
tar -xzf "$gate_work/cli.tar.gz" -C "$gate_work/bin" supabase
cli="$gate_work/bin/supabase"
cleanup() {
  "$cli" stop --workdir "$gate_work" --no-backup >"$gate_work/stop.log" 2>&1 || true
  rm -rf "$gate_work"
}
trap cleanup EXIT
excluded='realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
if [[ "$mode" == historical-replay ]]; then
  cp "$repo_dir"/COMPASS/supabase/migrations/*.sql "$gate_work/supabase/migrations/"
fi
# Start/status output can include disposable API keys. Keep it in private temp files;
# report only a sanitized failure category and migration filename, never raw logs.
set +e
timeout 900 "$cli" start --agent no --output-format text --yes --workdir "$gate_work" --exclude "$excluded" >"$gate_work/start.log" 2>&1
start_status=$?
set -e
node "$repo_dir/ops/academy/storage/report-start.mjs" "$mode" "$start_status" "$gate_work/start.log" "$gate_work/supabase/migrations"
if [[ "$start_status" != 0 ]]; then exit "$start_status"; fi
if [[ "$mode" == historical-replay ]]; then exit 0; fi
"$cli" status --workdir "$gate_work" -o json >"$gate_work/status.json" 2>"$gate_work/status.log"
chmod 600 "$gate_work/status.json"
cd "$repo_dir/COMPASS"
ACADEMY_STORAGE_STATUS_FILE="$gate_work/status.json" npx --no-install tsx scripts/test-academy-storage.mjs
