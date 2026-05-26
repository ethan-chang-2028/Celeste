#pragma once
// physics.hpp — Celeste player physics, ported 1-to-1 from player.js
// Constants and logic kept identical so weights transfer directly to the browser.

#include <vector>
#include <cmath>
#include <algorithm>

// ── Constants (mirrors player.js) ────────────────────────────────────────────
static constexpr float MaxFall            = 160.f;
static constexpr float Gravity            = 900.f;
static constexpr float HalfGravThreshold = 40.f;
static constexpr float FastMaxFall        = 240.f;
static constexpr float FastMaxAccel       = 300.f;
static constexpr float MaxRun             = 90.f;
static constexpr float RunAccel           = 1000.f;
static constexpr float RunReduce          = 400.f;
static constexpr float AirMult            = 0.65f;
static constexpr float JumpGraceTime      = 0.10f;
static constexpr float JumpSpeed          = -105.f;
static constexpr float JumpHBoost         = 40.f;
static constexpr float VarJumpTime        = 0.20f;
static constexpr float WallJumpCheckDist  = 3.f;
static constexpr float WallJumpForceTime  = 0.16f;
static constexpr float WallJumpHSpeed     = MaxRun + JumpHBoost; // 130
static constexpr int   UpwardCornerCorrection = 4;
static constexpr float WallSlideStartMax  = 20.f;
static constexpr float WallSlideTime      = 1.2f;
static constexpr float DashSpeed          = 240.f;
static constexpr float EndDashSpeed       = 160.f;
static constexpr float EndDashUpMult      = 0.75f;
static constexpr float DashTime           = 0.15f;
static constexpr float DashCooldown       = 0.20f;
static constexpr float DashRefillCooldown = 0.10f;
static constexpr float DashAttackTime     = 0.30f;
static constexpr float DodgeSlideSpeedMult= 1.2f;
static constexpr float DashFreezeTime     = 0.05f;
static constexpr float JumpBufferTime     = 0.08f;
static constexpr float ClimbMaxStamina    = 110.f;
static constexpr float ClimbUpCost        = 100.f / 2.2f;
static constexpr float ClimbStillCost     = 100.f / 10.f;
static constexpr float ClimbJumpCost      = 110.f / 4.f;
static constexpr float ClimbNoMoveTime    = 0.10f;
static constexpr float ClimbTiredThreshold= 20.f;
static constexpr float ClimbUpSpeed       = -45.f;
static constexpr float ClimbDownSpeed     = 80.f;
static constexpr float ClimbSlipSpeed     = 30.f;
static constexpr float ClimbAccel         = 900.f;
static constexpr float ClimbGrabYMult     = 0.2f;
static constexpr float ClimbJumpBoostTime = 0.20f;

enum PlayerState { StNormal = 0, StClimb = 1, StDash = 2 };

#ifndef CELESTE_RECT_DEFINED
#define CELESTE_RECT_DEFINED
struct Rect { float x, y, w, h; };
#endif
struct Vec2 { float X, Y; };

struct PlayerInput {
    int   moveX = 0;      // -1/0/1
    int   moveY = 0;      // -1/0/1 (unused in trainer but kept for API match)
    bool  jumpPressed = false;
    bool  jumpHeld    = false;
    bool  dashPressed = false;
    bool  grabHeld    = false;
};

inline bool rectsOverlap(float ax, float ay, float aw, float ah,
                          const Rect& b) {
    return ax < b.x + b.w && ax + aw > b.x &&
           ay < b.y + b.h && ay + ah > b.y;
}

inline float Approach(float val, float target, float maxMove) {
    return val > target ? std::max(target, val - maxMove)
                        : std::min(target, val + maxMove);
}

class Player {
public:
    float x, y;
    static constexpr float w = 8.f, h = 11.f;
    Vec2  Speed     = {0, 0};
    int   Facing    = 1;
    PlayerState State = StNormal;
    int   Dashes    = 1;
    int   MaxDashes = 1;
    float Stamina   = ClimbMaxStamina;
    bool  onGround  = false;
    bool  wasOnGround = false;
    int   moveX     = 0;

