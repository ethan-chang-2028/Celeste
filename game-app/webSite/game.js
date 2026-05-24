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
    }

    // roomBanners generated dynamically in render() based on current NUM_ROOMS

    const initSeed = Math.floor(Math.random() * 999999);
    applyLevel(buildLevel(initSeed), initSeed);

    // ── Run state ────────────────────────────────────────────────────────────
    let gameActive   = false;   // true only after the user picks a level
    let currentMode  = 'ai';    // 'gauntlet' | 'ai'
    let cameraX      = 0;
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

    // ── Gauntlet level (hand-crafted, 6 rooms × 320 px) ─────────────────────
    function buildGauntletLevel() {
        const p = [], pits = [], sp = [], nm = [], sk = [], lb = [];

        // Room 1 — Entry Hall (x 0–319)
        p.push({x:0,   y:0,   w:8,   h:180, color:'#4a5570'}); // left wall
        p.push({x:0,   y:168, w:64,  h:12,  color:'#3a5a3a'}); // floor-L
        p.push({x:128, y:168, w:192, h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:64,  y:168, w:64,  h:12});
        p.push({x:64,  y:136, w:48,  h:8,   color:'#5a7a5a'}); // bounce ledge
        p.push({x:200, y:110, w:80,  h:8,   color:'#5a7a5a'}); // mid shelf
        p.push({x:270, y:80,  w:50,  h:8,   color:'#5a7a5a'}); // exit ledge
        sp.push({x:14, y:155});
        nm.push('ROOM 1 — ENTRY HALL');
        sk.push(['#1a2a4a','#3a5a8a']);
        lb.push({text:'JUMP',   x:68,  y:178});
        lb.push({text:'SPRING', x:66,  y:133});
        lb.push({text:'CLIMB',  x:204, y:107});

        // Room 2 — Key Room (x 320–639)
        p.push({x:320, y:168, w:70,  h:12,  color:'#3a5a3a'}); // floor-L
        p.push({x:580, y:168, w:60,  h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:390, y:168, w:190, h:12});
        p.push({x:370, y:128, w:60,  h:8,   color:'#5a7a5a'}); // step 1
        p.push({x:450, y:100, w:60,  h:8,   color:'#5a7a5a'}); // step 2
        p.push({x:530, y:70,  w:60,  h:8,   color:'#5a7a5a'}); // step 3
        sp.push({x:334, y:155});
        nm.push('ROOM 2 — KEY ROOM');
        sk.push(['#1a1040','#3a2870']);
        lb.push({text:'STEP UP', x:374, y:125});
        lb.push({text:'STEP UP', x:454, y:97});

        // Room 3 — Lock Room (x 640–959)
        p.push({x:640, y:168, w:60,  h:12,  color:'#3a5a3a'}); // floor-L
        p.push({x:900, y:168, w:60,  h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:700, y:168, w:200, h:12});
        p.push({x:730, y:60,  w:8,   h:108, color:'#7a6b8a'}); // wall A
        p.push({x:800, y:60,  w:8,   h:108, color:'#7a6b8a'}); // wall B
        p.push({x:730, y:60,  w:80,  h:8,   color:'#5a7a5a'}); // roof
        p.push({x:810, y:110, w:60,  h:8,   color:'#5a7a5a'}); // exit step
        p.push({x:870, y:80,  w:90,  h:8,   color:'#5a7a5a'}); // exit ledge
        sp.push({x:654, y:155});
        nm.push('ROOM 3 — LOCK ROOM');
        sk.push(['#0a2010','#1a4a28']);
        lb.push({text:'WALL JUMP', x:736, y:175});
        lb.push({text:'DASH ->', x:742,  y:57});

        // Room 4 — Crush Zone (x 960–1279)
        p.push({x:960,  y:0,   w:200, h:8,   color:'#4a3030'}); // danger ceiling
        p.push({x:960,  y:168, w:50,  h:12,  color:'#3a5a3a'}); // floor-L
        p.push({x:1230, y:168, w:50,  h:12,  color:'#3a5a3a'}); // floor-R
        pits.push({x:1010, y:168, w:220, h:12});
        p.push({x:1010, y:140, w:52,  h:8,   color:'#8a3030'}); // Kevin step
        p.push({x:1082, y:110, w:50,  h:8,   color:'#5a7a5a'});
        p.push({x:1152, y:80,  w:50,  h:8,   color:'#5a7a5a'});
        p.push({x:1190, y:50,  w:90,  h:8,   color:'#5a7a5a'}); // exit ledge
        sp.push({x:974, y:155});
        nm.push('ROOM 4 — CRUSH ZONE');
        sk.push(['#3a0a00','#6a2010']);
        lb.push({text:'DANGER', x:963, y:18});
        lb.push({text:'CRUSH',  x:1014, y:137});
        lb.push({text:'DASH UP',x:1086, y:107});

        // Room 5 — Fly Zone (x 1280–1599)
        p.push({x:1280, y:168, w:44,  h:12,  color:'#3a5a3a'});
        p.push({x:1556, y:168, w:44,  h:12,  color:'#3a5a3a'});
        pits.push({x:1324, y:168, w:232, h:12});
        p.push({x:1324, y:120, w:52,  h:8,   color:'#5a7a8a'});
        p.push({x:1404, y:82,  w:52,  h:8,   color:'#5a7a8a'});
        p.push({x:1484, y:50,  w:72,  h:8,   color:'#5a7a8a'});
        sp.push({x:1294, y:155});
        nm.push('ROOM 5 — FLY ZONE');
        sk.push(['#001a3a','#003870']);
        lb.push({text:'DASH!', x:1328, y:117});
        lb.push({text:'DASH!', x:1408, y:79});
        lb.push({text:'DASH!', x:1488, y:47});

        // Room 6 — Summit (x 1600–1919)
        p.push({x:1912, y:0,   w:8,   h:180, color:'#4a5570'}); // right wall
        p.push({x:1600, y:168, w:50,  h:12,  color:'#3a5a3a'});
        p.push({x:1660, y:148, w:40,  h:8,   color:'#5a7a5a'});
        p.push({x:1720, y:118, w:40,  h:8,   color:'#5a7a5a'});
        p.push({x:1780, y:88,  w:40,  h:8,   color:'#5a7a5a'});
        p.push({x:1840, y:58,  w:50,  h:8,   color:'#7a9a7a'});
        p.push({x:1876, y:28,  w:36,  h:8,   color:'#9aba9a'}); // pedestal
        sp.push({x:1614, y:155});
        nm.push('ROOM 6 — SUMMIT');
        sk.push(['#0a0a18','#202840']);
        lb.push({text:'SUMMIT', x:1844, y:55});

        // ── Entities ────────────────────────────────────────────────────────
        const ents = [];
        if (typeof Entities !== 'undefined') {
            const E = Entities;

            // Room 1 — Entry Hall: spring on bounce ledge, spikes at pit edges, dash crystal
            ents.push(E.makeSpring(88, 136, 'floor'));
            ents.push(E.makeSpike(64, 168, 8, 'up'));
            ents.push(E.makeSpike(128, 168, 8, 'up'));
            ents.push(E.makeDashCrystal(240, 104));

            // Room 2 — Key Room: blade patrolling the steps, dash crystal mid-route
            ents.push(E.makeEnticeBlade({ ax: 395, ay: 121, bx: 556, by: 63, speed: 70 }));
            ents.push(E.makeDashCrystal(480, 94));

            // Room 3 — Lock Room: crumble platform inside arch, bumper near exit
            ents.push(E.makeCrumbleBlock(738, 100, 62));
            ents.push(E.makeBumper(915, 68));

            // Room 4 — Crush Zone: ceiling spikes, bumper in open space, dash crystal
            ents.push(E.makeSpike(968, 8, 32, 'down'));
            ents.push(E.makeBumper(1100, 90));
            ents.push(E.makeDashCrystal(1155, 72));

            // Room 5 — Fly Zone: two bumpers, circular blade, dash crystal
            ents.push(E.makeBumper(1375, 95));
            ents.push(E.makeBumper(1448, 65));
            ents.push(E.makeEnticeBlade({ path: 'circular', cx: 1448, cy: 65, radius: 28, startAngle: 0, speed: 2 }));
            ents.push(E.makeDashCrystal(1350, 113));

            // Room 6 — Summit: strawberry on the climb
            ents.push(E.makeStrawberry(1800, 82));
        }

        const goal = { x:1882, y:12, w:12, h:12, color:'#d4af37' };
        return { platforms: p, pitShading: pits, roomSpawns: sp,
                 roomNames: nm, roomSkies: sk, roomLabels: lb, goal, entities: ents };
    }

    // ── Level-select API (called from game.html buttons) ─────────────────────
    window.startGame = function (mode) {
        currentMode = mode;
        aiEnabled   = false;
        updateAIBtn();

        if (mode === 'gauntlet') {
            NUM_ROOMS = 6;
            applyLevel(buildGauntletLevel(), -1);
            // Hide AI-only controls
            document.querySelectorAll('.ai-only').forEach(el => el.style.display = 'none');
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

        // Entities
        for (const ent of entities) ent.draw(ctx);

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
        cameraX = getRoomIdx() * ROOM_W;

        if (!won && playerOverlapsGoal()) {
            won = true; winMs = performance.now() - runStart;
            if (bestMs === null || winMs < bestMs) bestMs = winMs;
            if (aiEnabled && typeof NeuralAI !== 'undefined') {
                NeuralAI.onGoal();
                updateAIBtn();
            }
        }
        if (player.y > DEATH_Y) { respawn(); return; }

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
