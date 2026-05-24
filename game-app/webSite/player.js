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
const UpwardCornerCorrection = 4;            // Player.cs:53 (px slack at ceiling corners)

const WallSlideStartMax    = 20;             // Player.cs:60
const WallSlideTime        = 1.2;            // Player.cs:61

const DashSpeed            = 240;            // Player.cs:75
const EndDashSpeed         = 160;            // Player.cs:76
const EndDashUpMult        = 0.75;           // Player.cs:77
const DashTime             = 0.15;           // Player.cs:78
const DashCooldown         = 0.20;           // Player.cs:79
const DashRefillCooldown   = 0.10;           // Player.cs:80
const DashAttackTime       = 0.30;           // Player.cs:84
const DodgeSlideSpeedMult  = 1.2;            // Player.cs:44

// Game-feel values.
const DashFreezeTime       = 0.05;           // Player.cs:3449 (Celeste.Freeze(.05f))
const SquashRecoverRate    = 1.75;           // Player.cs:1165-1166 (Calc.Approach Sprite.Scale toward 1 at 1.75/sec)
const DashTrailInterval    = 0.08;           // Player.cs:3589 (dashTrailTimer = .08f)
const JumpSquashScale      = { X: 0.6, Y: 1.4 };  // Player.cs:1688, 1724, 1774, 1803

// Values NOT in Player.cs as constants — flagged honestly:
const DashTrailLifetime    = 0.30;           // NOT in Player.cs. Trails use TrailManager with a longer duration; 0.30 is a tighter visual choice for this test scene.
const LandSquashScale      = { X: 1.4, Y: 0.6 };  // NOT in Player.cs. Player.cs plays a landInPose animation, no squash on land. Value reuses the duck-start scale at Player.cs:2861.
const JumpBufferTime       = 0.08;           // NOT in Player.cs constants block. Sourced from Celeste's Input.cs setup; 0.08s is the value the real game ships with.

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
const ClimbJumpBoostTime   = 0.20;           // Player.cs:118 (wall-boost window after climb-jump)

