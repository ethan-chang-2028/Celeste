#include "JsBridge.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cmath>
#include <chrono>

using namespace emscripten;

static constexpr float PLAYER_W  =   8.f;
static constexpr float PLAYER_H  =  11.f;
static constexpr float MAX_RUN   =  90.f;
static constexpr float MAX_FALL  = 160.f;
static constexpr int   POOL_SZ   =  16;

// ── Timing ────────────────────────────────────────────────────────────────────

float AINeuralManager::_nowMs() const {
    using namespace std::chrono;
    static const auto start = steady_clock::now();
    return (float)duration_cast<milliseconds>(steady_clock::now() - start).count();
}

// ── Speed fitness ─────────────────────────────────────────────────────────────

float AINeuralManager::_goalFitness(float timeMs) const {
    float speedBonus = timeMs > 0.f ? std::max(0.f, 1.f - timeMs / 30000.f) : 0.f;
    return 1.f + speedBonus;
}

// ── Initialisation ────────────────────────────────────────────────────────────

void AINeuralManager::init(float spawnX, float goalEnd,
                            bool isVertical, float spawnY, float goalY) {
    _spawnX      = spawnX;
    _goalEnd     = goalEnd;
    _isVertical  = isVertical;
    _spawnY      = spawnY;
    _goalY       = goalY;
    _minY        = spawnY;
    _maxX        = spawnX;
    _prevJ       = false;
    _memSt.fill(0.f);
    _w           = randWeights();
    _adaptSt     = makeAdaptState();
    _stuckSt     = { _w, 0, 0.f };
    _globalBest  = std::nullopt;
    _pool.clear();
    generation           = 0;
    runCount             = 0;
    globalBestFit        = 0.f;
    bestTimeMs           = std::numeric_limits<float>::infinity();
    _runsSinceImproved   = 0;
    _runStartMs          = _nowMs();
    initAgents();
}

void AINeuralManager::reset(float spawnX) {
    _spawnX = spawnX;
    _maxX   = spawnX;
    _minY   = _spawnY;
    _prevJ  = false;
    _memSt.fill(0.f);
    _adaptSt  = makeAdaptState();
    _stuckSt  = { _w, 0, 0.f };
    _runStartMs = _nowMs();
}

void AINeuralManager::setBounds(float minX, float maxX, float minY, float maxY) {
    _worldMinX = minX; _worldMaxX = maxX;
    _worldMinY = minY; _worldMaxY = maxY;
}

void AINeuralManager::resetWeights() {
    init(_spawnX, _goalEnd, _isVertical, _spawnY, _goalY);
}

// ── Agent management ──────────────────────────────────────────────────────────

void AINeuralManager::initAgents() {
    _agents.resize(N_AGENTS - 1);
    float now = _nowMs();
    for (auto& ag : _agents) {
        ag.w          = _globalBest ? spawnNoise(*_globalBest) : randWeights();
        ag.adaptSt    = makeAdaptState();
        ag.stuckSt    = { ag.w, 0, 0.f };
        ag.memSt.fill(0.f);
        ag.prevJ      = false;
        ag.maxX       = _spawnX;
        ag.minY       = _spawnY;
        ag.runStartMs = now;
    }
}

void AINeuralManager::resetAgents() {
    float now = _nowMs();
    for (auto& ag : _agents) {
        ag.maxX       = _spawnX;
        ag.minY       = _spawnY;
        ag.prevJ      = false;
        ag.adaptSt    = makeAdaptState();
        ag.stuckSt    = { ag.w, 0, 0.f };
        ag.memSt.fill(0.f);
        ag.runStartMs = now;
    }
}

// ── Pool / breed ──────────────────────────────────────────────────────────────

void AINeuralManager::_poolUpdate(const Weights& w, float fitness) {
    runCount++;
    _pool.push_back({ w, fitness });
    if ((int)_pool.size() > POOL_SZ) {
        std::sort(_pool.begin(), _pool.end(),
            [](const PopMember& a, const PopMember& b){ return a.fitness < b.fitness; });
        _pool.erase(_pool.begin());
    }
    if (fitness > globalBestFit) {
        globalBestFit      = fitness;
        _globalBest        = w;
        _runsSinceImproved = 0;
    } else {
        _runsSinceImproved++;
    }
    if (_runsSinceImproved >= HP.STAGNATE_RUNS && (int)_pool.size() >= 3) {
        std::sort(_pool.begin(), _pool.end(),
            [](const PopMember& a, const PopMember& b){ return a.fitness < b.fitness; });
        Weights base = _globalBest ? *_globalBest : w;
        _pool[0] = { mutateWeights(base, 0.45f, 0.75f), 0.f };
        _pool[1] = { randWeights(), 0.f };
        _runsSinceImproved = 0;
    }
}

Weights AINeuralManager::_breedWeights() {
    if ((int)_pool.size() < 3)
        return _globalBest ? spawnNoise(*_globalBest) : randWeights();
    return breedNext(_pool, generation, _globalBest);
}

