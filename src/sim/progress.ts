import { wrapDelta } from '../core/math';

/** Lap/checkpoint state for one racer. Pure data so it can be validated server-side later. */
export interface LapProgress {
  /** Crossed the start line at least once (grid starts behind it). */
  started: boolean;
  /** Index of the next checkpoint gate to cross. Gate 0 is the start/finish line. */
  nextCp: number;
  lapsCompleted: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number | null;
  finished: boolean;
  finishTime: number | null;
  /** Integrated distance travelled along the track (can go negative before the start line). */
  raceDistance: number;
  /** Arc length position last tick. */
  lastS: number;
}

export function createProgress(startS: number, trackLength: number): LapProgress {
  return {
    started: false, nextCp: 0, lapsCompleted: 0, lapStartTime: 0, lapTimes: [], bestLap: null,
    finished: false, finishTime: null, raceDistance: startS - trackLength, lastS: startS,
  };
}

/** True if moving forward by `ds` from `prev` crosses gate `g` on a loop of length `len`. */
export function crossesGate(prev: number, ds: number, g: number, len: number): boolean {
  if (ds <= 0) return false;
  let rel = (g - prev) % len;
  if (rel < 0) rel += len;
  return rel > 0 && rel <= ds;
}

export interface ProgressUpdate {
  checkpoint: boolean;
  lapCompleted: boolean;
  finished: boolean;
  /** Movement was rejected as an impossible jump (no credit given). */
  rejected: boolean;
}

/**
 * Advance lap progress from the racer's previous to new track position.
 * - Checkpoints must be crossed in order; skipped gates block lap completion.
 * - Jumps larger than `maxStep` (teleports / shortcuts across the infield) earn no distance or gates.
 */
export function advanceProgress(
  p: LapProgress, newS: number, len: number, checkpoints: readonly number[], time: number,
  totalLaps: number, maxStep: number, onTrack = true,
): ProgressUpdate {
  const out: ProgressUpdate = { checkpoint: false, lapCompleted: false, finished: false, rejected: false };
  const ds = wrapDelta(newS - p.lastS, len);
  if (Math.abs(ds) > maxStep) {
    out.rejected = true;
    p.lastS = newS;
    return out;
  }
  const prev = p.lastS;
  p.lastS = newS;
  if (p.finished) return out;
  p.raceDistance += ds;
  if (!onTrack) return out;
  const g = checkpoints[p.nextCp];
  if (!crossesGate(prev, ds, g, len)) return out;
  out.checkpoint = true;
  if (p.nextCp === 0) {
    if (!p.started) {
      p.started = true;
      p.raceDistance = 0;
    } else {
      const lap = time - p.lapStartTime;
      p.lapTimes.push(lap);
      p.bestLap = p.bestLap == null ? lap : Math.min(p.bestLap, lap);
      p.lapStartTime = time;
      p.lapsCompleted++;
      p.raceDistance = p.lapsCompleted * len;
      out.lapCompleted = true;
      if (p.lapsCompleted >= totalLaps) {
        p.finished = true;
        p.finishTime = time;
        out.finished = true;
      }
    }
  }
  p.nextCp = (p.nextCp + 1) % checkpoints.length;
  return out;
}

/**
 * Distance used for ranking. Clamped so a racer can never rank beyond the next gate they
 * haven't validly crossed.
 */
export function rankingDistance(p: LapProgress, len: number, checkpoints: readonly number[]): number {
  if (!p.started) return Math.min(p.raceDistance, 0);
  const gate = p.nextCp === 0 ? len : checkpoints[p.nextCp];
  const cap = p.lapsCompleted * len + gate + 1;
  return Math.min(p.raceDistance, cap);
}

export interface Rankable {
  progress: LapProgress;
  order: number; // grid order tiebreak
}

export function compareRacers(a: Rankable, b: Rankable, len: number, cps: readonly number[]): number {
  const af = a.progress.finished, bf = b.progress.finished;
  if (af && bf) return (a.progress.finishTime ?? 0) - (b.progress.finishTime ?? 0);
  if (af) return -1;
  if (bf) return 1;
  const d = rankingDistance(b.progress, len, cps) - rankingDistance(a.progress, len, cps);
  if (Math.abs(d) > 1e-6) return d;
  return a.order - b.order;
}
