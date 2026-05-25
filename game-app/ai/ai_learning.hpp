/**
 * ============================================================
 *  ADAPTIVE NEURAL AI — Architecture Reference (C++ design doc)
 *
 *  NOTE: The active JavaScript implementation is:
 *        game-app/webSite/ai-neural.js
 *        This file serves as the architectural reference only.
 *
 *  Architecture:
 *    - 8 parallel agents: 1 main player + 7 ghost agents
 *    - Each agent has a neural net: 17 inputs → 14 hidden → 16 outputs
 *    - Weights evolved across generations (neuroevolution / NEAT-lite)
 *    - PLUS real-time weight adaptation inside each run (ES perturbation)
 *    - PLUS stuck detection that mutates the agent live, mid-run
 *    - PLUS a global memory of the best weights ever seen, shared across agents
 *    - Exploration noise injected every run so behaviour is never identical
 *
 *  Input encoding (17 values):
 *    [0..11]  12 raycasts:  +value = wall/platform distance (closer→higher)
 *                           −value = hazard/spike distance  (closer→more negative)
 *                            0     = goal on this ray
 *    [12]     onGround (0/1)
 *    [13]     vx / MaxRun
 *    [14]     vy / MaxFall
 *    [15]     dashAvailable (0/1)
 *    [16]     goal direction: gx/gd (horizontal) or −gy/gd (vertical ascent)
 *
 *  Output encoding (16 actions, softmax temperature sampling):
 *    0=left  1=right  2=jump  3=dash→right  4=jump+right  5=jump+left
 *    6=grab+climb-left  7=grab+climb-right  8=grab+wall-jump
 *    9=dash→left  10=dash→up  11=dash→up-right  12=dash→up-left
 *    13=dash→down  14=dash→down-right  15=dash→down-left
 *
 *  Guarantees:
 *    ✓ Every run is different (fresh noise + stochastic action selection)
 *    ✓ Agents improve every attempt (ES online update + generational GA)
 *    ✓ Agents adapt mid-run (perturbation windows, stuck detector)
 *    ✓ Global best weights carry forward across level clears
 *    ✓ AI can detect and avoid hazards via negative raycast signals
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

// ── NETWORK DIMENSIONS ────────────────────────────────────
inline constexpr int N_IN   = 17;
inline constexpr int N_HID  = 14;
inline constexpr int N_OUT  = 16;
inline constexpr int W_SIZE = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT; // 492

// ── TYPES ─────────────────────────────────────────────────
using Weights = std::array<float, W_SIZE>;
using Inputs  = std::array<float, N_IN>;

// ── HYPERPARAMETERS ───────────────────────────────────────
struct Hyperparams {
    // Generational evolution
    int   ELITE_K        = 2;
    float TOURNAMENT_P   = 1.5f;
    float CROSS_ALPHA    = 0.5f;
    float MUTATE_RATE    = 0.20f;
    float MUTATE_STR     = 0.35f;
    float MUTATE_DECAY   = 0.003f;
    float MUTATE_MIN_R   = 0.04f;
    float MUTATE_MIN_S   = 0.04f;
    float GLOBAL_BEST_P  = 0.15f;

    // Real-time adaptation (ES online)
    int   ADAPT_INTERVAL = 40;
    float ADAPT_PERTURB  = 0.08f;
    float ADAPT_FRAC     = 0.08f;
    float ADAPT_LR       = 0.015f;
    float ADAPT_ABSORB   = 0.30f;
    int   ADAPT_WINDOW   = 8;

    // Stuck detection
    int   STUCK_THRESH   = 80;
    float STUCK_NOISE    = 0.15f;
    float STUCK_PULL_P   = 0.40f;

    // Exploration noise injected at spawn
    float SPAWN_NOISE_R  = 0.05f;
    float SPAWN_NOISE_S  = 0.08f;
};

inline const Hyperparams HP;

// ── RNG ───────────────────────────────────────────────────
// Thread-local so multi-threaded agent updates are safe
inline std::mt19937& rng() {
    thread_local std::mt19937 gen{ std::random_device{}() };
    return gen;
}

inline float randF() {
    thread_local std::uniform_real_distribution<float> dist(0.f, 1.f);
    return dist(rng());
}

inline float randSym() { return randF() * 2.f - 1.f; }  // uniform in [-1, 1]

inline int randInt(int n) {
    return static_cast<int>(randF() * static_cast<float>(n));
}

// ── WEIGHT UTILITIES ──────────────────────────────────────

/** Create a random weight vector in [-1, 1] */
inline Weights randWeights() {
    Weights w;
    for (auto& v : w) v = randSym();
    return w;
}

