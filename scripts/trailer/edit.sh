#!/usr/bin/env bash
# Assembles the trailer from the recorded frames: clips -> crossfades/whips -> music + SFX -> loudness -> MP4s, GIF, thumbnail, contact sheets.
#   bash scripts/trailer/edit.sh            (needs trailer/frames/{wide,tall}/<scene>/*.png from record.ts and trailer/audio from audio.ts)
set -euo pipefail
cd "$(dirname "$0")/../.."

FF="${FFMPEG:-$(node -e "console.log(require('ffmpeg-static'))")}"
FRAMES=trailer/frames
AUDIO=trailer/audio
TMP=trailer/tmp
OUT=trailer/out
FPS=60
mkdir -p "$TMP" "$OUT"

# Scene list in cut order (ids), straight from scenes.ts so timing stays in one place.
SCENES=($(npx tsx scripts/trailer/plan.ts info | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).scenes.map(x=>x.id).join(' ')))"))

# ---------------------------------------------------------------- audio: music + SFX, then -16 LUFS
npx tsx scripts/trailer/plan.ts audio "$TMP/audio_filter.txt" "$AUDIO/sfx"
AIN=(-i "$AUDIO/music.wav")
while IFS= read -r f || [ -n "$f" ]; do AIN+=(-i "$f"); done < "$TMP/audio_filter.txt.inputs"
"$FF" -y -loglevel error "${AIN[@]}" -filter_complex_script "$TMP/audio_filter.txt" -map '[a]' -ar 48000 -ac 2 "$TMP/mix.wav"
# two-pass loudnorm: measure, then apply linearly (integrated -16 LUFS, true peak -1.5 dB)
MEAS=$("$FF" -hide_banner -nostats -i "$TMP/mix.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
read -r MI MTP MLRA MTH MOFF < <(echo "$MEAS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.input_i,j.input_tp,j.input_lra,j.input_thresh,j.target_offset)})")
"$FF" -y -loglevel error -i "$TMP/mix.wav" -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTH:offset=$MOFF:linear=true,aresample=48000,aformat=channel_layouts=stereo" "$TMP/audio_final.wav"

# ---------------------------------------------------------------- video, once per layout
npx tsx scripts/trailer/plan.ts video "$TMP/video_filter.txt"
build() { # build <layout> <output name>
  local L="$1" NAME="$2"
  local VIN=()
  for s in "${SCENES[@]}"; do
    "$FF" -y -loglevel error -framerate "$FPS" -i "$FRAMES/$L/$s/%05d.png" -c:v libx264 -preset fast -crf 10 -pix_fmt yuv420p -r "$FPS" "$TMP/$L-$s.mp4"
    VIN+=(-i "$TMP/$L-$s.mp4")
  done
  "$FF" -y -loglevel error "${VIN[@]}" -i "$TMP/audio_final.wav" -filter_complex_script "$TMP/video_filter.txt" \
    -map '[v]' -map "${#SCENES[@]}:a" -c:v libx264 -preset slow -crf 18 -maxrate 14M -bufsize 28M -pix_fmt yuv420p -r "$FPS" \
    -c:a aac -b:a 192k -movflags +faststart -t 30 "$OUT/$NAME"
}
[ -d "$FRAMES/wide" ] && build wide trailer_16x9.mp4
[ -d "$FRAMES/tall" ] && build tall trailer_9x16.mp4

# ---------------------------------------------------------------- GIF: first 8 s of the 16:9 cut, 720 px wide, under 8 MB
if [ -f "$OUT/trailer_16x9.mp4" ]; then
  for cfg in "15 160" "12 128" "10 96" "8 64"; do
    set -- $cfg
    "$FF" -y -loglevel error -t 8 -i "$OUT/trailer_16x9.mp4" -an \
      -vf "fps=$1,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=$2:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 "$OUT/trailer_loop.gif"
    SIZE=$(stat -f%z "$OUT/trailer_loop.gif" 2>/dev/null || stat -c%s "$OUT/trailer_loop.gif")
    echo "gif fps=$1 colors=$2 -> $SIZE bytes"
    [ "$SIZE" -lt 7800000 ] && break
  done
fi

# ---------------------------------------------------------------- thumbnail (1920x1080) from the dedicated still scene
if [ -f "$FRAMES/wide/thumb/00050.png" ]; then
  cp "$FRAMES/wide/thumb/00050.png" "$OUT/thumbnail.png"
fi

# ---------------------------------------------------------------- contact sheets: one frame per second
for pair in "trailer_16x9.mp4 contact_sheet.png 6x5 480" "trailer_9x16.mp4 contact_sheet_9x16.png 10x3 216"; do
  set -- $pair
  [ -f "$OUT/$1" ] && "$FF" -y -loglevel error -i "$OUT/$1" -vf "fps=1,scale=$4:-1,tile=$3" -frames:v 1 "$OUT/$2"
done
echo "done -> $OUT"
