# KARILING

A colourful 3D browser racing game inspired by **kariling**, the traditional Filipino childhood game where kids run alongside an upright bicycle tyre, pushing and steering it with a stick.

Race three AI opponents around **Barangay Dash**, a coastal village circuit with dusty lanes, nipa huts, sari-sari stores, fiesta bunting and rice paddies. Manage your speed, stamina and the tyre's balance: take corners too hot and it wobbles (UNSTABLE) and then gets away from you (OUT OF CONTROL) — your runner has to chase it down. Watch out for potholes, mud, logs, humps, a jump, roadside canals, dog poo and the local askals.

> **Status:** Phase 1 and Milestones 1.5–1.6 are ready for playtesting, including the first four power-ups. See [docs/HANDOVER.md](docs/HANDOVER.md) (current state, systems, known issues), [PROGRESS.md](PROGRESS.md) and [docs/GAME_SPEC.md](docs/GAME_SPEC.md).

## Requirements

- Node.js 20+ (developed on Node 24)
- pnpm 9+ (developed on pnpm 12)
- A WebGL-capable browser (Chrome, Edge, Firefox, Safari / iOS Safari)

## Install & run

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173. The dev server also listens on your LAN (`--host`), so you can open the printed network URL on a phone or iPad on the same Wi-Fi.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Push (accelerate) | W / ↑ | **PUSH** (hold) |
| Dash | Double-tap W / ↑ | Double-tap **PUSH** |
| Use power-up / throw Buko forward | E | Item button |
| Roll Buko backward | Q | **BACK** when Buko is held |
| Steer | A D / ← → | Steering pad (left thumb; slide for finer control) |
| Brake | S / ↓ | **BRAKE** |
| Balance (steady a wobbling tyre) | Space | **BALANCE** |
| Cycle camera distance | C | Settings |
| Debug HUD (physics readout) | F3 or \` | Settings → Debug HUD |
| Pause | Esc / P | ⏸ button |

Tips:
- The faster you go, the less steering the tyre tolerates. Ease off or tap brake before tight corners; when the chip says **UNSTABLE**, straighten up, slow down or hold Balance.
- Small humps are fine; take the big ramp too fast or land leaning and you'll lose it.
- Steer around potholes, mud and poo. If the tyre gets dirty, slow down at the roadside to clean it, or keep racing until it wears off.
- Keep away from the canal edges on the concrete straight.
- Barking dog? Speed up to outrun it.
- Accelerating hard tires the runner; steady speed or coasting recovers stamina. **Auto-push** (Settings) lets younger players just steer.

Add `?debug` to the URL to start with the debug HUD on.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with hot reload |
| `pnpm test` | Vitest unit + headless race simulation tests |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm lint` | ESLint (typescript-eslint) |
| `pnpm build` | Type check + production build into `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm check` | All of the above in sequence |

## Project layout

```
src/
  config/      Data-driven gameplay config: tyres, sticks, surfaces, constants, character looks
  core/        Math helpers, deterministic RNG
  sim/         Render-free simulation: track geometry, tyre physics, laps/checkpoints, AI, race session
  tracks/      Track definitions (Barangay Dash)
  render/      Three.js: stage/lighting, environment, props, characters, tyre+stick, camera, effects
  game/        RaceController (fixed-timestep loop, interpolation, HUD/audio/effects glue)
  input/       Keyboard + touch → one RacerInput abstraction
  audio/       WebAudio-synthesised sound effects and music (no audio files)
  ui/          HTML/CSS screens and HUD
  storage/     Local guest profile, settings, personal bests (localStorage)
tests/         Vitest suites
docs/          Game spec + reference images
```

The `sim/` layer has no Three.js or DOM dependencies, so the same race code can later run inside a Cloudflare Durable Object for authoritative multiplayer.

## Deployment (future — not yet configured)

The plan (Phases 3–4) is Cloudflare's **Free** plan only: Pages for static assets, Workers for APIs, D1 for leaderboards, Durable Objects for multiplayer rooms. Nothing is deployed and no Cloudflare resources have been created. Free-tier limits must be re-verified before provisioning; no paid plans or billing will be enabled.

`pnpm build` produces a fully static `dist/` folder that can be served by any static host (including Cloudflare Pages) today.

## Credits

All 3D models, textures, sounds and music are generated procedurally in code. No third-party game assets are used. The font (Baloo 2) is loaded from Google Fonts under the SIL Open Font License.
