#!/bin/sh
# Fixed read-only probe, streamed over SSH. Docker CLI version only; no daemon/container operations.
set -eu
LC_ALL=C
export LC_ALL
awk '/^MemTotal:/ {printf "memoryTotalKiB=%s\n",$2} /^MemAvailable:/ {printf "memoryAvailableKiB=%s\n",$2} /^SwapTotal:/ {printf "swapTotalKiB=%s\n",$2} /^SwapFree:/ {printf "swapFreeKiB=%s\n",$2}' /proc/meminfo
printf 'cpuCount=%s\n' "$(getconf _NPROCESSORS_ONLN)"
awk '{printf "loadAverage1=%s\n",$1}' /proc/loadavg
# The existing Coolify state path is used only to select its filesystem. Its contents are not read.
capacity_path=/
if [ -d /data/coolify ]; then capacity_path=/data/coolify; fi
df -Pk "$capacity_path" | awk 'NR==2 {printf "filesystemTotalKiB=%s\nfilesystemAvailableKiB=%s\n",$2,$4}'
# Runtime prerequisites only: no package install, service operation or container inspection.
printf 'hostUid=%s\n' "$(id -u)"
academy_node_major=0
if command -v node >/dev/null 2>&1; then
  academy_node_major=$(node --version | sed -n 's/^v\([0-9][0-9]*\)\..*/\1/p')
fi
printf 'nodeMajor=%s\n' "${academy_node_major:-0}"
academy_compose_major=0
academy_compose_minor=0
if command -v docker >/dev/null 2>&1; then
  academy_compose_version=$(docker --host unix:///var/run/docker.sock compose version --short 2>/dev/null || true)
  academy_compose_major=$(printf '%s\n' "$academy_compose_version" | sed -n 's/^v\{0,1\}\([0-9][0-9]*\)\.\([0-9][0-9]*\)\.[0-9][0-9]*\([-+].*\)\{0,1\}$/\1/p')
  academy_compose_minor=$(printf '%s\n' "$academy_compose_version" | sed -n 's/^v\{0,1\}\([0-9][0-9]*\)\.\([0-9][0-9]*\)\.[0-9][0-9]*\([-+].*\)\{0,1\}$/\2/p')
fi
printf 'composeMajor=%s\ncomposeMinor=%s\n' "${academy_compose_major:-0}" "${academy_compose_minor:-0}"
if command -v flock >/dev/null 2>&1; then printf 'flockAvailable=1\n'; else printf 'flockAvailable=0\n'; fi
if command -v systemctl >/dev/null 2>&1; then printf 'systemdAvailable=1\n'; else printf 'systemdAvailable=0\n'; fi
academy_unit_show_exit=127
if command -v systemctl >/dev/null 2>&1; then
  academy_unit_show_exit=0
  systemctl show compass-academy-materials.service --property=LoadState,ActiveState,UnitFileState >/dev/null 2>&1 || academy_unit_show_exit=$?
fi
printf 'unitShowExitCode=%s\n' "$academy_unit_show_exit"
