import { STICKS } from '../config/sticks';
import { TYRES, type TyreId } from '../config/tyres';
import { formatTime } from '../core/math';
import type { RaceResultRow } from '../game/raceController';
import type { Difficulty } from '../sim/ai';
import type { RaceHistoryEntry, Settings, TrackRecord } from '../storage/local';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const LOGO = `
  <div class="logo">
    <svg class="logo-tyre" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="38" fill="none" stroke="#2b2b2e" stroke-width="14"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#ff9800" stroke-width="4" stroke-dasharray="10 9"/>
      <line x1="8" y1="96" x2="38" y2="78" stroke="#c8a06a" stroke-width="6" stroke-linecap="round"/>
    </svg>
    <h1>KARILING</h1>
    <p>Tyre &amp; Stick Racing</p>
  </div>`;

export function homeScreen(nickname: string): string {
  return `
  <div class="screen home">
    ${LOGO}
    <div class="menu">
      <button class="btn big yellow" data-action="solo">▶ Play Solo</button>
      <div class="row">
        <button class="btn blue" data-action="soon" disabled title="Multiplayer arrives in Phase 4">Create Room <em>soon</em></button>
        <button class="btn blue" data-action="soon" disabled title="Multiplayer arrives in Phase 4">Join Room <em>soon</em></button>
      </div>
      <div class="row">
        <button class="btn green" data-action="records">🏆 Records</button>
        <button class="btn green" data-action="settings">⚙ Settings</button>
      </div>
    </div>
    <div class="guest">Playing as <b>${esc(nickname)}</b> · local guest profile</div>
  </div>`;
}

const TRACKS = [
  { id: 'barangay-dash', name: 'Barangay Dash', diff: 'Easy', surf: 'Dusty road · concrete · gravel', locked: false, hue: 30 },
  { id: 'street-sprint', name: 'Street Sprint', diff: 'Medium', surf: 'Paved town streets', locked: true, hue: 210 },
  { id: 'farm-run', name: 'Farm Run', diff: 'Medium–Hard', surf: 'Grass · mud · bridges', locked: true, hue: 100 },
  { id: 'cliffside', name: 'Cliffside Challenge', diff: 'Hard', surf: 'Narrow mountain road', locked: true, hue: 190 },
];

function statBars(id: TyreId): string {
  const r = TYRES[id].ratings;
  const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${v * 10}%"></i></div></div>`;
  return bar('Speed', r.speed) + bar('Accel', r.acceleration) + bar('Stability', r.stability) + bar('Cornering', r.cornering);
}

