# KARILING — Complete Game Development Brief

> Source of truth for the project. Saved verbatim from the original brief (session 1, 2026-11-20).
> Reference images live in `docs/reference/` (1–13). Images 1, 2, 6 are environment/art-style
> references; 3 is a BMX tyre; 4 and 13 are illustrations; 5 is the bottle-stick; 7–12 show the game being played.

## 1. Your role and objective

You are an experienced game developer, Three.js specialist, multiplayer engineer and 3D game designer.

Build a complete, visually appealing, mobile-friendly 3D browser racing game called **KARILING**.

Kariling is inspired by the traditional Filipino childhood game where children run alongside an upright bicycle tyre, using a wooden stick to push, steer and balance it.

I have attached seven reference images showing how this traditional game is played. Use them as the primary visual references for the mechanics, characters, tyres and cultural setting.

The goal is a game with the accessibility, excitement and polish of Mario Kart, but with original mechanics based on Kariling.

This must become a genuinely playable game, not just a 3D demonstration or a collection of menus.

### Guiding principles

- Fun, responsive arcade gameplay.
- Colourful, polished 3D visuals.
- Authentic Filipino atmosphere.
- Easy to play, challenging to master.
- Excellent mobile and iPad experience.
- Competitive single-player and multiplayer racing.
- Short, replayable races.
- Entirely free hosting, with no unexpected bills.
- Clean architecture that can expand over time.

Use sensible defaults, make technical decisions independently and avoid unnecessary questions.

## 2. Technology and hosting

Use the following stack:

| Component | Technology |
|---|---|
| Frontend | Vite + TypeScript |
| 3D rendering | Three.js |
| Game physics | Custom lightweight arcade physics |
| Game UI | HTML/CSS overlays |
| Hosting | Cloudflare Free |
| Static assets | Cloudflare Pages |
| Backend APIs | Cloudflare Workers |
| Multiplayer | Cloudflare Durable Objects with WebSockets |
| Database | Cloudflare D1 |
| Source control | GitHub |
| Local development | Node.js and pnpm |

### Critical hosting restriction

**I do not want any unexpected hosting charges, even if the game becomes extremely popular.**

Do not use Supabase.

Build the project around Cloudflare's Free plans.

- Do not enable paid plans.
- Do not enable pay-as-you-go billing.
- Do not create paid resources.
- Do not automatically upgrade any service.
- Do not assume every Cloudflare product is free.
- Verify current free-tier limits and product eligibility before provisioning resources.
- If a requested feature cannot operate within free-tier limits, explain the limitation and implement a safe alternative.
- Prefer rate limiting, rejecting new rooms or temporarily unavailable functionality over unexpected spending.
- Do not require a credit card for the intended setup.

Use Cloudflare's free allowances for static hosting, Workers, D1 and Durable Objects, subject to their current documented restrictions.

Design the application so it remains usable for small groups of friends and can degrade gracefully when free usage limits are exceeded.

Use an Australian or nearby region for backend data where configurable on the free plan. Do not claim guaranteed Sydney placement if Cloudflare does not offer it.

### Development order

Do not configure or deploy Cloudflare immediately.

**First build and test a fun single-player game locally.**

Only implement backend services after the core racing mechanics are working.

Keep the code structured to support multiplayer from the beginning.

## 3. Game concept

Players race by running alongside an upright tyre while pushing and guiding it using a stick.

The player controls the runner and tyre together.

The tyre must:

- Roll visibly as it travels.
- Accelerate when pushed.
- Respond to steering.
- Lean into corners.
- Wobble when unstable.
- Lose control if pushed too hard through sharp corners.
- Interact with road surfaces.
- Recover after falling.

The character must visibly run beside the tyre, not ride it or sit inside a vehicle.

The main challenge is managing speed and maintaining control.

Races have a maximum of four competitors, using human players, AI bots or a mixture.

Default race length: three laps.

Target race duration: approximately 2–4 minutes.

## 4. Visual style

Create a visually polished, stylised 3D game.

Think of the colourful, approachable look of Roblox combined with the appealing environments and racing presentation of Mario Kart.

The game should have its own identity rather than copying either game's characters or assets.

Visual goals:

- Bright tropical colours.
- Warm sunlight.
- Soft shadows.
- Smooth character animation.
- Expressive cartoon-style characters.
- Detailed but efficient 3D scenery.
- Natural-looking terrain.
- Attractive roads and corners.
- Animated vegetation where practical.
- Dust and tyre effects.
- Clean arcade-style interface.

Avoid generic blocky placeholder environments as the final design.

Use procedural 3D geometry and efficient reusable assets initially. Introduce lightweight GLB models when they improve the visual quality.

The environment should feel unmistakably Filipino.

Include appropriate features such as:

