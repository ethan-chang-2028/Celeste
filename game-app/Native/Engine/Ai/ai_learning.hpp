/**
 * ============================================================
 *  ADAPTIVE NEURAL AI — C++ implementation (compiled to WASM)
 *
 *  Architecture:
 *    23 inputs → 20 hidden (ReLU) → 22 outputs (16 actions + 6 memory writes)
 *    Recurrent memory: 6 cells fed back as inputs each frame
 *    Training: neuroevolution (GA) + real-time ES + two-stage stuck detection
 * ============================================================
 */

#pragma once

#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <random>
#include <limits>

// ── NETWORK DIMENSIONS ────────────────────────────────────
inline constexpr int MEM_SIZE = 6;    // recurrent memory cells
inline constexpr int N_IN   = 23;    // 12 raycasts + 5 state + 6 memory
inline constexpr int N_HID  = 20;
inline constexpr int N_OUT  = 22;    // 16 actions + 6 memory writes
inline constexpr int N_ACT  = N_OUT - MEM_SIZE;  // 16
inline constexpr int W_SIZE = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT; // 942

// ── TYPES ─────────────────────────────────────────────────
using Weights = std::array<float, W_SIZE>;
using Inputs  = std::array<float, N_IN>;
using Memory  = std::array<float, MEM_SIZE>;

// ── HYPERPARAMETERS ───────────────────────────────────────
struct Hyperparams {
    int   ELITE_K          = 2;
    float TOURNAMENT_P     = 1.5f;
    float CROSS_ALPHA      = 0.5f;
    float MUTATE_RATE      = 0.25f;
    float MUTATE_STR       = 0.50f;
    float MUTATE_DECAY     = 0.003f;
    float MUTATE_MIN_R     = 0.05f;
    float MUTATE_MIN_S     = 0.06f;
    float GLOBAL_BEST_P    = 0.15f;
    int   ADAPT_INTERVAL   = 40;
    float ADAPT_PERTURB    = 0.10f;
    float ADAPT_FRAC       = 0.10f;
    float ADAPT_LR         = 0.020f;
    float ADAPT_ABSORB     = 0.30f;
    int   ADAPT_WINDOW     = 8;
    int   MEM_RESET_THRESH = 50;   // frames stuck → reset memory first
    int   STUCK_THRESH     = 150;  // frames stuck → mutate weights
    float STUCK_NOISE      = 0.20f;
    float STUCK_PULL_P     = 0.50f;
    float SPAWN_NOISE_R    = 0.05f;
    float SPAWN_NOISE_S    = 0.12f;
    float EXPLORE_TEMP     = 0.55f;
    int   STAGNATE_RUNS    = 20;
};

inline const Hyperparams HP;

// ── RNG ───────────────────────────────────────────────────
inline std::mt19937& rng() {
    thread_local std::mt19937 gen{ std::random_device{}() };
    return gen;
}

inline float randF() {
    thread_local std::uniform_real_distribution<float> dist(0.f, 1.f);
    return dist(rng());
}

inline float randSym() { return randF() * 2.f - 1.f; }

inline int randInt(int n) {
    return static_cast<int>(randF() * static_cast<float>(n));
}

// ── WEIGHT UTILITIES ──────────────────────────────────────
inline Weights randWeights() {
    Weights w;
    for (auto& v : w) v = randSym();
    return w;
}

inline void clamp(Weights& w) {
    for (auto& v : w) v = std::max(-5.f, std::min(5.f, v));
}

// ── ACTIVATION FUNCTIONS ──────────────────────────────────
inline float relu(float x)    { return x > 0.f ? x : 0.f; }

inline float sigmoid(float x) {
    x = std::max(-10.f, std::min(10.f, x));
    return 1.f / (1.f + std::exp(-x));
}

// ── FORWARD PASS ──────────────────────────────────────────
struct Action {
    bool  L, R, J, X, G;
    float DX, DY;
};