    float jumpGraceTimer   = 0;
    float varJumpSpeed     = 0;
    float varJumpTimer     = 0;
    float jumpBufferTimer  = 0;
    float forceMoveX       = 0;
    float forceMoveXTimer  = 0;
    float dashCooldownTimer       = 0;
    float dashRefillCooldownTimer = 0;
    float dashAttackTimer  = 0;
    Vec2  DashDir          = {0, 0};
    float wallSlideTimer   = WallSlideTime;
    int   wallSlideDir     = 0;
    float climbNoMoveTimer = 0;
    float maxFall          = MaxFall;
    float wallBoostTimer   = 0;
    int   wallBoostDir     = 0;
    bool  AutoJump         = false;
    Vec2  beforeDashSpeed  = {0, 0};
    float freezeTimer      = 0;
    float _dashTimer       = 0;
    bool  _jumpPressedThisFrame = false;

    explicit Player(float px, float py) : x(px), y(py) {}

    void reset(float px, float py) {
        x = px; y = py;
        Speed = {0, 0};
        State = StNormal;
        Dashes = MaxDashes;
        Stamina = ClimbMaxStamina;
        jumpGraceTimer = varJumpTimer = jumpBufferTimer = 0;
        dashCooldownTimer = dashRefillCooldownTimer = dashAttackTimer = 0;
        DashDir = {0, 0};
        forceMoveXTimer = 0;
        wallSlideTimer = WallSlideTime;
        wallSlideDir = 0;
        maxFall = MaxFall;
        AutoJump = false;
        freezeTimer = 0;
        wallBoostTimer = 0;
        wallBoostDir = 0;
    }

    void update(const PlayerInput& input, const std::vector<Rect>& plats, float dt) {
        _plats = &plats;

        if (freezeTimer > 0) { freezeTimer -= dt; return; }

        if (forceMoveXTimer > 0) { forceMoveXTimer -= dt; moveX = (int)forceMoveX; }
        else moveX = input.moveX;

        if (moveX != 0 && State != StDash && State != StClimb) Facing = moveX;

        jumpBufferTimer = std::max(0.f, jumpBufferTimer - dt);
        if (input.jumpPressed) jumpBufferTimer = JumpBufferTime;
        _jumpPressedThisFrame = jumpBufferTimer > 0;

        if (onGround) jumpGraceTimer = JumpGraceTime;
        else if (jumpGraceTimer > 0) jumpGraceTimer -= dt;

        if (dashCooldownTimer > 0)      dashCooldownTimer -= dt;
        if (dashRefillCooldownTimer > 0) dashRefillCooldownTimer -= dt;
        else if (onGround && Dashes < MaxDashes) Dashes = MaxDashes;

        if (onGround && State != StClimb) {
            Stamina = ClimbMaxStamina;
            wallSlideTimer = WallSlideTime;
            AutoJump = false;
        }

        if (varJumpTimer > 0)    varJumpTimer -= dt;
        if (dashAttackTimer > 0) dashAttackTimer -= dt;
        wallSlideDir = 0;

        if (wallBoostTimer > 0) {
            wallBoostTimer -= dt;
            if (moveX == wallBoostDir) {
                Speed.X = WallJumpHSpeed * moveX;
                Stamina += ClimbJumpCost;
                wallBoostTimer = 0;
            }
        }
        if (climbNoMoveTimer > 0) climbNoMoveTimer -= dt;

        if      (State == StNormal) State = NormalUpdate(input, dt);
        else if (State == StClimb)  State = ClimbUpdate(input, dt);
        else if (State == StDash)   State = DashUpdate(input, dt);

        _moveH(Speed.X * dt);
        _moveV(Speed.Y * dt);

        wasOnGround = onGround;
        onGround = !_wallCheck(0) ? _isOnGround() : false;
    }

private:
    const std::vector<Rect>* _plats = nullptr;