/** Clamp all weights to [-5, 5] in place */
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

/** Action flags returned by think() */
struct Action {
    bool  L, R, J, X, G;  // left, right, jump, dash, grab
    float DX, DY;          // dash direction (for X=true)
};

/**
 * Run the neural net and return a discrete action.
 * Uses softmax temperature sampling (not argmax) for exploration.
 * @param weights  flat weight vector
 * @param inputs   N_IN sensor values
 */
inline Action think(const Weights& weights, const Inputs& inputs) {
    // Hidden layer (ReLU)
    std::array<float, N_HID> h{};
    for (int j = 0; j < N_HID; j++) {
        float s = weights[N_IN * N_HID + j];
        for (int i = 0; i < N_IN; i++)
            s += inputs[i] * weights[i * N_HID + j];
        h[j] = relu(s);
    }

    // Output layer (sigmoid logits)
    const int base = N_IN * N_HID + N_HID;
    std::array<float, N_OUT> out{};
    for (int k = 0; k < N_OUT; k++) {
        float s = weights[base + N_HID * N_OUT + k];
        for (int j = 0; j < N_HID; j++)
            s += h[j] * weights[base + j * N_OUT + k];
        out[k] = sigmoid(s);
    }

    // Softmax temperature sampling (EXPLORE_TEMP = 0.55)
    constexpr float TEMP = 0.55f;
    float maxO = *std::max_element(out.begin(), out.end());
    std::array<float, N_OUT> exps{};
    float sumE = 0.f;
    for (int k = 0; k < N_OUT; k++) { exps[k] = std::exp((out[k] - maxO) / TEMP); sumE += exps[k]; }
    float r = randF() * sumE;
    int best = N_OUT - 1;
    for (int k = 0; k < N_OUT; k++) { r -= exps[k]; if (r <= 0.f) { best = k; break; } }

    // Action mapping:
    //  0=left  1=right  2=jump  3=dash→right  4=jump+right  5=jump+left
    //  6=grab+climb-left  7=grab+climb-right  8=grab+wall-jump
    //  9=dash→left  10=dash→up  11=dash→up-right  12=dash→up-left
    //  13=dash→down  14=dash→down-right  15=dash→down-left
    //                     0  1  2   3  4  5  6  7  8   9 10  11  12 13 14  15
    constexpr float DX[] = {0, 0, 0,  1, 0, 0, 0, 0, 0, -1,  0,  1, -1, 0,  1, -1};
    constexpr float DY[] = {0, 0, 0,  0, 0, 0, 0, 0, 0,  0, -1, -1, -1, 1,  1,  1};
    const bool isDash = best == 3 || best >= 9;
    return {
        best == 0 || best == 5 || best == 6,   // L
        best == 1 || best == 4 || best == 7,   // R
        best == 2 || best == 4 || best == 5 || best == 8, // J
        isDash,                                // X
        best == 6 || best == 7 || best == 8,  // G
        DX[best], DY[best]
    };
}

// ── GENETIC OPERATORS ─────────────────────────────────────

/**
 * Mutate a weight vector.
 * @param w        source weights (not modified)
 * @param rate     probability each weight is mutated
 * @param strength gaussian std of mutation noise
 */
inline Weights mutateWeights(const Weights& w, float rate, float strength) {
    Weights out = w;
    for (int i = 0; i < W_SIZE; i++)
        if (randF() < rate)
            out[i] += randSym() * strength;
    clamp(out);
    return out;
}

/**
 * Uniform crossover of two weight vectors.
 * @param alpha  probability of taking from a (0.5 = uniform)
 */
inline Weights crossoverWeights(const Weights& a, const Weights& b, float alpha = 0.5f) {
    Weights out;
    for (int i = 0; i < W_SIZE; i++)
        out[i] = (randF() < alpha) ? a[i] : b[i];
    return out;
}

/**
 * Add small exploration noise at agent spawn so each run starts slightly
 * differently, preventing agents from settling into identical behaviour.
 */
inline Weights spawnNoise(const Weights& w) {
    Weights out = w;
    int n = static_cast<int>(W_SIZE * HP.SPAWN_NOISE_R);
    for (int k = 0; k < n; k++) {
        int idx = randInt(W_SIZE);
        out[idx] += randSym() * HP.SPAWN_NOISE_S;
    }
    clamp(out);
    return out;
}

