// Stubs for Celeste game-system singletons Player.cs references:
//   - Input (virtual buttons / sticks)
//   - SaveData / Session / Inventory / Assists
//   - Audio / Sfxs / GFX
//   - Dust / SlashFx / SpeedRing / TrailManager
//   - SurfaceIndex / DeathEffect / RumbleStrength / RumbleLength
//
// All audio/particle calls are no-ops. Input is driven by the Blazor host
// (Browser keyboard → SetMoveX / SetJumpPressed / etc.).

using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    // --- Input -------------------------------------------------------
    public static class Input
    {
        public class VirtualIntegerAxis
        {
            public int Value;
            public static implicit operator int(VirtualIntegerAxis v) => v.Value;
            public static bool operator ==(VirtualIntegerAxis a, int v) => a.Value == v;
            public static bool operator !=(VirtualIntegerAxis a, int v) => a.Value != v;
            public override bool Equals(object o) => o is VirtualIntegerAxis v && v.Value == Value;
            public override int GetHashCode() => Value.GetHashCode();
        }

        public class VirtualButton
        {
            public bool Check;     // currently held
            public bool Pressed;   // pressed this frame (within buffer)
            public bool Released;
            public float BufferRemaining;
            public void ConsumeBuffer() { Pressed = false; BufferRemaining = 0; }
            public void ConsumePress()  { Pressed = false; }
        }

        public class VirtualJoystick
        {
            public Vector2 Value;
        }

        public static readonly VirtualIntegerAxis MoveX = new VirtualIntegerAxis();
        public static readonly VirtualIntegerAxis MoveY = new VirtualIntegerAxis();
        public static readonly VirtualButton Jump  = new VirtualButton();
        public static readonly VirtualButton Dash  = new VirtualButton();
        public static readonly VirtualButton Grab  = new VirtualButton();
        public static readonly VirtualButton Talk  = new VirtualButton();
        public static readonly VirtualJoystick Aim = new VirtualJoystick();

        public static Vector2 GetAimVector(Facings facing = Facings.Right)
        {
            var v = Aim.Value;
            if (v == Vector2.Zero)
            {
                if (facing == Facings.Left)  return new Vector2(-1, 0);
                if (facing == Facings.Right) return new Vector2( 1, 0);
            }
            return v;
        }

        public static void Rumble(RumbleStrength strength, RumbleLength length) {}
    }

    public enum Facings { Left = -1, Right = 1 }
    public enum RumbleStrength { Light, Medium, Strong }
    public enum RumbleLength { Short, Medium, Long }

    // --- SaveData / Session / Inventory ------------------------------
    public class Assists
    {
        public bool Invincible;
        public bool InfiniteStamina;
        public int  DashMode;
        public float GameSpeed = 1f;
        public bool MirrorMode;
    }

    public class SaveData
    {
        public static SaveData Instance = new SaveData();
        public bool AssistMode;
        public Assists Assists = new Assists();
        public int TotalJumps;
        public int TotalWallJumps;
        public int TotalDashes;
        public int TotalDeathsInCurrentLevel;
        public void AddDeath(AreaKey area) {}
    }

    public struct AreaKey { public int ID; public AreaMode Mode; }
    public enum AreaMode { Normal, BSide, CSide }

    public struct Inventory
    {
        public int Dashes;
        public bool DreamDash;
        public bool Backpack;
        public bool NoRefills;
        public static readonly Inventory Default = new Inventory { Dashes = 1, DreamDash = false, Backpack = true };
    }

    public class Session
    {
        public Inventory Inventory = Inventory.Default;
        public int Dashes;
        public string Level = "";
        public Vector2? RespawnPoint;
        public AudioState Audio = new AudioState();
        public CoreModes CoreMode;
        public enum CoreModes { None, Hot, Cold }
        public class AudioState
        {
            public class AudioMusic { public string Event; }
            public AudioMusic Music = new AudioMusic();
            public void Apply() {}
        }
    }

    // --- Audio / Sfxs ------------------------------------------------
    public static class Audio
    {
        public static object Play(string sfx) => null;
        public static object Play(string sfx, Vector2 at) => null;
        public static object Play(string sfx, string param, float value) => null;
        public static object Play(string sfx, Vector2 at, string param, float value) => null;
        public static object Play(string sfx, Vector2 at, string p1, float v1, string p2, float v2) => null;
        public static void Stop(object instance, bool allowFadeOut = true) {}
        public static void Position(object instance, Vector2 at) {}
        public static object MusicUnderwater { get; set; }
        public static class Music { public static string CurrentMusic; }
        public static void SetMusicParam(string p, float v) {}
        public static void SetAmbience(string ev, bool start = true) {}
    }

    // Sfxs constants — only the ones Player.cs references. All are strings;
    // their value doesn't matter since Audio.Play is a no-op.
    public static class Sfxs
    {
        public const string char_mad_jump = "char_mad_jump";
        public const string char_mad_jump_assisted = "char_mad_jump_assisted";
        public const string char_mad_jump_climb_left = "char_mad_jump_climb_left";
        public const string char_mad_jump_climb_right = "char_mad_jump_climb_right";
        public const string char_mad_jump_dreamblock = "char_mad_jump_dreamblock";
        public const string char_mad_jump_super = "char_mad_jump_super";
        public const string char_mad_jump_superslide = "char_mad_jump_superslide";
        public const string char_mad_jump_superwall = "char_mad_jump_superwall";
        public const string char_mad_jump_wall_left = "char_mad_jump_wall_left";
        public const string char_mad_jump_wall_right = "char_mad_jump_wall_right";
        public const string char_mad_land = "char_mad_land";
        public const string char_mad_stand = "char_mad_stand";
        public const string char_mad_duck = "char_mad_duck";
        public const string char_mad_grab = "char_mad_grab";
        public const string char_mad_grab_letgo = "char_mad_grab_letgo";
        public const string char_mad_handhold = "char_mad_handhold";
        public const string char_mad_footstep = "char_mad_footstep";
        public const string char_mad_wallslide = "char_mad_wallslide";
        public const string char_mad_dash_red_left = "char_mad_dash_red_left";
        public const string char_mad_dash_red_right = "char_mad_dash_red_right";
        public const string char_mad_dash_pink_left = "char_mad_dash_pink_left";
        public const string char_mad_dash_pink_right = "char_mad_dash_pink_right";
        public const string char_mad_revive = "char_mad_revive";
        public const string char_mad_dreamblock_enter = "char_mad_dreamblock_enter";
        public const string char_mad_dreamblock_exit = "char_mad_dreamblock_exit";
        public const string char_mad_dreamblock_travel = "char_mad_dreamblock_travel";
        public const string char_mad_crystaltheo_lift = "char_mad_crystaltheo_lift";
        public const string char_mad_crystaltheo_throw = "char_mad_crystaltheo_throw";
        public const string char_mad_climb_ledge = "char_mad_climb_ledge";
        public const string char_mad_water_dash_gen = "char_mad_water_dash_gen";
        public const string char_mad_water_move_shallow = "char_mad_water_move_shallow";
        public const string char_mad_summit_areastart = "char_mad_summit_areastart";
        public const string char_mad_summit_sit = "char_mad_summit_sit";
        public const string char_mad_mirrortemple_landing = "char_mad_mirrortemple_landing";
        public const string char_mad_campfire_stand = "char_mad_campfire_stand";
        public const string char_mad_idle_crackknuckles = "char_mad_idle_crackknuckles";
        public const string char_mad_idle_scratch = "char_mad_idle_scratch";
        public const string char_mad_idle_sneeze = "char_mad_idle_sneeze";
        public const string MadelineToBadelineSound = "MadelineToBadelineSound";
        public const string game_09_conveyor_activate = "game_09_conveyor_activate";
        public const string game_assist_dreamblockbounce = "game_assist_dreamblockbounce";
        public const string music_reflection_main = "music_reflection_main";
    }

    // --- GFX / particles --------------------------------------------
    public static class GFX
    {
        public static SpriteBank SpriteBank = new SpriteBank();
        public static class Game
        {
            public static object this[string key] { get => null; }
        }
    }

    public static class Dust
    {
        public static void Burst(Vector2 at, float angle, int amount = 1) {}
        public static void Burst(Vector2 at, Vector2 dir, int amount = 1) {}
        public static void BurstFG(Vector2 at, float angle, int amount = 1) {}
        public static void BurstFG(Vector2 at, Vector2 dir, int amount = 1) {}
    }

    public static class SlashFx
    {
        public static void Burst(Vector2 at, float angle) {}
    }

    public static class SpeedRing
    {
        public static void Burst(Vector2 at, float angle, Color color, int amount) {}
    }

    public static class TrailManager
    {
        public static void Add(Entity e, Vector2 scale, Color color, float duration = 1f) {}
        public static void Add(Entity e, Color color, float duration = 1f) {}
    }

    public static class DeathEffect
    {
        public static void Draw(Vector2 at, Color color, float ease) {}
    }

    public static class SurfaceIndex
    {
        public const string Param = "surface_index";
        public static object GetPlatformByPriority(List<Solid> solids) => null;
        public static object GetPlatformByPriority(List<Platform> platforms) => null;
        public static object GetPlatformByPriority(object thing) => null;
        public static int GetWallSoundIndex(object thing, int dir) => 0;
    }
}