- Coconut palms.
- Banana trees.
- Rice fields.
- Nipa huts.
- Sari-sari stores.
- Colourful homes.
- Rural roads.
- Small bridges.
- Mountains.
- Tropical coastal landscapes.

The seven provided images should guide how the tyres, sticks and runners are represented.

## 5. Player customisation

Before racing, provide a character and equipment selection screen with a live rotating 3D preview.

### Characters

Allow players to select:

- Child or adult.
- Boy or girl.
- Multiple hairstyles.
- Skin tones.
- Shirt styles.
- Shirt colours.
- Shorts or trousers.
- Footwear including sandals and barefoot.

Character differences are cosmetic initially.

Do not give one gender or age group an inherent racing advantage.

The characters should have friendly stylised proportions and expressive animations.

### Tyre selection

Provide four tyre categories.

Each tyre should look physically different and have unique gameplay characteristics.

| Tyre | Speed | Acceleration | Stability | Cornering |
|---|---:|---:|---:|---:|
| BMX bicycle | 6 | 9 | 6 | 9 |
| Mountain bike | 7 | 7 | 8 | 8 |
| Road bicycle | 10 | 8 | 4 | 6 |
| Motorbike | 8 | 4 | 10 | 5 |

These are initial 1–10 design ratings, not final physics constants. Adjust them during playtesting.

**BMX tyre:** quick acceleration, excellent turning, moderate stability and lower top speed.

**Mountain bike tyre:** excellent all-round choice, strong dirt and grass traction.

**Road bicycle tyre:** fastest on paved roads but less stable on uneven terrain.

**Motorbike tyre:** heavy, stable, slower to accelerate and harder to turn sharply.

No tyre should dominate every track.

Use a data-driven configuration defining speed, acceleration, grip, rolling resistance, mass, stability, turning response and recovery characteristics.

### Tyre appearance

Allow players to change:

- Tyre colour accents.
- Painted sidewall stripes.
- Tread accent colours.
- Decorative patterns.

Changes should appear immediately in the 3D preview.

### Pushing stick

Provide two initial options.

**Traditional wooden stick**

A simple straight wooden stick.

Characteristics:
- Lightweight.
- Quick pushing action.
- Moderate steering assistance.
- Lower stamina cost.

**Stick with recycled plastic bottle attachment**

A wooden stick with a half-cut plastic vinegar bottle attached at the contact end, inspired by the Datu Puti bottles commonly used in the Philippines.

Characteristics:
- Better contact with the tyre.
- Increased steering stability.
- Slightly heavier.
- Different stamina and handling trade-offs.

Do not require proprietary logos or branding.

Stick selection should affect gameplay slightly without creating an overwhelming competitive advantage.

Display simple equipment statistics during customisation.

## 6. Tyre mechanics and physics

This is the most important gameplay feature.

Use lightweight custom arcade physics.

Do not attempt a computationally expensive rigid-body simulation unless absolutely necessary.

The tyre should feel believable while remaining easy to control.

### Movement

Implement:

- Acceleration through pushing.
- Speed limits.
- Momentum.
- Rolling friction.
- Surface grip.
- Braking.
- Steering.
- Turn radius.
- Lateral slip.
- Tyre leaning.
- Wobble.
- Recovery.
- Collision response.

Use a fixed simulation timestep independent of rendering frame rate.

### Balance mechanic

When the player turns sharply while travelling quickly, the tyre becomes less stable.

Instability should also increase on rough terrain or after collisions.

Provide visual feedback through tyre wobble and lean.

If the instability threshold is exceeded:

1. The tyre loses balance.
2. The character reacts.
3. The player loses speed.
4. A short recovery animation plays.
5. The player resumes racing.

Make the recovery penalty meaningful but not excessively frustrating.

### Stamina

Pushing the tyre consumes stamina.

Stamina should regenerate when the player reduces effort.

Low stamina affects acceleration and pushing efficiency rather than immediately stopping the player.

Keep the mechanic simple enough for younger players.

### Terrain interactions

Different surfaces should alter handling.

- Paved road: fast and smooth.
- Dusty road: moderate grip.
- Gravel: lower traction and more wobble.
- Grass: increased rolling resistance.
- Mud: reduced acceleration and extra instability.

Make tyre selection relevant to terrain.

## 7. Character animation

The runner needs convincing movement alongside the tyre.

Implement:

- Idle animation.
- Running.
- Faster running while accelerating.
- Stick pushing motion.
- Turning and leaning.
- Tyre wobble reaction.
- Tyre recovery.
- Victory celebration.
- Losing reaction.

Procedural animation is acceptable initially.

The stick should visibly make contact with the tyre.

The character's feet should move naturally relative to speed.

Avoid obvious clipping between the character, stick, tyre and road.

Use smooth transitions between animation states.

## 8. Camera and player controls

### Camera

Use a smooth third-person chase camera.

The camera should follow the player and tyre while keeping the road ahead visible.

