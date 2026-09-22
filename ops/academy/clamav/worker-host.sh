#!/usr/bin/env bash
# Host-only scheduler entrypoint. No secrets in the host environment or argv.
set -euo pipefail
umask 077
if [[ "$(uname -s)" != Linux || "$(id -u)" != 0 || "$#" != 1 ]]; then
  echo '{"ok":false,"error":"linux_host_root_required"}' >&2; exit 1
fi
case "$1" in materials) request_timeout=330 ;; sync) request_timeout=210 ;; *) exit 1 ;; esac
worker="$1"
control_dir=/var/lib/compass-academy-control
if [[ ! -d "$control_dir" || -L "$control_dir" || "$(stat -c '%u:%a' "$control_dir")" != 0:700 || -L "$control_dir/$worker.lock" || -L "$control_dir/control.lock" ]]; then
  echo '{"ok":false,"error":"unsafe_control_directory"}' >&2; exit 1
fi
exec 8>"$control_dir/$worker.lock"
if ! flock --exclusive --nonblock 8; then
  echo '{"ok":true,"deferred":true,"reason":"worker_busy"}'; exit 0
fi
if [[ "$worker" == materials ]]; then
  # Hold the maintenance lock until the bounded HTTP request finishes.
  exec 9>"$control_dir/control.lock"
  if ! flock --shared --nonblock 9; then
    echo '{"ok":true,"deferred":true,"reason":"maintenance_busy"}'; exit 0
  fi
  if [[ -e "$control_dir/pause.json" || -L "$control_dir/pause.json" ]]; then
    echo '{"ok":true,"deferred":true,"reason":"scanner_paused"}'; exit 0
  fi
fi
# Docker exec inherits CRON_SECRET from the existing container configuration;
# stdin contains code only. Suppress Docker stderr, which is not our log contract.
if ! timeout --signal=TERM --kill-after=10 "$request_timeout" \
  docker --host unix:///var/run/docker.sock exec --interactive compass-app \
  node --input-type=module - "$worker" < /opt/compass-academy/worker-request.mjs 2>/dev/null; then
  echo '{"ok":false,"error":"academy_worker_failed"}' >&2; exit 1
fi
