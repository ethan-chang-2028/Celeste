// celeste-trainer/main.cpp
// Offline GA trainer for the Celeste neural AI.
// Runs episodes at full CPU speed (no 60fps cap), saves best weights to
// ai-model.json so the browser picks them up via the /ai-model endpoint.
//
// Usage:
//   ./celeste-trainer [--seed N] [--seeds N] [--gens N] [--threads N]
//                     [--output PATH] [--load PATH]

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

// physics.hpp defines Rect first and sets CELESTE_RECT_DEFINED;
// ai_learning.hpp then skips its own duplicate definition.
#include "physics.hpp"
#include "../game-app/Native/Engine/Ai/ai_learning.hpp"
#include "map_gen.hpp"

namespace fs = std::filesystem;

// ── Training constants ────────────────────────────────────
static constexpr int   POOL_SIZE   = 24;
static constexpr int   ELITE_K     = 3;
static constexpr int   MAX_FRAMES  = 1800;    // 30 s at 60 fps — agents that need more are usually stuck
static constexpr float DT          = 1.f / 60.f;
static constexpr float DEAD_Y      = 205.f;
static constexpr int   SAVE_EVERY  = 100;
static constexpr int   PRINT_EVERY = 10;

// World bounds used for ray-casting (matches browser AI_BOUNDS)
static constexpr float W_MIN_X = 0.f;
static constexpr float W_MAX_X = LEVEL_W;
static constexpr float W_MIN_Y = -60.f;
static constexpr float W_MAX_Y = 210.f;

// Forward declarations (defined after runEpisode)
void saveModel(const std::string&, const Weights&, int, int, float);
bool loadModel(const std::string&, Weights&, int&, int&, float&);

// ── Imitation learning ────────────────────────────────────
struct RecordingFrame {
    Inputs inp;
    int    action;
};

// Parse ai-recordings.json → flat list of (inputs, action) frames.
// Structure: [{..., "frames": [[f0..f22, action], ...]}, ...]
static std::vector<RecordingFrame> loadRecordings(const std::string& path) {
    std::ifstream f(path);
    if (!f) { std::cerr << "Cannot open recordings: " << path << '\n'; return {}; }
    std::string content((std::istreambuf_iterator<char>(f)),
                         std::istreambuf_iterator<char>());

    std::vector<RecordingFrame> frames;
    int    bracketDepth = 0;
    size_t frameStart   = std::string::npos;

    for (size_t i = 0; i < content.size(); i++) {
        if (content[i] == '[') {
            bracketDepth++;
            if (bracketDepth == 3) frameStart = i;
        } else if (content[i] == ']') {
            if (bracketDepth == 3 && frameStart != std::string::npos) {
                std::string sub = content.substr(frameStart + 1, i - frameStart - 1);
                std::istringstream ss(sub);
                std::string tok;
                RecordingFrame rf{};
                int  k  = 0;
                bool ok = true;
                while (std::getline(ss, tok, ',')) {
                    if (k < N_IN) {
                        try { rf.inp[k++] = std::stof(tok); } catch (...) { ok = false; break; }
                    } else if (k == N_IN) {
                        try { rf.action = std::stoi(tok); k++; } catch (...) { ok = false; break; }
                    }
                }
                if (ok && k == N_IN + 1 && rf.action >= 0 && rf.action < N_ACT)
                    frames.push_back(rf);
                frameStart = std::string::npos;
            }
            bracketDepth--;
        }
    }
    return frames;
}

static void runImitate(const std::string& dataPath, const std::string& outputPath,
                       int epochs, float lr, const std::string& loadPath) {
    auto frames = loadRecordings(dataPath);
    if (frames.empty()) {
        std::cerr << "No valid frames found in " << dataPath << '\n';
        return;
    }
    std::cout << "Loaded " << frames.size() << " frames from " << dataPath << '\n';

    Weights w{};
    {
        int gen = 0, runs = 0; float fit = 0.f;
        if (!loadPath.empty() && loadModel(loadPath, w, gen, runs, fit))
            std::cout << "Starting from " << loadPath << "  bestFit=" << fit << '\n';
        else { w = randWeights(); std::cout << "Starting from random weights\n"; }
    }

    AdamImitState adam;
    adam.lr = lr;
    const int N = (int)frames.size();

    for (int epoch = 0; epoch < epochs; epoch++) {
        std::shuffle(frames.begin(), frames.end(), rng());
        float totalLoss = 0.f;
        int   correct   = 0;
        for (const auto& fr : frames) {
            auto fwd  = imitForward(w, fr.inp, fr.action);
            auto grad = imitGradient(w, fr.inp, fwd);
            adamStep(w, grad, adam);
            totalLoss += fwd.loss;
            int best = 0;
            for (int k = 1; k < N_ACT; k++)
                if (fwd.p[k] > fwd.p[best]) best = k;
            if (best == fr.action) correct++;
        }
        if ((epoch + 1) % 10 == 0 || epoch == 0) {
            std::cout << std::fixed << std::setprecision(4)
                      << "Epoch " << std::setw(5) << (epoch + 1)
                      << "  loss=" << std::setw(8) << (totalLoss / N)
                      << "  acc="  << std::setw(7) << (100.f * correct / N) << "%\n";
        }
    }

    saveModel(outputPath, w, 0, N * epochs, 0.f);
    std::cout << std::defaultfloat
              << "Imitation learning complete. Saved to " << outputPath << '\n';
}

