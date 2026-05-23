// Celeste — Procedural AI Map Generator + AI Player Controller.
// "Generate AI Map" → new seeded level. "AI Control" → AI plays the game.

(function () {
    const canvas   = document.getElementById('game-canvas');
    const ctx      = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    const W = canvas.width, H = canvas.height; // 320 × 180
    const FIXED_DT  = 1 / 60;
    const MAX_ACCUM = 0.25;
    const DEATH_Y   = H + 20;
    const ROOM_W    = W;
    const NUM_ROOMS = 5;
    const FLOOR_Y   = 168;
    const FLOOR_H   = 12;

    // ── Seeded PRNG ──────────────────────────────────────────────────────────
    function mkRng(seed) {
        let s = seed | 0;
        return () => {
            s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ s >>> 15, 1 | s);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // ── Mutable level state ──────────────────────────────────────────────────
    let platforms   = [];
    let pitShading  = [];
    let roomSpawns  = [];
    let roomNames   = [];
    let roomSkies   = [];
    let roomLabels  = [];
    let GOAL        = { x: 0, y: 0, w: 12, h: 12, color: '#d4af37' };
    let currentSeed = 0;

    const PALETTES = [
        ['#1a2a4a','#3a5a8a'], ['#2a1040','#5a2a80'],
        ['#0a2010','#1a5a2a'], ['#3a1000','#7a3010'],
        ['#0a0a18','#101828'], ['#2a1a0a','#5a3a1a'],
        ['#001a2a','#003a5a'], ['#1a001a','#3a003a'],
    ];

    const TYPE_LABEL = {
        gaps: 'RUN & JUMP', platform: 'PLATFORMS',
        chimney: 'CHIMNEY', climb: 'CLIMB', stair: 'SUMMIT',
    };

    // ── Level builder ────────────────────────────────────────────────────────
    function buildLevel(seed) {
        const rng = mkRng(seed);
        const ri  = () => Math.floor(rng() * 1000);
        const p = [], pits = [], sp = [], nm = [], sk = [], lb = [];
        let goal = {};

        const mid = ['gaps','platform','chimney','climb'];
        const chosen = [
            'gaps',
            mid[ri() % mid.length], mid[ri() % mid.length], mid[ri() % mid.length],
            'stair',
        ];

        for (let room = 0; room < NUM_ROOMS; room++) {
            const ox = room * ROOM_W;
            const type = chosen[room];
            sk.push(PALETTES[(ri() + room) % PALETTES.length]);
            nm.push(`ROOM ${room + 1} — ${TYPE_LABEL[type]}`);
            sp.push({ x: ox + 14, y: FLOOR_Y - 12 });

            if (room === 0)             p.push({ x: ox,               y: 0, w: 8, h: 180, color: '#4a5570' });
            if (room === NUM_ROOMS - 1) p.push({ x: ox + ROOM_W - 8, y: 0, w: 8, h: 180, color: '#4a5570' });

            if (type === 'gaps') {
                const numGaps = 1 + (ri() % 2);
                const gapW    = 32 + (ri() % 20);
                const seg     = splitFloor(ox, FLOOR_Y, ROOM_W, numGaps, gapW, rng);
                for (const s of seg.floors) p.push({ x: s.x, y: FLOOR_Y, w: s.w, h: FLOOR_H, color: '#3a5a3a' });
                for (const g of seg.gaps)   { pits.push({ x: g.x, y: FLOOR_Y, w: g.w, h: FLOOR_H }); lb.push({ text: 'JUMP', x: g.x + 4, y: FLOOR_Y + 10 }); }
            }

            else if (type === 'platform') {
                const entryW = 50 + (ri() % 30), exitW = 40 + (ri() % 30);
                p.push({ x: ox,                    y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                p.push({ x: ox + ROOM_W - exitW,   y: FLOOR_Y, w: exitW,  h: FLOOR_H, color: '#3a5a3a' });
                pits.push({ x: ox + entryW, y: FLOOR_Y, w: ROOM_W - entryW - exitW, h: FLOOR_H });
                const asc = rng() > 0.5;
                const gap = (ROOM_W - entryW - exitW) / 3;
                for (let i = 0; i < 3; i++) {
                    const fx = ox + entryW + Math.floor(i * gap) + (ri() % 10);
                    const fy = asc ? Math.max(25, FLOOR_Y - 45 - i * 28) : Math.max(25, FLOOR_Y - 110 + i * 28);
                    const fw = 42 + (ri() % 28);
                    p.push({ x: fx, y: fy, w: fw, h: 8, color: '#5a7a5a' });
                    lb.push({ text: 'STEP', x: fx + 4, y: fy - 2 });
                }
            }

            else if (type === 'chimney') {
                const entryW  = 70 + (ri() % 50);
                const shaftX  = ox + entryW + 10 + (ri() % 20);
                const shaftW  = 22 + (ri() % 10);
                const shaftTop = 28 + (ri() % 35);
                const gapBot   = 16;
                p.push({ x: ox, y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                p.push({ x: shaftX,          y: shaftTop, w: 6, h: FLOOR_Y - shaftTop - gapBot, color: '#5a6b88' });
                p.push({ x: shaftX + shaftW, y: shaftTop, w: 6, h: FLOOR_Y - shaftTop,           color: '#5a6b88' });
                p.push({ x: shaftX, y: shaftTop, w: shaftW + 12, h: 6, color: '#5a7a5a' });
                lb.push({ text: 'WALL JUMP', x: shaftX - 8, y: FLOOR_Y - 4 });
                const l1x = shaftX + shaftW + 18 + (ri() % 15);
                const l1y = 72 + (ri() % 35);
                const l2x = l1x + 48 + (ri() % 20);
                const l2y = 118 + (ri() % 24);
                p.push({ x: l1x, y: l1y, w: 50, h: 8, color: '#5a7a5a' });
                p.push({ x: l2x, y: l2y, w: 50, h: 8, color: '#5a7a5a' });
                const exitX = Math.min(ox + ROOM_W - 10, l2x + 40);
                if (exitX < ox + ROOM_W) p.push({ x: exitX, y: FLOOR_Y, w: ox + ROOM_W - exitX, h: FLOOR_H, color: '#3a5a3a' });
            }

            else if (type === 'climb') {
                const entryW = 50 + (ri() % 30);
                p.push({ x: ox, y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                const wallH  = 120 + (ri() % 40);
                const wallTop = FLOOR_Y - wallH;
                const wallAX = ox + entryW + 20 + (ri() % 20);
                p.push({ x: wallAX,     y: wallTop, w: 8,  h: wallH, color: '#7a6b8a' });
                p.push({ x: wallAX + 8, y: wallTop, w: 62, h: 8,     color: '#5a7a5a' });
                lb.push({ text: 'GRAB+UP', x: wallAX - 32, y: FLOOR_Y - 28 });
                lb.push({ text: 'DASH->',  x: wallAX + 14, y: wallTop - 4 });
                const wallBX = wallAX + 8 + 62 + 20 + (ri() % 20);
                p.push({ x: wallBX,     y: wallTop, w: 8,  h: wallH, color: '#7a6b8a' });
                p.push({ x: wallBX + 8, y: wallTop, w: 40, h: 8,     color: '#5a7a5a' });
                lb.push({ text: 'GRAB+UP', x: wallBX - 32, y: FLOOR_Y - 28 });
                const d1x = wallBX + 50, d2x = d1x + 50;
                p.push({ x: d1x, y: wallTop + 55, w: 50, h: 8, color: '#5a7a5a' });
                p.push({ x: d2x, y: wallTop + 105, w: 40, h: 8, color: '#5a7a5a' });
                const exitX = Math.min(ox + ROOM_W - 10, d2x + 32);
                if (exitX < ox + ROOM_W) p.push({ x: exitX, y: FLOOR_Y, w: ox + ROOM_W - exitX, h: FLOOR_H, color: '#3a5a3a' });
            }

            else if (type === 'stair') {
                p.push({ x: ox, y: FLOOR_Y, w: 55, h: FLOOR_H, color: '#3a5a3a' });
                const steps = 4 + (ri() % 2);
                const spacing = (ROOM_W - 80) / steps;
                for (let s = 0; s < steps; s++) {
                    const sx = ox + 55 + Math.floor(s * spacing);
                    const sy = FLOOR_Y - 32 - s * 30;
                    const sw = 48 + (ri() % 18);
                    p.push({ x: sx, y: sy, w: sw, h: 8, color: '#5a7a5a' });
                    if (s === steps - 1) {
                        goal = { x: sx + sw - 18, y: sy - 14, w: 12, h: 12, color: '#d4af37' };
                        lb.push({ text: 'SUMMIT', x: sx + 4, y: sy - 4 });
                    }
                }
            }
        }

        return { platforms: p, pitShading: pits, roomSpawns: sp, roomNames: nm, roomSkies: sk, roomLabels: lb, goal };
    }

    function splitFloor(ox, floorY, roomW, numGaps, gapW, rng) {
        const usable = roomW - 16;
        const segW   = Math.floor((usable - numGaps * gapW) / (numGaps + 1));
        const floors = [], gaps = [];
        let curX = ox + 8;
        for (let i = 0; i <= numGaps; i++) {
            const w = Math.max(28, segW + Math.floor(rng() * 14 - 7));
            floors.push({ x: curX, w });
            curX += w;
            if (i < numGaps) {
                const gw = Math.max(28, gapW + Math.floor(rng() * 10 - 5));
                gaps.push({ x: curX, w: gw });
                curX += gw;
            }
        }
        return { floors, gaps };
    }

    function applyLevel(data, seed) {
        platforms  = data.platforms;  pitShading  = data.pitShading;
        roomSpawns = data.roomSpawns; roomNames   = data.roomNames;
        roomSkies  = data.roomSkies;  roomLabels  = data.roomLabels;
        GOAL = data.goal; currentSeed = seed;
        const el = document.getElementById('map-seed');
        if (el) el.textContent = `Seed: ${seed}`;
    }

    const roomBanners = [
        { text: '1', x: 148 }, { text: '2', x: 468 },
        { text: '3', x: 788 }, { text: '4', x: 1108 }, { text: '5', x: 1428 },
    ];

    const initSeed = Math.floor(Math.random() * 999999);
    applyLevel(buildLevel(initSeed), initSeed);

    // ── Run state ────────────────────────────────────────────────────────────
    let cameraX     = 0;
    let respawnRoom  = 0;
    let furthestRoom = 0;
    const player = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
    let runStart = performance.now();
    let deaths   = 0;
    let bestMs   = null;
    let won      = false;
    let winMs    = 0;

    function getRoomIdx() {
        return Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player.x / ROOM_W)));
    }
    function respawn() {
        player.reset(roomSpawns[respawnRoom].x, roomSpawns[respawnRoom].y);
        if (!won) deaths++;
    }
    function restartRun() {
        respawnRoom = furthestRoom = 0;
        player.reset(roomSpawns[0].x, roomSpawns[0].y);
        runStart = performance.now();
        deaths = 0; won = false;
    }

    // ── AI Player Controller ─────────────────────────────────────────────────
    let aiEnabled = false;

    const AI = {
        stuckFrames: 0,
        lastX: 0,
        jumpHold: 0,       // frames remaining to hold jump
        chimneyTimer: 0,
        climbTimer: 0,

        // Probe any rect against current platforms
        hits(x, y, w, h) {
            for (const p of platforms)
                if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) return true;
            return false;
        },

        compute() {
            const PW = player.w, PH = player.h;
            const px = player.x, py = player.y;

            // ── Sensors ──────────────────────────────────────────────────────
            const onGround    = this.hits(px, py + PH, PW, 2);
            const wallRight   = this.hits(px + PW,     py + 2, 2, PH - 4);
            const wallLeft    = this.hits(px - 2,      py + 2, 2, PH - 4);
            const inChimney   = wallLeft && wallRight && !onGround;

            // Ground continuity: check 3 distances ahead at foot level
            const groundNear  = this.hits(px + PW + 4,  py + PH, 4, 8);
            const groundMid   = this.hits(px + PW + 18, py + PH, 4, 8);
            const groundFar   = this.hits(px + PW + 32, py + PH, 4, 8);
            const gapAhead    = !groundNear && !groundMid && !groundFar;

            // Platform reachable above+right (for elevated stepping stones)
            const platformAbove = this.hits(px + PW, py - 70, 80, 70);

            // Stuck detection
            const moved = Math.abs(px - this.lastX) > 0.5;
            this.stuckFrames = moved ? 0 : this.stuckFrames + 1;
            this.lastX = px;

            // ── Decision ─────────────────────────────────────────────────────
            let moveX = 1, moveY = 0;
            let jumpPressed = false, jumpHeld = false;
            let dashPressed = false, grabHeld = false;

            // Recovery: stuck for 2 seconds → dash + jump
            if (this.stuckFrames > 120) {
                this.stuckFrames = 0;
                this.jumpHold = 10;
                return { moveX: 1, moveY: -1, jumpPressed: true, jumpHeld: true, dashPressed: true, grabHeld: false };
            }

            // ── Chimney: alternating wall-jumps ───────────────────────────────
            if (inChimney) {
                this.chimneyTimer++;
                this.climbTimer = 0;
                const PHASE = 18; // frames per half-cycle
                const phase = Math.floor(this.chimneyTimer / PHASE) % 2;
                jumpPressed = (this.chimneyTimer % PHASE === 1);
                return {
                    moveX: phase === 0 ? -1 : 1,
                    moveY: -1,
                    jumpPressed,
                    jumpHeld: true,
                    dashPressed: false,
                    grabHeld: false
                };
            }
            this.chimneyTimer = 0;

            // ── Wall climbing: right wall present, need to go up ──────────────
            // Detect a tall wall: wall directly right AND platform surface above it
            const tallWall = wallRight && this.hits(px + PW, py - 60, 4, 60);
            if (tallWall && !onGround) {
                this.climbTimer++;
                // Grab the wall, move up
                if (this.climbTimer < 80) {
                    return { moveX: 1, moveY: -1, jumpPressed: false, jumpHeld: false, dashPressed: false, grabHeld: true };
                }
                // Climbed long enough — jump off to the right
                this.climbTimer = 0;
                this.jumpHold = 12;
                return { moveX: 1, moveY: 0, jumpPressed: true, jumpHeld: true, dashPressed: false, grabHeld: false };
            }
            this.climbTimer = 0;

            // ── Normal / grounded ─────────────────────────────────────────────
            if (onGround) {
                this.jumpHold = 0;

                if (wallRight) {
                    // Walk into a wall on the ground → jump + grab to climb
                    this.jumpHold = 18;
                    return { moveX: 1, moveY: -1, jumpPressed: true, jumpHeld: true, dashPressed: false, grabHeld: true };
                }

                if (gapAhead) {
                    // Gap coming — run-jump
                    this.jumpHold = 16;
                    jumpPressed = true;
                }

                jumpHeld = this.jumpHold > 0;
                if (this.jumpHold > 0) this.jumpHold--;

            } else {
                // ── Airborne ─────────────────────────────────────────────────
                jumpHeld = this.jumpHold > 0;
                if (this.jumpHold > 0) this.jumpHold--;

                if (wallRight) {
                    // Touching a right wall while airborne → grab + climb
                    grabHeld = true;
                    moveY = -1;
                }

                // Wall to the left but not right (bounced off something)
                if (wallLeft && !wallRight) moveX = 1;
            }

            return { moveX, moveY, jumpPressed, jumpHeld, dashPressed, grabHeld };
        }
    };

    // Toggle AI control (called from button)
    window.toggleAIControl = function () {
        aiEnabled = !aiEnabled;
        const btn = document.getElementById('ai-control-btn');
        if (btn) {
            btn.textContent = aiEnabled ? '🤖 AI Control: ON' : '🎮 AI Control: OFF';
            btn.style.background = aiEnabled ? '#1a7a1a' : '#5a2a80';
        }
        // Reset stuck state when enabling
        if (aiEnabled) { AI.stuckFrames = 0; AI.jumpHold = 0; AI.chimneyTimer = 0; AI.climbTimer = 0; }
    };

    // ── Input ────────────────────────────────────────────────────────────────
    const keys    = Object.create(null);
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
    window.addEventListener('keyup', (e) => { if (tracked.has(e.code)) keys[e.code] = false; });

    function readInput() {
        if (aiEnabled) return AI.compute();
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

    // ── Globals for buttons ───────────────────────────────────────────────────
    window.aiGenerateMap = function (seedOverride) {
        const seed = (seedOverride !== undefined) ? (seedOverride | 0) : Math.floor(Math.random() * 999999);
        applyLevel(buildLevel(seed), seed);
        bestMs = null;
        restartRun();
        AI.stuckFrames = 0; AI.jumpHold = 0; AI.chimneyTimer = 0; AI.climbTimer = 0;
    };
    window.loadSeed = function () {
        const input = document.getElementById('seed-input');
        const val   = parseInt(input ? input.value : '', 10);
        if (!isNaN(val)) window.aiGenerateMap(val);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    function playerOverlapsGoal() {
        return GOAL && player.x < GOAL.x + GOAL.w && player.x + player.w > GOAL.x
                    && player.y < GOAL.y + GOAL.h && player.y + player.h > GOAL.y;
    }

    function render() {
        const roomIdx = getRoomIdx();
        const [skyTop, skyBot] = roomSkies[roomIdx] || ['#1a2a4a','#3a5a8a'];
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBot);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

        ctx.save(); ctx.translate(-cameraX, 0);

        ctx.fillStyle = 'rgba(150,40,40,0.25)';
        for (const pit of pitShading) ctx.fillRect(pit.x, pit.y, pit.w, pit.h);

        for (const pl of platforms) {
            ctx.fillStyle = pl.color; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(pl.x, pl.y, pl.w, 1);
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
        for (let r = 1; r < NUM_ROOMS; r++) {
            ctx.beginPath(); ctx.moveTo(r * ROOM_W, 0); ctx.lineTo(r * ROOM_W, H); ctx.stroke();
        }

        if (GOAL && GOAL.x !== undefined) {
            const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
            ctx.fillStyle = GOAL.color; ctx.globalAlpha = pulse;
            ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
            ctx.globalAlpha = 1;
        }

        // AI sensor overlay (debug dots when AI is on)
        if (aiEnabled) {
            const px = player.x, py = player.y, PW = player.w, PH = player.h;
            ctx.fillStyle = 'rgba(0,255,0,0.5)';
            ctx.fillRect(px + PW + 4,  py + PH, 4, 3); // ground near
            ctx.fillRect(px + PW + 18, py + PH, 4, 3); // ground mid
            ctx.fillRect(px + PW + 32, py + PH, 4, 3); // ground far
        }

        player.draw(ctx);

        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.font = 'bold 80px monospace';
        for (const b of roomBanners) ctx.fillText(b.text, b.x, 120);

        ctx.fillStyle = 'rgba(220,220,220,0.55)'; ctx.font = '6px monospace';
        for (const lbl of roomLabels) ctx.fillText(lbl.text, lbl.x, lbl.y);

        ctx.restore();

        // HUD
        ctx.fillStyle = 'rgba(255,255,255,0.50)'; ctx.font = '7px monospace';
        ctx.fillText(roomNames[roomIdx] || '', 10, 10);
        for (let i = 0; i < NUM_ROOMS; i++) {
            ctx.fillStyle = i <= furthestRoom ? '#d4af37' : 'rgba(255,255,255,0.20)';
            ctx.fillRect(10 + i * 12, 14, 8, 3);
        }
        if (aiEnabled) {
            ctx.fillStyle = '#44ff44'; ctx.font = 'bold 7px monospace';
            ctx.fillText('AI', W - 20, 10);
        }

        if (won) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(55, 60, 210, 60);
            ctx.fillStyle = '#d4af37'; ctx.font = '12px monospace';
            ctx.fillText('CLEARED!', 100, 82);
            ctx.fillStyle = '#fff'; ctx.font = '8px monospace';
            ctx.fillText(`time   ${(winMs / 1000).toFixed(2)}s`, 76, 98);
            ctx.fillText(`deaths ${deaths}`,                       76, 108);
            ctx.fillText('press R to retry',                       76, 118);
        }
    }

    // ── Loop ─────────────────────────────────────────────────────────────────
    let last = performance.now(), accum = 0;
    let stepCount = 0, fpsWindow = last, measuredFps = 60;

    function step() {
        const input = readInput();
        player.update(input, platforms, FIXED_DT);

        if (player.y <= DEATH_Y) {
            respawnRoom  = getRoomIdx();
            furthestRoom = Math.max(furthestRoom, respawnRoom);
        }
        cameraX = getRoomIdx() * ROOM_W;

        if (!won && playerOverlapsGoal()) {
            won = true; winMs = performance.now() - runStart;
            if (bestMs === null || winMs < bestMs) bestMs = winMs;
        }
        if (player.y > DEATH_Y) { respawn(); if (aiEnabled) { AI.stuckFrames = 0; AI.jumpHold = 0; } }

        for (const k of Object.keys(pressed)) delete pressed[k];
        stepCount++;
    }

    function frame(now) {
        accum += (now - last) / 1000; last = now;
        if (accum > MAX_ACCUM) accum = MAX_ACCUM;
        let didStep = false;
        while (accum >= FIXED_DT) { step(); accum -= FIXED_DT; didStep = true; }
        if (didStep) render();

        if (now - fpsWindow >= 1000) {
            measuredFps = stepCount * 1000 / (now - fpsWindow);
            stepCount = 0; fpsWindow = now;
        }
        const elapsed = won ? winMs : (performance.now() - runStart);
        statusEl.textContent =
            `${roomNames[getRoomIdx()] || ''}  ` +
            `time=${(elapsed/1000).toFixed(2)}s  deaths=${deaths}  ` +
            (bestMs !== null ? `best=${(bestMs/1000).toFixed(2)}s  ` : '') +
            `${player.state}  ${measuredFps.toFixed(0)} fps` +
            (aiEnabled ? '  [AI]' : '');
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