Support:

- Smooth rotation.
- Adjustable camera distance.
- Camera collision avoidance.
- Slight corner-following movement.
- Stable movement over uneven terrain.

Avoid excessive shaking or motion sickness.

### Mobile and iPad controls

**Mobile-first controls are mandatory.**

The game must work in landscape mode on iPhone, Android and iPad.

Suggested controls:

Left side:
- Steering thumb control or large left/right buttons.

Right side:
- Hold-to-push acceleration button.
- Brake button.
- Optional recovery/balance button.

Support simultaneous multi-touch.

Controls must be large enough for children to use.

Do not let control interaction accidentally scroll the page.

Respect safe areas and notches.

Provide an orientation suggestion if the device is held vertically.

### Desktop controls

- WASD or arrow keys.
- Space for balance/recovery when applicable.
- Escape to pause.

Optional gamepad support can come later.

Use one input abstraction so all devices share the same gameplay simulation.

## 9. Tracks

Build four original race tracks.

Each track has a distinct environment, layout and gameplay characteristics.

### Track 1 — Barangay Dash

Difficulty: Easy.

Visual style:
- Tropical Filipino village.
- Dusty roads.
- Colourful houses.
- Nipa huts.
- Sari-sari stores.
- Coconut trees and banana trees.

Gameplay:
- Wide corners.
- Gentle curves.
- Beginner-friendly layout.
- Occasional gravel sections.

**Build this track first.**

### Track 2 — Street Sprint

Difficulty: Medium.

Visual style:
- Paved Philippine town streets.
- Road markings.
- Shops.
- Homes.
- Street decorations.

Gameplay:
- Higher-speed straights.
- Tight corners.
- Roadside obstacles.
- Strong road-tyre performance.

### Track 3 — Farm Run

Difficulty: Medium–Hard.

Visual style:
- Rice fields.
- Farms.
- Grass paths.
- Small bridges.
- Muddy sections.
- Tropical farmland.

Gameplay:
- Rough terrain.
- Variable traction.
- Uneven surfaces.
- Advantage for mountain bike tyres.

### Track 4 — Cliffside Challenge

Difficulty: Hard.

Visual style:
- Mountain roads.
- Coastal cliffs.
- Tropical hills.
- Winding paths.
- Dramatic scenic viewpoints.

Gameplay:
- Sharp turns.
- Narrow roads.
- Descents.
- Difficult tyre stability management.

Provide appropriate barriers and safe respawning.

### Track system

Develop a reusable track system supporting:

- Start/finish line.
- Starting grid.
- Track boundaries.
- Ordered checkpoints.
- Lap counting.
- Fastest lap.
- Race timing.
- Off-track detection.
- Safe respawning.
- Terrain properties.
- AI navigation paths.
- Collision objects.

Use curves or splines where appropriate.

Prevent players from skipping checkpoints to record unrealistic lap times.

## 10. AI racers

Each race should contain four competitors.

In single-player, one human races against three AI bots.

Bots must:

- Follow the track.
- Accelerate and brake.
- Steer around corners.
- Adjust speed based on terrain.
- Occasionally wobble or lose control.
- Overtake where possible.
- Avoid getting permanently stuck.
- Complete valid laps.

Provide Easy, Normal and Hard difficulty levels.

Avoid fake racers that simply teleport between positions.

Use the same basic racing physics and timing rules for human players and AI.

Bots should be visually distinguishable through different character and tyre colours.

## 11. Multiplayer architecture

Support a maximum of four racers per race.

A room has one human host and up to three additional human guests.

### Room creation

The host can:

1. Select Create Room.
2. Receive a short room code.
3. Copy a shareable invitation URL.
4. Choose the track.
5. Configure lap count.
6. View connected players.
7. Start the race.

### Room joining

Players can:

- Enter a room code or open an invitation link.
- Choose a nickname.
- Select their character and equipment.
- Mark themselves ready.

Do not require a full account registration just to play with friends.

### Automatic bots

The race grid must contain four racers.

| Human players | AI bots |
|---|---:|
| Host only | 3 |
| Host + 1 guest | 2 |
| Host + 2 guests | 1 |
| Host + 3 guests | 0 |

Allow the host to start a race with fewer than four human players.

The host controls the lobby and race settings, but should not be trusted to submit arbitrary official leaderboard results.

### Cloudflare Durable Objects

Use Durable Objects to coordinate room state and WebSocket communication, provided the selected functionality is confirmed available within Cloudflare's Free tier.

Prefer one Durable Object per active room.

Implement:

- Lobby presence.
- Room membership.
- Room capacity validation.
- Ready states.
- Race countdown.
- Player input communication.
- Race state synchronisation.
- Position interpolation.
- Reconnection handling.
- Participant disconnects.
- Race completion.

Use an authoritative game-simulation design where practical.

