// GameEntities.cs — Full C# implementations of all major Celeste game entities.
//
// Entities implemented:
//   Spring, Bumper, DashCrystal, DashBlock, CrumbleBlock, FallingBlock,
//   DashSwitch, TouchSwitch, TouchSwitchGate,
//   Kevin (CrushBlock), Key, Lock,
//   GoldenStrawberry, RedBooster, EnticeBlade, BlueTorch,
//   JumpThrough, Spikes (extended), FlyFeather (extended)
//
// Each entity uses the Monocle stub infrastructure (CollideFirst<T>, Scene.Tracker, etc.)
// All audio/particle calls are no-ops in the scaffold but the call sites are present.
using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    // ══════════════════════════════════════════════════════════════════════════
    // SPRING — Bounces the player upward (floor) or outward (wall)
    // ══════════════════════════════════════════════════════════════════════════
    public class Spring : Entity
    {
        public enum Orientations { Floor, WallLeft, WallRight }

        public Orientations Orientation;

        private static readonly ParticleType P_Burst = new ParticleType();

        private float cooldownTimer;

        public Spring(Vector2 position, Orientations orientation = Orientations.Floor)
        {
            Position    = position;
            Orientation = orientation;

            switch (orientation)
            {
                case Orientations.Floor:
                    Collider = new Hitbox(16, 6, -8, -6);
                    break;
                case Orientations.WallLeft:
                    Collider = new Hitbox(6, 16, 0, -8);
                    break;
                case Orientations.WallRight:
                    Collider = new Hitbox(6, 16, -6, -8);
                    break;
            }
        }

        public override void Update()
        {
            if (cooldownTimer > 0) { cooldownTimer -= Engine.DeltaTime; return; }

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            switch (Orientation)
            {
                case Orientations.Floor:
                    // Only bounce the player when they are falling onto the spring
                    if (player.Speed.Y >= 0 && player.Bottom <= Top + 4f)
                    {
                        BouncePlayer(player, new Vector2(0, -1));
                    }
                    break;
                case Orientations.WallLeft:
                    if (player.Speed.X <= 0)
                        BouncePlayer(player, new Vector2(1, 0));
                    break;
                case Orientations.WallRight:
                    if (player.Speed.X >= 0)
                        BouncePlayer(player, new Vector2(-1, 0));
                    break;
            }
        }

        private void BouncePlayer(Player player, Vector2 dir)
        {
            player.BounceFromSpring(dir);
            cooldownTimer = 0.4f;
            Audio.Play(Sfxs.char_mad_jump, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Burst, 5, Position, Vector2.One * 4f);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUMPER — Bounces the player in any direction away from its center
    // ══════════════════════════════════════════════════════════════════════════
    public class Bumper : Entity
    {
        private static readonly ParticleType P_Launch = new ParticleType();
        private static readonly ParticleType P_Ambience = new ParticleType();

        public const float Radius = 12f;
        private float cooldownTimer;

        public Bumper(Vector2 position)
        {
            Position = position;
            Collider = new Hitbox(Radius * 2f, Radius * 2f, -Radius, -Radius);
        }

        public override void Update()
        {
            if (cooldownTimer > 0) { cooldownTimer -= Engine.DeltaTime; return; }

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            Vector2 push = player.Center - Center;
            if (push == Vector2.Zero) push = Vector2.UnitY * -1f;

            player.BounceFromBumper(push);
            cooldownTimer = 0.5f;
            Audio.Play(Sfxs.char_mad_jump, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Launch, 8, Center, Vector2.One * Radius);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DASH CRYSTAL (DashRefill) — Refills one dash when touched
    // ══════════════════════════════════════════════════════════════════════════
    public class DashCrystal : Entity
    {
        private static readonly ParticleType P_Shatter = new ParticleType();
        private static readonly ParticleType P_Regen   = new ParticleType();
        private static readonly ParticleType P_Glow    = new ParticleType();

        private bool collected;
        private float respawnTimer;

        public DashCrystal(Vector2 position)
        {
            Position = position;
            Collider = new Hitbox(16, 16, -8, -8);
        }

        public override void Update()
        {
            if (collected)
            {
                respawnTimer -= Engine.DeltaTime;
                if (respawnTimer <= 0) Respawn();
                return;
            }

            var player = CollideFirst<Player>();
            if (player == null || player.Dead || player.Dashes >= player.MaxDashes) return;

            player.RefillDash();
            Collect(player);
        }

        private void Collect(Player player)
        {
            collected    = true;
            respawnTimer = 2.5f;
            Collidable   = false;
            Audio.Play(Sfxs.char_mad_revive, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Shatter, 5, Position, Vector2.One * 6f);
        }

        private void Respawn()
        {
            collected  = false;
            Collidable = true;
            Scene?.As<Level>()?.Particles.Emit(P_Regen, 5, Position, Vector2.One * 4f);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DASH BLOCK — Solid block that shatters when the player dashes into it
    // ══════════════════════════════════════════════════════════════════════════
    public class DashBlock : Solid
    {
        public enum Directions { Any, Left, Right, Up, Down }

        private static readonly ParticleType P_Break = new ParticleType();

        public Directions BreakDir;
        public bool Permanent;         // if true, does not respawn

        private bool broken;
        private float respawnTimer;

        public DashBlock(Vector2 position, float width, float height,
                         Directions breakDir = Directions.Any, bool permanent = false)
        {
            Position  = position;
            Collider  = new Hitbox(width, height);
            BreakDir  = breakDir;
            Permanent = permanent;
        }

        public override void Update()
        {
            if (broken)
            {
                if (!Permanent)
                {
                    respawnTimer -= Engine.DeltaTime;
                    if (respawnTimer <= 0) Rebuild();
                }
                return;
            }

            var player = CollideFirst<Player>();
            if (player == null || !player.DashAttacking) return;

            // Check dash direction matches allowed break direction
            if (BreakDir != Directions.Any)
            {
                var d = player.DashDir;
                bool match = BreakDir == Directions.Left  && d.X < -0.5f
                          || BreakDir == Directions.Right && d.X >  0.5f
                          || BreakDir == Directions.Up    && d.Y < -0.5f
                          || BreakDir == Directions.Down  && d.Y >  0.5f;
                if (!match) return;
            }

            Break(player);
        }

        private void Break(Player player)
        {
            broken     = true;
            Collidable = false;
            Scene?.As<Level>()?.Shake(0.2f);
            Scene?.As<Level>()?.Particles.Emit(P_Break, 10, Center, Vector2.One * 8f);
            Audio.Play(Sfxs.char_mad_jump, Position); // placeholder sfx
            if (!Permanent) respawnTimer = 3.0f;
        }

        private void Rebuild()
        {
            broken     = false;
            Collidable = true;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CRUMBLE BLOCK — Solid platform that crumbles when stood on
    // ══════════════════════════════════════════════════════════════════════════
    public class CrumbleBlock : Solid
    {
        private static readonly ParticleType P_Crumble = new ParticleType();

        private enum CrumbleState { Solid, Shaking, Broken }

        private CrumbleState state = CrumbleState.Solid;
        private float shakeTimer;
        private float respawnTimer;

        public CrumbleBlock(Vector2 position, float width)
        {
            Position = position;
            Collider = new Hitbox(width, 8f);
        }

        public override void Update()
        {
            float dt = Engine.DeltaTime;

            switch (state)
            {
                case CrumbleState.Solid:
                {
                    // Check if any player is resting on top of this block
                    var player = FindPlayerOnTop();
                    if (player != null) { state = CrumbleState.Shaking; shakeTimer = 0.6f; }
                    break;
                }
                case CrumbleState.Shaking:
                {
                    shakeTimer -= dt;
                    if (shakeTimer <= 0) Crumble();
                    else { /* visual shake handled by renderer */ }
                    break;
                }
                case CrumbleState.Broken:
                {
                    respawnTimer -= dt;
                    if (respawnTimer <= 0) Rebuild();
                    break;
                }
            }
        }

        private Player FindPlayerOnTop()
        {
            foreach (var e in Scene?.Tracker.GetEntities<Player>() ?? new List<Entity>())
            {
                var p = (Player)e;
                if (p.IsRidingEntity(this)) return p;
            }
            return null;
        }

        private void Crumble()
        {
            state        = CrumbleState.Broken;
            Collidable   = false;
            respawnTimer = 2.0f;
            Scene?.As<Level>()?.Particles.Emit(P_Crumble, 8, Center, Vector2.One * 5f);
            Audio.Play(Sfxs.char_mad_footstep, Position);
        }

        private void Rebuild()
        {
            state      = CrumbleState.Solid;
            Collidable = true;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FALLING BLOCK — Solid block that falls after the player stands on it
    // ══════════════════════════════════════════════════════════════════════════
    public class FallingBlock : Solid
    {
        private static readonly ParticleType P_FallDust = new ParticleType();

        private enum FallState { Idle, Shaking, Falling, Landed }

        private FallState state = FallState.Idle;
        private float shakeTimer;
        private float landedTimer;

        public FallingBlock(Vector2 position, float width, float height)
        {
            Position = position;
            Collider = new Hitbox(width, height);
        }

        public override void Update()
        {
            float dt = Engine.DeltaTime;

            switch (state)
            {
                case FallState.Idle:
                {
                    var player = FindPlayerOnTop();
                    if (player != null) { state = FallState.Shaking; shakeTimer = 0.4f; }
                    break;
                }
                case FallState.Shaking:
                {
                    shakeTimer -= dt;
                    if (shakeTimer <= 0) state = FallState.Falling;
                    break;
                }
                case FallState.Falling:
                {
                    // Accelerate downward and move block
                    LiftSpeed.Y = Calc.Approach(LiftSpeed.Y, 200f, 500f * dt);
                    float delta = LiftSpeed.Y * dt;
                    MoveVCollideSolids(delta);

                    if (CollideCheck<Solid>(Position + new Vector2(0, 1)))
                    {
                        // Hit the ground
                        state       = FallState.Landed;
                        LiftSpeed   = Vector2.Zero;
                        landedTimer = 1.5f;
                        Scene?.As<Level>()?.Shake(0.2f);
                        Scene?.As<Level>()?.Particles.Emit(P_FallDust, 10, BottomCenter, Vector2.One * 6f);
                    }
                    break;
                }
                case FallState.Landed:
                {
                    landedTimer -= dt;
                    // Block stays landed permanently (no respawn in this implementation)
                    break;
                }
            }
        }

        // Move the block downward, resolving against other solids
        private void MoveVCollideSolids(float amount)
        {
            Position.Y += amount;
            // In a full implementation, we'd push riders and resolve against other solids.
            // For the scaffold, we simply move and let OnGround checks detect the floor.
        }

        private Player FindPlayerOnTop()
        {
            foreach (var e in Scene?.Tracker.GetEntities<Player>() ?? new List<Entity>())
            {
                var p = (Player)e;
                if (p.IsRidingEntity(this)) return p;
            }
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DASH SWITCH — Activated by a dash collision; triggers gates
    // ══════════════════════════════════════════════════════════════════════════
    public class DashSwitch : Entity
    {
        public string GroupId;
        public bool   Activated { get; private set; }

        private static readonly ParticleType P_Activate = new ParticleType();

        // Global registry: groupId → list of switches (scaffold uses Scene-level tracking)
        public static event Action<string> OnGroupActivated;

        public DashSwitch(Vector2 position, string groupId = "default")
        {
            Position = position;
            GroupId  = groupId;
            Collider = new Hitbox(16, 16, -8, -8);
        }

        public override void Update()
        {
            if (Activated) return;

            var player = CollideFirst<Player>();
            if (player == null || !player.DashAttacking) return;

            Activate(player);
        }

        private void Activate(Player player)
        {
            Activated = true;
            Audio.Play(Sfxs.char_mad_jump, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Activate, 6, Center, Vector2.One * 5f);

            // Check if all switches in this group are activated
            bool allDone = true;
            foreach (var e in Scene?.Tracker.GetEntities<DashSwitch>() ?? new List<Entity>())
            {
                var sw = (DashSwitch)e;
                if (sw.GroupId == GroupId && !sw.Activated) { allDone = false; break; }
            }
            if (allDone) OnGroupActivated?.Invoke(GroupId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TOUCH SWITCH — Activated by player presence
    // ══════════════════════════════════════════════════════════════════════════
    public class TouchSwitch : Entity
    {
        public string GroupId;
        public bool   Activated { get; private set; }

        public static event Action<string> OnGroupActivated;

        private static readonly ParticleType P_Activate = new ParticleType();

        public TouchSwitch(Vector2 position, string groupId = "default")
        {
            Position = position;
            GroupId  = groupId;
            Collider = new Hitbox(16, 16, -8, -8);
        }

        public override void Update()
        {
            if (Activated) return;

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            Activate(player);
        }

        private void Activate(Player player)
        {
            Activated = true;
            Audio.Play(Sfxs.char_mad_stand, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Activate, 4, Center, Vector2.One * 4f);

            // Check if all touch switches in this group are activated
            bool allDone = true;
            foreach (var e in Scene?.Tracker.GetEntities<TouchSwitch>() ?? new List<Entity>())
            {
                var sw = (TouchSwitch)e;
                if (sw.GroupId == GroupId && !sw.Activated) { allDone = false; break; }
            }
            if (allDone) OnGroupActivated?.Invoke(GroupId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TOUCH SWITCH GATE — Solid gate that slides open when its group activates
    // ══════════════════════════════════════════════════════════════════════════
    public class TouchSwitchGate : Solid
    {
        public string GroupId;

        private bool    opening;
        private bool    open;
        private Vector2 openTarget;   // position to slide toward
        private float   openSpeed;

        private static readonly ParticleType P_Open = new ParticleType();

        public TouchSwitchGate(Vector2 position, float width, float height,
                               string groupId, Vector2 openDirection, float slideDistance = 32f)
        {
            Position   = position;
            Collider   = new Hitbox(width, height);
            GroupId    = groupId;
            openTarget = position + openDirection.SafeNormalize() * slideDistance;
            openSpeed  = 60f;

            // Subscribe to both types of switch events
            TouchSwitch.OnGroupActivated += OnGroupActivated;
            DashSwitch.OnGroupActivated  += OnGroupActivated;
        }

        private void OnGroupActivated(string groupId)
        {
            if (groupId == GroupId && !open && !opening)
            {
                opening = true;
                Scene?.As<Level>()?.Particles.Emit(P_Open, 8, Center, Vector2.One * 6f);
                Audio.Play(Sfxs.char_mad_grab, Position);
            }
        }

        public override void Update()
        {
            if (!opening || open) return;

            Position = Calc.Approach(Position, openTarget, openSpeed * Engine.DeltaTime);
            if (Position == openTarget)
            {
                open       = true;
                Collidable = false;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // KEVIN (CrushBlock) — Solid block that launches when dashed into,
    // crushing the player if they are pinned between Kevin and a wall.
    // ══════════════════════════════════════════════════════════════════════════
    public class Kevin : Solid
    {
        public enum Axes { Both, Horizontal, Vertical }

        private static readonly ParticleType P_Move  = new ParticleType();
        private static readonly ParticleType P_Crush = new ParticleType();

        private Vector2 startPosition;
        private Vector2 returnTarget;
        private float   launchSpeed;
        private float   returnSpeed;
        private float   currentSpeed;
        private bool    launching;
        private bool    returning;
        private Vector2 launchDir;

        public Axes AllowedAxes;

        public Kevin(Vector2 position, float width, float height, Axes axes = Axes.Both)
        {
            Position       = position;
            Collider       = new Hitbox(width, height);
            startPosition  = position;
            AllowedAxes    = axes;
            launchSpeed    = 240f;
            returnSpeed    = 60f;
        }

        public override void Update()
        {
            float dt = Engine.DeltaTime;

            if (launching)
            {
                currentSpeed = Calc.Approach(currentSpeed, launchSpeed, 800f * dt);
                Vector2 delta = launchDir * currentSpeed * dt;

                // Move until hitting something
                bool hitH = MoveHCheckCollision(delta.X);
                bool hitV = MoveVCheckCollision(delta.Y);

                if (hitH || hitV)
                {
                    launching    = false;
                    returning    = true;
                    currentSpeed = 0;
                    returnTarget = startPosition;
                    CrushCheck();
                    Scene?.As<Level>()?.Shake(0.2f);
                }
                return;
            }

            if (returning)
            {
                currentSpeed = Calc.Approach(currentSpeed, returnSpeed, 200f * dt);
                Position     = Calc.Approach(Position, returnTarget, currentSpeed * dt);
                if (Position == returnTarget) returning = false;
                return;
            }

            // Check if player dashes into Kevin
            var player = CollideFirst<Player>();
            if (player == null || !player.DashAttacking) return;

            Vector2 dir = player.DashDir;
            if (dir == Vector2.Zero) return;

            // Restrict to allowed axes
            if (AllowedAxes == Axes.Horizontal) dir.Y = 0;
            if (AllowedAxes == Axes.Vertical)   dir.X = 0;
            if (dir == Vector2.Zero) return;

            launchDir    = new Vector2(Math.Sign(dir.X), Math.Sign(dir.Y));
            launching    = true;
            currentSpeed = 0;
            Audio.Play(Sfxs.char_mad_jump, Position);
        }

        private bool MoveHCheckCollision(float amount)
        {
            Position.X += amount;
            return CollideCheck<Solid>(Position + new Vector2(Math.Sign(amount), 0));
        }

        private bool MoveVCheckCollision(float amount)
        {
            Position.Y += amount;
            return CollideCheck<Solid>(Position + new Vector2(0, Math.Sign(amount)));
        }

        private void CrushCheck()
        {
            // Kill any player that is now inside Kevin (pinned)
            foreach (var e in Scene?.Tracker.GetEntities<Player>() ?? new List<Entity>())
            {
                var p = (Player)e;
                if (!p.Dead && CollideCheck(p))
                {
                    Scene?.As<Level>()?.Particles.Emit(P_Crush, 10, p.Center, Vector2.One * 5f);
                    p.Die(launchDir);
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // KEY — Collectible item that opens Locks
    // ══════════════════════════════════════════════════════════════════════════
    public class Key : Entity
    {
        private static readonly ParticleType P_Collect = new ParticleType();

        public bool Collected { get; private set; }

        public Key(Vector2 position)
        {
            Position = position;
            Collider = new Hitbox(16, 16, -8, -8);
        }

        public override void Update()
        {
            if (Collected) return;

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            // Player picks up key with Grab or by simply touching it
            if (Input.Grab.Pressed || CollideCheck(player))
                Collect(player);
        }

        private void Collect(Player player)
        {
            Collected  = true;
            Collidable = false;
            Visible    = false;
            Audio.Play(Sfxs.char_mad_grab, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Collect, 8, Position, Vector2.One * 5f);

            // Notify all Locks in the scene that a key was collected
            foreach (var e in Scene?.Tracker.GetEntities<Lock>() ?? new List<Entity>())
                ((Lock)e).NotifyKeyCollected();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LOCK — Solid door that opens when all Keys in the scene are collected
    // ══════════════════════════════════════════════════════════════════════════
    public class Lock : Solid
    {
        private static readonly ParticleType P_Open = new ParticleType();

        private bool open;
        private bool opening;
        private float openTimer;

        public Lock(Vector2 position, float width, float height)
        {
            Position = position;
            Collider = new Hitbox(width, height);
        }

        public void NotifyKeyCollected()
        {
            // Check whether all keys are collected
            foreach (var e in Scene?.Tracker.GetEntities<Key>() ?? new List<Entity>())
                if (!((Key)e).Collected) return;

            if (!open && !opening) Open();
        }

        private void Open()
        {
            opening   = true;
            openTimer = 0.5f;
            Audio.Play(Sfxs.char_mad_jump, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Open, 10, Center, Vector2.One * 8f);
        }

        public override void Update()
        {
            if (!opening || open) return;
            openTimer -= Engine.DeltaTime;
            if (openTimer <= 0)
            {
                open       = true;
                Collidable = false;
                Visible    = false;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GOLDEN STRAWBERRY — Special collectible requiring a flawless run
    // ══════════════════════════════════════════════════════════════════════════
    public class GoldenStrawberry : Entity
    {
        private static readonly ParticleType P_Collect  = new ParticleType();
        private static readonly ParticleType P_FlyAway  = new ParticleType();

        public bool Collected   { get; private set; }
        public bool FlewAway    { get; private set; }

        private bool followingPlayer;
        private float collectTimer;
        private Vector2 flyTarget;
        private float flySpeed;

        public GoldenStrawberry(Vector2 position)
        {
            Position     = position;
            Collider     = new Hitbox(14, 14, -7, -7);
            collectTimer = 0.5f;  // brief collect delay
        }

        public override void Update()
        {
            if (Collected || FlewAway) return;

            float dt = Engine.DeltaTime;

            // Fly away if player died or used too many dashes
            if (ShouldFlyAway())
            {
                FlyAway();
                return;
            }

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            if (!followingPlayer)
            {
                followingPlayer = true;
                collectTimer    = 0.5f;
            }

            collectTimer -= dt;
            if (collectTimer <= 0) Collect(player);
        }

        private bool ShouldFlyAway()
        {
            // Fly away if the player has died (tracked via SaveData) or used extra dashes
            // Simplified: if SaveData shows a death this level, fly away
            if (SaveData.Instance?.TotalDeathsInCurrentLevel > 0) return true;
            return false;
        }

        private void FlyAway()
        {
            FlewAway   = true;
            Collidable = false;
            flyTarget  = Position + new Vector2(0, -200f);
            flySpeed   = 120f;
            Scene?.As<Level>()?.Particles.Emit(P_FlyAway, 6, Position, Vector2.One * 5f);
        }

        private void Collect(Player player)
        {
            Collected  = true;
            Collidable = false;
            Visible    = false;
            Audio.Play(Sfxs.char_mad_revive, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Collect, 12, Position, Vector2.One * 8f);
            Scene?.As<Level>()?.Flash(new Color(255, 215, 0), true);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RED BOOSTER — Extended Booster variant with red launch mechanics
    // ══════════════════════════════════════════════════════════════════════════
    public class RedBooster : Booster
    {
        private static readonly ParticleType P_RedBurst   = new ParticleType();
        private static readonly ParticleType P_RedLaunch  = new ParticleType();

        private float rechargeTimer;
        private bool  playerInside;

        public RedBooster(Vector2 position)
        {
            Position    = position;
            Collider    = new Hitbox(16, 16, -8, -8);
            RedBoost    = true;
        }

        public override void Update()
        {
            float dt = Engine.DeltaTime;

            if (rechargeTimer > 0) { rechargeTimer -= dt; return; }

            var player = CollideFirst<Player>();

            if (BoostingPlayer)
            {
                // Player has left range → release
                if (player == null) { BoostingPlayer = false; playerInside = false; }
                return;
            }

            if (player == null || player.Dead)
            {
                playerInside = false;
                return;
            }

            if (!playerInside)
            {
                playerInside  = true;
                BoostingPlayer = true;
                player.RedBoost(this);
                rechargeTimer = 1.0f;
                Audio.Play(Sfxs.char_mad_dash_red_right, Position);
                Scene?.As<Level>()?.Particles.Emit(P_RedBurst, 8, Position, Vector2.One * 8f);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ENTICE BLADE — Rotating blade hazard that kills on contact
    // Moves along a path (linear or circular) while spinning visually.
    // ══════════════════════════════════════════════════════════════════════════
    public class EnticeBlade : Entity
    {
        public enum PathType { Circular, Linear }

        private static readonly ParticleType P_Trail = new ParticleType();

        public PathType Path;

        // Circular path parameters
        private Vector2 orbitCenter;
        private float   orbitRadius;
        private float   orbitAngle;
        private float   orbitSpeed;  // radians/sec

        // Linear path parameters
        private Vector2 pointA;
        private Vector2 pointB;
        private float   travelSpeed;
        private float   travelT;
        private float   travelDir = 1f;

        // Visual rotation (independent of movement)
        private float spinAngle;
        private float spinSpeed = MathHelper.TwoPi * 2f; // 2 rotations/sec

        public static EnticeBlade CreateCircular(Vector2 center, float radius,
                                                  float startAngle = 0, float speed = MathHelper.Pi)
        {
            var blade = new EnticeBlade();
            blade.Path        = PathType.Circular;
            blade.orbitCenter = center;
            blade.orbitRadius = radius;
            blade.orbitAngle  = startAngle;
            blade.orbitSpeed  = speed;
            blade.Position    = center + new Vector2((float)Math.Cos(startAngle) * radius,
                                                     (float)Math.Sin(startAngle) * radius);
            blade.Collider    = new Hitbox(12, 12, -6, -6);
            return blade;
        }

        public static EnticeBlade CreateLinear(Vector2 a, Vector2 b, float speed = 80f)
        {
            var blade = new EnticeBlade();
            blade.Path        = PathType.Linear;
            blade.pointA      = a;
            blade.pointB      = b;
            blade.travelSpeed = speed;
            blade.Position    = a;
            blade.Collider    = new Hitbox(12, 12, -6, -6);
            return blade;
        }

        private EnticeBlade() { }

        public override void Update()
        {
            float dt = Engine.DeltaTime;
            spinAngle = (spinAngle + spinSpeed * dt) % MathHelper.TwoPi;

            switch (Path)
            {
                case PathType.Circular:
                    orbitAngle += orbitSpeed * dt;
                    Position = orbitCenter + new Vector2(
                        (float)Math.Cos(orbitAngle) * orbitRadius,
                        (float)Math.Sin(orbitAngle) * orbitRadius);
                    break;

                case PathType.Linear:
                    travelT += travelDir * travelSpeed * dt / (pointB - pointA).Length();
                    if (travelT >= 1f) { travelT = 1f; travelDir = -1f; }
                    if (travelT <= 0f) { travelT = 0f; travelDir =  1f; }
                    Position = new Vector2(
                        MathHelper.Lerp(pointA.X, pointB.X, travelT),
                        MathHelper.Lerp(pointA.Y, pointB.Y, travelT));
                    break;
            }

            // Kill player on contact
            var player = CollideFirst<Player>();
            if (player != null && !player.Dead)
                player.Die((player.Center - Center).SafeNormalize());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BLUE TORCH — Environmental light source that can be lit or extinguished.
    // When all blue torches in the room are lit, triggers an event.
    // ══════════════════════════════════════════════════════════════════════════
    public class BlueTorch : Entity
    {
        public bool Lit       { get; private set; }
        public string GroupId;

        public static event Action<string> OnAllLit;

        private static readonly ParticleType P_Ignite = new ParticleType();
        private static readonly ParticleType P_Ember  = new ParticleType();

        private float emberTimer;

        public BlueTorch(Vector2 position, string groupId = "default", bool startLit = false)
        {
            Position = position;
            GroupId  = groupId;
            Lit      = startLit;
            Collider = new Hitbox(8, 20, -4, -20);  // narrow vertical trigger
        }

        public override void Update()
        {
            float dt = Engine.DeltaTime;

            // Emit ember particles while lit
            if (Lit)
            {
                emberTimer -= dt;
                if (emberTimer <= 0)
                {
                    emberTimer = 0.15f;
                    Scene?.As<Level>()?.Particles.Emit(P_Ember, 1,
                        Position + new Vector2(0, -16f), Vector2.One * 3f);
                }
            }

            // Player can light the torch by touching or dashing through
            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            bool playerActivating = player.DashAttacking || CollideCheck(player);
            if (!playerActivating) return;

            if (!Lit) Light(player);
        }

        public void Light(Player player = null)
        {
            if (Lit) return;
            Lit = true;
            Audio.Play(Sfxs.char_mad_jump, Position);  // placeholder sfx
            Scene?.As<Level>()?.Particles.Emit(P_Ignite, 6, Position + new Vector2(0, -12f),
                                               Vector2.One * 4f);

            // Check if all torches in group are now lit
            bool allLit = true;
            foreach (var e in Scene?.Tracker.GetEntities<BlueTorch>() ?? new List<Entity>())
            {
                var t = (BlueTorch)e;
                if (t.GroupId == GroupId && !t.Lit) { allLit = false; break; }
            }
            if (allLit) OnAllLit?.Invoke(GroupId);
        }

        public void Extinguish()
        {
            Lit = false;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // JUMP THROUGH — Platform that can be jumped through from below
    // (Extends the stub with full one-way collision logic)
    // ══════════════════════════════════════════════════════════════════════════
    public class JumpThrough : JumpThru
    {
        public JumpThrough(Vector2 position, float width)
        {
            Position = position;
            Collider = new Hitbox(width, 8f);
        }

        // Whether the player is currently "passing through" from below
        public bool IsPassable(Player player)
        {
            // Passable from below: player's bottom was below our top last frame
            return player.Speed.Y < 0 || player.Bottom > Top;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SPIKES — Directional instant-kill hazard (extends stub with behavior)
    // ══════════════════════════════════════════════════════════════════════════
    public class SpikeHazard : Entity
    {
        public enum Directions { Up, Down, Left, Right }

        public Directions SpikeDir;

        public SpikeHazard(Vector2 position, float size, Directions dir)
        {
            Position = position;
            SpikeDir = dir;

            switch (dir)
            {
                case Directions.Up:    Collider = new Hitbox(size, 3f, 0, -3f); break;
                case Directions.Down:  Collider = new Hitbox(size, 3f, 0,  0f); break;
                case Directions.Left:  Collider = new Hitbox(3f, size, -3f, 0); break;
                case Directions.Right: Collider = new Hitbox(3f, size, 0f,  0); break;
            }
        }

        public override void Update()
        {
            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            // Determine kill direction based on spike orientation
            Vector2 killDir = SpikeDir switch {
                Directions.Up    => new Vector2(0, -1),
                Directions.Down  => new Vector2(0,  1),
                Directions.Left  => new Vector2(-1, 0),
                Directions.Right => new Vector2( 1, 0),
                _ => Vector2.Zero
            };

            // Dashing away in same frame is safe (the spike grace window)
            if (player.DashAttacking && Vector2.Dot(player.DashDir, killDir) < -0.5f) return;

            player.Die(killDir);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FLY FEATHER (Extended) — Gives the player the StarFly state
    // ══════════════════════════════════════════════════════════════════════════
    public class FlyFeatherPickup : FlyFeather
    {
        private bool collected;
        private float respawnTimer;

        private static readonly ParticleType P_Collect = new ParticleType();
        private static readonly ParticleType P_Regen   = new ParticleType();

        public FlyFeatherPickup(Vector2 position)
        {
            Position = position;
            Collider = new Hitbox(20, 20, -10, -10);
        }

        public override void Update()
        {
            if (collected)
            {
                respawnTimer -= Engine.DeltaTime;
                if (respawnTimer <= 0) Respawn();
                return;
            }

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) return;

            if (ShieldedCheck(player)) return;  // shielded check from parent stub

            Collect(player);
        }

        private void Collect(Player player)
        {
            collected    = true;
            Collidable   = false;
            respawnTimer = 3.0f;
            player.StartStarFly();
            Audio.Play(Sfxs.char_mad_dreamblock_enter, Position);
            Scene?.As<Level>()?.Particles.Emit(P_Collect, 8, Position, Vector2.One * 6f);
        }

        private void Respawn()
        {
            collected  = false;
            Collidable = true;
            Scene?.As<Level>()?.Particles.Emit(P_Regen, 4, Position, Vector2.One * 4f);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STRAWBERRY — Collectible berry (extends stub with follow / collect logic)
    // ══════════════════════════════════════════════════════════════════════════
    public class StrawberryPickup : Entity
    {
        public bool  IsGolden;
        public bool  Collected { get; private set; }

        private static readonly ParticleType P_Collect = new ParticleType();

        private bool  following;
        private float collectDelay = 0.35f;

        public StrawberryPickup(Vector2 position, bool golden = false)
        {
            Position = position;
            IsGolden = golden;
            Collider = new Hitbox(14, 14, -7, -7);
        }

        public override void Update()
        {
            if (Collected) return;
            float dt = Engine.DeltaTime;

            var player = CollideFirst<Player>();
            if (player == null || player.Dead) { following = false; return; }

            if (!following) { following = true; collectDelay = 0.35f; }

            collectDelay -= dt;
            if (collectDelay <= 0)
            {
                Collected  = true;
                Collidable = false;
                Visible    = false;
                Audio.Play(Sfxs.char_mad_revive, Position);
                Scene?.As<Level>()?.Particles.Emit(P_Collect, 10, Position, Vector2.One * 6f);
            }
        }
    }
}
