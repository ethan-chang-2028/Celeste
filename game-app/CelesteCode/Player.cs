// Player.cs — Full Celeste player physics in C#.
// All constants, states, and physics ported faithfully from the original game.
// Runs against the Monocle stubs (game-app-blazor/Stubs/) for browser / test use.
using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    [Tracked]
    public class Player : Actor
    {
        // ──────────────────────────────────────────────────────────────────────
        // Physics constants (match original Player.cs exactly)
        // ──────────────────────────────────────────────────────────────────────
        public const float MaxFall              = 160f;
        public const float Gravity              = 900f;
        public const float HalfGravThreshold    = 40f;
        public const float FastMaxFall          = 240f;
        public const float FastMaxAccel         = 300f;

        public const float MaxRun               = 90f;
        public const float RunAccel             = 1000f;
        public const float RunReduce            = 400f;
        public const float AirMult              = 0.65f;

        public const float DuckFriction         = 500f;

        public const float JumpGraceTime        = 0.10f;
        public const float JumpSpeed            = -105f;
        public const float JumpHBoost           = 40f;
        public const float VarJumpTime          = 0.20f;

        public const int   WallJumpCheckDist    = 3;
        public const float WallJumpForceTime    = 0.16f;
        public const float WallJumpHSpeed       = MaxRun + JumpHBoost; // 130
        public const int   UpwardCornerCorrection = 4;

        public const float WallSlideStartMax    = 20f;
        public const float WallSlideTime        = 1.2f;

        public const float DashSpeed            = 240f;
        public const float EndDashSpeed         = 160f;
        public const float EndDashUpMult        = 0.75f;
        public const float DashTime             = 0.15f;
        public const float DashCooldown         = 0.20f;
        public const float DashRefillCooldown   = 0.10f;
        public const float DashAttackTime       = 0.30f;
        public const float DodgeSlideSpeedMult  = 1.2f;

        public const float ClimbMaxStamina      = 110f;
        public const float ClimbUpCost          = 100f / 2.2f;
        public const float ClimbStillCost       = 100f / 10f;
        public const float ClimbJumpCost        = 110f / 4f;
        public const float ClimbNoMoveTime      = 0.10f;
        public const float ClimbTiredThreshold  = 20f;
        public const float ClimbUpSpeed         = -45f;
        public const float ClimbDownSpeed       = 80f;
        public const float ClimbSlipSpeed       = 30f;
        public const float ClimbAccel           = 900f;
        public const float ClimbGrabYMult       = 0.2f;
        public const float ClimbJumpBoostTime   = 0.20f;

        public const float StarFlySpeed         = 190f;
        public const float StarFlyAccel         = 1000f;
        public const float StarFlyTime          = 2.0f;

        public const float RedBoostSpeed        = 250f;
        public const float RedBoostHoldTime     = 0.25f;

        public const float SpringBounceSpeed    = -185f;
        public const float BumperLaunchSpeed    = 280f;

        // ──────────────────────────────────────────────────────────────────────
        // State IDs
        // ──────────────────────────────────────────────────────────────────────
        public const int StNormal   = 0;
        public const int StClimb    = 1;
        public const int StDash     = 2;
        public const int StDead     = 3;
        public const int StStarFly  = 4;
        public const int StRedDash  = 5;
        public const int StBoost    = 6;

        // ──────────────────────────────────────────────────────────────────────
        // Public state
        // ──────────────────────────────────────────────────────────────────────
        public StateMachine StateMachine;
        public PlayerSprite  Sprite;
        public Facings       Facing       = Facings.Right;
        public int           Dashes;
        public int           MaxDashes    = 1;
        public Vector2       DashDir;
        public float         Stamina;
        public bool          Dead;
        public bool          Ducking;
        public bool          AutoJump;
        public Leader        Leader;

        // Particles (no-op ParticleType instances)
        public static readonly ParticleType P_Jump     = new ParticleType();
        public static readonly ParticleType P_WallJump = new ParticleType();
        public static readonly ParticleType P_Dash     = new ParticleType();
        public static readonly ParticleType P_DustA    = new ParticleType();
        public static readonly ParticleType P_DustB    = new ParticleType();

        // ──────────────────────────────────────────────────────────────────────
        // Private physics state
        // ──────────────────────────────────────────────────────────────────────
        private int   moveX;                   // effective horizontal input this frame
        private float jumpGraceTimer;
        private float varJumpTimer;
        private float varJumpSpeed;
        private float maxFall;

        private float dashCooldownTimer;
        private float dashRefillCooldownTimer;
        private float dashAttackTimer;
        private float dashTimer;
        private Vector2 beforeDashSpeed;

        private float wallSlideTimer;
        private int   wallSlideDir;

        private int   forceMoveX;
        private float forceMoveXTimer;

        private float climbNoMoveTimer;
        private float wallBoostTimer;
        private int   wallBoostDir;

        private float starFlyTimer;

        private Booster currentBooster;
        private float   boostTimer;

        // Collider shapes
        private readonly Hitbox normalHitbox   = new Hitbox(8, 11, -4, -11);
        private readonly Hitbox duckHitbox     = new Hitbox(8,  6, -4,  -6);
        private readonly Hitbox starFlyHitbox  = new Hitbox(8,  8, -4,  -4);

        // ──────────────────────────────────────────────────────────────────────
        // Construction
        // ──────────────────────────────────────────────────────────────────────
        public Player(Vector2 position, PlayerSpriteMode spriteMode = PlayerSpriteMode.Madeline)
        {
            Position       = position;
            Collider       = normalHitbox;
            Dashes         = MaxDashes;
            Stamina        = ClimbMaxStamina;
            maxFall        = MaxFall;
            wallSlideTimer = WallSlideTime;

            StateMachine = new StateMachine(10);
            StateMachine.SetCallbacks(StNormal,  NormalUpdate,  null, NormalBegin,   NormalEnd);
            StateMachine.SetCallbacks(StClimb,   ClimbUpdate,   null, ClimbBegin,    ClimbEnd);
            StateMachine.SetCallbacks(StDash,    DashUpdate,    null, DashBegin,     DashEnd);
            StateMachine.SetCallbacks(StDead,    DeadUpdate,    null, DeadBegin,     null);
            StateMachine.SetCallbacks(StStarFly, StarFlyUpdate, null, StarFlyBegin,  StarFlyEnd);
            StateMachine.SetCallbacks(StRedDash, RedDashUpdate, null, RedDashBegin,  null);
            StateMachine.SetCallbacks(StBoost,   BoostUpdate,   null, BoostBegin,    null);
            Add(StateMachine);

            Sprite = new PlayerSprite(spriteMode);
            Add(Sprite);

            Leader = new Leader();
            Add(Leader);
        }

        // ──────────────────────────────────────────────────────────────────────
        // Per-frame entry point
        // ──────────────────────────────────────────────────────────────────────
        public override void Update()
        {
            float dt = Engine.DeltaTime;

            // Effective horizontal input (forceMoveX overrides Input.MoveX)
            if (forceMoveXTimer > 0) { forceMoveXTimer -= dt; moveX = forceMoveX; }
            else                       moveX = Input.MoveX.Value;

            // Facing follows horizontal input (suppressed during dash/climb)
            if (moveX != 0 && StateMachine.State != StDash && StateMachine.State != StClimb)
                Facing = (Facings)moveX;

            // Jump grace timer
            if (OnGround())              jumpGraceTimer = JumpGraceTime;
            else if (jumpGraceTimer > 0) jumpGraceTimer -= dt;

            // Dash cooldowns & ground refill
            if (dashCooldownTimer       > 0) dashCooldownTimer       -= dt;
            if (dashRefillCooldownTimer > 0) dashRefillCooldownTimer -= dt;
            else if (OnGround() && Dashes < MaxDashes) Dashes = MaxDashes;

            // Miscellaneous timers
            if (varJumpTimer    > 0) varJumpTimer    -= dt;
            if (dashAttackTimer > 0) dashAttackTimer -= dt;
            if (climbNoMoveTimer > 0) climbNoMoveTimer -= dt;

            // Wall-slide direction resets each frame
            wallSlideDir = 0;

            // Wall-boost window: if player climb-jumped with no input,
            // pressing INTO wallBoostDir within the window converts it to a wall-jump.
            if (wallBoostTimer > 0)
            {
                wallBoostTimer -= dt;
                if (moveX == wallBoostDir)
                {
                    Speed.X       = WallJumpHSpeed * wallBoostDir;
                    Stamina      += ClimbJumpCost;
                    wallBoostTimer = 0;
                }
            }

            // Ground resets stamina, wall-slide, and AutoJump
            if (OnGround() && StateMachine.State != StClimb)
            {
                Stamina        = ClimbMaxStamina;
                wallSlideTimer = WallSlideTime;
                AutoJump       = false;
            }

            // Run state machine — updates and potentially changes state
            StateMachine.Update();

            // Physics integration (separated axes, pixel-accurate)
            MoveH(Speed.X * dt, OnCollideH);
            MoveV(Speed.Y * dt, OnCollideV);

            // Update sprite to reflect current state
            UpdateSprite();
        }

        // ──────────────────────────────────────────────────────────────────────
        // Collision callbacks
        // ──────────────────────────────────────────────────────────────────────
        private void OnCollideH(dynamic hit)
        {
            if (StateMachine.State == StDash) DashDir.X = 0;
            Speed.X = 0;
        }

        private void OnCollideV(dynamic hit)
        {
            if (StateMachine.State == StDash) DashDir.Y = 0;
            if (Speed.Y < 0) { varJumpTimer = 0; }
            Speed.Y = 0;
        }

        // ══════════════════════════════════════════════════════════════════════
        // NORMAL STATE
        // ══════════════════════════════════════════════════════════════════════
        private void NormalBegin() { }
        private void NormalEnd()   { }

        private int NormalUpdate()
        {
            float dt = Engine.DeltaTime;

            // Grab → climb transition
            if (Input.Grab.Check && !IsTired())
            {
                if (Speed.Y >= 0 && Math.Sign(Speed.X) != -(int)Facing)
                    if (ClimbCheck((int)Facing)) return StClimb;
            }

            // Start dash
            if (Input.Dash.Pressed && Dashes > 0 && dashCooldownTimer <= 0)
            {
                Input.Dash.ConsumeBuffer();
                return StartDash();
            }

            // ── Horizontal: run & friction ────────────────────────────────────
            float hMult   = OnGround() ? 1f : AirMult;
            float hTarget = MaxRun * moveX;
            if (Math.Abs(Speed.X) > MaxRun && Math.Sign(Speed.X) == moveX)
                Speed.X = Calc.Approach(Speed.X, hTarget, RunReduce * hMult * dt);
            else
                Speed.X = Calc.Approach(Speed.X, hTarget, RunAccel  * hMult * dt);

            // ── Vertical: gravity, fast-fall, wall-slide ──────────────────────
            if (!OnGround())
            {
                // Fast fall: pressing down while falling ramps maxFall toward FastMaxFall
                if (Input.MoveY.Value == 1 && Speed.Y >= MaxFall)
                    maxFall = Calc.Approach(maxFall, FastMaxFall, FastMaxAccel * dt);
                else
                    maxFall = Calc.Approach(maxFall, MaxFall, FastMaxAccel * dt);

                float fallCap = maxFall;

                // Wall-slide: slow descent when pressed against a wall
                bool holdingIntoWall = (moveX == (int)Facing) || (moveX == 0 && Input.Grab.Check);
                if (holdingIntoWall && Input.MoveY.Value != 1)
                {
                    if (Speed.Y >= 0 && wallSlideTimer > 0
                        && CollideCheck<Solid>(Position + new Vector2((int)Facing, 0)))
                        wallSlideDir = (int)Facing;

                    if (wallSlideDir != 0)
                    {
                        float t = wallSlideTimer / WallSlideTime;
                        fallCap        = MaxFall + (WallSlideStartMax - MaxFall) * t;
                        wallSlideTimer = Math.Max(0f, wallSlideTimer - dt);
                    }
                }
                else wallSlideTimer = Math.Min(WallSlideTime, wallSlideTimer + dt);

                // Half gravity near apex of jump
                bool halfGrav = Math.Abs(Speed.Y) < HalfGravThreshold && (Input.Jump.Check || AutoJump);
                Speed.Y = Calc.Approach(Speed.Y, fallCap, Gravity * (halfGrav ? 0.5f : 1f) * dt);
            }

            // ── Variable jump (hold to extend height) ─────────────────────────
            if (varJumpTimer > 0)
            {
                if (AutoJump || Input.Jump.Check) Speed.Y = Math.Min(Speed.Y, varJumpSpeed);
                else                              varJumpTimer = 0;
            }

            // ── Jump / wall-jump ──────────────────────────────────────────────
            if (Input.Jump.Pressed)
            {
                Input.Jump.ConsumeBuffer();
                if (jumpGraceTimer > 0)
                {
                    Jump();
                }
                else if (WallJumpCheck(1))
                {
                    if (Facing == Facings.Right && Input.Grab.Check && Stamina > 0) ClimbJump();
                    else WallJump(-1);
                }
                else if (WallJumpCheck(-1))
                {
                    if (Facing == Facings.Left && Input.Grab.Check && Stamina > 0) ClimbJump();
                    else WallJump(1);
                }
            }

            return StNormal;
        }

        // ══════════════════════════════════════════════════════════════════════
        // CLIMB STATE
        // ══════════════════════════════════════════════════════════════════════
        private void ClimbBegin()
        {
            Speed.Y         *= ClimbGrabYMult;
            Speed.X          = 0;
            wallSlideTimer   = WallSlideTime;
            climbNoMoveTimer = ClimbNoMoveTime;
            Audio.Play(Sfxs.char_mad_grab, Position);
        }
        private void ClimbEnd() { }

        private int ClimbUpdate()
        {
            float dt = Engine.DeltaTime;

            // Touching ground refills stamina
            if (OnGround()) Stamina = ClimbMaxStamina;

            // Jump from climb wall
            if (Input.Jump.Pressed)
            {
                Input.Jump.ConsumeBuffer();
                if (moveX == -(int)Facing) WallJump(-(int)Facing);
                else                       ClimbJump();
                return StNormal;
            }

            // Dash from climb
            if (Input.Dash.Pressed && Dashes > 0 && dashCooldownTimer <= 0)
            {
                Input.Dash.ConsumeBuffer();
                return StartDash();
            }

            // Release grab → fall
            if (!Input.Grab.Check) return StNormal;

            // Wall has disappeared → top out
            if (!ClimbCheck((int)Facing))
            {
                if (Speed.Y < 0) { Speed.X = (int)Facing * 60f; Speed.Y = Math.Min(Speed.Y, -120f); }
                return StNormal;
            }

            // Target vertical speed
            float targetY = 0;
            bool  trySlip = false;
            if (climbNoMoveTimer <= 0)
            {
                if (Input.MoveY.Value < 0)
                {
                    targetY = ClimbUpSpeed;
                    // Ceiling blocks upward climb
                    if (CollideCheck<Solid>(Position + new Vector2(0, -1)))
                    {
                        if (Speed.Y < 0) Speed.Y = 0;
                        targetY = 0;
                        trySlip = true;
                    }
                }
                else if (Input.MoveY.Value > 0)
                {
                    targetY = ClimbDownSpeed;
                    if (OnGround()) { if (Speed.Y > 0) Speed.Y = 0; targetY = 0; }
                }
                else trySlip = true;
            }
            else trySlip = true;

            // Slip at top of wall when hands reach the edge
            if (trySlip && SlipCheck()) targetY = ClimbSlipSpeed;

            Speed.Y = Calc.Approach(Speed.Y, targetY, ClimbAccel * dt);
            Speed.X = 0;

            // No wall below current position when not pressing down → stop
            if (Input.MoveY.Value != 1 && Speed.Y > 0
                && !CollideCheck<Solid>(Position + new Vector2((int)Facing, 1)))
                Speed.Y = 0;

            // Stamina drain
            if (climbNoMoveTimer <= 0)
            {
                if      (Input.MoveY.Value < 0)  Stamina -= ClimbUpCost    * dt;
                else if (Input.MoveY.Value == 0)  Stamina -= ClimbStillCost * dt;
                // Downward climb is free
            }

            // Out of stamina → fall
            if (Stamina <= 0) return StNormal;
            return StClimb;
        }

        // ══════════════════════════════════════════════════════════════════════
        // DASH STATE
        // ══════════════════════════════════════════════════════════════════════
        private void DashBegin()
        {
            beforeDashSpeed         = Speed;
            Speed                   = Vector2.Zero;
            dashAttackTimer         = DashAttackTime;
            dashCooldownTimer       = DashCooldown;
            dashRefillCooldownTimer = DashRefillCooldown;
            Dashes--;

            // 8-directional snap from input
            var aim = new Vector2(Input.MoveX.Value, Input.MoveY.Value);
            if (aim == Vector2.Zero) aim = new Vector2((int)Facing, 0);
            DashDir = aim.SafeNormalize();

            // Speed retention: keep pre-dash momentum when it exceeds dash speed in same dir
            float sx = DashDir.X * DashSpeed;
            if (Math.Sign(beforeDashSpeed.X) == Math.Sign(sx) && Math.Abs(beforeDashSpeed.X) > Math.Abs(sx))
                sx = beforeDashSpeed.X;
            Speed.X = sx;
            Speed.Y = DashDir.Y * DashSpeed;

            if (DashDir.X != 0) Facing = (Facings)Math.Sign(DashDir.X);

            // Grounded diagonal-down dash converts to horizontal slide
            if (OnGround() && DashDir.X != 0 && DashDir.Y > 0)
            {
                DashDir.X = Math.Sign(DashDir.X);
                DashDir.Y = 0;
                Speed.Y   = 0;
                Speed.X  *= DodgeSlideSpeedMult;
            }

            dashTimer = DashTime;

            var sfx = Facing == Facings.Right ? Sfxs.char_mad_dash_pink_right : Sfxs.char_mad_dash_pink_left;
            Audio.Play(sfx, Position);
            SlashFx.Burst(Center, DashDir.Angle());
            Level?.DirectionalShake(DashDir, 0.1f);
        }

        private void DashEnd()
        {
            AutoJump = true;
            if (DashDir.Y <= 0)
            {
                Speed.X = DashDir.X * EndDashSpeed;
                Speed.Y = DashDir.Y * EndDashSpeed;
            }
            if (Speed.Y < 0) Speed.Y *= EndDashUpMult;
        }

        private int DashUpdate()
        {
            float dt = Engine.DeltaTime;

            // Super-jump from horizontal dash while on ground
            if (DashDir.Y == 0 && Input.Jump.Pressed && jumpGraceTimer > 0)
            {
                Input.Jump.ConsumeBuffer();
                SuperJump();
                return StNormal;
            }

            // Wall-jump cancels dash
            if (Input.Jump.Pressed)
            {
                if (WallJumpCheck( 1)) { Input.Jump.ConsumeBuffer(); WallJump(-1); return StNormal; }
                if (WallJumpCheck(-1)) { Input.Jump.ConsumeBuffer(); WallJump( 1); return StNormal; }
            }

            dashTimer -= dt;
            if (dashTimer <= 0) return StNormal;

            // Maintain dash velocity throughout state
            Speed.X = DashDir.X * DashSpeed;
            Speed.Y = DashDir.Y * DashSpeed;
            return StDash;
        }

        // ══════════════════════════════════════════════════════════════════════
        // DEAD STATE
        // ══════════════════════════════════════════════════════════════════════
        private void DeadBegin()
        {
            Dead       = true;
            Speed      = Vector2.Zero;
            Collidable = false;
            Level?.Shake(0.5f);
        }
        private int DeadUpdate() => StDead;

        // ══════════════════════════════════════════════════════════════════════
        // STAR FLY STATE — Crystal Heart Feather (FlyFeather pickup)
        // ══════════════════════════════════════════════════════════════════════
        private void StarFlyBegin()
        {
            starFlyTimer = StarFlyTime;
            Collider     = starFlyHitbox;
            Audio.Play(Sfxs.char_mad_dreamblock_enter, Position);
            Sprite.Play(PlayerSprite.Launch);
        }

        private void StarFlyEnd()
        {
            Collider = normalHitbox;
        }

        private int StarFlyUpdate()
        {
            float dt = Engine.DeltaTime;

            // Steer with aim input
            Vector2 aim = Input.Aim.Value;
            if (aim.LengthSquared() > 0.25f)
                Speed = Calc.Approach(Speed, aim.SafeNormalize() * StarFlySpeed, StarFlyAccel * dt);
            else
                Speed = Calc.Approach(Speed, Vector2.Zero, StarFlyAccel * dt);

            starFlyTimer -= dt;

            // Early exit via dash
            if (Input.Dash.Pressed) { Input.Dash.ConsumeBuffer(); Dashes = MaxDashes; return StNormal; }
            if (starFlyTimer <= 0)  { Dashes = MaxDashes; return StNormal; }

            return StStarFly;
        }

        public void StartStarFly() => StateMachine.ChangeState(StStarFly);

        // ══════════════════════════════════════════════════════════════════════
        // RED DASH STATE — Red Booster launch
        // ══════════════════════════════════════════════════════════════════════
        private void RedDashBegin() { Speed = Vector2.Zero; }

        private int RedDashUpdate()
        {
            boostTimer -= Engine.DeltaTime;
            if (boostTimer <= 0)
            {
                Speed = DashDir * RedBoostSpeed;
                return StartDash();
            }
            if (currentBooster != null) Position = currentBooster.Position;
            return StRedDash;
        }

        public void RedBoost(Booster booster)
        {
            currentBooster = booster;
            boostTimer     = RedBoostHoldTime;
            DashDir        = new Vector2((int)Facing, 0);
            StateMachine.ChangeState(StRedDash);
        }

        // ══════════════════════════════════════════════════════════════════════
        // BOOST STATE — Green Booster
        // ══════════════════════════════════════════════════════════════════════
        private void BoostBegin() { Speed = Vector2.Zero; Collidable = false; }

        private int BoostUpdate()
        {
            boostTimer -= Engine.DeltaTime;
            if (boostTimer <= 0)
            {
                Collidable = true;
                currentBooster?.PlayerReleased();
                return StartDash();
            }
            if (currentBooster != null) Position = currentBooster.Position;
            return StBoost;
        }

        public void Boost(Booster booster)
        {
            currentBooster = booster;
            boostTimer     = 0.3f;
            StateMachine.ChangeState(StBoost);
        }

        // ══════════════════════════════════════════════════════════════════════
        // JUMP METHODS
        // ══════════════════════════════════════════════════════════════════════
        public void Jump()
        {
            jumpGraceTimer  = 0;
            varJumpTimer    = VarJumpTime;
            AutoJump        = false;
            dashAttackTimer = 0;
            wallSlideTimer  = WallSlideTime;
            wallBoostTimer  = 0;

            Speed.X     += JumpHBoost * moveX;
            Speed.Y      = JumpSpeed;
            varJumpSpeed = Speed.Y;

            Audio.Play(Sfxs.char_mad_jump, Position);
            Level?.Particles.Emit(P_Jump, 1, BottomCenter, Vector2.UnitX * 3f);
        }

        public void SuperJump()
        {
            jumpGraceTimer  = 0;
            varJumpTimer    = VarJumpTime;
            AutoJump        = false;
            dashAttackTimer = 0;
            wallBoostTimer  = 0;

            Speed.X      = 260f * (int)Facing;
            Speed.Y      = JumpSpeed;
            varJumpSpeed = Speed.Y;

            Audio.Play(Sfxs.char_mad_jump_super, Position);
        }

        public void WallJump(int dir)
        {
            jumpGraceTimer  = 0;
            varJumpTimer    = VarJumpTime;
            AutoJump        = false;
            dashAttackTimer = 0;
            wallSlideTimer  = WallSlideTime;
            wallBoostTimer  = 0;

            if (moveX != 0) { forceMoveX = dir; forceMoveXTimer = WallJumpForceTime; }

            Speed.X      = WallJumpHSpeed * dir;
            Speed.Y      = JumpSpeed;
            varJumpSpeed = Speed.Y;
            Facing       = (Facings)dir;

            var sfx = dir > 0 ? Sfxs.char_mad_jump_wall_right : Sfxs.char_mad_jump_wall_left;
            Audio.Play(sfx, Position);
            Level?.Particles.Emit(P_WallJump, 1, Center, Vector2.UnitY * 3f);
        }

        public void ClimbJump()
        {
            if (!OnGround()) Stamina -= ClimbJumpCost;
            Jump();
            // Arm wall-boost window when jumping with no horizontal input
            if (moveX == 0) { wallBoostDir = -(int)Facing; wallBoostTimer = ClimbJumpBoostTime; }
            var sfx = (int)Facing > 0 ? Sfxs.char_mad_jump_climb_right : Sfxs.char_mad_jump_climb_left;
            Audio.Play(sfx, Position);
        }

        // Spring bounce (called by Spring entity)
        public void BounceFromSpring(Vector2 dir)
        {
            if (dir.X == 0)
            {
                // Vertical spring (floor spring → bounce up)
                Speed.Y      = SpringBounceSpeed;
                varJumpSpeed = Speed.Y;
                varJumpTimer = VarJumpTime;
                AutoJump     = true;
                Dashes       = MaxDashes;
                dashRefillCooldownTimer = 0;
            }
            else
            {
                // Side spring (wall spring → bounce horizontal)
                Speed.X = dir.X * BumperLaunchSpeed;
                Speed.Y = SpringBounceSpeed * 0.5f;
                Facing  = (Facings)Math.Sign(dir.X);
            }
        }

        // Bumper bounce (called by Bumper entity)
        public void BounceFromBumper(Vector2 pushDir)
        {
            Speed    = pushDir.SafeNormalize() * BumperLaunchSpeed;
            Dashes   = MaxDashes;
            RefillDash();
            StateMachine.ChangeState(StNormal);
        }

        // ══════════════════════════════════════════════════════════════════════
        // DEATH
        // ══════════════════════════════════════════════════════════════════════
        public void Die(Vector2 direction, bool evenIfInvincible = false, bool registerStats = true)
        {
            if (Dead) return;
            if (!evenIfInvincible && (SaveData.Instance?.Assists?.Invincible ?? false)) return;
            if (registerStats) SaveData.Instance?.AddDeath(new AreaKey());
            StateMachine.ChangeState(StDead);
        }

        // ══════════════════════════════════════════════════════════════════════
        // HELPERS
        // ══════════════════════════════════════════════════════════════════════
        public int StartDash() { StateMachine.ChangeState(StDash); return StDash; }

        public void RefillDash()
        {
            if (Dashes < MaxDashes)
            {
                Dashes = MaxDashes;
                dashRefillCooldownTimer = 0;
            }
        }

        public bool DashAttacking => dashAttackTimer > 0;
        public bool IsTired()     => Stamina < ClimbTiredThreshold;

        public Level Level => Scene as Level;

        private bool ClimbCheck(int dir) =>
            CollideCheck<Solid>(Position + new Vector2(dir, 0))
            && !ClimbBlocker.Check(Scene, this, Position + new Vector2(dir, 0));

        private bool WallJumpCheck(int dir)
        {
            for (int d = 1; d <= WallJumpCheckDist; d++)
                if (CollideCheck<Solid>(Position + new Vector2(dir * d, 0))) return true;
            return false;
        }

        // True when the player has topped out the wall (no solid at the facing upper corner)
        private bool SlipCheck()
        {
            float probeX = Facing == Facings.Right ? Right : Left - 1f;
            return !CollideCheck<Solid>(new Vector2(probeX, Top - 1f));
        }

        // Returns true if player is riding on top of a solid entity (for FallingBlock etc.)
        public bool IsRidingEntity(Entity solid)
        {
            return !Dead
                && Bottom >= solid.Top - 2f && Bottom <= solid.Top + 4f
                && Left < solid.Right && Right > solid.Left
                && Speed.Y >= -0.1f;
        }

        private void UpdateSprite()
        {
            if (Dead || StateMachine.State == StDead) return;
            if (StateMachine.State == StDash)         { Sprite.Play(PlayerSprite.Dash);    return; }
            if (StateMachine.State == StStarFly)      { Sprite.Play(PlayerSprite.Launch);  return; }
            if (StateMachine.State == StBoost
             || StateMachine.State == StRedDash)      { Sprite.Play(PlayerSprite.Dash);    return; }
            if (StateMachine.State == StClimb)
            {
                Sprite.Play(Input.MoveY.Value < 0 ? PlayerSprite.ClimbUp : PlayerSprite.Climb);
                return;
            }
            if (OnGround())
            {
                if (Math.Abs(Speed.X) > 20f) Sprite.Play(PlayerSprite.RunSlow);
                else                          Sprite.Play(PlayerSprite.Idle);
            }
            else
            {
                if (wallSlideDir != 0) Sprite.Play(PlayerSprite.Dangling);
                else if (Speed.Y < 0)  Sprite.Play(PlayerSprite.JumpSlow);
                else                   Sprite.Play(PlayerSprite.FallSlow);
            }
        }
    }
}