Do not rely on client-submitted race positions and times for trusted results.

Consider whether a full authoritative simulation can operate within the Free tier. If not, implement a clearly labelled casual prototype mode and document the security limitation.

Keep the networking layer replaceable.

### Efficiency

Minimise unnecessary network traffic.

- Use compact state messages.
- Avoid broadcasting excessive data.
- Do not write every movement update to D1.
- Clean up inactive rooms.
- Limit room lifetime.
- Rate-limit room creation and joining.
- Handle high usage gracefully.

The game should never trigger paid infrastructure provisioning automatically.

## 12. Race interface

Display a compact racing HUD containing:

- Current position.
- Current lap.
- Total laps.
- Current lap time.
- Overall race time.
- Speed.
- Stamina.
- Tyre stability.
- Track progress or minimap.

Include a countdown:

3 — 2 — 1 — GO!

Show competitors' nicknames where appropriate.

Keep the interface readable on small devices.

### Results screen

At race completion, display:

- First through fourth place.
- Racer names.
- Tyre categories.
- Total race times.
- Fastest lap times.
- Personal-best indicators.
- Race winner.

Provide:

- Race Again.
- Change Track.
- Return to Lobby.
- View Leaderboard.

## 13. Player identity and persistence

Players should be able to begin quickly.

Use a simple guest identity system.

Allow:

- Nickname selection.
- Locally saved preferences.
- Persistent guest identifier where appropriate.
- Saved customisation.
- Personal bests.
- Race history.

Clearly distinguish a local guest identity from a verified user account.

Do not assume a browser-generated identifier is secure authentication.

For backend writes, use appropriate session validation, signed credentials or another secure lightweight identity solution.

Provide a future path to optional account registration.

## 14. Database and leaderboards

Use Cloudflare D1 for persistent records.

Create tables/migrations for:

- Players.
- Player customisation.
- Tracks.
- Race rooms.
- Room participants.
- Races.
- Race participants.
- Lap times.
- Personal bests.
- Leaderboards.

Use appropriate identifiers, indexes, constraints and timestamps.

### Track leaderboards

Each track should have rankings for:

- Fastest valid lap.
- Fastest valid race.
- Personal best.

Display the player nickname, tyre type, time and date.

Separate results where required by:

- Track.
- Lap count.
- Physics/game version.
- Verification status.
- Solo versus multiplayer mode.

### Security

Never accept arbitrary client-submitted scores as verified world records.

Store unverified practice results separately.

Only trusted race validation should produce official competitive records.

Implement server-side validation and sensible anti-abuse protections.

Protect database operations against unauthorised modifications.

Never expose administrative credentials in the browser.

## 15. Game audio

Add lightweight sounds for:

- Tyre rolling.
- Stick tapping the tyre.
- Pushing.
- Acceleration.
- Wobble.
- Collisions.
- Tyre recovery.
- Countdown.
- Lap completion.
- Race finish.
- Menu interactions.

Use original or properly licensed sounds.

Background music should be upbeat, fun and appropriate for a Filipino-inspired arcade racing game.

Respect mobile browser audio restrictions.

Add separate sound-effect and music volume controls.

## 16. Performance requirements

Optimise for phones and tablets.

Targets:

- 60 FPS on capable modern hardware.
- Graceful 30 FPS fallback on slower devices.
- Efficient geometry.
- Instanced repeated objects.
- Capped pixel density.
- Minimal excessive shadows.
- Lightweight textures.
- Efficient collision detection.
- Reused materials.
- Proper resource cleanup.
- Fixed-timestep game simulation.

Provide Low, Medium and High graphics settings.

Do not sacrifice responsiveness for excessive visual effects.

Test mobile Safari and iPad Safari compatibility.

## 17. User interface and menus

Implement the following screens:

**Home**
- Kariling logo.
- Play Solo.
- Create Room.
- Join Room.
- Leaderboards.
- Settings.

**Character and Equipment Selection**
- Character preview.
- Clothing.
- Tyre type.
- Tyre colours.
- Stick type.
- Equipment statistics.

**Track Selection**
- 3D preview or attractive thumbnail.
- Track name.
- Difficulty.
- Surface characteristics.
- Personal best.

**Multiplayer Lobby**
- Room code.
- Invite link.
- Players.
- Ready states.
- Bot slots.
- Track settings.
- Start button.

**Race**
- Full-screen 3D gameplay.
- Compact HUD.
- Touch/keyboard controls.

**Results**
- Rankings.
- Timings.
- Personal records.
- Replay.

**Leaderboards**
- Select track.
- Fastest lap.
- Fastest race.
- Rankings.

Use a colourful, cohesive game UI rather than a generic web application dashboard.

## 18. Optional future features

Do not build these yet, but keep the architecture extensible:

