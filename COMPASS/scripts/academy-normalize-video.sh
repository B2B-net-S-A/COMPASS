#!/usr/bin/env bash
# Normalizuje nagranie do profilu, który przyjmuje skaner Akademii:
# H.264 8-bit 4:2:0, AAC-LC, faststart, duży przeplot, plik do 1 GiB.
# Uruchamiaj wyłącznie na laptopie. Instrukcja: docs/academy/mp4-validation.md
#
#   scripts/academy-normalize-video.sh nagranie.mp4
#   scripts/academy-normalize-video.sh --part-minutes 45 nagranie.mp4
set -euo pipefail

die() { printf 'BŁĄD: %s\n' "$1" >&2; exit 1; }

# Transkodowanie zajmuje wszystkie rdzenie, a produkcja i jej build-host to jeden CAX21.
if [ -n "${COOLIFY_FQDN:-}${COOLIFY_URL:-}${COOLIFY_CONTAINER_NAME:-}" ]; then
    die 'wykryto środowisko Coolify. Normalizator działa tylko na laptopie.'
fi
case "$(hostname)" in
    compass-prod*) die 'to host produkcyjny. Normalizator działa tylko na laptopie.' ;;
esac

part_minutes=0
while [ $# -gt 0 ]; do
    case "$1" in
        --part-minutes)
            [ $# -ge 2 ] || die 'podaj liczbę minut po --part-minutes.'
            part_minutes="$2"
            shift 2
            ;;
        --) shift; break ;;
        -*) die "nieznana opcja: $1" ;;
        *) break ;;
    esac
done

[ $# -eq 1 ] || die 'podaj dokładnie jeden plik: academy-normalize-video.sh [--part-minutes N] nagranie.mp4'
input="$1"
[ -f "$input" ] || die "nie ma pliku: $input"
case "$part_minutes" in
    ''|*[!0-9]*) die '--part-minutes wymaga liczby całkowitej.' ;;
esac

command -v ffmpeg >/dev/null 2>&1 || die 'brak ffmpeg (macOS: brew install ffmpeg).'
command -v ffprobe >/dev/null 2>&1 || die 'brak ffprobe (instaluje się razem z ffmpeg).'

script_dir="$(cd "$(dirname "$0")" && pwd)"
app_dir="$(dirname "$script_dir")"
[ -x "$app_dir/node_modules/.bin/tsx" ] || die "brak zależności: uruchom npm ci w $app_dir"

[ -n "$(ffprobe -v error -select_streams v:0 -show_entries stream=index -of csv=p=0 "$input")" ] \
    || die 'plik nie ma ścieżki obrazu. Nagrania audio wgrywa się jako MP3 lub M4A.'

input_dir="$(cd "$(dirname "$input")" && pwd)"
input_name="$(basename "$input")"
stem="${input_name%.*}"

temp_file=''
cleanup() { if [ -n "$temp_file" ]; then rm -f "$temp_file"; fi; }
trap cleanup EXIT

# -chunk_duration wymusza przeplot co sekundę. Domyślnie ffmpeg przeplata niemal
# każdą próbkę, a długie nagranie przekracza wtedy limit 100 tys. chunków parsera.
encode() {
    local output="$1"; shift
    temp_file="$output.tmp.mp4"
    ffmpeg -hide_banner -nostdin -loglevel error -stats -y "$@" -i "$input" \
        -map 0:v:0 -map '0:a:0?' -map_metadata -1 -map_chapters -1 -sn -dn \
        -vf "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 -maxrate 2500k -bufsize 5000k -profile:v high -level:v 4.1 -pix_fmt yuv420p \
        -c:a aac -profile:a aac_low -b:a 128k -ar 48000 -ac 2 \
        -chunk_duration 1000000 -movflags +faststart -f mp4 "$temp_file"
    # Plik dostaje docelową nazwę dopiero po przejściu walidatora skanera.
    (cd "$app_dir" && node_modules/.bin/tsx scripts/academy-validate-mp4.ts "$temp_file")
    mv "$temp_file" "$output"
    temp_file=''
    printf 'GOTOWE: %s\n' "$output"
}

target_for() { printf '%s/%s%s.normalized.mp4' "$input_dir" "$stem" "$1"; }

if [ "$part_minutes" -eq 0 ]; then
    output="$(target_for '')"
    [ ! -e "$output" ] || die "plik już istnieje, usuń go albo przenieś: $output"
    encode "$output"
else
    [ "$part_minutes" -gt 0 ] || die '--part-minutes musi być większe od zera.'
    duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$input")"
    seconds="${duration%.*}"
    case "$seconds" in
        ''|*[!0-9]*) die 'nie udało się odczytać długości nagrania.' ;;
    esac
    part_seconds=$((part_minutes * 60))
    parts=$(( (seconds + part_seconds) / part_seconds ))
    index=1
    while [ "$index" -le "$parts" ]; do
        output="$(target_for "$(printf '.part%02d' "$index")")"
        [ ! -e "$output" ] || die "plik już istnieje, usuń go albo przenieś: $output"
        encode "$output" -ss "$(( (index - 1) * part_seconds ))" -t "$part_seconds"
        index=$((index + 1))
    done
fi

printf '\nZachowaj na SharePoint oba pliki: oryginał i wersję znormalizowaną. Do Akademii wgrywasz tylko .normalized.mp4.\n'
