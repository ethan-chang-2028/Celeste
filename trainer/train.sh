#!/usr/bin/env bash
# train.sh — build and run the offline Celeste trainer.
# Run from anywhere; the script always works relative to its own directory.
#
# Examples:
#   ./train.sh                        # train indefinitely, auto-resume if ai-model.json exists
#   ./train.sh --gens 5000            # 5000 generations then exit
#   ./train.sh --seed 7 --seeds 5    # train across 5 map variants starting at seed 7
#   ./train.sh --threads 4           # limit to 4 CPU threads

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Building celeste-trainer ==="
mkdir -p build
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -G "Unix Makefiles" --no-warn-unused-cli -Wno-dev 2>&1 | grep -v "^--"
cmake --build build --parallel "$(nproc 2>/dev/null || echo 4)"
echo "=== Build complete ==="
echo

exec ./build/celeste-trainer "$@"
