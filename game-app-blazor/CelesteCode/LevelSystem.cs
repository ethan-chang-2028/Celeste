// LevelSystem.cs — Level and room physics management for the Celeste scaffold.
//
// Provides:
//   - LevelBuilder: fluent API for constructing rooms with entities
//   - RoomPhysics:  per-frame physics orchestration (gravity, platforms, hazards)
//   - LevelManager: manages the active level and transitions
//
// The Level class itself is defined in CelesteEntities.cs (stub).
// This file adds the construction and management layer on top.
using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    // ══════════════════════════════════════════════════════════════════════════
    // LEVEL PHYSICS — Per-frame physics update for all entities in a Level.
    // The host (Blazor or test harness) calls LevelPhysics.Update each frame.
    // ══════════════════════════════════════════════════════════════════════════
    public static class LevelPhysics
    {
        // Advance the entire level by one frame.
        // - Updates Engine timing globals
        // - Runs every active entity's Update()
        // - Handles camera tracking
        public static void Update(Level level, float deltaTime)
        {
            if (level == null) return;

            Engine.DeltaTime    = deltaTime;
            Engine.RawDeltaTime = deltaTime;
            level.TimeActive   += deltaTime;
            level.RawTimeActive += deltaTime;

            // Update all entities in insertion order
            var entities = level.Entities;
            for (int i = 0; i < entities.Count; i++)
            {
                var e = entities[i];
                if (e.Active) e.Update();
            }

            // Advance the camera to follow the player
            var player = level.Tracker.GetEntity<Player>();
            if (player != null && !player.Dead)
                TrackCamera(level, player);
        }

        // Smooth camera that keeps the player centred in the viewport.
        private static void TrackCamera(Level level, Player player)
        {
            float targetX = player.Center.X - Engine.Width  * 0.5f;
            float targetY = player.Center.Y - Engine.Height * 0.5f;

            // Clamp to level bounds
            targetX = MathHelper.Clamp(targetX, level.Bounds.X, level.Bounds.Right  - Engine.Width);
            targetY = MathHelper.Clamp(targetY, level.Bounds.Y, level.Bounds.Bottom - Engine.Height);

            // Exponential smoothing so the camera slides gently
            const float smoothing = 8f;
            level.Camera.Position.X = MathHelper.Lerp(level.Camera.Position.X, targetX,
                                                       Engine.DeltaTime * smoothing);
            level.Camera.Position.Y = MathHelper.Lerp(level.Camera.Position.Y, targetY,
                                                       Engine.DeltaTime * smoothing);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LEVEL BUILDER — Fluent construction API for rooms
    // ══════════════════════════════════════════════════════════════════════════
    public class LevelBuilder
    {
        private readonly Level level;

        public LevelBuilder(int pixelWidth = 320, int pixelHeight = 180)
        {
            level = new Level();
            level.Bounds = new Rectangle(0, 0, pixelWidth, pixelHeight);
        }

        // ── Geometry ──────────────────────────────────────────────────────────

        public LevelBuilder AddPlatform(float x, float y, float w, float h)
        {
            var s = new Solid { Position = new Vector2(x, y), Collider = new Hitbox(w, h) };
            level.Add(s);
            return this;
        }

        public LevelBuilder AddJumpThrough(float x, float y, float w)
        {
            var jt = new JumpThrough(new Vector2(x, y), w);
            level.Add(jt);
            return this;
        }

        // ── Hazards ───────────────────────────────────────────────────────────

        public LevelBuilder AddSpike(float x, float y, float size,
                                     SpikeHazard.Directions dir)
        {
            level.Add(new SpikeHazard(new Vector2(x, y), size, dir));
            return this;
        }

        public LevelBuilder AddEnticeBladeCircular(float cx, float cy,
                                                    float radius, float speed = MathHelper.Pi)
        {
            level.Add(EnticeBlade.CreateCircular(new Vector2(cx, cy), radius, 0, speed));
            return this;
        }

        public LevelBuilder AddEnticeBladeLinear(float x1, float y1, float x2, float y2,
                                                  float speed = 80f)
        {
            level.Add(EnticeBlade.CreateLinear(new Vector2(x1, y1), new Vector2(x2, y2), speed));
            return this;
        }

        // ── Collectibles ──────────────────────────────────────────────────────

        public LevelBuilder AddStrawberry(float x, float y)
        {
            level.Add(new StrawberryPickup(new Vector2(x, y)));
            return this;
        }

        public LevelBuilder AddGoldenStrawberry(float x, float y)
        {
            level.Add(new GoldenStrawberry(new Vector2(x, y)));
            return this;
        }

        public LevelBuilder AddKey(float x, float y)
        {
            level.Add(new Key(new Vector2(x, y)));
            return this;
        }

        public LevelBuilder AddDashCrystal(float x, float y)
        {
            level.Add(new DashCrystal(new Vector2(x, y)));
            return this;
        }

        public LevelBuilder AddFlyFeather(float x, float y)
        {
            level.Add(new FlyFeatherPickup(new Vector2(x, y)));
            return this;
        }

        // ── Entities ──────────────────────────────────────────────────────────

        public LevelBuilder AddSpring(float x, float y,
                                       Spring.Orientations orientation = Spring.Orientations.Floor)
        {
            level.Add(new Spring(new Vector2(x, y), orientation));
            return this;
        }

        public LevelBuilder AddBumper(float x, float y)
        {
            level.Add(new Bumper(new Vector2(x, y)));
            return this;
        }

        public LevelBuilder AddDashBlock(float x, float y, float w, float h,
                                          DashBlock.Directions breakDir = DashBlock.Directions.Any,
                                          bool permanent = false)
        {
            level.Add(new DashBlock(new Vector2(x, y), w, h, breakDir, permanent));
            return this;
        }

        public LevelBuilder AddCrumbleBlock(float x, float y, float w)
        {
            level.Add(new CrumbleBlock(new Vector2(x, y), w));
            return this;
        }

        public LevelBuilder AddFallingBlock(float x, float y, float w, float h)
        {
            level.Add(new FallingBlock(new Vector2(x, y), w, h));
            return this;
        }

        public LevelBuilder AddKevin(float x, float y, float w, float h,
                                      Kevin.Axes axes = Kevin.Axes.Both)
        {
            level.Add(new Kevin(new Vector2(x, y), w, h, axes));
            return this;
        }

        public LevelBuilder AddLock(float x, float y, float w, float h)
        {
            level.Add(new Lock(new Vector2(x, y), w, h));
            return this;
        }

        public LevelBuilder AddRedBooster(float x, float y)
        {
            level.Add(new RedBooster(new Vector2(x, y)));
            return this;
        }

        // ── Switches and Gates ────────────────────────────────────────────────

        public LevelBuilder AddDashSwitch(float x, float y, string groupId = "default")
        {
            level.Add(new DashSwitch(new Vector2(x, y), groupId));
            return this;
        }

        public LevelBuilder AddTouchSwitch(float x, float y, string groupId = "default")
        {
            level.Add(new TouchSwitch(new Vector2(x, y), groupId));
            return this;
        }

        public LevelBuilder AddTouchSwitchGate(float x, float y, float w, float h,
                                                string groupId,
                                                Vector2 openDir, float slideDistance = 32f)
        {
            level.Add(new TouchSwitchGate(new Vector2(x, y), w, h, groupId, openDir, slideDistance));
            return this;
        }

        // ── Torches ───────────────────────────────────────────────────────────

        public LevelBuilder AddBlueTorch(float x, float y, string groupId = "default",
                                          bool startLit = false)
        {
            level.Add(new BlueTorch(new Vector2(x, y), groupId, startLit));
            return this;
        }

        // ── Player ────────────────────────────────────────────────────────────

        public LevelBuilder AddPlayer(float x, float y,
                                       PlayerSpriteMode mode = PlayerSpriteMode.Madeline)
        {
            var player = new Player(new Vector2(x, y), mode);
            level.Add(player);
            level.Session.RespawnPoint = new Vector2(x, y);
            return this;
        }

        public Level Build() => level;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LEVEL MANAGER — Loads and manages the active Level
    // ══════════════════════════════════════════════════════════════════════════
    public class LevelManager
    {
        public Level Current { get; private set; }

        public void LoadLevel(Level level)
        {
            Current    = level;
            Engine.Scene = level;
        }

        // Update the current level by one frame.
        public void Update(float deltaTime)
        {
            if (Current == null) return;
            LevelPhysics.Update(Current, deltaTime);
        }

        // Respawn player at the saved respawn point.
        public void RespawnPlayer()
        {
            if (Current == null) return;

            var player = Current.Tracker.GetEntity<Player>();
            if (player != null) Current.Remove(player);

            Vector2 spawnPos = Current.Session.RespawnPoint ?? new Vector2(160, 90);
            var newPlayer = new Player(spawnPos);
            Current.Add(newPlayer);
        }

        // ── Built-in sample levels ────────────────────────────────────────────

        // Basic introductory room demonstrating most entity types.
        public static Level CreateSampleLevel()
        {
            return new LevelBuilder(320, 180)
                // Ground and platforms
                .AddPlatform(0,    168, 320, 12)   // floor
                .AddPlatform(0,    0,   8,  180)   // left wall
                .AddPlatform(312,  0,   8,  180)   // right wall
                .AddPlatform(60,   130, 80, 10)    // ledge
                .AddPlatform(200,  100, 80, 10)    // higher ledge
                .AddJumpThrough(100, 90, 60)        // one-way platform

                // Hazards
                .AddSpike(8, 165, 32, SpikeHazard.Directions.Up)
                .AddEnticeBladeCircular(260, 140, 20, MathHelper.Pi * 0.8f)

                // Interactive entities
                .AddSpring(100, 168, Spring.Orientations.Floor)
                .AddBumper(200, 145)
                .AddDashCrystal(150, 120)
                .AddFlyFeather(250, 80)

                // Crumble and falling blocks
                .AddCrumbleBlock(60, 130, 80)
                .AddFallingBlock(200, 90, 80, 10)

                // Switches and gate
                .AddTouchSwitch(80,  50, "gate1")
                .AddTouchSwitch(230, 50, "gate1")
                .AddTouchSwitchGate(155, 40, 10, 40, "gate1",
                                    new Vector2(0, -1), 48f)

                // Dash switch and key/lock
                .AddDashSwitch(285, 155, "lock1")
                .AddKey(285, 148)
                .AddLock(140, 80, 10, 30)

                // Kevin (crush block)
                .AddKevin(160, 155, 32, 14)

                // Torches
                .AddBlueTorch(40,  148, "torch1")
                .AddBlueTorch(280, 148, "torch1")

                // Collectibles
                .AddStrawberry(165, 20)
                .AddGoldenStrawberry(265, 20)
                .AddRedBooster(120, 55)

                // Player
                .AddPlayer(20, 155)
                .Build();
        }

        // "The Gauntlet" — showcase level that uses every entity type.
        // 640 × 800 px vertical climb from ground to golden strawberry.
        public static Level CreateGauntletLevel() => TheGauntletMap.Build();

        // Minimal test room for unit-testing physics.
        public static Level CreateTestLevel()
        {
            return new LevelBuilder(320, 180)
                .AddPlatform(0, 168, 320, 12)  // floor
                .AddPlatform(0,   0,   8, 180)  // left wall
                .AddPlatform(312, 0,   8, 180)  // right wall
                .AddPlayer(20, 155)
                .Build();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ROOM DEFINITION — Data class for describing a room's layout declaratively
    // ══════════════════════════════════════════════════════════════════════════
    public class RoomDefinition
    {
        public string   Name;
        public int      Width  = 320;
        public int      Height = 180;
        public Vector2  PlayerStart;

        // Tile-map solid array: true = solid, false = empty (each cell = TileSize pixels)
        public const int TileSize = 8;
        public bool[,]  Tiles;

        // Entity spawn descriptors (used by RoomFactory)
        public List<EntitySpawn> Entities = new List<EntitySpawn>();

        public struct EntitySpawn
        {
            public string Type;
            public float  X, Y;
            public float  W, H;
            public string Data;   // JSON or key=value extras
        }

        // Convert a tile-map into solid entities and add them to a builder.
        public LevelBuilder BuildSolids(LevelBuilder builder)
        {
            if (Tiles == null) return builder;
            int rows = Tiles.GetLength(0);
            int cols = Tiles.GetLength(1);

            for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
            {
                if (!Tiles[r, c]) continue;
                builder.AddPlatform(c * TileSize, r * TileSize, TileSize, TileSize);
            }
            return builder;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ROOM FACTORY — Builds a Level from a RoomDefinition
    // ══════════════════════════════════════════════════════════════════════════
    public static class RoomFactory
    {
        public static Level Build(RoomDefinition def)
        {
            var builder = new LevelBuilder(def.Width, def.Height);
            def.BuildSolids(builder);
            builder.AddPlayer(def.PlayerStart.X, def.PlayerStart.Y);

            foreach (var spawn in def.Entities)
                SpawnEntity(builder, spawn);

            return builder.Build();
        }

        private static void SpawnEntity(LevelBuilder builder, RoomDefinition.EntitySpawn s)
        {
            switch (s.Type)
            {
                case "spring":         builder.AddSpring(s.X, s.Y); break;
                case "bumper":         builder.AddBumper(s.X, s.Y); break;
                case "dash_crystal":   builder.AddDashCrystal(s.X, s.Y); break;
                case "fly_feather":    builder.AddFlyFeather(s.X, s.Y); break;
                case "strawberry":     builder.AddStrawberry(s.X, s.Y); break;
                case "golden_strawberry": builder.AddGoldenStrawberry(s.X, s.Y); break;
                case "key":            builder.AddKey(s.X, s.Y); break;
                case "lock":           builder.AddLock(s.X, s.Y, s.W, s.H); break;
                case "dash_block":     builder.AddDashBlock(s.X, s.Y, s.W, s.H); break;
                case "crumble_block":  builder.AddCrumbleBlock(s.X, s.Y, s.W); break;
                case "falling_block":  builder.AddFallingBlock(s.X, s.Y, s.W, s.H); break;
                case "kevin":          builder.AddKevin(s.X, s.Y, s.W, s.H); break;
                case "red_booster":    builder.AddRedBooster(s.X, s.Y); break;
                case "entice_blade":   builder.AddEnticeBladeCircular(s.X, s.Y, 20f); break;
                case "spike_up":       builder.AddSpike(s.X, s.Y, s.W, SpikeHazard.Directions.Up); break;
                case "spike_down":     builder.AddSpike(s.X, s.Y, s.W, SpikeHazard.Directions.Down); break;
                case "spike_left":     builder.AddSpike(s.X, s.Y, s.H, SpikeHazard.Directions.Left); break;
                case "spike_right":    builder.AddSpike(s.X, s.Y, s.H, SpikeHazard.Directions.Right); break;
                case "blue_torch":     builder.AddBlueTorch(s.X, s.Y, s.Data ?? "default"); break;
                case "touch_switch":   builder.AddTouchSwitch(s.X, s.Y, s.Data ?? "default"); break;
                case "dash_switch":    builder.AddDashSwitch(s.X, s.Y, s.Data ?? "default"); break;
                case "jumpthrough":    builder.AddJumpThrough(s.X, s.Y, s.W); break;
                // Unknown entity types are silently skipped
            }
        }
    }
}
