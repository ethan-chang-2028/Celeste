// TheGauntletMap.cs — "The Gauntlet" split into 6 rooms (640 × 180 px each).
//
// Room layout (bottom to top):
//   Room1_EntryHall  — Spring, Spikes, DashCrystal, JumpThrough, Strawberry
//   Room2_KeyRoom    — Key, Torches, CrumbleBlock, Bumper, EnticeBlade
//   Room3_LockRoom   — Lock, TouchSwitches, DashBlock, FallingBlock
//   Room4_CrushZone  — Kevin, DashSwitch, RedBooster, WallSpring
//   Room5_FlyZone    — FlyFeather, Bumpers, CircularBlade, Strawberry
//   Room6_Summit     — GoldenStrawberry
//
// Each room is exactly 640 × 180 px with:
//   - A solid ceiling strip at y=0 (8px) — also the "door" that the player passes
//   - A solid floor at y=172 (8px)
//   - Left / right walls (8px each)
//   - A RoomTransition at the top edge (y=0, full width) that loads the next room
//     spawning the player just below the floor of that room.
//
using System;
using Microsoft.Xna.Framework;
using Monocle;

namespace Celeste
{
    public static class TheGauntletMap
    {
        public const int W  = 640;
        public const int H  = 180;
        public const int FL = 172;   // y of the floor platform

        // ── Monolithic single-room build (backwards compat) ──────────────────
        public static Level Build() => BuildRoom1();

        // ── Room 1 — Entry Hall ───────────────────────────────────────────────
        // Learn: spring, floor spikes, dash crystal, one-way shelf, strawberry.
        // Exit: top-centre gap above the right ledge → Room2_KeyRoom
        public static Level BuildRoom1()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,    0,   8,   H)       // left wall
                .AddPlatform(W-8,  0,   8,   H)       // right wall
                .AddPlatform(0,    0,   W,   8)       // ceiling
                .AddPlatform(0,    FL,  W,   8)       // floor

                // Spring launches you off the floor
                .AddSpring(56, FL, Spring.Orientations.Floor)

                // Spike bed just past the spring
                .AddSpike(128, FL-4, 64, SpikeHazard.Directions.Up)

                // Dash crystal before the gap
                .AddDashCrystal(272, FL-16)

                // One-way shelf with a strawberry reward
                .AddJumpThrough(360, FL-48, 100)
                .AddStrawberry(410, FL-58)

                // Raised solid ledge on the right
                .AddPlatform(480, FL-64, 100, 8)
                .AddSpike(572, FL-64, 64, SpikeHazard.Directions.Right)

                // Player starts here
                .AddPlayer(24, FL-20)

