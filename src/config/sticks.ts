export type StickId = 'wood' | 'bottle';

export interface StickConfig {
  id: StickId;
  name: string;
  description: string;
  /** Multiplier on push acceleration. */
  pushPower: number;
  /** Multiplier on steering yaw rate. */
  steerAssist: number;
  /** Multiplier on instability gain (lower = steadier). */
  stabilityMul: number;
  /** Multiplier on stamina drain. */
  staminaCost: number;
  /** Multiplier on stick tap rhythm. */
  pushRate: number;
  length: number;
}

export const STICKS: Record<StickId, StickConfig> = {
  wood: {
    id: 'wood',
    name: 'Wooden Stick',
    description: 'Light and quick. Easy on the legs.',
    pushPower: 1.0, steerAssist: 1.0, stabilityMul: 1.0, staminaCost: 0.92, pushRate: 1.1,
    length: 0.95,
  },
  bottle: {
    id: 'bottle',
    name: 'Bottle Stick',
    description: 'A recycled bottle cup grips the tyre for steadier steering. A bit heavier.',
    pushPower: 1.02, steerAssist: 1.05, stabilityMul: 0.88, staminaCost: 1.08, pushRate: 0.95,
    length: 1.0,
  },
};
