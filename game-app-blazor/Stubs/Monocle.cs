// Minimal stubs for the Monocle engine surface that Player.cs touches.
// Hand-written — NOT the real Monocle. Only members Player.cs uses.
//
// Strategy:
//   - Things Player.cs queries (Position, Speed, MoveH, CollideCheck) get real
//     implementations against a tiny browser-side world (Scene + Tracker + Hitbox).
//   - Things Player.cs delegates outward (Audio, Particles, Hair, Sprite anims)
//     are no-op signatures that satisfy the compiler.

using System;
using System.Collections;
using System.Collections.Generic;
using Microsoft.Xna.Framework;

namespace Monocle
{
    // [Tracked] attribute used as a marker on Entity classes.
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = true)]
    public class TrackedAttribute : Attribute
    {
        public Type[] TrackedAs;
        public bool Inherited;
        public TrackedAttribute() {}
        public TrackedAttribute(bool inherited) { Inherited = inherited; }
        public TrackedAttribute(Type trackedAs) { TrackedAs = new[] { trackedAs }; }
    }

    // ------------------------------------------------------------------
    // Engine globals — Engine.DeltaTime, Engine.TimeRate.
    // The Blazor host sets these each frame.
    // ------------------------------------------------------------------
    public static class Engine
    {
        public static float DeltaTime = 1f / 60f;
        public static float RawDeltaTime = 1f / 60f;
        public static float TimeRate = 1f;
        public static float FreezeTimer = 0f;
        public static Scene Scene;
        public static int Width  = 320;
        public static int Height = 180;
    }

    // ------------------------------------------------------------------
    // Calc — Monocle's math helpers. Player.cs uses Approach a LOT,
    // HexToColor for hair color, Random for randomness, the Up/Down
    // directional constants for particle bursts.
    // ------------------------------------------------------------------
    public static class Calc
    {
        public static readonly Random Random = new Random();

        public static readonly Vector2 Up        = new Vector2(0, -1);
        public static readonly Vector2 Down      = new Vector2(0,  1);
        public static readonly Vector2 Left      = new Vector2(-1, 0);
        public static readonly Vector2 Right     = new Vector2( 1, 0);
        public static readonly Vector2 UpLeft    = new Vector2(-1, -1);
        public static readonly Vector2 UpRight   = new Vector2( 1, -1);
        public static readonly Vector2 DownLeft  = new Vector2(-1,  1);
        public static readonly Vector2 DownRight = new Vector2( 1,  1);

        public static float Approach(float val, float target, float maxMove)
            => val > target ? Math.Max(target, val - maxMove)
                            : Math.Min(target, val + maxMove);

        public static Vector2 Approach(Vector2 val, Vector2 target, float maxMove)
        {
            var diff = target - val;
            if (diff.LengthSquared() <= maxMove * maxMove) return target;
            diff.Normalize();
            return val + diff * maxMove;
        }

        public static Color HexToColor(string hex)
        {
            if (hex.StartsWith("#")) hex = hex.Substring(1);
            int r = Convert.ToInt32(hex.Substring(0, 2), 16);
            int g = Convert.ToInt32(hex.Substring(2, 2), 16);
            int b = Convert.ToInt32(hex.Substring(4, 2), 16);
            return new Color(r, g, b);
        }

        public static float Angle(this Vector2 v) => (float)Math.Atan2(v.Y, v.X);
        public static Vector2 SafeNormalize(this Vector2 v)
        {
            float len = v.Length();
            if (len <= 0) return Vector2.Zero;
            return v / len;
        }
        public static Vector2 Range(this Random r, Vector2 min, Vector2 max)
            => new Vector2(
                min.X + (float)r.NextDouble() * (max.X - min.X),
                min.Y + (float)r.NextDouble() * (max.Y - min.Y));
        public static T Choose<T>(this Random r, params T[] options) => options[r.Next(options.Length)];
        public static float NextFloat(this Random r) => (float)r.NextDouble();
        public static float NextFloat(this Random r, float max) => (float)r.NextDouble() * max;
        public static float Range(this Random r, float min, float max)
            => min + (float)r.NextDouble() * (max - min);
        public static int Range(this Random r, int min, int max) => r.Next(min, max);
    }

    // ------------------------------------------------------------------
    // Component / Entity / Actor / Scene / Tracker
    // ------------------------------------------------------------------
    public class Component
    {
        public Entity Entity;
        public bool Active = true;
        public bool Visible = true;
        public Component(bool active, bool visible) { Active = active; Visible = visible; }
        public virtual void Added(Entity entity)   { Entity = entity; }
        public virtual void Removed(Entity entity) { Entity = null; }
        public virtual void Update() {}
        public virtual void Render() {}
        public Scene Scene => Entity?.Scene;
    }

    public class Collider : Component
    {
        public float Width, Height;
        public Vector2 Position;
        public Collider() : base(true, false) {}
        public float Left   { get { return Position.X; }            set { Position.X = value; } }
        public float Top    { get { return Position.Y; }            set { Position.Y = value; } }
        public float Right  { get { return Position.X + Width; }    set { Position.X = value - Width; } }
        public float Bottom { get { return Position.Y + Height; }   set { Position.Y = value - Height; } }
        public Vector2 Center => Position + new Vector2(Width * .5f, Height * .5f);
    }

    public class Hitbox : Collider
    {
        public Hitbox(float w, float h, float x = 0, float y = 0)
        {
            Width = w; Height = h; Position = new Vector2(x, y);
        }
    }

    public class Entity
    {
        public Vector2 Position;
        public bool Active = true;
        public bool Visible = true;
        public bool Collidable = true;
        public Collider Collider;
        public Scene Scene;
        public int Depth;
        public int Tag;
        public Vector2 Origin;

        public List<Component> Components = new List<Component>();

        public float X { get { return Position.X; } set { Position.X = value; } }
        public float Y { get { return Position.Y; } set { Position.Y = value; } }
        public float Width  => Collider?.Width  ?? 0;
        public float Height => Collider?.Height ?? 0;
        public float Left   => Position.X + (Collider?.Position.X ?? 0);
        public float Right  => Left + Width;
        public float Top    => Position.Y + (Collider?.Position.Y ?? 0);
        public float Bottom => Top + Height;
        public Vector2 Center => new Vector2(Left + Width * .5f, Top + Height * .5f);
        public Vector2 TopCenter    => new Vector2(Left + Width * .5f, Top);
        public Vector2 BottomCenter => new Vector2(Left + Width * .5f, Bottom);
        public Vector2 TopLeft      => new Vector2(Left, Top);
        public Vector2 TopRight     => new Vector2(Right, Top);
        public Vector2 BottomLeft   => new Vector2(Left, Bottom);
        public Vector2 BottomRight  => new Vector2(Right, Bottom);

        public virtual void Update() {}
        public virtual void Render() {}
        public virtual void Awake(Scene scene) {}
        public virtual void Added(Scene scene)   { Scene = scene; }
        public virtual void Removed(Scene scene) { Scene = null; }

        public void Add(Component c)
        {
            Components.Add(c);
            c.Added(this);
        }
        public void Add(params Component[] cs) { foreach (var c in cs) Add(c); }
        public T Get<T>() where T : Component
        {
            foreach (var c in Components) if (c is T t) return t;
            return null;
        }

        // ---- Collision queries ----
        public bool CollideCheck<T>() where T : Entity
            => CollideCheck<T>(Position);
        public bool CollideCheck<T>(Vector2 at) where T : Entity
        {
            if (Scene == null) return false;
            foreach (var e in Scene.Tracker.GetEntities<T>())
                if (e.Collidable && e != this && Collide.Check(this, e, at)) return true;
            return false;
        }
        public bool CollideCheck(Entity other) => other != null && other.Collidable && Collide.Check(this, other, Position);
        public bool CollideCheck(Entity other, Vector2 at) => other != null && other.Collidable && Collide.Check(this, other, at);
        public T CollideFirst<T>() where T : Entity => CollideFirst<T>(Position);
        public T CollideFirst<T>(Vector2 at) where T : Entity
        {
            if (Scene == null) return null;
            foreach (var e in Scene.Tracker.GetEntities<T>())
                if (e.Collidable && e != this && Collide.Check(this, e, at)) return (T)e;
            return null;
        }
        public List<T> CollideAll<T>(Vector2 at, List<T> into) where T : Entity
        {
            into.Clear();
            if (Scene == null) return into;
            foreach (var e in Scene.Tracker.GetEntities<T>())
                if (e.Collidable && e != this && Collide.Check(this, e, at)) into.Add((T)e);
            return into;
        }
        public bool CollideCheckOutside<T>(Vector2 at) where T : Entity
        {
            if (!CollideCheck<T>(Position) && CollideCheck<T>(at)) return true;
            return false;
        }
        public T CollideFirstOutside<T>(Vector2 at) where T : Entity
        {
            if (CollideCheck<T>(Position)) return null;
            return CollideFirst<T>(at);
        }
    }

    // Actor — adds discrete MoveH/MoveV that resolve against Solids.
    public class Actor : Entity
    {
        public Vector2 Speed;
        public Vector2 LiftSpeed;
        public bool AllowPushing = true;
        public bool TreatNaive;
        protected float movementCounter_X;
        protected float movementCounter_Y;

        public Vector2 ExactPosition => Position;

        public bool OnGround(int downCheck = 1)
            => CollideCheck<Celeste.Solid>(Position + new Vector2(0, downCheck));

        public bool OnGround(Vector2 at, int downCheck = 1)
            => CollideCheck<Celeste.Solid>(at + new Vector2(0, downCheck));

        public virtual void MoveH(float moveH, Action<dynamic> onCollide = null, dynamic pusher = null)
        {
            movementCounter_X += moveH;
            int move = (int)Math.Round(movementCounter_X);
            if (move != 0) { movementCounter_X -= move; MoveHExact(move, onCollide, pusher); }
        }
        public virtual void MoveV(float moveV, Action<dynamic> onCollide = null, dynamic pusher = null)
        {
            movementCounter_Y += moveV;
            int move = (int)Math.Round(movementCounter_Y);
            if (move != 0) { movementCounter_Y -= move; MoveVExact(move, onCollide, pusher); }
        }
        public virtual bool MoveHExact(int moveH, Action<dynamic> onCollide = null, dynamic pusher = null)
        {
            int sign = Math.Sign(moveH);
            while (moveH != 0)
            {
                if (CollideCheck<Celeste.Solid>(Position + new Vector2(sign, 0)))
                {
                    movementCounter_X = 0;
                    onCollide?.Invoke(null);
                    return true;
                }
                Position.X += sign;
                moveH -= sign;
            }
            return false;
        }
        public virtual bool MoveVExact(int moveV, Action<dynamic> onCollide = null, dynamic pusher = null)
        {
            int sign = Math.Sign(moveV);
            while (moveV != 0)
            {
                if (CollideCheck<Celeste.Solid>(Position + new Vector2(0, sign)))
                {
                    movementCounter_Y = 0;
                    onCollide?.Invoke(null);
                    return true;
                }
                Position.Y += sign;
                moveV -= sign;
            }
            return false;
        }
        public void NaiveMove(Vector2 v) { Position += v; }
        public void ZeroRemainderX() { movementCounter_X = 0; }
        public void ZeroRemainderY() { movementCounter_Y = 0; }
        public virtual bool IsRiding(Celeste.Solid solid) => false;
        public virtual bool IsRiding(Celeste.JumpThru jumpThru) => false;
    }

    public static class Collide
    {
        public static bool Check(Entity a, Entity b, Vector2 at)
        {
            float ax = at.X + (a.Collider?.Position.X ?? 0);
            float ay = at.Y + (a.Collider?.Position.Y ?? 0);
            float aw = a.Width, ah = a.Height;
            float bx = b.Left, by = b.Top, bw = b.Width, bh = b.Height;
            return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
        }
    }

    public abstract class Scene
    {
        public float TimeActive;
        public float RawTimeActive;
        public bool Paused;
        public List<Entity> Entities = new List<Entity>();
        public Tracker Tracker = new Tracker();

        public bool OnInterval(float interval) =>
            (int)((TimeActive - Engine.DeltaTime) / interval) < (int)(TimeActive / interval);
        public bool OnInterval(float interval, float offset) =>
            (int)((TimeActive - offset - Engine.DeltaTime) / interval) < (int)((TimeActive - offset) / interval);
        public bool OnRawInterval(float interval) => OnInterval(interval);

        public T As<T>() where T : Scene => this as T;
        public T SceneAs<T>() where T : Scene => this as T;

        public void Add(Entity e)
        {
            Entities.Add(e);
            Tracker.Add(e);
            e.Added(this);
        }
        public void Remove(Entity e)
        {
            Entities.Remove(e);
            Tracker.Remove(e);
            e.Removed(this);
        }

        public T Entity<T>() where T : Entity
        {
            foreach (var e in Entities) if (e is T t) return t;
            return null;
        }
    }

    public class Tracker
    {
        private Dictionary<Type, List<Entity>> entities = new Dictionary<Type, List<Entity>>();
        private Dictionary<Type, List<Component>> components = new Dictionary<Type, List<Component>>();
        private static List<Entity> _empty = new List<Entity>();
        private static List<Component> _emptyC = new List<Component>();

        public void Add(Entity e)
        {
            var t = e.GetType();
            while (t != null && t != typeof(object))
            {
                if (!entities.TryGetValue(t, out var list))
                    entities[t] = list = new List<Entity>();
                list.Add(e);
                t = t.BaseType;
            }
            foreach (var c in e.Components) AddComponent(c);
        }
        public void Remove(Entity e)
        {
            var t = e.GetType();
            while (t != null && t != typeof(object))
            {
                if (entities.TryGetValue(t, out var list)) list.Remove(e);
                t = t.BaseType;
            }
        }
        public void AddComponent(Component c)
        {
            var t = c.GetType();
            while (t != null && t != typeof(object))
            {
                if (!components.TryGetValue(t, out var list))
                    components[t] = list = new List<Component>();
                list.Add(c);
                t = t.BaseType;
            }
        }

        public List<Entity> GetEntities<T>() where T : Entity
            => entities.TryGetValue(typeof(T), out var list) ? list : _empty;
        public List<Component> GetComponents<T>() where T : Component
            => components.TryGetValue(typeof(T), out var list) ? list : _emptyC;
        public T GetEntity<T>() where T : Entity
        {
            var l = GetEntities<T>();
            return l.Count > 0 ? (T)l[0] : null;
        }
        public T GetComponent<T>() where T : Component
        {
            var l = GetComponents<T>();
            return l.Count > 0 ? (T)l[0] : null;
        }
    }

    // ------------------------------------------------------------------
    // StateMachine — Monocle's state machine that drives NormalUpdate etc.
    // ------------------------------------------------------------------
    public class StateMachine : Component
    {
        private Func<int>[] updates;
        private IEnumerator[] coroutines;
        private Action[] begins;
        private Action[] ends;
        public int State;
        public int PreviousState;
        public bool Locked;
        public bool ChangedStates;
        public bool Log;
        public IEnumerator CurrentCoroutine;

        public StateMachine(int maxStates = 32) : base(true, false)
        {
            updates = new Func<int>[maxStates];
            coroutines = new IEnumerator[maxStates];
            begins = new Action[maxStates];
            ends = new Action[maxStates];
        }

        public void SetCallbacks(int state, Func<int> onUpdate,
            Func<IEnumerator> coroutine = null, Action begin = null, Action end = null)
        {
            updates[state]    = onUpdate;
            coroutines[state] = null; // coroutine support is no-op in browser stub
            begins[state]     = begin;
            ends[state]       = end;
        }

        public override void Update()
        {
            if (Locked) return;
            ChangedStates = false;
            if (updates[State] != null)
            {
                int next = updates[State]();
                if (next != State)
                {
                    ends[State]?.Invoke();
                    PreviousState = State;
                    State = next;
                    begins[State]?.Invoke();
                    ChangedStates = true;
                }
            }
        }

        public void ChangeState(int s)
        {
            ends[State]?.Invoke();
            PreviousState = State;
            State = s;
            begins[State]?.Invoke();
        }

        public void ReflectState(Entity e, int state) { State = state; }
        public void LockedChangedStates() {}
    }

    public class ParticleType { }
    public class ParticleSystem : Entity {
        public void Emit(ParticleType type, Vector2 pos, float angle) {}
        public void Emit(ParticleType type, int amount, Vector2 pos, Vector2 range) {}
        public void Emit(ParticleType type, int amount, Vector2 pos, Vector2 range, float angle) {}
        public void Emit(ParticleType type, Vector2 pos, Color color, float angle) {}
    }

    // Sprite + animation stubs. Player.cs holds a Sprite, calls Play("anim"),
    // reads Scale and CurrentAnimationID. None of it renders here.
    public class Sprite : Component
    {
        public Vector2 Scale = Vector2.One;
        public Vector2 Origin;
        public float Rate = 1f;
        public string CurrentAnimationID = "";
        public int CurrentAnimationFrame;
        public int CurrentAnimationTotalFrames;
        public bool Animating;
        public Vector2 Position;
        public Color Color = Color.White;
        public Action<string> OnFinish;
        public Action<string> OnLoop;
        public Action<string> OnFrameChange;
        public Action<string> OnChange;
        public Action<string> OnLastFrame;
        public Sprite() : base(true, true) {}
        public void Play(string id, bool restart = false, bool randomizeFrame = false)
            { CurrentAnimationID = id; }
        public void PlayOffset(string id, float offset) { CurrentAnimationID = id; }
        public void Stop() { Animating = false; }
        public void Reset() {}
        public bool Has(string id) => true;
    }

    public class PlayerSprite : Sprite
    {
        public const string Idle = "idle";
        public const string IdleCarry = "idleCarry";
        public const string RunSlow = "runSlow";
        public const string RunFast = "runFast";
        public const string RunWind = "runWind";
        public const string RunStumble = "runStumble";
        public const string RunCarry = "runCarry";
        public const string JumpSlow = "jumpSlow";
        public const string JumpFast = "jumpFast";
        public const string JumpCarry = "jumpCarry";
        public const string FallSlow = "fallSlow";
        public const string FallFast = "fallFast";
        public const string FallBig = "fallBig";
        public const string FallCarry = "fallCarry";
        public const string Duck = "duck";
        public const string Dash = "dash";
        public const string Climb = "climb";
        public const string ClimbUp = "climbUp";
        public const string Dangling = "dangling";
        public const string PickUp = "pickUp";
        public const string Skid = "skid";
        public const string Flip = "flip";
        public const string DreamDashIn = "dreamDashIn";
        public const string DreamDashOut = "dreamDashOut";
        public const string ClimbLookBackStart = "climbLookBackStart";
        public const string ClimbLookBack = "climbLookBack";
        public const string FrontEdge = "frontEdge";
        public const string LookUp = "lookUp";
        public const string Launch = "launch";
        public const string LandInPose = "landInPose";
        public const string Tired = "tired";
        public const string TiredStill = "tiredStill";
        public const string FrontDangling = "frontDangling";
        public const string Sleep = "sleep";

        public PlayerSprite(int mode) {}
        public PlayerSprite(object mode) {}

        public bool HairFrame   => false;
        public int HairFrameInt => 0;
    }

    public class SpriteBank
    {
        public Sprite Create(string id) => new Sprite();
    }

    public class GraphicsComponent : Component
    {
        public GraphicsComponent(bool a) : base(true, a) {}
        public Vector2 Position;
        public Vector2 Origin;
        public Vector2 Scale = Vector2.One;
        public float Rotation;
        public Color Color = Color.White;
    }

    public class Image : GraphicsComponent { public Image() : base(true) {} }

    // Audio helpers Player.cs uses as Play(...) directly on Entity-like surface
    // are routed through our `Celeste.Audio` stub.
}