    bool _overlaps(float px, float py) const {
        for (const auto& p : *_plats)
            if (rectsOverlap(px, py, w, h, p)) return true;
        return false;
    }

    bool _isOnGround() const {
        for (const auto& p : *_plats)
            if (rectsOverlap(x, y + 1, w, h, p)) return true;
        return false;
    }

    bool _wallCheck(float dir) const {
        for (const auto& p : *_plats)
            if (rectsOverlap(x + dir, y + 1, w, h - 2, p)) return true;
        return false;
    }

    bool _wallCheckAt(float dx, float dy) const {
        for (const auto& p : *_plats)
            if (rectsOverlap(x + dx, y + dy + 1, w, h - 2, p)) return true;
        return false;
    }

    bool _wallJumpCheck(int dir) const {
        for (int d = 1; d <= (int)WallJumpCheckDist; d++)
            if (_wallCheck((float)(dir * d))) return true;
        return false;
    }

    bool _climbCheck(int facing) const { return _wallCheck((float)facing); }
    bool _isTired() const { return Stamina < ClimbTiredThreshold; }

    bool _headCheck() const {
        for (const auto& p : *_plats)
            if (rectsOverlap(x, y - 1, w, 1, p)) return true;
        return false;
    }

    bool _slipCheck() const {
        float probeX = Facing > 0 ? x + w : x - 1;
        for (const auto& p : *_plats)
            if (rectsOverlap(probeX, y - 1, 1, 4, p)) return false;
        return true;
    }

    void _moveH(float amount) {
        x += amount;
        for (const auto& p : *_plats) {
            if (rectsOverlap(x, y, w, h, p)) {
                if (Speed.X > 0) x = p.x - w;
                else if (Speed.X < 0) x = p.x + p.w;
                if (State == StDash) DashDir.X = 0;
                Speed.X = 0;
            }
        }
    }

    void _moveV(float amount) {
        y += amount;
        for (const auto& p : *_plats) {
            if (rectsOverlap(x, y, w, h, p)) {
                if (Speed.Y > 0) {
                    y = p.y - h; Speed.Y = 0;
                } else if (Speed.Y < 0) {
                    if (_cornerCorrect()) return;
                    y = p.y + p.h; Speed.Y = 0; varJumpTimer = 0;
                }
                if (State == StDash) DashDir.Y = 0;
            }
        }
    }

    bool _cornerCorrect() {
        auto tryDir = [&](int sign) -> bool {
            for (int i = 1; i <= UpwardCornerCorrection; i++) {
                float nx = x + sign * i, ny = y - 1;
                bool clear = true;
                for (const auto& p : *_plats)
                    if (rectsOverlap(nx, ny, w, h, p)) { clear = false; break; }
                if (clear) { x = nx; y = ny; return true; }
            }
            return false;
        };
        if (Speed.X <= 0 && tryDir(-1)) return true;
        if (Speed.X >= 0 && tryDir( 1)) return true;
        return false;
    }

