/**
 * ai-wasm-bridge.js
 *
 * Loads the Emscripten-compiled C++ AI (ai-neural.wasm) and replaces the
 * pure-JS NeuralAI object with a WASM-backed version that exposes the same
 * API as ai-neural.js so game.js needs no changes.
 *
 * Falls back to ai-neural.js silently if WASM files are absent or fail to load.
 *
 * Build: cd game-app/Native && ./build.sh
 */

(function () {
    'use strict';

    if (typeof CelesteAI === 'undefined') return;

    const STORAGE_KEY = 'apexAI_bestWeights_v5';

    CelesteAI().then(function (Module) {
        const mgr = new Module.AINeuralManager();

        // ── Helpers ───────────────────────────────────────────────────────────

        function toFlatVec(rects) {
            const v = new Module.VectorFloat();
            if (rects) {
                for (const r of rects) {
                    v.push_back(r.x); v.push_back(r.y);
                    v.push_back(r.w); v.push_back(r.h);
                }
            }
            return v;
        }

        function playerState(p) {
            return {
                x: p.x, y: p.y,
                vx: p.Speed ? p.Speed.X : 0,
                vy: p.Speed ? p.Speed.Y : 0,
                onGround: !!p.onGround,
                dashes:   p.Dashes || 0,
            };
        }

        function callMgrCompute(method, args, platData, hazardData, goal) {
            const pv = toFlatVec(platData);
            const hv = toFlatVec(hazardData);
            let res;
            try {
                res = method(...args, pv, hv, goal.x, goal.y, goal.w, goal.h);
            } finally {
                pv.delete(); hv.delete();
            }
            return { moveX: res.moveX, moveY: res.moveY,
                     jumpPressed: res.jumpPressed, jumpHeld: res.jumpHeld,
                     dashPressed: res.dashPressed, grabHeld: res.grabHeld };
        }

        // ── Persistence: load from localStorage / server ──────────────────────

        function loadWeights() {
            try {
                const s = localStorage.getItem(STORAGE_KEY);
                if (s) {
                    const obj = JSON.parse(s);
                    const arr = obj.weights || obj;
                    if (Array.isArray(arr) && arr.length === 942) {
                        const v = new Module.VectorFloat();
                        for (const x of arr) v.push_back(x);
                        mgr.setWeights(v, obj.generation || 0, obj.runCount || 0, obj.bestFit || 0);
                        v.delete();
                    }
                }
            } catch (_) {}
            // Also try server
            fetch('/ai-model', { signal: AbortSignal.timeout(3000) })
                .then(r => r.ok ? r.json() : null)
                .then(obj => {
                    if (!obj || !obj.weights || obj.weights.length !== 942) return;
                    const v = new Module.VectorFloat();
                    for (const x of obj.weights) v.push_back(x);
                    mgr.setWeights(v, obj.generation || 0, obj.runCount || 0, obj.bestFit || 0);
                    v.delete();
                })
                .catch(() => {});
        }

        function saveWeights() {
            const arr = mgr.getWeights();
            if (!arr || arr.size() === 0) return;
            const weights = [];
            for (let i = 0; i < arr.size(); i++) weights.push(arr.get(i));
            arr.delete();
            const payload = {
                weights, generation: mgr.generation, runCount: mgr.runCount,
                bestFit: mgr.globalBestFit, savedAt: new Date().toISOString(),
            };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
            fetch('/ai-model', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(3000),
            }).catch(() => {});
        }

        // ── WASM-backed NeuralAI replacement ──────────────────────────────────
        // Save JS NeuralAI reference before we replace it — needed for readSensors.
        const _jsNeuralAI = window.NeuralAI;

        const wasmAI = {
            get generation()    { return mgr.generation;    },
            get runCount()      { return mgr.runCount;      },
            get globalBestFit() { return mgr.globalBestFit; },
            get _bestTimeMs()   { return mgr.bestTimeMs;    },
            // Keep JS values for ray visualisation (same config as C++)
            RAY_DIRS: window.NeuralAI ? window.NeuralAI.RAY_DIRS : [],
            RAY_LEN:  window.NeuralAI ? window.NeuralAI.RAY_LEN  : 110,

            init(spawnX, goalEnd, opts) {
                const isVert = !!(opts && opts.isVertical);
                const spawnY = (opts && opts.spawnY != null) ? opts.spawnY : 0;
                const goalY  = (opts && opts.goalY  != null) ? opts.goalY  : 0;
                mgr.init(spawnX || 0, goalEnd || 1600, isVert, spawnY, goalY);
                const b = window.AI_BOUNDS;
                if (b) mgr.setBounds(b.minX, b.maxX, b.minY, b.maxY);
                loadWeights();
            },

            reset(spawnX, opts) {
                mgr.reset(spawnX || 0);
            },

            compute(player, platforms, goal, hazards) {
                if (!goal) return null;
                const b = window.AI_BOUNDS;
                if (b) mgr.setBounds(b.minX, b.maxX, b.minY, b.maxY);
                const s = playerState(player);
                return callMgrCompute(
                    mgr.compute.bind(mgr),
                    [s.x, s.y, s.vx, s.vy, s.onGround, s.dashes],
                    platforms, hazards, goal
                );
            },

            onDeath() {
                mgr.onDeath();
                saveWeights();
            },

            onGoal(timeMs) {
                mgr.onGoal(timeMs || 0);
                saveWeights();
            },

            learnFromRoute(timeMs) {
                mgr.learnFromRoute(timeMs || 0);
                saveWeights();
            },

            resetWeights() {
                try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
                fetch('/ai-model', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}), signal: AbortSignal.timeout(3000) }).catch(() => {});
                mgr.resetWeights();
            },

            readSensors(player, platforms, goal, hazards) {
                return _jsNeuralAI ? _jsNeuralAI.readSensors(player, platforms, goal, hazards) : null;
            },
        };

        window.NeuralAI = wasmAI;
        console.log('[ai-wasm-bridge] C++ WASM AI active — 23→20→22 net with 6-cell memory');
    }).catch(function (err) {
        console.warn('[ai-wasm-bridge] WASM load failed, using pure-JS AI:', err);
    });
})();
