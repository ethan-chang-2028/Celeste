// Celeste — "Five Peaks": a physically connected 5-room level.
// The level is 1600 px wide (5 × 320). The camera snaps to whichever room
// the player is currently in, exactly like the original Celeste engine.
// Walk right through all five rooms and touch the gold block to win.

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    const W = canvas.width, H = canvas.height; // 320 × 180

    const FIXED_DT = 1 / 60;
    const MAX_ACCUM = 0.25;
    const DEATH_Y = H + 20;

    // ── Level geometry (world-space, 1600 px wide) ──────────────────────────
    const ROOM_W = W;      // 320 px per room
    const NUM_ROOMS = 5;

    // Each room's respawn position (used when the player dies inside that room).
    const roomSpawns = [
        { x:   14, y: 157 }, // room 1
        { x:  334, y: 157 }, // room 2
        { x:  654, y: 157 }, // room 3
        { x:  974, y: 157 }, // room 4
        { x: 1294, y: 157 }, // room 5
    ];

    const roomNames = [
        'ROOM 1 — RUN & JUMP',
        'ROOM 2 — CHIMNEY',
        'ROOM 3 — PLATFORMS',
        'ROOM 4 — CLIMB',
        'ROOM 5 — SUMMIT',
    ];

    // Sky gradient per room: [top, bottom]. Gets progressively darker (ascent).
    const roomSkies = [
        ['#2a3550', '#4a5a8a'],
        ['#2a2850', '#3a3a7a'],
        ['#1a2540', '#2a3a6a'],
        ['#15203a', '#253060'],
        ['#0a1020', '#152040'],
    ];

    // ── Platforms ─────────────────────────────────────────────────────────────
    // Colors:  floor / ledge  #3a5a3a / #5a7a5a
    //          boundary wall  #4a5570
    //          chimney wall   #5a6b88
    //          climbable      #7a6b8a
    const platforms = [

        // ── ROOM 1 (x 0–319): RUN & JUMP ─────────────────────────────────
        // Two 40-px ground pits. Learn the running-jump cadence.
        { x:   0, y:   0, w:   8, h: 180, color: '#4a5570' }, // left boundary
        { x:   0, y: 168, w:  80, h:  12, color: '#3a5a3a' }, // spawn floor
        { x: 120, y: 168, w:  80, h:  12, color: '#3a5a3a' }, // mid platform
        { x: 240, y: 168, w:  80, h:  12, color: '#3a5a3a' }, // exit floor → room 2

        // ── ROOM 2 (x 320–639): CHIMNEY ──────────────────────────────────
        // The left chimney wall has a 14-px gap at the bottom; walk under it
        // to enter the 24-px-wide shaft, then wall-jump to the top.
        // Descend via two stepping stones back to ground level.
        { x: 320, y: 168, w: 126, h:  12, color: '#3a5a3a' }, // entry floor
        { x: 446, y:  50, w:   6, h: 104, color: '#5a6b88' }, // chimney left  (gap at bottom)
        { x: 476, y:  50, w:   6, h: 118, color: '#5a6b88' }, // chimney right (flush to floor)
        { x: 452, y:  44, w:  44, h:   6, color: '#5a7a5a' }, // chimney top
        { x: 500, y:  80, w:  50, h:   8, color: '#5a7a5a' }, // descend ledge 1
        { x: 560, y: 124, w:  50, h:   8, color: '#5a7a5a' }, // descend ledge 2
        { x: 610, y: 168, w:  30, h:  12, color: '#3a5a3a' }, // exit floor → room 3

        // ── ROOM 3 (x 640–959): PLATFORMS ────────────────────────────────
        // Three ascending ledges. Missing any ledge is a death fall.
        // Drop off the third ledge onto the exit floor to continue.
        { x: 640, y: 168, w:  50, h:  12, color: '#3a5a3a' }, // entry floor
        { x: 730, y: 148, w:  40, h:   8, color: '#5a7a5a' }, // ledge 1
        { x: 810, y: 128, w:  40, h:   8, color: '#5a7a5a' }, // ledge 2
        { x: 880, y: 108, w:  40, h:   8, color: '#5a7a5a' }, // ledge 3
        { x: 920, y: 168, w:  40, h:  12, color: '#3a5a3a' }, // exit floor → room 4

        // ── ROOM 4 (x 960–1279): CLIMB ───────────────────────────────────
        // Jump the pit to reach wall A, grab (Z) and climb to the top platform.
        // Dash (X) right 40 px to grab wall B, climb to the exit ledge.
        // Descend via two steps back to ground level before room 5.
        { x:  960, y: 168, w:  60, h:  12, color: '#3a5a3a' }, // entry floor
        { x: 1040, y:  30, w:   8, h: 138, color: '#7a6b8a' }, // climbable wall A
        { x: 1048, y:  30, w:  72, h:   8, color: '#5a7a5a' }, // top platform A (→ x 1120)
        { x: 1160, y:  30, w:   8, h: 138, color: '#7a6b8a' }, // climbable wall B
        { x: 1168, y:  30, w:  32, h:   8, color: '#5a7a5a' }, // top platform B (→ x 1200)
        { x: 1200, y:  80, w:  50, h:   8, color: '#5a7a5a' }, // descend ledge 1
        { x: 1250, y: 124, w:  30, h:   8, color: '#5a7a5a' }, // descend ledge 2

        // ── ROOM 5 (x 1280–1599): SUMMIT ─────────────────────────────────
        // Four ascending steps lead to the gold goal block. Reach it to win.
        { x: 1280, y: 168, w:  60, h:  12, color: '#3a5a3a' }, // entry floor
        { x: 1360, y: 140, w:  50, h:   8, color: '#5a7a5a' }, // step 1
        { x: 1430, y: 110, w:  50, h:   8, color: '#5a7a5a' }, // step 2
        { x: 1500, y:  80, w:  50, h:   8, color: '#5a7a5a' }, // step 3
        { x: 1555, y:  50, w:  45, h:   8, color: '#5a7a5a' }, // summit
        { x: 1592, y:   0, w:   8, h: 180, color: '#4a5570' }, // right boundary
    ];

    const pitShading = [
        { x:   80, y: 168, w:  40, h: 12 }, // room 1 pit 1
        { x:  200, y: 168, w:  40, h: 12 }, // room 1 pit 2
        { x:  690, y: 168, w:  40, h: 12 }, // room 3 ground gap
        { x: 1020, y: 168, w:  20, h: 12 }, // room 4 gap before wall A
    ];

    // Labels drawn in world-space.
    const labels = [
        { text: 'JUMP',      x:   84, y: 178 },
        { text: 'JUMP',      x:  204, y: 178 },
        { text: 'WALL JUMP', x:  444, y: 165 },
        { text: 'STEP UP',   x:  732, y: 142 },
        { text: 'STEP UP',   x:  812, y: 122 },
        { text: 'STEP UP',   x:  882, y: 102 },
        { text: 'GRAB+↑',   x: 1008, y:  90 },
        { text: 'DASH→',    x: 1058, y:  24 },
        { text: 'GRAB+↑',   x: 1128, y:  90 },
        { text: 'SUMMIT',   x: 1546, y:  14 },
    ];

    // Goal block sits on top of the summit platform (room 5).
    // Platform top is y=50; goal bottom is flush with it at y=50-12=38.
    const GOAL = { x: 1566, y: 38, w: 12, h: 12, color: '#d4af37' };

    // ── Run state ─────────────────────────────────────────────────────────────
    let cameraX = 0;
    let respawnRoom = 0;  // room index where player respawns if they die
    let furthestRoom = 0; // furthest room reached (for progress bar)
    const player = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
    let runStart = performance.now();
    let deaths = 0;
    let bestMs = null;
    let won = false;
    let winMs = 0;

    function getRoomIdx() {
        return Math.max(0, Math.min(NUM_ROOMS - 1,
            Math.floor((player.x + player.w / 2) / ROOM_W)));
    }

    function respawn() {
        player.reset(roomSpawns[respawnRoom].x, roomSpawns[respawnRoom].y);
        if (!won) deaths++;
    }

    function restartRun() {
        respawnRoom = 0;
        furthestRoom = 0;
        player.reset(roomSpawns[0].x, roomSpawns[0].y);
        runStart = performance.now();
        deaths = 0;
        won = false;
    }

    // ── Input ─────────────────────────────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────────────────
    function render() {
        const roomIdx = getRoomIdx();
        const [skyTop, skyBot] = roomSkies[roomIdx];

        // Sky gradient (screen-space, redrawn each frame).
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, skyTop);
        sky.addColorStop(1, skyBot);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Shift canvas so world-space coords map to the current room.
        ctx.save();
        ctx.translate(-cameraX, 0);

        // Pit shading.
        ctx.fillStyle = 'rgba(150, 40, 40, 0.25)';
        for (const pit of pitShading) ctx.fillRect(pit.x, pit.y, pit.w, pit.h);

        // Platforms.
        for (const p of platforms) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(p.x, p.y, p.w, 1); // top-edge highlight
        }

        // Faint room-boundary dividers.
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        for (let r = 1; r < NUM_ROOMS; r++) {
            ctx.beginPath();
            ctx.moveTo(r * ROOM_W, 0);
            ctx.lineTo(r * ROOM_W, H);
            ctx.stroke();
        }

        // Pulsing goal block.
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
        ctx.fillStyle = GOAL.color;
        ctx.globalAlpha = pulse;
        ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
        ctx.globalAlpha = 1;

        player.draw(ctx);

        // Section labels.
        ctx.fillStyle = 'rgba(220,220,220,0.55)';
        ctx.font = '6px monospace';
        for (const lbl of labels) ctx.fillText(lbl.text, lbl.x, lbl.y);

        ctx.restore(); // end world-space translation

        // ── HUD (screen-space) ──────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
        ctx.font = '7px monospace';
        ctx.fillText(roomNames[roomIdx], 10, 10);

        // Progress dots — gold for reached rooms.
        for (let i = 0; i < NUM_ROOMS; i++) {
            ctx.fillStyle = i <= furthestRoom ? '#d4af37' : 'rgba(255,255,255,0.20)';
            ctx.fillRect(10 + i * 12, 14, 8, 3);
        }

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

    // ── Loop ──────────────────────────────────────────────────────────────────
    let last = performance.now();
    let accum = 0;
    let stepCount = 0;
    let fpsWindow = last;
    let measuredFps = 60;

    function step() {
        const input = readInput();
        player.update(input, platforms, FIXED_DT);

        // Track current room while the player is alive (used for respawn).
        if (player.y <= DEATH_Y) {
            respawnRoom = getRoomIdx();
            furthestRoom = Math.max(furthestRoom, respawnRoom);
        }

        // Snap camera to current room (Celeste-style room-locked camera).
        cameraX = getRoomIdx() * ROOM_W;

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
            `${roomNames[getRoomIdx()]}  ` +
            `time=${(elapsed / 1000).toFixed(2)}s  deaths=${deaths}  ` +
            (bestMs !== null ? `best=${(bestMs / 1000).toFixed(2)}s  ` : '') +
            `${player.state}  ${measuredFps.toFixed(0)} fps`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
