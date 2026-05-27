#pragma once
/**
 * JsBridge.h — Emscripten bridge for the C++ neural AI
 *
 * Build:
 *   cd game-app/Native && ./build.sh
 */

#include "../Engine/Ai/ai_learning.hpp"
#include <vector>

// ── Helpers ───────────────────────────────────────────────────────────────────

inline std::vector<Rect> decodeRects(const std::vector<float>& d) {
    std::vector<Rect> out;
    out.reserve(d.size() / 4);
    for (size_t i = 0; i + 3 < d.size(); i += 4)
        out.push_back({ d[i], d[i+1], d[i+2], d[i+3] });
    return out;
}

// ── Action result (returned to JS) ───────────────────────────────────────────

struct ActionResult {
    int  moveX       = 0;
    int  moveY       = 0;
    bool jumpPressed = false;
    bool jumpHeld    = false;
    bool dashPressed = false;
    bool grabHeld    = false;
};

// ── Per-ghost-agent state ─────────────────────────────────────────────────────

struct AgentSt {
    Weights         w;
    AdaptState      adaptSt;
    AgentStuckState stuckSt  = {};
    Memory          memSt    = {};
    bool            prevJ    = false;
    float           maxX     = 0.f;
    float           minY     = 0.f;
    float           runStartMs = 0.f;
};

// ── Main AI manager class (exposed to JS via embind) ─────────────────────────

class AINeuralManager {
public:
    int   generation        = 0;
    int   runCount          = 0;
    float globalBestFit     = 0.f;
    float bestTimeMs        = std::numeric_limits<float>::infinity();
    int   N_AGENTS          = 8;

    void  init(float spawnX, float goalEnd, bool isVertical, float spawnY, float goalY);
    void  reset(float spawnX);
    void  setBounds(float minX, float maxX, float minY, float maxY);
    void  initAgents();
    void  resetAgents();
    void  resetWeights();

    ActionResult compute(
        float px, float py, float vx, float vy, bool onGround, int dashes,
        const std::vector<float>& platData, const std::vector<float>& hazardData,
        float goalX, float goalY, float goalW, float goalH);

    ActionResult computeAgent(
        int i, float px, float py, float vx, float vy, bool onGround, int dashes,
        const std::vector<float>& platData, const std::vector<float>& hazardData,
        float goalX, float goalY, float goalW, float goalH);

    void onDeath();
    void onGoal(float timeMs);
    void killAgent(int i);
    void goalAgent(int i, float timeMs);
    void learnFromRoute(float timeMs);

    // Weights persistence: load/save a flat float array (942 values)
    std::vector<float> getWeights() const;
    void               setWeights(const std::vector<float>& w, int gen, int runs, float bestFit);

private:
    Weights                _w;
    AdaptState             _adaptSt;
    AgentStuckState        _stuckSt  = {};
    Memory                 _memSt    = {};
    std::optional<Weights> _globalBest;
    std::vector<PopMember> _pool;
    bool                   _prevJ    = false;
    float                  _runStartMs = 0.f;

    float _spawnX            = 0.f;
    float _goalEnd           = 1600.f;
    float _maxX              = 0.f;
    int   _runsSinceImproved = 0;

    bool  _isVertical = false;
    float _spawnY = 0.f, _goalY = 0.f, _minY = 0.f;

    float _worldMinX = -20.f, _worldMaxX = 1620.f;
    float _worldMinY = -40.f, _worldMaxY =  200.f;

    std::vector<AgentSt> _agents;

    float        _goalFitness(float timeMs) const;
    float        _nowMs() const;
    void         _poolUpdate(const Weights& w, float fitness);
    Weights      _breedWeights();
    void         _endRun(float fitness);
    ActionResult _runAgent(AgentSt& ag,
                           float px, float py, float vx, float vy,
                           bool onGround, int dashes,
                           const std::vector<Rect>& plats,
                           const std::vector<Rect>& hazards,
                           const Rect& goal);
};