export function setupScreen(o: { nickname: string; difficulty: Difficulty; laps: number; record: TrackRecord; tyreId: TyreId; stickId: keyof typeof STICKS }): string {
  const seg = (name: string, value: string | number, options: [string | number, string][]) =>
    `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-value="${v}">${l}</button>`).join('')}</div>`;
  return `
  <div class="screen setup">
    <div class="panel">
      <h2>Play Solo</h2>
      <label class="field">Nickname <input id="nick" maxlength="16" value="${esc(o.nickname)}" autocomplete="off" spellcheck="false"/></label>
      <div class="field">Opponents ${seg('difficulty', o.difficulty, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}</div>
      <div class="field">Laps ${seg('laps', o.laps, [[1, '1'], [3, '3'], [5, '5']])}</div>
      <h3>Track</h3>
      <div class="tracks">
        ${TRACKS.map((t) => `
          <div class="track-card ${t.locked ? 'locked' : 'on'}" style="--h:${t.hue}">
            <div class="thumb"><span>${t.locked ? '🔒' : '🏘️'}</span></div>
            <b>${t.name}</b><small>${t.diff} · ${t.surf}</small>
            ${t.locked ? '<em>Phase 2</em>' : `<small class="pb">PB ${formatTime(o.record.bestRace)} · Lap ${formatTime(o.record.bestLap)}</small>`}
          </div>`).join('')}
      </div>
      <h3>Your kariling</h3>
      <div class="loadout">
        <div><b>${TYRES[o.tyreId].name} tyre</b> + <b>${STICKS[o.stickId].name}</b><small>Full character &amp; tyre customisation arrives in Phase 2.</small></div>
        <div class="stats">${statBars(o.tyreId)}</div>
      </div>
      <div class="actions">
        <button class="btn" data-action="home">◀ Back</button>
        <button class="btn big yellow" data-action="start">Race! ▶</button>
      </div>
    </div>
  </div>`;
}

export function resultsScreen(rows: RaceResultRow[], pb: { newBestRace: boolean; newBestLap: boolean }): string {
  const player = rows.find((r) => r.isPlayer)!;
  const title = player.position === 1 ? 'PANALO! You won!' : player.position === 2 ? 'So close — 2nd!' : player.position === 3 ? '3rd place — nice run!' : 'Better luck next time!';
  return `
  <div class="screen results">
    <div class="panel">
      <h2>${title}</h2>
      <table class="standings">
        <thead><tr><th></th><th>Racer</th><th>Tyre</th><th>Time</th><th>Best lap</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${r.isPlayer ? 'me' : ''} p${r.position}">
              <td class="place">${r.position}</td>
              <td>${esc(r.name)}${r.isPlayer ? ' <span class="you">YOU</span>' : ''}</td>
              <td>${TYRES[r.tyreId as TyreId]?.name ?? r.tyreId}</td>
              <td>${r.dnf ? 'DNF' : formatTime(r.time)}${r.isPlayer && pb.newBestRace ? ' <span class="pbtag">PB!</span>' : ''}</td>
              <td>${formatTime(r.bestLap)}${r.isPlayer && pb.newBestLap ? ' <span class="pbtag">PB!</span>' : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="actions">
        <button class="btn big yellow" data-action="again">↻ Race Again</button>
        <button class="btn blue" data-action="solo">Change Track</button>
        <button class="btn green" data-action="records">🏆 Records</button>
        <button class="btn" data-action="home">Home</button>
      </div>
      <p class="note">Results are saved on this device only. Online leaderboards (server-verified) arrive in Phase 3.</p>
    </div>
  </div>`;
}

export function pauseScreen(): string {
  return `
  <div class="screen pause">
    <div class="panel narrow">
      <h2>Paused</h2>
      <button class="btn big yellow" data-action="resume">▶ Resume</button>
      <button class="btn" data-action="respawn">Reset to track</button>
      <button class="btn" data-action="restart">↻ Restart race</button>
      <button class="btn green" data-action="settings">⚙ Settings</button>
      <button class="btn red" data-action="quit">Quit to menu</button>
    </div>
  </div>`;
}

export function settingsScreen(s: Settings): string {
  const seg = (name: string, value: string, options: [string, string][]) =>
    `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-value="${v}">${l}</button>`).join('')}</div>`;
  return `
  <div class="screen settings">
    <div class="panel narrow">
      <h2>Settings</h2>
      <div class="field">Graphics ${seg('quality', s.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div>
      <div class="field">Camera ${seg('camera', s.camera, [['near', 'Near'], ['normal', 'Normal'], ['far', 'Far']])}</div>
      <div class="field">Touch controls ${seg('touchControls', s.touchControls, [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']])}</div>
      <div class="field">Auto-push ${seg('autoPush', String(s.autoPush), [['false', 'Off'], ['true', 'On']])}</div>
      <div class="field">Debug HUD ${seg('debugHud', String(s.debugHud), [['false', 'Off'], ['true', 'On']])}</div>
      <label class="field">Sound effects <input type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" data-range="sfxVolume"/></label>
      <label class="field">Music <input type="range" min="0" max="1" step="0.05" value="${s.musicVolume}" data-range="musicVolume"/></label>
      <p class="note">Auto-push keeps the runner pushing so younger players only need to steer. Debug HUD (or F3) shows tyre speed, instability, control state, ground and stick contact.</p>
      <button class="btn big yellow" data-action="back">Done</button>
    </div>
  </div>`;
}

export function recordsScreen(rec: TrackRecord, laps: number, history: RaceHistoryEntry[]): string {
  return `
  <div class="screen records">
    <div class="panel">
      <h2>Records</h2>
      <h3>Barangay Dash · ${laps} laps · this device</h3>
      <div class="pbs">
        <div><span>Fastest race</span><b>${formatTime(rec.bestRace)}</b><small>${rec.bestRaceTyre ? TYRES[rec.bestRaceTyre as TyreId]?.name ?? '' : ''}</small></div>
        <div><span>Fastest lap</span><b>${formatTime(rec.bestLap)}</b><small>${rec.bestLapTyre ? TYRES[rec.bestLapTyre as TyreId]?.name ?? '' : ''}</small></div>
      </div>
      <h3>Recent races</h3>
      ${history.length === 0 ? '<p class="note">No races yet — go race!</p>' : `
      <table class="standings small">
        <thead><tr><th>Date</th><th>Place</th><th>Laps</th><th>Opponents</th><th>Time</th><th>Best lap</th></tr></thead>
        <tbody>${history.slice(0, 10).map((h) => `
          <tr><td>${new Date(h.date).toLocaleDateString()}</td><td>${h.position}</td><td>${h.laps}</td><td>${h.difficulty}</td><td>${formatTime(h.time)}</td><td>${formatTime(h.bestLap)}</td></tr>`).join('')}
        </tbody>
      </table>`}
      <p class="note">Online, server-verified leaderboards arrive in Phase 3. Local records can't be submitted as world records.</p>
      <div class="actions"><button class="btn big yellow" data-action="back">◀ Back</button></div>
    </div>
  </div>`;
}

export function loadingScreen(text: string): string {
  return `<div class="screen loading">${LOGO}<div class="loading-msg">${esc(text)}</div></div>`;
}
