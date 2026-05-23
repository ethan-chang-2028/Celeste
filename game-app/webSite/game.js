// Celeste — 5-room test level "Five Peaks". Game loop, level layout, input, rendering.
// All player mechanics live in player.js (CelestePlayer).

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    // 320×180 — Celeste's native render resolution (matches game.html canvas).
    const W = canvas.width, H = canvas.height;

    // Fixed 60 Hz simulation step.
    const FIXED_DT = 1 / 60;
    const MAX_ACCUM = 0.25;
    const DEATH_Y = H + 20;

    // ── 5-Room Level: "Five Peaks" ──────────────────────────────────────────
    // Each room is one 320×180 screen. Walking off the right edge advances to
    // the next room. Room 5 has a goal block — touching it wins.
    //
    // Colors:
    //   floor / ledge   green   #3a5a3a / #5a7a5a
    //   boundary wall   slate   #4a5570
    //   chimney wall    purple  #5a6b88
    //   climbable wall  violet  #7a6b8a
    //   goal block      gold    #d4af37

    const rooms = [

        // ── Room 1: RUN & JUMP ───────────────────────────────────────────────
        // Two 40-px ground pits. Learn running-jump timing.
        {
            name: 'ROOM 1 — RUN & JUMP',
            spawn: { x: 14, y: 157 },
            platforms: [
                { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' }, // left wall
                { x: 0,   y: 168, w: 80,  h: 12,  color: '#3a5a3a' }, // spawn floor
                { x: 120, y: 168, w: 80,  h: 12,  color: '#3a5a3a' }, // mid platform
                { x: 240, y: 168, w: 80,  h: 12,  color: '#3a5a3a' }, // exit floor
            ],
            pitShading: [
                { x: 80,  y: 168, w: 40, h: 12 },
                { x: 200, y: 168, w: 40, h: 12 },
            ],
            labels: [
                { text: 'JUMP', x: 84,  y: 178 },
                { text: 'JUMP', x: 204, y: 178 },
                { text: '→',    x: 304, y: 162 },
            ],
        },

        // ── Room 2: CHIMNEY ──────────────────────────────────────────────────
        // Wall-jump up a 24-px-wide shaft. Left wall has a 14-px gap at the
        // bottom so the player can walk inside; right wall is flush to the floor.
        // Exit by running right along the top ledge.
        {
            name: 'ROOM 2 — CHIMNEY',
            spawn: { x: 14, y: 157 },
            platforms: [
                { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' }, // left wall
                { x: 0,   y: 168, w: 150, h: 12,  color: '#3a5a3a' }, // entry floor
                { x: 150, y: 50,  w: 6,   h: 104, color: '#5a6b88' }, // left chimney wall (gap at bottom)
                { x: 180, y: 50,  w: 6,   h: 118, color: '#5a6b88' }, // right chimney wall (to floor)
                { x: 156, y: 44,  w: 164, h: 6,   color: '#5a7a5a' }, // top exit ledge
            ],
            pitShading: [],
            labels: [
                { text: 'WALL JUMP', x: 148, y: 165 },
                { text: '→',         x: 306, y: 38  },
            ],
        },

        // ── Room 3: STAIRCASE ────────────────────────────────────────────────
        // Four ascending ledges; jump up-right to the exit platform near the top.
        {
            name: 'ROOM 3 — STAIRCASE',
            spawn: { x: 14, y: 157 },
            platforms: [
                { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' }, // left wall
                { x: 0,   y: 168, w: 60,  h: 12,  color: '#3a5a3a' }, // spawn floor
                { x: 70,  y: 136, w: 50,  h: 8,   color: '#5a7a5a' }, // step 1
                { x: 140, y: 104, w: 50,  h: 8,   color: '#5a7a5a' }, // step 2
                { x: 210, y: 72,  w: 50,  h: 8,   color: '#5a7a5a' }, // step 3
                { x: 275, y: 40,  w: 45,  h: 8,   color: '#5a7a5a' }, // exit ledge
            ],
            pitShading: [],
            labels: [
                { text: 'STEP 1', x: 72,  y: 130 },
                { text: 'STEP 2', x: 142, y: 98  },
                { text: 'STEP 3', x: 212, y: 66  },
                { text: '→',      x: 303, y: 34  },
            ],
        },

        // ── Room 4: CLIMB ────────────────────────────────────────────────────
        // Two tall violet (climbable) walls. Grab (Z) and climb wall A to the
        // top platform, then dash right across a 40-px gap to grab wall B and
        // climb to the exit ledge.
        {
            name: 'ROOM 4 — CLIMB',
            spawn: { x: 14, y: 157 },
            platforms: [
                { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' }, // left wall
                { x: 0,   y: 168, w: 60,  h: 12,  color: '#3a5a3a' }, // spawn floor
                { x: 80,  y: 30,  w: 8,   h: 138, color: '#7a6b8a' }, // climbable wall A
                { x: 88,  y: 30,  w: 72,  h: 8,   color: '#5a7a5a' }, // top platform A (x=88-160)
                { x: 200, y: 30,  w: 8,   h: 138, color: '#7a6b8a' }, // climbable wall B
                { x: 208, y: 30,  w: 112, h: 8,   color: '#5a7a5a' }, // exit ledge (to right edge)
            ],
            pitShading: [
                { x: 60, y: 168, w: 20, h: 12 }, // gap before wall A
            ],
            labels: [
                { text: 'GRAB+↑', x: 52,  y: 90 },
                { text: 'DASH→',  x: 110, y: 24 },
                { text: 'GRAB+↑', x: 174, y: 90 },
                { text: '→',      x: 300, y: 24 },
            ],
        },

        // ── Room 5: SUMMIT ───────────────────────────────────────────────────
        // Final mixed challenge: four ascending steps lead to the gold goal
        // block at the top-right corner.
        {
            name: 'ROOM 5 — SUMMIT',
            spawn: { x: 14, y: 157 },
            platforms: [
                { x: 0,   y: 0,   w: 8,   h: 180, color: '#4a5570' }, // left wall
                { x: 0,   y: 168, w: 60,  h: 12,  color: '#3a5a3a' }, // spawn floor
                { x: 80,  y: 140, w: 50,  h: 8,   color: '#5a7a5a' }, // step 1
                { x: 150, y: 110, w: 50,  h: 8,   color: '#5a7a5a' }, // step 2
                { x: 220, y: 80,  w: 50,  h: 8,   color: '#5a7a5a' }, // step 3
                { x: 280, y: 50,  w: 40,  h: 8,   color: '#5a7a5a' }, // summit platform
            ],
            pitShading: [],
            labels: [
                { text: 'SUMMIT', x: 260, y: 12 },
            ],
        },
    ];

    // Goal lives in the last room only — drawn as a pulsing gold block.
    const GOAL = { x: 289, y: 36, w: 12, h: 12, color: '#d4af37' };

    // ── Run state ────────────────────────────────────────────────────────────
    let currentRoom = 0;
    let player = new CelestePlayer(rooms[0].spawn.x, rooms[0].spawn.y);
    let runStart = performance.now();
    let deaths = 0;
    let bestMs = null;
    let won = false;
    let winMs = 0;

    function getRoom() { return rooms[currentRoom]; }

    function respawn() {
        const sp = getRoom().spawn;
        player.reset(sp.x, sp.y);
        if (!won) deaths++;
    }

    function advanceRoom() {
        currentRoom++;
        const sp = getRoom().spawn;
        player.reset(sp.x, sp.y);
    }

    function restartRun() {
        currentRoom = 0;
        player.reset(rooms[0].spawn.x, rooms[0].spawn.y);
        runStart = performance.now();
        deaths = 0;
        won = false;
    }

    // ── Input ────────────────────────────────────────────────────────────────
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

    // ── Render ───────────────────────────────────────────────────────────────
    function render() {
        const room = getRoom();

        // Sky gradient.
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#2a3550');
        sky.addColorStop(1, '#4a5a8a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Pit warning shading.
        ctx.fillStyle = 'rgba(150, 40, 40, 0.25)';
        for (const pit of room.pitShading) {
            ctx.fillRect(pit.x, pit.y, pit.w, pit.h);
        }

        // Platforms.
        for (const p of room.platforms) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(p.x, p.y, p.w, 1); // top-edge highlight
        }

        // Pulsing goal block (room 5 only).
        if (currentRoom === rooms.length - 1) {
            const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
            ctx.fillStyle = GOAL.color;
            ctx.globalAlpha = pulse;
            ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, 1);
        }

        player.draw(ctx);

        // Room name (top-left).
        ctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
        ctx.font = '7px monospace';
        ctx.fillText(room.name, 10, 10);

        // Progress bar: one dot per room, gold = reached.
        for (let i = 0; i < rooms.length; i++) {
            ctx.fillStyle = i <= currentRoom ? '#d4af37' : 'rgba(255,255,255,0.20)';
            ctx.fillRect(10 + i * 10, 14, 7, 3);
        }

        // Section labels.
        ctx.fillStyle = 'rgba(230, 230, 230, 0.55)';
        ctx.font = '6px monospace';
        for (const lbl of room.labels) {
            ctx.fillText(lbl.text, lbl.x, lbl.y);
        }

        // Win screen.
        if (won) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(55, 60, 210, 60);
            ctx.fillStyle = '#d4af37';
            ctx.font = '12px monospace';
            ctx.fillText('FIVE PEAKS — CLEARED', 62, 82);
            ctx.fillStyle = '#fff';
            ctx.font = '8px monospace';
            ctx.fillText(`time   ${(winMs / 1000).toFixed(2)}s`, 76, 98);
            ctx.fillText(`deaths ${deaths}`,                       76, 108);
            ctx.fillText('press R to retry',                       76, 118);
        }
    }

    // ── Loop ─────────────────────────────────────────────────────────────────
    let last = performance.now();
    let accum = 0;
    let stepCount = 0;
    let fpsWindow = last;
    let measuredFps = 60;

    function step() {
        const room = getRoom();
        const input = readInput();
        player.update(input, room.platforms, FIXED_DT);

        // Room transition: player walks off the right edge.
        if (!won && player.x + player.w >= W) {
            if (currentRoom < rooms.length - 1) {
                advanceRoom();
            }
        }

        // Goal check (last room only).
        if (!won && currentRoom === rooms.length - 1 && playerOverlapsGoal()) {
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
            `${rooms[currentRoom].name}  ` +
            `time=${(elapsed / 1000).toFixed(2)}s  deaths=${deaths}  ` +
            (bestMs !== null ? `best=${(bestMs / 1000).toFixed(2)}s  ` : '') +
            `${player.state}  ${measuredFps.toFixed(0)} fps`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
