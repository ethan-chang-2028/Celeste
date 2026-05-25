cmake_minimum_required(VERSION 3.15)
project(CelesteAI CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Source files ──────────────────────────────────────────────────────────────
add_executable(ai-neural
    Interop/JsBridge.cpp
)

target_include_directories(ai-neural PRIVATE
    Engine/Ai    # ai_learning.hpp
    Engine       # any other engine headers
    Interop
)

# ── Emscripten output settings ────────────────────────────────────────────────
# Output:  ai-neural.wasm.js  (loader + glue)
#          ai-neural.wasm     (binary module)
# Load in game.html:  <script src="/ai-neural.wasm.js"></script>
# ai-wasm-bridge.js then activates the C++ AI automatically.

if(EMSCRIPTEN)
    set_target_properties(ai-neural PROPERTIES
        SUFFIX ".wasm.js"
    )
    target_link_options(ai-neural PRIVATE
        -sWASM=1
        -sALLOW_MEMORY_GROWTH=1
        -sMODULARIZE=1
        -sEXPORT_NAME=CelesteAI
        --bind
        -sEXPORTED_RUNTIME_METHODS=["ccall","cwrap"]
        -O2
    )
else()
    message(STATUS "Building for native — use emcmake cmake for WASM output")
endif()
