#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .tools models

if [ ! -d .tools/whisper.cpp ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git .tools/whisper.cpp
fi

cmake -S .tools/whisper.cpp -B .tools/whisper.cpp/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON
cmake --build .tools/whisper.cpp/build -j4

if [ ! -s models/ggml-base.bin ]; then
  curl -fL --retry 3 -o models/ggml-base.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
fi

echo "Siap. Jalankan: npm run dev"
