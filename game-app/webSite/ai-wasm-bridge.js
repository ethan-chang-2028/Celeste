/**
 * ai-wasm-bridge.js
 *
 * Loads the Emscripten-compiled C++ AI (ai-neural.wasm) and replaces the
 * pure-JS NeuralAI object with a WASM-backed version that uses the exact
 * same algorithms from ai_learning.hpp.
 *
 * If the WASM files haven't been compiled yet this script does nothing —
 * the pure-JS ai-neural.js implementation stays active as a fallback.
 *
 * Build instructions (requires Emscripten):
 *   cd game-app/Native
 *   emcmake cmake -DCMAKE_BUILD_TYPE=Release -B build .
 *   emmake make -C build
 *   cp build/ai-neural.wasm.js ../webSite/
 *   cp build/ai-neural.wasm    ../webSite/
 */

(function () {
    'use strict';

    // CelesteAI is the factory injected by ai-neural.wasm.js (Emscripten output).
    // If that file wasn't loaded (WASM not yet compiled) we do nothing.
    if (typeof CelesteAI === 'undefined') return;

    CelesteAI().then(function (Module) {
        const mgr = new Module.AINeuralManager();

        // ── Helpers ───────────────────────────────────────────────────────────

        // Convert a JS array of {x,y,w,h,...} rects to a flat Float32 vector
        // that the C++ side can decode back into std::vector<Rect>.
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

        // Extract player state scalars from a CelestePlayer instance.
        function playerState(p) {
            return {
                x: p.x, y: p.y,
                vx: p.Speed ? p.Speed.X : 0,
                vy: p.Speed ? p.Speed.Y : 0,
                onGround: !!p.onGround,
                dashes:   p.Dashes || 0,
            };
        }

        // Call mgr.compute / mgr.computeAgent and clean up temporary vectors.
        function callCompute(fn, platData, hazardData, goalX, goalY, goalW, goalH, extraArgs) {
            const pv = toFlatVec(platData);
            const hv = toFlatVec(hazardData);
            let result;
            try {
                result = fn(pv, hv, goalX, goalY, goalW, goalH, ...extraArgs);
            } finally {
                pv.delete();
                hv.delete();
            }
            // Embind value_object copies fields — no delete needed for ActionResult.
            return {
                moveX:       result.moveX,
                moveY:       result.moveY,
                jumpPressed: result.jumpPressed,
                jumpHeld:    result.jumpHeld,
                dashPressed: result.dashPressed,
                grabHeld:    result.grabHeld,
            };
        }

        // ── NeuralAI replacement ──────────────────────────────────────────────

        const wasmAI = {
            // Stats (read by game.js for the UI)
            get generation()    { return mgr.generation;    },
            get runCount()      { return mgr.runCount;      },
            get globalBestFit() { return mgr.globalBestFit; },
            N_AGENTS: mgr.N_AGENTS,

            // Expose RAY_DIRS for ray visualisation (keep JS values — same config)
            RAY_DIRS: window.NeuralAI ? window.NeuralAI.RAY_DIRS : [],
            RAY_LEN:  window.NeuralAI ? window.NeuralAI.RAY_LEN  : 110,

            init(spawnX, goalEnd, opts) {
                const isVert = !!(opts && opts.isVertical);
                const spawnY = (opts && opts.spawnY != null) ? opts.spawnY : 0;
                const goalY  = (opts && opts.goalY  != null) ? opts.goalY  : 0;
                mgr.init(spawnX, goalEnd || 1600, isVert, spawnY, goalY);

                // Sync world bounds from game.js globals
                const b = window.AI_BOUNDS;
                if (b) mgr.setBounds(b.minX, b.maxX, b.minY, b.maxY);

                this.initAgents();
            },

            reset(spawnX) {
                mgr.reset(spawnX || 0);
            },

            initAgents() {
                mgr.initAgents();
            },

            resetAgents() {
                mgr.resetAgents();
            },

            compute(player, platforms, goal, hazards) {
                if (!goal) return null;
                const b = window.AI_BOUNDS;
                if (b) mgr.setBounds(b.minX, b.maxX, b.minY, b.maxY);

                const s  = playerState(player);
                const pv = toFlatVec(platforms);
                const hv = toFlatVec(hazards);
                let res;
                try {
                    res = mgr.compute(
                        s.x, s.y, s.vx, s.vy, s.onGround, s.dashes,
                        pv, hv,
                        goal.x, goal.y, goal.w, goal.h
                    );
                } finally {
                    pv.delete(); hv.delete();
                }
                return { moveX: res.moveX, moveY: res.moveY,
                         jumpPressed: res.jumpPressed, jumpHeld: res.jumpHeld,
                         dashPressed: res.dashPressed, grabHeld: res.grabHeld };
            },

            computeAgent(i, player, platforms, goal, hazards) {
                if (!goal) return null;
                const s  = playerState(player);
                const pv = toFlatVec(platforms);
                const hv = toFlatVec(hazards);
                let res;
                try {
                    res = mgr.computeAgent(
                        i,
                        s.x, s.y, s.vx, s.vy, s.onGround, s.dashes,
                        pv, hv,
                        goal.x, goal.y, goal.w, goal.h
                    );
                } finally {
                    pv.delete(); hv.delete();
                }
                return { moveX: res.moveX, moveY: res.moveY,
                         jumpPressed: res.jumpPressed, jumpHeld: res.jumpHeld,
                         dashPressed: res.dashPressed, grabHeld: res.grabHeld };
            },

            onDeath()       { mgr.onDeath();    },
            onGoal()        { mgr.onGoal();     },
            killAgent(i)    { mgr.killAgent(i); },
            goalAgent(i)    { mgr.goalAgent(i); },

            // Stubs kept for API compatibility with game.js
            resetWeights()  { mgr.init(0, 1600, false, 0, 0); },
        };

        // Replace the global NeuralAI with the WASM-backed version.
        window.NeuralAI = wasmAI;
        console.log('[ai-wasm-bridge] C++ WASM AI active (ai_learning.hpp via Emscripten)');
    }).catch(function (err) {
        console.warn('[ai-wasm-bridge] WASM load failed, using pure-JS AI:', err);
    });
})();