    PlayerState NormalUpdate(const PlayerInput& input, float dt) {
        if (input.grabHeld && !_isTired() && std::signbit(Speed.X) != (Facing < 0)) {
            if (_climbCheck(Facing)) { _climbBegin(); return StClimb; }
        }
        if (input.dashPressed && Dashes > 0 && dashCooldownTimer <= 0)
            return _startDash(input);

        // Running
        float mult = onGround ? 1.f : AirMult;
        if (std::abs(Speed.X) > MaxRun && (Speed.X > 0 ? 1 : -1) == moveX)
            Speed.X = Approach(Speed.X, MaxRun * moveX, RunReduce * mult * dt);
        else
            Speed.X = Approach(Speed.X, MaxRun * moveX, RunAccel * mult * dt);

        // Gravity
        if (!onGround) {
            if (input.moveY == 1 && Speed.Y >= MaxFall)
                maxFall = Approach(maxFall, FastMaxFall, FastMaxAccel * dt);
            else
                maxFall = Approach(maxFall, MaxFall, FastMaxAccel * dt);
            float maxF = maxFall;
            if ((moveX == Facing || (moveX == 0 && input.grabHeld)) && input.moveY != 1) {
                if (Speed.Y >= 0 && wallSlideTimer > 0 && _wallCheck((float)Facing))
                    wallSlideDir = Facing;
                if (wallSlideDir != 0) {
                    float t = wallSlideTimer / WallSlideTime;
                    maxF = MaxFall + (WallSlideStartMax - MaxFall) * t;
                    wallSlideTimer = std::max(0.f, wallSlideTimer - dt);
                }
            } else {
                wallSlideTimer = std::min(WallSlideTime, wallSlideTimer + dt);
            }
            bool halfGrav = std::abs(Speed.Y) < HalfGravThreshold && (input.jumpHeld || AutoJump);
            Speed.Y = Approach(Speed.Y, maxF, Gravity * (halfGrav ? 0.5f : 1.f) * dt);
        }

        // Variable jump
        if (varJumpTimer > 0) {
            if (AutoJump || input.jumpHeld) Speed.Y = std::min(Speed.Y, varJumpSpeed);
            else varJumpTimer = 0;
        }

        // Jump / WallJump
        if (_jumpPressedThisFrame) {
            if (jumpGraceTimer > 0) { _jump(); }
            else if (_wallJumpCheck(1))  { if (Facing == 1 && input.grabHeld && Stamina > 0) _climbJump(); else _wallJump(-1); }
            else if (_wallJumpCheck(-1)) { if (Facing == -1 && input.grabHeld && Stamina > 0) _climbJump(); else _wallJump(1); }
        }
        return StNormal;
    }

    void _climbBegin() {
        Speed.X = 0; Speed.Y *= ClimbGrabYMult;
        wallSlideTimer = WallSlideTime; climbNoMoveTimer = ClimbNoMoveTime;
    }

    PlayerState ClimbUpdate(const PlayerInput& input, float dt) {
        if (onGround) Stamina = ClimbMaxStamina;
        if (_jumpPressedThisFrame) {
            if (moveX == -Facing) _wallJump(-Facing);
            else _climbJump();
            return StNormal;
        }
        if (input.dashPressed && Dashes > 0 && dashCooldownTimer <= 0) return _startDash(input);
        if (!input.grabHeld) return StNormal;
        if (!_climbCheck(Facing)) {
            if (Speed.Y < 0) { Speed.X = Facing * 60; Speed.Y = std::min(Speed.Y, -120.f); forceMoveX = 0; forceMoveXTimer = 0.2f; }
            return StNormal;
        }
        float target = 0; bool trySlip = false;
        if (climbNoMoveTimer <= 0) {
            if (input.moveY < 0) { target = ClimbUpSpeed; if (_headCheck()) { if (Speed.Y < 0) Speed.Y = 0; target = 0; trySlip = true; } }
            else if (input.moveY > 0) { target = ClimbDownSpeed; if (onGround) { if (Speed.Y > 0) Speed.Y = 0; target = 0; } }
            else trySlip = true;
        } else { trySlip = true; }
        if (trySlip && _slipCheck()) target = ClimbSlipSpeed;
        Speed.Y = Approach(Speed.Y, target, ClimbAccel * dt);
        Speed.X = 0;
        if (input.moveY != 1 && Speed.Y > 0 && !_wallCheckAt((float)Facing, 1)) Speed.Y = 0;
        if (climbNoMoveTimer <= 0) {
            if (input.moveY < 0)       Stamina -= ClimbUpCost   * dt;
            else if (input.moveY == 0) Stamina -= ClimbStillCost * dt;
        }
        if (Stamina <= 0) return StNormal;
        return StClimb;
    }

