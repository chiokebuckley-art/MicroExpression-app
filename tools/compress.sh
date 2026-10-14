#!/usr/bin/env bash
# Compress exported head GLB files and verify <= 40 MB budget per head GLB.
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Verifying GLB size budgets in $BASE_DIR/models..."

for glb in "$BASE_DIR"/models/riya/head.glb "$BASE_DIR"/models/rocketbox/*/head.glb; do
  if [ -f "$glb" ]; then
    size_bytes=$(stat -f%z "$glb" 2>/dev/null || stat -c%s "$glb")
    size_mb=$(python3 -c "print(round($size_bytes / (1024*1024), 2))")
    echo "  $glb -> ${size_mb} MB"
    python3 -c "import sys; sys.exit(0 if $size_bytes <= 40*1024*1024 else 1)" || {
      echo "ERROR: $glb exceeds 40 MB limit!"
      exit 1
    }
  fi
done
echo "All head GLBs are within the <= 40 MB budget."