void AINeuralManager::_endRun(float fitness) {
    _poolUpdate(_w, fitness);
    _w       = _breedWeights();
    _adaptSt = makeAdaptState();
    _stuckSt = { _w, 0, 0.f };
    _memSt.fill(0.f);
    _maxX    = _spawnX;
    _minY    = _spawnY;
    _prevJ   = false;
    _runStartMs = _nowMs();
}

// ── Core per-frame logic ──────────────────────────────────────────────────────

ActionResult AINeuralManager::_runAgent(
    AgentSt& ag,
    float px, float py, float vx, float vy,
    bool onGround, int dashes,
    const std::vector<Rect>& plats,
    const std::vector<Rect>& hazards,
    const Rect& goal)
{
    ag.maxX = std::max(ag.maxX, px);
    if (_isVertical) ag.minY = std::min(ag.minY, py);

    float fitNow = _isVertical
        ? std::max(0.f, (_spawnY - ag.minY) / std::max(1.f, _spawnY - _goalY))
        : ag.maxX / std::max(1.f, _goalEnd);

    ag.w               = adaptTick(ag.w, ag.adaptSt, fitNow);
    ag.stuckSt.weights = ag.w;
    ag.w               = stuckCheck(ag.stuckSt, fitNow, _globalBest, ag.memSt);

    const Weights& active = activeWeights(ag.w, ag.adaptSt);
    AgentSensorState state = { px, py, vx, vy, onGround, dashes };
    Inputs inputs = buildSensorInputs(state, plats, hazards, goal,
                                      PLAYER_W, PLAYER_H, MAX_RUN, MAX_FALL,
                                      _worldMinX, _worldMaxX, _worldMinY, _worldMaxY,
                                      _isVertical, ag.memSt);
    Action action = think(active, inputs, ag.memSt);

    bool jp  = action.J && !ag.prevJ;
    ag.prevJ = action.J;

    ActionResult r;
    r.jumpPressed = jp;
    r.jumpHeld    = action.J;
    r.dashPressed = action.X;
    r.grabHeld    = action.G;
    if (action.X) { r.moveX = (int)action.DX; r.moveY = (int)action.DY; }
    else          { r.moveX = action.R ? 1 : (action.L ? -1 : 0);
                    r.moveY = (action.G && !action.J) ? -1 : 0; }
    return r;
}

// ── Public compute ────────────────────────────────────────────────────────────

ActionResult AINeuralManager::compute(
    float px, float py, float vx, float vy,
    bool onGround, int dashes,
    const std::vector<float>& platData,
    const std::vector<float>& hazardData,
    float goalX, float goalY, float goalW, float goalH)
{
    auto plats   = decodeRects(platData);
    auto hazards = decodeRects(hazardData);
    Rect goal    = { goalX, goalY, goalW, goalH };

    _maxX = std::max(_maxX, px);
    if (_isVertical) _minY = std::min(_minY, py);

    float fitNow = _isVertical
        ? std::max(0.f, (_spawnY - _minY) / std::max(1.f, _spawnY - _goalY))
        : _maxX / std::max(1.f, _goalEnd);

    _w               = adaptTick(_w, _adaptSt, fitNow);
    _stuckSt.weights = _w;
    _w               = stuckCheck(_stuckSt, fitNow, _globalBest, _memSt);

    const Weights& active = activeWeights(_w, _adaptSt);
    AgentSensorState state = { px, py, vx, vy, onGround, dashes };
    Inputs inputs = buildSensorInputs(state, plats, hazards, goal,
                                      PLAYER_W, PLAYER_H, MAX_RUN, MAX_FALL,
                                      _worldMinX, _worldMaxX, _worldMinY, _worldMaxY,
                                      _isVertical, _memSt);
    Action action = think(active, inputs, _memSt);

    bool jp  = action.J && !_prevJ;
    _prevJ   = action.J;

    ActionResult r;
    r.jumpPressed = jp;
    r.jumpHeld    = action.J;
    r.dashPressed = action.X;
    r.grabHeld    = action.G;
    if (action.X) { r.moveX = (int)action.DX; r.moveY = (int)action.DY; }
    else          { r.moveX = action.R ? 1 : (action.L ? -1 : 0);
                    r.moveY = (action.G && !action.J) ? -1 : 0; }
    return r;
}

ActionResult AINeuralManager::computeAgent(
    int i, float px, float py, float vx, float vy,
    bool onGround, int dashes,
    const std::vector<float>& platData,
    const std::vector<float>& hazardData,
    float goalX, float goalY, float goalW, float goalH)
{
    if (i < 0 || i >= (int)_agents.size()) return {};
    auto plats   = decodeRects(platData);
    auto hazards = decodeRects(hazardData);
    Rect goal    = { goalX, goalY, goalW, goalH };
    return _runAgent(_agents[i], px, py, vx, vy, onGround, dashes, plats, hazards, goal);
}

// ── Life events ───────────────────────────────────────────────────────────────

