// Marker / placeholder Entity subclasses Player.cs queries against.
//
// These are intentionally near-empty. Player.cs uses them for two things:
//  1) Generic type arguments to CollideCheck<T>() / GetEntities<T>() — the
//     query system only needs `T : Entity`, so an empty subclass works.
//  2) Field reads / method calls (e.g. wall.LiftSpeed). Anything Player.cs
//     reads on an instance is added here with a default.
//
// Behaviors specific to each entity (Boost coroutines, dream block warp,
// holdable physics, etc.) are out of scope for the scaffold — they would
// be filled in case by case.

using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    public class Platform : Entity
    {
        public Vector2 LiftSpeed;
        public bool HasRiders() => false;
        public int GetWallSoundIndex(object actor, int dir) => 0;
        public int GetLandSoundIndex(object actor) => 0;
        public int GetStepSoundIndex(object actor) => 0;
    }

    public class Solid     : Platform {}
    public class JumpThru  : Platform {}
    public class Spikes    : Entity   {}
    public class DreamBlock: Solid    {
        public bool PlayerHasDreamDash;
        public bool Spikes => false;
        public Vector2 ShakeOffset;
    }
    public class SwapBlock : Solid {
        public Vector2 Direction;
        public float Speed;
        public Vector2 Start, End;
    }
    public class Booster   : Entity {
        public bool Ch9HubBooster;
        public bool RedBoost;
        public bool BoostingPlayer;
        public Vector2 RespawnAt;
        public static readonly ParticleType P_Move = new ParticleType();
        public static readonly ParticleType P_Burst = new ParticleType();
        public static readonly ParticleType P_BurstRed = new ParticleType();
        public static readonly ParticleType P_Appear = new ParticleType();
        public static readonly ParticleType P_RedAppear = new ParticleType();
        public void PlayerBoosted(Player player, Vector2 direction) {}
        public void PlayerReleased() {}
        public void PlayerDied() {}
    }

    public class BlockField : Entity {}
    public class Water      : Entity {
        public class Surface { public void DoRipple(Vector2 at, float intensity) {} }
        public Surface TopSurface = new Surface();
        public Surface BottomSurface = new Surface();
    }
    public class CrystalStaticSpinner : Entity {}
    public class Killbox    : Entity {}
    public class Trigger    : Entity {
        public virtual void OnEnter(Player p) {}
        public virtual void OnStay(Player p) {}
        public virtual void OnLeave(Player p) {}
        public bool Triggered;
        public Rectangle Bounds;
    }
    public class FlyFeather : Entity {
        public static readonly ParticleType P_Boost = new ParticleType();
        public bool ShieldedCheck(Player p) => false;
    }
    public class WallBooster : Entity {
        public int Facing;
        public bool IceMode;
        public bool NotCoreMode;
    }
    public class BadelineBoost : Entity {
        public static readonly ParticleType P_Move = new ParticleType();
        public Action OnBoost;
    }
    public class BadelineDummy : Entity {}
    public class Cassette : Entity {}
    public class Bird : Entity { public Action OnPlayerLand; }
    public class Pickup : Entity {}
    public class Strawberry : Entity {}

    public enum PlayerSpriteMode { Madeline, MadelineNoBackpack, Badeline, MadelineAsBadeline, Playback }
    public enum PlayerDeadBody { } // placeholder
    public enum PlayerInventory { Default }

    // --- Components used as generic type args to GetComponents<T>() ---
    public class Holdable : Component {
        public Holdable() : base(true, false) {}
        public Action<Holdable> OnPickup;
        public Action<Vector2> OnRelease;
        public bool Check(Player p) => false;
        public Vector2 Speed;
        public Vector2 PickupCollider;
        public bool IsHeld;
        public bool SlowFall;
        public float SlowRun;
    }
    public class DashListener : Component {
        public DashListener() : base(true, false) {}
        public Action<Vector2> OnDash;
    }
    public class LedgeBlocker : Component {
        public LedgeBlocker() : base(true, false) {}
        public Func<Player, bool> BlockChecker;
        public bool Blocking = true;
    }
    public class PlayerCollider : Component {
        public PlayerCollider(Action<Player> onCollide, Collider c = null) : base(true, false) {}
        public Action<Player> OnCollide;
        public Collider Collider;
    }
    public class SafeGroundBlocker : Component {
        public SafeGroundBlocker(Func<Player, bool> blockChecker = null) : base(true, false) {}
        public bool Blocking = true;
    }

    // --- Static helpers used as standalone .Check(...) sites ---
    public static class ClimbBlocker
    {
        public static bool Check(Monocle.Scene scene, Player p, Vector2 at) => false;
        public static bool EdgeCheck(Monocle.Scene scene, Player p, int dir) => false;
    }

    // --- Level / Camera ----------------------------------------------
    public class Camera : Entity
    {
        public Vector2 Position;
        public new float X { get => Position.X; set => Position.X = value; }
        public new float Y { get => Position.Y; set => Position.Y = value; }
        public Vector2 Origin;
        public float Zoom = 1f;
        public Rectangle Bounds;
    }

    public class Level : Scene
    {
        public Session Session = new Session();
        public Camera Camera = new Camera();
        public Vector2 Wind;
        public bool InSpace;
        public Session.CoreModes CoreMode => Session.CoreMode;
        public Rectangle Bounds;
        public bool Frozen;
        public bool RetryPlayerCorpse;
        public ParticleSystem Particles = new ParticleSystem();
        public ParticleSystem ParticlesBG = new ParticleSystem();
        public ParticleSystem ParticlesFG = new ParticleSystem();
        public void DirectionalShake(Vector2 dir, float duration = .15f) {}
        public void Shake(float duration = .3f) {}
        public void Add(Entity e) => base.Add(e);
        public void Flash(Color color, bool drawPlayerOver = false) {}
        public CameraLockMode CameraLockMode;
    }
    public enum CameraLockMode { None, BoostSequence, FinalBoss, FinalBossNoY }

    // --- Misc bits Player.cs references ------------------------------
    public class Chooser<T>
    {
        private List<T> options = new List<T>();
        public Chooser<T> Add(T option, float weight = 1f) { options.Add(option); return this; }
        public T Choose() => options.Count == 0 ? default : options[Calc.Random.Next(options.Count)];
    }

    public class ChaserState
    {
        public Vector2 Position;
        public float TimeStamp;
        public string Animation;
        public Facings Facing;
        public bool OnGround;
        public Vector2 HairColor;
        public Vector2 Scale;
        public int Depth;
        public string Sound;
        public ChaserState(Player p) {}
    }

    public class CassetteListener : Component
    {
        public CassetteListener() : base(true, false) {}
    }

    public class WindMover : Component
    {
        public WindMover() : base(true, false) {}
        public Action<Vector2> Move;
    }

    public class WaterInteraction : Component
    {
        public WaterInteraction(Func<bool> isAttachedTo) : base(true, false) {}
    }

    public class SoundSource : Component
    {
        public SoundSource() : base(true, false) {}
        public bool Playing;
        public SoundSource Play(string ev) { return this; }
        public void Stop(bool allowFadeOut = true) {}
        public void Pause() {}
        public void Resume() {}
        public void Param(string p, float v) {}
        public bool IsPlaying => Playing;
        public string EventName;
    }

    public class VertexLight : Component
    {
        public VertexLight() : base(true, false) {}
        public VertexLight(Color color, float alpha, int startRadius, int endRadius) : base(true, false) {}
        public float Alpha = 1f;
        public Color Color = Color.White;
    }

    public class BloomPoint : Component
    {
        public BloomPoint(float alpha, float radius) : base(true, false) {}
        public BloomPoint(Vector2 offset, float alpha, float radius) : base(true, false) {}
        public float Alpha;
        public float Radius;
    }

    public class MirrorReflection : Component
    {
        public MirrorReflection() : base(true, false) {}
    }

    public class Leader : Component
    {
        public Leader(Vector2 pastPositionOffset = default) : base(true, false) {}
        public List<Tuple<Strawberry, Vector2>> PastPoints = new List<Tuple<Strawberry, Vector2>>();
        public void StoreStrawberries(Leader other) {}
        public void TransferFollowers() {}
        public void LoseFollowers() {}
    }

    // Per-mechanic helpers
    public class DashCollisionResults { }
    public enum DashCollisionResultsEnum { NormalCollision, NormalOverride, Rebound, Bounce, Ignore }

    public class CollisionData
    {
        public Vector2 Direction;
        public Vector2 Velocity;
        public Vector2 TargetPosition;
        public Platform Hit;
        public Vector2 Pusher;
    }
}
