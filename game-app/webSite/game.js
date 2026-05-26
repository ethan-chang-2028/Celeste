// Celeste — Procedural AI Map Generator + AI Player Controller.
// "Generate AI Map" → new seeded level. "AI Control" → AI plays the game.

(function () {
    const canvas   = document.getElementById('game-canvas');
    const ctx      = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    // Render at 3× native resolution so text is sharp (960×540 canvas, 320×180 game coords)
    const SCALE = 3;
    canvas.width  = 960;
    canvas.height = 540;

    const W = 320, H = 180;
    const FIXED_DT  = 1 / 60;
    const MAX_ACCUM = 0.25;
    let   DEATH_Y   = H + 20;
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
                ctx.fillStyle = '#60e060';
                if (isFloor) ctx.fillRect(this.x + 2, this.y, this.w - 4, 2);
                else { const tipX = orientation === 'wallLeft' ? this.x + this.w - 2 : this.x; ctx.fillRect(tipX, this.y + 2, 2, this.h - 4); }
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
                ctx.fillStyle = '#d8c820'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * 0.5, 0, Math.PI * 2); ctx.fill();
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
                ctx.fillStyle = '#28ccd8';
                ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
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
            ctx.fillStyle = '#d028d0'; ctx.beginPath(); ctx.arc(this.x + 6, this.y + 6, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f060f0'; ctx.beginPath(); ctx.arc(this.x + 6, this.y + 6, 2, 0, Math.PI * 2); ctx.fill();
        };
        return ent;
    }

    function makeStrawberry(x, y) {
        const _ox = x - 6, _oy = y - 6;
        return {
            type: 'strawberry', x: _ox, y: _oy, w: 12, h: 12,
            isSolid: false, _collected: false, _grabbed: false,
            reset() { this._collected = false; this._grabbed = false; this.x = _ox; this.y = _oy; },
            update(player, dt) {
                if (this._collected) return;
                if (!this._grabbed) {
                    if (rectsOverlap(player, this)) this._grabbed = true;
                    return;
                }
                // Float above player's head while carried
                this.x += (player.x + player.w / 2 - 6 - this.x) * 0.25;
                this.y += (player.y - 16 - this.y) * 0.25;
                // Lock in when player safely lands
                if (player.onGround) this._collected = true;
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

    function makeFireball(x, y, vx, vy) {
        const r = 6;
        const col  = Math.floor(x / ROOM_W);
        const wallL = col * ROOM_W + 8;
        const wallR = (col + 1) * ROOM_W - 8;
        let _vx = vx, _vy = vy, _pulse = 0;
        const sx = x, sy = y;
        return {
            type: 'fireball', x: x - r, y: y - r, w: r * 2, h: r * 2, isSolid: false,
            _vx, _vy, _pulse,
            reset() { this.x = sx - r; this.y = sy - r; this._vx = vx; this._vy = vy; this._pulse = 0; },
            update(player, dt) {
                this._pulse = (this._pulse + dt * 8) % (Math.PI * 2);
                // In mountain ice state: fireballs freeze in place
                if (mountainMode && coreState === 'ice') {
                    if (rectsOverlap(player, this)) return 'kill';
                    return;
                }
                this.x += this._vx * dt;
                this.y += this._vy * dt;
                if (this._vx !== 0) {
                    if (this.x < wallL)              { this.x = wallL;          this._vx =  Math.abs(this._vx); }
                    if (this.x + this.w > wallR)     { this.x = wallR - this.w; this._vx = -Math.abs(this._vx); }
                }
                if (rectsOverlap(player, this)) return 'kill';
            },
            draw(ctx) {
                const cx = this.x + r, cy = this.y + r;
                if (mountainMode && coreState === 'ice') {
                    // Frozen fireball: blue-white crystal
                    ctx.fillStyle = 'rgba(100,200,255,0.20)';
                    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#55aaff';
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#cceeff';
                    ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
                    return;
                }
                const glow = r + 4 + 2 * Math.sin(this._pulse);
                ctx.fillStyle = 'rgba(255,100,0,0.22)';
                ctx.beginPath(); ctx.arc(cx, cy, glow, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ff5500';
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,230,120,0.9)';
                ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
            }
        };
    }

    function makeCoreSwitch(x, y) {
        return {
            type: 'coreSwitch', x: x - 8, y: y - 8, w: 16, h: 16, isSolid: false,
            _cooldown: 0, _flash: 0,
            reset() { this._cooldown = 0; this._flash = 0; },
            update(player, dt) {
                this._cooldown = Math.max(0, this._cooldown - dt);
                this._flash    = Math.max(0, this._flash    - dt);
                if (this._cooldown > 0 || !rectsOverlap(player, this)) return;
                coreState = coreState === 'fire' ? 'ice' : 'fire';
                this._cooldown = 0.9;
                this._flash    = 0.5;
            },
            draw(ctx) {
                const cx = this.x + 8, cy = this.y + 8;
                const fire = coreState === 'fire';
                const flashAlpha = this._flash > 0 ? 0.7 : 0.30;
                // Outer glow
                ctx.fillStyle = fire ? `rgba(255,100,0,${flashAlpha})` : `rgba(80,180,255,${flashAlpha})`;
                ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
                // Body
                ctx.fillStyle = fire ? '#882200' : '#003388';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(this.x + 1, this.y + 1, this.w - 2, 2);
                // Symbol
                ctx.fillStyle = fire ? '#ffcc44' : '#88ddff';
                if (fire) {
                    // Flame triangle
                    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.closePath(); ctx.fill();
                } else {
                    // Snowflake cross
                    ctx.fillRect(cx - 1, cy - 5, 2, 10);
                    ctx.fillRect(cx - 5, cy - 1, 10, 2);
                }
            }
        };
    }

    function makeKevinBlock(x, y, w, h) {
        h = h || 16;
        w = w || 22;
        const startX = x;
        return {
            type: 'kevinBlock', x, y, w, h, isSolid: true,
            _state: 'idle', _vx: 0,
            reset() { this.x = startX; this._state = 'idle'; this._vx = 0; this.isSolid = true; },
            update(player, dt) {
                if (this._state === 'idle') {
                    // Trigger on horizontal dash contact
                    const probe = { x: this.x - 3, y: this.y + 2, w: this.w + 6, h: this.h - 4 };
                    if (isDashing(player) && player.DashDir.X !== 0 && rectsOverlap(player, probe)) {
                        this._vx = Math.sign(player.DashDir.X) * 220;
                        this._state = 'moving';
                        this.isSolid = false;
                    }
                } else {
                    this.x += this._vx * dt;
                    const col  = Math.floor((this.x + this.w / 2) / ROOM_W);
                    const wallL = col * ROOM_W + 8;
                    const wallR = (col + 1) * ROOM_W - 8;
                    if (this.x < wallL) {
                        this.x = wallL; this._vx = 0; this._state = 'idle'; this.isSolid = true;
                    } else if (this.x + this.w > wallR) {
                        this.x = wallR - this.w; this._vx = 0; this._state = 'idle'; this.isSolid = true;
                    }
                    if (rectsOverlap(player, this)) return 'kill';
                }
            },
            draw(ctx) {
                const fire = !mountainMode || coreState === 'fire';
                const moving = this._state === 'moving';
                ctx.fillStyle = moving ? (fire ? '#ff6622' : '#44aaff') : (fire ? '#882200' : '#1144aa');
                ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(this.x + 1, this.y + 1, this.w - 2, 2);
                // Face
                const cx = this.x + this.w / 2, cy = this.y + this.h / 2 - 1;
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.fillRect(cx - 5, cy - 2, 3, 3);  // left eye
                ctx.fillRect(cx + 2, cy - 2, 3, 3);  // right eye
                ctx.fillStyle = moving ? 'rgba(255,0,0,0.7)' : 'rgba(255,255,255,0.5)';
                ctx.fillRect(cx - 3, cy + 2, 6, moving ? 2 : 1); // mouth
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
    let mazeRoomCol  = 0;
    let mazeRoomRow  = 1;
    let mazeRoomNameMap = {};
    let transitionFlash = 0;
    let mountainMode    = false;   // true only during the Heart of the Mountain level
    let coreState       = 'fire';  // 'fire' | 'ice' — toggled by core switch in mountain mode
    const RoomTrans = {
        active: false,
        timer: 0,
        fromX: 0, fromY: 0, toX: 0, toY: 0,
        pendingCol: 0, pendingRow: 0,
        DURATION: 0.40,
    };
    const player = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
    let runStart = performance.now();
    let deaths   = 0;
    let bestMs   = null;
    let won      = false;
    let winMs    = 0;

    // AI stuck-death: two checks —
    //   position: no movement > 2px in 1.5 s → instant kill
    //   progress: no improvement toward goal in 4 s → kill (catches slow wall-slides)
    const AI_STUCK_LIMIT    = 90;   // frames (~1.5 s)
    const AI_PROGRESS_LIMIT = 240;  // frames (~4 s)
    let aiStuckFrames    = 0;
    let aiStuckLastX     = 0;
    let aiStuckLastY     = 0;
    let aiProgressFrames = 0;
    let aiProgressBest   = -Infinity;

    // ── Race mode state ───────────────────────────────────────────────────────
    let raceMode        = false;
    let raceAIPlayer    = null;    // separate CelestePlayer for the AI opponent
    let racePlayerCP    = 0;       // highest checkpoint index player 1 has reached
    let raceAICP        = 0;       // highest checkpoint index AI has reached
    let racePlayerDone  = false;
    let raceAIDone      = false;
    let racePlayerTime  = null;    // ms
    let raceAITime      = null;    // ms
    let raceStart       = 0;
    let raceSeed        = 0;
    // Race AI stuck detection (independent from training AI vars)
    let raceAIStuckFrames = 0;
    let raceAIStuckX      = 0;
    let raceAIStuckY      = 0;
    let raceAIProgFrames  = 0;
    let raceAIProgBest    = -Infinity;

    // ── Online race opponent rendering ────────────────────────────────────────
    // OnlineRace (online-race.js) manages the WebSocket; game.js just reads
    // OnlineRace.opponent each frame for rendering and HUD.
    let onlineMode    = false;  // true while an online race is active
    let onlineName    = '';     // opponent's display name
    // Smooth opponent position (lerped from network snapshots)
    let opLerpX = 0, opLerpY = 0;

    // ── Player 2 (2-player race) ─────────────────────────────────────────────
    // Controls: A/D = move, W = jump, E = dash, S = grab
    let player2       = null;
    let p2Active      = false;   // true when a second human is racing
    let p2CP          = 0;
    let p2Done        = false;
    let p2Time        = null;
    let p2StuckFrames = 0;
    let p2StuckX      = 0;
    let p2StuckY      = 0;

    function getRoomIdx() {
        return Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player.x / ROOM_W)));
    }
    function closestRespawnIdx(px, py) {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < roomSpawns.length; i++) {
            const d = Math.hypot(px - roomSpawns[i].x, py - roomSpawns[i].y);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    function respawn() {
        aiStuckFrames    = 0;
        aiProgressFrames = 0;
        aiStuckLastX  = player.x;
        aiStuckLastY  = player.y;
        if (aiEnabled && typeof NeuralAI !== 'undefined') {
            const si = closestRespawnIdx(player.x, player.y);
            NeuralAI.onDeath();
            respawnRoom = si;
            NeuralAI.reset(roomSpawns[si].x);
            updateAIBtn();
        }
        player.reset(roomSpawns[respawnRoom].x, roomSpawns[respawnRoom].y);
        // Reset ghost agents to their closest spawn point
        for (const gh of aiGhosts) {
            const si = closestRespawnIdx(gh.p.x, gh.p.y);
            const gsx = roomSpawns[si] ? roomSpawns[si].x : roomSpawns[0].x;
            const gsy = roomSpawns[si] ? roomSpawns[si].y : roomSpawns[0].y;
            gh.p.reset(gsx, gsy);
            gh.stuckFrames = 0; gh.stuckX = gsx; gh.stuckY = gsy; gh.lastRow = -1;
            gh.progressFrames = 0; gh.progressBest = -Infinity;
        }
        if (typeof NeuralAI !== 'undefined') NeuralAI.resetAgents();
        // player.reset() clears keysHeld; also reset key/door entity states
        if (currentMode === 'maze') {
            for (const e of entities) {
                if (e.type === 'key' || e.type === 'keyDoor') e.reset();
                if (mountainMode && (e.type === 'crumbleBlock' || e.type === 'fallingBlock')) e.reset();
            }
            const sp = roomSpawns[respawnRoom];
            mazeRoomCol = Math.max(0, Math.floor(sp.x / ROOM_W));
            mazeRoomRow = Math.max(0, Math.floor((sp.y - worldMinY) / H));
            cameraX = mazeRoomCol * ROOM_W;
            cameraY = worldMinY + mazeRoomRow * H;
            RoomTrans.active = false; RoomTrans.timer = 0;
        }
        if (!won) deaths++;
    }
    function restartRun() {
        aiStuckFrames    = 0;
        aiProgressFrames = 0;
        aiProgressBest   = -Infinity;
        aiStuckLastX  = roomSpawns[0] ? roomSpawns[0].x : 0;
        aiStuckLastY  = roomSpawns[0] ? roomSpawns[0].y : 0;
        respawnRoom = furthestRoom = 0;
        player.reset(roomSpawns[0].x, roomSpawns[0].y);
        runStart = performance.now();
        deaths = 0; won = false;
        if (mountainMode) coreState = 'fire';
        for (const e of entities) e.reset();
        if (currentMode === 'maze' && roomSpawns[0]) {
            RoomTrans.active = false; RoomTrans.timer = 0;
            mazeRoomCol = Math.max(0, Math.floor(roomSpawns[0].x / ROOM_W));
            mazeRoomRow = Math.max(0, Math.floor((roomSpawns[0].y - worldMinY) / H));
            cameraX = mazeRoomCol * ROOM_W;
            cameraY = worldMinY + mazeRoomRow * H;
        }
        const sx0 = roomSpawns[0] ? roomSpawns[0].x : 0;
        const sy0 = roomSpawns[0] ? roomSpawns[0].y : 0;
        for (const gh of aiGhosts) {
            gh.p.reset(sx0, sy0);
            gh.stuckFrames = 0; gh.stuckX = sx0; gh.stuckY = sy0; gh.lastRow = -1;
            gh.progressFrames = 0; gh.progressBest = -Infinity;
        }
        if (aiEnabled && typeof NeuralAI !== 'undefined') NeuralAI.resetAgents();
    }

    // ── AI Player Controller (neural — delegates to NeuralAI in ai-neural.js) ─
    let aiEnabled   = false;
    let aiSpeedMult = 1;
    let aiGhosts = [];  // ghost CelestePlayer instances for parallel training

    // ── Demo recording (imitation learning) ──────────────────────────────────
    let recordingActive = false;
    let recordingFrames = [];
    let recordingSeed   = 0;

    function initNeuralAI() {
        if (typeof NeuralAI === 'undefined') return;
        const spawnX = roomSpawns[0] ? roomSpawns[0].x : 0;
        if (mountainMode) {
            const spawnY = roomSpawns[0] ? roomSpawns[0].y : 0;
            const goalY  = GOAL ? GOAL.y + GOAL.h / 2 : 0;
            NeuralAI.init(spawnX, GOAL ? GOAL.x + GOAL.w : 320,
                { isVertical: true, spawnY, goalY });
        } else {
            NeuralAI.init(spawnX, GOAL ? GOAL.x + GOAL.w : 1600);
        }
        spawnAIGhosts();
    }

    function spawnAIGhosts() {
        aiGhosts = [];
        if (!aiEnabled || typeof NeuralAI === 'undefined') return;
        const n = NeuralAI.N_AGENTS - 1;
        const sx = roomSpawns[0] ? roomSpawns[0].x : 0;
        const sy = roomSpawns[0] ? roomSpawns[0].y : 0;
        for (let i = 0; i < n; i++) {
            const p = new CelestePlayer(sx, sy);
            p.noDashRefill = player.noDashRefill;
            aiGhosts.push({ p, idx: i, stuckFrames: 0, stuckX: sx, stuckY: sy,
                            lastRow: -1, progressFrames: 0, progressBest: -Infinity });
        }
        NeuralAI.initAgents();
    }

    // Toggle AI control (called from button)
    window.toggleAIControl = function () {
        aiEnabled = !aiEnabled;
        if (aiEnabled) initNeuralAI();
        if (!aiEnabled) aiGhosts = [];
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
            btn.textContent = `🧠 Neural AI: ON  ×${NeuralAI.N_AGENTS} (Gen ${gen})`;
            btn.style.background = '#1a7a1a';
        } else {
            btn.textContent = '🧠 Neural AI: OFF';
            btn.style.background = '#5a2a80';
        }
    }

    // ── Input ────────────────────────────────────────────────────────────────
    const keys    = Object.create(null);
    const pressed = Object.create(null);
    // p2keys / p2pressed share the same map — just different key codes
    const tracked = new Set([
        'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
        'KeyC','KeyX','KeyZ','ShiftLeft','ShiftRight','KeyR',
        // Player 2: WASD + E(dash) + S(grab) — W doubles as jump
        'KeyW','KeyA','KeyD','KeyS','KeyE',
    ]);

    window.addEventListener('keydown', (e) => {
        if (tracked.has(e.code)) {
            if (!keys[e.code]) pressed[e.code] = true;
            keys[e.code] = true;
            e.preventDefault();
        }
        if (e.code === 'KeyR') {
            if (raceMode) window.raceGenerateMap(raceSeed);
            else restartRun();
        }
    });
    window.addEventListener('keyup', (e) => { if (tracked.has(e.code)) keys[e.code] = false; });

    function readInputP2() {
        const moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
        return {
            moveX,
            moveY:       0,
            jumpPressed: !!pressed['KeyW'],
            jumpHeld:    !!keys['KeyW'],
            dashPressed: !!pressed['KeyE'],
            grabHeld:    !!keys['KeyS'],
        };
    }

    function getHazardRects() {
        const rects = [];
        for (const e of entities) {
            if (e.type === 'spike' || e.type === 'blade' ||
                e.type === 'fireball' || e.type === 'blade_h' || e.type === 'blade_c') {
                rects.push({ x: e.x, y: e.y, w: e.w, h: e.h });
            }
        }
        return rects;
    }

    function readInput() {
        if (aiEnabled && typeof NeuralAI !== 'undefined')
            return NeuralAI.compute(player, platforms, GOAL, getHazardRects());
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

    // ── Demo recording helpers ────────────────────────────────────────────────
    function humanActionIndex(inp) {
        const dash = inp.dashPressed;
        const jump = inp.jumpHeld;
        const grab = inp.grabHeld;
        const mx   = inp.moveX;   // -1, 0, 1
        const my   = inp.moveY;   // -1, 0, 1
        if (dash) {
            if      (mx ===  1 && my ===  0) return 3;
            else if (mx === -1 && my ===  0) return 9;
            else if (mx ===  0 && my === -1) return 10;
            else if (mx ===  1 && my === -1) return 11;
            else if (mx === -1 && my === -1) return 12;
            else if (mx ===  0 && my ===  1) return 13;
            else if (mx ===  1 && my ===  1) return 14;
            else if (mx === -1 && my ===  1) return 15;
            return mx < 0 ? 9 : 3;
        }
        if (grab && jump)  return 8;
        if (grab)          return mx > 0 ? 7 : 6;
        if (jump && mx >  0) return 4;
        if (jump && mx <  0) return 5;
        if (jump)            return 2;
        if (mx >  0) return 1;
        if (mx <  0) return 0;
        return -1;  // idle — skip
    }

    async function saveRecording() {
        const payload = { seed: recordingSeed, frames: recordingFrames };
        try {
            const res = await fetch('/ai-recording', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload),
                signal:  AbortSignal.timeout(5000),
            });
            const obj = await res.json();
            if (statusEl) statusEl.textContent =
                `Recording saved: ${recordingFrames.length} frames.`;
        } catch (_) {
            if (statusEl) statusEl.textContent = 'Recording save failed.';
        }
        recordingFrames = [];
    }

    window.toggleRecording = function () {
        if (aiEnabled) return;  // only record human play
        recordingActive = !recordingActive;
        const btn = document.getElementById('record-demo-btn');
        if (recordingActive) {
            recordingFrames = [];
            recordingSeed   = currentSeed;
            if (btn) { btn.textContent = '⏹ Stop'; btn.style.background = '#aa2020'; }
        } else {
            if (btn) { btn.textContent = '⏺ Record Demo'; btn.style.background = '#20607a'; }
            if (recordingFrames.length > 0) saveRecording();
        }
    };

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

    // ── buildRaceMap — 5-room race course with named checkpoints ─────────────
    // Checkpoint names follow the "#-Name" format:
    //   "1-Starting Line", "2-Gap Sprint", "3-Chimney", "4-Cliff Face", "5-Summit"
    function buildRaceMap(seed) {
        const rng = mkRng(seed);
        const ri  = () => Math.floor(rng() * 1000);

        const N    = 5;  // rooms in the race course
        const MID  = ['platform', 'chimney', 'climb'];
        const types = ['gaps', MID[ri() % MID.length], MID[ri() % MID.length], MID[ri() % MID.length], 'stair'];
        // Ensure middle rooms have variety — if all three are identical, rotate one
        if (types[1] === types[2] && types[2] === types[3]) types[2] = MID[(MID.indexOf(types[1]) + 1) % MID.length];

        const CP_NAMES = { gaps:'Gap Sprint', platform:'Ledge Run', chimney:'Chimney', climb:'Cliff Face', stair:'Stairway' };

        const p = [], pits = [], sp = [], nm = [], sk = [], lb = [], ents = [];
        let goal = {};

        for (let room = 0; room < N; room++) {
            const ox   = room * ROOM_W;
            const type = types[room];

            // "#-Name" checkpoint label
            const cpName = room === 0     ? '1-Starting Line' :
                           room === N - 1 ? `${N}-Summit`      :
                           `${room + 1}-${CP_NAMES[type]}`;
            sp.push({ x: ox + 14, y: FLOOR_Y - 12 });
            nm.push(cpName);
            sk.push(PALETTES[(ri() + room) % PALETTES.length]);

            if (room === 0)     p.push({ x: ox,               y: 0, w: 8, h: 180, color: '#4a5570' });
            if (room === N - 1) p.push({ x: ox + ROOM_W - 8, y: 0, w: 8, h: 180, color: '#4a5570' });

            if (type === 'gaps') {
                const numGaps = 1 + (ri() % 2);
                const gapW    = 28 + (ri() % 22);
                const seg     = splitFloor(ox, FLOOR_Y, ROOM_W, numGaps, gapW, rng);
                for (const s of seg.floors) p.push({ x: s.x, y: FLOOR_Y, w: s.w, h: FLOOR_H, color: '#3a5a3a' });
                for (const g of seg.gaps)   { pits.push({ x: g.x, y: FLOOR_Y, w: g.w, h: FLOOR_H }); lb.push({ text: 'JUMP', x: g.x + 4, y: FLOOR_Y + 10 }); }

            } else if (type === 'platform') {
                const entryW = 50 + (ri() % 30), exitW = 40 + (ri() % 30);
                p.push({ x: ox,                  y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                p.push({ x: ox + ROOM_W - exitW, y: FLOOR_Y, w: exitW,  h: FLOOR_H, color: '#3a5a3a' });
                pits.push({ x: ox + entryW, y: FLOOR_Y, w: ROOM_W - entryW - exitW, h: FLOOR_H });
                const asc = rng() > 0.5, gap = (ROOM_W - entryW - exitW) / 3;
                for (let i = 0; i < 3; i++) {
                    const fx = ox + entryW + Math.floor(i * gap) + (ri() % 10);
                    const fy = asc ? Math.max(25, FLOOR_Y - 45 - i * 28) : Math.max(25, FLOOR_Y - 110 + i * 28);
                    p.push({ x: fx, y: fy, w: 42 + (ri() % 28), h: 8, color: '#5a7a5a' });
                    lb.push({ text: 'STEP', x: fx + 4, y: fy - 2 });
                }
            } else if (type === 'chimney') {
                const entryW = 70 + (ri() % 50), shaftX = ox + entryW + 10 + (ri() % 20);
                const shaftW = 22 + (ri() % 10), shaftTop = 28 + (ri() % 35);
                p.push({ x: ox,                  y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                p.push({ x: shaftX,              y: shaftTop, w: 6, h: FLOOR_Y - shaftTop - 16, color: '#5a6b88' });
                p.push({ x: shaftX + shaftW,     y: shaftTop, w: 6, h: FLOOR_Y - shaftTop,      color: '#5a6b88' });
                p.push({ x: shaftX,              y: shaftTop, w: shaftW + 12, h: 6,              color: '#5a7a5a' });
                lb.push({ text: 'WALL JUMP', x: shaftX - 8, y: FLOOR_Y - 4 });
                const l1x = shaftX + shaftW + 18 + (ri() % 15), l1y = 72 + (ri() % 35);
                const l2x = l1x + 48 + (ri() % 20),             l2y = 118 + (ri() % 24);
                p.push({ x: l1x, y: l1y, w: 50, h: 8, color: '#5a7a5a' });
                p.push({ x: l2x, y: l2y, w: 50, h: 8, color: '#5a7a5a' });
                const exitX = Math.min(ox + ROOM_W - 10, l2x + 40);
                if (exitX < ox + ROOM_W) p.push({ x: exitX, y: FLOOR_Y, w: ox + ROOM_W - exitX, h: FLOOR_H, color: '#3a5a3a' });
            } else if (type === 'climb') {
                const entryW = 50 + (ri() % 30);
                p.push({ x: ox, y: FLOOR_Y, w: entryW, h: FLOOR_H, color: '#3a5a3a' });
                const wallH = 120 + (ri() % 40), wallTop = FLOOR_Y - wallH;
                const wallAX = ox + entryW + 20 + (ri() % 20);
                p.push({ x: wallAX,     y: wallTop, w: 8,  h: wallH, color: '#7a6b8a' });
                p.push({ x: wallAX + 8, y: wallTop, w: 62, h: 8,     color: '#5a7a5a' });
                lb.push({ text: 'GRAB+UP', x: wallAX - 32, y: FLOOR_Y - 28 });
                const wallBX = wallAX + 8 + 62 + 20 + (ri() % 20);
                p.push({ x: wallBX,     y: wallTop, w: 8,  h: wallH, color: '#7a6b8a' });
                p.push({ x: wallBX + 8, y: wallTop, w: 40, h: 8,     color: '#5a7a5a' });
                const d1x = wallBX + 50, d2x = d1x + 50;
                p.push({ x: d1x, y: wallTop + 55,  w: 50, h: 8, color: '#5a7a5a' });
                p.push({ x: d2x, y: wallTop + 105, w: 40, h: 8, color: '#5a7a5a' });
                const exitX = Math.min(ox + ROOM_W - 10, d2x + 32);
                if (exitX < ox + ROOM_W) p.push({ x: exitX, y: FLOOR_Y, w: ox + ROOM_W - exitX, h: FLOOR_H, color: '#3a5a3a' });
            } else { // stair — summit room
                p.push({ x: ox, y: FLOOR_Y, w: 55, h: FLOOR_H, color: '#3a5a3a' });
                const steps = 4 + (ri() % 2), spacing = (ROOM_W - 80) / steps;
                for (let s = 0; s < steps; s++) {
                    const sx = ox + 55 + Math.floor(s * spacing);
                    const sy = FLOOR_Y - 32 - s * 30;
                    const sw = 48 + (ri() % 18);
                    p.push({ x: sx, y: sy, w: sw, h: 8, color: '#5a7a5a' });
                    if (s === steps - 1) {
                        goal = { x: sx + sw - 18, y: sy - 14, w: 12, h: 12, color: '#d4af37' };
                        lb.push({ text: '🏁 FINISH', x: sx, y: sy - 4 });
                    }
                }
            }
        }

        // Entity pass — racing-tuned: heavy on dash crystals and springs, light on spikes
        const RACE_POOL = [
            'crystal','crystal','crystal','crystal','crystal',
            'spring', 'spring', 'spring',
            'spike',  'spike',
            'blade_h',
        ];
        const cands = p.filter(pl => pl.w >= 18 && pl.h <= 12 && pl.y > 8);
        const pool  = [...cands];
        for (let i = pool.length - 1; i > 0; i--) { const j = ri() % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const used = new Set(), total = 7 + (ri() % 4);
        for (let i = 0; i < total && i < pool.length; i++) {
            const pl   = pool[i];
            const pidx = cands.indexOf(pl);
            const type = RACE_POOL[ri() % RACE_POOL.length];
            const cx   = pl.x + Math.floor(pl.w / 2);
            if      (type === 'spring')                         ents.push(makeSpring(cx, pl.y, 'floor'));
            else if (type === 'crystal')                        ents.push(makeDashCrystal(cx, pl.y - 14));
            else if (type === 'spike'  && pl.w >= 20 && !used.has(pidx)) { used.add(pidx); ents.push(makeSpike(pl.x + pl.w - 6, pl.y, 6, 'up')); }
            else if (type === 'blade_h'&& pl.w >= 36 && !used.has(pidx)) { used.add(pidx); ents.push(makeEnticeBlade({ ax: pl.x + 8, ay: pl.y - 26, bx: pl.x + pl.w - 20, by: pl.y - 26, speed: 35 + (ri() % 20) })); }
            else    ents.push(makeDashCrystal(cx, pl.y - 14));
        }

        return { platforms: p, pitShading: pits, roomSpawns: sp, roomNames: nm, roomSkies: sk, roomLabels: lb, goal, entities: ents };
    }

    window.raceGenerateMap = function (seedOverride) {
        raceSeed = (seedOverride !== undefined) ? (seedOverride | 0) : Math.floor(Math.random() * 999999);
        NUM_ROOMS = 5;
        applyLevel(buildRaceMap(raceSeed), raceSeed);
        // Show seed in UI
        const el = document.getElementById('race-seed-display');
        if (el) el.textContent = `Seed: ${raceSeed}`;

        // Set AI world bounds for this map
        window.AI_BOUNDS = { minX: -20, maxX: NUM_ROOMS * ROOM_W + 20, minY: -20, maxY: H + 20 };
        window.AI_GOAL_VERTICAL = false;

        // Create / re-spawn race AI player
        if (!raceAIPlayer) raceAIPlayer = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
        else raceAIPlayer.reset(roomSpawns[0].x, roomSpawns[0].y);

        // Create / re-spawn player 2 if 2-player mode is active
        if (p2Active) {
            if (!player2) player2 = new CelestePlayer(roomSpawns[0].x, roomSpawns[0].y);
            else player2.reset(roomSpawns[0].x, roomSpawns[0].y);
            p2CP = 0; p2Done = false; p2Time = null;
            p2StuckFrames = 0; p2StuckX = roomSpawns[0].x; p2StuckY = roomSpawns[0].y;
        } else {
            player2 = null;
        }

        // Reset race state
        racePlayerCP = 0; raceAICP = 0;
        racePlayerDone = false; raceAIDone = false;
        racePlayerTime = null; raceAITime = null;
        raceStart = performance.now();
        raceAIStuckFrames = 0; raceAIStuckX = roomSpawns[0].x; raceAIStuckY = roomSpawns[0].y;
        raceAIProgFrames = 0;  raceAIProgBest = -Infinity;

        if (typeof NeuralAI !== 'undefined') {
            NeuralAI.init(roomSpawns[0].x, GOAL ? GOAL.x + GOAL.w : NUM_ROOMS * ROOM_W);
            NeuralAI.reset(roomSpawns[0].x);
            spawnAIGhosts();
        }
        bestMs = null;
        restartRun();
    };
    window.loadRaceSeed = function () {
        const input = document.getElementById('race-seed-input');
        const val   = parseInt(input ? input.value : '', 10);
        if (!isNaN(val)) window.raceGenerateMap(val);
    };

    window.toggle2Player = function () {
        p2Active = !p2Active;
        const btn = document.getElementById('p2-toggle-btn');
        if (btn) btn.textContent = p2Active ? '👥 2P: ON' : '👥 2P: OFF';
        if (raceMode) window.raceGenerateMap(raceSeed);
    };

    // ── Online race: join matchmaking queue ───────────────────────────────────
    window.joinOnlineRace = function () {
        if (typeof OnlineRace === 'undefined') {
            alert('Online race module not loaded.');
            return;
        }
        const nameInput = document.getElementById('online-name-input');
        const name = nameInput ? nameInput.value.trim() || 'Player' : 'Player';

        // Ensure we're in race mode so UI is visible
        if (!raceMode) window.startGame('race');

        onlineMode = true;
        onlineName = '';
        opLerpX = roomSpawns[0] ? roomSpawns[0].x : 0;
        opLerpY = roomSpawns[0] ? roomSpawns[0].y : 0;

        OnlineRace.onMatched = function (seed, opponentName) {
            onlineName = opponentName;
            // Both players get the same seed from the server — generate the map
            window.raceGenerateMap(seed);
            const el = document.getElementById('online-status');
            if (el) el.textContent = `Racing vs ${opponentName}!`;
        };
        OnlineRace.onOpponentLeft = function () {
            onlineMode = false;
            const el = document.getElementById('online-status');
            if (el) el.textContent = 'Opponent left.';
        };

        OnlineRace.join(name);

        // Show waiting UI
        const el = document.getElementById('online-status');
        if (el) { el.textContent = 'Connecting…'; el.className = 'online-status-waiting'; }
    };

    window.leaveOnlineRace = function () {
        if (typeof OnlineRace !== 'undefined') OnlineRace.disconnect();
        onlineMode = false;
        const el = document.getElementById('online-status');
        if (el) el.textContent = '';
    };

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

    // ── Mirror Temple: 8-room ice maze (Chapter-5-style) ────────────────────
    function buildMazeLevel() {
        const RW = ROOM_W, RH = H;
        // Colour palette — dark ice aesthetic
        const ICE  = '#2a1248', ICE2 = '#180a2c', ICE3 = '#4a228a', WALL = '#1a0838';

        const allP = [], allE = [], roomSpawnsOut = [], roomNamesOut = [], roomSkiesOut = [];

        // Rooms added in any order; offsets applied here.
        // Entities are spec objects converted via buildEntityFromSpec(spec, 0, 0)
        // after world offsets have already been baked in.
        function addR(col, row, plats, entSpecs) {
            const ox = col * RW, oy = row * RH;
            for (const pl of plats)
                allP.push({ ...pl, x: pl.x + ox, y: pl.y + oy });
            for (const e of entSpecs) {
                const n = { ...e };
                if (n.type === 'blade_h') {
                    n.ax += ox; n.bx += ox; n.ay += oy; n.by += oy;
                } else if (n.type === 'blade_c') {
                    n.cx += ox; n.cy += oy;
                } else {
                    if (n.x != null) n.x += ox;
                    if (n.y != null) n.y += oy;
                }
                const built = buildEntityFromSpec(n, 0, 0);
                if (built) allE.push(built);
            }
        }

        /* Grid layout (col, row):
         *  col:  0         1         2         3
         *  row-1:[H dead]  [B]       [C dead]
         *  row 0:[A start] [D cross] [E blade] [G goal]
         *  row+1:          [F dead]
         *
         * Horizontal door gaps: y 80–120 in local coords (right/left walls)
         * Vertical   door gaps: x 100–220 in local coords (ceiling/floor)
         */

        // ── Room A (col 0, row 0) — Mirror Entrance ─────────────────────────
        addR(0, 0, [
            { x:0,   y:0,   w:8,   h:180, color:WALL }, // left boundary
            { x:312, y:0,   w:8,   h:80,  color:WALL }, // right top   (gap 80-120 → D)
            { x:312, y:120, w:8,   h:60,  color:WALL }, // right bottom
            { x:0,   y:0,   w:120, h:8,   color:WALL }, // ceiling left (gap 120-200 ↑ H)
            { x:200, y:0,   w:120, h:8,   color:WALL }, // ceiling right
            { x:0,   y:168, w:320, h:12,  color:ICE  }, // floor
            { x:118, y:24,  w:6,   h:110, color:ICE2 }, // chimney shaft L
            { x:196, y:24,  w:6,   h:110, color:ICE2 }, // chimney shaft R
            { x:20,  y:140, w:60,  h:8,   color:ICE3 }, // step 1
            { x:90,  y:108, w:50,  h:8,   color:ICE3 }, // step 2
            { x:150, y:76,  w:46,  h:8,   color:ICE3 }, // step 3 (inside shaft)
        ], [
            { type:'crystal', x:50,  y:127 },
            { type:'spring',  x:240, y:168, orientation:'floor' },
        ]);
        roomSpawnsOut.push({ x:0*RW+14, y:0*RH+FLOOR_Y-13 });
        roomNamesOut.push('MIRROR ENTRANCE');
        roomSkiesOut.push(['#06020e', '#0d0418']);

        // ── Room H (col 0, row -1) — Hollow Heights (dead end above A) ───────
        addR(0, -1, [
            { x:0,   y:0,   w:8,   h:180, color:WALL }, // left wall
            { x:312, y:0,   w:8,   h:180, color:WALL }, // right wall (sealed)
            { x:0,   y:0,   w:320, h:8,   color:WALL }, // ceiling (sealed)
            { x:0,   y:168, w:120, h:12,  color:ICE  }, // floor left  (gap 120-200 ↓ A)
            { x:200, y:168, w:120, h:12,  color:ICE  }, // floor right
            { x:40,  y:130, w:70,  h:8,   color:ICE3 },
            { x:180, y:90,  w:70,  h:8,   color:ICE3 },
            { x:100, y:48,  w:80,  h:8,   color:ICE  }, // top platform
        ], [
            { type:'strawberry', x:138, y:33 },
            { type:'blade_c', cx:160, cy:68, radius:24, startAngle:0,   speed:1.8 },
            { type:'crystal',  x:60,  y:116 },
        ]);

        // ── Room D (col 1, row 0) — Mirrored Nexus (crossroads) ──────────────
        addR(1, 0, [
            { x:0,   y:0,   w:8,   h:80,  color:WALL }, // left top    (gap 80-120 ← A)
            { x:0,   y:120, w:8,   h:60,  color:WALL }, // left bottom
            { x:312, y:0,   w:8,   h:80,  color:WALL }, // right top   (gap 80-120 → E)
            { x:312, y:120, w:8,   h:60,  color:WALL }, // right bottom
            { x:0,   y:0,   w:100, h:8,   color:WALL }, // ceiling left (gap 100-220 ↑ B)
            { x:220, y:0,   w:100, h:8,   color:WALL }, // ceiling right
            { x:0,   y:168, w:100, h:12,  color:ICE  }, // floor left  (gap 100-220 ↓ F)
            { x:220, y:168, w:100, h:12,  color:ICE  }, // floor right
            { x:50,  y:140, w:60,  h:8,   color:ICE3 }, // platform L
            { x:210, y:140, w:60,  h:8,   color:ICE3 }, // platform R
            { x:130, y:100, w:60,  h:8,   color:ICE  }, // centre platform
        ], [
            { type:'crystal', x:158, y:86  },
            { type:'crystal', x:160, y:50  },
            { type:'spike',   x:104, y:168, size:8, dir:'up' },
            { type:'spike',   x:208, y:168, size:8, dir:'up' },
            { type:'spike',   x:236, y:168, size:8, dir:'up' },
            { type:'spike',   x:270, y:168, size:8, dir:'up' },
        ]);
        roomSpawnsOut.push({ x:1*RW+14, y:0*RH+FLOOR_Y-13 });
        roomNamesOut.push('MIRRORED NEXUS');
        roomSkiesOut.push(['#050210', '#0a0420']);

        // ── Room B (col 1, row -1) — Ice Gallery (above D, exits right to C) ─
        addR(1, -1, [
            { x:0,   y:0,   w:8,   h:180, color:WALL }, // left wall (sealed)
            { x:312, y:0,   w:8,   h:80,  color:WALL }, // right top   (gap 80-120 → C)
            { x:312, y:120, w:8,   h:60,  color:WALL }, // right bottom
            { x:0,   y:0,   w:320, h:8,   color:WALL }, // ceiling (sealed)
            { x:0,   y:168, w:100, h:12,  color:ICE  }, // floor left  (gap 100-220 ↓ D)
            { x:220, y:168, w:100, h:12,  color:ICE  }, // floor right
            { x:30,  y:140, w:50,  h:8,   color:ICE3 },
            { x:130, y:118, w:50,  h:8,   color:ICE3 },
            { x:100, y:80,  w:60,  h:8,   color:ICE  },
            { x:220, y:100, w:52,  h:8,   color:ICE3 },
        ], [
            { type:'blade_h', ax:36, ay:148, bx:118, by:148, speed:55 },
            { type:'crystal',  x:180, y:106 },
            { type:'spike',    x:200, y:8,   size:8, dir:'down' },
            { type:'spike',    x:44,  y:168, size:8, dir:'up' },
            { type:'spike',    x:248, y:168, size:8, dir:'up' },
        ]);

        // ── Room C (col 2, row -1) — Crystal Cavern (dead end) ───────────────
        addR(2, -1, [
            { x:0,   y:0,   w:8,   h:80,  color:WALL }, // left top    (gap 80-120 ← B)
            { x:0,   y:120, w:8,   h:60,  color:WALL }, // left bottom
            { x:312, y:0,   w:8,   h:180, color:WALL }, // right wall (sealed)
            { x:0,   y:0,   w:320, h:8,   color:WALL }, // ceiling (sealed)
            { x:0,   y:168, w:320, h:12,  color:ICE  }, // floor
            { x:40,  y:140, w:60,  h:8,   color:ICE3 },
            { x:160, y:110, w:60,  h:8,   color:ICE3 },
            { x:215, y:68,  w:60,  h:8,   color:ICE  }, // top platform
        ], [
            { type:'strawberry', x:245, y:53 },
            { type:'key',        x:130, y:50 },
            { type:'blade_c', cx:160, cy:100, radius:30, startAngle:1.0, speed:1.6 },
            { type:'spike',   x:130, y:8,    size:8, dir:'down' },
            { type:'spike',   x:196, y:8,    size:8, dir:'down' },
        ]);

        // ── Room E (col 2, row 0) — Blade Corridor ────────────────────────────
        addR(2, 0, [
            { x:0,   y:0,   w:8,   h:80,  color:WALL }, // left top    (gap 80-120 ← D)
            { x:0,   y:120, w:8,   h:60,  color:WALL }, // left bottom
            { x:312, y:0,   w:8,   h:80,  color:WALL }, // right top   (gap 80-120 → G)
            { x:312, y:120, w:8,   h:60,  color:WALL }, // right bottom
            { x:0,   y:0,   w:320, h:8,   color:WALL }, // ceiling
            { x:0,   y:168, w:320, h:12,  color:ICE  }, // floor
            { x:20,  y:130, w:50,  h:8,   color:ICE3 }, // entry ledge
            { x:135, y:100, w:50,  h:8,   color:ICE3 }, // mid ledge
            { x:250, y:130, w:50,  h:8,   color:ICE3 }, // exit ledge
        ], [
            { type:'blade_h', ax:28,  ay:148, bx:158, by:148, speed:68 },
            { type:'blade_h', ax:152, ay:78,  bx:298, by:78,  speed:74 },
            { type:'crystal',  x:160, y:86  },
            { type:'spike',    x:80,  y:168, size:8, dir:'up' },
            { type:'spike',    x:158, y:168, size:8, dir:'up' },
            { type:'spike',    x:232, y:168, size:8, dir:'up' },
            { type:'keyDoor',  x:312, y:80,  w:8,   h:40 },
        ]);
        roomSpawnsOut.push({ x:2*RW+14, y:0*RH+FLOOR_Y-13 });
        roomNamesOut.push('BLADE CORRIDOR');
        roomSkiesOut.push(['#060210', '#0c0420']);

        // ── Room F (col 1, row 1) — Spike Descent (below D, escapable via staircase) ──
        addR(1, 1, [
            { x:0,   y:0,   w:100, h:8,   color:WALL }, // ceiling left (gap 100-220 ↑ D)
            { x:220, y:0,   w:100, h:8,   color:WALL }, // ceiling right
            { x:0,   y:0,   w:8,   h:180, color:WALL }, // left wall
            { x:0,   y:74,  w:22,  h:8,   color:WALL }, // left anti-climb shelf
            { x:312, y:0,   w:8,   h:180, color:WALL }, // right wall
            { x:298, y:74,  w:22,  h:8,   color:WALL }, // right anti-climb shelf
            { x:0,   y:168, w:320, h:12,  color:ICE2 }, // floor
            { x:110, y:134, w:100, h:8,   color:ICE3 }, // step 1 — reachable from floor
            { x:100, y:100, w:80,  h:8,   color:ICE3 }, // step 2 — reachable from step 1
            { x:100, y:66,  w:80,  h:8,   color:ICE3 }, // step 3 — launchpad into exit gap
        ], [
            { type:'spike', x:104, y:168, size:8, dir:'up' },
            { type:'spike', x:130, y:168, size:8, dir:'up' },
            { type:'spike', x:156, y:168, size:8, dir:'up' },
            { type:'spike', x:182, y:168, size:8, dir:'up' },
            { type:'blade_h', ax:20, ay:152, bx:88, by:152, speed:64 },
            { type:'strawberry', x:160, y:45 },
            { type:'crystal',    x:160, y:85 },
        ]);

        // ── Room G (col 3, row 0) — Mirror Summit (descent into Core) ────────
        addR(3, 0, [
            { x:0,   y:0,   w:8,   h:80,  color:WALL }, // left top    (gap 80-120 ← E)
            { x:0,   y:120, w:8,   h:60,  color:WALL }, // left bottom
            { x:312, y:0,   w:8,   h:180, color:WALL }, // right wall (sealed)
            { x:0,   y:0,   w:320, h:8,   color:WALL }, // ceiling
            { x:0,   y:168, w:100, h:12,  color:ICE  }, // floor left  (gap 100-220 ↓ CORE)
            { x:220, y:168, w:100, h:12,  color:ICE  }, // floor right
            { x:20,  y:140, w:55,  h:8,   color:ICE3 }, // step 1
            { x:100, y:110, w:55,  h:8,   color:ICE3 }, // step 2
            { x:178, y:80,  w:55,  h:8,   color:ICE3 }, // step 3
            { x:256, y:48,  w:50,  h:8,   color:ICE  }, // pedestal
        ], [
            { type:'blade_c', cx:160, cy:90, radius:36, startAngle:0.5, speed:1.4 },
            { type:'crystal',  x:124, y:96 },
            { type:'spike',   x:50,  y:8,  size:8, dir:'down' },
            { type:'spike',   x:110, y:8,  size:8, dir:'down' },
        ]);
        roomSpawnsOut.push({ x:3*RW+14, y:0*RH+FLOOR_Y-13 });
        roomNamesOut.push('MIRROR SUMMIT');
        roomSkiesOut.push(['#050210', '#0b0420']);

        // ── Room CORE (col 3, row 1) — The Core (final descent, GOAL) ────────
        const COREW = '#3a0808', COREL = '#7a1a08', CORE2 = '#5a1410', CORE3 = '#a0381a';
        addR(3, 1, [
            { x:0,   y:0,   w:100, h:8,   color:COREW }, // ceiling left (gap 100-220 ↑ G)
            { x:220, y:0,   w:100, h:8,   color:COREW }, // ceiling right
            { x:0,   y:0,   w:8,   h:180, color:COREW }, // left wall
            { x:312, y:0,   w:8,   h:180, color:COREW }, // right wall
            { x:0,   y:168, w:230, h:12,  color:COREL }, // lava floor (deadly with spikes)
            { x:230, y:140, w:90,  h:40,  color:CORE3 }, // safe goal pedestal (right side)
            { x:30,  y:50,  w:55,  h:8,   color:CORE3 }, // descent step 1
            { x:160, y:80,  w:55,  h:8,   color:CORE3 }, // descent step 2
            { x:60,  y:108, w:55,  h:8,   color:CORE3 }, // descent step 3
            { x:160, y:130, w:60,  h:8,   color:CORE2 }, // approach platform
        ], [
            // Lava floor — every tile deadly except the goal pedestal at x>=230
            { type:'spike', x:8,   y:168, size:8, dir:'up' },
            { type:'spike', x:28,  y:168, size:8, dir:'up' },
            { type:'spike', x:48,  y:168, size:8, dir:'up' },
            { type:'spike', x:68,  y:168, size:8, dir:'up' },
            { type:'spike', x:88,  y:168, size:8, dir:'up' },
            { type:'spike', x:108, y:168, size:8, dir:'up' },
            { type:'spike', x:128, y:168, size:8, dir:'up' },
            { type:'spike', x:148, y:168, size:8, dir:'up' },
            { type:'spike', x:168, y:168, size:8, dir:'up' },
            { type:'spike', x:188, y:168, size:8, dir:'up' },
            { type:'spike', x:208, y:168, size:8, dir:'up' },
            { type:'crystal', x:140, y:30 },  // dash refill near top
            { type:'golden',  x:270, y:124 }, // golden strawberry on pedestal
        ]);
        roomSkiesOut.push(['#1a0404', '#3a0a08']);

        // Goal flag in CORE pedestal, local (276, 122) → world (3*320+276, 180+122)
        const goal = { x:3*RW+276, y:1*RH+122, w:12, h:12, color:'#ff8030' };

        return {
            platforms:  allP,
            pitShading: [],
            roomSpawns: roomSpawnsOut,   // 4 entries — one per column
            roomNames:  roomNamesOut,
            roomSkies:  roomSkiesOut,
            roomLabels: [],
            goal,
            entities:   allE,
            _numCols:   4,
            _worldMinY: -RH,   // row -1 = worldY -180
            _worldH:    3 * RH, // rows -1, 0, +1 = 540 px tall
            // rowIdx = floor((player.y - worldMinY) / H): 0=top row, 1=mid, 2=bot
            _roomNameMap: {
                '0,1': 'MIRROR ENTRANCE',
                '0,0': 'HOLLOW HEIGHTS',
                '1,1': 'MIRRORED NEXUS',
                '1,0': 'ICE GALLERY',
                '2,0': 'CRYSTAL CAVERN',
                '2,1': 'BLADE CORRIDOR',
                '1,2': 'SPIKE DESCENT',
                '3,1': 'MIRROR SUMMIT',
                '3,2': 'THE CORE',
            },
        };
    }

    // ── Heart of the Mountain: 1-column, 5-room vertical ascent ─────────────
    function buildMountainLevel() {
        const RW = ROOM_W, RH = H;
        const ROCK  = '#2a1a0a', ROCK2 = '#4a2c14', ROCK3 = '#6a3a1a';
        const ICE_P = '#1a4a6a', ICE2P = '#2a6a9a', ICE3P = '#3a8abf';
        const LWALL = '#1a0e06', LCEIL = '#1a0e06';

        const allP = [], allE = [], roomSpawnsOut = [], roomNamesOut = [],
              roomSkiesOut = [], allPitShading = [];

        function addR(col, row, plats, entSpecs) {
            const ox = col * RW, oy = row * RH;
            for (const pl of plats) allP.push({ ...pl, x: pl.x + ox, y: pl.y + oy });
            for (const e of entSpecs) {
                const n = { ...e };
                if (n.type === 'blade_h') {
                    n.ax += ox; n.bx += ox; n.ay += oy; n.by += oy;
                } else if (n.type === 'blade_c') {
                    n.cx += ox; n.cy += oy;
                } else {
                    if (n.x != null) n.x += ox;
                    if (n.y != null) n.y += oy;
                }
                const built = buildEntityFromSpec(n, 0, 0);
                if (built) allE.push(built);
            }
        }

        // ── Room 4 (col 0, row 4) — "Volcanic Entry" — player starts here ───
        addR(0, 4, [
            { x:0,   y:0,   w:8,   h:180, color:LWALL },  // left wall
            { x:312, y:0,   w:8,   h:180, color:LWALL },  // right wall
            { x:0,   y:0,   w:100, h:8,   color:LCEIL },  // ceiling-L (gap 100-220 ↑)
            { x:220, y:0,   w:100, h:8,   color:LCEIL },  // ceiling-R
            { x:0,   y:168, w:320, h:12,  color:ROCK  },  // floor (sealed, no fall)
            { x:40,  y:140, w:55,  h:8,   color:ROCK2 },  // step 1
            { x:170, y:112, w:55,  h:8,   color:ICE_P, isIcy:true }, // step 2 (ice)
            { x:55,  y:80,  w:55,  h:8,   color:ROCK2 },  // step 3
            { x:145, y:46,  w:90,  h:8,   color:ICE_P, isIcy:true }, // launchpad (ice, below gap)
        ], [
            { type:'fireball',   x:160, y:96,  vx:55  },
            { type:'crystal',    x:205, y:32  },           // teach: crystals refill dash
            { type:'coreSwitch', x:80,  y:156 },           // switch on the floor — intro to mechanic
            { type:'spike',      x:95,  y:168, size:8, dir:'up' },
            { type:'spike',      x:215, y:168, size:8, dir:'up' },
        ]);
        roomSpawnsOut.push({ x:0*RW+30, y:4*RH+155 });   // spawn clear of left wall
        roomNamesOut.push('HEART OF THE MOUNTAIN');
        roomSkiesOut.push(['#1a0800', '#2a1000']); // warm bottom

        // ── Room 3 (col 0, row 3) — "Ember Shaft" ────────────────────────────
        addR(0, 3, [
            { x:0,   y:0,   w:8,   h:180, color:LWALL },
            { x:312, y:0,   w:8,   h:180, color:LWALL },
            { x:0,   y:0,   w:100, h:8,   color:LCEIL },  // ceiling-L (gap 100-220 ↑ room 2)
            { x:220, y:0,   w:100, h:8,   color:LCEIL },
            { x:0,   y:168, w:100, h:12,  color:ROCK  },  // floor-L  (gap 100-220 ↓ room 4)
            { x:220, y:168, w:100, h:12,  color:ROCK  },  // floor-R
            { x:25,  y:135, w:65,  h:8,   color:ICE_P, isIcy:true }, // step 1 (ice)
            { x:190, y:106, w:60,  h:8,   color:ROCK2 }, // step 2
            { x:40,  y:76,  w:58,  h:8,   color:ICE2P, isIcy:true }, // step 3 (ice)
            // launchpad near exit is a crumble block (entity only, no static platform here)
        ], [
            { type:'fireball',   x:160, y:90,  vx:70  },
            { type:'fireball',   x:80,  y:130, vx:-52 },
            { type:'crumble',    x:150, y:42,  w:82   },
            { type:'crystal',    x:220, y:28  },
            { type:'kevinBlock', x:195, y:98,  w:22, h:8 }, // sitting on step 2 at y=106
            { type:'spike',      x:8,   y:168, size:8,  dir:'up' },
            { type:'spike',      x:103, y:168, size:8,  dir:'up' },
            { type:'spike',      x:215, y:168, size:8,  dir:'up' },
        ]);
        // no additional spawn or name: roomIdx always 0, roomNameMap handles it
        roomSkiesOut.push(['#200c00', '#381400']); // slightly lighter

        // ── Room 2 (col 0, row 2) — "Ice Core" ───────────────────────────────
        addR(0, 2, [
            { x:0,   y:0,   w:8,   h:180, color:LWALL },
            { x:312, y:0,   w:8,   h:180, color:LWALL },
            { x:0,   y:0,   w:80,  h:8,   color:LCEIL },  // ceiling-L (gap 80-240 ↑ room 1)
            { x:240, y:0,   w:80,  h:8,   color:LCEIL },
            { x:0,   y:168, w:100, h:12,  color:ICE_P },  // floor-L (gap 100-220 ↓ room 3)
            { x:220, y:168, w:100, h:12,  color:ICE_P },
            { x:60,  y:138, w:60,  h:8,   color:ICE2P, isIcy:true },
            { x:195, y:110, w:60,  h:8,   color:ICE2P, isIcy:true },
            { x:40,  y:80,  w:60,  h:8,   color:ROCK2 },
            { x:170, y:46,  w:80,  h:8,   color:ICE3P, isIcy:true }, // near exit gap
        ], [
            { type:'fireball',   x:155, y:88,  vx:85  },
            { type:'fireball',   x:140, y:138, vx:-70 },
            { type:'fireball',   x:200, y:58,  vx:60  },
            { type:'crystal',    x:100, y:124 },
            { type:'coreSwitch', x:250, y:156 },           // switch on the right floor section
            { type:'kevinBlock', x:65,  y:72,  w:22, h:8 }, // on step 1 at y=80
            { type:'kevinBlock', x:175, y:38,  w:22, h:8 }, // on exit platform at y=46
            { type:'spike',      x:8,   y:168, size:8,  dir:'up' },
            { type:'spike',      x:215, y:168, size:8,  dir:'up' },
        ]);
        roomSkiesOut.push(['#0a1828', '#142a40']); // cooler mid

        // ── Room 1 (col 0, row 1) — "Storm Gates" ────────────────────────────
        addR(0, 1, [
            { x:0,   y:0,   w:8,   h:180, color:LWALL },
            { x:312, y:0,   w:8,   h:180, color:LWALL },
            { x:0,   y:0,   w:100, h:8,   color:LCEIL },  // ceiling-L (gap 100-220 ↑ room 0)
            { x:220, y:0,   w:100, h:8,   color:LCEIL },
            { x:0,   y:168, w:80,  h:12,  color:ROCK  },  // floor-L (gap 80-240 ↓ room 2)
            { x:240, y:168, w:80,  h:12,  color:ROCK  },
            { x:35,  y:132, w:55,  h:8,   color:ICE2P, isIcy:true },
            { x:210, y:104, w:55,  h:8,   color:ROCK2 },
            { x:80,  y:72,  w:65,  h:8,   color:ICE3P, isIcy:true },
            // launchpad near summit exit is crumble (entity only)
        ], [
            { type:'fireball', x:155, y:90,  vx:90  },
            { type:'fireball', x:80,  y:138, vx:75  },
            { type:'fireball',   x:250, y:62,  vx:-80 },
            { type:'crumble',    x:175, y:40,  w:80   },
            { type:'kevinBlock', x:85,  y:64,  w:22, h:8 }, // on step at y=72
            { type:'crystal',    x:158, y:24  },
            { type:'spike',      x:8,   y:168, size:8,  dir:'up' },
            { type:'spike',      x:235, y:168, size:8,  dir:'up' },
        ]);
        roomSkiesOut.push(['#060c1a', '#0c1830']); // dark storm

        // ── Room 0 (col 0, row 0) — "Mountain Heart" — GOAL ─────────────────
        addR(0, 0, [
            { x:0,   y:0,   w:8,   h:180, color:LWALL },
            { x:312, y:0,   w:8,   h:180, color:LWALL },
            { x:0,   y:0,   w:320, h:8,   color:LCEIL },  // sealed ceiling (top of world)
            { x:0,   y:168, w:100, h:12,  color:ICE_P },  // floor-L (gap 100-220 ↓ room 1)
            { x:220, y:168, w:100, h:12,  color:ICE_P },
            { x:50,  y:132, w:70,  h:8,   color:ROCK2 },
            { x:195, y:102, w:70,  h:8,   color:ICE2P, isIcy:true },
            { x:80,  y:66,  w:75,  h:8,   color:ROCK3 },
            { x:210, y:34,  w:90,  h:14,  color:ROCK2 }, // goal pedestal
        ], [
            { type:'fireball', x:155, y:84,  vx:85  },
            { type:'fireball', x:80,  y:130, vx:68  },
            { type:'crystal',  x:120, y:52  },
            { type:'golden',   x:262, y:18  },
        ]);
        roomSkiesOut.push(['#020408', '#050a14']); // near-black summit

        // GOAL: local (248, 18) in room 0 (oy=0) → absolute (248, 18)
        const goal = { x:248, y:18, w:12, h:12, color:'#ff8030' };

        return {
            platforms:  allP,
            pitShading: [],
            roomSpawns: roomSpawnsOut,
            roomNames:  roomNamesOut,
            roomSkies:  roomSkiesOut,
            roomLabels: [],
            goal,
            entities:   allE,
            _numCols:   1,
            _worldMinY: 0,
            _worldH:    5 * RH,   // rows 0-4
            _roomNameMap: {
                '0,0': 'MOUNTAIN HEART',
                '0,1': 'STORM GATES',
                '0,2': 'ICE CORE',
                '0,3': 'EMBER SHAFT',
                '0,4': 'VOLCANIC ENTRY',
            },
            _skyByRow: true,
        };
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
            case 'key':        return makeKey(e.x + ox, e.y + oy);
            case 'keyDoor':    return makeKeyDoor(e.x + ox, e.y + oy, e.w || 8, e.h || 40);
            case 'fireball':    return makeFireball(e.x + ox, e.y + oy, e.vx || 60, e.vy || 0);
            case 'coreSwitch':  return makeCoreSwitch(e.x + ox, e.y + oy);
            case 'kevinBlock':  return makeKevinBlock(e.x + ox, e.y + oy, e.w || 22, e.h || 16);
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
        document.querySelectorAll('.ai-ctrl').forEach(el => el.style.display = '');  // always show in all modes
        document.querySelectorAll('.random-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.race-only').forEach(el => el.style.display = 'none');

        // Reset 2D world size for non-custom modes
        worldH = H; worldMinY = 0; DEATH_Y = H + 20; cameraY = 0;

        player.noDashRefill = false;   // default — overridden per level below
        mountainMode = false;

        if (mode === 'gauntlet') {
            NUM_ROOMS = 6;
            applyLevel(buildGauntletLevel(), -1);
        } else if (mode === 'mountain') {
            const built = buildMountainLevel();
            NUM_ROOMS   = built._numCols;           // 1
            worldMinY   = built._worldMinY;         // 0
            worldH      = built._worldH;            // 900
            DEATH_Y     = worldMinY + worldH + 20;  // 920
            cameraY     = worldMinY + 4 * H;        // start camera at bottom room
            mazeRoomNameMap = built._roomNameMap || {};
            mountainMode = true;
            coreState    = 'fire';
            currentMode  = 'maze';                  // reuse all maze camera/room/transition logic
            applyLevel(built, -1);
            player.noDashRefill = true;             // Core mechanic: no dash refill on landing
            mazeRoomRow = 4;                        // start in row 4 (bottom room)
            mazeRoomCol = 0;
        } else if (mode === 'random') {
            NUM_ROOMS = AI_ROOMS;
            const seed = Math.floor(Math.random() * 999999);
            applyLevel(buildRandomLevel(seed), seed);
            document.querySelectorAll('.random-only').forEach(el => el.style.display = '');
        } else if (mode === 'maze') {
            const built = buildMazeLevel();
            NUM_ROOMS = built._numCols;           // 4
            worldMinY = built._worldMinY;         // -180
            worldH    = built._worldH;            // 540
            DEATH_Y   = worldMinY + worldH + 20;  // 380
            cameraY   = 0;                        // player starts in row 0
            mazeRoomNameMap = built._roomNameMap || {};
            applyLevel(built, -1);
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
        } else if (mode === 'race') {
            raceMode = true;
            NUM_ROOMS = 5;
            document.querySelectorAll('.race-only').forEach(el => el.style.display = '');
            window.raceGenerateMap();
            // startGame for race returns after raceGenerateMap sets up everything
            document.getElementById('level-menu').style.display = 'none';
            document.getElementById('game-ui').style.display    = 'flex';
            gameActive = true;
            return;
        } else {
            NUM_ROOMS = AI_ROOMS;
            const seed = Math.floor(Math.random() * 999999);
            applyLevel(buildLevel(seed), seed);
            document.querySelectorAll('.ai-only').forEach(el => el.style.display = '');
        }

        raceMode = false;
        raceAIPlayer = null;

        // Set world bounds for AI raycasting and goal direction sense
        window.AI_BOUNDS = {
            minX: -20,
            maxX: NUM_ROOMS * ROOM_W + 20,
            minY: worldMinY - 20,
            maxY: worldMinY + worldH + 20,
        };
        window.AI_GOAL_VERTICAL = mountainMode;

        bestMs = null;
        restartRun();
        if (typeof NeuralAI !== 'undefined') NeuralAI.reset(roomSpawns[0].x);

        document.getElementById('level-menu').style.display = 'none';
        document.getElementById('game-ui').style.display    = 'flex';
        gameActive = true;
    };

    window.showLevelMenu = function () {
        gameActive   = false;
        aiEnabled    = false;
        raceMode     = false;
        raceAIPlayer = null;
        if (onlineMode && typeof OnlineRace !== 'undefined') OnlineRace.disconnect();
        onlineMode   = false;
        updateAIBtn();
        document.querySelectorAll('.ai-ctrl').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.race-only').forEach(el => el.style.display = 'none');
        document.getElementById('game-ui').style.display    = 'none';
        document.getElementById('level-menu').style.display = '';
    };

    // ── Render ────────────────────────────────────────────────────────────────
    function playerOverlapsGoal() {
        return GOAL && player.x < GOAL.x + GOAL.w && player.x + player.w > GOAL.x
                    && player.y < GOAL.y + GOAL.h && player.y + player.h > GOAL.y;
    }

    function render() {
        const roomIdx  = getRoomIdx();
        const isMaze   = currentMode === 'maze' && !mountainMode;
        const isMtnOrMaze = currentMode === 'maze'; // covers both maze and mountain (mountain sets currentMode='maze')

        // Apply 3× scale so all drawing uses 320×180 game coordinates
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        // Sky: for mountain, use mazeRoomRow to pick per-room sky gradient
        const skyIdx = mountainMode ? mazeRoomRow : roomIdx;
        const [skyTop, skyBot] = roomSkies[skyIdx] || ['#1a2a4a','#3a5a8a'];
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBot);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

        ctx.save(); ctx.translate(-cameraX, -cameraY);

        // Background particles: mountain=embers(fire)/ice crystals, maze=purple, other=stars
        if (mountainMode) {
            const t = performance.now() / 800;
            const ice = coreState === 'ice';
            for (let i = 0; i < 48; i++) {
                const px = ((i * 137 + 29) * 1699) % ROOM_W;
                const py = worldMinY + ((i * 97 + 11) * 1301) % (worldH + H);
                const flicker = 0.1 + 0.4 * Math.abs(Math.sin(t + i * 1.3));
                if (ice) {
                    ctx.fillStyle = i % 3 === 0 ? `rgba(80,180,255,${flicker.toFixed(2)})`
                                  : i % 3 === 1 ? `rgba(160,230,255,${(flicker*0.6).toFixed(2)})`
                                  :               `rgba(220,245,255,${(flicker*0.3).toFixed(2)})`;
                } else {
                    ctx.fillStyle = i % 3 === 0 ? `rgba(255,160,40,${flicker.toFixed(2)})`
                                  : i % 3 === 1 ? `rgba(255,80,0,${(flicker*0.6).toFixed(2)})`
                                  :               `rgba(255,220,100,${(flicker*0.3).toFixed(2)})`;
                }
                ctx.fillRect(px, py, 0.8, 0.8);
            }
        } else if (isMaze) {
            const t = performance.now() / 1200;
            for (let i = 0; i < 52; i++) {
                const px = ((i * 137 + 29) * 1699) % (ROOM_W * 4);
                const py = worldMinY + ((i * 97 + 11) * 1301) % (worldH + H);
                const blink = 0.15 + 0.35 * Math.abs(Math.sin(t + i * 0.7));
                ctx.fillStyle = i % 3 === 0 ? `rgba(210,80,255,${blink.toFixed(2)})`
                              : i % 3 === 1 ? `rgba(140,40,220,${(blink*0.7).toFixed(2)})`
                              :               `rgba(255,150,255,${(blink*0.4).toFixed(2)})`;
                ctx.fillRect(px, py, i % 5 === 0 ? 1.5 : 0.5, i % 5 === 0 ? 1.5 : 0.5);
            }
        } else {
            // Starfield (parallax at 25% camera speed)
            ctx.save();
            ctx.translate(cameraX * 0.75, cameraY * 0.75);
            ctx.fillStyle = 'rgba(200,215,255,0.45)';
            for (let i = 0; i < 48; i++) {
                const sx = ((i * 137 + 29) * 1699) % (ROOM_W * 6);
                const sy = ((i * 97  + 11) * 1301) % H;
                ctx.fillRect(sx - cameraX * 0.75, sy, i % 4 === 0 ? 1.5 : 0.5, i % 4 === 0 ? 1.5 : 0.5);
            }
            ctx.restore();
        }

        // Pit voids
        for (const pit of pitShading) {
            if (isMtnOrMaze) {
                ctx.fillStyle = mountainMode ? 'rgba(80,20,0,0.5)' : 'rgba(60,0,100,0.5)';
                ctx.fillRect(pit.x, pit.y, pit.w, pit.h);
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(pit.x, pit.y, pit.w, pit.h);
                ctx.fillStyle = 'rgba(200,30,30,0.35)';
                ctx.fillRect(pit.x, pit.y, pit.w, 2);
            }
        }

        for (const pl of platforms) {
            ctx.fillStyle = pl.color; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
            if (mountainMode) {
                if (pl.isIcy) {
                    // Ice sheen: bright blue highlight + crack lines
                    ctx.fillStyle = 'rgba(150,230,255,0.55)';
                    ctx.fillRect(pl.x, pl.y, pl.w, 2);
                    ctx.strokeStyle = 'rgba(100,200,255,0.35)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(pl.x + 0.25, pl.y + 0.25, pl.w - 0.5, pl.h - 0.5);
                    // Diagonal crack detail
                    ctx.beginPath(); ctx.moveTo(pl.x + pl.w * 0.3, pl.y);
                    ctx.lineTo(pl.x + pl.w * 0.45, pl.y + pl.h); ctx.stroke();
                } else {
                    // Lava rock: orange/red edge highlight
                    ctx.fillStyle = 'rgba(255,120,20,0.30)';
                    ctx.fillRect(pl.x, pl.y, pl.w, 1);
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(pl.x, pl.y + pl.h - 1, pl.w, 1);
                }
            } else if (isMaze) {
                // Purple mirror sheen on top
                ctx.fillStyle = 'rgba(190,80,255,0.55)';
                ctx.fillRect(pl.x, pl.y, pl.w, 1);
                ctx.fillStyle = 'rgba(120,40,200,0.20)';
                ctx.fillRect(pl.x, pl.y + 1, pl.w, 1);
                // Edge outline so walls read against dark background
                ctx.strokeStyle = 'rgba(90,30,160,0.60)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(pl.x + 0.25, pl.y + 0.25, pl.w - 0.5, pl.h - 0.5);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pl.x, pl.y, pl.w, 1);
                ctx.fillStyle = 'rgba(0,0,0,0.30)';       ctx.fillRect(pl.x, pl.y + pl.h - 1, pl.w, 1);
            }
        }

        // Room dividers
        const divTop = isMaze ? worldMinY : 0;
        const divBot = isMaze ? worldMinY + worldH : H;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
        for (let r = 1; r < NUM_ROOMS; r++) {
            ctx.beginPath();
            ctx.moveTo(r * ROOM_W, divTop);
            ctx.lineTo(r * ROOM_W, divBot);
            ctx.stroke();
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

        // Ghost AI agents
        if (aiEnabled && aiGhosts.length > 0) {
            ctx.globalAlpha = 0.20;
            for (const gh of aiGhosts) {
                ctx.fillStyle = '#44ff88';
                ctx.fillRect(gh.p.x, gh.p.y, gh.p.w, gh.p.h);
            }
            ctx.globalAlpha = 1;
        }

        // Race AI player — orange blinking rectangle
        if (raceMode && raceAIPlayer && !raceAIDone) {
            const blink = Math.sin(performance.now() / 160) > 0;
            ctx.globalAlpha = 0.82;
            ctx.fillStyle = blink ? '#ff6622' : '#ff8844';
            ctx.fillRect(raceAIPlayer.x, raceAIPlayer.y, raceAIPlayer.w, raceAIPlayer.h);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffddaa'; ctx.font = '5px monospace';
            ctx.fillText('AI', raceAIPlayer.x, raceAIPlayer.y - 2);
        }

        // Player 2 — magenta
        if (raceMode && p2Active && player2 && !p2Done) {
            ctx.globalAlpha = 0.88;
            ctx.fillStyle = '#dd44ff';
            ctx.fillRect(player2.x, player2.y, player2.w, player2.h);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffaaff'; ctx.font = '5px monospace';
            ctx.fillText('P2', player2.x, player2.y - 2);
        }

        // Online opponent — green ghost, position lerped from network snapshots
        if (onlineMode && typeof OnlineRace !== 'undefined') {
            const op = OnlineRace.opponent;
            if (op && !op.done) {
                // Lerp toward received position to smooth out packet jitter
                opLerpX += (op.x - opLerpX) * 0.35;
                opLerpY += (op.y - opLerpY) * 0.35;
                const pw = 8, ph = 11; // same as CelestePlayer default size
                ctx.globalAlpha = 0.80;
                ctx.fillStyle = '#44ff99';
                ctx.fillRect(opLerpX, opLerpY, pw, ph);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#aaffcc'; ctx.font = '5px monospace';
                ctx.fillText(onlineName || 'NET', opLerpX, opLerpY - 2);
            } else if (OnlineRace.isWaiting()) {
                // Searching overlay
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(60, 70, 200, 40);
                ctx.fillStyle = '#88ffcc'; ctx.font = 'bold 8px monospace';
                ctx.fillText('Searching for opponent…', 64, 86);
                ctx.fillStyle = '#aaa'; ctx.font = '6px monospace';
                ctx.fillText('Share the game URL with a friend', 64, 98);
            }
        }

        player.draw(ctx);
        // Player label in multi-player modes
        if (raceMode && (p2Active || onlineMode)) {
            ctx.fillStyle = '#aaddff'; ctx.font = '5px monospace';
            ctx.fillText('P1', player.x, player.y - 2);
        }

        // Room number watermarks (only non-maze)
        if (!isMaze) {
            ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.font = 'bold 80px monospace';
            for (let r = 0; r < NUM_ROOMS; r++) ctx.fillText(String(r + 1), r * ROOM_W + 148, 120);
        }

        ctx.fillStyle = 'rgba(220,220,220,0.55)'; ctx.font = '6px monospace';
        for (const lbl of roomLabels) ctx.fillText(lbl.text, lbl.x, lbl.y);

        ctx.restore();

        // Screen vignette
        if (isMaze) {
            const vg = ctx.createRadialGradient(W/2, H/2, H*0.18, W/2, H/2, H*0.72);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, 'rgba(20,0,40,0.40)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        } else if (mountainMode) {
            const vg = ctx.createRadialGradient(W/2, H/2, H*0.18, W/2, H/2, H*0.72);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, 'rgba(40,10,0,0.45)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        }

        // Dash + Core state HUD (mountain mode)
        if (mountainMode) {
            const dashColor = player.Dashes > 0 ? '#ff8820' : '#664422';
            ctx.fillStyle = dashColor; ctx.font = '7px monospace';
            ctx.fillText(`DASH: ${player.Dashes}/${player.MaxDashes}`, W - 58, 10);
            if (player.Dashes === 0) {
                ctx.fillStyle = 'rgba(255,100,0,0.45)'; ctx.font = '6px monospace';
                ctx.fillText('use crystal!', W - 72, 18);
            }
            // Core state icon
            const fire = coreState === 'fire';
            const ix = W - 13, iy = 22;
            ctx.fillStyle = fire ? 'rgba(255,80,0,0.5)' : 'rgba(60,160,255,0.5)';
            ctx.fillRect(ix - 1, iy - 1, 10, 10);
            ctx.fillStyle = fire ? '#ffcc44' : '#88ddff';
            if (fire) {
                ctx.beginPath(); ctx.moveTo(ix+4, iy); ctx.lineTo(ix+8, iy+8); ctx.lineTo(ix, iy+8); ctx.closePath(); ctx.fill();
            } else {
                ctx.fillRect(ix+3, iy, 2, 8); ctx.fillRect(ix, iy+3, 8, 2);
            }
        }

        // Room transition is a pure camera pan — no overlays, no labels.

        // Key HUD (maze mode)
        if (isMaze && player.keysHeld > 0) {
            for (let k = 0; k < player.keysHeld; k++) {
                const hx = W - 14 - k * 14, hy = 5;
                ctx.globalAlpha = 0.9;
                ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(hx + 2, hy + 3, 3, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(hx + 4, hy - 1, 2, 9);
                ctx.fillRect(hx + 6, hy + 3, 3, 2);
                ctx.fillRect(hx + 6, hy + 6, 3, 2);
                ctx.globalAlpha = 1;
            }
        }

        // HUD
        const hudCol = mountainMode ? 'rgba(255,180,80,0.80)'
                     : isMaze ? 'rgba(210,150,255,0.75)' : 'rgba(255,255,255,0.50)';
        ctx.fillStyle = hudCol; ctx.font = '7px monospace';
        // Room name: prefer mazeRoomNameMap for per-cell names (maze + mountain)
        let roomDisplayName = roomNames[roomIdx] || '';
        if (isMtnOrMaze && mazeRoomNameMap) {
            const key = `${mazeRoomCol},${mazeRoomRow}`;
            if (mazeRoomNameMap[key]) roomDisplayName = mazeRoomNameMap[key];
        }
        ctx.fillText(roomDisplayName, 10, 10);
        // Progress dots: for mountain, show vertical progress (4 - mazeRoomRow = rooms climbed)
        const progressCount = mountainMode ? 5 : NUM_ROOMS;
        const progressDone  = mountainMode ? (4 - mazeRoomRow) : furthestRoom;
        for (let i = 0; i < progressCount; i++) {
            ctx.fillStyle = i <= progressDone
                ? (mountainMode ? '#ff8820' : isMaze ? '#c060ff' : '#d4af37')
                : 'rgba(255,255,255,0.20)';
            ctx.fillRect(10 + i * 12, 14, 8, 3);
        }
        if (aiEnabled && typeof NeuralAI !== 'undefined') {
            const ai = NeuralAI;
            ctx.fillStyle = '#44ff44'; ctx.font = 'bold 7px monospace';
            const aiEngine = (typeof CelesteAI !== 'undefined') ? 'C++' : 'JS';
            ctx.textAlign = 'right';
            ctx.fillText(`NEURAL AI ×${NeuralAI.N_AGENTS}  ${aiSpeedMult}x  [${aiEngine}]`, W - 2, 10);
            ctx.font = '6px monospace';
            ctx.fillText(`Gen ${ai.generation}  Run ${ai.runCount}`, W - 2, 18);
            ctx.fillText(`Fit ${(ai.globalBestFit * 100).toFixed(0)}%`, W - 2, 25);
            const bestT = ai._bestTimeMs;
            ctx.fillStyle = '#aaffaa';
            ctx.fillText(bestT < Infinity ? `FastBest ${(bestT/1000).toFixed(1)}s` : 'No finish yet', W - 2, 32);
            const stag = ai._runsSinceImproved || 0;
            ctx.fillStyle = stag >= 15 ? '#ff8844' : '#aaffaa';
            ctx.fillText(`Stag ${stag}/20`, W - 2, 39);
            ctx.textAlign = 'left';
        }

        // ── Race HUD ────────────────────────────────────────────────────────────
        if (raceMode) {
            const now     = performance.now();
            const elapsed = (racePlayerDone ? racePlayerTime : now - raceStart) / 1000;
            const panelH  = p2Active ? 50 : 42;
            ctx.fillStyle = 'rgba(0,0,0,0.58)';
            ctx.fillRect(0, 0, W, panelH);

            // Timer (P1 clock)
            ctx.fillStyle = racePlayerDone ? '#d4af37' : '#aaddff';
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`P1 ⏱ ${elapsed.toFixed(2)}s`, 6, 9);

            // P2 timer
            if (p2Active) {
                const p2Elapsed = (p2Done ? p2Time : now - raceStart) / 1000;
                ctx.fillStyle = p2Done ? '#cc88ff' : '#dd44ff';
                ctx.fillText(`P2 ⏱ ${p2Elapsed.toFixed(2)}s`, 6, 18);
            }

            // Seed
            ctx.fillStyle = 'rgba(160,160,160,0.6)';
            ctx.font = '5px monospace';
            ctx.fillText(`Seed ${raceSeed}`, 6, p2Active ? 27 : 17);

            // Checkpoint bars — three rows: P1 (blue), P2 (magenta), AI (orange)
            const cpNames = (roomNames && roomNames.length) ? roomNames : [];
            const barW = Math.floor((W - 12) / NUM_ROOMS) - 2;
            const barBase = p2Active ? 32 : 22;
            const barH = p2Active ? 5 : 7;
            for (let i = 0; i < NUM_ROOMS; i++) {
                const bx = 6 + i * (barW + 2);
                // Background
                ctx.fillStyle = 'rgba(60,60,60,0.7)'; ctx.fillRect(bx, barBase, barW, barH);
                // P1 — bottom half of bar (blue)
                if (i <= racePlayerCP) {
                    ctx.fillStyle = '#4488ff';
                    ctx.fillRect(bx, barBase + Math.ceil(barH / 2), barW, barH - Math.ceil(barH / 2));
                }
                // P2 — top third (magenta)
                if (p2Active && i <= p2CP) {
                    ctx.fillStyle = '#cc44ff';
                    const third = Math.ceil(barH / 3);
                    ctx.fillRect(bx, barBase, barW, third);
                }
                // AI — middle third (orange)
                if (i <= raceAICP) {
                    ctx.fillStyle = '#ff6622';
                    const third = Math.ceil(barH / 3);
                    ctx.fillRect(bx, barBase + third, barW, third);
                }
                // Checkpoint name
                ctx.fillStyle = 'rgba(200,200,200,0.65)';
                ctx.font = '4px monospace';
                ctx.fillText((cpNames[i] || `${i+1}`).substring(0, 10), bx, barBase + barH + 5);
            }

            // Leading indicator (top right) — includes online opponent CP
            const opCP = (onlineMode && OnlineRace.opponent) ? OnlineRace.opponent.cp : -1;
            const leaders = [];
            const allCP = [racePlayerCP, ...(p2Active ? [p2CP] : []), raceAICP, ...(onlineMode ? [opCP] : [])];
            const maxCP = Math.max(...allCP);
            if (racePlayerCP === maxCP) leaders.push('P1');
            if (p2Active && p2CP === maxCP) leaders.push('P2');
            if (raceAICP === maxCP) leaders.push('AI');
            if (onlineMode && opCP === maxCP) leaders.push(onlineName || 'NET');
            const leadStr = leaders.length >= 3 ? 'TIED'
                          : leaders.join('+') + ' LEAD';
            const lCol = leaders.includes('AI') && !leaders.includes('P1') ? '#ff8844'
                       : leaders.includes('P2') && !leaders.includes('P1') ? '#cc44ff'
                       : (onlineMode && !leaders.includes('P1')) ? '#44ff99' : '#aaddff';
            ctx.fillStyle = lCol; ctx.font = 'bold 6px monospace';
            ctx.fillText(leadStr, W - 50, 9);

            // Finish-time badges (top right, below leading)
            let badgeY = 17;
            if (raceAIDone && raceAITime !== null) {
                ctx.fillStyle = '#ff8844'; ctx.font = '5px monospace';
                ctx.fillText(`AI: ${(raceAITime/1000).toFixed(2)}s`, W - 50, badgeY); badgeY += 7;
            }
            if (p2Active && p2Done && p2Time !== null) {
                ctx.fillStyle = '#cc44ff'; ctx.font = '5px monospace';
                ctx.fillText(`P2: ${(p2Time/1000).toFixed(2)}s`, W - 50, badgeY); badgeY += 7;
            }
            if (onlineMode && OnlineRace.opponent && OnlineRace.opponent.done && OnlineRace.opponent.time != null) {
                ctx.fillStyle = '#44ff99'; ctx.font = '5px monospace';
                ctx.fillText(`${onlineName||'NET'}: ${(OnlineRace.opponent.time/1000).toFixed(2)}s`, W - 50, badgeY);
            }

            // Result overlay — show when at least one finisher is across the line
            const opDone = onlineMode && OnlineRace.opponent && OnlineRace.opponent.done;
            const anyDone = racePlayerDone || (p2Active && p2Done) || raceAIDone || opDone;
            const allDone = racePlayerDone && (!p2Active || p2Done) && raceAIDone && (!onlineMode || opDone);
            if (anyDone) {
                // Collect all times into a ranked list
                const entries = [];
                if (racePlayerDone) entries.push({ label: 'You', t: racePlayerTime, col: '#aaddff' });
                if (p2Active && p2Done) entries.push({ label: 'P2', t: p2Time, col: '#dd44ff' });
                if (raceAIDone) entries.push({ label: 'AI', t: raceAITime, col: '#ff8844' });
                if (opDone) entries.push({ label: onlineName||'Opponent', t: OnlineRace.opponent.time, col: '#44ff99' });
                entries.sort((a, b) => a.t - b.t);

                if (allDone) {
                    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(35, 55, 250, 78);
                    const winnerCol = entries[0].col;
                    const winnerTxt = entries[0].label === 'AI' ? 'AI WINS!'
                                    : entries[0].label === 'P2' ? 'P2 WINS!' : 'YOU WIN!';
                    ctx.fillStyle = winnerCol; ctx.font = 'bold 12px monospace';
                    ctx.fillText(winnerTxt, W / 2 - ctx.measureText(winnerTxt).width / 2, 73);
                    ctx.font = '7px monospace';
                    entries.forEach((e, idx) => {
                        ctx.fillStyle = e.col;
                        ctx.fillText(`${idx+1}. ${e.label}: ${(e.t/1000).toFixed(2)}s`, 55, 87 + idx * 11);
                    });
                    ctx.fillStyle = '#888'; ctx.font = '6px monospace';
                    ctx.fillText('press R for new race', 88, 87 + entries.length * 11 + 6);
                } else {
                    // At least one done but race still ongoing — small toast top centre
                    const fin = entries[0];
                    ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fillRect(80, 44, 160, 16);
                    ctx.fillStyle = fin.col; ctx.font = 'bold 7px monospace';
                    const msg = `${fin.label} finished! ${(fin.t/1000).toFixed(2)}s`;
                    ctx.fillText(msg, 84, 54);
                }
            }
        }

        if (!raceMode && won) {
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
        // ── Room transition tick (maze only) — camera slides, player frozen ────
        if (currentMode === 'maze' && RoomTrans.active) {
            RoomTrans.timer = Math.max(0, RoomTrans.timer - FIXED_DT);
            const t = 1 - RoomTrans.timer / RoomTrans.DURATION;
            // Ease in-out cubic for a smooth, weighty slide
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            cameraX = RoomTrans.fromX + (RoomTrans.toX - RoomTrans.fromX) * eased;
            cameraY = RoomTrans.fromY + (RoomTrans.toY - RoomTrans.fromY) * eased;
            if (RoomTrans.timer <= 0) {
                RoomTrans.active = false;
                mazeRoomCol = RoomTrans.pendingCol;
                mazeRoomRow = RoomTrans.pendingRow;
                cameraX = RoomTrans.toX;
                cameraY = RoomTrans.toY;
                // Mountain: refill dash on room entry (matches Celeste Core chapter feel)
                if (mountainMode) player.Dashes = player.MaxDashes;
            }
            return;
        }

        const input = readInput();

        // Capture human demo frame for imitation learning
        if (recordingActive && !aiEnabled && GOAL &&
                typeof NeuralAI !== 'undefined' && NeuralAI.readSensors) {
            const actionIdx = humanActionIndex(input);
            if (actionIdx >= 0) {
                const sensors = NeuralAI.readSensors(player, platforms, GOAL, getHazardRects());
                if (sensors) {
                    const frame = Array.from(sensors);
                    frame.push(actionIdx);
                    recordingFrames.push(frame);
                }
            }
        }

        const dynPlat = entities.filter(e => e.isSolid)
            .map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h, color: e.color || '#888' }));
        // Ice surface detection (uses previous-frame position — 1-tick delay, imperceptible)
        player.onIce = platforms.some(p => p.isIcy && playerOnTop(player, p));
        player.update(input, dynPlat.length ? platforms.concat(dynPlat) : platforms, FIXED_DT);
        for (const ent of entities) {
            if (ent.update(player, FIXED_DT) === 'kill') { player.y = DEATH_Y + 1; break; }
        }

        if (player.y <= DEATH_Y) {
            respawnRoom  = getRoomIdx();
            furthestRoom = Math.max(furthestRoom, respawnRoom);
        }
        if (currentMode === 'maze') {
            const newCol = Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player.x / ROOM_W)));
            const _rows  = Math.round(worldH / H);
            const newRow = Math.max(0, Math.min(_rows - 1, Math.floor((player.y - worldMinY) / H)));
            if (newCol !== mazeRoomCol || newRow !== mazeRoomRow) {
                RoomTrans.active = true;
                RoomTrans.timer  = RoomTrans.DURATION;
                RoomTrans.fromX  = mazeRoomCol * ROOM_W;
                RoomTrans.fromY  = worldMinY + mazeRoomRow * H;
                RoomTrans.toX    = newCol * ROOM_W;
                RoomTrans.toY    = worldMinY + newRow * H;
                RoomTrans.pendingCol  = newCol;
                RoomTrans.pendingRow  = newRow;
            } else {
                cameraX = mazeRoomCol * ROOM_W;
                cameraY = worldMinY + mazeRoomRow * H;
            }
        } else {
            const _targetX = player.x + player.w / 2 - W / 2;
            const _maxX    = NUM_ROOMS * ROOM_W - W;
            cameraX += (Math.max(0, Math.min(_maxX, _targetX)) - cameraX) * 0.12;
            const _targetY  = player.y + player.h / 2 - H / 2;
            const _camMinY  = worldMinY;
            const _camMaxY  = Math.max(_camMinY, worldMinY + worldH - H);
            cameraY += (Math.max(_camMinY, Math.min(_camMaxY, _targetY)) - cameraY) * 0.12;
        }
        transitionFlash = Math.max(0, transitionFlash - FIXED_DT);

        // Ghost agents: parallel training
        if (aiEnabled && aiGhosts.length > 0) {
            const allPlats = dynPlat.length ? platforms.concat(dynPlat) : platforms;
            const hazardRects = getHazardRects();
            for (const gh of aiGhosts) {
                const inp2 = NeuralAI.computeAgent(gh.idx, gh.p, platforms, GOAL, hazardRects);
                if (!inp2) continue;
                gh.p.update(inp2, allPlats, FIXED_DT);
                // Mountain: dash refill on room change
                if (mountainMode) {
                    const ghRow = Math.max(0, Math.floor((gh.p.y - worldMinY) / H));
                    if (ghRow !== gh.lastRow) { gh.p.Dashes = gh.p.MaxDashes; gh.lastRow = ghRow; }
                }
                // Stuck detection — position and progress checks
                if (Math.abs(gh.p.x - gh.stuckX) > 2 || Math.abs(gh.p.y - gh.stuckY) > 2) {
                    gh.stuckFrames = 0; gh.stuckX = gh.p.x; gh.stuckY = gh.p.y;
                } else { gh.stuckFrames++; }
                const ghProg = mountainMode ? -gh.p.y : gh.p.x;
                if (ghProg > gh.progressBest) { gh.progressBest = ghProg; gh.progressFrames = 0; }
                else { gh.progressFrames++; }
                if (gh.stuckFrames >= AI_STUCK_LIMIT || gh.progressFrames >= AI_PROGRESS_LIMIT) {
                    const si = closestRespawnIdx(gh.p.x, gh.p.y);
                    const rs = roomSpawns[si] || roomSpawns[0];
                    NeuralAI.killAgent(gh.idx);
                    gh.p.reset(rs.x, rs.y);
                    gh.stuckFrames = 0; gh.stuckX = rs.x; gh.stuckY = rs.y;
                    gh.progressFrames = 0; gh.progressBest = -Infinity; gh.lastRow = -1;
                    continue;
                }
                // Death
                if (gh.p.y > DEATH_Y || gh.p.y < worldMinY - 20) {
                    const si = closestRespawnIdx(gh.p.x, gh.p.y);
                    const rs = roomSpawns[si] || roomSpawns[0];
                    NeuralAI.killAgent(gh.idx);
                    gh.p.reset(rs.x, rs.y);
                    gh.stuckFrames = 0; gh.stuckX = rs.x; gh.stuckY = rs.y;
                    gh.progressFrames = 0; gh.progressBest = -Infinity; gh.lastRow = -1;
                    continue;
                }
                // Goal — feed speed fitness into the gene pool
                if (GOAL && gh.p.x < GOAL.x + GOAL.w && gh.p.x + gh.p.w > GOAL.x
                         && gh.p.y < GOAL.y + GOAL.h && gh.p.y + gh.p.h > GOAL.y) {
                    const rs = roomSpawns[0];
                    NeuralAI.goalAgent(gh.idx); // timing tracked internally in _agentStates
                    gh.p.reset(rs.x, rs.y);
                    gh.stuckFrames = 0; gh.stuckX = rs.x; gh.stuckY = rs.y;
                    gh.progressFrames = 0; gh.progressBest = -Infinity; gh.lastRow = -1;
                }
            }
        }

        // ── Race AI opponent ────────────────────────────────────────────────────
        if (raceMode && raceAIPlayer && !raceAIDone && typeof NeuralAI !== 'undefined') {
            const allPlatsR = dynPlat.length ? platforms.concat(dynPlat) : platforms;
            const hazardsR  = getHazardRects();
            const raceInp   = NeuralAI.compute(raceAIPlayer, platforms, GOAL, hazardsR);
            if (raceInp) raceAIPlayer.update(raceInp, allPlatsR, FIXED_DT);

            // Checkpoint detection for AI
            const aiRoomIdx = Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(raceAIPlayer.x / ROOM_W)));
            if (aiRoomIdx > raceAICP) raceAICP = aiRoomIdx;

            // Stuck detection
            if (Math.abs(raceAIPlayer.x - raceAIStuckX) > 2 || Math.abs(raceAIPlayer.y - raceAIStuckY) > 2) {
                raceAIStuckFrames = 0; raceAIStuckX = raceAIPlayer.x; raceAIStuckY = raceAIPlayer.y;
            } else if (++raceAIStuckFrames >= AI_STUCK_LIMIT) {
                const si = closestRespawnIdx(raceAIPlayer.x, raceAIPlayer.y);
                const rs = roomSpawns[si] || roomSpawns[0];
                raceAIPlayer.reset(rs.x, rs.y);
                raceAIStuckFrames = 0; raceAIStuckX = rs.x; raceAIStuckY = rs.y;
                raceAIProgFrames = 0;  raceAIProgBest = -Infinity;
            }
            // Progress check
            const raceAIProg = raceAIPlayer.x;
            if (raceAIProg > raceAIProgBest) { raceAIProgBest = raceAIProg; raceAIProgFrames = 0; }
            else if (++raceAIProgFrames >= AI_PROGRESS_LIMIT) {
                const si = closestRespawnIdx(raceAIPlayer.x, raceAIPlayer.y);
                const rs = roomSpawns[si] || roomSpawns[0];
                raceAIPlayer.reset(rs.x, rs.y);
                raceAIStuckFrames = 0; raceAIStuckX = rs.x; raceAIStuckY = rs.y;
                raceAIProgFrames = 0;  raceAIProgBest = -Infinity;
            }
            // Death
            if (raceAIPlayer.y > DEATH_Y) {
                const si = closestRespawnIdx(raceAIPlayer.x, raceAIPlayer.y);
                const rs = roomSpawns[si] || roomSpawns[0];
                raceAIPlayer.reset(rs.x, rs.y);
                raceAIStuckFrames = 0; raceAIStuckX = rs.x; raceAIStuckY = rs.y;
                raceAIProgFrames = 0;  raceAIProgBest = -Infinity;
            }
            // Goal — AI finishes race; feed speed fitness
            if (GOAL && raceAIPlayer.x < GOAL.x + GOAL.w && raceAIPlayer.x + raceAIPlayer.w > GOAL.x
                     && raceAIPlayer.y < GOAL.y + GOAL.h && raceAIPlayer.y + raceAIPlayer.h > GOAL.y) {
                raceAIDone = true;
                raceAITime = performance.now() - raceStart;
                raceAICP   = NUM_ROOMS - 1;
                NeuralAI.onGoal(raceAITime);
            }
        }

        // ── Player 2 update ─────────────────────────────────────────────────────
        if (raceMode && p2Active && player2 && !p2Done) {
            const p2Inp   = readInputP2();
            const allPlts = dynPlat.length ? platforms.concat(dynPlat) : platforms;
            player2.update(p2Inp, allPlts, FIXED_DT);
            // Checkpoint
            const p2Room = Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player2.x / ROOM_W)));
            if (p2Room > p2CP) p2CP = p2Room;
            // Stuck (simple position check only for human — no progress kill)
            if (Math.abs(player2.x - p2StuckX) > 2 || Math.abs(player2.y - p2StuckY) > 2) {
                p2StuckFrames = 0; p2StuckX = player2.x; p2StuckY = player2.y;
            } else { p2StuckFrames++; }
            // Death
            if (player2.y > DEATH_Y) {
                const si = closestRespawnIdx(player2.x, player2.y);
                const rs = roomSpawns[si] || roomSpawns[0];
                player2.reset(rs.x, rs.y);
                p2StuckFrames = 0; p2StuckX = rs.x; p2StuckY = rs.y;
            }
            // Goal
            if (GOAL && player2.x < GOAL.x + GOAL.w && player2.x + player2.w > GOAL.x
                     && player2.y < GOAL.y + GOAL.h && player2.y + player2.h > GOAL.y) {
                p2Done = true;
                p2Time = performance.now() - raceStart;
                p2CP   = NUM_ROOMS - 1;
                if (typeof NeuralAI !== 'undefined') NeuralAI.learnFromRoute(p2Time);
            }
        }

        // ── Race: player 1 checkpoint + finish ─────────────────────────────────
        if (raceMode) {
            const pRoomIdx = Math.max(0, Math.min(NUM_ROOMS - 1, Math.floor(player.x / ROOM_W)));
            if (pRoomIdx > racePlayerCP) racePlayerCP = pRoomIdx;
            if (!racePlayerDone && playerOverlapsGoal()) {
                racePlayerDone = true;
                racePlayerTime = performance.now() - raceStart;
                racePlayerCP   = NUM_ROOMS - 1;
                won = true; winMs = racePlayerTime;
                if (bestMs === null || winMs < bestMs) bestMs = winMs;
                // Feed player's time into AI so it learns to race at human speed
                if (typeof NeuralAI !== 'undefined') NeuralAI.learnFromRoute(racePlayerTime);
            }
        }

        if (!raceMode && !won && playerOverlapsGoal()) {
            won = true; winMs = performance.now() - runStart;
            if (bestMs === null || winMs < bestMs) bestMs = winMs;
            if (typeof NeuralAI !== 'undefined') NeuralAI.learnFromRoute(winMs);
            if (aiEnabled && typeof NeuralAI !== 'undefined') {
                NeuralAI.onGoal(winMs);
                updateAIBtn();
            }
        }
        if (player.y > DEATH_Y || player.y < worldMinY - 20) { respawn(); return; }

        // AI stuck-death: two independent kill conditions
        if (aiEnabled) {
            // 1) Position check: less than 2px movement in 1.5 s
            if (Math.abs(player.x - aiStuckLastX) > 2 || Math.abs(player.y - aiStuckLastY) > 2) {
                aiStuckFrames = 0;
                aiStuckLastX  = player.x;
                aiStuckLastY  = player.y;
            } else if (++aiStuckFrames >= AI_STUCK_LIMIT) {
                player.y = DEATH_Y + 1; return;
            }
            // 2) Progress check: no improvement toward goal in 4 s
            //    catches slow wall-slides or oscillation that pass the position check
            const prog = mountainMode ? -player.y : player.x;
            if (prog > aiProgressBest) {
                aiProgressBest   = prog;
                aiProgressFrames = 0;
            } else if (++aiProgressFrames >= AI_PROGRESS_LIMIT) {
                player.y = DEATH_Y + 1; return;
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
        // Send local player state to online opponent every frame
        if (onlineMode && typeof OnlineRace !== 'undefined' && OnlineRace.isConnected()) {
            OnlineRace.sendState(player, racePlayerCP, racePlayerDone, racePlayerTime);
        }

        const elapsed = won ? winMs : (performance.now() - runStart);
        if (raceMode) {
            const raceElapsed = (racePlayerDone ? racePlayerTime : performance.now() - raceStart) / 1000;
            let st = `RACE  P1:${raceElapsed.toFixed(2)}s cp${racePlayerCP+1}/${NUM_ROOMS}`;
            if (p2Active)    st += `  P2:cp${p2CP+1}/${NUM_ROOMS}`;
            if (onlineMode)  st += `  NET:cp${(OnlineRace.opponent ? OnlineRace.opponent.cp + 1 : 1)}/${NUM_ROOMS}`;
            st += `  AI:cp${raceAICP+1}/${NUM_ROOMS}  ${measuredFps.toFixed(0)} fps`;
            statusEl.textContent = st;
        } else {
            statusEl.textContent =
                `${roomNames[getRoomIdx()] || ''}  ` +
                `time=${(elapsed/1000).toFixed(2)}s  deaths=${deaths}  ` +
                (bestMs !== null ? `best=${(bestMs/1000).toFixed(2)}s  ` : '') +
                `${player.state}  ${measuredFps.toFixed(0)} fps` +
                (aiEnabled ? `  [AI ${aiSpeedMult}x]` : '');
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
