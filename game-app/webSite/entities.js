// entities.js — Interactive game entities for the JS Celeste platformer.
// Each factory returns a plain object with update(player, dt) / draw(ctx) / reset().
// Entities with isSolid=true are included in the platform list passed to the player.

(function (global) {

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

// ── Spring ────────────────────────────────────────────────────────────────
// orientation: 'floor' | 'wallLeft' | 'wallRight'
function makeSpring(x, y, orientation) {
    orientation = orientation || 'floor';
    const isFloor = orientation === 'floor';
    const w = isFloor ? 16 : 6;
    const h = isFloor ? 6  : 16;
    const ent = {
        type: 'spring', orientation,
        x: isFloor ? x - 8 : (orientation === 'wallRight' ? x - 6 : x),
        y: isFloor ? y - 6 : y - 8,
        w, h, isSolid: false,
        _cooldown: 0,
        reset() { this._cooldown = 0; },
        update(player, dt) {
            this._cooldown = Math.max(0, this._cooldown - dt);
            if (this._cooldown > 0 || !rectsOverlap(player, this)) return;
            if (orientation === 'floor' && player.Speed.Y >= 0) {
                player.Speed.Y = -240;
                player.Dashes  = player.MaxDashes;
                player.AutoJump = false;
                player.jumpGraceTimer = 0;
                this._cooldown = 0.4;
            } else if (orientation === 'wallLeft' && player.Speed.X <= 0) {
                player.Speed.X = 220;
                player.Speed.Y = Math.min(player.Speed.Y, -80);
                player.Dashes  = player.MaxDashes;
                this._cooldown = 0.4;
            } else if (orientation === 'wallRight' && player.Speed.X >= 0) {
                player.Speed.X = -220;
                player.Speed.Y = Math.min(player.Speed.Y, -80);
                player.Dashes  = player.MaxDashes;
                this._cooldown = 0.4;
            }
        },
        draw(ctx) {
            ctx.fillStyle = '#38c038';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.fillStyle = '#60e060';
            if (isFloor) ctx.fillRect(this.x + 2, this.y, this.w - 4, 2);
            else {
                const tipX = orientation === 'wallLeft' ? this.x + this.w - 2 : this.x;
                ctx.fillRect(tipX, this.y + 2, 2, this.h - 4);
            }
        }
    };
    return ent;
}

// ── Bumper ────────────────────────────────────────────────────────────────
function makeBumper(cx, cy) {
    const r = 12;
    return {
        type: 'bumper', cx, cy, r,
        x: cx - r, y: cy - r, w: r * 2, h: r * 2,
        isSolid: false, _cooldown: 0,
        reset() { this._cooldown = 0; },
        update(player, dt) {
            this._cooldown = Math.max(0, this._cooldown - dt);
            if (this._cooldown > 0) return;
            const px = player.x + player.w * 0.5;
            const py = player.y + player.h * 0.5;
            const dx = px - this.cx, dy = py - this.cy;
            if (Math.hypot(dx, dy) > this.r + 8) return;
            const len = Math.hypot(dx, dy) || 1;
            player.Speed.X = (dx / len) * 260;
            player.Speed.Y = (dy / len) * 260;
            player.Dashes  = player.MaxDashes;
            this._cooldown = 0.5;
        },
        draw(ctx) {
            ctx.fillStyle = '#d8c820';
            ctx.beginPath();
            ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.arc(this.cx, this.cy, this.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// ── DashCrystal ───────────────────────────────────────────────────────────
function makeDashCrystal(x, y) {
    return {
        type: 'dashCrystal',
        x: x - 5, y: y - 5, w: 10, h: 10,
        isSolid: false, _active: true, _respawn: 0,
        reset() { this._active = true; this._respawn = 0; },
        update(player, dt) {
            if (!this._active) {
                this._respawn -= dt;
                if (this._respawn <= 0) this._active = true;
                return;
            }
            if (!rectsOverlap(player, this) || player.Dashes >= player.MaxDashes) return;
            player.Dashes = player.MaxDashes;
            this._active  = false;
            this._respawn = 2.5;
        },
        draw(ctx) {
            if (!this._active) return;
            const cx = this.x + 5, cy = this.y + 5, r = 5;
            ctx.fillStyle = '#28ccd8';
            ctx.beginPath();
            ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
            ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath();
            ctx.arc(cx, cy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// ── SpikeHazard ───────────────────────────────────────────────────────────
// dir: 'up' | 'down' | 'left' | 'right'
function makeSpike(x, y, size, dir) {
    dir = dir || 'up';
    const isVert = dir === 'up' || dir === 'down';
    const w = isVert ? size : 4;
    const h = isVert ? 4    : size;
    return {
        type: 'spike', dir,
        x: x + (dir === 'left' ? -4 : 0),
        y: y + (dir === 'up'   ? -4 : 0),
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
            ctx.fillStyle = '#c02828';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            const n = Math.max(1, Math.round((isVert ? w : h) / 8));
            ctx.fillStyle = '#e04040';
            for (let i = 0; i < n; i++) {
                if (dir === 'up') {
                    const tx = this.x + i * 8 + 4;
                    ctx.beginPath();
                    ctx.moveTo(tx - 3, this.y + 4); ctx.lineTo(tx, this.y - 2); ctx.lineTo(tx + 3, this.y + 4);
                    ctx.closePath(); ctx.fill();
                } else if (dir === 'down') {
                    const tx = this.x + i * 8 + 4;
                    ctx.beginPath();
                    ctx.moveTo(tx - 3, this.y); ctx.lineTo(tx, this.y + 6); ctx.lineTo(tx + 3, this.y);
                    ctx.closePath(); ctx.fill();
                } else if (dir === 'left') {
                    const ty = this.y + i * 8 + 4;
                    ctx.beginPath();
                    ctx.moveTo(this.x + 4, ty - 3); ctx.lineTo(this.x - 2, ty); ctx.lineTo(this.x + 4, ty + 3);
                    ctx.closePath(); ctx.fill();
                } else {
                    const ty = this.y + i * 8 + 4;
                    ctx.beginPath();
                    ctx.moveTo(this.x, ty - 3); ctx.lineTo(this.x + 6, ty); ctx.lineTo(this.x, ty + 3);
                    ctx.closePath(); ctx.fill();
                }
            }
        }
    };
}

// ── EnticeBlade ───────────────────────────────────────────────────────────
// config: { path:'circular', cx, cy, radius, startAngle, speed }
//      or { path:'linear',   ax, ay, bx, by, speed }
function makeEnticeBlade(config) {
    const ent = {
        type: 'blade', isSolid: false,
        x: 0, y: 0, w: 12, h: 12,
        _initConfig: JSON.parse(JSON.stringify(config)),
        reset() {
            const c = this._initConfig;
            if (c.path === 'circular') {
                this._angle = c.startAngle || 0;
            } else {
                this._t = 0; this._tdir = 1;
            }
        }
    };
    if (config.path === 'circular') {
        ent._angle  = config.startAngle || 0;
        ent._cx     = config.cx;
        ent._cy     = config.cy;
        ent._radius = config.radius;
        ent._speed  = config.speed || Math.PI;
        ent.update  = function (player, dt) {
            this._angle += this._speed * dt;
            this.x = this._cx + Math.cos(this._angle) * this._radius - 6;
            this.y = this._cy + Math.sin(this._angle) * this._radius - 6;
            if (rectsOverlap(player, this)) return 'kill';
        };
    } else {
        ent._ax    = config.ax; ent._ay = config.ay;
        ent._bx    = config.bx; ent._by = config.by;
        ent._speed = config.speed || 80;
        ent._t = 0; ent._tdir = 1;
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
        ctx.fillStyle = '#d028d0';
        ctx.beginPath();
        ctx.arc(this.x + 6, this.y + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f060f0';
        ctx.beginPath();
        ctx.arc(this.x + 6, this.y + 6, 2, 0, Math.PI * 2);
        ctx.fill();
    };
    return ent;
}

// ── Strawberry ────────────────────────────────────────────────────────────
function makeStrawberry(x, y) {
    return {
        type: 'strawberry',
        x: x - 6, y: y - 6, w: 12, h: 12,
        isSolid: false, _collected: false,
        reset() { this._collected = false; },
        update(player, dt) {
            if (this._collected) return;
            if (rectsOverlap(player, this)) this._collected = true;
        },
        draw(ctx) {
            if (this._collected) return;
            const cx = this.x + 6, cy = this.y + 7;
            ctx.fillStyle = '#d84070';
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#38a028';
            ctx.fillRect(cx - 1, this.y - 1, 2, 5);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
        }
    };
}

// ── Key ───────────────────────────────────────────────────────────────────
// Pass a lock reference so the key can open it on collection.
function makeKey(x, y, lock) {
    return {
        type: 'key',
        x: x - 6, y: y - 6, w: 12, h: 12,
        isSolid: false, _collected: false, _lock: lock,
        reset() { this._collected = false; },
        update(player, dt) {
            if (this._collected || !rectsOverlap(player, this)) return;
            this._collected = true;
            if (this._lock) this._lock._open();
        },
        draw(ctx) {
            if (this._collected) return;
            const cx = this.x + 6, cy = this.y + 6;
            ctx.fillStyle = '#d8c020';
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#d8c020';
            ctx.fillRect(cx + 3, cy - 1, 5, 2);
            ctx.fillRect(cx + 6, cy + 1, 2, 2);
        }
    };
}

// ── Lock ──────────────────────────────────────────────────────────────────
function makeLock(x, y, w, h) {
    return {
        type: 'lock',
        x, y, w, h, isSolid: true, _isOpen: false,
        _open() { this._isOpen = true; this.isSolid = false; },
        reset() { this._isOpen = false; this.isSolid = true; },
        update(player, dt) {},
        draw(ctx) {
            if (this._isOpen) return;
            ctx.fillStyle = '#6a4010';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = '#9a6020'; ctx.lineWidth = 1.5;
            const mx = this.x + this.w / 2, my = this.y + this.h / 2;
            ctx.beginPath(); ctx.arc(mx, my - 3, 4, Math.PI, 0); ctx.stroke();
            ctx.fillStyle = '#9a6020';
            ctx.fillRect(mx - 4, my - 3, 8, 7);
        }
    };
}

// ── DashBlock ─────────────────────────────────────────────────────────────
function makeDashBlock(x, y, w, h) {
    return {
        type: 'dashBlock',
        x, y, w, h, isSolid: true, _broken: false, _respawn: 0,
        reset() { this._broken = false; this.isSolid = true; this._respawn = 0; },
        update(player, dt) {
            if (this._broken) {
                this._respawn -= dt;
                if (this._respawn <= 0) { this._broken = false; this.isSolid = true; }
                return;
            }
            if (!rectsOverlap(player, this) || !isDashing(player)) return;
            this._broken = true; this.isSolid = false; this._respawn = 3.0;
        },
        draw(ctx) {
            if (this._broken) return;
            ctx.fillStyle = '#d07828';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(this.x, this.y, this.w, 1);
            // crack lines
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(this.x + this.w * 0.3, this.y);
            ctx.lineTo(this.x + this.w * 0.5, this.y + this.h);
            ctx.moveTo(this.x + this.w * 0.7, this.y);
            ctx.lineTo(this.x + this.w * 0.6, this.y + this.h);
            ctx.stroke();
        }
    };
}

// ── CrumbleBlock ──────────────────────────────────────────────────────────
function makeCrumbleBlock(x, y, w) {
    return {
        type: 'crumbleBlock',
        x, y, w, h: 8, isSolid: true,
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
            ctx.fillStyle = '#b89050';
            ctx.fillRect(this.x + shake, this.y, this.w, this.h);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(this.x + shake, this.y, this.w, 1);
            // segment cracks
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5;
            for (let i = 1; i < Math.round(this.w / 16); i++) {
                const lx = this.x + i * 16 + shake;
                ctx.beginPath(); ctx.moveTo(lx, this.y); ctx.lineTo(lx, this.y + 8); ctx.stroke();
            }
        }
    };
}

// ── TouchSwitch ───────────────────────────────────────────────────────────
// onActivate: callback fired when THIS switch is stepped on
function makeTouchSwitch(x, y, onActivate) {
    return {
        type: 'touchSwitch',
        x: x - 8, y: y - 8, w: 16, h: 16,
        isSolid: false, _activated: false,
        _onActivate: onActivate,
        reset() { this._activated = false; },
        update(player, dt) {
            if (this._activated || !rectsOverlap(player, this)) return;
            this._activated = true;
            if (this._onActivate) this._onActivate();
        },
        draw(ctx) {
            ctx.fillStyle = this._activated ? '#38b0b0' : '#186060';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.fillStyle = this._activated ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.arc(this.x + 8, this.y + 8, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// ── TouchSwitchGate ───────────────────────────────────────────────────────
function makeTouchSwitchGate(x, y, w, h) {
    return {
        type: 'touchSwitchGate',
        x, y, w, h, isSolid: true, _open: false,
        openGate() { this._open = true; this.isSolid = false; },
        reset() { this._open = false; this.isSolid = true; },
        update(player, dt) {},
        draw(ctx) {
            if (this._open) return;
            ctx.fillStyle = '#1a5050';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.fillStyle = 'rgba(56,176,176,0.35)';
            ctx.fillRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
        }
    };
}

// ── BlueTorch ─────────────────────────────────────────────────────────────
// onLit: callback fired when this torch is lit
function makeBlueTorch(x, y, onLit) {
    return {
        type: 'blueTorch',
        x: x - 4, y: y - 20, w: 8, h: 20,
        isSolid: false, _lit: false,
        _onLit: onLit, _emberTimer: 0,
        reset() { this._lit = false; this._emberTimer = 0; },
        update(player, dt) {
            if (this._lit) return;
            if (!rectsOverlap(player, this)) return;
            this._lit = true;
            if (this._onLit) this._onLit();
        },
        draw(ctx) {
            // Pole
            ctx.fillStyle = '#4a3010';
            ctx.fillRect(this.x + 2, this.y + 6, 4, this.h - 6);
            // Flame
            if (this._lit) {
                ctx.fillStyle = '#3070e0';
                ctx.beginPath();
                ctx.arc(this.x + 4, this.y + 4, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.save();
                const grd = ctx.createRadialGradient(
                    this.x + 4, this.y + 4, 1,
                    this.x + 4, this.y + 4, 16);
                grd.addColorStop(0, 'rgba(60,120,255,0.35)');
                grd.addColorStop(1, 'rgba(60,120,255,0)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(this.x + 4, this.y + 4, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = '#203060';
                ctx.beginPath();
                ctx.arc(this.x + 4, this.y + 4, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };
}

// ── FallingBlock ──────────────────────────────────────────────────────────
function makeFallingBlock(x, y, w, h) {
    const startY = y;
    return {
        type: 'fallingBlock',
        x, y, w, h, isSolid: true,
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
                // Kill player if they're inside the block after it moves
                if (rectsOverlap(player, this)) return 'kill';
                // Stop at death zone
                if (this.y > 220) { this._state = 'landed'; this.isSolid = false; }
            }
        },
        draw(ctx) {
            if (this._state === 'landed') return;
            const shake = this._state === 'shaking' ? (Math.random() - 0.5) * 1.5 : 0;
            ctx.fillStyle = '#c05830';
            ctx.fillRect(this.x + shake, this.y, this.w, this.h);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(this.x + shake, this.y, this.w, 1);
        }
    };
}

// ── Golden Strawberry ─────────────────────────────────────────────────────
function makeGoldenStrawberry(x, y) {
    return {
        type: 'goldenStrawberry',
        x: x - 7, y: y - 7, w: 14, h: 14,
        isSolid: false, _collected: false,
        _pulse: 0,
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
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#d4af37';
            ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f0d060';
            ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // Star sparkle
            ctx.fillStyle = 'rgba(255,215,0,0.4)';
            ctx.beginPath(); ctx.arc(cx, cy, 11 + 2 * Math.sin(this._pulse), 0, Math.PI * 2); ctx.fill();
        }
    };
}

// ── Export ────────────────────────────────────────────────────────────────
global.Entities = {
    makeSpring, makeBumper, makeDashCrystal, makeSpike, makeEnticeBlade,
    makeStrawberry, makeKey, makeLock, makeDashBlock, makeCrumbleBlock,
    makeTouchSwitch, makeTouchSwitchGate, makeBlueTorch,
    makeFallingBlock, makeGoldenStrawberry,
};

})(typeof window !== 'undefined' ? window : globalThis);
