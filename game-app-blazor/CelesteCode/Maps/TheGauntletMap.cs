// TheGauntletMap.cs — "The Gauntlet"
//
// A vertical climbing level (640 × 800 px) that uses every entity type
// introduced in GameEntities.cs exactly once or more.
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  LAYER 6 · Summit     (y  0 – 160)   Golden Strawberry         │
// │  LAYER 5 · Fly Zone   (y 160 – 300)  Feather + Bumpers + Blade │
// │  LAYER 4 · Crush Zone (y 300 – 440)  Kevin + DashSwitch + Red  │
// │  LAYER 3 · Lock Room  (y 440 – 560)  Lock + TouchSwitch + Gate │
// │  LAYER 2 · Key Room   (y 560 – 700)  Key + Torches + Crumble   │
// │  LAYER 1 · Ground     (y 700 – 800)  Start + Spring + Spikes   │
// └─────────────────────────────────────────────────────────────────┘
//
// Activation chains
//   "torch1"  – light both BlueTorches in Layer 2
//               → TouchSwitchGate at Layer 2/3 border slides up
//   "sw1"     – step on both TouchSwitches in Layer 3
//               → TouchSwitchGate inside Layer 3 slides up
//   "dsw1"    – dash into DashSwitch in Layer 4
//               → TouchSwitchGate in Layer 4 slides right (reveals RedBooster)
//
using System;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    public static class TheGauntletMap
    {
        public const int W = 640;
        public const int H = 800;

        public static Level Build()
        {
            return new LevelBuilder(W, H)

                // ── World boundaries ──────────────────────────────────────
                .AddPlatform(0,       0,   8,   H)      // left wall
                .AddPlatform(W - 8,   0,   8,   H)      // right wall
                .AddPlatform(0,       0,   W,   8)      // ceiling

                // ══════════════════════════════════════════════════════════
                // LAYER 1 — Ground Floor   (y 700 – 800)
                // Learn: spring, spikes, dash crystal, jumpthrough, strawberry
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0, 768, W, 32)             // ground

                // Floor spring — first launch upward
                .AddSpring(56, 768, Spring.Orientations.Floor)

                // Spike bed just past the spring
                .AddSpike(128, 764, 64, SpikeHazard.Directions.Up)

                // Dash crystal — grab it before the first gap
                .AddDashCrystal(272, 752)

                // One-way platform shelf with a strawberry reward
                .AddJumpThrough(360, 720, 100)
                .AddStrawberry(410, 710)

                // Raised solid ledge on the right, walled by right-facing spikes
                .AddPlatform(480, 704, 100, 8)
                .AddSpike(572, 704, 64, SpikeHazard.Directions.Right)

                // Player start
                .AddPlayer(24, 750)

                // ══════════════════════════════════════════════════════════
                // LAYER 2 — Key Room   (y 560 – 700)
                // Collect the key, light both blue torches to open the gate
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0,   652, 240, 8)          // left shelf
                .AddPlatform(390, 652, 242, 8)          // right shelf

                // Key sits on the left shelf
                .AddKey(80, 644)

                // Left-wall spring bounces you toward the right shelf
                .AddSpring(8, 618, Spring.Orientations.WallLeft)

                // Crumble bridge spanning the central gap
                .AddCrumbleBlock(148, 620, 96)

                // Bumper in the middle — use it to arc across the gap
                .AddBumper(316, 638)

                // Entice blade patrols left-to-right across the room
                .AddEnticeBladeLinear(120, 608, 520, 608, 75f)

                // Two blue torches — light both to open the torch gate above
                .AddBlueTorch(36,  644, "torch1")
                .AddBlueTorch(596, 644, "torch1")

                // Torch gate: blocks the passage up until both torches are lit
                //   (TouchSwitchGate now also listens to BlueTorch.OnAllLit)
                .AddTouchSwitchGate(276, 564, 88, 8, "torch1",
                                    new Vector2(0, -1), 48f)

                // ══════════════════════════════════════════════════════════
                // LAYER 3 — Lock & Switch Room   (y 440 – 560)
                // Use the key → lock opens; step on both touch switches → gate
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0,   540, 180, 8)          // left platform
                .AddPlatform(248, 500, 100, 8)          // centre platform
                .AddPlatform(428, 540, 204, 8)          // right platform

                // Lock blocks the narrow passage between left and centre
                .AddLock(178, 492, 12, 48)

                // One-way shelf above the centre platform
                .AddJumpThrough(296, 468, 80)

                // Touch switches on the outer platforms
                .AddTouchSwitch(80,  532, "sw1")
                .AddTouchSwitch(508, 532, "sw1")

                // Gate slides up when both touch switches are activated
                .AddTouchSwitchGate(288, 452, 60, 8, "sw1",
                                    new Vector2(0, -1), 52f)

                // Dash block — break it to clear an alternate route right
                .AddDashBlock(370, 490, 40, 32)

                // Falling block — step on it fast!
                .AddFallingBlock(450, 488, 104, 12)

                // ══════════════════════════════════════════════════════════
                // LAYER 4 — Crush Zone   (y 300 – 440)
                // Kevin guards the left; dash switch opens the right path
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0,   420, 208, 8)          // left platform
                .AddPlatform(268, 380, 100, 8)          // centre platform
                .AddPlatform(448, 420, 184, 8)          // right platform

                // Kevin the crush block — dash him to the right to clear path
                .AddKevin(80, 372, 56, 16, Kevin.Axes.Horizontal)

                // Dash switch on the centre platform → opens the gate right
                .AddDashSwitch(326, 372, "dsw1")

                // Gate blocks the passage to the right platform until hit
                .AddTouchSwitchGate(428, 380, 8, 40, "dsw1",
                                    new Vector2(1, 0), 56f)

                // Red booster on the right platform — blast upward
                .AddRedBooster(532, 408)

                // Wall spring on the right wall — alternate bounce path
                .AddSpring(632, 368, Spring.Orientations.WallRight)

                // Ceiling spikes menace the left platform
                .AddSpike(8, 308, 200, SpikeHazard.Directions.Down)

                // ══════════════════════════════════════════════════════════
                // LAYER 5 — Fly Zone   (y 160 – 300)
                // Grab the feather and fly through bumpers and the orbital blade
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0,   280, 100, 8)          // platform A
                .AddPlatform(180, 240, 100, 8)          // platform B
                .AddPlatform(388, 280, 100, 8)          // platform C
                .AddPlatform(548, 240,  84, 8)          // platform D

                // Fly feather — star-fly state for the rest of this layer
                .AddFlyFeather(330, 232)

                // Two bumpers flank the flight corridor
                .AddBumper(140, 208)
                .AddBumper(500, 208)

                // Circular entice blade orbiting the centre void
                .AddEnticeBladeCircular(320, 208, 52f, MathHelper.Pi * 0.85f)

                // Second strawberry — floating on platform D
                .AddStrawberry(590, 232)

                // ══════════════════════════════════════════════════════════
                // LAYER 6 — Summit   (y 0 – 160)
                // Reach the pedestal and collect the golden strawberry
                // ══════════════════════════════════════════════════════════
                .AddPlatform(0,   140, W,  8)           // summit floor
                .AddPlatform(280,  80, 80, 8)           // final pedestal

                // Golden strawberry — the ultimate reward
                .AddGoldenStrawberry(320, 64)

                .Build();
        }
    }
}
