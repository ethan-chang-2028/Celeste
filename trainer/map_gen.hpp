#pragma once
// map_gen.hpp — Procedural level generator, ported 1-to-1 from game.js buildLevel()
// Uses the same mulberry32 RNG so seeds produce identical maps to the browser.

#include "physics.hpp"
#include <vector>
#include <cstdint>
#include <cmath>

static constexpr float ROOM_W  = 320.f;
static constexpr float FLOOR_Y = 168.f;
static constexpr float FLOOR_H = 12.f;
static constexpr int   NUM_ROOMS = 5;
static constexpr float LEVEL_W = ROOM_W * NUM_ROOMS;

struct Level {
    std::vector<Rect> platforms;
    std::vector<Rect> hazards;
    Rect goal = {0, 0, 12, 12};
    float spawnX = 14.f, spawnY = FLOOR_Y - 12.f;
    float goalEnd = 0.f;  // x + w of goal (used for fitness)
};

// ── Mulberry32 RNG — exact port of mkRng() from game.js ──────────────────────
class MulberryRng {
    uint32_t s;
public:
    explicit MulberryRng(int seed) : s((uint32_t)seed) {}
    float next() {
        s += 0x6D2B79F5u;
        uint32_t t = s ^ (s >> 15);
        t = (t * (1u | s));
        t = t + ((t ^ (t >> 7)) * (61u | t)) ^ t;
        return (float)((t ^ (t >> 14)) >> 0) / 4294967296.f;
    }
    int nextInt(int n) { return (int)(next() * (float)n) % n; }
};

// ── splitFloor — port of splitFloor() from game.js ───────────────────────────
struct FloorSeg { float x, w; };
struct SplitResult { std::vector<FloorSeg> floors, gaps; };

static SplitResult splitFloor(float ox, float roomW, int numGaps, float gapW, MulberryRng& rng) {
    SplitResult r;
    float used = numGaps * gapW;
    float left = roomW - used;
    float seg  = left / (numGaps + 1);
    float x    = ox;
    for (int i = 0; i <= numGaps; i++) {
        float fw = seg + (rng.next() - 0.5f) * 10.f;
        if (fw > 2.f) r.floors.push_back({x, fw});
        x += fw;
        if (i < numGaps) { r.gaps.push_back({x, gapW}); x += gapW; }
    }
    return r;
}

