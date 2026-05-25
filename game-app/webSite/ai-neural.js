// ai-neural.js  ← PRIMARY AI IMPLEMENTATION
// Neural net: 17 inputs → 14 hidden (ReLU) → 16 outputs (softmax)
// Training: neuroevolution (GA) + real-time ES weight adaptation + stuck detection
// Architecture reference: game-app/Native/Engine/Ai/ai_learning.hpp

(function (global) {
    'use strict';

    // ── Network dimensions (mirrors ai_learning.hpp) ──────────────────────────
    const N_IN   = 17;
    const N_HID  = 14;
<<<<<<< claude/great-sagan-7X0jp
    const N_OUT  = 16;
    const W_SIZE = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT; // 492
=======
    const N_OUT  = 9;
    const W_SIZE = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT; // 387
>>>>>>> main

    // ── Hyperparameters ───────────────────────────────────────────────────────
    const HP = {
        ELITE_K:        2,
        CROSS_ALPHA:    0.5,
        MUTATE_RATE:    0.25,   // was 0.20 — explore weight space faster
        MUTATE_STR:     0.50,   // was 0.35 — bigger jumps to escape local optima
        MUTATE_DECAY:   0.003,
        MUTATE_MIN_R:   0.05,   // was 0.04
        MUTATE_MIN_S:   0.06,   // was 0.04
        GLOBAL_BEST_P:  0.15,
        ADAPT_INTERVAL: 40,
        ADAPT_PERTURB:  0.10,   // was 0.08
        ADAPT_FRAC:     0.10,   // was 0.08
        ADAPT_LR:       0.020,  // was 0.015
        ADAPT_ABSORB:   0.30,
        ADAPT_WINDOW:   8,
        STUCK_THRESH:   50,     // was 80 — detect in-run stagnation sooner
        STUCK_NOISE:    0.20,   // was 0.15
        STUCK_PULL_P:   0.50,   // was 0.40
        SPAWN_NOISE_R:  0.05,
        SPAWN_NOISE_S:  0.12,   // was 0.08
        EXPLORE_TEMP:   0.55,   // NEW: softmax temperature (lower = greedier)
        STAGNATE_RUNS:  20,     // NEW: inject fresh agents after this many non-improving runs
    };

    // ── Raycast config (from sensor section) ─────────────────────────────────
    const RAY_LEN  = 110;
    const RAY_STEP = 5;
    const RAY_DIRS = [
        [ 1,  0   ], [ 1, -0.6 ], [ 0,   -1   ], [-1, -0.6],
        [-1,  0   ], [ 0.7,-0.7], [ 1,    0.5 ], [ 0,  1  ],
        [ 0.5,-1  ], [-0.5,-1  ], [ 1,   -1   ], [-1, -1  ],
    ];

    // ── RNG ───────────────────────────────────────────────────────────────────
    const rand    = () => Math.random();
    const randSym = () => rand() * 2 - 1;
    const randInt = n  => Math.floor(rand() * n);

    // ── Weight utilities ──────────────────────────────────────────────────────
    function randWeights() {
        const w = new Float32Array(W_SIZE);
        for (let i = 0; i < W_SIZE; i++) w[i] = randSym();
        return w;
    }

    function clamp(w) {
        for (let i = 0; i < W_SIZE; i++) w[i] = Math.max(-5, Math.min(5, w[i]));
        return w;
    }

    function copyW(w) { return new Float32Array(w); }

    // ── Activations ───────────────────────────────────────────────────────────
    const relu    = x => x > 0 ? x : 0;
    const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, x))));

    // ── Forward pass ─────────────────────────────────────────────────────────
    function think(weights, inputs) {
        // Hidden layer
        const h = new Float32Array(N_HID);
        for (let j = 0; j < N_HID; j++) {
            let s = weights[N_IN * N_HID + j]; // bias
            for (let i = 0; i < N_IN; i++)
                s += inputs[i] * weights[i * N_HID + j];
            h[j] = relu(s);
        }
        // Output layer
        const base = N_IN * N_HID + N_HID;
        const out  = new Float32Array(N_OUT);
        for (let k = 0; k < N_OUT; k++) {
            let s = weights[base + N_HID * N_OUT + k]; // bias
            for (let j = 0; j < N_HID; j++)
                s += h[j] * weights[base + j * N_OUT + k];
            out[k] = sigmoid(s);
        }
        // Softmax temperature sampling — probabilistic, not deterministic argmax.
        // Same weights → different actions → the AI explores rather than repeating.
        let maxO = out[0];
        for (let k = 1; k < N_OUT; k++) if (out[k] > maxO) maxO = out[k];
        let sumE = 0;
        const exps = new Float32Array(N_OUT);
        for (let k = 0; k < N_OUT; k++) { exps[k] = Math.exp((out[k] - maxO) / HP.EXPLORE_TEMP); sumE += exps[k]; }
        let r = rand() * sumE, best = N_OUT - 1;
        for (let k = 0; k < N_OUT; k++) { r -= exps[k]; if (r <= 0) { best = k; break; } }
<<<<<<< claude/great-sagan-7X0jp
        // 0=left  1=right  2=jump  3=dash→right  4=jump+right  5=jump+left
        // 6=grab+climb-left  7=grab+climb-right  8=grab+wall-jump
        // 9=dash→left  10=dash→up  11=dash→up-right  12=dash→up-left
        // 13=dash→down  14=dash→down-right  15=dash→down-left
        //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
        const DASH_DX  =  [ 0, 0, 0, 1, 0, 0, 0, 0, 0,-1, 0, 1,-1, 0, 1,-1];
        const DASH_DY  =  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,-1,-1,-1, 1, 1, 1];
        const isDash   = best === 3 || best >= 9;
        return {
            L:  best === 0 || best === 5 || best === 6,
            R:  best === 1 || best === 4 || best === 7,
            J:  best === 2 || best === 4 || best === 5 || best === 8,
            X:  isDash,
            G:  best === 6 || best === 7 || best === 8,
            DX: DASH_DX[best],
            DY: DASH_DY[best],
=======
        // 0=left  1=right  2=jump  3=dash  4=jump+right  5=jump+left
        // 6=grab+climb-left  7=grab+climb-right  8=grab+wall-jump
        return {
            L: best === 0 || best === 5 || best === 6,
            R: best === 1 || best === 4 || best === 7,
            J: best === 2 || best === 4 || best === 5 || best === 8,
            X: best === 3,
            G: best === 6 || best === 7 || best === 8,
>>>>>>> main
        };
    }

    // ── Genetic operators ─────────────────────────────────────────────────────
    function mutateWeights(w, rate, strength) {
        const out = copyW(w);
        for (let i = 0; i < W_SIZE; i++)
            if (rand() < rate) out[i] += randSym() * strength;
        return clamp(out);
    }

    function crossoverWeights(a, b, alpha) {
        alpha = alpha !== undefined ? alpha : HP.CROSS_ALPHA;
        const out = new Float32Array(W_SIZE);
        for (let i = 0; i < W_SIZE; i++) out[i] = rand() < alpha ? a[i] : b[i];
        return out;
    }

    function spawnNoise(w) {
        const out = copyW(w);
        const n   = Math.floor(W_SIZE * HP.SPAWN_NOISE_R);
        for (let k = 0; k < n; k++) out[randInt(W_SIZE)] += randSym() * HP.SPAWN_NOISE_S;
        return clamp(out);
    }

    // ── Real-time ES adaptation (mirrors AdaptState + adaptTick) ─────────────
    function makeAdaptState() {
        return { history: [], lastDW: null, perturbedW: null, usingPerturbed: false, windowFitStart: 0, tick: 0 };
    }

    function beginPerturbWindow(baseW, state, fitNow) {
        const dw = new Float32Array(W_SIZE);
        const n  = Math.floor(W_SIZE * HP.ADAPT_FRAC);
        for (let k = 0; k < n; k++) dw[randInt(W_SIZE)] = randSym() * HP.ADAPT_PERTURB;
        const perturbed = copyW(baseW);
        for (let i = 0; i < W_SIZE; i++) perturbed[i] = Math.max(-5, Math.min(5, perturbed[i] + dw[i]));
        state.lastDW = dw; state.perturbedW = perturbed;
        state.usingPerturbed = true; state.windowFitStart = fitNow;
    }

    function endPerturbWindow(baseW, state, fitNow) {
        if (!state.lastDW) return baseW;
        const reward = fitNow - state.windowFitStart;
        state.history.push({ dw: state.lastDW, reward });
        if (state.history.length > HP.ADAPT_WINDOW) state.history.shift();
        let out = copyW(baseW);
        if (state.history.length >= 2) {
            let baseline = 0;
            for (const h of state.history) baseline += h.reward;
            baseline /= state.history.length;
            for (const h of state.history) {
                const adv = h.reward - baseline;
                if (Math.abs(adv) < 0.01) continue;
                const lr = HP.ADAPT_LR * (adv > 0 ? 1 : -1);
                for (let i = 0; i < W_SIZE; i++) out[i] += lr * h.dw[i] * adv;
            }
            clamp(out);
        }
        if (reward > 0.5)
            for (let i = 0; i < W_SIZE; i++)
                out[i] = Math.max(-5, Math.min(5, out[i] + state.lastDW[i] * HP.ADAPT_ABSORB));
        state.usingPerturbed = false;
        return out;
    }

    function activeWeights(baseW, state) {
        return (state.usingPerturbed && state.perturbedW) ? state.perturbedW : baseW;
    }

    function adaptTick(baseW, state, fitNow) {
        state.tick++;
        if      (state.tick % HP.ADAPT_INTERVAL === 1) { beginPerturbWindow(baseW, state, fitNow); return baseW; }
        else if (state.tick % HP.ADAPT_INTERVAL === 0) { return endPerturbWindow(baseW, state, fitNow); }
        return baseW;
    }

    // ── Stuck detection (mirrors stuckCheck) ──────────────────────────────────
    function makeStuckState(w) {
        return { weights: copyW(w), stuckFor: 0, lastFit: 0 };
    }

    function stuckCheck(stuckSt, fitNow, globalBestW) {
        if (fitNow > stuckSt.lastFit + 0.1) stuckSt.stuckFor = 0;
        else stuckSt.stuckFor++;
        stuckSt.lastFit = fitNow;
        if (stuckSt.stuckFor < HP.STUCK_THRESH) return stuckSt.weights;
        const noise = Math.min(0.5, 0.1 + stuckSt.stuckFor / 500);
        let w = mutateWeights(stuckSt.weights, HP.STUCK_NOISE, noise);
        if (globalBestW && rand() < HP.STUCK_PULL_P) w = crossoverWeights(w, globalBestW, 0.3);
        stuckSt.stuckFor = 0;
        return w;
    }

    // ── Generational evolution (mirrors breedGeneration) ─────────────────────
    function breedNext(pool, generation, globalBestW) {
        pool.sort((a, b) => b.fitness - a.fitness);
        const n    = pool.length;
        const rate = Math.max(HP.MUTATE_MIN_R, HP.MUTATE_RATE - generation * HP.MUTATE_DECAY);
        const str  = Math.max(HP.MUTATE_MIN_S, HP.MUTATE_STR  - generation * HP.MUTATE_DECAY);
        const pick = () => pool[Math.min(Math.floor(Math.pow(rand(), 1.5) * n), n - 1)];
        let w = crossoverWeights(pick().weights, pick().weights, HP.CROSS_ALPHA);
        w = mutateWeights(w, rate, str);
        if (globalBestW && rand() < HP.GLOBAL_BEST_P) w = crossoverWeights(w, globalBestW, 0.25);
        return spawnNoise(w);
    }

    // ── Sensor system (mirrors buildSensorInputs + castRay) ───────────────────
    function castRay(cx, cy, dx, dy, platforms, goal) {
        const b   = (typeof window !== 'undefined' && window.AI_BOUNDS)
                  || { minX: 0, maxX: 1600, minY: -40, maxY: 200 };
        const len = Math.hypot(dx, dy);
        const ndx = dx / len, ndy = dy / len;
        for (let t = RAY_STEP; t <= RAY_LEN; t += RAY_STEP) {
            const rx = cx + ndx * t, ry = cy + ndy * t;
            for (const p of platforms)
                if (rx > p.x && rx < p.x + p.w && ry > p.y && ry < p.y + p.h)
                    return t / RAY_LEN;
            if (goal && rx > goal.x && rx < goal.x + goal.w && ry > goal.y && ry < goal.y + goal.h)
                return 0;
            if (rx < b.minX || rx > b.maxX || ry > b.maxY || ry < b.minY)
                return t / RAY_LEN;
        }
        return 1.0;
    }

    function buildSensorInputs(player, platforms, goal) {
        const inp = new Float32Array(N_IN);
        const cx  = player.x + player.w / 2;
        const cy  = player.y + player.h / 2;
        // 12 raycasts
        for (let i = 0; i < 12; i++) {
            const [dx, dy] = RAY_DIRS[i];
            inp[i] = castRay(cx, cy, dx, dy, platforms, goal);
        }
        // 5 state values
        inp[12] = player.onGround ? 1 : 0;
        inp[13] = player.Speed.X / 90;   // normalised by MaxRun
        inp[14] = player.Speed.Y / 160;  // normalised by MaxFall
        inp[15] = player.Dashes > 0 ? 1 : 0;
        // Direction toward goal: horizontal for h-levels, vertical (up) for v-levels
        const gx = (goal.x + goal.w / 2) - cx;
        const gy = (goal.y + goal.h / 2) - cy;
        const gd = Math.hypot(gx, gy) || 1;
        inp[16] = (typeof window !== 'undefined' && window.AI_GOAL_VERTICAL)
                ? (-gy / gd)   // positive = goal is above
                : (gx  / gd);  // positive = goal is to the right
        return inp;
    }

    // ── Training manager ──────────────────────────────────────────────────────
    const POOL_SIZE   = 16;  // was 12 — more diversity in gene pool