void AINeuralManager::onDeath() {
    float fit = _isVertical
        ? std::max(0.f, (_spawnY - _minY) / std::max(1.f, _spawnY - _goalY))
        : _maxX / std::max(1.f, _goalEnd);
    _endRun(fit);
}

void AINeuralManager::onGoal(float timeMs) {
    if (timeMs <= 0.f) timeMs = _nowMs() - _runStartMs;
    if (timeMs < bestTimeMs) bestTimeMs = timeMs;
    _endRun(_goalFitness(timeMs));
}

void AINeuralManager::killAgent(int i) {
    if (i < 0 || i >= (int)_agents.size()) return;
    auto& ag  = _agents[i];
    float fit = _isVertical
        ? std::max(0.f, (_spawnY - ag.minY) / std::max(1.f, _spawnY - _goalY))
        : ag.maxX / std::max(1.f, _goalEnd);
    _poolUpdate(ag.w, fit);
    Weights nw  = _breedWeights();
    float   now = _nowMs();
    ag = { nw, makeAdaptState(), { nw, 0, 0.f }, {}, false, _spawnX, _spawnY, now };
}

void AINeuralManager::goalAgent(int i, float timeMs) {
    if (i < 0 || i >= (int)_agents.size()) return;
    auto& ag = _agents[i];
    if (timeMs <= 0.f) timeMs = _nowMs() - ag.runStartMs;
    if (timeMs < bestTimeMs) bestTimeMs = timeMs;
    _poolUpdate(ag.w, _goalFitness(timeMs));
    Weights nw  = _breedWeights();
    float   now = _nowMs();
    ag = { nw, makeAdaptState(), { nw, 0, 0.f }, {}, false, _spawnX, _spawnY, now };
}

void AINeuralManager::learnFromRoute(float timeMs) {
    if (timeMs <= 0.f) return;
    if (timeMs < bestTimeMs) bestTimeMs = timeMs;
    float fit  = _goalFitness(timeMs) * 1.02f;
    const Weights& base = _globalBest ? *_globalBest : _w;
    _poolUpdate(spawnNoise(base), fit);
    _poolUpdate(mutateWeights(base, 0.15f, 0.20f), fit * 0.99f);
}

// ── Persistence ───────────────────────────────────────────────────────────────

std::vector<float> AINeuralManager::getWeights() const {
    if (!_globalBest) return {};
    return std::vector<float>(_globalBest->begin(), _globalBest->end());
}

void AINeuralManager::setWeights(const std::vector<float>& w, int gen, int runs, float bestFit) {
    if ((int)w.size() != W_SIZE) return;
    Weights loaded;
    std::copy(w.begin(), w.end(), loaded.begin());
    if (bestFit > globalBestFit) {
        _globalBest   = loaded;
        globalBestFit = bestFit;
        generation    = gen;
        runCount      = runs;
        _w            = spawnNoise(loaded);
        _stuckSt      = { _w, 0, 0.f };
        _memSt.fill(0.f);
    }
}

// ── Emscripten bindings ───────────────────────────────────────────────────────

EMSCRIPTEN_BINDINGS(celeste_ai) {
    register_vector<float>("VectorFloat");

    value_object<ActionResult>("ActionResult")
        .field("moveX",       &ActionResult::moveX)
        .field("moveY",       &ActionResult::moveY)
        .field("jumpPressed", &ActionResult::jumpPressed)
        .field("jumpHeld",    &ActionResult::jumpHeld)
        .field("dashPressed", &ActionResult::dashPressed)
        .field("grabHeld",    &ActionResult::grabHeld)
        ;

    class_<AINeuralManager>("AINeuralManager")
        .constructor<>()
        .property("generation",    &AINeuralManager::generation)
        .property("runCount",      &AINeuralManager::runCount)
        .property("globalBestFit", &AINeuralManager::globalBestFit)
        .property("bestTimeMs",    &AINeuralManager::bestTimeMs)
        .property("N_AGENTS",      &AINeuralManager::N_AGENTS)
        .function("init",          &AINeuralManager::init)
        .function("reset",         &AINeuralManager::reset)
        .function("setBounds",     &AINeuralManager::setBounds)
        .function("initAgents",    &AINeuralManager::initAgents)
        .function("resetAgents",   &AINeuralManager::resetAgents)
        .function("resetWeights",  &AINeuralManager::resetWeights)
        .function("compute",       &AINeuralManager::compute)
        .function("computeAgent",  &AINeuralManager::computeAgent)
        .function("onDeath",       &AINeuralManager::onDeath)
        .function("onGoal",        &AINeuralManager::onGoal)
        .function("killAgent",     &AINeuralManager::killAgent)
        .function("goalAgent",     &AINeuralManager::goalAgent)
        .function("learnFromRoute",&AINeuralManager::learnFromRoute)
        .function("getWeights",    &AINeuralManager::getWeights)
        .function("setWeights",    &AINeuralManager::setWeights)
        ;
}