// inputs already has memory cells in positions 17-22.
// mem is updated in-place with new values from the last MEM_SIZE outputs.
inline Action think(const Weights& weights, const Inputs& inputs, Memory& mem) {
    // Hidden layer (ReLU)
    std::array<float, N_HID> h{};
    for (int j = 0; j < N_HID; j++) {
        float s = weights[N_IN * N_HID + j];
        for (int i = 0; i < N_IN; i++)
            s += inputs[i] * weights[i * N_HID + j];
        h[j] = relu(s);
    }

    // Output layer (sigmoid, all 22 outputs)
    const int base = N_IN * N_HID + N_HID;
    std::array<float, N_OUT> out{};
    for (int k = 0; k < N_OUT; k++) {
        float s = weights[base + N_HID * N_OUT + k];
        for (int j = 0; j < N_HID; j++)
            s += h[j] * weights[base + j * N_OUT + k];
        out[k] = sigmoid(s);
    }

    // Softmax temperature sampling over ACTION outputs only (first 16)
    float maxO = out[0];
    for (int k = 1; k < N_ACT; k++) if (out[k] > maxO) maxO = out[k];
    std::array<float, N_ACT> exps{};
    float sumE = 0.f;
    for (int k = 0; k < N_ACT; k++) {
        exps[k] = std::exp((out[k] - maxO) / HP.EXPLORE_TEMP);
        sumE += exps[k];
    }
    float r = randF() * sumE;
    int best = N_ACT - 1;
    for (int k = 0; k < N_ACT; k++) { r -= exps[k]; if (r <= 0.f) { best = k; break; } }

    // Write new memory values from last MEM_SIZE outputs (scaled to [-1,1])
    for (int m = 0; m < MEM_SIZE; m++)
        mem[m] = out[N_ACT + m] * 2.f - 1.f;

    //                     0  1  2   3  4  5  6  7  8   9 10  11  12 13 14  15
    constexpr float DX[] = {0, 0, 0,  1, 0, 0, 0, 0, 0, -1,  0,  1, -1, 0,  1, -1};
    constexpr float DY[] = {0, 0, 0,  0, 0, 0, 0, 0, 0,  0, -1, -1, -1, 1,  1,  1};
    const bool isDash = best == 3 || best >= 9;
    return {
        best == 0 || best == 5 || best == 6,
        best == 1 || best == 4 || best == 7,
        best == 2 || best == 4 || best == 5 || best == 8,
        isDash,
        best == 6 || best == 7 || best == 8,
        DX[best], DY[best]
    };
}

// ── GENETIC OPERATORS ─────────────────────────────────────
inline Weights mutateWeights(const Weights& w, float rate, float strength) {
    Weights out = w;
    for (int i = 0; i < W_SIZE; i++)
        if (randF() < rate) out[i] += randSym() * strength;
    clamp(out);
    return out;
}

inline Weights crossoverWeights(const Weights& a, const Weights& b, float alpha = 0.5f) {
    Weights out;
    for (int i = 0; i < W_SIZE; i++)
        out[i] = (randF() < alpha) ? a[i] : b[i];
    return out;
}

inline Weights spawnNoise(const Weights& w) {
    Weights out = w;
    int n = static_cast<int>(W_SIZE * HP.SPAWN_NOISE_R);
    for (int k = 0; k < n; k++)
        out[randInt(W_SIZE)] += randSym() * HP.SPAWN_NOISE_S;
    clamp(out);
    return out;
}

// ── REAL-TIME ES ADAPTATION ───────────────────────────────
struct HistoryEntry { Weights dw; float reward; };

struct AdaptState {
    std::vector<HistoryEntry> history;
    std::optional<Weights>    lastDW;
    std::optional<Weights>    perturbedW;
    bool                      usingPerturbed = false;
    float                     windowFitStart = 0.f;
    int                       tick           = 0;
};

inline AdaptState makeAdaptState() { return {}; }

inline void beginPerturbWindow(const Weights& baseW, AdaptState& state, float fitNow) {
    Weights dw{};
    int n = static_cast<int>(W_SIZE * HP.ADAPT_FRAC);
    for (int k = 0; k < n; k++) dw[randInt(W_SIZE)] = randSym() * HP.ADAPT_PERTURB;
    Weights perturbed = baseW;
    for (int i = 0; i < W_SIZE; i++)
        perturbed[i] = std::max(-5.f, std::min(5.f, perturbed[i] + dw[i]));
    state.lastDW = dw; state.perturbedW = perturbed;
    state.usingPerturbed = true; state.windowFitStart = fitNow;
}