// ── Episode result ────────────────────────────────────────
struct EpisodeResult {
    float fitness;
    float timeMs;
    bool  reached;
    float progress;   // raw horizontal progress 0-1 (for diagnostics)
};

// ── Run one episode (no rendering, no frame cap) ──────────
EpisodeResult runEpisode(const Weights& weights, const Level& lv) {
    Player player(lv.spawnX, lv.spawnY);
    Memory mem = {};
    float maxX        = lv.spawnX;
    float totalClimb  = 0.f;        // accumulated upward movement across entire episode
    float prevPlayerY = lv.spawnY;  // player Y from previous frame (for climb delta)
    float lastChkX    = lv.spawnX;  // X at last stuck-check
    float lastChkClimb= 0.f;        // totalClimb at last stuck-check
    int   stuckCount  = 0;
    int   lastFrame   = MAX_FRAMES;
    bool  prevJ = false;
    bool  prevX = false;

    for (int frame = 0; frame < MAX_FRAMES; frame++) {
        lastFrame = frame;
        // Death: fell off bottom or hit hazard
        if (player.y > DEAD_Y) break;
        bool dead = false;
        for (const auto& h : lv.hazards) {
            if (rectsOverlap(player.x, player.y, Player::w, Player::h, h)) {
                dead = true; break;
            }
        }
        if (dead) break;

        // Goal reached
        if (rectsOverlap(player.x, player.y, Player::w, Player::h, lv.goal)) {
            float timeMs  = (float)frame * DT * 1000.f;
            float bonus   = std::max(0.f, 1.f - timeMs / 30000.f);
            return {1.f + bonus, timeMs, true, 1.f};
        }

        if (player.x > maxX) maxX = player.x;
        if (player.y < prevPlayerY) totalClimb += prevPlayerY - player.y;
        prevPlayerY = player.y;

        // Early termination: stuck if no horizontal OR vertical progress in 1 second.
        if (frame > 0 && frame % 60 == 0) {
            const float hMove = maxX - lastChkX;
            const float vMove = totalClimb - lastChkClimb;
            if (hMove < 4.f && vMove < 4.f) {
                if (++stuckCount >= 3) break;
            } else {
                stuckCount = 0;
            }
            lastChkX     = maxX;
            lastChkClimb = totalClimb;
        }

        // Sensor inputs
        AgentSensorState sensor{
            player.x, player.y,
            player.Speed.X, player.Speed.Y,
            player.onGround, player.Dashes
        };
        auto inputs = buildSensorInputs(
            sensor, lv.platforms, lv.hazards, lv.goal,
            Player::w, Player::h, MaxRun, MaxFall,
            W_MIN_X, W_MAX_X, W_MIN_Y, W_MAX_Y,
            /*isVertical=*/false, mem
        );

        // Forward pass (updates mem in-place)
        Action act = think(weights, inputs, mem);

        // Build PlayerInput
        PlayerInput inp;
        inp.moveX = act.R ? 1 : (act.L ? -1 : 0);
        // Match JsBridge.cpp / ai-neural.js: grab without jump → climb up (moveY=-1)
        inp.moveY = act.X ? ((act.DY > 0.5f ? 1 : 0) - (act.DY < -0.5f ? 1 : 0))
                          : ((act.G && !act.J) ? -1 : 0);
        inp.jumpPressed = act.J && !prevJ;
        inp.jumpHeld    = act.J;
        inp.dashPressed = act.X && !prevX;
        inp.grabHeld    = act.G;
        prevJ = act.J;
        prevX = act.X;

        player.update(inp, lv.platforms, DT);
    }

    float progress = std::max(0.f, maxX - lv.spawnX)
                   / std::max(1.f, lv.goalEnd - lv.spawnX);
    progress = std::min(progress, 0.9999f);  // below 1 so goal reward stands out
    // Small speed bonus: agents that reach the same X faster score slightly higher.
    // Breaks ties in the gene pool so selection pressure doesn't stall.
    float elapsed = (float)lastFrame * DT;
    float speedBonus = progress * std::max(0.f, 1.f - elapsed / 30.f) * 0.05f;
    // Height bonus: rewards ALL upward movement across the episode (multi-room aware).
    // Capped at 1x map height so it never outweighs horizontal progress.
    float mapH       = std::max(1.f, lv.spawnY - 20.f);
    float heightBonus = std::min(totalClimb / mapH, 1.f) * 0.06f;
    return {progress + speedBonus + heightBonus, elapsed * 1000.f, false, progress};
}

