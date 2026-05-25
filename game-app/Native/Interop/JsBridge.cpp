#include "JsBridge.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cmath>

using namespace emscripten;

// ── Player physics constants (match player.js) ────────────────────────────────
static constexpr float PLAYER_W  =   8.f;
static constexpr float PLAYER_H  =  11.f;
static constexpr float MAX_RUN   =  90.f;
static constexpr float MAX_FALL  = 160.f;
static constexpr int   POOL_SZ   =  16;

// ── AINeuralManager ───────────────────────────────────────────────────────────

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

    _w           = randWeights();
    _adaptSt     = makeAdaptState();
    _stuckSt     = { _w, 0, 0.f };
    _globalBest  = std::nullopt;
    _pool.clear();

    generation           = 0;
    runCount             = 0;
    globalBestFit        = 0.f;
    _runsSinceImproved   = 0;

    initAgents();
}

void AINeuralManager::reset(float spawnX) {
    _spawnX = spawnX;
    _maxX   = spawnX;
    _minY   = _spawnY;
    _prevJ  = false;
}

void AINeuralManager::setBounds(float minX, float maxX, float minY, float maxY) {
    _worldMinX = minX; _worldMaxX = maxX;
    _worldMinY = minY; _worldMaxY = maxY;
}

void AINeuralManager::initAgents() {
    _agents.resize(N_AGENTS - 1);
    for (auto& ag : _agents) {
        ag.w       = _globalBest ? spawnNoise(*_globalBest) : randWeights();
        ag.adaptSt = makeAdaptState();
        ag.stuckSt = { ag.w, 0, 0.f };
        ag.prevJ   = false;
        ag.maxX    = _spawnX;
        ag.minY    = _spawnY;
    }
}

void AINeuralManager::resetAgents() {
    for (auto& ag : _agents) {
        ag.maxX    = _spawnX;
        ag.minY    = _spawnY;
        ag.prevJ   = false;
        ag.adaptSt = makeAdaptState();
        ag.stuckSt = { ag.w, 0, 0.f };
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

void AINeuralManager::_poolUpdate(const Weights& w, float fitness) {
    if ((int)_pool.size() < POOL_SZ) {
        _pool.push_back({ w, fitness });
    } else {
        auto worst = std::min_element(_pool.begin(), _pool.end(),
            [](const PopMember& a, const PopMember& b){ return a.fitness < b.fitness; });
        if (fitness > worst->fitness) { worst->weights = w; worst->fitness = fitness; }
    }
    if (fitness > globalBestFit) {
        globalBestFit = fitness;
        _globalBest   = w;
    }
}

Weights AINeuralManager::_breedWeights() {
    if ((int)_pool.size() < 3)
        return _globalBest ? spawnNoise(*_globalBest) : randWeights();

    std::sort(_pool.begin(), _pool.end(),
        [](const PopMember& a, const PopMember& b){ return b.fitness < a.fitness; });

    float rate = std::max(HP.MUTATE_MIN_R,
                          HP.MUTATE_RATE - (float)generation * HP.MUTATE_DECAY);
    float str  = std::max(HP.MUTATE_MIN_S,
                          HP.MUTATE_STR  - (float)generation * HP.MUTATE_DECAY);

    int n = (int)_pool.size();
    auto pick = [&]() -> const Weights& {
        int idx = (int)(std::pow(randF(), HP.TOURNAMENT_P) * n);
        return _pool[std::min(idx, n - 1)].weights;
    };

    Weights w = crossoverWeights(pick(), pick(), HP.CROSS_ALPHA);
    w = mutateWeights(w, rate, str);
    if (_globalBest && randF() < HP.GLOBAL_BEST_P)
        w = crossoverWeights(w, *_globalBest, 0.25f);
    return spawnNoise(w);
}

void AINeuralManager::_endRun(float fitness) {
    _poolUpdate(_w, fitness);
    if (fitness >= globalBestFit * 0.99f) _runsSinceImproved = 0;
    else                                   _runsSinceImproved++;
    generation++;
    runCount++;
    _w       = _breedWeights();
    _adaptSt = makeAdaptState();
    _stuckSt = { _w, 0, 0.f };
}

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

    ag.w              = adaptTick(ag.w, ag.adaptSt, fitNow);
    ag.stuckSt.weights = ag.w;
    ag.w              = stuckCheck(ag.stuckSt, fitNow, _globalBest);

    const Weights& active = activeWeights(ag.w, ag.adaptSt);

    AgentSensorState state = { px, py, vx, vy, onGround, dashes };
    Inputs inputs = buildSensorInputs(state, plats, hazards, goal,
                                      PLAYER_W, PLAYER_H, MAX_RUN, MAX_FALL,
                                      _worldMinX, _worldMaxX,
                                      _worldMinY, _worldMaxY,
                                      _isVertical);
    Action action = think(active, inputs);

    bool jp    = action.J && !ag.prevJ;
    ag.prevJ   = action.J;

    ActionResult r;
    r.jumpPressed = jp;
    r.jumpHeld    = action.J;
    r.dashPressed = action.X;
    r.grabHeld    = action.G;
    if (action.X) {
        r.moveX = (int)action.DX;
        r.moveY = (int)action.DY;
    } else {
        r.moveX = action.R ? 1 : (action.L ? -1 : 0);
        r.moveY = (action.G && !action.J) ? -1 : 0;
    }
    return r;
}

// ── Public compute methods ────────────────────────────────────────────────────

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

    // Pack main-agent mutable fields into a temporary AgentSt so _runAgent
    // can update them, then write back.
    AgentSt main;
    main.w       = _w;
    main.adaptSt = _adaptSt;
    main.stuckSt = _stuckSt;
    main.prevJ   = _prevJ;
    main.maxX    = _maxX;
    main.minY    = _minY;

    auto r   = _runAgent(main, px, py, vx, vy, onGround, dashes, plats, hazards, goal);

    _w       = main.w;
    _adaptSt = main.adaptSt;
    _stuckSt = main.stuckSt;
    _prevJ   = main.prevJ;
    _maxX    = main.maxX;
    _minY    = main.minY;

    return r;
}