// ── REAL-TIME ES ADAPTATION ──────────────────────────────
//
// Every ADAPT_INTERVAL frames:
//  1. Sample a sparse random perturbation δw (~8% of weights)
//  2. Apply δw temporarily to the active weights for the next window
//  3. Measure the reward delta in that window
//  4. Store (δw, reward) in a rolling history buffer
//  5. Compute an ES gradient:  Σ advantage_i * δw_i
//  6. Nudge the base weights in the gradient direction
//  7. If the perturbation helped, absorb a fraction permanently

struct HistoryEntry {
    Weights dw;
    float   reward;
};

struct AdaptState {
    std::vector<HistoryEntry> history;
    std::optional<Weights>    lastDW;
    std::optional<Weights>    perturbedW;
    bool                      usingPerturbed = false;
    float                     windowFitStart = 0.f;
    int                       tick           = 0;
};

/**
 * Generate a new perturbation and start a test window.
 * Call at the start of each ADAPT_INTERVAL window.
 */
inline void beginPerturbWindow(const Weights& baseW, AdaptState& state, float fitNow) {
    Weights dw{};
    int n = static_cast<int>(W_SIZE * HP.ADAPT_FRAC);
    for (int k = 0; k < n; k++) {
        int idx = randInt(W_SIZE);
        dw[idx] = randSym() * HP.ADAPT_PERTURB;
    }

    Weights perturbed = baseW;
    for (int i = 0; i < W_SIZE; i++)
        perturbed[i] = std::max(-5.f, std::min(5.f, perturbed[i] + dw[i]));

    state.lastDW         = dw;
    state.perturbedW     = perturbed;
    state.usingPerturbed = true;
    state.windowFitStart = fitNow;
}

/**
 * End the test window, measure reward, apply ES update.
 * Call at the end of each ADAPT_INTERVAL window.
 * @returns updated base weights
 */
inline Weights endPerturbWindow(const Weights& baseW, AdaptState& state, float fitNow) {
    if (!state.lastDW) return baseW;

    float reward = fitNow - state.windowFitStart;

    state.history.push_back({ *state.lastDW, reward });
    if (static_cast<int>(state.history.size()) > HP.ADAPT_WINDOW)
        state.history.erase(state.history.begin());

    Weights out = baseW;

    // ES gradient update across the history window
    if (static_cast<int>(state.history.size()) >= 2) {
        float baseline = 0.f;
        for (const auto& h : state.history) baseline += h.reward;
        baseline /= static_cast<float>(state.history.size());

        for (const auto& h : state.history) {
            float advantage = h.reward - baseline;
            if (std::abs(advantage) < 0.01f) continue;
            float lr = HP.ADAPT_LR * (advantage > 0.f ? 1.f : -1.f);
            for (int i = 0; i < W_SIZE; i++)
                out[i] += lr * h.dw[i] * advantage;
        }
        clamp(out);
    }

    // Absorb successful perturbations permanently
    if (reward > 0.5f) {
        for (int i = 0; i < W_SIZE; i++)
            out[i] = std::max(-5.f, std::min(5.f, out[i] + (*state.lastDW)[i] * HP.ADAPT_ABSORB));
    }

    state.usingPerturbed = false;
    return out;
}

/**
 * Get the weights the agent should use this frame.
 * During a perturbation window, returns perturbed weights.
 */
inline const Weights& activeWeights(const Weights& baseW, const AdaptState& state) {
    return (state.usingPerturbed && state.perturbedW) ? *state.perturbedW : baseW;
}

/**
 * Per-frame adaptation tick. Call once per agent per frame.
 * @returns possibly-updated base weights
 */
inline Weights adaptTick(const Weights& baseW, AdaptState& state, float fitNow) {
    state.tick++;
    if (state.tick % HP.ADAPT_INTERVAL == 1) {
        beginPerturbWindow(baseW, state, fitNow);
        return baseW;
    } else if (state.tick % HP.ADAPT_INTERVAL == 0) {
        return endPerturbWindow(baseW, state, fitNow);
    }
    return baseW;
}

// ── STUCK DETECTION ──────────────────────────────────────

/** Minimal agent state needed by stuckCheck (embed in your larger Agent struct). */
struct AgentStuckState {
    Weights weights;
    int     stuckFor = 0;
    float   lastFit  = 0.f;
};

/**
 * Track whether an agent's fitness has improved recently.
 * If stuck, mutate it live — don't wait for the next generation.
 * @returns possibly-updated weights
 */
