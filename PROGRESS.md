# KARILING — Progress Log

_Last updated: 2026-11-20 (session 1)_

## Current phase

**Phase 1 — Playable single-player game: complete and ready for playtesting.**
Phase 2 has **not** been started (by instruction: stop after Phase 1 for review).

## Completed (Phase 1)

| # | Feature | Notes |
|---|---|---|
| 1 | Vite + strict TypeScript + Three.js foundation | Vite 8, TS 5.9 (strict), three r187, Vitest 5, ESLint 10 |
| 2 | Barangay Dash track | 576 m closed spline loop; concrete start straight, dusty lanes, two gravel sections; widths vary 8.4–10.4 m; bamboo-fence barriers |
| 3 | Stylised Filipino runner | Procedural low-poly character: big head, face, hair styles, clothing, sandals/barefoot/sneakers, child/adult proportions |
| 4 | Upright rolling tyre | Torus tyre with procedural tread + painted sidewall patterns; rolls, leans into turns, wobbles, falls over |
| 5 | Wooden pushing stick | Stick stretches from the runner's right hand to the back of the tyre every frame; bottle-stick model also built (used by bots) |
| 6 | Running/pushing animation | Procedural: stride synced to speed, arm swing, push pulse, lean, wobble reaction, fall stumble, crouch-and-recover, victory hop, cheer, sad |
| 7 | Acceleration, steering, braking | Custom arcade physics, fixed 60 Hz timestep, render interpolation |
| 8 | Wobble & balance | Instability meter fed by cornering load vs grip, rough surfaces and collisions; fall → recovery (~1.8 s) → resume |
| 9 | Stamina | Hard acceleration drains; steady cruising is ~neutral; coasting recovers; low stamina weakens push but never stops you |
| 10 | Third-person camera | Smooth chase, slight road look-ahead, speed FOV, building/tree avoidance, Near/Normal/Far |
| 11 | Desktop + mobile controls | One `RacerInput` abstraction; keyboard; multi-touch steering pad + Push/Brake/Balance buttons; safe areas; rotate-device prompt; Auto-push option |
| 12 | Three AI competitors | Same physics as the player; pure-pursuit steering, curvature-based braking, overtaking lanes, stamina management, occasional mistakes; Easy/Normal/Hard; mild catch-up |
| 13 | 3 laps + valid checkpoints | 12 ordered gates; skipped gates block the lap; teleport/shortcut jumps rejected; ranking capped at the next unpassed gate |
| 14 | Race timer & HUD | Position, lap, lap/total/best times, speed, stamina bar, balance bar, minimap, name tags, 3-2-1-GO, lap/final-lap/finish messages, wobble & wrong-way warnings |
| 15 | Results screen | Rankings, tyre, total time, best lap, PB badges; Race Again / Change Track / Records / Home |

Also delivered early (cheap, useful): pause menu (resume / reset to track / restart / settings / quit), settings (graphics Low/Medium/High, camera, touch mode, auto-push, SFX & music volume), local records + race history, procedurally synthesised SFX and original background music, dust particles, cheering spectators, dynamic resolution scaling.

## Technical decisions

- **Sim/render split.** `src/sim` is deterministic and Three.js-free (seeded RNG, fixed timestep). This is what will run server-side for authoritative multiplayer.
- **Coordinate convention.** Forward = `(sin h, cos h)` in XZ; increasing heading turns left; right vector `(-cos h, sin h)`. Models face +z; their right side is −x.
- **Track.** Centripetal Catmull–Rom spline, uniformly resampled at ~1 m; O(window) projection with an index hint.
- **Lap validation.** `advanceProgress` (pure) credits only the next gate in order, rejects >5 m/tick jumps; first crossing of the line just "starts" the racer (grid is behind the line).
- **Physics model.** Forward speed + heading + lateral slide. Lateral demand (`speed × yaw`) vs grip limit → understeer/slide and instability. Lean is visual + feedback. Push acceleration fades as `1 − (v/vmax)²`.
- **Tyres/sticks/surfaces are data** in `src/config`. Ratings 1–10 from the brief are kept alongside tuned physics numbers; tests check that orderings match ratings.
- **Rendering.** Buildings merged per material (BatchBuilder), vegetation instanced with a shader wind sway, procedural canvas textures, NeutralToneMapping, one shadow-casting sun that follows the player. Road is a vertex-coloured ribbon with alpha-feathered edges.
- **Audio.** Pure WebAudio synthesis (noise bursts, oscillators, a small sequencer) — nothing to license; context unlocked on first gesture.
- **Identity.** A local guest id + nickname in localStorage, clearly labelled as *not* authentication.