inline Weights endPerturbWindow(const Weights& baseW, AdaptState& state, float fitNow) {
    if (!state.lastDW) return baseW;
    float reward = fitNow - state.windowFitStart;
    state.history.push_back({ *state.lastDW, reward });
    if ((int)state.history.size() > HP.ADAPT_WINDOW)
        state.history.erase(state.history.begin());
    Weights out = baseW;
    if ((int)state.history.size() >= 2) {
        float baseline = 0.f;
        for (const auto& h : state.history) baseline += h.reward;
        baseline /= (float)state.history.size();
        for (const auto& h : state.history) {
            float adv = h.reward - baseline;
            if (std::abs(adv) < 0.01f) continue;
            float lr = HP.ADAPT_LR * (adv > 0.f ? 1.f : -1.f);
            for (int i = 0; i < W_SIZE; i++) out[i] += lr * h.dw[i] * adv;
        }
        clamp(out);
    }
    if (reward > 0.5f)
        for (int i = 0; i < W_SIZE; i++)
            out[i] = std::max(-5.f, std::min(5.f, out[i] + (*state.lastDW)[i] * HP.ADAPT_ABSORB));
    state.usingPerturbed = false;
    return out;
}

inline const Weights& activeWeights(const Weights& baseW, const AdaptState& state) {
    return (state.usingPerturbed && state.perturbedW) ? *state.perturbedW : baseW;
}

inline Weights adaptTick(const Weights& baseW, AdaptState& state, float fitNow) {
    state.tick++;
    if      (state.tick % HP.ADAPT_INTERVAL == 1) { beginPerturbWindow(baseW, state, fitNow); return baseW; }
    else if (state.tick % HP.ADAPT_INTERVAL == 0) { return endPerturbWindow(baseW, state, fitNow); }
    return baseW;
}

// ── STUCK DETECTION (two-stage) ───────────────────────────
// Stage 1 (MEM_RESET_THRESH): wipe memory — fresh context, keep weights
// Stage 2 (STUCK_THRESH):     mutate weights — last resort
struct AgentStuckState {
    Weights weights;
    int     stuckFor = 0;
    float   lastFit  = 0.f;
};

inline Weights stuckCheck(AgentStuckState& agent, float fitNow,
                           const std::optional<Weights>& globalBestW,
                           Memory& mem)
{
    if (fitNow > agent.lastFit + 0.1f) agent.stuckFor = 0;
    else                               agent.stuckFor++;
    agent.lastFit = fitNow;

    if (agent.stuckFor == HP.MEM_RESET_THRESH) mem.fill(0.f);
    if (agent.stuckFor < HP.STUCK_THRESH) return agent.weights;

    float noise = std::min(0.5f, 0.1f + (float)agent.stuckFor / 500.f);
    Weights w = mutateWeights(agent.weights, HP.STUCK_NOISE, noise);
    if (globalBestW && randF() < HP.STUCK_PULL_P)
        w = crossoverWeights(w, *globalBestW, 0.3f);
    agent.stuckFor = 0;
    mem.fill(0.f);
    return w;
}

// ── GENERATIONAL EVOLUTION ────────────────────────────────
struct PopMember { Weights weights; float fitness; };

inline Weights breedNext(std::vector<PopMember>& pool, int generation,
                          const std::optional<Weights>& globalBestW) {
    std::sort(pool.begin(), pool.end(),
              [](const PopMember& a, const PopMember& b){ return b.fitness < a.fitness; });
    float rate = std::max(HP.MUTATE_MIN_R, HP.MUTATE_RATE - (float)generation * HP.MUTATE_DECAY);
    float str  = std::max(HP.MUTATE_MIN_S, HP.MUTATE_STR  - (float)generation * HP.MUTATE_DECAY);
    int n = (int)pool.size();
    auto pick = [&]() -> const Weights& {
        return pool[std::min((int)(std::pow(randF(), 1.5f) * n), n - 1)].weights;
    };
    Weights w = crossoverWeights(pick(), pick(), HP.CROSS_ALPHA);
    w = mutateWeights(w, rate, str);
    if (globalBestW && randF() < HP.GLOBAL_BEST_P)
        w = crossoverWeights(w, *globalBestW, 0.25f);
    return spawnNoise(w);
}

