#!/usr/bin/env bash
set -euo pipefail

# Build standalone binaries for all target platforms
# Uses Bun's cross-compilation: all builds run on a single machine

ENTRY="src/cli.ts"
OUTDIR="dist"
TARGETS=(
  "bun-darwin-arm64:superghost-darwin-arm64"
  "bun-darwin-x64:superghost-darwin-x64"
  "bun-linux-arm64:superghost-linux-arm64"
  "bun-linux-x64:superghost-linux-x64"
)

mkdir -p "$OUTDIR"

for entry in "${TARGETS[@]}"; do
  target="${entry%%:*}"
  outfile="${entry##*:}"
  echo "Building $outfile (target: $target)..."
  bun build --compile \
    --target="$target" \
    --minify \
    --bytecode \
    --sourcemap \
    "$ENTRY" \
    --outfile "$OUTDIR/$outfile"
done

echo "All binaries built in $OUTDIR/"
ls -lh "$OUTDIR"/superghost-*