ActionResult AINeuralManager::computeAgent(
    int i,
    float px, float py, float vx, float vy,
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

void AINeuralManager::onDeath() {
    float fit = _isVertical
        ? std::max(0.f, (_spawnY - _minY) / std::max(1.f, _spawnY - _goalY))
        : _maxX / std::max(1.f, _goalEnd);
    _endRun(fit);
    reset(_spawnX);
}

void AINeuralManager::onGoal() {
    float fit = 1.f + 1.f / ((float)runCount + 1.f);
    _endRun(fit);
    reset(_spawnX);
}

void AINeuralManager::killAgent(int i) {
    if (i < 0 || i >= (int)_agents.size()) return;
    auto& ag  = _agents[i];
    float fit = _isVertical
        ? std::max(0.f, (_spawnY - ag.minY) / std::max(1.f, _spawnY - _goalY))
        : ag.maxX / std::max(1.f, _goalEnd);
    _poolUpdate(ag.w, fit);
    Weights nw = _breedWeights();
    ag = { nw, makeAdaptState(), { nw, 0, 0.f }, false, _spawnX, _spawnY };
}

void AINeuralManager::goalAgent(int i) {
    if (i < 0 || i >= (int)_agents.size()) return;
    auto& ag = _agents[i];
    _poolUpdate(ag.w, 1.f + 1.f / ((float)runCount + 1.f));
    Weights nw = _breedWeights();
    ag = { nw, makeAdaptState(), { nw, 0, 0.f }, false, _spawnX, _spawnY };
}

// ── Emscripten bindings ───────────────────────────────────────────────────────

EMSCRIPTEN_BINDINGS(celeste_ai) {
    // Flat float vector — used to pass platform/hazard rect arrays across WASM boundary
    register_vector<float>("VectorFloat");

    // ActionResult — returned by compute / computeAgent
    value_object<ActionResult>("ActionResult")
        .field("moveX",       &ActionResult::moveX)
        .field("moveY",       &ActionResult::moveY)
        .field("jumpPressed", &ActionResult::jumpPressed)
        .field("jumpHeld",    &ActionResult::jumpHeld)
        .field("dashPressed", &ActionResult::dashPressed)
        .field("grabHeld",    &ActionResult::grabHeld)
        ;

    // AINeuralManager — the full AI brain exposed as a JS class
    class_<AINeuralManager>("AINeuralManager")
        .constructor<>()
        .property("generation",    &AINeuralManager::generation)
        .property("runCount",      &AINeuralManager::runCount)
        .property("globalBestFit", &AINeuralManager::globalBestFit)
        .property("N_AGENTS",      &AINeuralManager::N_AGENTS)
        .function("init",          &AINeuralManager::init)
        .function("reset",         &AINeuralManager::reset)
        .function("setBounds",     &AINeuralManager::setBounds)
        .function("initAgents",    &AINeuralManager::initAgents)
        .function("resetAgents",   &AINeuralManager::resetAgents)
        .function("compute",       &AINeuralManager::compute)
        .function("computeAgent",  &AINeuralManager::computeAgent)
        .function("onDeath",       &AINeuralManager::onDeath)
        .function("onGoal",        &AINeuralManager::onGoal)
        .function("killAgent",     &AINeuralManager::killAgent)
        .function("goalAgent",     &AINeuralManager::goalAgent)
        ;
}