// ── buildLevel — port of buildLevel() from game.js ───────────────────────────
static Level buildLevel(int seed) {
    MulberryRng rng(seed);
    auto ri = [&]() { return rng.nextInt(1000); };

    Level lv;
    lv.spawnX = 14.f;
    lv.spawnY = FLOOR_Y - 12.f;

    const char* midTypes[] = {"gaps","platform","chimney","climb"};
    const char* chosen[NUM_ROOMS];
    chosen[0] = "gaps";
    chosen[1] = midTypes[ri() % 4];
    chosen[2] = midTypes[ri() % 4];
    chosen[3] = midTypes[ri() % 4];
    chosen[4] = "stair";

    auto& p = lv.platforms;

    for (int room = 0; room < NUM_ROOMS; room++) {
        float ox = room * ROOM_W;
        const char* type = chosen[room];

        // Wall at left of first room and right of last room
        if (room == 0)             p.push_back({ox,              0, 8, 180});
        if (room == NUM_ROOMS - 1) p.push_back({ox + ROOM_W - 8, 0, 8, 180});

        if (strcmp(type, "gaps") == 0) {
            int numGaps = 1 + (ri() % 2);
            float gapW  = 32.f + (ri() % 20);
            auto seg = splitFloor(ox, ROOM_W, numGaps, gapW, rng);
            for (const auto& s : seg.floors) p.push_back({s.x, FLOOR_Y, s.w, FLOOR_H});

        } else if (strcmp(type, "platform") == 0) {
            float entryW = 50.f + (ri() % 30), exitW = 40.f + (ri() % 30);
            p.push_back({ox,                   FLOOR_Y, entryW, FLOOR_H});
            p.push_back({ox + ROOM_W - exitW,  FLOOR_Y, exitW,  FLOOR_H});
            bool asc = rng.next() > 0.5f;
            float gap = (ROOM_W - entryW - exitW) / 3.f;
            for (int i = 0; i < 3; i++) {
                float fx = ox + entryW + std::floor(i * gap) + (ri() % 10);
                float fy = asc ? std::max(25.f, FLOOR_Y - 45.f - i * 28.f)
                               : std::max(25.f, FLOOR_Y - 110.f + i * 28.f);
                float fw = 42.f + (ri() % 28);
                p.push_back({fx, fy, fw, 8});
            }

        } else if (strcmp(type, "chimney") == 0) {
            float entryW  = 70.f + (ri() % 50);
            float shaftX  = ox + entryW + 10.f + (ri() % 20);
            float shaftW  = 22.f + (ri() % 10);
            float shaftTop = 28.f + (ri() % 35);
            float gapBot  = 16.f;
            p.push_back({ox, FLOOR_Y, entryW, FLOOR_H});
            p.push_back({shaftX,         shaftTop, 6, FLOOR_Y - shaftTop - gapBot});
            p.push_back({shaftX + shaftW,shaftTop, 6, FLOOR_Y - shaftTop});
            p.push_back({shaftX, shaftTop, shaftW + 12, 6});
            float l1x = shaftX + shaftW + 18.f + (ri() % 15);
            float l1y = 72.f + (ri() % 35);
            float l2x = l1x + 48.f + (ri() % 20);
            float l2y = 118.f + (ri() % 24);
            p.push_back({l1x, l1y, 50, 8});
            p.push_back({l2x, l2y, 50, 8});
            float exitX = std::min(ox + ROOM_W - 10.f, l2x + 40.f);
            if (exitX < ox + ROOM_W) p.push_back({exitX, FLOOR_Y, ox + ROOM_W - exitX, FLOOR_H});

        } else if (strcmp(type, "climb") == 0) {
            float entryW = 50.f + (ri() % 30);
            p.push_back({ox, FLOOR_Y, entryW, FLOOR_H});
            float wallH   = 120.f + (ri() % 40);
            float wallTop = FLOOR_Y - wallH;
            float wallAX  = ox + entryW + 20.f + (ri() % 20);
            p.push_back({wallAX,    wallTop, 8,  wallH});
            p.push_back({wallAX+8,  wallTop, 62, 8});
            float wallBX = wallAX + 8.f + 62.f + 20.f + (ri() % 20);
            p.push_back({wallBX,    wallTop, 8,  wallH});
            p.push_back({wallBX+8,  wallTop, 40, 8});
            float d1x = wallBX + 50.f, d2x = d1x + 50.f;
            p.push_back({d1x, wallTop + 55.f, 50, 8});
            p.push_back({d2x, wallTop + 105.f, 40, 8});
            float exitX = std::min(ox + ROOM_W - 10.f, d2x + 32.f);
            if (exitX < ox + ROOM_W) p.push_back({exitX, FLOOR_Y, ox + ROOM_W - exitX, FLOOR_H});

        } else if (strcmp(type, "stair") == 0) {
            p.push_back({ox, FLOOR_Y, 55, FLOOR_H});
            int steps = 4 + (ri() % 2);
            float spacing = (ROOM_W - 80.f) / steps;
            for (int s = 0; s < steps; s++) {
                float sx = ox + 55.f + std::floor(s * spacing);
                float sy = FLOOR_Y - 32.f - s * 30.f;
                float sw = 48.f + (ri() % 18);
                p.push_back({sx, sy, sw, 8});
                if (s == steps - 1) {
                    lv.goal = {sx + sw - 18.f, sy - 14.f, 12, 12};
                }
            }
        }
    }

    lv.goalEnd = lv.goal.x + lv.goal.w;
    return lv;
}