// ── SENSOR SYSTEM ─────────────────────────────────────────
#ifndef CELESTE_RECT_DEFINED
#define CELESTE_RECT_DEFINED
struct Rect { float x, y, w, h; };
#endif

struct AgentSensorState {
    float x, y, vx, vy;
    bool  og;
    int   dash;
};

inline constexpr int RAY_COUNT = 12;
inline constexpr float RAY_LEN_C  = 110.f;
inline constexpr float RAY_STEP_C = 5.f;
inline constexpr std::array<std::array<float,2>, RAY_COUNT> RAY_DIRS_C = {{
    { 1.f,  0.f  }, { 1.f, -0.6f}, { 0.f, -1.f  }, {-1.f, -0.6f},
    {-1.f,  0.f  }, { 0.7f,-0.7f}, { 1.f,  0.5f }, { 0.f,  1.f  },
    { 0.5f,-1.f  }, {-0.5f,-1.f }, { 1.f, -1.f  }, {-1.f, -1.f  },
}};

inline float castRay(float cx, float cy, float dx, float dy,
                     const std::vector<Rect>& plats,
                     const std::vector<Rect>& hazards,
                     const Rect& goal,
                     float wMinX, float wMaxX, float wMinY, float wMaxY)
{
    float len = std::sqrt(dx*dx + dy*dy);
    float ndx = dx/len, ndy = dy/len;
    for (float t = RAY_STEP_C; t <= RAY_LEN_C; t += RAY_STEP_C) {
        float rx = cx + ndx*t, ry = cy + ndy*t;
        for (const auto& p : plats)
            if (rx > p.x && rx < p.x+p.w && ry > p.y && ry < p.y+p.h) return t/RAY_LEN_C;
        for (const auto& h : hazards)
            if (rx > h.x && rx < h.x+h.w && ry > h.y && ry < h.y+h.h) return -(t/RAY_LEN_C);
        if (rx > goal.x && rx < goal.x+goal.w && ry > goal.y && ry < goal.y+goal.h) return 0.f;
        if (rx < wMinX || rx > wMaxX || ry < wMinY || ry > wMaxY) return t/RAY_LEN_C;
    }
    return 1.f;
}

// mem values are placed in inputs[17..22]
inline Inputs buildSensorInputs(const AgentSensorState& ag,
                                 const std::vector<Rect>& plats,
                                 const std::vector<Rect>& hazards,
                                 const Rect& goal,
                                 float AW, float AH, float MAXRUN, float MAXFALL,
                                 float wMinX, float wMaxX, float wMinY, float wMaxY,
                                 bool isVertical, const Memory& mem)
{
    Inputs inp{};
    float cx = ag.x + AW/2.f, cy = ag.y + AH/2.f;
    for (int i = 0; i < RAY_COUNT; i++) {
        float dx = RAY_DIRS_C[i][0], dy = RAY_DIRS_C[i][1];
        inp[i] = castRay(cx, cy, dx, dy, plats, hazards, goal, wMinX, wMaxX, wMinY, wMaxY);
    }
    inp[12] = ag.og ? 1.f : 0.f;
    inp[13] = ag.vx / MAXRUN;
    inp[14] = ag.vy / MAXFALL;
    inp[15] = ag.dash > 0 ? 1.f : 0.f;
    float gx = goal.x + goal.w/2.f - cx;
    float gy = goal.y + goal.h/2.f - cy;
    float gd = std::sqrt(gx*gx + gy*gy); if (gd == 0.f) gd = 1.f;
    inp[16] = isVertical ? (-gy/gd) : (gx/gd);
    for (int m = 0; m < MEM_SIZE; m++) inp[17 + m] = mem[m];
    return inp;
}