inline Weights stuckCheck(AgentStuckState& agent, float fitNow,
                           const std::optional<Weights>& globalBestW)
{
    if (fitNow > agent.lastFit + 0.1f)
        agent.stuckFor = 0;
    else
        agent.stuckFor++;
    agent.lastFit = fitNow;

    if (agent.stuckFor < HP.STUCK_THRESH) return agent.weights;

    // Agent is stuck — inject noise NOW, mid-run
    float noise = std::min(0.5f, 0.1f + static_cast<float>(agent.stuckFor) / 500.f);
    Weights w = mutateWeights(agent.weights, HP.STUCK_NOISE, noise);

    // Optionally pull toward global best to exploit known good solutions
    if (globalBestW && randF() < HP.STUCK_PULL_P)
        w = crossoverWeights(w, *globalBestW, 0.3f);

    agent.stuckFor = 0;
    return w;
}

// ── GENERATIONAL EVOLUTION ────────────────────────────────

struct PopMember {
    Weights weights;
    float   fitness;
};

/**
 * Breed a new population from the current one.
 * Uses elitism + tournament selection + crossover + mutation.
 *
 * @param population  current agents with fitness scores
 * @param generation  current generation number
 * @param globalBestW global best weights ever (may be empty)
 * @param popSize     target population size
 * @returns new weight vectors (one per agent)
 */
inline std::vector<Weights> breedGeneration(
    std::vector<PopMember>        population,
    int                           generation,
    const std::optional<Weights>& globalBestW,
    int                           popSize)
{
    // Sort descending by fitness
    std::sort(population.begin(), population.end(),
              [](const PopMember& a, const PopMember& b){ return b.fitness < a.fitness; });

    // Decay mutation params over time (exploitation increases as generations pass)
    float rate = std::max(HP.MUTATE_MIN_R,
                          HP.MUTATE_RATE - static_cast<float>(generation) * HP.MUTATE_DECAY);
    float str  = std::max(HP.MUTATE_MIN_S,
                          HP.MUTATE_STR  - static_cast<float>(generation) * HP.MUTATE_DECAY);

    std::vector<Weights> newWeights;
    newWeights.reserve(popSize);

    // Elitism: top K survive unchanged
    int eliteCount = std::min(HP.ELITE_K, static_cast<int>(population.size()));
    for (int i = 0; i < eliteCount; i++)
        newWeights.push_back(population[i].weights);

    // Breed the rest
    int n = static_cast<int>(population.size());
    auto pick = [&]() -> const PopMember& {
        int idx = static_cast<int>(std::pow(randF(), HP.TOURNAMENT_P) * n);
        return population[std::min(idx, n - 1)];
    };

    while (static_cast<int>(newWeights.size()) < popSize) {
        const auto& parentA = pick();
        const auto& parentB = pick();

        Weights w = crossoverWeights(parentA.weights, parentB.weights, HP.CROSS_ALPHA);
        w = mutateWeights(w, rate, str);

        // Occasionally blend with global best
        if (globalBestW && randF() < HP.GLOBAL_BEST_P)
            w = crossoverWeights(w, *globalBestW, 0.25f);

        newWeights.push_back(std::move(w));
    }

    return newWeights;
}

// ── SENSOR SYSTEM ─────────────────────────────────────────
//
// 12 raycasts + 5 state values = 17 inputs
// Raycasts return:
//   positive value = distance to platform/wall (closer = higher)
//   negative value = distance to spike (danger signal)
//   0              = goal detected on this ray

struct Rect { float x, y, w, h; };

struct AgentSensorState {
    float x, y;
    float vx, vy;
    bool  og;   // on ground
    int   dash;
};

inline constexpr int        RAY_COUNT = 12;
inline constexpr float      RAY_LEN   = 110.f;
inline constexpr float      RAY_STEP  = 5.f;
inline constexpr std::array<std::array<float, 2>, RAY_COUNT> RAY_DIRS = {{
    { 1.f,  0.f  }, { 1.f, -0.6f}, { 0.f, -1.f },  {-1.f, -0.6f},
    {-1.f,  0.f  }, { 0.7f,-0.7f}, { 1.f,  0.5f},  { 0.f,  1.f },
    { 0.5f,-1.f  }, {-0.5f,-1.f }, { 1.f, -1.f },  {-1.f, -1.f },
}};

