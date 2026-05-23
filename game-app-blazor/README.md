# game-app-blazor — Player.cs running in the browser

This directory is a Blazor WebAssembly scaffold that compiles **the existing
`game-app/CelesteCode/Player.cs` unchanged** and runs it in a browser.

> Status: **scaffold**. The project layout, stubs, csproj, and Blazor entry
> point exist. It has **not yet been compiled** because `dotnet` is not
> installed in the container that authored this scaffold. The first
> `dotnet build` will surface compile errors against the stubs — each one is
> fixed by adjusting a stub's signature, never by editing Player.cs.

## How "Player.cs unchanged" is enforced

The csproj references Player.cs **from its original location**:

```xml
<Compile Include="..\game-app\CelesteCode\Player.cs" Link="CelesteCode\Player.cs" />
```

No copy. Edits to `game-app/CelesteCode/Player.cs` change what this project
compiles. There is exactly one Player.cs in the repository.

## Architecture

```
Browser
 ├── Blazor WebAssembly runtime (Microsoft, ~2 MB)
 ├── game-app-blazor.dll
 │    ├── Player.cs                  ← unchanged, 5,472 lines from game-app/CelesteCode/
 │    └── Stubs/
 │        ├── Xna.cs                 ← Vector2, MathHelper, Color, Rectangle, Keys, Buttons
 │        ├── Monocle.cs             ← Actor, Entity, Scene, Tracker, Engine, Calc, StateMachine, Sprite, …
 │        ├── CelesteEntities.cs     ← Solid, JumpThru, Spikes, Booster, Holdable, …
 │        └── CelesteSystems.cs      ← Input, SaveData, Session, Audio, Sfxs, GFX, Dust, …
 └── wwwroot/index.html              ← keyboard bridge + canvas renderer
```

The browser:
1. Reads the keyboard, calls `[JSInvokable] OnKey` on the Blazor component.
2. `Pages/Index.razor` sets the appropriate `Input.MoveX.Value`, `Input.Jump.Pressed`, etc.
3. A 60 Hz timer calls `player.Update()` — this enters Player.cs and runs the real
   state machine (`NormalUpdate` / `ClimbUpdate` / `DashUpdate`).
4. Player.cs writes back to `player.Position`. We send the new position to JS,
   which draws a rectangle on a `<canvas>`.

Audio, particles, hair, and the sprite atlas are all stubbed as no-ops. The
mechanics — every constant, every state transition, every `Speed.X = …`,
every `Jump()` and `WallJump()` — are the real Player.cs code.

## Building (when dotnet is available)

```bash
cd game-app-blazor
dotnet workload install wasm-tools
dotnet restore
dotnet build
dotnet run
# Opens http://localhost:5000
```

## What's done

- Project skeleton: csproj, Program.cs, App.razor, Pages/Index.razor, _Imports.razor, wwwroot/.
- Stub files covering ~80 types Player.cs references.
- Real implementations (not no-ops) for: `Vector2`, `MathHelper.Lerp/Clamp`,
  `Calc.Approach`, `Entity.CollideCheck<T> / CollideFirst<T>`, AABB collision
  in `Collide.Check`, `Actor.MoveH/MoveV` with solid-blocking,
  `Tracker.GetEntities<T>` (by type with inheritance walk), `StateMachine`.
- Keyboard input bridge and a placeholder canvas renderer.

## What's not done

There are 5,472 lines in Player.cs. The first build will almost certainly
hit compile errors I couldn't anticipate without running the compiler.
The fix recipe for each:

| Error pattern | Fix |
|---|---|
| `'X' does not contain a definition for 'Y'` | Add property `Y` to stub `X`. |
| `The type or namespace name 'Z' could not be found` | Add empty class `Z` in the appropriate Stubs file. |
| `No overload for method 'M' takes N arguments` | Add an overload in the stub matching Player.cs's call site. |
| Generic constraint failure | Adjust the constraint on the stub method (usually `where T : Entity`). |

Each fix is in `Stubs/`, **never** in Player.cs.

Runtime: even once it compiles, most code paths in Player.cs that touch
audio/particles/cutscenes/dream-blocks will execute against no-op stubs.
The visible game-feel will come from gravity, jump, wall-jump, dash,
climb, run/friction, wall-slide — these are pure computation inside
Player.cs and need nothing from the stubs to feel right.

## Why this approach over the JS port

- `webSite/player.js` is a hand-translation. Drift from Player.cs is possible
  any time Player.cs changes.
- This project compiles **the actual Player.cs** the C# game uses. There is
  zero drift by construction: there's only one file.

Trade-off: ~2 MB WASM download + Blazor's startup time vs. ~10 KB of JS.

## Companion project

`game-app/webSite/` is the working JS test scene. It stays as a fallback
that runs without any build step.