- More tracks.
- More tyre categories.
- Cosmetic unlocks.
- Tournaments.
- Seasonal leaderboards.
- Special challenge races.
- Additional AI personalities.
- Private tournaments with friends.
- Original arcade power-ups.
- Spectator support.
- Replay system.

Do not implement advertisements, payments, subscriptions or monetisation.

## 19. Development phases

Build incrementally and verify the result after each phase.

### Phase 1 — Playable single-player game

Build:

1. Vite/TypeScript/Three.js foundation.
2. Barangay Dash 3D track.
3. Stylised Filipino runner.
4. Upright rolling tyre.
5. Wooden pushing stick.
6. Character running/pushing animation.
7. Acceleration, steering and braking.
8. Tyre wobble and balance.
9. Stamina.
10. Third-person camera.
11. Desktop and mobile controls.
12. Three AI competitors.
13. Three laps and valid checkpoints.
14. Race timer and HUD.
15. Results screen.

**Acceptance test:** I can launch the game locally, race against three bots, finish three laps and see my results.

Prioritise a polished and enjoyable core experience rather than just ticking off features.

### Phase 2 — Customisation and tracks

Add:

- Character selection.
- Clothing.
- Four tyre categories.
- Tyre colours.
- Stick choices.
- Equipment attributes.
- Three additional tracks.
- Terrain handling.
- Improved animation.
- Sound and visual polish.

### Phase 3 — Cloudflare backend

Add:

- Cloudflare configuration.
- D1 database.
- Secure guest identity.
- Player profiles.
- Saved customisation.
- Race history.
- Personal bests.
- Leaderboards.

Verify that the required resources are available on the Free tier before deploying.

### Phase 4 — Multiplayer

Add:

- Create Room.
- Join Room.
- Invite links.
- Lobby.
- Host controls.
- Ready system.
- Bot filling.
- Durable Objects multiplayer rooms.
- WebSocket synchronisation.
- Multiplayer race completion.
- Disconnect handling.

### Phase 5 — Final polish

Improve:

- Graphics.
- Animations.
- Racing physics.
- AI behaviour.
- Multiplayer stability.
- Sound.
- Performance.
- Leaderboard validation.
- Mobile usability.
- Testing.

## 20. Engineering and testing standards

Use strict TypeScript.

Organise the code into clear modules for:

- Rendering.
- Racing simulation.
- Physics.
- Character animation.
- AI.
- Tracks.
- Input.
- UI.
- Multiplayer.
- Database.

Use configuration files for gameplay attributes.

Avoid unnecessary dependencies and complicated infrastructure.

Write automated tests for:

- Tyre statistics.
- Physics calculations.
- Checkpoint validation.
- Lap timing.
- Race rankings.
- Race completion.
- Bot population.
- Room capacity.
- Host permissions.
- Invalid leaderboard submissions.

Run lint, type checking, tests and production builds.

Test actual browser gameplay where tools permit.

Do not claim something is tested if it was not tested.

## 21. Project documentation and GitHub

This is a new project.

Suggested repository name:

`kariling-game`

If GitHub access is available, create a private repository for the project. Otherwise, initialise Git locally and provide instructions for connecting it to GitHub.

Use small, logical commits.

Do not push or deploy without my instruction.

Create these documentation files:

**`docs/GAME_SPEC.md`**

Save this complete game specification. Treat it as the ongoing source of truth.

**`PROGRESS.md`**

Track:
- Completed features.
- Current development phase.
- Technical decisions.
- Test results.
- Known problems.
- Outstanding work.
- Next development steps.

**`README.md`**

Document:
- Project overview.
- Requirements.
- Installation.
- Local development commands.
- Testing.
- Build instructions.
- Future deployment.

Keep documentation updated throughout development so new Claude sessions can continue without losing context.

## 22. Important restrictions

- Do not use Supabase.
- Do not provision paid Cloudflare resources.
- Do not enable automatic billing upgrades.
- Do not hardcode secrets.
- Do not implement monetisation.
- Do not require player registration for basic play.
- Do not build all phases at once.
- Do not substitute placeholder menus for gameplay.
- Do not create a car-style racing simulation.
- Do not sacrifice mobile performance.
- Do not use copyrighted game assets.
- Do not claim that multiplayer or leaderboards are secure without validating their architecture.

## 23. Session 1 instructions (historical)

1. Inspect the local development environment and check whether a project already exists in the selected directory.
2. Save this entire specification to `docs/GAME_SPEC.md`.
3. Create `PROGRESS.md` and `README.md`.
4. Briefly establish the architecture and file structure.
5. Begin implementing **Phase 1 immediately**.
6. Build a genuinely playable Barangay Dash race.
7. Make the character, tyre and stick visually recognisable and animated.
8. Implement working steering, acceleration, tyre wobble and racing against three bots.
9. Implement three laps, checkpoint validation, timing and race results.
10. Ensure touch controls and desktop controls work.
11. Run relevant tests and a production build.
12. Fix implementation errors.
13. Update `PROGRESS.md` with the actual result.
14. Tell me how to start the local development server and test the game.

