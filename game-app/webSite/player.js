// CelestePlayer — line-by-line port of the mechanics in
// game-app/CelesteCode/Player.cs. Method names, variable names, state
// names, and constants are kept identical to the C# source so it reads
// as a direct transcription. Each block notes the Player.cs line range
// it was ported from.
//
// Browser-only stubs (no SFX, particles, hair, ducking-corner-correct,
// holdables, swimming, dream blocks, wind, lift-boost, etc.) — those
// pieces of Player.cs depend on Monocle/MonoGame and can't run here.
// What ships is: NormalUpdate, ClimbUpdate, DashUpdate (subset),
// Jump / WallJump / ClimbJump / StartDash.
//
// Units: 1 unit = 1 pixel in the 320×180 buffer. Time in seconds.

(function (global) {

// ---- Constants (Player.cs:23–105) ------------------------------------------
const MaxFall              = 160;            // Player.cs:23
const Gravity              = 900;            // Player.cs:24
const HalfGravThreshold    = 40;             // Player.cs:25
const FastMaxFall          = 240;            // Player.cs:27
const FastMaxAccel         = 300;            // Player.cs:28

const MaxRun               = 90;             // Player.cs:30
const RunAccel             = 1000;           // Player.cs:31
const RunReduce            = 400;            // Player.cs:32
const AirMult              = 0.65;           // Player.cs:33

const DuckFriction         = 500;            // Player.cs:40

const JumpGraceTime        = 0.10;           // Player.cs:48
const JumpSpeed            = -105;           // Player.cs:49
const JumpHBoost           = 40;             // Player.cs:50
const VarJumpTime          = 0.20;           // Player.cs:51

const WallJumpCheckDist    = 3;              // Player.cs:56
const WallJumpForceTime    = 0.16;           // Player.cs:57
const WallJumpHSpeed       = MaxRun + JumpHBoost;  // Player.cs:58 (=130)

const WallSlideStartMax    = 20;             // Player.cs:60
const WallSlideTime        = 1.2;            // Player.cs:61

const DashSpeed            = 240;            // Player.cs:75
const EndDashSpeed         = 160;            // Player.cs:76
const EndDashUpMult        = 0.75;           // Player.cs:77
const DashTime             = 0.15;           // Player.cs:78
const DashCooldown         = 0.20;           // Player.cs:79
const DashRefillCooldown   = 0.10;           // Player.cs:80
const DashAttackTime       = 0.30;           // Player.cs:84

const ClimbMaxStamina      = 110;            // Player.cs:102
const ClimbUpCost          = 100 / 2.2;      // Player.cs:103
const ClimbStillCost       = 100 / 10;       // Player.cs:104
const ClimbJumpCost        = 110 / 4;        // Player.cs:105
const ClimbNoMoveTime      = 0.10;           // Player.cs:108
const ClimbTiredThreshold  = 20;             // Player.cs:109
const ClimbUpSpeed         = -45;            // Player.cs:110
const ClimbDownSpeed       = 80;             // Player.cs:111
const ClimbSlipSpeed       = 30;             // Player.cs:112
const ClimbAccel           = 900;            // Player.cs:113
const ClimbGrabYMult       = 0.2;            // Player.cs:114

// State ids (Player.cs:140–142)
const StNormal = 0;
const StClimb  = 1;
const StDash   = 2;

// Input.Jump.Pressed buffer time used by Celeste internally.
const JumpBufferTime = 0.08;

// ---- Sprite (12×16 pixel art; same data + palette as the real game) --------
const SPRITE_W = 12, SPRITE_H = 16;
const SPRITE_PIXELS = [
    '............',
    '...111111...',
    '..11111111..',
    '.1111111111.',
    '.1122222211.',
    '.1122252211.',
    '.1122222211.',
    '.1122222211.',
    '..22222222..',
    '..33333333..',
    '.3333333333.',
    '.3333333333.',
    '..44444444..',
    '..44444444..',
    '..44....44..',
    '..44....44..',
];
const NormalHairColor = '#ac3232';   // Player.cs:276
const UsedHairColor   = '#44b7ff';   // Player.cs:278
const PALETTE = { '1': NormalHairColor, '2': '#f0c89a', '3': '#3a6ec7', '4': '#2a2a4a', '5': '#1a1a2a' };

// Calc.Approach (Monocle helper used throughout Player.cs)
function Approach(val, target, maxMove) {
    return val > target ? Math.max(target, val - maxMove)
                        : Math.min(target, val + maxMove);
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
}

class CelestePlayer {
    constructor(x, y) {
        // Position + hitbox (normalHitbox in Player.cs:263 — 8 wide, 11 tall)
        this.x = x; this.y = y;
        this.w = 8; this.h = 11;
        this.spriteOffsetX = -2;
        this.spriteOffsetY = -5;

        // Player.cs:170–172
        this.Speed  = { X: 0, Y: 0 };
        this.Facing = 1;                 // 1 = Right, -1 = Left
        this.State  = StNormal;

        // Player.cs:182–183
        this.Dashes  = 1;
        this.MaxDashes = 1;
        this.Stamina = ClimbMaxStamina;

        // Player.cs:196–243
        this.onGround = false;
        this.wasOnGround = false;
        this.moveX = 0;
        this.jumpGraceTimer  = 0;
        this.varJumpSpeed    = 0;
        this.varJumpTimer    = 0;
        this.jumpBufferTimer = 0;
        this.forceMoveX      = 0;
        this.forceMoveXTimer = 0;
        this.dashCooldownTimer       = 0;
        this.dashRefillCooldownTimer = 0;
        this.dashAttackTimer = 0;
        this.DashDir         = { X: 0, Y: 0 };
        this.wallSlideTimer  = WallSlideTime;
        this.wallSlideDir    = 0;
        this.climbNoMoveTimer = 0;
        this.maxFall = MaxFall;
    }

    reset(x, y) {
        this.x = x; this.y = y;
        this.Speed.X = this.Speed.Y = 0;
        this.State = StNormal;
        this.Dashes = this.MaxDashes;
        this.Stamina = ClimbMaxStamina;
        this.jumpGraceTimer = this.varJumpTimer = this.jumpBufferTimer = 0;
        this.dashCooldownTimer = this.dashRefillCooldownTimer = this.dashAttackTimer = 0;
        this.DashDir.X = this.DashDir.Y = 0;
        this.forceMoveXTimer = 0;
        this.wallSlideTimer = WallSlideTime;
        this.wallSlideDir = 0;
        this.maxFall = MaxFall;
    }

    // Returns true if there is a solid `dir` pixels in the X direction.
    // Mirrors CollideCheck<Solid>(Position + Vector2.UnitX * dir) usage.
    _wallCheck(dir) {
        const probe = { x: this.x + dir, y: this.y + 1, w: this.w, h: this.h - 2 };
        for (const p of this._platforms) if (rectsOverlap(probe, p)) return true;
        return false;
    }

    // ----------------------------------------------------------------
    // Frame entry — corresponds to Player.cs:603 Update() preamble.
    // Drives shared per-tick state, then runs the active state's *Update.
    // ----------------------------------------------------------------
    update(input, platforms, dt) {
        this._platforms = platforms;
        this._input = input;

        // Player.cs:760-769 — read move input (forceMoveX overrides while timer > 0)
        if (this.forceMoveXTimer > 0) {
            this.forceMoveXTimer -= dt;
            this.moveX = this.forceMoveX;
        } else {
            this.moveX = input.moveX;
        }

        // Player.cs:787-794 — Facing follows moveX (suppress during Climb/Dash)
        if (this.moveX !== 0 && this.State !== StDash && this.State !== StClimb) {
            this.Facing = this.moveX;
        }

        // Jump buffer (Input.Jump.Pressed buffering)
        this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
        if (input.jumpPressed) this.jumpBufferTimer = JumpBufferTime;
        this._jumpPressedThisFrame = this.jumpBufferTimer > 0;

        // Player.cs:714-720 — jump grace
        if (this.onGround) {
            this.jumpGraceTimer = JumpGraceTime;
        } else if (this.jumpGraceTimer > 0) {
            this.jumpGraceTimer -= dt;
        }

        // Player.cs:724-740 — dash cooldown / refill (simplified: ground = refill)
        if (this.dashCooldownTimer > 0)      this.dashCooldownTimer -= dt;
        if (this.dashRefillCooldownTimer > 0) this.dashRefillCooldownTimer -= dt;
        else if (this.onGround && this.Dashes < this.MaxDashes) this.Dashes = this.MaxDashes;

        // Player.cs:702-707 — on ground refresh stamina
        if (this.onGround && this.State !== StClimb) {
            this.Stamina = ClimbMaxStamina;
            this.wallSlideTimer = WallSlideTime;
        }

        // Player.cs:743-744 — varJumpTimer countdown
        if (this.varJumpTimer > 0) this.varJumpTimer -= dt;

        // Player.cs:710-711 — dashAttackTimer
        if (this.dashAttackTimer > 0) this.dashAttackTimer -= dt;

        // Player.cs:682-686 — wall slide direction reset each frame
        this.wallSlideDir = 0;

        // Climb no-move timer
        if (this.climbNoMoveTimer > 0) this.climbNoMoveTimer -= dt;

        // Dispatch to the active state — Player.cs:323-325
        if      (this.State === StNormal) this.State = this.NormalUpdate(dt);
        else if (this.State === StClimb ) this.State = this.ClimbUpdate(dt);
        else if (this.State === StDash  ) this.State = this.DashUpdate(dt);

        // Player.cs:932-935 — physics step (axis-separated MoveH / MoveV)
        if (this.State !== StClimb) {
            // Climb still moves via Speed; physics path is identical here.
        }
        this._moveH(this.Speed.X * dt);
        this._moveV(this.Speed.Y * dt);

        // Update onGround for next frame (Player.cs:636-648)
        this.wasOnGround = this.onGround;
        this.onGround = this._wallCheck(0) ? false : this._isOnGround();
    }

    _isOnGround() {
        const probe = { x: this.x, y: this.y + 1, w: this.w, h: this.h };
        for (const p of this._platforms) if (rectsOverlap(probe, p)) return true;
        return false;
    }

    _moveH(amount) {
        this.x += amount;
        for (const p of this._platforms) {
            if (rectsOverlap(this, p)) {
                if (this.Speed.X > 0) this.x = p.x - this.w;
                else if (this.Speed.X < 0) this.x = p.x + p.w;
                if (this.State === StDash) this.DashDir.X = 0;
                this.Speed.X = 0;
            }
        }
    }

    _moveV(amount) {
        this.y += amount;
        for (const p of this._platforms) {
            if (rectsOverlap(this, p)) {
                if (this.Speed.Y > 0) {
                    this.y = p.y - this.h;
                    this.Speed.Y = 0;
                } else if (this.Speed.Y < 0) {
                    this.y = p.y + p.h;
                    this.Speed.Y = 0;
                    this.varJumpTimer = 0;
                }
                if (this.State === StDash) this.DashDir.Y = 0;
            }
        }
    }

    // ================================================================
    // NormalUpdate — ported from Player.cs:2784-3008.
    // Grab→Climb transition, dash start, running+friction, gravity with
    // wall-slide cap and half-grav, variable jump, jump / wall-jump.
    // ================================================================
    NormalUpdate(dt) {
        const input = this._input;

        // Player.cs:2792-2820 — Grab + climb transition
        if (input.grabHeld && !this._isTired()) {
            if (this.Speed.Y >= 0 && Math.sign(this.Speed.X) !== -this.Facing) {
                if (this._climbCheck(this.Facing)) {
                    return StClimb;
                }
            }
        }

        // Player.cs:2823-2828 — Dashing
        if (input.dashPressed && this.Dashes > 0 && this.dashCooldownTimer <= 0) {
            return this.StartDash();
        }

        // Player.cs:2879-2895 — Running and Friction (Calc.Approach toward MaxRun*moveX)
        {
            const mult = this.onGround ? 1 : AirMult;
            const max = MaxRun;
            if (Math.abs(this.Speed.X) > max && Math.sign(this.Speed.X) === this.moveX) {
                this.Speed.X = Approach(this.Speed.X, max * this.moveX, RunReduce * mult * dt);
            } else {
                this.Speed.X = Approach(this.Speed.X, max * this.moveX, RunAccel * mult * dt);
            }
        }

        // Player.cs:2897-2958 — Vertical: maxFall + wall slide + gravity
        if (!this.onGround) {
            let max = MaxFall;
            this.maxFall = Approach(this.maxFall, MaxFall, FastMaxAccel * dt);
            max = this.maxFall;

            // Wall slide — Player.cs:2932-2950
            if ((this.moveX === this.Facing || (this.moveX === 0 && input.grabHeld)) && input.moveY !== 1) {
                if (this.Speed.Y >= 0 && this.wallSlideTimer > 0
                    && this._wallCheck(this.Facing)) {
                    this.wallSlideDir = this.Facing;
                }
                if (this.wallSlideDir !== 0) {
                    // MathHelper.Lerp(MaxFall, WallSlideStartMax, t)
                    const t = this.wallSlideTimer / WallSlideTime;
                    max = MaxFall + (WallSlideStartMax - MaxFall) * t;
                    this.wallSlideTimer = Math.max(0, this.wallSlideTimer - dt);
                }
            } else {
                // recover wall-slide timer when off wall
                this.wallSlideTimer = Math.min(WallSlideTime, this.wallSlideTimer + dt);
            }

            // Half-grav near apex — Player.cs:2952
            const mult = (Math.abs(this.Speed.Y) < HalfGravThreshold && input.jumpHeld) ? 0.5 : 1;
            this.Speed.Y = Approach(this.Speed.Y, max, Gravity * mult * dt);
        }

        // Player.cs:2960-2967 — Variable jump
        if (this.varJumpTimer > 0) {
            if (input.jumpHeld) {
                this.Speed.Y = Math.min(this.Speed.Y, this.varJumpSpeed);
            } else {
                this.varJumpTimer = 0;
            }
        }

        // Player.cs:2969-3003 — Jump / WallJump
        if (this._jumpPressedThisFrame) {
            if (this.jumpGraceTimer > 0) {
                this.Jump();
            } else if (this._wallJumpCheck(1)) {
                // Right wall present → push off to the left
                if (this.Facing === 1 && input.grabHeld && this.Stamina > 0) this.ClimbJump();
                else this.WallJump(-1);
            } else if (this._wallJumpCheck(-1)) {
                if (this.Facing === -1 && input.grabHeld && this.Stamina > 0) this.ClimbJump();
                else this.WallJump(1);
            }
        }

        return StNormal;
    }

    // ================================================================
    // ClimbUpdate — distilled from Player.cs:3102-… (the full version is
    // ~370 lines with ledge-hops, wall-boosters, slipping, ice walls,
    // climb-up-anim, etc.). Browser subset: hold direction Y, drain
    // stamina, jump to release / WallJump.
    // ================================================================
    ClimbBegin() {
        // Player.cs:3056-3063
        this.Speed.X = 0;
        this.Speed.Y *= ClimbGrabYMult;
        this.wallSlideTimer = WallSlideTime;
        this.climbNoMoveTimer = ClimbNoMoveTime;
    }

    ClimbUpdate(dt) {
        const input = this._input;

        // Drop the climb if grab released, no wall, or stamina spent
        if (!input.grabHeld || !this._climbCheck(this.Facing) || this._isTired()) {
            return StNormal;
        }

        // Jump cancels into a normal/climb jump
        if (this._jumpPressedThisFrame) {
            this.ClimbJump();
            return StNormal;
        }

        // Dash from climb (StartDash uses lastAim direction, here = input)
        if (input.dashPressed && this.Dashes > 0 && this.dashCooldownTimer <= 0) {
            return this.StartDash();
        }

        // Player.cs (ClimbAccel toward ClimbUpSpeed / ClimbDownSpeed / 0)
        let target = 0;
        if (input.moveY < 0) {
            target = ClimbUpSpeed;
            if (this.climbNoMoveTimer <= 0) this.Stamina -= ClimbUpCost * dt;
        } else if (input.moveY > 0) {
            target = ClimbDownSpeed;
        } else {
            this.Stamina -= ClimbStillCost * dt;
        }
        this.Speed.Y = Approach(this.Speed.Y, target, ClimbAccel * dt);
        this.Speed.X = 0;

        return StClimb;
    }

    // ================================================================
    // DashUpdate — ported from Player.cs:3474-3546 + DashBegin from
    // DashCoroutine (Player.cs:3548-…).
    // ================================================================
    StartDash() {
        // Player.cs:DashBegin / DashCoroutine entry
        this.dashAttackTimer = DashAttackTime;
        this.dashCooldownTimer = DashCooldown;
        this.dashRefillCooldownTimer = DashRefillCooldown;
        this.Dashes--;

        let dx = this._input.moveX, dy = this._input.moveY;
        if (dx === 0 && dy === 0) dx = this.Facing;
        const len = Math.hypot(dx, dy) || 1;
        this.DashDir.X = dx / len;
        this.DashDir.Y = dy / len;
        this.Speed.X = this.DashDir.X * DashSpeed;
        this.Speed.Y = this.DashDir.Y * DashSpeed;
        if (this.DashDir.X !== 0) this.Facing = Math.sign(this.DashDir.X);
        this._dashTimer = DashTime;
        return StDash;
    }

    DashUpdate(dt) {
        // Player.cs:3502-3506 — super jump out of horizontal dash
        if (this.DashDir.Y === 0 && this._jumpPressedThisFrame && this.jumpGraceTimer > 0) {
            this.SuperJump();
            return StNormal;
        }
        // Player.cs:3526-3540 — wall jump out of dash
        if (this._jumpPressedThisFrame) {
            if (this._wallJumpCheck(1))  { this.WallJump(-1); return StNormal; }
            if (this._wallJumpCheck(-1)) { this.WallJump( 1); return StNormal; }
        }

        this._dashTimer -= dt;
        if (this._dashTimer <= 0) {
            // End of dash — drop to EndDashSpeed (Player.cs:76-77)
            this.Speed.X = this.DashDir.X * EndDashSpeed;
            this.Speed.Y = this.DashDir.Y * EndDashSpeed * (this.DashDir.Y < 0 ? EndDashUpMult : 1);
            return StNormal;
        }
        // Maintain dash velocity while in state
        this.Speed.X = this.DashDir.X * DashSpeed;
        this.Speed.Y = this.DashDir.Y * DashSpeed;
        return StDash;
    }

    // ================================================================
    // Jump / WallJump / ClimbJump — Player.cs:1660-1842
    // ================================================================
    Jump() {
        // Player.cs:1660-1693
        this.jumpGraceTimer = 0;
        this.jumpBufferTimer = 0;
        this.varJumpTimer = VarJumpTime;
        this.dashAttackTimer = 0;
        this.wallSlideTimer = WallSlideTime;

        this.Speed.X += JumpHBoost * this.moveX;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
    }

    SuperJump() {
        // Player.cs:1695-1729 (SuperJumpH = 260, SuperJumpSpeed = JumpSpeed)
        this.jumpGraceTimer = 0;
        this.jumpBufferTimer = 0;
        this.varJumpTimer = VarJumpTime;
        this.dashAttackTimer = 0;
        this.Speed.X = 260 * this.Facing;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
    }

    WallJump(dir) {
        // Player.cs:1736-1782
        this.jumpGraceTimer = 0;
        this.jumpBufferTimer = 0;
        this.varJumpTimer = VarJumpTime;
        this.dashAttackTimer = 0;
        this.wallSlideTimer = WallSlideTime;
        if (this.moveX !== 0) {
            this.forceMoveX = dir;
            this.forceMoveXTimer = WallJumpForceTime;
        }
        this.Speed.X = WallJumpHSpeed * dir;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
        this.Facing = dir;
    }

    ClimbJump() {
        // Player.cs:1813-1842
        if (!this.onGround) this.Stamina -= ClimbJumpCost;
        this.Jump();
    }

    // ----- helpers -----
    _wallJumpCheck(dir) {
        // Player.cs:WallJumpCheck — solid within WallJumpCheckDist pixels
        for (let d = 1; d <= WallJumpCheckDist; d++) {
            if (this._wallCheck(dir * d)) return true;
        }
        return false;
    }
    _climbCheck(facing) {
        return this._wallCheck(facing);  // Player.cs:ClimbCheck — solid against the facing
    }
    _isTired() {
        return this.Stamina < ClimbTiredThreshold;  // Player.cs:3027-3033
    }

    // ----- Render: 12×16 pixel sprite, 1 canvas pixel = 1 unit ---------------
    draw(ctx) {
        const sx = Math.round(this.x + this.spriteOffsetX);
        const sy = Math.round(this.y + this.spriteOffsetY);
        const flip = this.Facing < 0;
        const dashed = this.Dashes <= 0;
        ctx.save();
        if (flip) { ctx.translate(sx + SPRITE_W, sy); ctx.scale(-1, 1); }
        else      { ctx.translate(sx, sy); }
        for (let py = 0; py < SPRITE_H; py++) {
            const row = SPRITE_PIXELS[py];
            for (let px = 0; px < SPRITE_W; px++) {
                const ch = row[px];
                if (ch === '.') continue;
                ctx.fillStyle = (ch === '1' && dashed) ? UsedHairColor : PALETTE[ch];
                ctx.fillRect(px, py, 1, 1);
            }
        }
        ctx.restore();
        if (this.State === StDash) {
            ctx.fillStyle = 'rgba(150, 220, 255, 0.35)';
            ctx.fillRect(sx - 1, sy, SPRITE_W + 2, SPRITE_H);
        }
    }

    // Backward-compat helpers used by game.js
    get vx() { return this.Speed.X; }
    get vy() { return this.Speed.Y; }
    get dashes() { return this.Dashes; }
    get stamina() { return this.Stamina; }
    get facing() { return this.Facing; }
    get state() {
        if (this.State === StDash) return 'dashing';
        if (this.State === StClimb) return 'climbing';
        if (this.wallSlideDir !== 0) return 'wall-slide';
        if (this.onGround) return 'grounded';
        return 'airborne';
    }
}

global.CelestePlayer = CelestePlayer;
global.CELESTE_STATES = { StNormal, StClimb, StDash };

})(typeof window !== 'undefined' ? window : globalThis);
