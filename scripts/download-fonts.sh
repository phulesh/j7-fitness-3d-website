#!/usr/bin/env bash
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/fonts"
mkdir -p "$DEST"

# Go Noto Universal — single family covering Latin + Indic + Arabic + more
# https://github.com/satbyy/go-noto-universal
BASE="https://github.com/satbyy/go-noto-universal/releases/download/v7.0"

download() {
  local url="$1"
  local out="$2"
  if [[ -f "$out" && $(stat -c%s "$out" 2>/dev/null || stat -f%z "$out") -gt 100000 ]]; then
    echo "exists: $out"
    return 0
  fi
  echo "downloading $url"
  curl -L --fail --retry 3 --retry-delay 2 -o "$out" "$url"
}

download "$BASE/GoNotoKurrent-Regular.ttf" "$DEST/GoNotoKurrent-Regular.ttf"
download "$BASE/GoNotoKurrent-Bold.ttf" "$DEST/GoNotoKurrent-Bold.ttf"

# Display serif for covers (Fraunces)
FRAUNCES="https://github.com/undercasetype/Fraunces/raw/master/fonts/ttf/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
# Fallback: Source Serif 4 static
SOURCE_REG="https://github.com/adobe-fonts/source-serif/raw/release/TTF/SourceSerif4-Regular.ttf"
SOURCE_BD="https://github.com/adobe-fonts/source-serif/raw/release/TTF/SourceSerif4-Bold.ttf"
SOURCE_IT="https://github.com/adobe-fonts/source-serif/raw/release/TTF/SourceSerif4-It.ttf"

download "$SOURCE_REG" "$DEST/SourceSerif4-Regular.ttf" || true
download "$SOURCE_BD" "$DEST/SourceSerif4-Bold.ttf" || true
download "$SOURCE_IT" "$DEST/SourceSerif4-It.ttf" || true

ls -lh "$DEST"