Do not stop after presenting an architecture document.

Do not spend the initial session configuring Cloudflare, databases or multiplayer.

**The immediate goal is simple: I want to open my browser and have fun racing a tyre through a colourful Filipino village against three AI opponents.**

Once Phase 1 is ready for me to test, stop before starting Phase 2.

---

# 24. Milestone 1.5 — Racing feel, collisions and street hazards (session 2, 2026-11-20)

Continue on the existing Barangay Dash track and Phase 1 codebase. Do not rebuild, change frameworks, reset progress or start future tracks. Preserve controls, camera, lap timing, checkpoints, AI, results and mobile/iPad support. New references: `docs/reference/14.webp` (cut-tyre speed-hump strip), `15.png` (stick with half-cylinder scoop, red box), `16.webp` (tyre bouncing over a dirt mound), `17.png` (askals / street dogs).

Priority order: tyre physics + three control states + collisions first, then visuals, then hazards.

## 24.1 Graphics and models
- Characters more anatomically recognisable but still colourful and stylised: better hands, feet, clothing, faces, proportions.
- Tyres with truly circular profiles, visible tread, detailed sidewalls.
- Better road surfaces, terrain transitions, grass and environment detail. Avoid lazy smooth ovals where shaped geometry looks better.
- Keep mobile/iPad performance. Polished stylised 3D, not photorealism.

## 24.2 Stick and scoop
- Max stick length: **children 70 cm, adults 100 cm**, at consistent scale. Adjust runner position/animation so the stick still reaches.
- Half-cylinder scoop/curved channel at the contact end (recycled vinegar bottle or cut pineapple tin, see ref 15).
- The scoop visibly contacts and guides the tyre, follows the contact area, doesn't constantly clip, and tyre/stick/runner stay visible from the chase camera. The runner visibly pushes. Materials should be swappable later.

## 24.3 Humps and obstacles
Types: raised cement humps; dirt mounds; logs across or partly across the road; strips of cut-open old tyres (ref 14); old motorbike tyres lying flat; fallen coconut fronds and branches; larger dirt ramps that launch the wheel.
- Distinct geometry and collision behaviour. Intentional, varied placement with room to steer around some.
- Depending on speed, angle and obstacle: bounce, launch, wobble/lean, lose scoop contact, wheel runs ahead of the runner, loss of control.
- Real airborne state with vertical motion, arcade trajectory and landing reaction (no teleporting). If the wheel separates, the runner chases to regain control. Small bumps manageable; big ramps at full speed risky.

## 24.4 Rebalanced handling
The game was too easy (max speed held all race). Improve speed-dependent steering, cornering stability, lean, wobble build-up/recovery, momentum, terrain grip, stick contact, air control and landing stability. Sharp turns at high speed must be genuinely risky, with visible warnings (growing wobble) before loss of control. No random or unavoidable failures; masterable. Flat-out everywhere must not be optimal. Keep tyre types distinct and parameters configurable.

## 24.5 Racer collisions
No ghosting. Collisions between tyres, tyres and runners, runners, sticks/scoops where meaningful, and racers vs obstacles. Consequences depend on relative speed and angle: deflection, speed loss, side-impact wobble, loss of balance, runner shoved off line. Playful, no launching, overlap, jitter or getting stuck. Simplified hitboxes are fine. AI uses the same rules.

## 24.6 Street dogs (askals/aspins)
A few stylised dogs at chosen roadside spots: idle/wander/sit/rest. Racer enters trigger → bark/warning → short, time-limited chase from behind → reset. If caught: family-friendly cartoon stun (brief speed loss/loss of control, reaction, wobble, short recovery), like being hit by an item in a kart racer. No gore, no endless chases, no repeat stuns without a recovery window, nothing unavoidable. AI affected too.

## 24.7 Potholes and mud
Potholes: visible depressions; wheel drops/bounces; speed loss; instability; possible loss of stick contact at speed. Mud: less grip, more rolling resistance, slower acceleration, splash effects, slipping when turning hard. Clearly visible so players can pick lines. Tyre types handle them differently.

## 24.8 Roadside canals
Open drainage canals beside some paved sections, built as real recessed geometry. Too close to the edge → tyre falls/tips in, runner reacts, short crash/recovery, time penalty, safe respawn at the last valid track position. Never trapped. Deliberate placement, visible edges, enough road width.

## 24.9 Speed boosts
Clearly marked boost sections: temporary extra acceleration/speed, visual + audio feedback, limited duration, higher instability when cornering boosted. Reward good lines without guaranteeing victory. Never right before unavoidable hazards.

