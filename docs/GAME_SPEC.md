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