// ── JSON persistence ──────────────────────────────────────
void saveModel(const std::string& path, const Weights& w,
               int gen, int runs, float bestFit) {
    fs::create_directories(fs::path(path).parent_path());
    std::ofstream f(path);
    if (!f) { std::cerr << "Cannot write " << path << '\n'; return; }

    f << "{\n  \"weights\": [";
    for (int i = 0; i < W_SIZE; i++) {
        if (i > 0) f << ',';
        if (i % 8 == 0) f << "\n    ";
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.7g", w[i]);
        f << buf;
    }
    f << "\n  ],\n";
    f << "  \"generation\": " << gen << ",\n";
    f << "  \"runCount\": "   << runs << ",\n";
    f << "  \"bestFit\": "    << std::setprecision(6) << bestFit << ",\n";
    f << "  \"savedAt\": \"offline-trainer\"\n";
    f << "}\n";
}

bool loadModel(const std::string& path, Weights& w,
               int& gen, int& runs, float& bestFit) {
    std::ifstream f(path);
    if (!f) return false;
    std::string content((std::istreambuf_iterator<char>(f)),
                         std::istreambuf_iterator<char>());

    // Extract weights array between first [ and first ]
    auto start = content.find('[');
    auto end   = content.find(']');
    if (start == std::string::npos || end == std::string::npos) return false;

    std::istringstream ss(content.substr(start + 1, end - start - 1));
    std::string tok;
    int i = 0;
    while (std::getline(ss, tok, ',') && i < W_SIZE) {
        try { w[i++] = std::stof(tok); } catch (...) {}
    }
    if (i != W_SIZE) return false;

    auto getInt = [&](const char* key) -> int {
        std::string kk = std::string("\"") + key + "\":";
        auto p = content.find(kk);
        if (p == std::string::npos) return 0;
        try { return std::stoi(content.substr(p + kk.size())); } catch (...) { return 0; }
    };
    auto getFloat = [&](const char* key) -> float {
        std::string kk = std::string("\"") + key + "\":";
        auto p = content.find(kk);
        if (p == std::string::npos) return 0.f;
        try { return std::stof(content.substr(p + kk.size())); } catch (...) { return 0.f; }
    };

    gen     = getInt("generation");
    runs    = getInt("runCount");
    bestFit = getFloat("bestFit");
    return true;
}

