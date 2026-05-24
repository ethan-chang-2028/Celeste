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

    // ── Entity helpers ───────────────────────────────────────────────────────
    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
               a.y < b.y + b.h && a.y + a.h > b.y;
    }
    function playerOnTop(player, ent) {
        const bottom = player.y + player.h;
        return player.Speed.Y >= -0.1
            && bottom >= ent.y - 2 && bottom <= ent.y + 4
            && player.x < ent.x + ent.w && player.x + player.w > ent.x;
    }
    function isDashing(player) { return player.dashAttackTimer > 0; }

    function makeSpring(x, y, orientation) {
        orientation = orientation || 'floor';
        const isFloor = orientation === 'floor';
        const w = isFloor ? 16 : 6, h = isFloor ? 6 : 16;
        const ent = {
            type: 'spring', orientation,
            x: isFloor ? x - 8 : (orientation === 'wallRight' ? x - 6 : x),
            y: isFloor ? y - 6 : y - 8,
            w, h, isSolid: false, _cooldown: 0,
            reset() { this._cooldown = 0; },
            update(player, dt) {
                this._cooldown = Math.max(0, this._cooldown - dt);
                if (this._cooldown > 0 || !rectsOverlap(player, this)) return;
                if (orientation === 'floor' && player.Speed.Y >= 0) {
                    player.Speed.Y = -240; player.Dashes = player.MaxDashes;
                    player.AutoJump = false; player.jumpGraceTimer = 0; this._cooldown = 0.4;
                } else if (orientation === 'wallLeft' && player.Speed.X <= 0) {
                    player.Speed.X = 220; player.Speed.Y = Math.min(player.Speed.Y, -80);
                    player.Dashes = player.MaxDashes; this._cooldown = 0.4;
                } else if (orientation === 'wallRight' && player.Speed.X >= 0) {
                    player.Speed.X = -220; player.Speed.Y = Math.min(player.Speed.Y, -80);
                    player.Dashes = player.MaxDashes; this._cooldown = 0.4;
                }
            },
            draw(ctx) {
                ctx.fillStyle = '#38c038'; ctx.fillRect(this.x, this.y, this.w, this.h);
                // Top plate / tip
                ctx.fillStyle = '#80f080';
                if (isFloor) {
                    ctx.fillRect(this.x + 1, this.y, this.w - 2, 2);
                    // Coil zigzag
                    ctx.strokeStyle = '#50d050'; ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(this.x + 2, this.y + 5);
                    ctx.lineTo(this.x + 6, this.y + 2);
                    ctx.lineTo(this.x + 10, this.y + 5);
                    ctx.lineTo(this.x + 14, this.y + 2);
                    ctx.stroke();
                } else {
                    const tipX = orientation === 'wallLeft' ? this.x + this.w - 2 : this.x;
                    ctx.fillRect(tipX, this.y + 1, 2, this.h - 2);
                }
            }
        };
        return ent;
    }

    function makeBumper(cx, cy) {
        const r = 12;
        return {
            type: 'bumper', cx, cy, r, x: cx - r, y: cy - r, w: r * 2, h: r * 2,
            isSolid: false, _cooldown: 0,
            reset() { this._cooldown = 0; },
            update(player, dt) {
                this._cooldown = Math.max(0, this._cooldown - dt);
                if (this._cooldown > 0) return;
                const px = player.x + player.w * 0.5, py = player.y + player.h * 0.5;
                const dx = px - this.cx, dy = py - this.cy;
                if (Math.hypot(dx, dy) > this.r + 8) return;
                const len = Math.hypot(dx, dy) || 1;
                player.Speed.X = (dx / len) * 260; player.Speed.Y = (dy / len) * 260;
                player.Dashes = player.MaxDashes; this._cooldown = 0.5;
            },
            draw(ctx) {
                const pulse = Math.sin(performance.now() / 400) * 2;
                ctx.strokeStyle = 'rgba(255,220,40,0.35)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r + 4 + pulse, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#d8c820'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * 0.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,240,80,0.15)'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r + 4 + pulse, 0, Math.PI * 2); ctx.fill();
            }
        };
    }

    function makeDashCrystal(x, y) {
        return {
            type: 'dashCrystal', x: x - 5, y: y - 5, w: 10, h: 10,
            isSolid: false, _active: true, _respawn: 0,
            reset() { this._active = true; this._respawn = 0; },
            update(player, dt) {
                if (!this._active) { this._respawn -= dt; if (this._respawn <= 0) this._active = true; return; }
                if (!rectsOverlap(player, this) || player.Dashes >= player.MaxDashes) return;
                player.Dashes = player.MaxDashes; this._active = false; this._respawn = 2.5;
            },
            draw(ctx) {
                if (!this._active) return;
                const cx = this.x + 5, cy = this.y + 5, r = 5;
                const pulse = Math.sin(performance.now() / 500) * 1.5;
                // Glow halo
                ctx.fillStyle = 'rgba(40,204,216,0.18)';
                ctx.beginPath(); ctx.arc(cx, cy, r + 4 + pulse, 0, Math.PI * 2); ctx.fill();
                // Diamond
                ctx.fillStyle = '#28ccd8';
                ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
                // Bright inner ring
                ctx.strokeStyle = 'rgba(160,255,255,0.7)'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(cx, cy - r + 1); ctx.lineTo(cx + r - 1, cy); ctx.lineTo(cx, cy + r - 1); ctx.lineTo(cx - r + 1, cy); ctx.closePath(); ctx.stroke();
                // Center dot
                ctx.fillStyle = 'rgba(255,255,255,0.80)'; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
            }
        };
    }

    function makeSpike(x, y, size, dir) {
        dir = dir || 'up';
        const isVert = dir === 'up' || dir === 'down';
        const w = isVert ? size : 4, h = isVert ? 4 : size;
        return {
            type: 'spike', dir,
            x: x + (dir === 'left' ? -4 : 0), y: y + (dir === 'up' ? -4 : 0),
            w, h, isSolid: false,
            reset() {},
            update(player, dt) {
                if (!rectsOverlap(player, this)) return;
                if (isDashing(player)) {
                    const d = player.DashDir;
                    if (dir === 'up'    && d.Y < -0.5) return;
                    if (dir === 'down'  && d.Y >  0.5) return;
                    if (dir === 'left'  && d.X < -0.5) return;
                    if (dir === 'right' && d.X >  0.5) return;
                }
                return 'kill';
            },
            draw(ctx) {
                // Danger glow
                ctx.fillStyle = 'rgba(200,30,30,0.20)';
                ctx.fillRect(this.x - 2, this.y - 2, this.w + 4, this.h + 4);
                ctx.fillStyle = '#c02828'; ctx.fillRect(this.x, this.y, this.w, this.h);
                const n = Math.max(1, Math.round((isVert ? w : h) / 8));
                ctx.fillStyle = '#e04040';
                for (let i = 0; i < n; i++) {
                    if (dir === 'up') {
                        const tx = this.x + i * 8 + 4;
                        ctx.beginPath(); ctx.moveTo(tx - 3, this.y + 4); ctx.lineTo(tx, this.y - 2); ctx.lineTo(tx + 3, this.y + 4); ctx.closePath(); ctx.fill();
                    } else if (dir === 'down') {
                        const tx = this.x + i * 8 + 4;
                        ctx.beginPath(); ctx.moveTo(tx - 3, this.y); ctx.lineTo(tx, this.y + 6); ctx.lineTo(tx + 3, this.y); ctx.closePath(); ctx.fill();
                    } else if (dir === 'left') {
                        const ty = this.y + i * 8 + 4;
                        ctx.beginPath(); ctx.moveTo(this.x + 4, ty - 3); ctx.lineTo(this.x - 2, ty); ctx.lineTo(this.x + 4, ty + 3); ctx.closePath(); ctx.fill();
                    } else {
                        const ty = this.y + i * 8 + 4;
                        ctx.beginPath(); ctx.moveTo(this.x, ty - 3); ctx.lineTo(this.x + 6, ty); ctx.lineTo(this.x, ty + 3); ctx.closePath(); ctx.fill();
                    }
                }
            }
        };
    }

    function makeEnticeBlade(config) {
        const ent = {
            type: 'blade', isSolid: false, x: 0, y: 0, w: 12, h: 12,
            _initConfig: JSON.parse(JSON.stringify(config)),
            reset() {
                const c = this._initConfig;
                if (c.path === 'circular') this._angle = c.startAngle || 0;
                else { this._t = 0; this._tdir = 1; }
            }
        };
        if (config.path === 'circular') {
            ent._angle = config.startAngle || 0; ent._cx = config.cx; ent._cy = config.cy;
            ent._radius = config.radius; ent._speed = config.speed || Math.PI;
            ent.update = function (player, dt) {
                this._angle += this._speed * dt;
                this.x = this._cx + Math.cos(this._angle) * this._radius - 6;
                this.y = this._cy + Math.sin(this._angle) * this._radius - 6;
                if (rectsOverlap(player, this)) return 'kill';
            };
        } else {
            ent._ax = config.ax; ent._ay = config.ay; ent._bx = config.bx; ent._by = config.by;
            ent._speed = config.speed || 80; ent._t = 0; ent._tdir = 1;
            ent.update = function (player, dt) {
                const dist = Math.hypot(this._bx - this._ax, this._by - this._ay) || 1;
                this._t += this._tdir * this._speed * dt / dist;
                if (this._t >= 1) { this._t = 1; this._tdir = -1; }
                if (this._t <= 0) { this._t = 0; this._tdir = 1; }
                this.x = this._ax + (this._bx - this._ax) * this._t - 6;
                this.y = this._ay + (this._by - this._ay) * this._t - 6;
                if (rectsOverlap(player, this)) return 'kill';
            };
        }
        ent.draw = function (ctx) {
            const cx = this.x + 6, cy = this.y + 6;
            // Glow
            ctx.fillStyle = 'rgba(200,0,200,0.20)';
            ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
            // Spinning cross marks
            const angle = performance.now() / 180;
            ctx.strokeStyle = 'rgba(240,80,240,0.6)'; ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                const a = angle + i * Math.PI / 2;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); ctx.stroke();
            }
            // Core
            ctx.fillStyle = '#d028d0'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f080f0'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        };
        return ent;
    }

    function makeStrawberry(x, y) {
        return {
            type: 'strawberry', x: x - 6, y: y - 6, w: 12, h: 12,
            isSolid: false, _collected: false, _touchTimer: 0,
            reset() { this._collected = false; this._touchTimer = 0; },
            update(player, dt) {
                if (this._collected) return;
                if (!rectsOverlap(player, this)) { this._touchTimer = 0; return; }
                this._touchTimer += dt;
                if (this._touchTimer >= 0.35) this._collected = true;
            },
            draw(ctx) {
                if (this._collected) return;
                const cx = this.x + 6, cy = this.y + 7;
                ctx.fillStyle = '#d84070'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#38a028'; ctx.fillRect(cx - 1, this.y - 1, 2, 5);
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
            }
        };
    }

    function makeCrumbleBlock(x, y, w) {
        return {
            type: 'crumbleBlock', x, y, w, h: 8, isSolid: true,
            _state: 'solid', _timer: 0,
            reset() { this._state = 'solid'; this.isSolid = true; this._timer = 0; },
            update(player, dt) {
                if (this._state === 'broken') {
                    this._timer -= dt;
                    if (this._timer <= 0) { this._state = 'solid'; this.isSolid = true; }
                    return;
                }
                if (this._state === 'shaking') {
                    this._timer -= dt;
                    if (this._timer <= 0) { this._state = 'broken'; this.isSolid = false; this._timer = 2.0; }
                    return;
                }
                if (playerOnTop(player, this)) { this._state = 'shaking'; this._timer = 0.6; }
            },
            draw(ctx) {
                if (this._state === 'broken') return;
                const shake = this._state === 'shaking' ? (Math.random() - 0.5) * 2 : 0;
                ctx.fillStyle = '#b89050'; ctx.fillRect(this.x + shake, this.y, this.w, this.h);
                ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(this.x + shake, this.y, this.w, 1);
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5;
                for (let i = 1; i < Math.round(this.w / 16); i++) {
                    const lx = this.x + i * 16 + shake;
                    ctx.beginPath(); ctx.moveTo(lx, this.y); ctx.lineTo(lx, this.y + 8); ctx.stroke();
                }
            }
        };
    }

    function makeFallingBlock(x, y, w, h) {
        const startY = y;
        return {
            type: 'fallingBlock', x, y, w, h, isSolid: true,
            _state: 'idle', _timer: 0, _vy: 0,
            reset() { this._state = 'idle'; this._timer = 0; this._vy = 0; this.y = startY; this.isSolid = true; },
            update(player, dt) {
                if (this._state === 'idle') {
                    if (playerOnTop(player, this)) { this._state = 'shaking'; this._timer = 0.4; }
                } else if (this._state === 'shaking') {
                    this._timer -= dt;
                    if (this._timer <= 0) { this._state = 'falling'; this._vy = 0; }
                } else if (this._state === 'falling') {
                    this._vy = Math.min(this._vy + 500 * dt, 200);
                    this.y += this._vy * dt;
                    if (rectsOverlap(player, this)) return 'kill';
                    if (this.y > 220) { this._state = 'landed'; this.isSolid = false; }
                }
            },
            draw(ctx) {
                if (this._state === 'landed') return;
                const shake = this._state === 'shaking' ? (Math.random() - 0.5) * 1.5 : 0;
                ctx.fillStyle = '#c05830'; ctx.fillRect(this.x + shake, this.y, this.w, this.h);
                ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(this.x + shake, this.y, this.w, 1);
            }
        };
    }

    function makeGoldenStrawberry(x, y) {
        return {
            type: 'goldenStrawberry', x: x - 7, y: y - 7, w: 14, h: 14,
            isSolid: false, _collected: false, _pulse: 0,
            reset() { this._collected = false; this._pulse = 0; },
            update(player, dt) {
                this._pulse = (this._pulse + dt * 4) % (Math.PI * 2);
                if (this._collected || !rectsOverlap(player, this)) return;
                this._collected = true;
            },
            draw(ctx) {
                if (this._collected) return;
                const alpha = 0.6 + 0.4 * Math.sin(this._pulse);
                const cx = this.x + 7, cy = this.y + 7;
                ctx.save(); ctx.globalAlpha = alpha;
                ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#f0d060'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(255,215,0,0.4)';
                ctx.beginPath(); ctx.arc(cx, cy, 11 + 2 * Math.sin(this._pulse), 0, Math.PI * 2); ctx.fill();
            }
        };
    }

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

    // Initialise with a random AI map so roomSpawns / GOAL exist for player construction.
    // The game loop won't actually run until startGame() is called.
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

        // Room 1 — Entry Hall: spring teaches the bounce mechanic, spikes guard pit edges,
        //   dash crystal above mid-shelf teaches dashing, strawberry on exit ledge is optional reward
        ents.push(makeSpring(88, 136, 'floor'));
        ents.push(makeSpike(64, 168, 8, 'up'));
        ents.push(makeSpike(120, 168, 8, 'up'));
        ents.push(makeDashCrystal(240, 100));
        ents.push(makeStrawberry(290, 73));

        // Room 2 — Key Room: a single diagonal blade guards ALL three steps like a sentinel,
        //   edge spikes punish sloppy landings, dash crystal at the top is the "key" prize
        ents.push(makeEnticeBlade({ ax: 378, ay: 128, bx: 574, by: 63, speed: 65 }));
        ents.push(makeSpike(424, 128, 6, 'up'));
        ents.push(makeSpike(504, 100, 6, 'up'));
        ents.push(makeDashCrystal(556, 63));

        // Room 3 — Lock Room: spike guards the arch entrance, crumble block inside arch forces
        //   urgency (wall-jump out before it crumbles), blade in the pit below punishes falls,
        //   bumper on the exit ledge launches to safety
        ents.push(makeSpike(692, 168, 8, 'up'));
        ents.push(makeCrumbleBlock(738, 100, 54));
        ents.push(makeEnticeBlade({ ax: 742, ay: 150, bx: 798, by: 150, speed: 55 }));
        ents.push(makeBumper(900, 90));

        // Room 4 — Crush Zone: ceiling spike clusters create a low ceiling of death,
        //   vertical blades oscillate up and down like pistons — must time dashes between them,
        //   dash crystal at the exit rewards surviving the gauntlet
        ents.push(makeSpike(978,  8, 24, 'down'));
        ents.push(makeSpike(1040, 8, 24, 'down'));
        ents.push(makeSpike(1112, 8, 24, 'down'));
        ents.push(makeEnticeBlade({ ax: 1036, ay: 12, bx: 1036, by: 132, speed: 65 }));
        ents.push(makeEnticeBlade({ ax: 1110, ay: 12, bx: 1110, by: 100, speed: 80 }));
        ents.push(makeDashCrystal(1225, 43));

        // Room 5 — Fly Zone: huge void requires chained dashes — mid-air crystals refill dash
        //   between platforms, bumpers serve as launch pads, sweeping diagonal blade punishes hovering
        ents.push(makeDashCrystal(1390, 95));
        ents.push(makeDashCrystal(1462, 62));
        ents.push(makeBumper(1344, 112));
        ents.push(makeBumper(1422, 74));
        ents.push(makeEnticeBlade({ ax: 1310, ay: 148, bx: 1550, by: 62, speed: 45 }));
        ents.push(makeStrawberry(1518, 42));

        // Room 6 — Summit: diagonal blade guards the entire staircase, circular blade orbits
        //   the pedestal, crumble bridges between steps force quick movement, edge spikes punish
        //   hesitation, mid-climb strawberry + golden strawberry at the peak are the ultimate rewards
        ents.push(makeEnticeBlade({ ax: 1668, ay: 140, bx: 1886, by: 22, speed: 50 }));
        ents.push(makeEnticeBlade({ path: 'circular', cx: 1858, cy: 38, radius: 22, startAngle: 0, speed: 2.2 }));
        ents.push(makeCrumbleBlock(1692, 132, 24));
        ents.push(makeCrumbleBlock(1752, 102, 24));
        ents.push(makeCrumbleBlock(1812, 72, 24));
        ents.push(makeSpike(1695, 148, 6, 'up'));
        ents.push(makeSpike(1754, 118, 6, 'up'));
        ents.push(makeSpike(1814, 88,  6, 'up'));
        ents.push(makeStrawberry(1796, 80));
        ents.push(makeGoldenStrawberry(1894, 21));

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

        // Starfield (parallax at 25% camera speed)
        ctx.save();
        ctx.translate(cameraX * 0.75, 0); // undo 75% of translate so stars scroll slowly
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
