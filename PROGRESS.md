# KARILING — Progress Log

_Last updated: 2026-11-20 (session 2 — Milestone 1.5)_

## Current phase

**Phase 1 — complete. Milestone 1.5 (racing feel, collisions, street hazards; spec §24) — implemented, ready for playtesting.**
Phase 2 has **not** been started (stopped after this milestone for playtesting, as instructed).

## Milestone 1.5 — what's done

| Area | Status | Notes |
|---|---|---|
| Three tyre-control states | Done | `controlled` → `unstable` at instability ≥ 0.42, back at ≤ 0.28 (hysteresis); `lost` at ≥ 1.0 or a single severe impact (≥ 0.8). Unstable = laggy steering, extra wobble/lean, weaker stick contact, runner visibly struggles. Lost = tyre detaches, tumbles/falls, runner chases and picks it up (≈1.5–3 s), then 1.8 s protection. |
| Speed-dependent handling | Done | Cornering threshold falls with speed (0.8 → 0.25 load ratio); saturating stress gives a readable wobble before failure; jerky steering, rough surfaces, dirt and boosts add stress; recovery is faster when slow and with Balance. |
| Airborne physics | Done | Real vertical channel: climbing velocity carries over crests (per-hazard launch factor), ballistic arc with arcade gravity, no push/steer in the air, landings scored by impact speed, lean, steering and air time; big landings bounce. |
| Runner simulation + stick contact | Done | Runner position is simulated: falls behind on jumps, shoves and stuns (contact lost), sprints to re-catch; separated > 2.6 s → OUT OF CONTROL. Stick lengths 70 cm (child) / 100 cm (adult); runner offset computed so the stick reaches. |
| Racer collisions | Done | Tyre↔tyre (mass-weighted impulse, side hits wobble more), tyre↔runner (runner shoved off line), runner↔runner, stick↔tyre knock. Two-pass resolution, clamped impulses, fly-over when airborne. Same rules for bots. |
| Stick & scoop | Done | Half-cylinder scoop (pineapple-tin for the wooden stick, translucent bottle for the bottle stick) sits on the rear tread, channel cupping it; two-bone arm IK puts the hand on the stick. Materials swappable in `render/kariling.ts`. |
| Model improvements | Done | Tyres: true circular lathe cross-section, per-type 3D tread blocks, painted sidewalls + moulded lettering. Characters rebuilt (lathed torso/shorts, tapered limbs, hands with fingers/thumb, shaped feet and footwear, detailed faces with iris/lids/nose/ears), baked per joint for performance. Houses: framed capiz windows, shutters, fascia, door frame, plinth. Nipa huts: bamboo frame, ridge cap. Curved grass blades, road-edge pebbles. |
| Obstacles (7 types) | Done | Cement humps (painted), dirt mounds, logs (across/partly across), cut-tyre speed strip (ref 14), flat motorbike tyres, fallen fronds + branch, dirt ramp with planks. Each has its own height profile + entry effects. |
| Potholes & mud | Done | Potholes: visible recessed decals with puddles; speed loss, instability and a jolt that lifts the wheel off the scoop at speed. Mud: surface override (low grip, high rolling resistance, roughness), splash particles; MTB copes best, road tyre worst. |
| Roadside canals | Done | Real recessed concrete channels with water along both sides of the concrete start/finish straight (sections differ per side). Solid walls; falling in → OUT OF CONTROL (canal), "AY NAKU!", 1.7 s penalty, respawn at the last safe on-road position with protection. Runners stop at the lip. |
| Speed boosts | Done | 2 boost pads (start straight, before the boosted right-hand sweep) with animated chevrons, sound, sparkle trail, FOV via speed; 1.5 s, ×1.2 top speed, ×1.8 accel, ×1.35 instability. |
| Street dogs | Done | 3 askals with lie/sit/wander idles. Trigger radius 8 m → bark + "ARF!" (0.75 s warning) → chase ≤ 3.4 s / 38 m leash → catch = 1.1 s cartoon stun (speed ×0.35, dizzy stars, "ARAY!") → return home → 9 s cooldown. 2.5 s protection after a stun; protected racers can't be caught. Fast racers can outrun them. Bots sprint when chased. |
| Dog poo | Done | 3 cartoon swirls with flies. Rolling through → dirty tyre (stink lines, "EWW!" reaction, −16% top speed, −25% grip, more wobble). Slow below 2.2 m/s without pushing → 1 s cleaning animation ("Linis!"), or rub it off driving on grass. Bots stop to clean on straights. |
| Track layout & balance | Done | 24 hazards, 2 canals, 3 dogs on Barangay Dash, building through the lap (see `src/tracks/barangayDash.ts`): gentle first third, village gauntlet, ramp-or-log choice by the paddies, boosted sweep, potholes before the concrete finish. |
| AI | Done | Same physics/hazards/collisions; hazard-aware lane picking (avoid blocks, line up boosts, avoid canal edges), speed planning under the speed-dependent stress threshold, roughness budget, hazard safe speeds, ramp-taking on Hard, cleaning, sprinting from dogs, awareness-based misses on Easy. |
| Debug HUD | Done | F3 / \` key, Settings → Debug HUD, or `?debug` in the URL: speed, control state + time, instability/wobble/lean, stress sources, load/slip/surface, ground contact + y/vy/air time, stick contact/separation, boost/stun/protection/dirt/cleaning, stamina. HUD also shows a CONTROLLED/UNSTABLE/OUT OF CONTROL chip. |

### Milestone 1.5 tests (71 total, all passing)

- `tests/physics.test.ts` (22): basics, mud/tyre affinity, speed-dependent threshold, UNSTABLE warning window before loss (> 0.25 s), low-speed sharp turns safe, hysteresis without flicker, contact loss when unstable, severe impact → lost, chase/pick-up/recover timing + protection, balance, tyre distinctness, ramp launch/arc/landing, faster take-off → longer/harder landing, no air push, runner separation + re-catch.
- `tests/collisions.test.ts` (9): separation, rear-end speed exchange, side vs rear wobble, hit on a wobbling tyre → lost, mass effect, tyre↔runner shove, runner↔runner, fly-over, no jitter/launch when side by side.
- `tests/hazards.test.ts` (16): height profiles, field sampling, canals on both sides, canal only beyond the edge, pothole hit (speed/instability/jolt), boost duration + effect, poo → dirty → clean, dirty is slower, canal crash + safe respawn with laps/checkpoints intact, diagonal canal run can't jump the canal, respawn never awards laps, dog warning → chase, chase limits + cooldown, stun duration + no stun-lock + protection expiry, protected racers not caught.
- `tests/race.test.ts`, `tests/progress.test.ts`, `tests/tyres.test.ts`: Phase 1 suites updated (full 3-lap bot races at every difficulty still pass with all hazards active).

### Balance snapshot (headless, 4 bots, 3 laps, Barangay Dash with hazards)

| Bots | Typical race | Losses of control per bot per race |
|---|---|---|
| Easy | ~3:00–3:10 | 0–6 (some canal falls / dog bites) |
| Normal | ~2:40–2:55 | 0–3 |
| Hard | ~2:30–2:40 | 0–4 (mostly after ramp jumps) |
| Flat-out scripted driver (always push, perfect line, never brakes) | 2:32 (MTB) / 2:42 (road) | 3–6, unstable ~9× |

So flat-out pushing is no longer safe: it costs several losses of control per race and only roughly matches a Hard bot that brakes for corners. A skilled human who lifts before tight corners and picks lines should be faster. All values are configurable (`src/config/gameplay.ts`, `src/config/hazards.ts`, `src/config/tyres.ts`, `src/sim/ai.ts`).

### Milestone 1.5 known issues / not done

- **Not tested on real phones/iPads.** Draw calls: ~250 (High, desktop) / ~360 (Medium incl. shadow pass) / ~190 (Low); triangles ~800k / 470k / 260k. Frame rates on real devices are unverified; Low/Medium should be used on older phones.
- Audio for the new events (bark, boost, splash, squish, stun, clunks) is synthesised but **could not be listened to** in testing.
- Not hand-played for a full race by a human; the tuning is from headless simulation + autopilot runs + targeted manual inputs.
- Obstacles are perpendicular to the track (logs lie straight across); angled placements aren't supported yet.
- Runners float over potholes/mud visually (only the tyre follows hazard heights; runners follow ramps/mounds via ground height).
- The tyre in a canal is drawn at the canal floor but the runner's stick is held loosely — no "fishing it out" animation; respawn is a sparkle pop.
- Bots sometimes fall into canals on Easy (intended imperfection, but may look clumsy).
- The flat-out scripted driver is still competitive with Hard bots on this fairly flowing track; if real playtesting confirms it's too easy, lower `stressThresholdHigh` or raise `cornerStressGain`.
- Bundle 755 kB (205 kB gzip) in one chunk.
- Dev-only hooks on `window.__app` in dev builds: `devAdvance`, `devAutopilot`, `devCam`, `devCloseup`.

## Phase 1 — completed (session 1)

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
