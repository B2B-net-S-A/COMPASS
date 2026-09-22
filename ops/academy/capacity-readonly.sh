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
