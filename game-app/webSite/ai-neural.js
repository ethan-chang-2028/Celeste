// ai-neural.js  ← PRIMARY AI IMPLEMENTATION
// Neural net: 23 inputs → 20 hidden (ReLU) → 22 outputs (16 actions + 6 memory cells)
// Training: neuroevolution (GA) + real-time ES weight adaptation + stuck detection
// Memory: Elman-style recurrent cells fed back as inputs each frame

(function (global) {
    'use strict';

    // ── Network dimensions ────────────────────────────────────────────────────
    const MEM_SIZE = 6;    // recurrent memory cells (fed back as inputs, written by outputs)
    const N_IN   = 23;    // 12 raycasts + 5 state values + 6 memory cells
    const N_HID  = 20;    // larger hidden layer for more capacity
    const N_OUT  = 22;    // 16 actions + 6 memory-write outputs
    const N_ACT  = N_OUT - MEM_SIZE;  // 16 — action output count (unchanged)
    const W_SIZE = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT; // 942

    // ── Hyperparameters ───────────────────────────────────────────────────────
    const HP = {
        ELITE_K:          2,
        CROSS_ALPHA:      0.5,
        MUTATE_RATE:      0.25,
        MUTATE_STR:       0.50,
        MUTATE_DECAY:     0.003,
        MUTATE_MIN_R:     0.05,
        MUTATE_MIN_S:     0.06,
        GLOBAL_BEST_P:    0.15,
        ADAPT_INTERVAL:   40,
        ADAPT_PERTURB:    0.10,
        ADAPT_FRAC:       0.10,
        ADAPT_LR:         0.020,
        ADAPT_ABSORB:     0.30,
        ADAPT_WINDOW:     8,
        MEM_RESET_THRESH: 50,   // frames stuck → reset memory cells first (cheap)
        STUCK_THRESH:     150,  // frames stuck → mutate weights (last resort)
        STUCK_NOISE:      0.20,
        STUCK_PULL_P:     0.50,
        SPAWN_NOISE_R:    0.05,
        SPAWN_NOISE_S:    0.12,
        EXPLORE_TEMP:     0.55,
        STAGNATE_RUNS:    20,
    };

    // ── Raycast config ────────────────────────────────────────────────────────
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

    // ── Memory state ──────────────────────────────────────────────────────────
    // Returns a zeroed Float32Array of MEM_SIZE — one per agent, reset on death.
    function makeMemState() { return new Float32Array(MEM_SIZE); }

    // ── Forward pass ─────────────────────────────────────────────────────────
    // inputs already includes the 6 memory cells in positions 17-22.
    // think() updates mem in-place with new values from the output layer.
    function think(weights, inputs, mem) {
        // Hidden layer
        const h = new Float32Array(N_HID);
        for (let j = 0; j < N_HID; j++) {
            let s = weights[N_IN * N_HID + j]; // bias
            for (let i = 0; i < N_IN; i++)
                s += inputs[i] * weights[i * N_HID + j];
            h[j] = relu(s);
        }
        // Output layer (all 22 outputs: 16 actions + 6 memory writes)
        const base = N_IN * N_HID + N_HID;
        const out  = new Float32Array(N_OUT);
        for (let k = 0; k < N_OUT; k++) {
            let s = weights[base + N_HID * N_OUT + k]; // bias
            for (let j = 0; j < N_HID; j++)
                s += h[j] * weights[base + j * N_OUT + k];
            out[k] = sigmoid(s);
        }
        // Softmax temperature sampling over ACTION outputs only (first 16)
        let maxO = out[0];
        for (let k = 1; k < N_ACT; k++) if (out[k] > maxO) maxO = out[k];
        let sumE = 0;
        const exps = new Float32Array(N_ACT);
        for (let k = 0; k < N_ACT; k++) { exps[k] = Math.exp((out[k] - maxO) / HP.EXPLORE_TEMP); sumE += exps[k]; }
        let r = rand() * sumE, best = N_ACT - 1;
        for (let k = 0; k < N_ACT; k++) { r -= exps[k]; if (r <= 0) { best = k; break; } }
        // Write new memory values from last MEM_SIZE outputs (scaled [-1,1])
        if (mem) {
            for (let m = 0; m < MEM_SIZE; m++)
                mem[m] = out[N_ACT + m] * 2 - 1;
        }
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

    // ── Real-time ES adaptation ───────────────────────────────────────────────
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

    // ── Scenario answer keys ──────────────────────────────────────────────────
    // Each entry is an array of frames returned directly from compute(), bypassing
    // the neural net for the duration of the escape.
    //
    // Climb-to-top: hold grab + moveY=-1 against the wall until the ceiling ray
    // clears, then ClimbJump off the top.  We budget 60 frames (≈1 s at 60 fps)
    // which is enough to scale any wall height used in the game.
    function makeClimbFrames(wallDir) {
        // wallDir: 1 = right wall (face right), -1 = left wall (face left)
        const frames = [];
        // Frames 0-54: grab the wall and pull upward
        for (let i = 0; i < 55; i++)
            frames.push({ moveX: wallDir, moveY: -1, jumpPressed: false, jumpHeld: false, dashPressed: false, grabHeld: true });
        // Frames 55-57: ClimbJump off the top — release grab, press jump
        for (let i = 0; i < 3; i++)
            frames.push({ moveX: wallDir, moveY: 0, jumpPressed: i === 0, jumpHeld: true, dashPressed: false, grabHeld: false });
        // Frames 58-59: drift away from wall
        for (let i = 0; i < 2; i++)
            frames.push({ moveX: wallDir, moveY: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, grabHeld: false });
        return frames;
    }

    // Fallback wall-jump escape (3 frames) when stamina is low or climb fails
    function makeWallJumpFrames(wallDir) {
        // wallDir: 1 = right wall → jump fires WallJump(-1), -1 = left wall → WallJump(1)
        return [
            { moveX: 0,         moveY: 0, jumpPressed: true,  jumpHeld: true,  dashPressed: false, grabHeld: false },
            { moveX: -wallDir,  moveY: 0, jumpPressed: false, jumpHeld: true,  dashPressed: false, grabHeld: false },
            { moveX: -wallDir,  moveY: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, grabHeld: false },
        ];
    }

    // Returns { wallDir, useClimb } if the sensor snapshot shows the AI pressed
    // against a wall (on the ground OR in the air), otherwise null.
    // Ray indices: 0=right, 4=left, 2=up, 7=down.  inp[12]=onGround, inp[15]=hasDash.
    function detectWallScenario(inputs) {
        const rightClose = inputs[0] < 0.25;
        const leftClose  = inputs[4] < 0.25;
        const ceilingFar = inputs[2] > 0.35;   // enough vertical room to climb

        // Trigger whether on ground or in air — the AI commonly runs into a wall
        // from the ground and needs to climb over it.
        if (rightClose) return { wallDir:  1, useClimb: ceilingFar };
        if (leftClose)  return { wallDir: -1, useClimb: ceilingFar };
        return null;
    }

    // ── Stuck detection ───────────────────────────────────────────────────────
    // Three-stage recovery:
    //   Stage 1 (MEM_RESET_THRESH frames): wipe memory cells — fresh context, keep weights
    //   Stage 2 (SCENARIO_THRESH frames):  run scenario escape sequence if wall detected
    //   Stage 3 (STUCK_THRESH frames):     mutate weights — last resort
    const SCENARIO_THRESH = 80;   // frames stuck before trying scenario escape

    function makeStuckState(w) {
        return { weights: copyW(w), stuckFor: 0, lastFit: 0 };
    }

    function stuckCheck(stuckSt, fitNow, globalBestW, memState, inputs, escapeRef) {
        if (fitNow > stuckSt.lastFit + 0.1) stuckSt.stuckFor = 0;
        else stuckSt.stuckFor++;
        stuckSt.lastFit = fitNow;
        // Stage 1: clear memory — agent gets a fresh context without losing learned weights
        if (stuckSt.stuckFor === HP.MEM_RESET_THRESH && memState) memState.fill(0);
        // Stage 2: scenario escape — climb or wall-jump out of the stuck position
        if (stuckSt.stuckFor === SCENARIO_THRESH && inputs && escapeRef) {
            const sc = detectWallScenario(inputs);
            if (sc) {
                escapeRef.frames = sc.useClimb
                    ? makeClimbFrames(sc.wallDir)
                    : makeWallJumpFrames(sc.wallDir);
                stuckSt.stuckFor = 0;
                return stuckSt.weights;
            }
        }
        if (stuckSt.stuckFor < HP.STUCK_THRESH) return stuckSt.weights;
        // Stage 3: mutate weights (only after much longer stagnation)
        const noise = Math.min(0.5, 0.1 + stuckSt.stuckFor / 500);
        let w = mutateWeights(stuckSt.weights, HP.STUCK_NOISE, noise);
        if (globalBestW && rand() < HP.STUCK_PULL_P) w = crossoverWeights(w, globalBestW, 0.3);
        stuckSt.stuckFor = 0;
        if (memState) memState.fill(0);
        return w;
    }

    // ── Generational evolution ────────────────────────────────────────────────
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

    // ── Sensor system ─────────────────────────────────────────────────────────
    function castRay(cx, cy, dx, dy, platforms, goal, hazards) {
        const b   = (typeof window !== 'undefined' && window.AI_BOUNDS)
                  || { minX: 0, maxX: 1600, minY: -40, maxY: 200 };
        const len = Math.hypot(dx, dy);
        const ndx = dx / len, ndy = dy / len;
        for (let t = RAY_STEP; t <= RAY_LEN; t += RAY_STEP) {
            const rx = cx + ndx * t, ry = cy + ndy * t;
            for (const p of platforms)
                if (rx > p.x && rx < p.x + p.w && ry > p.y && ry < p.y + p.h)
                    return t / RAY_LEN;
            if (hazards) {
                for (const h of hazards)
                    if (rx > h.x && rx < h.x + h.w && ry > h.y && ry < h.y + h.h)
                        return -(t / RAY_LEN);
            }
            if (goal && rx > goal.x && rx < goal.x + goal.w && ry > goal.y && ry < goal.y + goal.h)
                return 0;
            if (rx < b.minX || rx > b.maxX || ry > b.maxY || ry < b.minY)
                return t / RAY_LEN;
        }
        return 1.0;
    }

    // mem is the agent's current Float32Array(MEM_SIZE) — values placed at inputs 17-22.
    function buildSensorInputs(player, platforms, goal, hazards, mem) {
        const inp = new Float32Array(N_IN);
        const cx  = player.x + player.w / 2;
        const cy  = player.y + player.h / 2;
        // 12 raycasts — positive=wall, negative=hazard, zero=goal
        for (let i = 0; i < 12; i++) {
            const [dx, dy] = RAY_DIRS[i];
            inp[i] = castRay(cx, cy, dx, dy, platforms, goal, hazards);
        }
        // 5 state values
        inp[12] = player.onGround ? 1 : 0;
        inp[13] = player.Speed.X / 90;
        inp[14] = player.Speed.Y / 160;
        inp[15] = player.Dashes > 0 ? 1 : 0;
        const gx = (goal.x + goal.w / 2) - cx;
        const gy = (goal.y + goal.h / 2) - cy;
        const gd = Math.hypot(gx, gy) || 1;
        inp[16] = (typeof window !== 'undefined' && window.AI_GOAL_VERTICAL)
                ? (-gy / gd)
                : (gx  / gd);
        // 6 memory cells — carry forward what the agent "remembers" from last frame
        if (mem) {
            for (let m = 0; m < MEM_SIZE; m++) inp[17 + m] = mem[m];
        }
        return inp;
    }

    // ── Training manager ──────────────────────────────────────────────────────
    const POOL_SIZE   = 16;
    const STORAGE_KEY = 'apexAI_bestWeights_v5';

    const NeuralAI = {
        // Public stats
        generation:    0,
        runCount:      0,
        globalBestFit: 0,

        // Internal
        _weights:           null,
        _adaptSt:           null,
        _stuckSt:           null,
        _memState:          null,   // recurrent memory for main agent
        _globalBest:        null,
        _pool:              [],
        _maxX:              0,
        _spawnX:            0,
        _goalEnd:           1600,
        _prevJ:             false,
        _runStartMs:        0,
        _runsSinceImproved: 0,
        _isVertical:        false,
        _spawnY:            0,
        _goalY:             0,
        _minY:              0,
        _escape:            null,   // { frames: [] } — active scenario escape sequence

        RAY_DIRS,
        RAY_LEN,

        _goalFitness(timeMs) {
            const speedBonus = timeMs > 0 ? Math.max(0, 1.0 - timeMs / 30000) : 0;
            return 1.0 + speedBonus;
        },

        _bestTimeMs: Infinity,

        init(spawnX, goalEnd, opts) {
            this._spawnX     = spawnX  || 0;
            this._goalEnd    = goalEnd || 1600;
            this._isVertical = !!(opts && opts.isVertical);
            this._spawnY     = (opts && opts.spawnY != null) ? opts.spawnY : 0;
            this._goalY      = (opts && opts.goalY  != null) ? opts.goalY  : 0;
            this._minY       = this._spawnY;
            this._weights    = this._load() || randWeights();
            this._adaptSt    = makeAdaptState();
            this._stuckSt    = makeStuckState(this._weights);
            this._memState   = makeMemState();
            this._maxX       = this._spawnX;
            this._prevJ      = false;
            this._escape     = null;
            this._pool       = [];
            this._runStartMs = performance.now();
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
            this._memState = makeMemState();
            this._prevJ   = false;
            this._escape  = null;
            this._runStartMs = performance.now();
        },

        // ── Called every frame when AI is active ─────────────────────────────
        compute(player, platforms, goal, hazards) {
            this._maxX = Math.max(this._maxX, player.x);
            if (this._isVertical) this._minY = Math.min(this._minY, player.y);
            const fitNow = this._isVertical
                ? Math.max(0, (this._spawnY - this._minY) / Math.max(1, this._spawnY - this._goalY))
                : this._maxX / this._goalEnd;

            this._weights = adaptTick(this._weights, this._adaptSt, fitNow);

            // Build sensors before stuckCheck so the scenario detector can read them
            const inputs = buildSensorInputs(player, platforms, goal, hazards, this._memState);

            if (!this._escape) this._escape = { frames: [] };
            this._stuckSt.weights = this._weights;
            this._weights = stuckCheck(
                this._stuckSt, fitNow, this._globalBest, this._memState,
                inputs, this._escape
            );

            // If a scenario escape is active, play the next scripted frame
            if (this._escape.frames.length > 0) {
                return this._escape.frames.shift();
            }

            const w      = activeWeights(this._weights, this._adaptSt);
            const action = think(w, inputs, this._memState);  // updates _memState in-place

            const jumpPressed = action.J && !this._prevJ;
            this._prevJ = action.J;

            const moveX = action.X ? action.DX : (action.R ? 1 : (action.L ? -1 : 0));
            const moveY = action.X ? action.DY : ((action.G && !action.J) ? -1 : 0);
            return {
                moveX, moveY,
                jumpPressed,
                jumpHeld:    action.J,
                dashPressed: action.X,
                grabHeld:    !!action.G,
            };
        },

        onDeath() {
            const fit = this._isVertical
                ? Math.max(0, (this._spawnY - this._minY) / Math.max(1, this._spawnY - this._goalY))
                : this._maxX / this._goalEnd;
            this._endRun(fit);
        },

        onGoal(timeMs) {
            const ms = timeMs != null ? timeMs : (performance.now() - this._runStartMs);
            if (ms < this._bestTimeMs) this._bestTimeMs = ms;
            this._endRun(this._goalFitness(ms));
        },

        learnFromRoute(timeMs) {
            if (timeMs == null || timeMs <= 0) return;
            if (timeMs < this._bestTimeMs) this._bestTimeMs = timeMs;
            const fit  = this._goalFitness(timeMs) * 1.02;
            const base = this._globalBest || this._weights || randWeights();
            this._poolUpdate(spawnNoise(base),                fit);
            this._poolUpdate(mutateWeights(base, 0.15, 0.20), fit * 0.99);
        },

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
            this._weights  = this._breedWeights();
            this._adaptSt  = makeAdaptState();
            this._stuckSt  = makeStuckState(this._weights);
            this._memState = makeMemState();   // memory resets on death/goal
            this._maxX     = this._spawnX;
            this._minY     = this._spawnY;
            this._prevJ    = false;
            this._runStartMs = performance.now();
        },

        readSensors(player, platforms, goal, hazards) {
            if (!goal) return null;
            const mem = new Float32Array(MEM_SIZE);
            return buildSensorInputs(player, platforms, goal, hazards, mem);
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
            this._adaptSt  = makeAdaptState();
            this._stuckSt  = makeStuckState(this._weights);
            this._memState = makeMemState();
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
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
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
            try {
                const s = localStorage.getItem(STORAGE_KEY);
                if (s) {
                    const obj = JSON.parse(s);
                    const arr = obj.weights || obj;
                    if (Array.isArray(arr) && arr.length === W_SIZE) {
                        if (obj.generation) this.generation    = obj.generation;
                        if (obj.runCount)   this.runCount      = obj.runCount;
                        if (obj.bestFit)    this.globalBestFit = obj.bestFit;
                        return new Float32Array(arr);
                    }
                }
            } catch (_) {}
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
                if ((obj.bestFit || 0) > this.globalBestFit) {
                    this._globalBest   = new Float32Array(arr);
                    this.globalBestFit = obj.bestFit    || 0;
                    this.generation    = obj.generation || 0;
                    this.runCount      = obj.runCount   || 0;
                    this._weights  = spawnNoise(this._globalBest);
                    this._stuckSt  = makeStuckState(this._weights);
                    this._memState = makeMemState();
                    console.log(`[NeuralAI] Loaded server weights — Gen ${this.generation}, Best ${(this.globalBestFit*100).toFixed(0)}%`);
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: arr, generation: this.generation, runCount: this.runCount, bestFit: this.globalBestFit })); } catch (_) {}
                }
            } catch (_) {}
        },
    };

    global.NeuralAI = NeuralAI;

})(typeof window !== 'undefined' ? window : globalThis);