<<<<<<< claude/great-sagan-7X0jp
    const STORAGE_KEY = 'apexAI_bestWeights_v3';
=======
    const STORAGE_KEY = 'apexAI_bestWeights_v2';
>>>>>>> main

    const NeuralAI = {
        // Public stats
        generation:    0,
        runCount:      0,
        globalBestFit: 0,

        // Internal
        _weights:           null,
        _adaptSt:           null,
        _stuckSt:           null,
        _globalBest:        null,
        _pool:              [],
        _maxX:              0,
        _spawnX:            0,
        _goalEnd:           1600,
        _prevJ:             false,
        _runsSinceImproved: 0,
        N_AGENTS:      8,   // total agents (1 main + 7 ghosts)
        _agentStates:  [],  // per-ghost state (main agent state is the top-level fields)
        _isVertical:        false,
        _spawnY:            0,
        _goalY:             0,
        _minY:              0,

        // Expose RAY_DIRS so game.js can draw the rays
        RAY_DIRS,
        RAY_LEN,

        init(spawnX, goalEnd, opts) {
            this._spawnX     = spawnX  || 0;
            this._goalEnd    = goalEnd || 1600;
            this._isVertical = !!(opts && opts.isVertical);
            this._spawnY     = (opts && opts.spawnY != null) ? opts.spawnY : 0;
            this._goalY      = (opts && opts.goalY  != null) ? opts.goalY  : 0;
            this._minY       = this._spawnY;
            this._weights = this._load() || randWeights();
            this._adaptSt = makeAdaptState();
            this._stuckSt = makeStuckState(this._weights);
            this._maxX    = this._spawnX;
            this._pool    = [];
            this._prevJ   = false;
        },

        reset(spawnX, opts) {
            this._spawnX = spawnX;
            this._maxX   = spawnX;
            if (opts) {
                if (opts.isVertical !== undefined) this._isVertical = opts.isVertical;
                if (opts.spawnY     != null)       this._spawnY     = opts.spawnY;
                if (opts.goalY      != null)       this._goalY      = opts.goalY;
            }
            this._minY    = this._spawnY;
            this._adaptSt = makeAdaptState();
            this._stuckSt = makeStuckState(this._weights);
            this._prevJ   = false;
        },

        // ── Called every frame when AI is active ─────────────────────────────
        compute(player, platforms, goal) {
            this._maxX = Math.max(this._maxX, player.x);
            if (this._isVertical) this._minY = Math.min(this._minY, player.y);
            const fitNow = this._isVertical
                ? Math.max(0, (this._spawnY - this._minY) / Math.max(1, this._spawnY - this._goalY))
                : this._maxX / this._goalEnd;

            // Real-time ES adaptation
            this._weights = adaptTick(this._weights, this._adaptSt, fitNow);

            // Stuck detection
            this._stuckSt.weights = this._weights;
            this._weights = stuckCheck(this._stuckSt, fitNow, this._globalBest);

            // Use possibly-perturbed weights for this frame
            const w      = activeWeights(this._weights, this._adaptSt);
            const inputs = buildSensorInputs(player, platforms, goal);
            const action = think(w, inputs);

            const jumpPressed = action.J && !this._prevJ;
            this._prevJ = action.J;

            const moveX = action.X ? action.DX : (action.R ? 1 : (action.L ? -1 : 0));
            const moveY = action.X ? action.DY : ((action.G && !action.J) ? -1 : 0);
            return {
<<<<<<< claude/great-sagan-7X0jp
                moveX, moveY,
=======
                moveX:       action.R ? 1 : (action.L ? -1 : 0),
                moveY:       (action.G && !action.J) ? -1 : 0,  // climb up when grabbing (not wall-jumping)
>>>>>>> main
                jumpPressed,
                jumpHeld:    action.J,
                dashPressed: action.X,
                grabHeld:    !!action.G,
            };
        },

        // ── Called on death ───────────────────────────────────────────────────
        onDeath() {
            const fit = this._isVertical
                ? Math.max(0, (this._spawnY - this._minY) / Math.max(1, this._spawnY - this._goalY))
                : this._maxX / this._goalEnd;
            this._endRun(fit);
        },

        // ── Called on goal reached ────────────────────────────────────────────
        onGoal()  { this._endRun(1.0 + 1.0 / (this.runCount + 1)); },

        _poolUpdate(weights, fitness) {
            this.runCount++;
            this._pool.push({ weights: copyW(weights), fitness });
            if (this._pool.length > POOL_SIZE) {
                this._pool.sort((a, b) => a.fitness - b.fitness);
                this._pool.shift();
            }
            if (fitness > this.globalBestFit) {
                this.globalBestFit      = fitness;
                this._globalBest        = copyW(weights);
                this._runsSinceImproved = 0;
                this._save();
            } else {
                this._runsSinceImproved++;
            }
            if (this._runsSinceImproved >= HP.STAGNATE_RUNS && this._pool.length >= 3) {
                const base = this._globalBest || weights;
                this._pool.sort((a, b) => a.fitness - b.fitness);
                this._pool[0] = { weights: mutateWeights(base, 0.45, 0.75), fitness: 0 };
                this._pool[1] = { weights: randWeights(),                    fitness: 0 };
                this._runsSinceImproved = 0;
            }
        },

        _breedWeights() {
            if (this._pool.length >= 3) {
                this.generation++;
                return breedNext(this._pool, this.generation, this._globalBest);
            }
            return mutateWeights(this._weights, HP.MUTATE_RATE, HP.MUTATE_STR);
        },

        _endRun(fitness) {
            this._poolUpdate(this._weights, fitness);
            this._weights = this._breedWeights();
            this._adaptSt = makeAdaptState();
            this._stuckSt = makeStuckState(this._weights);
            this._maxX    = this._spawnX;
            this._minY    = this._spawnY;
            this._prevJ   = false;
        },

        resetWeights() {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            this._serverSave(null).catch(() => {});
            this._weights           = randWeights();
            this._pool              = [];
            this._globalBest        = null;
            this.generation         = 0;
            this.runCount           = 0;
            this.globalBestFit      = 0;
            this._runsSinceImproved = 0;
            this._adaptSt = makeAdaptState();
            this._stuckSt = makeStuckState(this._weights);
        },

        // ── Ghost agent management ────────────────────────────────────────────────

        _makeGhostState() {
            const w = this._pool.length >= 3
                ? breedNext(this._pool, this.generation, this._globalBest)
                : (this._globalBest ? spawnNoise(this._globalBest) : randWeights());
            return { weights: w, adaptSt: makeAdaptState(), stuckSt: makeStuckState(w),
                     prevJ: false, maxX: this._spawnX, minY: this._spawnY };
        },

        initAgents() {
            this._agentStates = [];
            for (let i = 0; i < this.N_AGENTS - 1; i++)
                this._agentStates.push(this._makeGhostState());
        },

        resetAgents() {
            for (const ag of this._agentStates) {
                ag.maxX = this._spawnX;
                ag.minY = this._spawnY;
                ag.prevJ = false;
                ag.adaptSt = makeAdaptState();
                ag.stuckSt = makeStuckState(ag.weights);
            }
        },

        computeAgent(i, player, platforms, goal) {
            const ag = this._agentStates[i];
            if (!ag) return null;
            ag.maxX = Math.max(ag.maxX, player.x);
            if (this._isVertical) ag.minY = Math.min(ag.minY, player.y);
            const fitNow = this._isVertical
                ? Math.max(0, (this._spawnY - ag.minY) / Math.max(1, this._spawnY - this._goalY))
                : ag.maxX / this._goalEnd;
            ag.weights = adaptTick(ag.weights, ag.adaptSt, fitNow);
            ag.stuckSt.weights = ag.weights;
            ag.weights = stuckCheck(ag.stuckSt, fitNow, this._globalBest);
            const w      = activeWeights(ag.weights, ag.adaptSt);
            const inputs = buildSensorInputs(player, platforms, goal);
            const action = think(w, inputs);
            const jumpPressed = action.J && !ag.prevJ;
            ag.prevJ = action.J;
<<<<<<< claude/great-sagan-7X0jp
            const moveX2 = action.X ? action.DX : (action.R ? 1 : (action.L ? -1 : 0));
            const moveY2 = action.X ? action.DY : ((action.G && !action.J) ? -1 : 0);
            return { moveX: moveX2, moveY: moveY2,
=======
            return { moveX: action.R ? 1 : (action.L ? -1 : 0),
                     moveY: (action.G && !action.J) ? -1 : 0,
>>>>>>> main
                     jumpPressed, jumpHeld: action.J, dashPressed: action.X, grabHeld: !!action.G };
        },

        killAgent(i) {
            const ag = this._agentStates[i];
            if (!ag) return;
            const fitness = this._isVertical
                ? Math.max(0, (this._spawnY - ag.minY) / Math.max(1, this._spawnY - this._goalY))
                : ag.maxX / this._goalEnd;
            this._poolUpdate(ag.weights, fitness);
            const newW = this._breedWeights();
            this._agentStates[i] = { weights: newW, adaptSt: makeAdaptState(),
                                      stuckSt: makeStuckState(newW), prevJ: false,
                                      maxX: this._spawnX, minY: this._spawnY };
        },

        goalAgent(i) {
            const ag = this._agentStates[i];
            if (!ag) return;
            this._poolUpdate(ag.weights, 1.0 + 1.0 / (this.runCount + 1));
            const newW = this._breedWeights();
            this._agentStates[i] = { weights: newW, adaptSt: makeAdaptState(),
                                      stuckSt: makeStuckState(newW), prevJ: false,
                                      maxX: this._spawnX, minY: this._spawnY };
        },

        // ── Persistence: server-first, localStorage fallback ──────────────────
        _save() {
            if (!this._globalBest) return;
            const payload = {
                weights:    Array.from(this._globalBest),
                generation: this.generation,
                runCount:   this.runCount,
                bestFit:    this.globalBestFit,
                savedAt:    new Date().toISOString(),
            };
            // localStorage (instant, always works)
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
            // Server (fire-and-forget, works when server is running)
            this._serverSave(payload).catch(() => {});
        },

        async _serverSave(payload) {
            await fetch('/ai-model', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload || {}),
                signal:  AbortSignal.timeout(3000),
            });
        },

        _load() {
            // Try localStorage first (synchronous, works offline)
            try {
                const s = localStorage.getItem(STORAGE_KEY);
                if (s) {
                    const obj = JSON.parse(s);
                    const arr = obj.weights || obj; // handle both formats
                    if (Array.isArray(arr) && arr.length === W_SIZE) {
                        if (obj.generation) this.generation  = obj.generation;
                        if (obj.runCount)   this.runCount    = obj.runCount;
                        if (obj.bestFit)    this.globalBestFit = obj.bestFit;
                        return new Float32Array(arr);
                    }
                }
            } catch (_) {}

            // Try server async (load in background, apply once received)
            this._serverLoad();
            return null;
        },

        async _serverLoad() {
            try {
                const res = await fetch('/ai-model', { signal: AbortSignal.timeout(3000) });
                if (!res.ok) return;
                const obj = await res.json();
                const arr = obj.weights;
                if (!arr || arr.length !== W_SIZE) return;
                // Only apply if better than what we already have
                if ((obj.bestFit || 0) > this.globalBestFit) {
                    this._globalBest   = new Float32Array(arr);
                    this.globalBestFit = obj.bestFit    || 0;
                    this.generation    = obj.generation || 0;
                    this.runCount      = obj.runCount   || 0;
                    // Seed current weights from server best
                    this._weights = spawnNoise(this._globalBest);
                    this._stuckSt = makeStuckState(this._weights);
                    console.log(`[NeuralAI] Loaded server weights — Gen ${this.generation}, Best ${(this.globalBestFit*100).toFixed(0)}%`);
                    // Cache locally
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: arr, generation: this.generation, runCount: this.runCount, bestFit: this.globalBestFit })); } catch (_) {}
                }
            } catch (_) {}
        },
    };

    global.NeuralAI = NeuralAI;

})(typeof window !== 'undefined' ? window : globalThis);