## Tuning snapshot (headless simulation, 4 bots, 3 laps)

| Bots | Typical race time | Lap |
|---|---|---|
| Easy | ~2:50–3:00 | ~56–60 s |
| Normal | ~2:30–2:40 | ~50–52 s |
| Hard | ~2:23–2:28 | ~47–50 s |

All four tyres finish within ~4% of each other on Barangay Dash (road tyre slightly favoured on the concrete straight; motorbike slowest out of corners). In an autopilot playthrough in the browser, a Normal race finished in 2:34.75 with all four racers within 4 seconds.

## Test results (session 1)

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — **34/34 pass** (tyre config, physics, checkpoints, lap timing, rankings, grid population/room capacity, full 3-lap bot races at each difficulty, barriers, countdown)
- `pnpm build` — pass (JS 684 kB / 183 kB gzip, CSS 14 kB)
- **Browser testing (Claude's built-in Chromium pane):** menus, setup, countdown, keyboard driving, a full 3-lap race to results (player driven by a dev autopilot hook), fall + recovery, pause/settings, quality switching, phone-landscape layout (740×360 emulation) and touch input via synthetic pointer events (push, steer, release). No console errors. Production build (`vite preview`) loads cleanly.
- **Not yet tested:** real iPhone/iPad Safari or Android hardware, real multi-finger touch, actual frame rates on phones, audio output (cannot be heard from the tool), a human playing a full race by hand.

## Known problems / limitations

- Only Barangay Dash exists; other track cards are shown locked ("Phase 2").
- Player loadout is fixed (Mountain Bike tyre + wooden stick, default character); customisation UI is Phase 2.
- Create/Join Room buttons are disabled placeholders (Phase 4). Records are local-only (Phase 3).
- Bots rarely fall (mistakes cause wobbles; falls mostly on Easy). May want more visible bot drama.
- Racer–racer collisions are simple circle pushes; bumping can occasionally shove a racer sideways a lot.
- The bundle is a single 684 kB chunk (fine for now; could split three.js later).
- Google Fonts is loaded from the network; offline play falls back to system rounded fonts.
- `devAdvance()` / `devAutopilot` test hooks exist on `window.__app` in **dev builds only**.

## Outstanding work / next steps

1. **Playtest Phase 1 by hand** on desktop, iPhone and iPad; tune `src/config/gameplay.ts`, `tyres.ts`, and `sim/ai.ts` (grip, stress threshold, fall time, catch-up).
2. **Phase 2:** character + tyre + stick customisation screen with live rotating preview; three more tracks (Street Sprint, Farm Run with mud & bridges, Cliffside Challenge with descents); richer terrain handling; animation & sound polish.
3. **Phase 3:** verify current Cloudflare Free limits, then Workers + D1 (guest identity with signed tokens, profiles, personal bests, leaderboards separated by verification status).
4. **Phase 4:** Durable Object rooms (room codes, invite links, lobby, ready states, bot filling via `populateGrid`, input relay + authoritative `RaceSession`).

## How to continue (for a new session)

- Read `docs/GAME_SPEC.md` (source of truth) and this file.
- `pnpm install && pnpm dev`, then `pnpm check` before committing.
- Gameplay numbers: `src/config/*`. Track: `src/tracks/barangayDash.ts`. Race rules: `src/sim/race.ts`, `src/sim/progress.ts`.
- Quick headless balance runs: write a throwaway Vitest file that creates a `RaceSession` with four bots and steps it to completion (see `tests/race.test.ts`).
