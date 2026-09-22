#!/usr/bin/env bash
# Explicit post-deployment activation. JSON stdin contains only the expected SHA.
set -euo pipefail
umask 077
export PATH=/opt/compass-academy-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
if [[ "$(uname -s)" != Linux || "$(id -u)" != 0 || "$#" != 0 ]]; then
  echo '{"ok":false,"error":"linux_host_root_required"}' >&2; exit 1
fi
control_dir=/var/lib/compass-academy-control
if [[ ! -d "$control_dir" || -L "$control_dir" || "$(stat -c '%u:%a' "$control_dir")" != 0:700 || -L "$control_dir/control.lock" ]]; then
  echo '{"ok":false,"error":"unsafe_control_directory"}' >&2; exit 1
fi
exec 9>"$control_dir/control.lock"
if ! flock --exclusive --wait 330 9; then
  echo '{"ok":false,"error":"maintenance_lock_timeout"}' >&2; exit 1
fi
exec node /opt/compass-academy/activate-host.mjs
