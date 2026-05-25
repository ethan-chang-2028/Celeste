#!/usr/bin/env bash
# Build the C++ AI to WebAssembly using Emscripten.
# Output: ai-neural.wasm.js + ai-neural.wasm  (copied to webSite/)
#
# Prerequisites:
#   source /path/to/emsdk/emsdk_env.sh   (activate Emscripten toolchain)
#
# Usage:
#   cd game-app/Native
#   ./build.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUT_DIR="$SCRIPT_DIR/../webSite"

echo "[build] Configuring with Emscripten..."
emcmake cmake -DCMAKE_BUILD_TYPE=Release -B "$BUILD_DIR" "$SCRIPT_DIR"

echo "[build] Compiling..."
emmake make -C "$BUILD_DIR" -j"$(nproc 2>/dev/null || echo 4)"

echo "[build] Copying output to webSite/..."
cp "$BUILD_DIR/ai-neural.wasm.js" "$OUT_DIR/"
cp "$BUILD_DIR/ai-neural.wasm"    "$OUT_DIR/"

echo "[build] Done — C++ AI (ai_learning.hpp) compiled to WASM."
echo "        Serve game.html and the WASM AI will activate automatically."
