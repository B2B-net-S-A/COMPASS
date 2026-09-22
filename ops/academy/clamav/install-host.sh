#!/usr/bin/env bash
# Installs files only. Never starts/enables containers, workers or timers.
set -euo pipefail
umask 077
if [[ "$(uname -s)" != Linux || "$(id -u)" != 0 || "$#" != 0 ]]; then
  echo '{"ok":false,"error":"linux_host_root_required"}' >&2; exit 1
fi
for required in node flock timeout docker systemctl install stat; do
  if ! command -v "$required" >/dev/null; then echo "missing prerequisite: $required" >&2; exit 1; fi
done
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)' || { echo 'Node.js >=20 required; no automatic upgrade' >&2; exit 1; }
docker --host unix:///var/run/docker.sock compose version --short | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(!/^v?2\./.test(s.trim()))process.exit(1)})'
control_dir=/var/lib/compass-academy-control
if [[ ! -e "$control_dir" && ! -L "$control_dir" ]]; then install -d -o 0 -g 0 -m 0700 "$control_dir"; fi
if [[ -L "$control_dir" || ! -d "$control_dir" || "$(stat -c '%u:%a' "$control_dir")" != 0:700 ]]; then
  echo '{"ok":false,"error":"unsafe_control_directory"}' >&2; exit 1
fi
for lock_name in control materials sync; do
  if [[ -L "$control_dir/$lock_name.lock" ]]; then echo 'unsafe lock path' >&2; exit 1; fi
done
# Prevent replacement while a controller/worker is running; preserve all state.
exec 9>"$control_dir/control.lock"; flock --exclusive --nonblock 9
exec 8>"$control_dir/materials.lock"; flock --exclusive --nonblock 8
exec 7>"$control_dir/sync.lock"; flock --exclusive --nonblock 7
installer_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$installer_dir/install-host.mjs"
