# KARILING — Development Handover

_Updated 2026-11-21 for Milestone 1.6 and the revised first power-up lineup._
_Read this first in a new session, then `docs/GAME_SPEC.md` (requirements, source of truth) and `PROGRESS.md` (status log)._

---

## 1. Exact current state

| Item | State |
|---|---|
| Phase 1 — playable single-player race | **Complete** |
| Milestone 1.5 — tyre-control states, collisions, street hazards, model upgrade (spec §24) | **Implemented, awaiting human playtest** |
| Milestone 1.6 — rig/ground-contact fixes, toasts, dash, landing bonus, power-ups, pedestrians, court (spec §26) | **Implemented, awaiting human playtest** — see `PROGRESS.md` |
| Phase 2 — customisation UI, 3 more tracks | **Not started** |
| Phase 3 — Cloudflare backend / D1 / leaderboards | **Not started** (nothing provisioned) |
| Phase 4 — multiplayer (Durable Objects) | **Not started** |
| Git | `main`. Pushed to `github.com/davidjparsons/kariling-game` (public, by the owner's choice) through `a8473f1`. |
| Checks (2026-11-21, revised power-ups) | `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` ✔ 131/131 · `pnpm build` ✔ |
| Hand-played by a human | **No.** Tuning comes from headless simulations, a dev autopilot driving the player in the browser, and targeted scripted inputs. |
| Real phones / iPads | **Not tested.** Only Chromium viewport emulation (740×360 landscape) and synthetic touch events. |
| Audio | Implemented (WebAudio synthesis) but **never listened to** — the test tooling cannot hear audio. |

The owner's next action is to playtest (`pnpm dev`, open `http://localhost:5173`, add `?debug` for the physics panel). Expect tuning requests.

---

## 2. Running, testing, tooling

```bash
pnpm install
pnpm dev          # Vite on :5173, also on the LAN (--host)
pnpm test         # Vitest, tests/*.test.ts only (tests/_scratch is ignored)
pnpm typecheck
pnpm lint
pnpm build        # tsc + vite build → dist/
pnpm check        # all of the above
```

- Node 24, pnpm 12, TypeScript 5.9 (not 7 — typescript-eslint requires < 6.1), Vite 8, Vitest 5, three r0.187, ESLint 10.
- `.claude/launch.json` has `kariling-dev` (5173) and `kariling-preview` (4173) for the Claude browser pane.
- `tests/_scratch/` is git-ignored and excluded from tsc/eslint/vitest config — use it for throwaway balance simulations (see §12).

### Dev-only hooks (dev builds only, via `window.__app`)

| Hook | Use |
|---|---|
| `__app.startRace()` | Start a race without clicking (private method, callable at runtime) |
| `__app.devAdvance(seconds, fps = 30, autopilot = false)` | Advance game time in fixed frames even when the browser pane is hidden (rAF is throttled when hidden). `autopilot` lets a Normal bot drive the player. |
| `__app.race.devAutopilot = new BotController(profile, seed, lane)` | Custom autopilot profile (e.g. with `takesRamps: true`) |
| `__app.devCam = { pos: [x,y,z], look: [x,y,z] }` / `null` | Pin the camera |
| `__app.devCloseup(racerIndex, yawDeg, dist, height)` | Frame a racer for model inspection |
| `__app.applySettings({ quality: 'low' })` etc. | Change settings programmatically |
| `__app.stage.renderer.info.render` | Draw calls / triangles |

Browser-pane gotchas: the pane sometimes renders the page into a tiny corner after being hidden — set an explicit viewport (`resize_window 1024×640`) to fix it. When hidden, `requestAnimationFrame` stalls, so the initial menu may appear *after* your scripted `startRace()`; clear `#ui` manually.

---

## 3. Architecture (as built)

```
src/
  config/      Data: gameplay.ts (PHYSICS, RACE, STICK_LENGTH), tyres.ts, sticks.ts, surfaces.ts,
               hazards.ts (HAZARDS, CANAL, DOG), appearance.ts (looks, bot roster, default player)
  core/        math.ts (clamp/lerp/damp/wrap…), rng.ts (mulberry32, deterministic)
  sim/         Render-free, deterministic, fixed 60 Hz:
               track.ts (spline track + projection), physics.ts (tyre + runner + control states),
               collisions.ts, hazards.ts (HazardField: obstacles/surfaces/canals ground field),
               dogs.ts, progress.ts (laps/checkpoints/ranking), ai.ts (BotController), race.ts (RaceSession)
  tracks/      barangayDash.ts (geometry + hazard/canal/dog placements)
  config/ (1.6) items.ts (ITEMS, DASH, LANDING_BONUS, EFFECT_LIMITS), pedestrians.ts (PEDESTRIAN)
  sim/ (1.6)   effects.ts (timed effects, capped modifiers, item roll, DoubleTapDetector), pickups.ts,
               pedestrians.ts (crossing state machine)
  render/ (1.6) items.ts (snack models, parol pickup), villager.ts (one-draw-call skinned villager),
               pedestrianView.ts, court.ts (basketball court + scripted game)
  render/      stage.ts (renderer/lights/quality), environment.ts (terrain, road, village, canals cover,
               foliage), hazards.ts (hazard + canal meshes), props.ts (buildings/vegetation builders),
               character.ts (Runner model + procedural animation + arm IK), kariling.ts (tyre, stick, scoop),
               racerView.ts (binds sim state → runner/tyre/stick/effects), dogView.ts, camera.ts,
               effects.ts (pooled dust/splash particles), batch.ts, materials.ts, textures.ts, quality.ts
  game/        raceController.ts — fixed-timestep loop, interpolation, events → audio/effects/HUD
  input/       input.ts — keyboard + touch → one RacerInput
  audio/       audio.ts — synthesised SFX and procedural music
  ui/          hud.ts, screens.ts, styles.css
  storage/     local.ts — guest profile, settings, local records/history (localStorage)
  main.ts      App: screens, environment, showroom, main loop, dev hooks
```

**Key rule:** `src/sim` imports nothing from three.js or the DOM. Everything that affects outcomes (physics, hazards, dogs, collisions, laps) runs there, deterministically, so it can later run inside a Durable Object for authoritative multiplayer. Rendering only reads sim state.

**Frame loop:** `RaceController.frame(dt)` accumulates real time and runs `RaceSession.step()` at a fixed 1/60 s (max 8 steps/frame), snapshotting positions before each tick; rendering interpolates tyre and runner positions/headings between snapshots.

**Tick order inside `RaceSession.step`:** countdown (dogs + pedestrians idle) → catch-up scaling → per racer: input (bot or human) → `stepRacer` (effects tick, item use, dash, physics + runner, landing-bonus window) → stuck check → `resolveRacerCollisions` (all pairs, 2 passes) → per racer: barrier/fence → runner clamp (fences, canal lips) → hazard enter-triggers → pickup collection → safe-position tracking → respawn if requested → lap progress → wrong-way → dogs (+ stuns) → pedestrians (+ bumps) → pickup respawn timers → finish check.

**Milestone 1.6 rendering notes:** the road and decals sit at y ≈ 0.004–0.016 (the sim ground is y = 0). `Runner.ground` (set by `RacerView` from a per-racer sampler in `RaceController`) is used by the leg IK; without it (menus, spectators) the ground is flat at the root. `Runner.footClearance` reports the solved sole heights (tests use it).

**Coordinate conventions:** forward = `(sin h, cos h)` in XZ; increasing heading turns **left**; right vector = `(-cos h, sin h)`. Positive `steer`/`yawRate` = right turn. Track lateral offset `d` > 0 = right of the racing line. three.js models face +z with their right side at −x.

---

## 4. Tyre physics (`src/sim/physics.ts`)

Arcade model per racer: forward `speed`, `heading`, sideways `latVel` slide, plus a vertical channel (`y`, `vy`, `grounded`). Ground comes from a `GroundFn(x, z) → { h, launch, surface, canal }` supplied by the race (track projection + `HazardField`).

**Longitudinal:** push accel = `tyre.acceleration × stick.pushPower × surface.accelMul × staminaFactor × effectivePush × (1 − (v/vmax)²)`, where `effectivePush = push × stickContact (× 0.35 while Balance held)`. `vmax` = tyre top speed × surface speed × tyre-surface affinity × stamina (0.94–1.0) × partial-push factor × boost (×1.2) × dirt (down to ×0.84). Resistance = surface rolling resistance × affinity + air drag·v². Brake 9 m/s². No drive and no rolling resistance in the air.

**Steering:** input steer is rate-limited (7/s at low speed → 2.8/s at top speed, 8/s returning; ×0.6 when UNSTABLE). Yaw = steer × turnRate × stick.steerAssist × turnScale(speed) (authority falls to 55 % at top speed; 40 % at standstill so you can walk it round). Air steering ×0.1. Lateral demand = speed·|yaw|; above the grip limit the tyre understeers (yaw ÷ √load), slides outward and scrubs speed.

**Instability (balance)** — the core of the handling, per second:
- corner stress = `3.2·x / (1 + 1.5·x)` where `x = max(0, load − threshold(speed))`; `threshold` falls from **0.80** (slow) to **0.25** (top speed) along speed². Saturating, so even full lock gives a readable wobble first.
- steering jerk = |Δsteer/dt| × speed² × 0.09; rough surface = roughness × affinity × speed² × 0.55.
- multiplied by tyre `instabilityMul`, stick `stabilityMul`, ×1.35 while boosted, ×(1+0.3·dirt); +0.22/s while the tyre rolls unattended (runner separated).
- recovery = tyre `recoveryRate` × calm factor (fades as load approaches threshold) × 2.3 when holding Balance × (1.7 slow → 0.45 fast).
- One-off impacts (`addImpact`): collisions, landings, obstacles, fences, stuns. ×0.25 while protected (`invuln`).
- Visual wobble amplitude = max(0.06 idle, instability^1.4); wobble also adds heading noise.

**Stamina:** drains with acceleration effort (`drive / 7.5 m/s² × 0.2/s`), +0.03/s while cruising, +0.3/s when not pushing. Low stamina weakens pushing (to 50 %) but never stops you.

**Tyres** (`src/config/tyres.ts`, ratings from the brief kept alongside tuned values):

| Tyre | Radius | Mass | Top speed | Accel | Turn | Grip | Instab× | Recovery | Character |
|---|---|---|---|---|---|---|---|---|---|
| BMX | 0.33 | 1.0 | 13.0 | 8.8 | 2.50 | 12.9 | 1.00 | 0.55 | quick, sharp, lower top speed |
| Mountain bike | 0.36 | 1.3 | 13.1 | 7.4 | 2.25 | 11.8 | 0.88 | 0.62 | all-rounder, best on dirt/gravel/grass/mud |
| Road | 0.38 | 0.8 | 14.3 | 7.9 | 2.00 | 10.9 | 1.22 | 0.48 | fastest on concrete, twitchy on rough ground |
| Motorbike | 0.39 | 2.4 | 13.3 | 5.4 | 1.85 | 10.2 | 0.60 | 0.72 | heavy, stable, slow out of corners |

Surfaces: paved (grip 1.0, roll 0.22), dirt (0.9, 0.42), gravel (0.74, 0.68, rough 0.6), grass (0.8, 1.5), mud (0.55, 1.8, rough 0.65). Sticks: wood (push 1.0, steer 1.0, stability 1.0, stamina 0.92) vs bottle (1.02, 1.05, 0.88, 1.08).

---

## 5. The three control states

State lives in `RacerPhysicsState.control` with `controlTime`, `lostKind` (`fall | impact | separated | canal`) and `lostPhase` (`chase | pickup | canal`).

| Transition | Condition (config in `PHYSICS`) |
|---|---|
| CONTROLLED → UNSTABLE | instability ≥ `unstableEnter` 0.42 (emits `EV_UNSTABLE`) |
| UNSTABLE → CONTROLLED | instability ≤ `unstableExit` 0.28 (hysteresis) |
| any → OUT OF CONTROL | instability ≥ 1.0 (`fall`); single impact ≥ `severeImpact` 0.8 (`impact`); runner separated > 2.6 s (`separated`); tyre drops below −0.25 m in a canal (`canal`) |
| OUT OF CONTROL → CONTROLLED | runner within 0.95 m of a grounded tyre slower than 2.2 m/s → `pickup` 0.65 s (×tyre recoveryTime, ×0.75 holding Balance) → controlled with instability 0.22 and 1.8 s protection. Hard cap 6 s → safe respawn. Canal → respawn after 1.7 s. |

**UNSTABLE effects:** steering slower/vaguer, stronger wobble-driven heading noise, lean ×1.25, stick contact quality drops (push down to 45 % at full instability), runner animation "struggle", HUD chip blinks amber, warning sound.

**OUT OF CONTROL effects:** stick contact 0, no push/steer/brake; the loose tyre decelerates fast, curls toward its lean side and tips over (`lean → ±1.4`); runner sprints to it (8.5 m/s) and picks it up. Camera frames the midpoint of runner and tyre.

**Stick contact** (`stickContact` 0..1, `separated` flag): the runner is simulated at a follow point behind-left of the tyre (`runnerConfig(age, radius)` derives the distance from stick length: child ≈ 1.04 m back, adult ≈ 1.25 m; 0.26 m left). Contact is 0 while airborne, cleaning or separated. Separated when the runner is > 0.5 m beyond its follow point (jumps, shoves, stuns); re-caught within 0.3 m once grounded.

**Airborne:** climbing ground carries `climbRate × launch` as vertical velocity over crests; arc with gravity 17 m/s². Landing severity = (impact speed − 2.2) × 0.14 + |lean| × 0.55 + |steer| × speed × 0.25 + airTime × speed² × 0.45; impacts > 3.6 m/s bounce (restitution 0.28). A step more than 0.15 m above an airborne tyre (or a canal-floor tyre meeting the canal wall) is a solid wall.

Protection (`invuln`): after stun (1.1 + 2.5 s), recovery (1.8 s), respawn (2 s). Protected racers take 25 % impact instability, can't be stunned or caught by dogs, and don't pick up poo.

---

## 6. Collisions (`src/sim/collisions.ts`)

Circle hitboxes: tyre r 0.36, runner r 0.3, stick = runner→tyre segment (only the middle 25–85 % counts).

- **Tyre ↔ tyre:** positional separation weighted by tyre mass, impulse along the normal (restitution 0.35, capped 4), converted to forward speed + side slide (clamped ±3.5 m/s); instability = closing speed × 0.09 × (1 + 0.8 × sideness) × mass share × 2.
- **Tyre ↔ runner:** runner mass 1.6; runner shoved off line (can cause separation); small instability for the runner's own tyre.
- **Runner ↔ runner:** separation; barging runner loses up to 10 % speed; small instability both.
- **Stick ↔ tyre:** light knock (0.04 / 0.06 instability).
- Tyres more than 0.45 m apart vertically fly over each other.
- Fences: a hard barrier at road edge + verge, deflects heading toward the tangent, speed loss, instability for hard hits. Runners are clamped inside fences and at canal lips.

---

## 7. Track & hazards (`src/sim/hazards.ts`, `src/config/hazards.ts`, `src/tracks/barangayDash.ts`)

Barangay Dash: 576 m closed centripetal Catmull–Rom loop, resampled at ~1 m; 12 ordered checkpoint gates; half-widths 4.2–5.2 m, 3.2 m grass verge to bamboo fences; concrete start/finish straight (0.9→0.1), gravel sections (0.33–0.37, 0.58–0.70), dirt elsewhere.

`HazardField` turns placements into a track-relative ground field: `sample(projection) → { h, launch, surface override, canal }` and `hazardsAt(s, d)` for enter triggers. Hazards are axis-aligned to the track (no rotation support). Full-width hazards set `width: 0`.

| Hazard | Size (L×W×H m) | Effect |
|---|---|---|
| Cement hump | 1.6 × road × 0.13, flat top | launch 0.45, small speed loss/instability |
| Dirt mound | 3.4 × 2.8 × 0.42 | launch 0.7 — hops |
| Log | 0.42 × 4.2 × 0.24 | launch 0.55, −20 % speed at top speed, instability up to 0.48, kick |
| Old-tyre strip (ref 14) | 0.9 × road × 0.10 ridged | launch 0.3, rough |
| Flat motorbike tyre | 0.8 ring × 0.10 | kick 0.9, instability |
| Fallen fronds | 2.6 × 2.4 | grass surface, −10 % speed, wobble |
| Dirt ramp | 5 × 3.2 × 0.85 | launch 1.0 — real jump; risky at speed |
| Pothole | 1.1 Ø, −0.09 | −24 % speed, instability up to 0.6, kick 2.4 m/s (wheel leaves the scoop) |
| Mud | 9 × 4.6 (one 6 × 3) | mud surface (grip 0.55, roll 1.8, rough 0.65), splashes |
| Boost | 4 × 2.6 | 1.5 s boost |
| Dog poo | 0.45 Ø | dirty tyre |

Entry effects fire once when a grounded (or low, y ≤ 0.12) tyre enters a footprint: `speed × (1 − speedLoss × sn)`, `addImpact(instability + instabilitySpeed × sn²)`, optional upward kick (if sn > 0.25), boost or dirt. `sn` = speed / tyre top speed.

**Placements on Barangay Dash (metres from the start line, d in m):** boost 22 (d −1.2) · cement hump 76 · potholes 118 (−1.8), 124 (1.1), 131 (3.0) · dog 100 (right) · poo 150 (1.6) · tyre strip 170 · fronds 200 (2.2) · mud 233 (−1.4) · poo 284 (−1.6) · dog 302 (left) · **ramp 364 (2.0) / log 366 (−2.1)** choice · mounds 384 (−2.3), 391 (2.1) · boost 408 (1.0) · mud 428 (2.4, small) · dog 425 (right) · flat tyres 447 (−1.3), 454 (1.7), 461 (−2.8) · poo 481 (−0.8) · potholes 500 (1.6), 506 (−1.2) · fronds 513 (−3.0) · cement hump 540. **Canals:** left 525→46, right 530→40 (both sides of the concrete straight), lip 0.3 m beyond the road edge, 1.1 m wide, 0.9 m deep.

**Canal crash:** tyre drops in → OUT OF CONTROL (`canal`) → "AY NAKU!" → 1.7 s → respawn at the racer's last safe position (updated while controlled, grounded, ≥ 1 m inside the road edge and not on a raised/mud hazard), facing forward, 2 s protection. Laps/checkpoints are preserved (race distance only moves back; no gates re-awarded).

**Dogs (`src/sim/dogs.ts`):** idle (lying / sitting / wandering 2.5 m) → racer within 8 m → `alert` 0.75 s (bark, "ARF! ARF!") → `chase` toward the runner at 9.6 m/s, max 3.4 s or 38 m from home → catch within 0.9 m = `applyStun` (1.1 s, speed ×0.35, +0.35 instability, dizzy stars, "ARAY!") → `return` home at 3 m/s → `cooldown` 9 s. Protected/busy racers aren't caught. Deterministic (no RNG).

**Dirt / cleaning:** poo sets `dirt = 1` → −16 % top speed, −25 % grip, +30 % instability gain, stink lines, "EWW!". Slowing below 2.2 m/s without pushing starts a 1 s clean ("Linis!"), or rolling on grass rubs it off at 0.35/s.

**Boosts:** 1.5 s, top speed ×1.2, accel ×1.8 (and a small drive even unpushed), instability ×1.35, AI plans corners with 80 % of its normal threshold while boosted. Track boost pads are independent of held items.

---

## 8. AI (`src/sim/ai.ts`)

Bots produce `RacerInput` and go through exactly the same physics, hazards, dogs and collisions.

1. **Lane choice:** bias + inside-line cut (`lineSkill`) + overtaking offset; hazards ahead (within 4 + 1.8·speed m) block lateral intervals (+0.75 m margin) for `avoid` hazards; boosts attract (lineSkill > 0.4); Hard bots aim for the ramp; canal-side edges cost extra; each hazard is "noticed" with probability `awareness` per lap (deterministic RNG).
2. **Steering:** pure pursuit to a look-ahead point (4 + 0.55·speed m), gain normalised by tyre turn rate and reduced at speed.
3. **Speed:** for curvature samples ahead, the highest speed whose load stays under `stressThreshold(v) × cornerSafety × 0.8` (and yaw authority), with braking distance at 5.5 m/s²; a surface-roughness budget; safe speeds for unavoidable hazards (`safeSpeed × hazardSpeedMul`).
4. **Other:** Balance when instability > `balanceAt`; stamina resting; stop to clean when dirty on a straight; sprint when a dog targets it; random over-steer mistakes; turn on the spot if facing backwards; post-finish cruising.
5. **Catch-up:** if a human is present, bots > 35 m ahead push up to 10 % less, > 35 m behind up to 6 % more (halved on Hard).

Profiles: Easy (cornerSafety 0.72, pushCap 0.72, mistakes 0.035/s, awareness 0.6), Normal (0.98, 0.9, 0.02/s, 0.85), Hard (1.18, 1.0, 0.008/s, 1.0, takes ramps). Bot roster/looks: `src/config/appearance.ts` (Inday BMX, Totoy motorbike, Ate Joy road/adult, Dodong MTB).

---

## 9. Characters, tyres, sticks and animation (render)

- **Runner (`render/character.ts`):** lathed torso/pelvis (flattened), tapered limbs, hands with four curled fingers + thumb, shaped feet with sandals/barefoot/sneakers, deformed-sphere skull with jaw, sclera/iris/pupil/glint/lids, brows, nose, C-shaped ears, lips, six hairstyles. Child 1.24 m; adults ×1.3. Meshes are **baked per joint** into vertex-coloured meshes (~20 draw calls per character). Joint rotations are smoothed (`Joint.apply`).
- **Animation modes:** idle, run, struggle (UNSTABLE: free arm out, wobbly torso/head), chase (separated/lost: sprint lunge), fall, recover (crouch & scoop), clean (crouch & scrub), shock (canal: hands on head), stunned (dizzy sway + stars), eww (hand to nose), celebrate, cheer, sad. Stride is synced to the simulated runner speed.
- **Right-arm IK:** two-bone IK (`aimRightHand`) puts the grip on the stick end, which points from the scoop back toward the shoulder; when not attached the stick is held loosely in FK.
- **Tyre (`render/kariling.ts`):** LatheGeometry cross-section (bead → sidewall → shoulder → crown), 56 segments; tread blocks per type (BMX chevrons, MTB knobs, motorbike blocks, road slick + groove); canvas texture with painted sidewall patterns (stripes/spots/zigzag/plain) and moulded lettering.
- **Stick + scoop:** 70 cm child / 100 cm adult shaft with grip wraps; half-cylinder scoop — pineapple tin (metal, ridges, label) for the wooden stick, translucent bottle with cap for the bottle stick — positioned on the rear tread ~24° below the hub, channel cupping the tread, scaled to the tyre's section.
- **Dogs (`render/dogView.ts`):** lathed body, saddle patch, snout, ears, 2-segment legs, curled tail; lie/sit/trot/gallop/bark poses; speech bubbles.
- **Effects:** pooled particle points (dust, mud/canal splashes, boost sparkles, respawn sparkle), sprite speech bubbles, dizzy stars, stink lines, camera shake.

---

## 10. Controls, HUD, settings

Parols grant **Buko Missile, Saging Peel, SkyFlakes Cracker Shot or Turon Turbo**. Buko throws
forward or rolls back and interacts with track height, surface resistance and fences. Saging is
a peel dropped behind, SkyFlakes fires a quick forward shot, and Turon is a short speed boost.
Humans and bots use the same item cooldowns and tyre-hit rules. A hit gives 1.8 seconds of
item-hit protection. See the configuration in `src/config/items.ts` and the shared projectile
simulation in `src/sim/projectiles.ts`.

| Action | Keyboard | Touch |
|---|---|---|
| Push | W / ↑ | PUSH (hold) |
| Dash | Double-tap W / ↑ | Double-tap PUSH |
| Use power-up / throw Buko forward | E | Item button |
| Roll Buko backward | Q | BACK when Buko is held |
| Steer | A D / ← → | steering pad (analogue by finger offset) |
| Brake | S / ↓ | BRAKE |
| Balance | Space / Left Shift | BALANCE |
| Camera distance | C | Settings |
| Debug HUD | F3 or \` | Settings → Debug HUD, or `?debug` |
| Pause | Esc / P | ⏸ |

Settings (localStorage `kariling.v1`): graphics Low/Medium/High, camera Near/Normal/Far, touch controls Auto/On/Off, Auto-push, Debug HUD, SFX and music volume, difficulty, laps. HUD: position, lap, lap/total/best times, control-state chip (+ BOOST/DIRTY/SAFE), notices, speed, stamina, balance bar, minimap, name tags, debug panel.

Quality profiles (`render/quality.ts`): Low (pixel ratio 1, no shadows, grass 900, foliage 0.55), Medium (1.5, shadows 1024, grass 2400, foliage 0.8, no foliage shadows), High (2, shadows 2048, grass 8000, foliage 1, foliage shadows). Dynamic resolution drops to 0.65× when FPS < 42. Measured in a race (Chromium, emulated): High ≈ 250–370 draw calls / 800k triangles; Medium ≈ 360 / 470k; Low ≈ 190 / 260k.

---

## 11. Known bugs, quirks and limitations

**Milestone 1.6 notes** — see `PROGRESS.md` "Milestone 1.6 known issues" (draw calls, sprint gait and scoop clearance to playtest, villager simplifications, scripted court).

**Bugs / unexplained**
1. **Stray dark specks on the start line in the menu background** (seen once in the main-menu orbit, small dark blobs above the checker). Investigation ruled out tread blocks, instanced rocks and raycastable meshes; root cause **not found**. May be particles at the origin (start line is at world 0,0) — check `DustSystem` alpha handling first.
2. `physics.integrate` re-enters OUT OF CONTROL as `canal` by briefly setting `control = 'controlled'` — works, but a hack; a tumbling tyre that slides into a canal switches lost kind mid-way.
3. `PHYSICS.climbSpeedLoss` doc comment says "fraction of speed per metre" but it is used as an energy fraction (`v² −= 2·g·dh·0.35`).
4. HUD "OUT OF CONTROL!" banner can linger ~1 s after the chip already shows CONTROLLED (timer-based message).

**Limitations / shortcuts**
- Hazards cannot be rotated relative to the track; logs always lie square across.
- Runners float over potholes/mud (only ramps/mounds lift them); a tyre in a canal has no "fish it out" animation — it respawns with a sparkle.
- Quality changes during a race only update renderer settings; foliage density changes apply on the next race. Antialias changes need a reload.
- Child/adult stick lengths change runner offset and collision geometry slightly; gameplay parity between ages is assumed, **not measured**.
- Dogs only exist during races (not in the menu showroom).
- No gamepad support. No customisation UI (player is always: child boy, MTB tyre, wooden stick).
- Single 755 kB JS chunk.
- `BotController` keeps a per-hazard-per-lap "noticed" map (tiny, grows with laps).

**Balance concerns to verify by playtest**
- A flat-out scripted driver (always push, perfect line, never brake) finishes ~2:32 on MTB with 3–6 losses of control — roughly equal to Hard bots (2:30–2:40). If humans find flat-out still viable, lower `stressThresholdHigh` (0.25) or raise `cornerStressGain` (3.2).
- Easy bots occasionally fall into canals (up to 1 per race).
- Ramp jumps make Hard bots separate from their tyre most laps (by design: the runner can't jump); the time cost has not been measured.

---

## 12. Testing summary

`pnpm test` — **131 tests in 11 files** after Milestone 1.6 (new: character, dogs, terrain, items, pedestrians — see `PROGRESS.md`). The table below is the Milestone 1.5 baseline:

| File | Tests | Covers |
|---|---|---|
| `tests/physics.test.ts` | 22 | acceleration/top speed/braking/surfaces, mud tyre affinity, steering & lean, stamina, determinism; speed-dependent threshold; controlled at gentle steer; UNSTABLE warning window (> 0.25 s) before loss; low-speed sharp turn safe; hysteresis/no flicker; contact loss when unstable; severe impact; lost → chase → pickup → recovery timing + protection; Balance; tyre distinctness; ramp launch/arc/landing; faster take-off → longer/harder landing; no air push; runner separation + re-catch |
| `tests/collisions.test.ts` | 9 | separation, rear-end, side vs rear wobble, hit on wobbling tyre → lost, mass, tyre↔runner, runner↔runner, fly-over, no jitter side-by-side |
| `tests/hazards.test.ts` | 16 | profiles, field sampling, canals both sides/only beyond the edge, pothole hit, boost duration/effect, poo → clean, dirty slower, canal crash + respawn with laps intact, diagonal canal run can't jump it, respawn never awards laps, dog warning/chase/limits/cooldown, stun duration + no stun-lock + protection expiry, protected not caught |
| `tests/race.test.ts` | 12 | track geometry/projection/surfaces, grid population (1–4 humans, max 4), full 3-lap bot races at Easy/Normal/Hard with hazards (2–4 min), countdown, idle human, AI-driven human finishes, barriers |
| `tests/progress.test.ts` | 7 | gates, lap timing, best lap, skipped gates/teleports rejected, backwards over the line, ranking cap, standings order |
| `tests/tyres.test.ts` | 5 | ratings from the brief, physics ordering vs ratings, no tyre dominates every surface, stick differences small |

**Browser-verified (Chromium pane, 2026-11-20):** menus, setup, countdown, keyboard driving, full 3-lap autopilot race → results with PB badges, OUT OF CONTROL fall → pickup, canal crash → respawn, ramp jump, dog bite ("BITTEN!"), boost, poo visuals, all hazard models, dogs, debug HUD, phone landscape layout (740×360) with touch controls, synthetic touch push/steer, quality switching, no console errors, production build loads.

**Untested:** a human playing full races; real iOS/Android/iPad Safari/Chrome; real multi-touch; real-device FPS; audio output; long sessions/memory; very old GPUs.

**Headless balance snapshot** (4 bots, 3 laps):

| Bots | Race time | Losses of control per bot |
|---|---|---|
| Easy | ~3:00–3:10 | 0–6 |
| Normal | ~2:40–2:55 | 0–3 |
| Hard | ~2:30–2:40 | 0–4 |

To re-run: `tests/_scratch/` is git-ignored; give it its own config (`tests/_scratch/vitest.config.ts` with `include: ['tests/_scratch/*.test.ts'], root: process.cwd()`) and run `npx vitest run --config tests/_scratch/vitest.config.ts <name>`. Create `tests/_scratch/stats.test.ts` that builds `new RaceSession(new Track(BARANGAY_DASH), bots, { laps: 3, difficulty, seed })`, steps until `phase === 'finished'`, and tallies `r.events` flags (`EV_FALL`, `EV_STUN`, `EV_CANAL`, …); write results with `writeFileSync` (console output is swallowed). Run with `npx vitest run tests/_scratch/stats.test.ts` — note the default test include only covers `tests/*.test.ts`, so pass the path explicitly.

---

## 13. Recent decisions (and why)

- **Runner is simulated, not just animated** — stick contact, separation on jumps, shoves and dog targeting all need a real runner position.
- **Saturating corner stress** — guarantees a visible UNSTABLE window before failure (spec: no sudden unavoidable failures).
- **Stamina drains with acceleration effort, not with holding push** — the earlier model left everyone permanently exhausted.
- **Effort normalised by a fixed 7.5 m/s² reference** — otherwise the slow-accelerating motorbike tyre was penalised twice.
- **AI steering gain normalised by turn rate** — BMX bots oscillated and fell constantly.
- **Canal walls are solid** (`wallStep`) and checked per side (`hasCanal(s, side)`) — fixed tyres jumping canals and the missing right-hand canal.
- **Characters baked per joint** — 1,236 → ~250 draw calls.
- **Foliage shadows only on High** — halves Medium's triangle load.
- **Repo is public** by the owner's choice (spec asked for private); never commit secrets.
- **TypeScript 5.9** pinned for typescript-eslint compatibility.

---

## 14. Recommended next steps

1. **Playtest Milestones 1.5 + 1.6 by hand** (new knobs: `src/config/items.ts`, `src/config/pedestrians.ts`, `DOG`, grass in `src/config/surfaces.ts`, `PHYSICS.dirtDuration`/`lumpStressGain`) on desktop and a real phone/iPad (Medium/Low). Use `?debug` to read instability/stress while tuning. Likely tuning knobs: `PHYSICS.stressThresholdHigh`, `cornerStressGain`, `recoveryFastMul`, `unstableEnter/Exit`, hazard `instabilitySpeed`/`kick`, `DOG.chaseSpeed`, `cleanTime`, AI `cornerSafety`.
2. **Fix the small known issues** in §11 (start-line specks, canal hack, banner lingering, comment) — quick wins.
3. **Listen to the audio** and adjust levels; consider ducking music on crashes.
4. **Phase 2** (spec §19): character/tyre/stick customisation screen with live 3D preview (the `RacerLoadout`/`TyreLook` types and the `Runner`/`buildTyre` builders already support all options), then Street Sprint, Farm Run (mud, bridges — hazard system ready) and Cliffside Challenge (needs track elevation: the sim is currently flat apart from hazards; `GroundFn` is the extension point).
5. Optional: hazard rotation, runner foot IK on uneven ground, code-splitting three.js.
6. **Phase 3/4** only after Phase 2: re-verify Cloudflare Free-tier limits before provisioning anything; `RaceSession` is designed to run inside a Durable Object.

Do **not** push or deploy without the owner's instruction.
