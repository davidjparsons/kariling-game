import type { Difficulty } from '../sim/ai';
import type { CameraDistance } from '../render/camera';
import type { Quality } from '../render/quality';
import { defaultQuality } from '../render/quality';

/**
 * Local guest profile and preferences. This is NOT authentication: the guest id is a
 * convenience identifier stored in this browser only. Server-verified identity comes in Phase 3.
 */
export interface GuestProfile {
  guestId: string;
  nickname: string;
  createdAt: number;
}

export interface Settings {
  quality: Quality;
  camera: CameraDistance;
  sfxVolume: number;
  musicVolume: number;
  autoPush: boolean;
  touchControls: 'auto' | 'on' | 'off';
  difficulty: Difficulty;
  laps: number;
  /** Show the physics debug panel (speed, instability, control state, contact...). */
  debugHud: boolean;
}

export interface TrackRecord {
  bestRace: number | null;
  bestLap: number | null;
  bestRaceTyre?: string;
  bestLapTyre?: string;
  bestRaceDate?: number;
  bestLapDate?: number;
}

export interface RaceHistoryEntry {
  date: number;
  trackId: string;
  laps: number;
  difficulty: Difficulty;
  position: number;
  time: number | null;
  bestLap: number | null;
  tyreId: string;
}

const KEY = 'kariling.v1';

interface Stored {
  profile?: GuestProfile;
  settings?: Partial<Settings>;
  records?: Record<string, TrackRecord>;
  history?: RaceHistoryEntry[];
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(data: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  camera: 'normal',
  sfxVolume: 0.8,
  musicVolume: 0.5,
  autoPush: false,
  touchControls: 'auto',
  difficulty: 'normal',
  laps: 3,
  debugHud: false,
};

export function sanitizeNickname(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N} _.\-ñÑ']/gu, '').trim().slice(0, 16);
  return clean || 'Player';
}

export class LocalStore {
  private data: Stored = read();

  get profile(): GuestProfile {
    if (!this.data.profile) {
      this.data.profile = { guestId: uuid(), nickname: 'Player', createdAt: Date.now() };
      write(this.data);
    }
    return this.data.profile;
  }

  setNickname(name: string): void {
    this.profile.nickname = sanitizeNickname(name);
    write(this.data);
  }

  get settings(): Settings {
    return { ...DEFAULT_SETTINGS, quality: defaultQuality(), ...this.data.settings };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch };
    write(this.data);
    return this.settings;
  }

  recordKey(trackId: string, laps: number): string {
    return `${trackId}:${laps}`;
  }

  record(trackId: string, laps: number): TrackRecord {
    return this.data.records?.[this.recordKey(trackId, laps)] ?? { bestRace: null, bestLap: null };
  }

  /** Save a finished race; returns which personal bests were beaten. */
  submitResult(entry: RaceHistoryEntry): { newBestRace: boolean; newBestLap: boolean } {
    const key = this.recordKey(entry.trackId, entry.laps);
    const rec = { ...this.record(entry.trackId, entry.laps) };
    let newBestRace = false, newBestLap = false;
    if (entry.time != null && (rec.bestRace == null || entry.time < rec.bestRace)) {
      rec.bestRace = entry.time; rec.bestRaceTyre = entry.tyreId; rec.bestRaceDate = entry.date; newBestRace = true;
    }
    if (entry.bestLap != null && (rec.bestLap == null || entry.bestLap < rec.bestLap)) {
      rec.bestLap = entry.bestLap; rec.bestLapTyre = entry.tyreId; rec.bestLapDate = entry.date; newBestLap = true;
    }
    this.data.records = { ...this.data.records, [key]: rec };
    this.data.history = [entry, ...(this.data.history ?? [])].slice(0, 30);
    write(this.data);
    return { newBestRace, newBestLap };
  }

  get history(): RaceHistoryEntry[] {
    return this.data.history ?? [];
  }
}