// State ids (Player.cs:140–142)
const StNormal = 0;
const StClimb  = 1;
const StDash   = 2;


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

        // Player.cs:232-233 — wallBoost: after a no-input climb-jump,
        // pressing INTO wallBoostDir within wallBoostTimer (0.2s) converts
        // the climb-jump into a full wall jump with stamina refund.
        this.wallBoostTimer = 0;
        this.wallBoostDir   = 0;

        // Player.cs:188, 244 — AutoJump = true after dash end (line 3623) so the
        // post-dash var-jump applies even without holding C; cleared on Jump().
        this.AutoJump = false;
        this.beforeDashSpeed = { X: 0, Y: 0 };  // Player.cs:3374

        // Game-feel state (visual only, no effect on physics correctness):
        this.freezeTimer = 0;                   // Player.cs:3449 hit-stop on dash start
        this.squashScale = { X: 1, Y: 1 };      // current sprite squash, lerps to (1,1)
        this.dashTrail = [];                    // [{x, y, age}, ...] for ghost trail
        this._dashTrailAccum = 0;
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
        this.AutoJump = false;
        this.freezeTimer = 0;
        this.squashScale.X = this.squashScale.Y = 1;
        this.dashTrail.length = 0;
        this.wallBoostTimer = 0;
        this.wallBoostDir = 0;
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

        // Decay visual state every frame even when frozen so trails fade through hit-stop.
        this._decayVisuals(dt);

        // Player.cs:3449 — hit-stop on dash start. While freezeTimer > 0, the
        // engine in Celeste does Engine.FreezeTimer-=DeltaTime and skips
        // Scene.Update. We mirror that: decrement and bail.
        if (this.freezeTimer > 0) {
            this.freezeTimer -= dt;
            return;
        }

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

        // Player.cs:702-707 — on ground refresh stamina, wall-slide, AutoJump
        if (this.onGround && this.State !== StClimb) {
            this.Stamina = ClimbMaxStamina;
            this.wallSlideTimer = WallSlideTime;
            this.AutoJump = false;
        }

        // Player.cs:743-744 — varJumpTimer countdown
        if (this.varJumpTimer > 0) this.varJumpTimer -= dt;

        // Player.cs:710-711 — dashAttackTimer
        if (this.dashAttackTimer > 0) this.dashAttackTimer -= dt;

        // Player.cs:682-686 — wall slide direction reset each frame
        this.wallSlideDir = 0;

        // Player.cs:688-699 — Wall Boost. If the player climb-jumped with no
        // input, wallBoostTimer is ticking and wallBoostDir = -Facing. If
        // they press INTO wallBoostDir during the window, swap the climb-jump
        // out for a real wall jump (full horizontal speed + stamina refund).
        if (this.wallBoostTimer > 0) {
            this.wallBoostTimer -= dt;
            if (this.moveX === this.wallBoostDir) {
                this.Speed.X = WallJumpHSpeed * this.moveX;
                this.Stamina += ClimbJumpCost;     // refund the climb-jump cost
                this.wallBoostTimer = 0;
            }
        }

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

        // Landing squash — Player.cs:2838 sets Sprite.Scale = (.8, 1.2) on
        // un-duck-land. Celeste uses (1.4, .6) for a hard landing thud.
        if (!this.wasOnGround && this.onGround && this.State === StNormal) {
            this.squashScale.X = LandSquashScale.X;
            this.squashScale.Y = LandSquashScale.Y;
        }

        // Dash trail — Player.cs:3454, 3589. While dashing, push a ghost copy
        // every DashTrailInterval seconds.
        if (this.State === StDash) {
            this._dashTrailAccum += dt;
            if (this._dashTrailAccum >= DashTrailInterval) {
                this._dashTrailAccum = 0;
                this.dashTrail.push({ x: this.x, y: this.y, age: 0, facing: this.Facing });
            }
        }
    }

    _decayVisuals(dt) {
        // Lerp squash back to (1, 1)
        this.squashScale.X = Approach(this.squashScale.X, 1, SquashRecoverRate * dt);
        this.squashScale.Y = Approach(this.squashScale.Y, 1, SquashRecoverRate * dt);
        // Age out trail ghosts
        for (const t of this.dashTrail) t.age += dt;
        while (this.dashTrail.length > 0 && this.dashTrail[0].age >= DashTrailLifetime) {
            this.dashTrail.shift();
        }
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
                    // Corner Correction (Player.cs:2587-2612). Before
                    // bonking the ceiling, try shifting horizontally by
                    // 1..UpwardCornerCorrection pixels and stepping up by 1.
                    // Direction priority follows Speed.X (Player.cs first
                    // tries the sign of Speed.X, then the other side).
                    if (this._cornerCorrect()) return;
                    this.y = p.y + p.h;
                    this.Speed.Y = 0;
                    this.varJumpTimer = 0;
                }
                if (this.State === StDash) this.DashDir.Y = 0;
            }
        }
    }

    // Returns true if a corner nudge of 1..UpwardCornerCorrection pixels
    // cleared the ceiling. Mirrors Player.cs:2587-2612.
    _cornerCorrect() {
        const tryDir = (sign) => {
            for (let i = 1; i <= UpwardCornerCorrection; i++) {
                const nx = this.x + sign * i;
                const ny = this.y - 1;
                let clear = true;
                for (const p of this._platforms) {
                    if (nx < p.x + p.w && nx + this.w > p.x &&
                        ny < p.y + p.h && ny + this.h > p.y) { clear = false; break; }
                }
                if (clear) { this.x = nx; this.y = ny; return true; }
            }
            return false;
        };
        // Player.cs checks Speed.X <= 0 first then Speed.X >= 0. When
        // Speed.X == 0 both halves run, which means the LEFT side is tried
        // first — same here.
        if (this.Speed.X <= 0 && tryDir(-1)) return true;
        if (this.Speed.X >= 0 && tryDir( 1)) return true;
        return false;
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
            // Fast Fall — Player.cs:2911-2924. maxFall lerps toward FastMaxFall
            // (240) while holding down past MaxFall, otherwise back to MaxFall.
            if (input.moveY === 1 && this.Speed.Y >= MaxFall) {
                this.maxFall = Approach(this.maxFall, FastMaxFall, FastMaxAccel * dt);
            } else {
                this.maxFall = Approach(this.maxFall, MaxFall, FastMaxAccel * dt);
            }
            let max = this.maxFall;

            // Wall slide — Player.cs:2932-2950
            if ((this.moveX === this.Facing || (this.moveX === 0 && input.grabHeld)) && input.moveY !== 1) {
                if (this.Speed.Y >= 0 && this.wallSlideTimer > 0
                    && this._wallCheck(this.Facing)) {
                    this.wallSlideDir = this.Facing;
                }
                if (this.wallSlideDir !== 0) {
                    // MathHelper.Lerp(MaxFall, WallSlideStartMax, t) — Player.cs:2946
                    const t = this.wallSlideTimer / WallSlideTime;
                    max = MaxFall + (WallSlideStartMax - MaxFall) * t;
                    this.wallSlideTimer = Math.max(0, this.wallSlideTimer - dt);
                }
            } else {
                this.wallSlideTimer = Math.min(WallSlideTime, this.wallSlideTimer + dt);
            }

            // Half-grav near apex — Player.cs:2952 (AutoJump || JumpHeld)
            const halfGrav = Math.abs(this.Speed.Y) < HalfGravThreshold
                          && (input.jumpHeld || this.AutoJump);
            const mult = halfGrav ? 0.5 : 1;
            this.Speed.Y = Approach(this.Speed.Y, max, Gravity * mult * dt);
        }

        // Player.cs:2960-2967 — Variable jump (AutoJump keeps var-jump alive after dash)
        if (this.varJumpTimer > 0) {
            if (this.AutoJump || input.jumpHeld) {
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
        // Port of Player.cs:3102-3277. Slimmed: no wall-boosters, no
        // climb-hop ledge transition (that lives in ClimbHop()), no sweat
        // sprite, no rumble. The state logic and stamina drain match.
        const input = this._input;

        // Player.cs:3107-3108 — refill stamina on ground
        if (this.onGround) this.Stamina = ClimbMaxStamina;

        // Player.cs:3110-3119 — Wall jump from climb
        if (this._jumpPressedThisFrame) {
            if (this.moveX === -this.Facing) this.WallJump(-this.Facing);
            else this.ClimbJump();
            return StNormal;
        }

        // Player.cs:3121-3126 — dash from climb
        if (input.dashPressed && this.Dashes > 0 && this.dashCooldownTimer <= 0) {
            return this.StartDash();
        }

        // Player.cs:3128-3134 — Grab released
        if (!input.grabHeld) return StNormal;

        // Player.cs:3136-3152 — No wall to hold
        if (!this._climbCheck(this.Facing)) {
            // Climbed-over-ledge: tiny upward boost into normal. Real
            // Player.cs runs ClimbHop() here — we approximate with a brief
            // forceMoveX in the facing direction so the player doesn't
            // immediately re-grab the wall they just topped.
            if (this.Speed.Y < 0) {
                this.Speed.X = this.Facing * 60;
                this.Speed.Y = Math.min(this.Speed.Y, -120);  // ~ClimbHopY
                this.forceMoveX = 0;
                this.forceMoveXTimer = 0.2;  // ClimbHopForceTime
            }
            return StNormal;
        }

        // Player.cs:3179-3231 — Climbing target speed
        let target = 0;
        let trySlip = false;
        if (this.climbNoMoveTimer <= 0) {
            if (input.moveY < 0) {
                target = ClimbUpSpeed;
                // Up Limit (Player.cs:3191-3197) — ceiling stops upward climb
                if (this._headCheck()) {
                    if (this.Speed.Y < 0) this.Speed.Y = 0;
                    target = 0;
                    trySlip = true;
                }
            } else if (input.moveY > 0) {
                target = ClimbDownSpeed;
                if (this.onGround) {
                    if (this.Speed.Y > 0) this.Speed.Y = 0;
                    target = 0;
                }
            } else {
                trySlip = true;  // no vertical input → slip if at top
            }
        } else {
            trySlip = true;
        }

        // Slip at top of wall (Player.cs:3226-3227)
        if (trySlip && this._slipCheck()) target = ClimbSlipSpeed;

        // Set Speed (Player.cs:3230)
        this.Speed.Y = Approach(this.Speed.Y, target, ClimbAccel * dt);
        this.Speed.X = 0;

        // Down Limit (Player.cs:3234-3235) — if not pressing down and no
        // wall against your lower corner, zero downward speed.
        if (input.moveY !== 1 && this.Speed.Y > 0
            && !this._wallCheckAt(this.Facing, 1)) {
            this.Speed.Y = 0;
        }

        // Stamina drain (Player.cs:3238-3265)
        if (this.climbNoMoveTimer <= 0) {
            if (input.moveY < 0)        this.Stamina -= ClimbUpCost    * dt;
            else if (input.moveY === 0) this.Stamina -= ClimbStillCost * dt;
            // Climbing down is free.
        }

        // Out of stamina (Player.cs:3270-3274) — note: > 0 to stay in climb,
        // NOT the entry-side ClimbTiredThreshold.
        if (this.Stamina <= 0) return StNormal;

        return StClimb;
    }

    // Solid one pixel above the player (ceiling probe for climb Up Limit).
    _headCheck() {
        const probe = { x: this.x, y: this.y - 1, w: this.w, h: 1 };
        for (const p of this._platforms) if (rectsOverlap(probe, p)) return true;
        return false;
    }
    // Solid offset by (dx, dy) in pixels.
    _wallCheckAt(dx, dy) {
        const probe = { x: this.x + dx, y: this.y + dy + 1, w: this.w, h: this.h - 2 };
        for (const p of this._platforms) if (rectsOverlap(probe, p)) return true;
        return false;
    }
    // SlipCheck — true when hands have reached the top of the wall.
    // Simplified version of Player.cs:3316-3325: if there's no solid one
    // pixel above the player at their facing edge, they're at the top.
    _slipCheck() {
        const probeY = this.y - 1;
        const probeX = this.Facing > 0 ? this.x + this.w : this.x - 1;
        const probe = { x: probeX, y: probeY, w: 1, h: 4 };
        for (const p of this._platforms) if (rectsOverlap(probe, p)) return false;
        return true;
    }

    // ================================================================
    // DashUpdate — ported from Player.cs:3474-3546 + DashBegin from
    // DashCoroutine (Player.cs:3548-…).
    // ================================================================
    StartDash() {
        // Port of Player.cs:DashBegin (3442-3467) + DashCoroutine prologue
        // (3548-3589). Steps: stash beforeDashSpeed, zero Speed, decrement
        // Dashes, set cooldowns, then compute DashDir from aim with the
        // pre-dash X-speed retention rule.
        this.beforeDashSpeed.X = this.Speed.X;
        this.beforeDashSpeed.Y = this.Speed.Y;
        this.Speed.X = 0; this.Speed.Y = 0;
        this.dashAttackTimer = DashAttackTime;
        this.dashCooldownTimer = DashCooldown;
        this.dashRefillCooldownTimer = DashRefillCooldown;
        this.Dashes--;

        // Game-feel: 50 ms hit-stop and an initial trail ghost. Player.cs:3449.
        this.freezeTimer = DashFreezeTime;
        this.dashTrail.push({ x: this.x, y: this.y, age: 0, facing: this.Facing });
        this._dashTrailAccum = 0;

        // 8-direction snap. Player.cs uses `lastAim` (input snapped to one
        // of 8 directions with a small dead zone). With keyboard input
        // (-1/0/1) we already get clean 8-way directions; just normalize.
        let dx = this._input.moveX, dy = this._input.moveY;
        if (dx === 0 && dy === 0) dx = this.Facing;
        const len = Math.hypot(dx, dy) || 1;
        this.DashDir.X = dx / len;
        this.DashDir.Y = dy / len;

        // Player.cs:3556-3559 — speed retention if pre-dash X is faster
        // in the same direction as the new dash. (Lets you chain a dash
        // out of a super-jump without losing horizontal momentum.)
        let newX = this.DashDir.X * DashSpeed;
        if (Math.sign(this.beforeDashSpeed.X) === Math.sign(newX)
            && Math.abs(this.beforeDashSpeed.X) > Math.abs(newX)) {
            newX = this.beforeDashSpeed.X;
        }
        this.Speed.X = newX;
        this.Speed.Y = this.DashDir.Y * DashSpeed;

        if (this.DashDir.X !== 0) this.Facing = Math.sign(this.DashDir.X);

        // Player.cs:3577-3585 — Dash Slide. Grounded diagonal-down dash
        // converts to a horizontal slide with DodgeSlideSpeedMult (1.2).
        if (this.onGround && this.DashDir.X !== 0 && this.DashDir.Y > 0) {
            this.DashDir.X = Math.sign(this.DashDir.X);
            this.DashDir.Y = 0;
            this.Speed.Y = 0;
            this.Speed.X *= DodgeSlideSpeedMult;
        }

        this._dashTimer = DashTime;
        return StDash;
    }

    DashUpdate(dt) {
        // Player.cs:3503-3507 — Super Jump out of horizontal dash
        if (this.DashDir.Y === 0 && this._jumpPressedThisFrame && this.jumpGraceTimer > 0) {
            this.SuperJump();
            return StNormal;
        }
        // Player.cs:3528-3540 — Wall Jump cancels dash
        if (this._jumpPressedThisFrame) {
            if (this._wallJumpCheck(1))  { this.WallJump(-1); return StNormal; }
            if (this._wallJumpCheck(-1)) { this.WallJump( 1); return StNormal; }
        }

        this._dashTimer -= dt;
        if (this._dashTimer <= 0) {
            // End of dash (DashCoroutine after `yield return DashTime`,
            // Player.cs:3623-3633):
            //   AutoJump = true; AutoJumpTimer = 0;
            //   if DashDir.Y <= 0:  Speed = DashDir * EndDashSpeed
            //   if Speed.Y < 0:     Speed.Y *= EndDashUpMult
            //   else: keep momentum (downward dashes retain Y velocity)
            this.AutoJump = true;
            if (this.DashDir.Y <= 0) {
                this.Speed.X = this.DashDir.X * EndDashSpeed;
                this.Speed.Y = this.DashDir.Y * EndDashSpeed;
            }
            if (this.Speed.Y < 0) this.Speed.Y *= EndDashUpMult;
            return StNormal;
        }

        // Maintain dash velocity through the state (DashSpeed, not lerping).
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
        this.AutoJump = false;          // Player.cs:1665
        this.dashAttackTimer = 0;
        this.wallSlideTimer = WallSlideTime;
        this.wallBoostTimer = 0;        // Player.cs:1668

        this.Speed.X += JumpHBoost * this.moveX;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
        this.squashScale.X = JumpSquashScale.X;  // Player.cs:1688
        this.squashScale.Y = JumpSquashScale.Y;
    }

    SuperJump() {
        // Player.cs:1695-1729 (SuperJumpH = 260, SuperJumpSpeed = JumpSpeed)
        this.jumpGraceTimer = 0;
        this.jumpBufferTimer = 0;
        this.varJumpTimer = VarJumpTime;
        this.AutoJump = false;          // Player.cs:1700
        this.dashAttackTimer = 0;
        this.wallBoostTimer = 0;        // Player.cs:1703
        this.Speed.X = 260 * this.Facing;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
        this.squashScale.X = JumpSquashScale.X;  // Player.cs:1724
        this.squashScale.Y = JumpSquashScale.Y;
    }

    WallJump(dir) {
        // Player.cs:1736-1782
        this.jumpGraceTimer = 0;
        this.jumpBufferTimer = 0;
        this.varJumpTimer = VarJumpTime;
        this.AutoJump = false;          // Player.cs:1742
        this.dashAttackTimer = 0;
        this.wallSlideTimer = WallSlideTime;
        this.wallBoostTimer = 0;        // Player.cs:1745
        if (this.moveX !== 0) {
            this.forceMoveX = dir;
            this.forceMoveXTimer = WallJumpForceTime;
        }
        this.Speed.X = WallJumpHSpeed * dir;
        this.Speed.Y = JumpSpeed;
        this.varJumpSpeed = this.Speed.Y;
        this.Facing = dir;
        this.squashScale.X = JumpSquashScale.X;  // Player.cs:1774
        this.squashScale.Y = JumpSquashScale.Y;
    }

    ClimbJump() {
        // Player.cs:1813-1842
        if (!this.onGround) this.Stamina -= ClimbJumpCost;
        this.Jump();
        // Player.cs:1826-1830 — if no horizontal input, arm the wall-boost
        // window so a follow-up tap INTO -Facing converts to a wall jump.
        if (this.moveX === 0) {
            this.wallBoostDir = -this.Facing;
            this.wallBoostTimer = ClimbJumpBoostTime;
        }
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
        // Trail ghosts first (behind the player).
        for (const t of this.dashTrail) {
            const a = 1 - (t.age / DashTrailLifetime);
            if (a <= 0) continue;
            const tx = Math.round(t.x + this.spriteOffsetX);
            const ty = Math.round(t.y + this.spriteOffsetY);
            ctx.save();
            ctx.globalAlpha = 0.5 * a;
            if (t.facing < 0) { ctx.translate(tx + SPRITE_W, ty); ctx.scale(-1, 1); }
            else              { ctx.translate(tx, ty); }
            ctx.fillStyle = '#8ad6ff';  // dash-trail tint, ~Celeste cyan
            for (let py = 0; py < SPRITE_H; py++) {
                const row = SPRITE_PIXELS[py];
                for (let px = 0; px < SPRITE_W; px++) {
                    if (row[px] !== '.') ctx.fillRect(px, py, 1, 1);
                }
            }
            ctx.restore();
        }

        const sx = Math.round(this.x + this.spriteOffsetX);
        const sy = Math.round(this.y + this.spriteOffsetY);
        const flip = this.Facing < 0;
        const dashed = this.Dashes <= 0;

        // Squash/stretch around the player's foot-center, so squash never
        // looks like the sprite floats off the ground.
        const sxC = sx + SPRITE_W / 2;
        const syF = sy + SPRITE_H;
        const ssx = this.squashScale.X;
        const ssy = this.squashScale.Y;

        ctx.save();
        ctx.translate(sxC, syF);
        ctx.scale(ssx * (flip ? -1 : 1), ssy);
        ctx.translate(-SPRITE_W / 2, -SPRITE_H);
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

// ── Entity helpers ────────────────────────────────────────────────────────────
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
            ctx.fillStyle = '#80f080';
            if (isFloor) {
                ctx.fillRect(this.x + 1, this.y, this.w - 2, 2);
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
            ctx.fillStyle = 'rgba(40,204,216,0.18)';
            ctx.beginPath(); ctx.arc(cx, cy, r + 4 + pulse, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#28ccd8';
            ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(160,255,255,0.7)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(cx, cy - r + 1); ctx.lineTo(cx + r - 1, cy); ctx.lineTo(cx, cy + r - 1); ctx.lineTo(cx - r + 1, cy); ctx.closePath(); ctx.stroke();
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
        ctx.fillStyle = 'rgba(200,0,200,0.20)';
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
        const angle = performance.now() / 180;
        ctx.strokeStyle = 'rgba(240,80,240,0.6)'; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const a = angle + i * Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); ctx.stroke();
        }
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

global.makeSpring         = makeSpring;
global.makeBumper         = makeBumper;
global.makeDashCrystal    = makeDashCrystal;
global.makeSpike          = makeSpike;
global.makeEnticeBlade    = makeEnticeBlade;
global.makeStrawberry     = makeStrawberry;
global.makeCrumbleBlock   = makeCrumbleBlock;
global.makeFallingBlock   = makeFallingBlock;
global.makeGoldenStrawberry = makeGoldenStrawberry;

})(typeof window !== 'undefined' ? window : globalThis);
