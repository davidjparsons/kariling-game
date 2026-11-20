# KARILING — Progress Log

_Last updated: 2026-11-21 (session 3 — Milestone 1.6). Start a new session with **`docs/HANDOVER.md`**._

## At a glance

**Implemented**
- Phase 1: single-player Barangay Dash race vs 3 bots, laps/checkpoints/timing, HUD, results, local records, settings, touch + keyboard controls, synthesised audio, Low/Medium/High graphics.
- Milestone 1.6 (session 3): rebuilt runner rig (pelvis-mounted legs, planted-foot leg IK on the race ground, natural arm IK, stick/scoop ground clearance), forward-pointing boost arrows, compact edge toasts instead of centre warnings, taller flat tyres and painted humps, longer road-aware dog chases with no repeat bites, real grass physics, two-option dog poo, double-tap dash, ramp "Nice Catch!" bonus, Filipino snack power-ups with parol pickups, crossing villagers, a barangay basketball court with a pick-up game.
- Milestone 1.5: three-state tyre control (CONTROLLED/UNSTABLE/OUT OF CONTROL), speed-dependent handling, airborne jumps and landings, simulated runner with stick contact and separation, racer collisions (tyre/runner/stick), 7 obstacle types, potholes, mud, roadside canals with safe respawn, boost pads, street dogs with stun, dog poo with cleaning, hazard-aware AI, debug HUD, upgraded tyre/character/stick/scoop/building models, mobile draw-call optimisation.

**Partially implemented**
- Customisation: data types, builders and bot looks support every option (age, gender, hair, skin, clothes, footwear, 4 tyres, tyre paint, 2 sticks), but there is **no customisation screen**; the player's loadout is fixed.
- Tracks: only Barangay Dash. The other three are shown locked.
- Mobile: layout, touch and quality tiers done; **real-device performance and Safari behaviour untested**.
- Audio: all events have sounds; **never listened to** in testing.
- Leaderboards: local personal bests only.

**Outstanding**
- Human playtest and tuning of Milestones 1.5 + 1.6 (next step).
- Known issues: see `docs/HANDOVER.md` §11 (start-line specks in the menu, canal state hack, lingering banner, a misleading config comment).
- Phase 2 (customisation UI, 3 tracks, track elevation), Phase 3 (Cloudflare Workers/D1, identity, leaderboards), Phase 4 (Durable Object multiplayer), gamepad support, code splitting.

**Last verified (2026-11-21, session 3):** `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` ✔ 124/124 · `pnpm build` ✔. Git: local `main`, Milestone 1.6 commits **not pushed**.

## Milestone 1.6 — gameplay improvements, fixes and Filipino power-ups (session 3)

Brief: `docs/GAME_SPEC.md` §26. Worked in the requested order; each step is its own commit.

