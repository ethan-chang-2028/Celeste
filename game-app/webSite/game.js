// Celeste — test scene. Game loop, level layout, input, rendering.
// All player mechanics live in player.js (CelestePlayer), which ports
// the constants and rules from game-app/CelesteCode/Player.cs.

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    // 320×180 — Celeste's native render resolution.
    const W = canvas.width, H = canvas.height;

    // ---- Level: ground, platforms, walls (positions in 320×180 space) -------
    const GROUND_Y = H - 20;
    const platforms = [
        { x: 0,   y: GROUND_Y, w: W,   h: 20, color: '#3a5a3a' },   // ground
        { x: 60,  y: 132,      w: 50,  h: 6,  color: '#5a7a5a' },
        { x: 140, y: 100,      w: 50,  h: 6,  color: '#5a7a5a' },
        { x: 220, y: 132,      w: 50,  h: 6,  color: '#5a7a5a' },
        { x: 0,   y: 80,       w: 8,   h: 80, color: '#4a5570' }, // left wall
        { x: W-8, y: 80,       w: 8,   h: 80, color: '#4a5570' }, // right wall
        { x: 104, y: 50,       w: 8,   h: 50, color: '#4a5570' }, // mid pillars
        { x: 208, y: 50,       w: 8,   h: 50, color: '#4a5570' },
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
    let last = performance.now();
    function frame(now) {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;

        const input = readInput();
        player.update(input, platforms, dt);

        // Death pit: respawn if off-screen
        if (player.y > H + 40) player.reset(SPAWN.x, SPAWN.y);

        // Clear edge-trigger inputs after the player consumes them
        for (const k of Object.keys(pressed)) delete pressed[k];

        render();

        statusEl.textContent =
            `x=${player.x.toFixed(0)}  y=${player.y.toFixed(0)}  ` +
            `vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}  ` +
            `dashes=${player.dashes}  stamina=${player.stamina.toFixed(0)}  ${player.state}`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