// ── Entry point ───────────────────────────────────────────
int main(int argc, char* argv[]) {
    // Defaults
    int         baseSeed   = 42;
    int         numSeeds   = 3;
    int         maxGens    = std::numeric_limits<int>::max();
    int         nThreads   = (int)std::thread::hardware_concurrency();
    if (nThreads < 1) nThreads = 4;
    std::string outputPath = "../game-app/Data/ai-model.json";
    std::string loadPath;
    std::string mode       = "evolve";
    std::string dataPath   = "../game-app/Data/ai-recordings.json";
    int         epochs     = 100;
    float       lr         = 1e-3f;
    bool        easyMode   = false;
    int         evalRounds = 1;    // evaluate each agent on this many seeds, take average

    for (int i = 1; i < argc; i++) {
        auto eq = [&](const char* s){ return std::strcmp(argv[i], s) == 0; };
        auto nxt = [&]() -> int { return (i + 1 < argc) ? ++i, 0 : 0; };
        if      (eq("--seed"))    { nxt(); baseSeed   = std::stoi(argv[i]); }
        else if (eq("--seeds"))   { nxt(); numSeeds   = std::stoi(argv[i]); }
        else if (eq("--gens"))    { nxt(); maxGens    = std::stoi(argv[i]); }
        else if (eq("--threads")) { nxt(); nThreads   = std::stoi(argv[i]); }
        else if (eq("--output"))  { nxt(); outputPath = argv[i]; }
        else if (eq("--load"))    { nxt(); loadPath   = argv[i]; }
        else if (eq("--mode"))    { nxt(); mode       = argv[i]; }
        else if (eq("--data"))    { nxt(); dataPath   = argv[i]; }
        else if (eq("--epochs"))  { nxt(); epochs     = std::stoi(argv[i]); }
        else if (eq("--lr"))      { nxt(); lr         = std::stof(argv[i]); }
        else if (eq("--easy"))       { easyMode = true; }
        else if (eq("--eval-rounds")) { nxt(); evalRounds = std::stoi(argv[i]); }
        else if (eq("--help")) {
            std::cout <<
                "Usage: celeste-trainer [options]\n"
                "  --seed N      Base map seed (default 42)\n"
                "  --seeds N     Seed variants to train across (default 3)\n"
                "  --gens N      Max generations (default: run until Ctrl-C)\n"
                "  --threads N   Worker threads (default: CPU count)\n"
                "  --output PATH Output JSON path (default: ../game-app/Data/ai-model.json)\n"
                "  --load PATH   Resume from this JSON file\n"
                "  --mode MODE   'evolve' (default) or 'imitate'\n"
                "  --data PATH   Recordings JSON for imitate mode\n"
                "  --epochs N    Epochs for imitate mode (default 100)\n"
                "  --lr F        Learning rate for imitate mode (default 0.001)\n";
            return 0;
        }
    }

    if (mode == "imitate") {
        runImitate(dataPath, outputPath, epochs, lr, loadPath);
        return 0;
    }

    // Auto-resume from output path if it exists and --load not given
    if (loadPath.empty() && fs::exists(outputPath))
        loadPath = outputPath;

    // Build training levels
    std::vector<Level> levels;
    for (int s = 0; s < numSeeds; s++)
        levels.push_back(buildLevel(baseSeed + s, easyMode));

    // Initialise pool
    std::vector<PopMember> pool(POOL_SIZE);
    std::optional<Weights> globalBest;
    float globalBestFit      = 0.f;
    float globalBestProgress = 0.f;
    int   startGen = 0, totalRuns = 0;

    if (!loadPath.empty()) {
        Weights lw{}; int lg = 0, lr = 0; float lf = 0.f;
        if (loadModel(loadPath, lw, lg, lr, lf)) {
            std::cout << "Resuming from " << loadPath
                      << "  gen=" << lg << "  bestFit=" << lf << '\n';
            startGen = lg; totalRuns = lr; globalBestFit = lf;
            globalBest = lw;
            pool[0] = {lw, lf};
            for (int i = 1; i < POOL_SIZE; i++)
                pool[i] = {mutateWeights(lw, 0.30f, 0.40f), 0.f};
        } else {
            std::cerr << "Could not load " << loadPath << " — starting fresh\n";
            for (auto& m : pool) m = {randWeights(), 0.f};
        }
    } else {
        for (auto& m : pool) m = {randWeights(), 0.f};
    }

    std::cout << "Offline trainer\n"
              << "  Seeds:   " << numSeeds << " (base=" << baseSeed << ")\n"
              << "  Rounds:  " << evalRounds << " per agent\n"
              << "  Rooms:   " << (easyMode ? "easy (gaps/platform only)" : "full random") << '\n'
              << "  Pool:    " << POOL_SIZE << "  Elites: " << ELITE_K << '\n'
              << "  Threads: " << nThreads << '\n'
              << "  Frames:  " << MAX_FRAMES << " (" << MAX_FRAMES/60 << " s/episode)\n"
              << "  Output:  " << outputPath << "\n\n";

    auto wallStart = std::chrono::steady_clock::now();
    int  bestGoalGen        = -1;
    int  gensSinceImproved  = 0;
    float lastSavedBest     = globalBestFit;

    for (int gen = startGen; gen < startGen + maxGens; gen++) {
        // ── Evaluate pool in parallel ──────────────────────
        std::vector<EpisodeResult> results(POOL_SIZE);
        std::atomic<int> nextIdx(0);

        auto worker = [&]() {
            for (;;) {
                int idx = nextIdx.fetch_add(1, std::memory_order_relaxed);
                if (idx >= POOL_SIZE) return;
                // Evaluate on evalRounds seeds and average fitness/progress
                float bestRoundFit = 0.f, bestRoundProg = 0.f;
                bool anyReached = false;
                for (int r = 0; r < evalRounds; r++) {
                    const Level& lv = levels[(size_t)(idx + gen + r * POOL_SIZE) % levels.size()];
                    EpisodeResult er = runEpisode(pool[idx].weights, lv);
                    if (er.fitness > bestRoundFit) {
                        bestRoundFit = er.fitness; bestRoundProg = er.progress;
                    }
                    if (er.reached) anyReached = true;
                }
                // Use best score across rounds: preserves goal-completion specialisation
                results[idx] = { bestRoundFit, 0.f, anyReached, bestRoundProg };
                pool[idx].fitness = results[idx].fitness;
            }
        };

        std::vector<std::thread> threads;
        threads.reserve(nThreads);
        for (int t = 0; t < nThreads; t++)
            threads.emplace_back(worker);
        for (auto& t : threads) t.join();

        totalRuns += POOL_SIZE;

        // ── Track best ────────────────────────────────────
        for (int i = 0; i < POOL_SIZE; i++) {
            if (results[i].fitness > globalBestFit) {
                globalBestFit     = results[i].fitness;
                globalBestProgress= results[i].progress;
                globalBest        = pool[i].weights;
                if (results[i].reached) bestGoalGen = gen;
                gensSinceImproved = 0;
            }
        }
        gensSinceImproved++;

        // ── Print progress ────────────────────────────────
        if ((gen - startGen) % PRINT_EVERY == 0) {
            auto now  = std::chrono::steady_clock::now();
            double el = std::chrono::duration<double>(now - wallStart).count();
            double gps = (gen - startGen + 1) / el;

            int   reached = 0;
            float sumFit  = 0.f, genBest = 0.f, genBestProg = 0.f;
            for (int i = 0; i < POOL_SIZE; i++) {
                sumFit  += results[i].fitness;
                if (results[i].reached) reached++;
                if (results[i].fitness > genBest) {
                    genBest     = results[i].fitness;
                    genBestProg = results[i].progress;
                }
            }

            std::cout << std::fixed << std::setprecision(4)
                      << "gen="     << std::setw(7) << gen
                      << "  best="  << std::setw(7) << globalBestFit
                      << "  x="     << std::setw(6) << globalBestProgress
                      << "  gBest=" << std::setw(7) << genBest
                      << "  avg="   << std::setw(7) << (sumFit / POOL_SIZE)
                      << "  goals=" << reached << "/" << POOL_SIZE
                      << std::setprecision(1)
                      << "  " << gps << " g/s"
                      << "  runs="  << totalRuns
                      << '\n';
        }

        // ── Periodic save ─────────────────────────────────
        if ((gen - startGen) % SAVE_EVERY == 0 &&
            gen > startGen && globalBest) {
            saveModel(outputPath, *globalBest, gen, totalRuns, globalBestFit);
            std::cout << "  → saved " << outputPath << '\n';
        }

        // ── Diversity injection — break out of local optima ──
        // If global best hasn't improved in 200 gens, replace 80% of pool
        // with high-mutation variants of the best known weights.
        if (gensSinceImproved > 0 && gensSinceImproved % 200 == 0 && globalBest) {
            int replaced = 0;
            for (int i = ELITE_K; i < POOL_SIZE; i++) {
                if (randF() < 0.8f) {
                    float noiseStr = randF() < 0.4f ? 1.2f : 0.6f;
                    pool[i] = {mutateWeights(*globalBest, 0.5f, noiseStr), 0.f};
                    replaced++;
                }
            }
            std::cout << "  [diversity injection: " << replaced
                      << " members reset at gen " << gen << "]\n";
        }

        // ── Breed next generation ─────────────────────────
        std::sort(pool.begin(), pool.end(),
            [](const PopMember& a, const PopMember& b){
                return b.fitness < a.fitness;
            });

        std::vector<PopMember> nextPool(POOL_SIZE);
        // Keep elites unchanged
        for (int i = 0; i < ELITE_K; i++)
            nextPool[i] = pool[i];
        // Breed the rest
        for (int i = ELITE_K; i < POOL_SIZE; i++)
            nextPool[i] = {breedNext(pool, gen - startGen, globalBest), 0.f};

        pool = std::move(nextPool);
    }

    // Final save
    if (globalBest) {
        saveModel(outputPath, *globalBest,
                  startGen + maxGens, totalRuns, globalBestFit);
        std::cout << std::defaultfloat << std::setprecision(6)
                  << "\nDone. bestFit=" << globalBestFit
                  << "  saved to " << outputPath << '\n';
        if (bestGoalGen >= 0)
            std::cout << "First goal reached at generation " << bestGoalGen << '\n';
    }
    return 0;
}