| Area | Status | What changed (and why) |
|---|---|---|
| Character rig | Done | **Causes found:** hips hung from the body root while the pelvis mesh rotated with the torso; knee balls (r 0.041) were far thinner than trouser legs (r 0.066) so bends opened gaps; the default leg chain was 5 cm longer than the hip height (feet in the road); the arm IK rotated the upper arm *away* from its pole (elbow up/inward) and then picked whichever elbow sign "worked". **Fix:** translating pelvis carries the hips; waist joint with overlapping shirt; joint balls sized to the limbs; standing height derived from leg length + sole; planted-foot two-bone leg IK (knees only bend forward) sampling the race ground under each foot (humps/ramps/slopes), pelvis dropping only as far as needed; FK poses (fall, recover, clean, stun…) snap the lowest foot to the ground; feet follow the slope; arm IK rewritten with an explicit elbow position and a one-way hinge. |
| Stick / scoop / tyre contact | Done | Grip planned from the real shoulder at one stick length from the scoop, with a small push-pull pump; scoop rolls up the tread when the ground behind the tyre is higher; loose stick never points through the ground; a leaning tyre rests on its shoulder; the road and decals moved from y ≈ 0.03–0.05 down to the simulation's y = 0 plane (tyres and feet had been sinking into the visible road). |
| Boost arrows | Done | Chevrons were laid with `rotateX(−90°)`, which sends the tip backwards along the track; now laid tip-forward with corrected normals, using the track tangent (works on curves). |
| Warnings | Done | Centre banners/warn/notice replaced by **toasts** under the minimap: icon + short text, translucent, max 3, keyed (no duplicates), fade in/out; status (wobble, dizzy, cleaning, catch your tyre, wrong way) is one toast. Centre text is smaller and kept for countdown/laps/finish. Phone landscape: toasts sit above the touch buttons. |
| Obstacles | Done | Flat motorbike tyres: 16 cm collision ring, model sits fully above the road. Cement humps 18 cm × 2.1 m, cosine ramps (bounce + momentum loss, never a wall), stripes now actually render (the extrusion was one triangle strip across the road), cat's-eye studs. Old-tyre strip raised to 14 cm. |
| Dogs | Done | Tiring sprint 10.6 → 7.8 m/s over ≤ 6 s / 65 m (slow racers get caught, ≳ 11 m/s escapes); repeat warning barks + toast; steer round logs/ramps/mounds/canals and stay inside the fences; every dog ignores a racer bitten in the last 14 s. |
| Grass | Done | Grip 0.74, roll 1.9, speed ×0.68, accel ×0.68; deterministic lumpy patches add instability (scaled by tyre affinity — MTB copes, road tyre struggles); clippings particles; render-only wheel jostle on rough ground. Fences still bound the verge, so it's never a free shortcut. |
| Dog poo | Done | Never forced to stop: **A)** slow down near the road edge / on the verge → 0.9 s clean, full fix; **B)** race on with −16 % top speed / −25 % grip / +40 % wobble that stays near full strength, then wears off over 15 s, with a green stink trail. Bots: Easy cleans, Normal cleans fresh dirt, Hard races on. |
| Double-tap dash | Done | Double-tap W/↑ or the PUSH button (0.32 s window) → 0.75 s dash: ×1.7 accel, ×1.06 top speed, −14 % stamina, +wobble, ×0.82 steering response, ×1.45 instability; 3.2 s cooldown; needs stamina; sound + toast + particles. Bots dash on straights. |
| Ramp landing bonus | Done | Only after a real ramp take-off (launch ≥ 0.9, vy ≥ 0.8), ≥ 0.25 s air, landing severity ≤ 0.68 (a severe crash is 0.8), scoop back on within 1.3 s: 1.1 s ×1.45 accel; "Nice Catch!" toast + bubble, sparkle, arpeggio. Once per jump (flags cleared on landing and respawn). |
| Power-ups | Done | 12 parol (star-lantern) pickups in 4 rows; weighted random item by race position; one item held; 1 s roulette; 6 s respawn; HUD slot (E key or touch button left of BRAKE). Buko (Stability Shield, absorbs one hit/bite), Corn Chips (Crunch Boost), Crackers (Recovery), Pandesal (Endurance), Turon (Golden Roll), Cola sa Plastik (Sugar Rush → crash). Combined modifiers are capped; reuse refreshes, never stacks. Original 3D snack models, trails, sounds. Bots aim for boxes and use items situationally. All values in `src/config/items.ts`. |
| Pedestrians | Done | 3 crossing points × 2 villagers (sim, deterministic) + 4 chatting/cheering groups behind the fence (scenery). Crossers look, hesitate, cross, dodge, get startled when bumped (racer ×0.72 speed + wobble; 2.5 s no re-bump); never step out with < 1.6 s for the racer to react; never stuck. Bots avoid them. One skinned draw call per villager. |
| Basketball court | Done | Replaces the old bare court far in the infield: placed just behind the roadside fence (~0.1 lap), painted markings, hoops/backboards/rims, chain-link fence, bench, cooler, sign; 6 players (4 on Low) on a dribble → pass → drive → shoot → rebound loop; positional bounce sound. |

### Milestone 1.6 tests (124 total, all passing)
New: `tests/character.test.ts` (leg IK round-trip, knees never hyper-extend, clamp; child + adult feet never sink and one stays planted while running on flat/slope/humps; every FK pose rests on the ground; arm IK reaches with the elbow flexing one way), `tests/dogs.test.ts` (slow caught, fast escapes, repeat warnings, no re-bite, stays inside fences), `tests/terrain.test.ts` (grass accel/top speed/rolling resistance, MTB vs road tyre, lumpy patches, race ground reports grass/roadside/patchiness), `tests/items.test.ts` (double-tap detection, dash burst/stamina/wobble/cooldown/steering, landing bonus once / not for bumps or crawling, weighted selection by position, reveal → use → expiry, per-item effects, sugar crash, caps + refresh, shield, pickup respawn + one item held), `tests/pedestrians.test.ts` (state cycle, never steps out unfairly over 40 seeds, dodge + never stuck, bump effects + cooldown, bot races with crossings finish). Updated `tests/hazards.test.ts` for both poo options.

### Balance snapshot (headless, 4 bots, 3 laps, everything on)
| Bots | Typical race | Notes |
|---|---|---|
| Easy | ~3:05 (2:56–3:18) | 4–11 items used, occasional bites/falls, clean their tyres |
| Normal | ~2:55 (2:46–3:12) | |
| Hard | ~2:33 (2:30–2:39) | race on with poo; Nice Catch earned when the ramp landing is clean |

Pedestrian bumps: 0–1 per bot per race. Crossings started: ~36–49 per race.

### Milestone 1.6 known issues / not done
- **Not hand-played** and **not tested on real phones/iPads**; audio for the new sounds not listened to.
- Draw calls rose with villagers, court and pickups: measured in a race ≈ Low 235 / Medium 426 / High 435 (were ≈ 190 / 360 / 250–370). Phone FPS unverified.
- Feet slip a little at sprint speeds (cadence is capped at 17 rad/s rather than splaying the legs).
- Villagers' feet are rigid with the shin (no ankle) and walk on flat ground only; crossings are placed on flat road.
- Court players follow a simple script; the shot always "goes in" and the ball teleports to the rebounder.
- The scoop clearance is approximate (one lowest point); extreme leans on raised ground can still graze.
- Generic display names for branded snacks (see spec §26.9).

## Current phase

**Phase 1 — complete. Milestones 1.5 and 1.6 (spec §24, §26) — implemented, ready for playtesting.**
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
