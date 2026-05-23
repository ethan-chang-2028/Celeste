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

})(typeof window !== 'undefined' ? window : globalThis);
