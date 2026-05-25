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
    let   DEATH_Y   = H + 20;
    const ROOM_W    = W;
    const AI_ROOMS  = 5;         // rooms used by the procedural AI maps
    let   NUM_ROOMS = AI_ROOMS;  // current room count — changes per level
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
    let entities    = [];

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
        entities = data.entities || [];
        const el = document.getElementById('map-seed');
        if (el) el.textContent = `Seed: ${seed}`;
        const el2 = document.getElementById('random-map-seed');
        if (el2) el2.textContent = `Seed: ${seed}`;
    }

    // roomBanners generated dynamically in render() based on current NUM_ROOMS

    // Initialise with a random AI map so roomSpawns / GOAL exist for player construction.
    // The game loop won't actually run until startGame() is called.
    const initSeed = Math.floor(Math.random() * 999999);
    applyLevel(buildLevel(initSeed), initSeed);

    // ── Run state ────────────────────────────────────────────────────────────
    let gameActive   = false;   // true only after the user picks a level
    let currentMode  = 'ai';    // 'gauntlet' | 'ai'
    let cameraX      = 0;
    let cameraY      = 0;
    let worldH       = H;    // total world height for custom levels
    let worldMinY    = 0;    // world Y of the topmost row (can be negative)
    let respawnRoom  = 0;
    let furthestRoom = 0;
    const player = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
    let runStart = performance.now();
    let deaths   = 0;
    let bestMs   = null;
    let won      = false;
    let winMs    = 0;

    // AI stuck-death: if position hasn't changed in 3 s, force a death
    const AI_STUCK_LIMIT = 180; // frames (~3 s at 60 fps)
    let aiStuckFrames = 0;
    let aiStuckLastX  = 0;

    function getRoomIdx() {
        return Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player.x / ROOM_W)));
    }
    function respawn() {
        aiStuckFrames = 0;
        aiStuckLastX  = player.x;
        if (aiEnabled && typeof NeuralAI !== 'undefined') {
            NeuralAI.onDeath();
            respawnRoom = 0;
            NeuralAI.reset(roomSpawns[0].x);
            updateAIBtn();
        }
        player.reset(roomSpawns[respawnRoom].x, roomSpawns[respawnRoom].y);
        if (!won) deaths++;
    }
    function restartRun() {
        aiStuckFrames = 0;
        aiStuckLastX  = roomSpawns[0] ? roomSpawns[0].x : 0;
        respawnRoom = furthestRoom = 0;
        player.reset(roomSpawns[0].x, roomSpawns[0].y);
        runStart = performance.now();
        deaths = 0; won = false;
        for (const e of entities) e.reset();
    }

    // ── AI Player Controller (neural — delegates to NeuralAI in ai-neural.js) ─
    let aiEnabled   = false;
    let aiSpeedMult = 1;

    function initNeuralAI() {
        if (typeof NeuralAI === 'undefined') return;
        NeuralAI.init(roomSpawns[0].x, GOAL.x + GOAL.w);
    }

    // Toggle AI control (called from button)
    window.toggleAIControl = function () {
        aiEnabled = !aiEnabled;
        if (aiEnabled) initNeuralAI();
        updateAIBtn();
    };

    window.setAISpeed = function (n) {
        aiSpeedMult = n;
        document.querySelectorAll('.ai-speed-btn').forEach(b => {
            b.style.background = parseInt(b.dataset.speed) === n ? '#1a6a1a' : '#3a3a6a';
        });
    };

    window.resetAI = function () {
        if (typeof NeuralAI !== 'undefined') NeuralAI.resetWeights();
        initNeuralAI();
        restartRun();
        updateAIBtn();
    };

    function updateAIBtn() {
        const btn = document.getElementById('ai-control-btn');
        if (!btn) return;
        if (aiEnabled) {
            const gen = (typeof NeuralAI !== 'undefined') ? NeuralAI.generation : 0;
            btn.textContent = `🧠 Neural AI: ON (Gen ${gen})`;
            btn.style.background = '#1a7a1a';
        } else {
            btn.textContent = '🧠 Neural AI: OFF';
            btn.style.background = '#5a2a80';
        }
    }

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
        if (aiEnabled && typeof NeuralAI !== 'undefined')
            return NeuralAI.compute(player, platforms, GOAL);
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
        if (typeof NeuralAI !== 'undefined') NeuralAI.reset(roomSpawns[0].x);
    };
    window.loadSeed = function () {
        const input = document.getElementById('seed-input');
        const val   = parseInt(input ? input.value : '', 10);
        if (!isNaN(val)) window.aiGenerateMap(val);
    };

    // ── Random level with entities (guaranteed clearable) ────────────────────
    function buildRandomLevel(seed) {
        const rng = mkRng(seed);
        const ri  = () => Math.floor(rng() * 1000);
        const p = [], pits = [], sp = [], nm = [], sk = [], lb = [];
        let goal = {};

        // ── Pass 1: Freeform stepping-stone geometry ──────────────────────
        const ROOM_NAMES = ['VALLEY','RIDGE','CAVERN','PEAK','GORGE','LEDGE',
            'ASCENT','DESCENT','VAULT','CLIFF','HOLLOW','SPIRE'];

        for (let room = 0; room < NUM_ROOMS; room++) {
            const ox = room * ROOM_W;
            sk.push(PALETTES[(ri() + room) % PALETTES.length]);
            nm.push(`ROOM ${room + 1} — ${ROOM_NAMES[ri() % ROOM_NAMES.length]}`);
            sp.push({ x: ox + 14, y: FLOOR_Y - 12 });

            if (room === 0)             p.push({ x: ox,               y: 0, w: 8, h: 180, color: '#4a5570' });
            if (room === NUM_ROOMS - 1) p.push({ x: ox + ROOM_W - 8, y: 0, w: 8, h: 180, color: '#4a5570' });

            const entryW = 28 + (ri() % 32);
            const exitW  = 28 + (ri() % 32);
            p.push({ x: ox,                  y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
            p.push({ x: ox + ROOM_W - exitW, y: FLOOR_Y, w: exitW,  h: FLOOR_H, color: '#3a5a3a' });
            pits.push({ x: ox + entryW, y: FLOOR_Y, w: ROOM_W - entryW - exitW, h: FLOOR_H });

            const numStones = 2 + (ri() % 3);
            let cx = ox + entryW;
            let cy = FLOOR_Y;
            const stones = [];

            for (let s = 0; s < numStones; s++) {
                const sw     = 26 + (ri() % 36);
                const rawGap = 10 + (ri() % 56);
                const goUp   = rng() > 0.38;
                const dy     = goUp ? -(14 + ri() % 52) : (8 + ri() % 42);
                const newY   = Math.max(18, Math.min(FLOOR_Y - 18, cy + dy));
                const rise   = cy - newY;
                const maxGap = rise > 42 ? 46 : rise > 14 ? 60 : 76;
                const gap    = Math.min(rawGap, maxGap);
                let sx = cx + gap;
                sx = Math.max(ox + entryW + 4, Math.min(ox + ROOM_W - exitW - sw - 4, sx));
                if (sx <= cx) sx = cx + 8;
                p.push({ x: sx, y: newY, w: sw, h: 8, color: '#5a7a5a' });
                stones.push({ x: sx, y: newY, w: sw });
                cx = sx + sw;
                cy = newY;
            }

            const exitStart = ox + ROOM_W - exitW;
            let safety = 0;
            while (exitStart - cx > 75 && safety++ < 4) {
                const bw   = 26 + (ri() % 22);
                const bGap = 10 + (ri() % Math.max(1, Math.min(55, exitStart - cx - bw - 5)));
                const bx   = Math.min(cx + bGap, exitStart - bw - 4);
                if (bx <= cx) break;
                const by = Math.max(18, Math.min(FLOOR_Y - 18, cy + (ri() % 40) - 20));
                p.push({ x: bx, y: by, w: bw, h: 8, color: '#5a7a5a' });
                stones.push({ x: bx, y: by, w: bw });
                cx = bx + bw;
                cy = by;
            }

            if (room === NUM_ROOMS - 1 && stones.length > 0) {
                const top = stones.reduce((a, b) => a.y < b.y ? a : b);
                goal = { x: top.x + top.w - 18, y: top.y - 14, w: 12, h: 12, color: '#d4af37' };
                lb.push({ text: 'GOAL', x: top.x + 4, y: top.y - 4 });
            }
        }

        // ── Pass 2: Random entity placement across ALL platforms ──────────
        // Candidates: horizontal (h≤12), wide enough (w≥18), not boundary walls
        const cands = p.filter(pl => pl.w >= 18 && pl.h <= 12 && pl.y > 8);

        // Seeded Fisher-Yates shuffle so entity spread is deterministic
        const pool = [...cands];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = ri() % (i + 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        // Weighted type pool — more copies = higher chance
        const typePool = [
            'crystal', 'crystal', 'crystal', 'crystal',
            'spring',  'spring',
            'bumper',  'bumper',
            'spike',   'spike',   'spike',
            'blade_h', 'blade_h',
            'blade_c',
            'berry',   'berry',
        ];

        const ents  = [];
        const used  = new Set(); // one lethal entity per platform index
        const total = 10 + (ri() % 7); // 10–16 entities spread across the whole level

        for (let i = 0; i < total && i < pool.length; i++) {
            const pl   = pool[i];
            const pidx = cands.indexOf(pl);
            const type = typePool[ri() % typePool.length];
            const cx   = pl.x + Math.floor(pl.w / 2);

            if (type === 'spring') {
                ents.push(makeSpring(cx, pl.y, 'floor'));

            } else if (type === 'crystal') {
                ents.push(makeDashCrystal(cx, pl.y - 14));

            } else if (type === 'bumper') {
                ents.push(makeBumper(cx, pl.y - 22));

            } else if (type === 'berry') {
                ents.push(makeStrawberry(cx, pl.y - 15));

            } else if (type === 'spike' && pl.w >= 20 && !used.has(pidx)) {
                used.add(pidx);
                // Right-edge spike: player approaching from the left can land safely
                // on the left 80 % of the platform and jump off before reaching the spike
                ents.push(makeSpike(pl.x + pl.w - 6, pl.y, 6, 'up'));

            } else if (type === 'blade_h' && pl.w >= 36 && !used.has(pidx)) {
                used.add(pidx);
                // Horizontal patrol above the platform. Blade centre is 26 px above surface.
                // Player height is 11 px, so blade bottom (centre+6 = pl.y-20) sits 9 px
                // above the player's head (pl.y-11) — safe to stand; must TIME crossing.
                ents.push(makeEnticeBlade({
                    ax: pl.x + 8,       ay: pl.y - 26,
                    bx: pl.x + pl.w - 20, by: pl.y - 26,
                    speed: 38 + (ri() % 28),
                }));

            } else if (type === 'blade_c' && !used.has(pidx)) {
                used.add(pidx);
                // Circular blade orbiting 28 px above the platform surface
                ents.push(makeEnticeBlade({
                    path: 'circular',
                    cx: cx, cy: pl.y - 28,
                    radius: 12 + (ri() % 12),
                    startAngle: rng() * Math.PI * 2,
                    speed: 1.4 + rng() * 1.6,
                }));

            } else {
                // Fallback for failed conditions: always-safe crystal
                ents.push(makeDashCrystal(cx, pl.y - 14));
            }
        }

        // Golden strawberry always spawns near the goal
        if (goal.x !== undefined) ents.push(makeGoldenStrawberry(goal.x + 6, goal.y - 14));

        return { platforms: p, pitShading: pits, roomSpawns: sp, roomNames: nm, roomSkies: sk, roomLabels: lb, goal, entities: ents };
    }

    window.randomGenerateMap = function (seedOverride) {
        const seed = (seedOverride !== undefined) ? (seedOverride | 0) : Math.floor(Math.random() * 999999);
        applyLevel(buildRandomLevel(seed), seed);
        bestMs = null;
        restartRun();
    };
    window.loadRandomSeed = function () {
        const input = document.getElementById('random-seed-input');
        const val   = parseInt(input ? input.value : '', 10);
        if (!isNaN(val)) window.randomGenerateMap(val);
    };

    // ── Gauntlet level (hand-crafted, 6 rooms × 320 px) ─────────────────────
    function buildGauntletLevel() {
        const p = [], pits = [], sp = [], nm = [], sk = [], lb = [];

        // ── Room 1 — Entry Hall (x 0–319) ───────────────────────────────────
        // Tiny spawn ledge → 4 ascending stepping stones → high exit ledge.
        // No long floor — the void is immediate.
        p.push({x:0,   y:0,   w:8,   h:180, color:'#4a5570'}); // left wall
        p.push({x:0,   y:168, w:38,  h:12,  color:'#3a5a3a'}); // spawn ledge
        pits.push({x:38, y:168, w:282, h:12});                  // wide pit
        p.push({x:46,  y:148, w:38,  h:8,   color:'#5a7a5a'}); // stone 1
        p.push({x:100, y:124, w:42,  h:8,   color:'#5a7a5a'}); // stone 2
        p.push({x:158, y:100, w:46,  h:8,   color:'#5a7a5a'}); // stone 3
        p.push({x:220, y:76,  w:50,  h:8,   color:'#5a7a5a'}); // stone 4
        p.push({x:270, y:52,  w:50,  h:8,   color:'#7a9a7a'}); // exit ledge
        sp.push({x:10, y:155});
        nm.push('ROOM 1 — ENTRY HALL');
        sk.push(['#1a2a4a','#3a5a8a']);
        lb.push({text:'JUMP',  x:42,  y:175});
        lb.push({text:'↑ UP',  x:162, y:97});

        // ── Room 2 — Pillar Hall (x 320–639) ────────────────────────────────
        // Three ceiling pillars with floating shelves between them.
        // Player enters at y≈52 from room 1 and lands on the first shelf.
        pits.push({x:320, y:168, w:320, h:12});                 // full-room void
        p.push({x:320, y:60,  w:80,  h:8,   color:'#5a6b7a'}); // shelf 0 (landing)
        p.push({x:400, y:0,   w:8,   h:80,  color:'#4a5570'}); // pillar A
        p.push({x:408, y:80,  w:72,  h:8,   color:'#5a6b7a'}); // shelf A
        p.push({x:480, y:0,   w:8,   h:66,  color:'#4a5570'}); // pillar B
        p.push({x:488, y:58,  w:72,  h:8,   color:'#5a7a5a'}); // shelf B
        p.push({x:560, y:0,   w:8,   h:52,  color:'#4a5570'}); // pillar C
        p.push({x:568, y:44,  w:72,  h:8,   color:'#7a9a7a'}); // exit shelf
        sp.push({x:334, y:47});
        nm.push('ROOM 2 — PILLAR HALL');
        sk.push(['#180a30','#2a1050']);
        lb.push({text:'WALL JUMP', x:325, y:162});
        lb.push({text:'↗ UP',      x:494, y:55});

        // ── Room 3 — Lock Room (x 640–959) ──────────────────────────────────
        // Walled arch in the center — wall-jump up and dash out.
        // Player enters from room 2's exit shelf (y≈44) and can drop to the left floor.
        p.push({x:640, y:168, w:56,  h:12,  color:'#3a5a3a'}); // floor-L (spawn area)
        p.push({x:900, y:168, w:60,  h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:696, y:168, w:204, h:12});
        p.push({x:726, y:56,  w:8,   h:112, color:'#7a6b8a'}); // wall A
        p.push({x:800, y:56,  w:8,   h:112, color:'#7a6b8a'}); // wall B
        p.push({x:726, y:56,  w:82,  h:8,   color:'#5a7a5a'}); // arch roof
        p.push({x:808, y:108, w:62,  h:8,   color:'#5a7a5a'}); // exit step
        p.push({x:862, y:76,  w:98,  h:8,   color:'#7a9a7a'}); // exit ledge
        sp.push({x:654, y:155});
        nm.push('ROOM 3 — LOCK ROOM');
        sk.push(['#0a2010','#1a4028']);
        lb.push({text:'WALL JUMP', x:732, y:175});
        lb.push({text:'DASH →',    x:736, y:53});

        // ── Room 4 — Crush Zone (x 960–1279) ────────────────────────────────
        // Danger ceiling slab + three ascending steps + long upper platform.
        // Ceiling spikes punish jumping too high; vertical blades act as pistons.
        p.push({x:960,  y:0,   w:210, h:8,   color:'#4a2828'}); // danger ceiling
        p.push({x:960,  y:168, w:52,  h:12,  color:'#3a5a3a'}); // floor-L
        p.push({x:1228, y:168, w:52,  h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:1012, y:168, w:216, h:12});
        p.push({x:1012, y:136, w:52,  h:8,   color:'#8a3030'}); // step A
        p.push({x:1084, y:106, w:52,  h:8,   color:'#5a7a5a'}); // step B
        p.push({x:1156, y:76,  w:52,  h:8,   color:'#5a7a5a'}); // step C
        p.push({x:1008, y:30,  w:264, h:8,   color:'#4a4a70'}); // long upper platform
        sp.push({x:974, y:155});
        nm.push('ROOM 4 — CRUSH ZONE');
        sk.push(['#3a0a00','#6a1808']);
        lb.push({text:'DANGER',  x:963, y:19});
        lb.push({text:'CRUSH',   x:1016, y:133});
        lb.push({text:'DASH UP', x:1088, y:103});

        // ── Room 5 — Fly Zone (x 1280–1599) ─────────────────────────────────
        // Huge void — chained air-dashes required. Crystals refill mid-flight.
        p.push({x:1280, y:168, w:46,  h:12,  color:'#3a5a3a'});
        p.push({x:1554, y:168, w:46,  h:12,  color:'#3a5a3a'});
        pits.push({x:1326, y:168, w:228, h:12});
        p.push({x:1338, y:118, w:54,  h:8,   color:'#5a7a8a'}); // platform 1
        p.push({x:1416, y:82,  w:54,  h:8,   color:'#5a7a8a'}); // platform 2
        p.push({x:1494, y:50,  w:60,  h:8,   color:'#5a7a8a'}); // platform 3
        sp.push({x:1294, y:155});
        nm.push('ROOM 5 — FLY ZONE');
        sk.push(['#001a3a','#003870']);
        lb.push({text:'DASH!', x:1342, y:115});
        lb.push({text:'DASH!', x:1420, y:79});
        lb.push({text:'DASH!', x:1498, y:47});

        // ── Room 6 — Summit (x 1600–1919) ───────────────────────────────────
        // Classic ascending staircase to the pedestal. Hardest entities here.
        p.push({x:1912, y:0,   w:8,   h:180, color:'#4a5570'}); // right wall
        p.push({x:1600, y:168, w:52,  h:12,  color:'#3a5a3a'}); // base floor
        p.push({x:1658, y:148, w:42,  h:8,   color:'#5a7a5a'}); // step 1
        p.push({x:1718, y:118, w:42,  h:8,   color:'#5a7a5a'}); // step 2
        p.push({x:1778, y:88,  w:42,  h:8,   color:'#5a7a5a'}); // step 3
        p.push({x:1838, y:58,  w:52,  h:8,   color:'#7a9a7a'}); // step 4
        p.push({x:1876, y:28,  w:36,  h:8,   color:'#9aba9a'}); // pedestal
        sp.push({x:1614, y:155});
        nm.push('ROOM 6 — SUMMIT');
        sk.push(['#0a0a18','#1c2438']);
        lb.push({text:'SUMMIT', x:1842, y:55});

        // ── Entities ─────────────────────────────────────────────────────────
        const ents = [];

        // Room 1: Spring on stone 1 teaches bounce; spike guards the ledge edge;
        // dash crystal on stone 4 teaches dashing; strawberry on exit ledge is optional.
        ents.push(makeSpring(65, 148, 'floor'));
        ents.push(makeSpike(38, 168, 8, 'up'));
        ents.push(makeDashCrystal(245, 66));
        ents.push(makeStrawberry(295, 44));

        // Room 2: Horizontal blades patrol each gap between pillars — the player
        // must time their wall-jumps and dashes to slip past.
        ents.push(makeEnticeBlade({ ax: 328, ay: 40, bx: 396, by: 40, speed: 52 }));
        ents.push(makeEnticeBlade({ ax: 416, ay: 56, bx: 476, by: 56, speed: 64 }));
        ents.push(makeSpike(328, 60, 8, 'up'));
        ents.push(makeDashCrystal(504, 48));

        // Room 3: Spike guards the arch entrance; crumble block inside the arch
        // creates urgency (wall-jump out before it breaks); horizontal blade patrols
        // the pit below; bumper on exit ledge launches to safety.
        ents.push(makeSpike(696, 168, 8, 'up'));
        ents.push(makeCrumbleBlock(734, 96, 58));
        ents.push(makeEnticeBlade({ ax: 740, ay: 148, bx: 796, by: 148, speed: 55 }));
        ents.push(makeBumper(908, 88));

        // Room 4: Ceiling spike clusters create a low ceiling of death; two vertical
        // blades oscillate like pistons and must be timed; dash crystal at the far end
        // rewards reaching the long upper platform.
        ents.push(makeSpike(980,  8, 24, 'down'));
        ents.push(makeSpike(1044, 8, 24, 'down'));
        ents.push(makeSpike(1116, 8, 24, 'down'));
        ents.push(makeEnticeBlade({ ax: 1040, ay: 14, bx: 1040, by: 126, speed: 68 }));
        ents.push(makeEnticeBlade({ ax: 1116, ay: 14, bx: 1116, by: 96,  speed: 82 }));
        ents.push(makeDashCrystal(1232, 20));

        // Room 5: Crystals are essential for the aerial crossing; bumpers serve as
        // launch pads between platforms; sweeping diagonal blade punishes hovering.
        ents.push(makeDashCrystal(1392, 98));
        ents.push(makeDashCrystal(1464, 62));
        ents.push(makeBumper(1350, 108));
        ents.push(makeBumper(1426, 72));
        ents.push(makeEnticeBlade({ ax: 1312, ay: 148, bx: 1556, by: 40, speed: 44 }));
        ents.push(makeStrawberry(1520, 42));

        // Room 6: Diagonal blade guards the entire staircase; circular blade orbits
        // the pedestal; crumble bridges between steps force quick movement; edge spikes
        // punish hesitation; golden strawberry at the peak is the ultimate reward.
        ents.push(makeEnticeBlade({ ax: 1666, ay: 142, bx: 1886, by: 22, speed: 50 }));
        ents.push(makeEnticeBlade({ path: 'circular', cx: 1858, cy: 38, radius: 22, startAngle: 0, speed: 2.2 }));
        ents.push(makeCrumbleBlock(1690, 132, 26));
        ents.push(makeCrumbleBlock(1750, 102, 26));
        ents.push(makeCrumbleBlock(1810, 72,  26));
        ents.push(makeSpike(1693, 148, 6, 'up'));
        ents.push(makeSpike(1753, 118, 6, 'up'));
        ents.push(makeSpike(1813, 88,  6, 'up'));
        ents.push(makeStrawberry(1794, 80));
        ents.push(makeGoldenStrawberry(1894, 21));

        const goal = { x:1882, y:12, w:12, h:12, color:'#d4af37' };
        return { platforms: p, pitShading: pits, roomSpawns: sp,
                 roomNames: nm, roomSkies: sk, roomLabels: lb, goal, entities: ents };
    }

    // ── Custom level (built in the map editor, stored in localStorage) ───────
    function buildEntityFromSpec(e, ox, oy) {
        ox = ox || 0; oy = oy || 0;
        switch (e.type) {
            case 'spring':     return makeSpring(e.x + ox, e.y + oy, e.orientation || 'floor');
            case 'bumper':     return makeBumper(e.x + ox, e.y + oy);
            case 'crystal':    return makeDashCrystal(e.x + ox, e.y + oy);
            case 'spike':      return makeSpike(e.x + ox, e.y + oy, e.size || 8, e.dir || 'up');
            case 'blade_h':    return makeEnticeBlade({ ax:e.ax+ox, ay:e.ay+oy, bx:e.bx+ox, by:e.by+oy, speed:e.speed||60 });
            case 'blade_c':    return makeEnticeBlade({ path:'circular', cx:e.cx+ox, cy:e.cy+oy,
                                   radius:e.radius||18, startAngle:e.startAngle||0, speed:e.speed||1.5 });
            case 'strawberry': return makeStrawberry(e.x + ox, e.y + oy);
            case 'crumble':    return makeCrumbleBlock(e.x + ox, e.y + oy, e.w || 32);
            case 'falling':    return makeFallingBlock(e.x + ox, e.y + oy, e.w || 32, e.h || 8);
            case 'golden':     return makeGoldenStrawberry(e.x + ox, e.y + oy);
            default: return null;
        }
    }

    function buildCustomLevel(data) {
        // v2 format: { rooms:[{col,row,name,sky,spawn,platforms[],entities[]}], goal, startRoom }
        if (data.rooms) {
            const allPlatforms = [], allEntities = [], spawns = [], names = [], skies = [];
            let minRow = Infinity, maxRow = -Infinity;
            let minCol = Infinity, maxCol = -Infinity;

            for (const room of data.rooms) {
                const ox = room.col * ROOM_W, oy = room.row * H;
                minRow = Math.min(minRow, room.row); maxRow = Math.max(maxRow, room.row);
                minCol = Math.min(minCol, room.col); maxCol = Math.max(maxCol, room.col);
                for (const pl of (room.platforms || []))
                    allPlatforms.push({ ...pl, x: pl.x + ox, y: pl.y + oy });
                for (const e of (room.entities || [])) {
                    const built = buildEntityFromSpec(e, ox, oy);
                    if (built) allEntities.push(built);
                }
                spawns.push({ x: ox + (room.spawn ? room.spawn.x : 14), y: oy + (room.spawn ? room.spawn.y : FLOOR_Y - 13) });
                names.push(room.name || `ROOM ${spawns.length}`);
                skies.push(room.sky || ['#1a2a4a', '#3a5a8a']);
            }

            const totalCols  = maxCol - minCol + 1;
            const wMinY      = minRow * H;          // can be negative (rooms above row 0)
            const wH         = (maxRow - minRow + 1) * H;
            const goal = data.goal ? {
                x: data.goal.x + data.goal.col * ROOM_W,
                y: data.goal.y + data.goal.row * H,
                w: data.goal.w || 12, h: data.goal.h || 12, color: data.goal.color || '#d4af37',
            } : null;

            return {
                platforms:  allPlatforms,
                pitShading: [],
                roomSpawns: spawns,
                roomNames:  names,
                roomSkies:  skies,
                roomLabels: [],
                goal,
                entities:   allEntities,
                _numCols:   totalCols,
                _worldMinY: wMinY,
                _worldH:    wH,
            };
        }

        // v1 fallback: flat { platforms, entities, spawns, goal, numRooms }
        const ents = (data.entities || []).map(e => buildEntityFromSpec(e, 0, 0)).filter(Boolean);
        const n = data.numRooms || (data.spawns ? data.spawns.length : 3);
        const spawns = Array.from({ length: n }, (_, i) => {
            if (data.spawns && data.spawns[i]) return data.spawns[i];
            const ox = i * ROOM_W;
            const cands = (data.platforms || []).filter(p =>
                p.x < ox + ROOM_W && p.x + p.w > ox && p.y >= 80 && p.y <= FLOOR_Y && p.h <= FLOOR_H
            ).sort((a, b) => a.x - b.x);
            if (cands.length) { const pl = cands[0]; return { x: Math.max(pl.x, ox) + 14, y: pl.y - 13 }; }
            return { x: ox + 14, y: FLOOR_Y - 13 };
        });
        return {
            platforms:  data.platforms || [],
            pitShading: [],
            roomSpawns: spawns,
            roomNames:  data.names  || Array.from({ length: n }, (_, i) => `ROOM ${i + 1}`),
            roomSkies:  data.skies  || Array.from({ length: n }, () => ['#1a2a4a', '#3a5a8a']),
            roomLabels: [],
            goal:       data.goal || null,
            entities:   ents,
        };
    }

    // ── Level-select API (called from game.html buttons) ─────────────────────
    window.startGame = function (mode) {
        currentMode = mode;
        aiEnabled   = false;
        updateAIBtn();

        // Hide all mode-specific controls, then reveal the right set
        document.querySelectorAll('.ai-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.random-only').forEach(el => el.style.display = 'none');

        // Reset 2D world size for non-custom modes
        worldH = H; worldMinY = 0; DEATH_Y = H + 20; cameraY = 0;

        if (mode === 'gauntlet') {
            NUM_ROOMS = 6;
            applyLevel(buildGauntletLevel(), -1);
        } else if (mode === 'random') {
            NUM_ROOMS = AI_ROOMS;
            const seed = Math.floor(Math.random() * 999999);
            applyLevel(buildRandomLevel(seed), seed);
            document.querySelectorAll('.random-only').forEach(el => el.style.display = '');
        } else if (mode === 'custom') {
            const stored = localStorage.getItem('celeste_custom_level');
            if (!stored) {
                alert('No custom level found — build one in the Map Editor first!');
                return;
            }
            const data = JSON.parse(stored);
            const built = buildCustomLevel(data);
            NUM_ROOMS = built.roomSpawns.length;
            worldMinY = built._worldMinY || 0;
            worldH    = built._worldH    || H;
            DEATH_Y   = worldMinY + worldH + 20;
            cameraY   = worldMinY;
            // Horizontal extent for custom levels = unique cols × ROOM_W
            if (built._numCols) NUM_ROOMS = built._numCols;
            applyLevel(built, -1);
        } else {
            NUM_ROOMS = AI_ROOMS;
            const seed = Math.floor(Math.random() * 999999);
            applyLevel(buildLevel(seed), seed);
            document.querySelectorAll('.ai-only').forEach(el => el.style.display = '');
        }

        bestMs = null;
        restartRun();
        if (typeof NeuralAI !== 'undefined') NeuralAI.reset(roomSpawns[0].x);

        document.getElementById('level-menu').style.display = 'none';
        document.getElementById('game-ui').style.display    = 'flex';
        gameActive = true;
    };

    window.showLevelMenu = function () {
        gameActive = false;
        aiEnabled  = false;
        updateAIBtn();
        document.getElementById('game-ui').style.display    = 'none';
        document.getElementById('level-menu').style.display = '';
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

        ctx.save(); ctx.translate(-cameraX, -cameraY);

        // Starfield (parallax at 25% camera speed)
        ctx.save();
        ctx.translate(cameraX * 0.75, cameraY * 0.75); // undo 75% of translate so stars scroll slowly
        ctx.fillStyle = 'rgba(200,215,255,0.45)';
        for (let i = 0; i < 48; i++) {
            const sx = ((i * 137 + 29) * 1699) % (ROOM_W * 6);
            const sy = ((i * 97  + 11) * 1301) % H;
            ctx.fillRect(sx - cameraX * 0.75, sy, i % 4 === 0 ? 1.5 : 0.5, i % 4 === 0 ? 1.5 : 0.5);
        }
        ctx.restore();

        // Pit voids
        for (const pit of pitShading) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(pit.x, pit.y, pit.w, pit.h);
            ctx.fillStyle = 'rgba(200,30,30,0.35)';
            ctx.fillRect(pit.x, pit.y, pit.w, 2);
        }

        for (const pl of platforms) {
            ctx.fillStyle = pl.color; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
            ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pl.x, pl.y, pl.w, 1);      // top highlight
            ctx.fillStyle = 'rgba(0,0,0,0.30)';       ctx.fillRect(pl.x, pl.y + pl.h - 1, pl.w, 1); // bottom shadow
        }

        if (GOAL && GOAL.x !== undefined) {
            const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
            ctx.fillStyle = GOAL.color; ctx.globalAlpha = pulse;
            ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
            ctx.globalAlpha = 1;
        }

        // Entities — each isolated with save/restore so state can't bleed
        for (const ent of entities) { ctx.save(); ent.draw(ctx); ctx.restore(); }

        // Neural AI raycast overlay
        if (aiEnabled && typeof NeuralAI !== 'undefined') {
            const cx = player.x + player.w / 2;
            const cy = player.y + player.h / 2;
            ctx.lineWidth = 0.5;
            for (const [dx, dy] of NeuralAI.RAY_DIRS) {
                const len = Math.hypot(dx, dy);
                ctx.strokeStyle = 'rgba(50,255,120,0.22)';
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + (dx / len) * NeuralAI.RAY_LEN, cy + (dy / len) * NeuralAI.RAY_LEN);
                ctx.stroke();
            }
        }

        player.draw(ctx);

        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.font = 'bold 80px monospace';
        for (let r = 0; r < NUM_ROOMS; r++) ctx.fillText(String(r + 1), r * ROOM_W + 148, 120);

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
        if (aiEnabled && typeof NeuralAI !== 'undefined') {
            const ai = NeuralAI;
            ctx.fillStyle = '#44ff44'; ctx.font = 'bold 7px monospace';
            ctx.fillText(`NEURAL AI  ${aiSpeedMult}x`, W - 80, 10);
            ctx.font = '6px monospace';
            ctx.fillText(`Gen ${ai.generation}  Run ${ai.runCount}`, W - 80, 18);
            ctx.fillText(`Best ${(ai.globalBestFit * 100).toFixed(0)}%`, W - 80, 25);
            const stag = ai._runsSinceImproved || 0;
            ctx.fillStyle = stag >= 15 ? '#ff8844' : '#aaffaa';
            ctx.fillText(`Stag ${stag}/20`, W - 80, 32);
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
        const dynPlat = entities.filter(e => e.isSolid)
            .map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h, color: e.color || '#888' }));
        player.update(input, dynPlat.length ? platforms.concat(dynPlat) : platforms, FIXED_DT);
        for (const ent of entities) {
            if (ent.update(player, FIXED_DT) === 'kill') { player.y = DEATH_Y + 1; break; }
        }

        if (player.y <= DEATH_Y) {
            respawnRoom  = getRoomIdx();
            furthestRoom = Math.max(furthestRoom, respawnRoom);
        }
        const _targetX = player.x + player.w / 2 - W / 2;
        const _maxX    = NUM_ROOMS * ROOM_W - W;
        cameraX += (Math.max(0, Math.min(_maxX, _targetX)) - cameraX) * 0.12;
        const _targetY  = player.y + player.h / 2 - H / 2;
        const _camMinY  = worldMinY;
        const _camMaxY  = Math.max(_camMinY, worldMinY + worldH - H);
        cameraY += (Math.max(_camMinY, Math.min(_camMaxY, _targetY)) - cameraY) * 0.12;

        if (!won && playerOverlapsGoal()) {
            won = true; winMs = performance.now() - runStart;
            if (bestMs === null || winMs < bestMs) bestMs = winMs;
            if (aiEnabled && typeof NeuralAI !== 'undefined') {
                NeuralAI.onGoal();
                updateAIBtn();
            }
        }
        if (player.y > DEATH_Y || player.y < worldMinY - 20) { respawn(); return; }

        // AI stuck-death: no x movement for AI_STUCK_LIMIT frames → die and retry
        if (aiEnabled) {
            if (Math.abs(player.x - aiStuckLastX) > 1) {
                aiStuckFrames = 0;
                aiStuckLastX  = player.x;
            } else {
                aiStuckFrames++;
                if (aiStuckFrames >= AI_STUCK_LIMIT) {
                    player.y = DEATH_Y + 1; // push below death line → triggers respawn next tick
                    return;
                }
            }
        }

        for (const k of Object.keys(pressed)) delete pressed[k];
        stepCount++;
    }

    function frame(now) {
        if (!gameActive) { last = now; requestAnimationFrame(frame); return; }
        accum += (now - last) / 1000; last = now;
        if (accum > MAX_ACCUM) accum = MAX_ACCUM;
        let didStep = false;
        while (accum >= FIXED_DT) { step(); accum -= FIXED_DT; didStep = true; }
        // Extra simulation ticks for AI speed multiplier (render skipped for extras)
        if (aiEnabled && aiSpeedMult > 1) {
            for (let i = 1; i < aiSpeedMult; i++) { step(); didStep = true; }
        }
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
            (aiEnabled ? `  [AI ${aiSpeedMult}x]` : '');
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
