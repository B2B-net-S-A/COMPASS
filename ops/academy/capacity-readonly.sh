#!/bin/sh
# Fixed read-only probe, streamed over SSH. No arguments, sudo, Docker, env or logs.
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
if command -v flock >/dev/null 2>&1; then printf 'flockAvailable=1\n'; else printf 'flockAvailable=0\n'; fi
if command -v systemctl >/dev/null 2>&1; then printf 'systemdAvailable=1\n'; else printf 'systemdAvailable=0\n'; fi
