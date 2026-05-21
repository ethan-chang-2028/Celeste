// CelestePlayer — JS port of the mechanics in
// game-app/CelesteCode/Player.cs. Constants are taken verbatim from
// the C# source so the browser test scene exercises the same numbers
// the real game uses. All game mechanics (run, jump, wall jump, dash,
// grab, coyote time, variable jump, wall slide) live here.
//
// Units: 1 unit = 1 pixel in the 320×180 render buffer.
// Time: seconds. Velocities are pixels/second.

(function (global) {
    // ---- Constants ported from Player.cs --------------------------------------
    const C = {
        MaxFall:          160,    // Player.cs:23
        Gravity:          900,    // Player.cs:24
        HalfGravThreshold: 40,    // Player.cs:25

        MaxRun:           90,     // Player.cs:30
        RunAccel:         1000,   // Player.cs:31
        RunReduce:        400,    // Player.cs:32
        AirMult:          0.65,   // Player.cs:33

        JumpGraceTime:    0.10,   // Player.cs:48  (coyote time)
        JumpSpeed:        -105,   // Player.cs:49
        JumpHBoost:       40,     // Player.cs:50
        VarJumpTime:      0.20,   // Player.cs:51
        JumpBufferTime:   0.08,   // Input.Jump buffer (Celeste uses 0.08s)

        WallSlideStartMax: 20,    // Player.cs:60
        WallJumpHSpeed:   130,    // Player.cs:58 (MaxRun + JumpHBoost)
        WallJumpForceTime: 0.16,  // Player.cs:57

        DashSpeed:        240,    // Player.cs:75
        EndDashSpeed:     160,    // Player.cs:76
        EndDashUpMult:    0.75,   // Player.cs:77
        DashTime:         0.15,   // Player.cs:78
        DashCooldown:     0.20,   // Player.cs:79
        DashRefillCooldown: 0.10, // Player.cs:80

        ClimbMaxStamina:  110,    // Player.cs:102
        ClimbUpCost:      100 / 2.2,  // Player.cs:103
        ClimbStillCost:   100 / 10,   // Player.cs:104
        ClimbJumpCost:    110 / 4,    // Player.cs:105
        ClimbUpSpeed:     -45,    // Player.cs:110
        ClimbDownSpeed:   80,     // Player.cs:111
        ClimbSlipSpeed:   30,     // Player.cs:112
    };

    // ---- Sprite (12×16 pixel art) --------------------------------------------
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
    const PALETTE = {
        '1': '#ac3232',  // hair (NormalHairColor from Player.cs:276)
        '2': '#f0c89a',  // skin
        '3': '#3a6ec7',  // shirt
        '4': '#2a2a4a',  // pants
        '5': '#1a1a2a',  // eye
    };
    const USED_HAIR = '#44b7ff'; // UsedHairColor — Player.cs:278

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
               a.y < b.y + b.h && a.y + a.h > b.y;
    }

    class CelestePlayer {
        constructor(x, y) {
            this.x = x; this.y = y;
            this.w = 8; this.h = 11;        // normalHitbox in Player.cs:263
            this.spriteOffsetX = -2;        // center 12-wide sprite over 8-wide hitbox
            this.spriteOffsetY = -5;

            this.vx = 0; this.vy = 0;
            this.facing = 1;

            this.onGround = false;
            this.wallDir = 0;
            this.dashes = 1;
            this.maxDashes = 1;

            this.jumpGraceTimer = 0;
            this.jumpBufferTimer = 0;
            this.varJumpTimer = 0;
            this.varJumpSpeed = 0;
            this.dashTimer = 0;
            this.dashCooldownTimer = 0;
            this.dashRefillCooldownTimer = 0;
            this.dashDirX = 0; this.dashDirY = 0;
            this.wallJumpForceTimer = 0;
            this.wallJumpForceDir = 0;
            this.stamina = C.ClimbMaxStamina;
            this.climbing = false;
        }

        reset(x, y) {
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
            this.dashes = this.maxDashes;
            this.jumpGraceTimer = 0;
            this.jumpBufferTimer = 0;
            this.varJumpTimer = 0;
            this.dashTimer = 0;
            this.dashCooldownTimer = 0;
            this.dashRefillCooldownTimer = 0;
            this.wallJumpForceTimer = 0;
            this.stamina = C.ClimbMaxStamina;
            this.climbing = false;
        }

        _checkWall(platforms, dir) {
            const probe = { x: this.x + dir, y: this.y + 1, w: this.w, h: this.h - 2 };
            for (const p of platforms) if (rectsOverlap(probe, p)) return true;
            return false;
        }

        // input: { moveX, moveY, jumpPressed, jumpHeld, dashPressed, grabHeld }
        update(input, platforms, dt) {
            const { moveX, moveY, jumpPressed, jumpHeld, dashPressed, grabHeld } = input;

            if (moveX !== 0 && this.dashTimer <= 0) this.facing = moveX;

            // Timers
            this.jumpGraceTimer        = Math.max(0, this.jumpGraceTimer - dt);
            this.jumpBufferTimer       = Math.max(0, this.jumpBufferTimer - dt);
            this.varJumpTimer          = Math.max(0, this.varJumpTimer - dt);
            this.dashCooldownTimer     = Math.max(0, this.dashCooldownTimer - dt);
            this.dashRefillCooldownTimer = Math.max(0, this.dashRefillCooldownTimer - dt);
            this.wallJumpForceTimer    = Math.max(0, this.wallJumpForceTimer - dt);
            if (jumpPressed) this.jumpBufferTimer = C.JumpBufferTime;

            // Walls
            const touchingLeft  = this._checkWall(platforms, -1);
            const touchingRight = this._checkWall(platforms,  1);
            this.wallDir = touchingRight ? 1 : touchingLeft ? -1 : 0;

            // Climb / grab — simplified: hold grab while next to a wall and not on ground
            const canClimb = grabHeld && this.wallDir !== 0 && !this.onGround && this.stamina > 0;
            this.climbing = canClimb;

            if (this.dashTimer > 0) {
                // ---- Dash state — fixed velocity ----------------------------------
                this.dashTimer -= dt;
                this.vx = this.dashDirX * C.DashSpeed;
                this.vy = this.dashDirY * C.DashSpeed;
                if (this.dashTimer <= 0) {
                    // EndDashSpeed
                    const len = Math.hypot(this.dashDirX, this.dashDirY) || 1;
                    this.vx = (this.dashDirX / len) * C.EndDashSpeed;
                    this.vy = (this.dashDirY / len) * C.EndDashSpeed * (this.dashDirY < 0 ? C.EndDashUpMult : 1);
                }
            } else if (dashPressed && this.dashes > 0 && this.dashCooldownTimer <= 0) {
                // ---- Begin dash ---------------------------------------------------
                let dx = moveX, dy = moveY;
                if (dx === 0 && dy === 0) dx = this.facing;
                const len = Math.hypot(dx, dy) || 1;
                this.dashDirX = dx / len;
                this.dashDirY = dy / len;
                this.dashTimer = C.DashTime;
                this.dashCooldownTimer = C.DashCooldown;
                this.dashRefillCooldownTimer = C.DashRefillCooldown;
                this.dashes--;
                this.vx = this.dashDirX * C.DashSpeed;
                this.vy = this.dashDirY * C.DashSpeed;
            } else {
                // ---- Normal movement ---------------------------------------------
                if (this.climbing) {
                    // Climb
                    if (moveY < 0) {
                        this.vy = C.ClimbUpSpeed;
                        this.stamina -= C.ClimbUpCost * dt;
                    } else if (moveY > 0) {
                        this.vy = C.ClimbDownSpeed;
                    } else {
                        this.vy = 0;
                        this.stamina -= C.ClimbStillCost * dt;
                    }
                } else {
                    // Horizontal: Approach toward MaxRun * moveX
                    const accel = (this.onGround ? C.RunAccel : C.RunAccel * C.AirMult);
                    if (this.wallJumpForceTimer > 0) {
                        // Wall-jump force keeps horizontal velocity stable briefly
                    } else if (moveX !== 0) {
                        const target = C.MaxRun * moveX;
                        if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
                        else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
                    } else if (this.onGround) {
                        // Friction (RunReduce)
                        if (this.vx > 0) this.vx = Math.max(0, this.vx - C.RunReduce * dt);
                        else if (this.vx < 0) this.vx = Math.min(0, this.vx + C.RunReduce * dt);
                    }

                    // Vertical: gravity with half-grav near jump apex
                    let g = C.Gravity;
                    if (Math.abs(this.vy) < C.HalfGravThreshold && (jumpHeld && this.varJumpTimer > 0)) {
                        g *= 0.5;
                    }
                    this.vy += g * dt;

                    // Wall slide: cap fall speed against a wall
                    if (this.wallDir !== 0 && !this.onGround && moveX === this.wallDir && this.vy > C.WallSlideStartMax) {
                        this.vy = C.WallSlideStartMax;
                    }
                    if (this.vy > C.MaxFall) this.vy = C.MaxFall;
                }

                // Jump (buffered + coyote + wall jump)
                if (this.jumpBufferTimer > 0) {
                    if (this.onGround || this.jumpGraceTimer > 0) {
                        this._jump(moveX);
                    } else if (this.wallDir !== 0) {
                        this._wallJump(-this.wallDir);
                    }
                }

                // Variable jump cut
                if (!jumpHeld && this.vy < this.varJumpSpeed) {
                    this.vy = Math.max(this.vy, this.varJumpSpeed * 0.5);
                    this.varJumpTimer = 0;
                }
            }

            // ---- Movement & collision (axis-separated) ---------------------------
            const wasOnGround = this.onGround;

            this.x += this.vx * dt;
            for (const p of platforms) {
                if (rectsOverlap(this, p)) {
                    if (this.vx > 0) this.x = p.x - this.w;
                    else if (this.vx < 0) this.x = p.x + p.w;
                    if (this.dashTimer > 0) {
                        // End horizontal portion of dash on wall
                        this.dashDirX = 0;
                    }
                    this.vx = 0;
                }
            }

            this.y += this.vy * dt;
            this.onGround = false;
            for (const p of platforms) {
                if (rectsOverlap(this, p)) {
                    if (this.vy > 0) {
                        this.y = p.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                    } else if (this.vy < 0) {
                        this.y = p.y + p.h;
                        this.vy = 0;
                        this.varJumpTimer = 0;
                    }
                    if (this.dashTimer > 0) this.dashDirY = 0;
                }
            }

            // Coyote + dash refill on ground
            if (this.onGround) {
                this.jumpGraceTimer = C.JumpGraceTime;
                if (this.dashRefillCooldownTimer <= 0) this.dashes = this.maxDashes;
                this.stamina = C.ClimbMaxStamina;
            } else if (wasOnGround) {
                this.jumpGraceTimer = C.JumpGraceTime;
            }
            // Walls also refill dash (after RefillCooldown)
            if (this.wallDir !== 0 && this.dashRefillCooldownTimer <= 0) this.dashes = this.maxDashes;
        }

        _jump(moveX) {
            this.vy = C.JumpSpeed;
            this.vx += C.JumpHBoost * moveX;
            this.varJumpSpeed = C.JumpSpeed;
            this.varJumpTimer = C.VarJumpTime;
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
        }

        _wallJump(awayDir) {
            this.vx = C.WallJumpHSpeed * awayDir;
            this.vy = C.JumpSpeed;
            this.varJumpSpeed = C.JumpSpeed;
            this.varJumpTimer = C.VarJumpTime;
            this.wallJumpForceTimer = C.WallJumpForceTime;
            this.wallJumpForceDir = awayDir;
            this.facing = awayDir;
            this.jumpBufferTimer = 0;
            this.stamina -= C.ClimbJumpCost;
        }

        // ---- Render (1 canvas pixel = 1 logical pixel) ---------------------------
        draw(ctx) {
            const sx = Math.round(this.x + this.spriteOffsetX);
            const sy = Math.round(this.y + this.spriteOffsetY);
            const flip = this.facing < 0;
            const dashed = this.dashes <= 0;

            ctx.save();
            if (flip) {
                ctx.translate(sx + SPRITE_W, sy);
                ctx.scale(-1, 1);
            } else {
                ctx.translate(sx, sy);
            }
            for (let py = 0; py < SPRITE_H; py++) {
                const row = SPRITE_PIXELS[py];
                for (let px = 0; px < SPRITE_W; px++) {
                    const ch = row[px];
                    if (ch === '.') continue;
                    ctx.fillStyle = (ch === '1' && dashed) ? USED_HAIR : PALETTE[ch];
                    ctx.fillRect(px, py, 1, 1);
                }
            }
            ctx.restore();

            if (this.dashTimer > 0) {
                ctx.fillStyle = 'rgba(150, 220, 255, 0.35)';
                ctx.fillRect(sx - 1, sy, SPRITE_W + 2, SPRITE_H);
            }
        }

        get state() {
            if (this.dashTimer > 0) return 'dashing';
            if (this.climbing) return 'climbing';
            if (this.wallDir !== 0 && !this.onGround) return 'wall-slide';
            if (this.onGround) return 'grounded';
            return 'airborne';
        }
    }

    global.CelestePlayer = CelestePlayer;
    global.CELESTE_CONSTANTS = C;
})(typeof window !== 'undefined' ? window : globalThis);