    PlayerState _startDash(const PlayerInput& input) {
        beforeDashSpeed = Speed; Speed = {0, 0};
        dashAttackTimer = DashAttackTime; dashCooldownTimer = DashCooldown;
        dashRefillCooldownTimer = DashRefillCooldown; Dashes--;
        freezeTimer = DashFreezeTime;
        float dx = (float)input.moveX, dy = (float)input.moveY;
        if (dx == 0 && dy == 0) dx = (float)Facing;
        float len = std::sqrt(dx*dx + dy*dy); if (len == 0) len = 1;
        DashDir = { dx/len, dy/len };
        float newX = DashDir.X * DashSpeed;
        if (std::copysign(1.f, beforeDashSpeed.X) == std::copysign(1.f, newX) &&
            std::abs(beforeDashSpeed.X) > std::abs(newX)) newX = beforeDashSpeed.X;
        Speed.X = newX; Speed.Y = DashDir.Y * DashSpeed;
        if (DashDir.X != 0) Facing = (int)std::copysign(1.f, DashDir.X);
        if (onGround && DashDir.X != 0 && DashDir.Y > 0) {
            DashDir.X = std::copysign(1.f, DashDir.X); DashDir.Y = 0;
            Speed.Y = 0; Speed.X *= DodgeSlideSpeedMult;
        }
        _dashTimer = DashTime;
        return StDash;
    }

    PlayerState DashUpdate(const PlayerInput& input, float dt) {
        if (DashDir.Y == 0 && _jumpPressedThisFrame && jumpGraceTimer > 0) { _superJump(); return StNormal; }
        if (_jumpPressedThisFrame) {
            if (_wallJumpCheck(1))  { _wallJump(-1); return StNormal; }
            if (_wallJumpCheck(-1)) { _wallJump( 1); return StNormal; }
        }
        _dashTimer -= dt;
        if (_dashTimer <= 0) {
            AutoJump = true;
            if (DashDir.Y <= 0) { Speed.X = DashDir.X * EndDashSpeed; Speed.Y = DashDir.Y * EndDashSpeed; }
            if (Speed.Y < 0) Speed.Y *= EndDashUpMult;
            return StNormal;
        }
        Speed.X = DashDir.X * DashSpeed; Speed.Y = DashDir.Y * DashSpeed;
        return StDash;
    }

    void _jump() {
        jumpGraceTimer = jumpBufferTimer = 0; varJumpTimer = VarJumpTime;
        AutoJump = false; dashAttackTimer = 0; wallSlideTimer = WallSlideTime; wallBoostTimer = 0;
        Speed.X += JumpHBoost * moveX; Speed.Y = JumpSpeed; varJumpSpeed = Speed.Y;
    }
    void _superJump() {
        jumpGraceTimer = jumpBufferTimer = 0; varJumpTimer = VarJumpTime;
        AutoJump = false; dashAttackTimer = 0; wallBoostTimer = 0;
        Speed.X = 260.f * Facing; Speed.Y = JumpSpeed; varJumpSpeed = Speed.Y;
    }
    void _wallJump(int dir) {
        jumpGraceTimer = jumpBufferTimer = 0; varJumpTimer = VarJumpTime;
        AutoJump = false; dashAttackTimer = 0; wallSlideTimer = WallSlideTime; wallBoostTimer = 0;
        if (moveX != 0) { forceMoveX = (float)dir; forceMoveXTimer = WallJumpForceTime; }
        Speed.X = WallJumpHSpeed * dir; Speed.Y = JumpSpeed; varJumpSpeed = Speed.Y; Facing = dir;
    }
    void _climbJump() {
        if (!onGround) Stamina -= ClimbJumpCost;
        _jump();
        if (moveX == 0) { wallBoostDir = -Facing; wallBoostTimer = ClimbJumpBoostTime; }
    }
};
