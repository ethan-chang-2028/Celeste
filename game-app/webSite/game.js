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
    const MAX_ACCUM = 0.25;

    // ---- Test level: "First Ascent" -----------------------------------------
    // Single-screen course exercising every mechanic in player.js. Path:
    //   1. Run right from spawn (RUN + variable jump)
    //   2. Jump a 40 px death pit (running jump at MaxRun)
    //   3. Walk through the gap under the left chimney wall to enter the shaft
    //   4. Wall-jump up the chimney between the two facing walls
    //   5. Land on the exit platform at the top
    //   6. Dash right across the 20 px gap
    //   7. Hit the right wall and grab (hold Z) to climb
    //   8. Climb-jump out of climb state to reach the top platform
    //   9. Touch the gold block to win
    //
    // Anything with y > DEATH_Y kills and respawns.
    const DEATH_Y = H + 20;

    // Distinct colors so each surface type reads at a glance:
    //   floor / ledge   green   #3a5a3a / #5a7a5a
    //   boundary wall   slate   #4a5570
    //   chimney wall    purple  #5a6b88
    //   climbable wall  violet  #7a6b8a — color hint
    //   goal block      gold    #d4af37
    const platforms = [
        // Left boundary
        { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' },

        // Section 1: spawn floor + death pit + landing floor
        { x: 0,   y: 168, w: 100, h: 12,  color: '#3a5a3a' },  // spawn floor
        // (death pit x=100 to x=140)
        { x: 140, y: 168, w: 88,  h: 12,  color: '#3a5a3a' },  // landing floor

        // Section 2: chimney. Left wall doesn't reach the floor — that gap
        // (y=154..168) is how the player enters. Right wall is full-height.
        // Inside-edge spacing 24 px = standard Celeste chimney width.
        { x: 192, y: 50,  w: 6,   h: 104, color: '#5a6b88' },  // left chimney wall
        { x: 222, y: 50,  w: 6,   h: 118, color: '#5a6b88' },  // right chimney wall

        // Section 3: chimney exit platform (you land here after wall-jumping up)
        { x: 198, y: 44,  w: 94,  h: 6,   color: '#5a7a5a' },

        // Section 4: climb wall on the right (dash across the 20 px gap to reach it)
        { x: 312, y: 20,  w: 8,   h: 148, color: '#7a6b8a' },

        // Section 5: top platform that holds the goal block
        { x: 280, y: 20,  w: 32,  h: 4,   color: '#5a7a5a' },
    ];

    // Goal is a sensor — drawn but not solid. Overlapping it wins.
    const GOAL = { x: 290, y: 8, w: 12, h: 12, color: '#d4af37' };

    const SPAWN = { x: 14, y: 157 };
    const player = new CelestePlayer(SPAWN.x, SPAWN.y);

    // ---- Run state ----------------------------------------------------------
    let runStart = performance.now();
    let deaths = 0;
    let bestMs = null;
    let won = false;
    let winMs = 0;

    function respawn() {
        player.reset(SPAWN.x, SPAWN.y);
        if (!won) deaths++;
    }
    function restartRun() {
        player.reset(SPAWN.x, SPAWN.y);
        runStart = performance.now();
        deaths = 0;
        won = false;
    }

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
        if (e.code === 'KeyR') restartRun();
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

    function playerOverlapsGoal() {
        return player.x < GOAL.x + GOAL.w && player.x + player.w > GOAL.x
            && player.y < GOAL.y + GOAL.h && player.y + player.h > GOAL.y;
    }

    // ---- Render --------------------------------------------------------------
    function render() {
        // Sky gradient (drawn each frame; dash-trail alpha doesn't accumulate).
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#2a3550');
        sky.addColorStop(1, '#4a5a8a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Death pit warning shading.
        ctx.fillStyle = 'rgba(150, 40, 40, 0.25)';
        ctx.fillRect(100, 168, 40, 12);

        for (const p of platforms) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(p.x, p.y, p.w, 1);  // top-edge highlight
        }

        // Pulsing goal block.
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
        ctx.fillStyle = GOAL.color;
        ctx.globalAlpha = pulse;
        ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, 1);

        player.draw(ctx);

        // Tiny pixel-style section labels.
        ctx.fillStyle = 'rgba(230, 230, 230, 0.55)';
        ctx.font = '6px monospace';
        ctx.fillText('JUMP',    104, 178);
        ctx.fillText('CHIMNEY', 196, 165);
        ctx.fillText('DASH→',   270, 42);
        ctx.fillText('CLIMB',   294, 100);
        ctx.fillText('GOAL',    288, 6);

        if (won) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(60, 60, 200, 60);
            ctx.fillStyle = '#d4af37';
            ctx.font = '12px monospace';
            ctx.fillText('FIRST ASCENT — CLEARED', 72, 82);
            ctx.fillStyle = '#fff';
            ctx.font = '8px monospace';
            ctx.fillText(`time   ${(winMs / 1000).toFixed(2)}s`, 76, 98);
            ctx.fillText(`deaths ${deaths}`,                       76, 108);
            ctx.fillText('press R to retry',                       76, 118);
        }
    }

    // ---- Loop ---------------------------------------------------------------
    let last = performance.now();
    let accum = 0;
    let stepCount = 0;
    let fpsWindow = last;
    let measuredFps = 60;

    function step() {
        const input = readInput();
        player.update(input, platforms, FIXED_DT);

        if (!won && playerOverlapsGoal()) {
            won = true;
            winMs = performance.now() - runStart;
            if (bestMs === null || winMs < bestMs) bestMs = winMs;
        }

        if (player.y > DEATH_Y) respawn();

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

        if (now - fpsWindow >= 1000) {
            measuredFps = stepCount * 1000 / (now - fpsWindow);
            stepCount = 0;
            fpsWindow = now;
        }

        const elapsed = won ? winMs : (performance.now() - runStart);
        statusEl.textContent =
            `time=${(elapsed/1000).toFixed(2)}s  deaths=${deaths}  ` +
            (bestMs !== null ? `best=${(bestMs/1000).toFixed(2)}s  ` : '') +
            `${player.state}  ${measuredFps.toFixed(0)} fps`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
