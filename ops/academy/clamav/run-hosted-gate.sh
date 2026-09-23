#!/usr/bin/env bash
# This script is executed by GitHub-hosted CI only. No local Docker use.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo 'ClamAV integration gate requires an isolated GitHub-hosted runner.' >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
clam_image="$(node -e 'process.stdout.write(require(process.argv[1]).image)' "$repo_dir/ops/academy/clamav/image-lock.json")"
clam_volume="academy-clamav-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
clam_container="academy-clamav-gate"
clam_updater="academy-clamav-update"
clam_work="$(mktemp -d "${RUNNER_TEMP}/academy-clamav.XXXXXX")"
mkdir "$clam_work/scan-tmp"
# Disposable synthetic input only; arbitrary container UIDs can write the scratch mount.
chmod 0777 "$clam_work/scan-tmp"
cp "$repo_dir/ops/academy/clamav/clamd.conf" "$clam_work/clamd.conf"
# Initial signature refresh happens before the daemon exists.
sed '/^NotifyClamd /d' "$repo_dir/ops/academy/clamav/freshclam.conf" > "$clam_work/freshclam.conf"
cleanup() {
  docker logs "$clam_container" 2>/dev/null || true
  docker rm -f "$clam_container" >/dev/null 2>&1 || true
  docker rm -f "$clam_updater" >/dev/null 2>&1 || true
  docker volume rm "$clam_volume" >/dev/null 2>&1 || true
  rm -rf "$clam_work"
}
trap cleanup EXIT

docker pull "$clam_image"
docker volume create "$clam_volume" >/dev/null
# The full image seeds the new volume with bundled signatures; FreshClam applies updates.
# FreshClam failure must fail this gate, never accept old or unavailable definitions silently.
docker run --detach --name "$clam_updater" --memory=3g --memory-swap=3g --cpus=2 --pids-limit=64 \
  --mount "type=volume,source=$clam_volume,target=/var/lib/clamav" \
  --mount "type=bind,source=$clam_work/freshclam.conf,target=/etc/clamav/freshclam.conf,readonly" \
  --entrypoint /bin/sh "$clam_image" -c \
  'freshclam --foreground --stdout --config-file=/etc/clamav/freshclam.conf; result=$?; printf "%s\n" "$result" >/tmp/academy-update-status; while [ ! -e /tmp/academy-gate-release ]; do sleep 1; done; exit "$result"' >/dev/null
# Hold the updater cgroup after freshclam exits so memory.peak survives long
# enough to measure its complete run. The shell does no update or scan work.
updater_done=0
for ((attempt=0; attempt<600; attempt++)); do
  if docker exec "$clam_updater" test -f /tmp/academy-update-status 2>/dev/null; then updater_done=1; break; fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$clam_updater")" != true ]]; then break; fi
  sleep 1
done
if [[ "$updater_done" != 1 ]]; then echo 'FreshClam did not finish within 600 seconds.' >&2; exit 1; fi
node "$repo_dir/ops/academy/clamav/cgroup-metrics.mjs" "$clam_updater" update
docker exec "$clam_updater" touch /tmp/academy-gate-release
updater_exit="$(docker wait "$clam_updater")"
if [[ "$updater_exit" != 0 ]]; then echo 'FreshClam database update failed.' >&2; exit 1; fi
docker rm "$clam_updater" >/dev/null

start_daemon() {
  docker run --detach --name "$clam_container" --memory=4g --memory-swap=4g --cpus=2 --pids-limit=128 \
    --security-opt=no-new-privileges --cap-drop=ALL --read-only --user=clamav \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=volume,source=$clam_volume,target=/var/lib/clamav,readonly" \
    --mount "type=bind,source=$clam_work/scan-tmp,target=/scan-tmp" \
    --mount "type=bind,source=$clam_work/clamd.conf,target=/etc/clamav/clamd.conf,readonly" \
    --publish 127.0.0.1:13310:3310 --env TZ=Etc/UTC \
    --entrypoint clamd "$clam_image" --foreground --config-file=/etc/clamav/clamd.conf >/dev/null
  (cd "$repo_dir/COMPASS" && npx --no-install tsx scripts/test-academy-clamav.ts ready)
}
start_daemon
(cd "$repo_dir/COMPASS" && npx --no-install tsx scripts/test-academy-clamav.ts baseline)
node "$repo_dir/ops/academy/clamav/cgroup-metrics.mjs" "$clam_container" baseline
docker logs "$clam_container"
docker rm -f "$clam_container" >/dev/null

# The same production settings must reject both a scan-size limit and a transport-size limit.
sed -i -e 's/^MaxFileSize .*/MaxFileSize 1024/' -e 's/^StreamMaxLength .*/StreamMaxLength 4096/' "$clam_work/clamd.conf"
start_daemon
(cd "$repo_dir/COMPASS" && npx --no-install tsx scripts/test-academy-clamav.ts limits)
node "$repo_dir/ops/academy/clamav/cgroup-metrics.mjs" "$clam_container" limits
printf '%s\n' 'ClamAV: fresh database; clean/EICAR/encrypted/1 GiB/scan-limit/stream-limit checks passed.' >> "$GITHUB_STEP_SUMMARY"
