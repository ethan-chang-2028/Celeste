cmake_minimum_required(VERSION 3.16)
project(CelesteTrainer CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Aggressive optimisation — the whole point of the offline trainer
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG")

add_executable(celeste-trainer main.cpp)

# Headers live one level up (game-app/Native/Engine/Ai/)
target_include_directories(celeste-trainer PRIVATE ${CMAKE_SOURCE_DIR}/..)

find_package(Threads REQUIRED)
target_link_libraries(celeste-trainer Threads::Threads stdc++fs)
