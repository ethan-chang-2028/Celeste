// Celeste — test scene. Game loop, level layout, input, rendering.
// All player mechanics live in player.js (CelestePlayer), which ports
// the constants and rules from game-app/CelesteCode/Player.cs.

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    // 320×180 — Celeste's native render resolution (matches game.html canvas).
    const W = canvas.width, H = canvas.height;

    // Fixed 60 Hz simulation step. Player.cs (and player.js) is tuned to this dt.
    const FIXED_DT = 1 / 60;
    const MAX_ACCUM = 0.25;  // panic-clamp so tab-backgrounding doesn't spiral

    // ---- Level: ground, platforms, walls (positions in 320×180 space) -------
    // Layout is intentionally a wall-jump training ground: a tall chimney in
    // the middle with two facing surfaces ~24 px apart so you can wall-jump
    // up between them. Side walls have a clear in-air section above the
    // floor for single-wall wall jumps. A low overhang on the right tests
    // corner correction.
    const GROUND_Y = H - 20;
    const platforms = [
        { x: 0,   y: GROUND_Y, w: W,   h: 20, color: '#3a5a3a' },   // ground

        // Side walls — extend from floor up to y=40 so there's a tall in-air
        // section to wall-slide and wall-jump against.
        { x: 0,   y: 40,       w: 8,   h: 120, color: '#4a5570' }, // left wall
        { x: W-8, y: 40,       w: 8,   h: 120, color: '#4a5570' }, // right wall

        // Mid chimney — two pillars facing each other 24 px apart.
        // Wall-jumping zig-zags up between them.
        { x: 140, y: 50,       w: 8,   h: 90,  color: '#5a6b88' },
        { x: 172, y: 50,       w: 8,   h: 90,  color: '#5a6b88' },

        // Floating ledges to land on.
        { x: 60,  y: 132,      w: 40,  h: 6,  color: '#5a7a5a' },
        { x: 220, y: 132,      w: 40,  h: 6,  color: '#5a7a5a' },
        { x: 60,  y: 96,       w: 30,  h: 6,  color: '#5a7a5a' },
        { x: 230, y: 96,       w: 30,  h: 6,  color: '#5a7a5a' },

        // Low overhang on the right — leaves a 4-px corner gap right above
        // the floating ledge at y=96 so a jump straight up clips the corner
        // by 1-2 px. Corner correction should kick in and slide the player
        // past instead of bonking.
        { x: 246, y: 78,       w: 60,  h: 8,  color: '#7a5a5a' },
    ];

    const SPAWN = { x: 24, y: GROUND_Y - 11 };
    const player = new CelestePlayer(SPAWN.x, SPAWN.y);

    // ---- Input ---------------------------------------------------------------
    const keys = Object.create(null);
    const pressed = Object.create(null);
    const tracked = new Set([
        'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
        'KeyC','KeyX','KeyZ','ShiftLeft','ShiftRight','KeyR',
    ]);

    window.addEventListener('keydown', (e) => {
        if (tracked.has(e.code)) {
            if (!keys[e.code]) pressed[e.code] = true;
            keys[e.code] = true;
            e.preventDefault();
        }
        if (e.code === 'KeyR') player.reset(SPAWN.x, SPAWN.y);
    });
    window.addEventListener('keyup', (e) => {
        if (tracked.has(e.code)) keys[e.code] = false;
    });

    function readInput() {
        const moveX = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
        const moveY = (keys['ArrowDown']  ? 1 : 0) - (keys['ArrowUp']   ? 1 : 0);
        return {
            moveX, moveY,
            jumpPressed: !!pressed['KeyC'],
            jumpHeld:    !!keys['KeyC'],
            dashPressed: !!pressed['KeyX'],
            grabHeld:    !!(keys['KeyZ'] || keys['ShiftLeft'] || keys['ShiftRight']),
        };
    }

    // ---- Render --------------------------------------------------------------
    function render() {
        ctx.clearRect(0, 0, W, H);
        for (const p of platforms) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(p.x, p.y, p.w, 1);
        }
        player.draw(ctx);
    }

    // ---- Loop ---------------------------------------------------------------
    // Fixed-step accumulator: physics runs at exactly 60 Hz regardless of the
    // monitor's refresh rate. On a 120 Hz display we step the simulation once
    // every 2 vsyncs; on 144 Hz roughly every 2.4. dt seen by player.update
    // is always FIXED_DT, so behavior is deterministic and matches Player.cs.
    let last = performance.now();
    let accum = 0;
    let stepCount = 0;
    let fpsWindow = last;
    let measuredFps = 60;

    function step() {
        const input = readInput();
        player.update(input, platforms, FIXED_DT);

        // Death pit: respawn if off-screen
        if (player.y > H + 40) player.reset(SPAWN.x, SPAWN.y);

        // Clear edge-trigger inputs after the player consumes them
        for (const k of Object.keys(pressed)) delete pressed[k];

        stepCount++;
    }

    function frame(now) {
        accum += (now - last) / 1000;
        last = now;
        if (accum > MAX_ACCUM) accum = MAX_ACCUM;

        let didStep = false;
        while (accum >= FIXED_DT) {
            step();
            accum -= FIXED_DT;
            didStep = true;
        }

        if (didStep) render();

        // Live FPS readout, averaged over 1s.
        if (now - fpsWindow >= 1000) {
            measuredFps = stepCount * 1000 / (now - fpsWindow);
            stepCount = 0;
            fpsWindow = now;
        }

        statusEl.textContent =
            `x=${player.x.toFixed(0)}  y=${player.y.toFixed(0)}  ` +
            `vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}  ` +
            `dashes=${player.dashes}  stamina=${player.stamina.toFixed(0)}  ` +
            `${player.state}  |  ${measuredFps.toFixed(0)} fps (locked 60)`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
