#!/usr/bin/env sh
# Phase 1, step 1: rasterize the source PDF into high-DPI PNGs used as the
# tracing reference for the plan JSONs. Output goes to assets/raster/.
set -eu
cd "$(dirname "$0")/.."
mkdir -p assets/raster
for pdf in assets/*.pdf; do
  base=$(basename "$pdf" .pdf | tr ' ' '_')
  pdftoppm -r 300 -png "$pdf" "assets/raster/$base"
  echo "rasterized: $pdf -> assets/raster/$base-*.png"
done
