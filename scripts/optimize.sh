#!/usr/bin/env bash
# 网站素材压缩流水线
#   视频 → 720p / H.264 CRF27 / faststart(可选去音轨)
#   图片 → 等比缩到最大边 1600 / JPEG q82(或 PNG 压缩)
#
# 用法:
#   ./scripts/optimize.sh video <输入.mp4> [输出.mp4]      # 默认输出 <名>-opt.mp4
#   ./scripts/optimize.sh video <输入.mp4> --mute            # 顺便去掉音轨
#   ./scripts/optimize.sh image <输入.png|jpg> [输出.jpg]    # 默认输出 <名>-opt.jpg
#   ./scripts/optimize.sh all                                # 批量处理 *-raw.mp4 / *-raw.png|jpg
#
# 约定:批量模式处理文件名带 `-raw` 的原片,输出去掉 `-raw`。
# 依赖:ffmpeg(视频)、sips(macOS 自带,图片)。

set -euo pipefail

die() { echo "❌ $*" >&2; exit 1; }

human() { # 字节 → 人类可读
  local b=$1
  if   [ "$b" -ge 1048576 ]; then printf "%.1fMB" "$(echo "$b/1048576" | bc -l)"
  elif [ "$b" -ge 1024 ];    then printf "%.0fKB" "$(echo "$b/1024"    | bc -l)"
  else printf "%dB" "$b"; fi
}

size() { stat -f%z "$1" 2>/dev/null || echo 0; }

report() { # 原文件 新文件
  local o n; o=$(size "$1"); n=$(size "$2")
  local pct=0; [ "$o" -gt 0 ] && pct=$(echo "100 - $n*100/$o" | bc)
  echo "   $(human "$o") → $(human "$n")  (省 ${pct}%)  $2"
}

optimize_video() {
  local in="$1"; shift
  [ -f "$in" ] || die "找不到文件:$in"
  command -v ffmpeg >/dev/null || die "需要 ffmpeg:brew install ffmpeg"
  local out="" mute=""
  for a in "$@"; do
    case "$a" in
      --mute) mute="-an" ;;
      *) out="$a" ;;
    esac
  done
  [ -n "$out" ] || out="${in%.*}-opt.mp4"
  echo "🎬 压缩视频 $in ..."
  ffmpeg -y -loglevel error -i "$in" \
    -vf "scale='min(1280,iw)':'-2'" \
    -c:v libx264 -crf 27 -preset slow -movflags +faststart \
    ${mute:-} \
    ${mute:+} $( [ -z "$mute" ] && echo "-c:a aac -b:a 96k" ) \
    "$out"
  report "$in" "$out"
}

optimize_image() {
  local in="$1"; shift || true
  [ -f "$in" ] || die "找不到文件:$in"
  command -v sips >/dev/null || die "需要 sips(macOS 自带)"
  local out="${1:-${in%.*}-opt.jpg}"
  echo "🖼  压缩图片 $in ..."
  # 缩到最大边 1600,转 JPEG q82
  sips -Z 1600 -s format jpeg -s formatOptions 82 "$in" --out "$out" >/dev/null
  report "$in" "$out"
}

batch_all() {
  local n=0
  shopt -s nullglob nocaseglob
  for f in *-raw.mp4; do optimize_video "$f" "${f/-raw/}"; n=$((n+1)); done
  for f in *-raw.png *-raw.jpg *-raw.jpeg; do optimize_image "$f" "${f%.*}"; out="${f/-raw/}"; optimize_image "$f" "${out%.*}.jpg"; n=$((n+1)); done
  shopt -u nullglob nocaseglob
  [ "$n" -gt 0 ] || echo "(没找到 *-raw.mp4 / *-raw.png|jpg,无需处理)"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  video) optimize_video "$@" ;;
  image) optimize_image "$@" ;;
  all)   batch_all ;;
  *) cat <<'EOF'
网站素材压缩流水线

  ./scripts/optimize.sh video <输入.mp4> [输出.mp4] [--mute]
  ./scripts/optimize.sh image <输入.png|jpg> [输出.jpg]
  ./scripts/optimize.sh all        # 批量:处理 *-raw.mp4 / *-raw.png|jpg

视频 → 720p·CRF27·faststart   图片 → 最大边1600·JPEG q82
EOF
    ;;
esac