## 24.10 Dog poo
Occasional cartoon poo (recognisable, not gross). Rolling through it dirties the tyre: less grip/speed, runner reacts, player must briefly pull aside/slow to clean (short humorous cleaning), then handling returns. A real mechanic, short penalty, no long unskippable animation. AI must handle it too.

## 24.11 Balance and track design
Not an obstacle course. Mix safe straights, challenging corners, optional risky lines/shortcuts, visible obstacles, boosts, occasional dog zones, terrain variation and careful jumps, with reaction time between hazards and difficulty building through the lap. AI must navigate and avoid hazards intelligently. Temporary invulnerability after major stun/recovery events.

## 24.12 Three tyre-control states (core feature)
A real physics/gameplay state machine with configurable thresholds and hysteresis:
1. **CONTROLLED** — upright, scoop in contact, predictable steering/acceleration, runner alongside, subtle natural movement even on straights.
2. **UNSTABLE** — from excessive cornering speed, sharp steering, bumps, collisions, rough terrain, poor landings. Visible wobble and lean, less reliable stick contact, less predictable steering, runner visibly struggling, growing wobble as a warning. Recover by slowing, straightening and restoring contact.
3. **OUT OF CONTROL** — instability past the threshold or a severe impact. Tyre loses the stick; may tumble, bounce, roll away or fall. Runner reacts and chases. No normal steering/acceleration until recovered; reasonable time penalty.
Transitions account for tyre type, speed, cornering forces, terrain, impacts, airborne motion and stick contact, with a real chance to recover from UNSTABLE. Same for humans and AI, and integrated with jumps, collisions, dogs, potholes, mud and other hazards. Provide a debug HUD (speed, instability, control state, ground contact, stick contact).

## 24.13 Engineering
Inspect before changing; reusable modules; shared collision and hazard rules for humans and AI; deterministic fixed-timestep simulation; no frame-rate dependence; simplified collision shapes. Tests for collision resolution, wobble thresholds, airborne/landing, hazard triggers, stun durations, recovery, invulnerability, and checkpoint/lap preservation after crashes. Run type checking, tests and the production build; test in the browser. Update PROGRESS.md. Stop after this milestone for playtesting, and never claim incomplete features are finished.

---

# 25. As-built summary (handover, 2026-11-21)

This section records how the brief has actually been implemented so far. Where it differs from earlier sections, earlier sections remain the *requirements*; this describes the *current game*. Full detail, config values and known issues: `docs/HANDOVER.md`.

**Status:** Phase 1 complete. Milestone 1.5 (§24) implemented and awaiting human playtesting. Phases 2–4 not started; no Cloudflare resources exist.

**Gameplay now:**
- One track, Barangay Dash (576 m, 3 laps default; 1/3/5 selectable), 1 human vs 3 bots (Easy/Normal/Hard). Player starts at the back of the grid.
- The player always races as a child with the Mountain Bike tyre and wooden stick (customisation UI is Phase 2). Bots use BMX, motorbike, road (adult) and MTB tyres, with both stick types.
- Tyre handling is a three-state machine — CONTROLLED → UNSTABLE (warning; recoverable by slowing, straightening, Balance) → OUT OF CONTROL (tyre gets away; runner chases and picks it up). Cornering tolerance falls with speed, so flat-out driving costs repeated losses of control.
- The runner is simulated alongside the tyre; the 70 cm (child) / 100 cm (adult) stick with a half-cylinder scoop only pushes and steers while in contact. Jumps, shoves and stuns break contact.
- Real airborne motion off humps, mounds, logs, potholes and a dirt ramp; landings scored by impact, lean, steering and air time.
- Collisions between tyres, runners and sticks for all racers.
- Hazards on Barangay Dash: 2 cement humps, an old-tyre speed strip, 2 dirt mounds, a log, 3 flat motorbike tyres, 2 frond piles, a dirt ramp, 5 potholes in 2 clusters, 2 mud patches, 2 boost pads, 3 dog poos, roadside canals on both sides of the concrete straight, and 3 street dogs.
- At this milestone the track had boost pads. The held-item system is specified in §26.6.
- Results, local personal bests and race history; online leaderboards and multiplayer buttons are placeholders.

**Architecture now:** Vite + strict TypeScript + three.js; deterministic render-free simulation in `src/sim` (fixed 60 Hz) driven by `src/game/raceController.ts` with interpolated rendering; data-driven configs in `src/config`; procedural geometry, textures and audio (no external assets except the Google font). Designed so `RaceSession` can later run server-side for authoritative multiplayer.

**Not yet built from earlier sections:** customisation screen (§5), tracks 2–4 (§9), Cloudflare backend, identity, D1 leaderboards (§13–14), multiplayer (§11), gamepad support, verified mobile performance (§16).

---

# 26. Milestone 1.6 — Gameplay improvements, fixes and Filipino power-ups (session 3, 2026-11-21)

