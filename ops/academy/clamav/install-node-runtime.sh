#!/usr/bin/env bash
# Installs only the pinned Academy runtime. No network, package manager or Docker.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
unset TAR_OPTIONS GZIP NODE_OPTIONS NODE_PATH CDPATH
readonly required_uid=0 required_gid=0
readonly version=v22.23.0 distribution=node-v22.23.0-linux-arm64
readonly archive_bytes=56748954
# https://nodejs.org/dist/v22.23.0/SHASUMS256.txt, independently matched to the
# official release page and the downloaded archive on 2026-09-22.
readonly archive_sha=0c96aa074abd109e0b5da8d10202a9bbcea9bcf9ddb587b20944f71b8f21f8c8
readonly node_sha=def9c87b46712844ffeb3435dde14f5d0bed3d10723ea305e4355203b5e043a0
readonly license_sha=c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4
readonly target=/opt/compass-academy-node
readonly staged=/opt/compass-academy-node-v22.23.0-linux-arm64.tar.gz
readonly lock_file=/opt/.compass-academy-node-install.lock
work=''
die() { printf '{"ok":false,"error":"%s"}\n' "$1" >&2; exit 1; }
cleanup() {
  if [[ "$work" == /opt/.compass-academy-node-install.* && -d "$work" && ! -L "$work" ]]; then
    rm -rf -- "$work"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
safe_directory() {
  local uid gid mode
  [[ -d "$1" && ! -L "$1" ]] || die unsafe_runtime_directory
  IFS=: read -r uid gid mode < <(stat -c '%u:%g:%a' -- "$1")
  [[ "$uid" == "$required_uid" && "$gid" == "$required_gid" && "$mode" =~ ^[0-7]{3,4}$ ]] || die unsafe_runtime_directory
  (( (8#$mode & 0022) == 0 )) || die unsafe_runtime_directory
}
safe_file() {
  local uid gid mode links
  [[ -f "$1" && ! -L "$1" ]] || die unsafe_runtime_file
  IFS=: read -r uid gid mode links < <(stat -c '%u:%g:%a:%h' -- "$1")
  [[ "$uid" == "$required_uid" && "$gid" == "$required_gid" && "$mode" == "$2" && "$links" == 1 ]] || die unsafe_runtime_file
}
check_sha() {
  local actual
  actual="$(sha256sum -- "$1")" || die checksum_read_failed
  [[ "${actual%% *}" == "$2" ]] || die runtime_checksum_mismatch
}
manifest() {
  printf 'version=%s\narchitecture=linux-arm64\narchive_sha256=%s\nnode_sha256=%s\nlicense_sha256=%s\n' "$version" "$archive_sha" "$node_sha" "$license_sha"
}
verify_runtime() {
  safe_directory "$1"; safe_directory "$1/bin"
  [[ "$(stat -c '%a' -- "$1")" == 555 && "$(stat -c '%a' -- "$1/bin")" == 555 ]] || die existing_runtime_not_immutable
  safe_file "$1/bin/node" 555; safe_file "$1/LICENSE" 444; safe_file "$1/installed-runtime.txt" 444
  check_sha "$1/bin/node" "$node_sha"; check_sha "$1/LICENSE" "$license_sha"
  cmp -s "$1/installed-runtime.txt" <(manifest) || die existing_runtime_manifest_mismatch
  [[ "$(find "$1" -mindepth 1 -print | wc -l)" -eq 4 ]] || die existing_runtime_unexpected_files
  [[ "$(env -i PATH=/usr/bin:/bin "$1/bin/node" --version 2>/dev/null)" == "$version" ]] || die runtime_version_check_failed
}

[[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 && "$(id -u)" == "$required_uid" ]] || die linux_arm64_root_required
[[ "$#" == 1 && ( "$1" == '-' || "$1" == "$staged" ) ]] || die fixed_archive_input_required
for required in stat sha256sum tar gzip head mktemp flock cmp env find wc mv chmod chown mkdir rm; do
  command -v "$required" >/dev/null || die runtime_prerequisite_missing
done
safe_directory /; safe_directory /opt
if [[ -e "$lock_file" || -L "$lock_file" ]]; then safe_file "$lock_file" 600; fi
exec 9>"$lock_file"
safe_file "$lock_file" 600
flock --exclusive --nonblock 9 || die runtime_install_busy
work="$(mktemp -d /opt/.compass-academy-node-install.XXXXXXXX)" || die runtime_staging_failed
safe_directory "$work"
readonly archive="$work/archive.tar.gz"
# Read at most the pinned length plus one, including for stdin. A damaged or
# oversized upload cannot exhaust the host disk or become a partial install.
if [[ "$1" == '-' ]]; then
  head -c "$((archive_bytes + 1))" > "$archive"
else
  safe_file "$staged" 600
  head -c "$((archive_bytes + 1))" -- "$staged" > "$archive"
fi
[[ "$(stat -c '%s' -- "$archive")" == "$archive_bytes" ]] || die runtime_archive_size_mismatch
check_sha "$archive" "$archive_sha"
if [[ -e "$target" || -L "$target" ]]; then
  # Verify before executing; never overwrite an unknown, altered or other version.
  verify_runtime "$target"
  printf '{"ok":true,"version":"%s","architecture":"arm64","installed":false}\n' "$version"
  exit 0
fi
mkdir -m 0700 "$work/runtime"
# Exact members only: npm/corepack and all other archive files are not installed.
tar -xzf "$archive" --directory "$work/runtime" --strip-components=1 --no-same-owner --no-same-permissions -- "$distribution/bin/node" "$distribution/LICENSE" || die runtime_extract_failed
[[ -f "$work/runtime/bin/node" && ! -L "$work/runtime/bin/node" && -f "$work/runtime/LICENSE" && ! -L "$work/runtime/LICENSE" ]] || die unsafe_archive_members
check_sha "$work/runtime/bin/node" "$node_sha"; check_sha "$work/runtime/LICENSE" "$license_sha"
manifest > "$work/runtime/installed-runtime.txt"
chown -R "$required_uid:$required_gid" "$work/runtime"
chmod 0555 "$work/runtime" "$work/runtime/bin" "$work/runtime/bin/node"
chmod 0444 "$work/runtime/LICENSE" "$work/runtime/installed-runtime.txt"
verify_runtime "$work/runtime"
[[ ! -e "$target" && ! -L "$target" ]] || die runtime_target_appeared
# Same-filesystem rename while holding the installation lock. GNU -T prevents
# an unexpected destination directory from turning this into a nested install.
mv -T -- "$work/runtime" "$target" || die runtime_publish_failed
printf '{"ok":true,"version":"%s","architecture":"arm64","installed":true}\n' "$version"