// castRay return value:
//   positive (0–1)  = distance to platform/wall    (closer → higher)
//   negative (−1–0) = distance to hazard/spike     (closer → more negative)
//   0               = goal is on this ray
inline float castRay(float cx, float cy, float dx, float dy,
                     const std::vector<Rect>& plats,
                     const std::vector<Rect>& hazards,
                     const Rect& goal,
                     float worldMinX, float worldMaxX, float worldMinY, float worldMaxY)
{
    float len = std::sqrt(dx * dx + dy * dy);
    float ndx = dx / len, ndy = dy / len;

    for (float t = RAY_STEP; t <= RAY_LEN; t += RAY_STEP) {
        float rx = cx + ndx * t, ry = cy + ndy * t;

        for (const auto& p : plats)
            if (rx > p.x && rx < p.x + p.w && ry > p.y && ry < p.y + p.h)
                return t / RAY_LEN;

        for (const auto& h : hazards)
            if (rx > h.x && rx < h.x + h.w && ry > h.y && ry < h.y + h.h)
                return -(t / RAY_LEN);

        if (rx > goal.x && rx < goal.x + goal.w && ry > goal.y && ry < goal.y + goal.h)
            return 0.f;

        if (rx < worldMinX || rx > worldMaxX || ry < worldMinY || ry > worldMaxY)
            return t / RAY_LEN;   // world edge = wall
    }
    return 1.f;
}

/**
 * Build the 17-element input vector for an agent.
 * @param agent   { x, y, vx, vy, og, dash }
 * @param plats   all active platforms (static + moving)
 * @param spikes  spike objects
 * @param goal    { x, y, w, h }
 * @param AW      agent width
 * @param AH      agent height
 * @param MAXRUN  max horizontal speed (for normalisation)
 * @param MAXFALL max fall speed (for normalisation)
 */
inline Inputs buildSensorInputs(
    const AgentSensorState&  agent,
    const std::vector<Rect>& plats,
    const std::vector<Rect>& hazards,
    const Rect&              goal,
    float AW, float AH, float MAXRUN, float MAXFALL,
    float worldMinX, float worldMaxX, float worldMinY, float worldMaxY,
    bool  isVertical = false)
{
    Inputs inp{};
    float cx = agent.x + AW / 2.f;
    float cy = agent.y + AH / 2.f;

    // 12 raycasts: +wall, −hazard, 0=goal
    for (int i = 0; i < RAY_COUNT; i++) {
        float dx = RAY_DIRS[i][0], dy = RAY_DIRS[i][1];
        inp[i] = castRay(cx, cy, dx, dy, plats, hazards, goal,
                         worldMinX, worldMaxX, worldMinY, worldMaxY);
    }

    inp[12] = agent.og ? 1.f : 0.f;
    inp[13] = agent.vx / MAXRUN;
    inp[14] = agent.vy / MAXFALL;
    inp[15] = agent.dash > 0 ? 1.f : 0.f;

    float gx = goal.x + goal.w / 2.f - cx;
    float gy = goal.y + goal.h / 2.f - cy;
    float gd = std::sqrt(gx * gx + gy * gy);
    if (gd == 0.f) gd = 1.f;
    // Horizontal levels: goal direction = gx/gd (positive = goal to the right)
    // Vertical levels:   goal direction = −gy/gd (positive = goal is above)
    inp[16] = isVertical ? (-gy / gd) : (gx / gd);

    return inp;
}

// ── FULL AGENT INTEGRATION EXAMPLE ───────────────────────
//
// struct Agent {
//     Weights        weights   = spawnNoise(randWeights());
//     AdaptState     adaptSt;
//     AgentStuckState stuckSt;
//     float          fitness   = 0.f;
// };
//
// Per-frame update:
//   auto inp       = buildSensorInputs(agent, allPlats, spikes, goal, AW, AH, MAXRUN, MAXFALL);
//   float fitNow   = computeFitness(agent);
//   agent.weights  = adaptTick(agent.weights, agent.adaptSt, fitNow);
//   agent.stuckSt.weights = agent.weights;
//   agent.weights  = stuckCheck(agent.stuckSt, fitNow, globalBestWeights);
//   const auto& w  = activeWeights(agent.weights, agent.adaptSt);
//   Action action  = think(w, inp);
//   applyPhysics(agent, action);
//   if (fitNow > globalBestFit) { globalBestFit = fitNow; globalBestWeights = agent.weights; }
//
// End of generation:
//   auto newWeightVectors = breedGeneration(pop, generation, globalBestWeights, popSize);
//   // Respawn each agent with newWeightVectors[i] + spawnNoise(...)