                // Transition zone at the ceiling — player must reach here
                // (gap in the ceiling wall, 64px wide above the right ledge)
                .AddRoomTransition(490, 0, 80, 12,
                                   "Room2_KeyRoom", 24, FL-20)
                .Build();
        }

        // ── Room 2 — Key Room ─────────────────────────────────────────────────
        // Collect the key; light both blue torches to open the gate above.
        public static Level BuildRoom2()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,    0,   8,   H)
                .AddPlatform(W-8,  0,   8,   H)
                .AddPlatform(0,    0,   W,   8)
                .AddPlatform(0,    FL,  W,   8)

                // Left and right shelves
                .AddPlatform(0,   FL-48, 240, 8)
                .AddPlatform(390, FL-48, 242, 8)

                // Key on the left shelf
                .AddKey(80, FL-56)

                // Left-wall spring
                .AddSpring(8, FL-80, Spring.Orientations.WallLeft)

                // Crumble bridge across the gap
                .AddCrumbleBlock(148, FL-72, 96)

                // Bumper in the middle
                .AddBumper(316, FL-54)

                // Entice blade patrols left-to-right
                .AddEnticeBladeLinear(120, FL-100, 520, FL-100, 75f)

                // Two blue torches — light both to open the torch gate
                .AddBlueTorch(36,  FL-56, "torch1")
                .AddBlueTorch(596, FL-56, "torch1")

                // Torch gate: blocks passage upward until both torches are lit
                .AddTouchSwitchGate(276, 56, 88, 8, "torch1",
                                    new Vector2(0, -1), 48f)

                // Transition into room 3 — only reachable once the gate opens
                .AddRoomTransition(8, 0, W-16, 12,
                                   "Room3_LockRoom", 24, FL-20)
                .Build();
        }

        // ── Room 3 — Lock Room ────────────────────────────────────────────────
        // Use the key to open the lock; activate both touch switches to raise gate.
        public static Level BuildRoom3()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,    0,   8,   H)
                .AddPlatform(W-8,  0,   8,   H)
                .AddPlatform(0,    0,   W,   8)
                .AddPlatform(0,    FL,  W,   8)

                // Three platforms at different heights
                .AddPlatform(0,   FL-40, 180, 8)
                .AddPlatform(248, FL-80, 100, 8)
                .AddPlatform(428, FL-40, 204, 8)

                // Lock between left and centre platforms
                .AddLock(178, FL-92, 12, 48)

                // One-way shelf above centre
                .AddJumpThrough(296, FL-108, 80)

                // Touch switches on outer platforms
                .AddTouchSwitch(80,  FL-48, "sw1")
                .AddTouchSwitch(508, FL-48, "sw1")

                // Gate slides up when both switches activate
                .AddTouchSwitchGate(288, 44, 60, 8, "sw1",
                                    new Vector2(0, -1), 52f)

                // Dash block — break it for an alternate right route
                .AddDashBlock(370, FL-90, 40, 32)

                // Falling block — step on it fast!
                .AddFallingBlock(450, FL-92, 104, 12)

                // Transition at the top
                .AddRoomTransition(8, 0, W-16, 12,
                                   "Room4_CrushZone", 24, FL-20)
                .Build();
        }

        // ── Room 4 — Crush Zone ───────────────────────────────────────────────
        // Kevin guards left; hit the dash switch to open the right path.
        public static Level BuildRoom4()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,    0,   8,   H)
                .AddPlatform(W-8,  0,   8,   H)
                .AddPlatform(0,    0,   W,   8)
                .AddPlatform(0,    FL,  W,   8)

                // Three platforms
                .AddPlatform(0,   FL-60, 208, 8)
                .AddPlatform(268, FL-100, 100, 8)
                .AddPlatform(448, FL-60, 184, 8)

                // Kevin on the left platform
                .AddKevin(80, FL-108, 56, 16, Kevin.Axes.Horizontal)

                // Dash switch on centre platform
                .AddDashSwitch(326, FL-108, "dsw1")

                // Gate blocks the passage to the right platform
                .AddTouchSwitchGate(428, FL-100, 8, 40, "dsw1",
                                    new Vector2(1, 0), 56f)

                // Red booster on the right platform
                .AddRedBooster(532, FL-68)

                // Wall spring on the right wall
                .AddSpring(632, FL-100, Spring.Orientations.WallRight)

                // Ceiling spikes over the left platform
                .AddSpike(8, 8, 200, SpikeHazard.Directions.Down)

                // Transition at the top
                .AddRoomTransition(8, 0, W-16, 12,
                                   "Room5_FlyZone", 24, FL-20)
                .Build();
        }

        // ── Room 5 — Fly Zone ─────────────────────────────────────────────────
        // Grab the feather and fly through bumpers and the orbital blade.
        public static Level BuildRoom5()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,    0,   8,   H)
                .AddPlatform(W-8,  0,   8,   H)
                .AddPlatform(0,    0,   W,   8)
                .AddPlatform(0,    FL,  W,   8)

                // Four landing platforms
                .AddPlatform(0,   FL-60,  100, 8)
                .AddPlatform(180, FL-100, 100, 8)
                .AddPlatform(388, FL-60,  100, 8)
                .AddPlatform(548, FL-100,  84, 8)

                // Fly feather — star-fly state
                .AddFlyFeather(330, FL-108)

                // Two bumpers flanking the corridor
                .AddBumper(140, FL-130)
                .AddBumper(500, FL-130)

                // Circular blade orbiting the centre
                .AddEnticeBladeCircular(320, FL-120, 52f, MathHelper.Pi * 0.85f)

                // Second strawberry on platform D
                .AddStrawberry(590, FL-110)

                // Transition at the top — fly up through the open ceiling
                .AddRoomTransition(8, 0, W-16, 12,
                                   "Room6_Summit", 320, FL-20)
                .Build();
        }

        // ── Room 6 — Summit ───────────────────────────────────────────────────
        // Reach the pedestal and collect the golden strawberry.
        public static Level BuildRoom6()
        {
            return new LevelBuilder(W, H)
                // Boundary
                .AddPlatform(0,   0,   8,   H)
                .AddPlatform(W-8, 0,   8,   H)
                .AddPlatform(0,   FL,  W,   8)   // floor; no ceiling — open sky

                // Summit floor step
                .AddPlatform(0, FL-40, W, 8)

                // Narrow final pedestal
                .AddPlatform(280, FL-100, 80, 8)

                // Golden strawberry — the ultimate reward
                .AddGoldenStrawberry(320, FL-116)

                // No upward transition; the level ends here
                .Build();
        }
    }
}