Owner brief (summarised; the full text was given in the session). Work order: (1) character joints,
disconnected legs, ground contact, stick alignment; (2) boost arrows, smaller warnings; (3) obstacles,
yellow humps, dog chase duration; (4) grass physics, two-option dog poo; (5) double-tap dash, ramp
landing bonus; (6) random Filipino power-ups; (7) civilian pedestrians; (8) basketball court with
players; (9) test and rebalance; (10) update docs. Do not rebuild; keep architecture; stop for playtest.

## 26.1 Characters and ground contact
Anatomical shoulder/elbow/hip/knee/ankle joints that stay connected through every animation; elbows
and knees bend the natural way; the pushing arm follows the stick; no hand/stick/scoop/tyre clipping;
feet on the terrain (slopes, bumps, elevation) using the real ground, not hard-coded offsets; tyre on
the road; stick/scoop not through the ground; visuals aligned with the physics state; mobile-friendly.

## 26.2 HUD and boosts
Boost arrows point in the racing direction (also on curves). Warnings (instability, hazards, dogs,
boosts, recoveries) become small, translucent, edge-placed notifications with icons and short text,
fading in/out, not overlapping, never covering the road centre or the touch controls.

## 26.3 Obstacles and dogs
Flat motorbike tyres taller (collision + model). Yellow humps taller/wider and more visible, with
bounce, momentum and stability effects, never vertical walls. Dogs chase longer and further: catch
slow racers, fast ones can escape; navigate the road, not through obstacles; warning cues; no repeated
unavoidable stuns; same rules for AI.

## 26.4 Terrain and dog poo
Grass: less acceleration and top speed, more rolling resistance, different traction, instability on
uneven patches, particles, visible reaction; tyre types differ (MTB best, road worst); no free
shortcut. Poo: choose to stop at the roadside and clean (quick, full fix) or race on with a moderate
penalty and stink trail that wears off; never forced to stop; AI decides sensibly.

## 26.5 Skill boosts
Double-tap push (keyboard, phone, iPad) → short dash: more acceleration, stamina cost, instability,
less precise steering, cooldown, feedback. Ramp landing bonus only for a real ramp take-off, landing,
reconnecting the scoop within a short window and no severe crash; once per landing; effect + sound +
"Nice Catch!".

## 26.6 First power-up milestone

Parols give one held item, chosen with race-position weights. The HUD reveals the item after one
second. Pickup respawn, item reuse cooldowns, projectile lifetimes and hit protection are configurable.
Humans and bots collect, activate and take hits under the same rules. Hits can affect a racer in
CONTROLLED or UNSTABLE. OUT OF CONTROL and protected racers cannot be hit by another item.

| Item | Action |
|---|---|
| Buko Missile | Throw a whole young green coconut forward or roll it backward. It bounces and rolls across the actual track surface, exchanges speed on bumps and slopes, and slows more off-road. It travels along its launch heading until terrain deflects it. A direct tyre hit reduces speed and adds instability based on relative speed, hit angle and tyre properties. A hard hit can send the tyre out of control. Racers can change lanes to dodge. |
| Saging Peel | Drop a visible banana peel behind the runner. It stays on the track until a tyre rolls over it or it expires. Contact slows and unsettles the tyre. |
| SkyFlakes Cracker Shot | Fire a fast, short-lived straight shot ahead. A hit slows the tyre and adds a smaller wobble than a hard coconut hit. The cracker model uses no packaging or logo. |
| Turon Turbo | Briefly increase acceleration and top speed and reduce rolling resistance. Its speed and acceleration bonuses share the existing caps with dash and boost pads. |

E or the touch item button activates the held item. Buko uses E to throw forward and Q or the
touch **Back** button to roll backward. Use a whole green 3D coconut, an incoming warning for
the player, and playful sound and particles on impact. Buko is the primary straight-shot,
shell-style weapon. Reserve homing for Tirador in a later milestone.

## 26.7 Pedestrians and basketball court
Villagers (adults and children) in groups near homes/shops and crossing at selected points, aware of
racers (hesitate, stop, dodge); family-friendly contact (slow/unsettle the racer, cartoon reaction, no
injuries); never stuck; fair; controlled spawn points; mobile-friendly counts. At least one basketball
court behind a roadside fence with markings, hoops, fencing, players dribbling/passing/shooting, a
visible ball and optional bounce sounds; efficient rendering.

## 26.8 Engineering
Data-driven configs; tests for double-tap, boosts/cooldowns, landing rewards, item selection,
activation/expiry, poo expiry, terrain modifiers, pedestrian states, collision/ground-contact
invariants; typecheck, lint, tests, build; browser verification; logical commits.

## 26.9 As built
See `PROGRESS.md` (Milestone 1.6) and `docs/HANDOVER.md` for design decisions, values and known issues.
Item tuning and display names live in `src/config/items.ts`.
