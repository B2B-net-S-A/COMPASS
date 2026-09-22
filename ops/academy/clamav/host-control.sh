#!/usr/bin/env bash
# Installed, root-owned host entry point. Never run Docker on a workstation.
set -euo pipefail
umask 077
if [[ "$(uname -s)" != Linux || "$(id -u)" != 0 ]]; then
  echo '{"ok":false,"error":"linux_host_root_required"}' >&2
  exit 1
fi
case "${1:-}" in
  status|pause|begin-trigger|bind|terminal|resume|update) ;;
  *) echo '{"ok":false,"error":"invalid_operation"}' >&2; exit 1 ;;
esac
if [[ "$#" != 1 ]]; then exit 1; fi
controller_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A pre-provisioned private directory avoids a predictable-file/symlink race in
# the often world-writable /run/lock. Never truncate the durable pause marker.
control_dir=/var/lib/compass-academy-control
if [[ ! -d "$control_dir" || -L "$control_dir" || "$(stat -c '%u:%a' "$control_dir")" != 0:700 || -L "$control_dir/control.lock" ]]; then
  echo '{"ok":false,"error":"unsafe_control_directory"}' >&2
  exit 1
fi
exec 9>"$control_dir/control.lock"
if ! flock --exclusive --wait 330 9; then
  echo '{"ok":false,"error":"maintenance_lock_timeout"}' >&2
  exit 1
fi
exec node "$controller_dir/host-control.mjs" "$1"
