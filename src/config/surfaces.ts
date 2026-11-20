export type SurfaceId = 'paved' | 'dirt' | 'gravel' | 'grass' | 'mud';

export interface SurfaceConfig {
  id: SurfaceId;
  name: string;
  /** Multiplier on the tyre's lateral grip limit. */
  grip: number;
  /** Constant rolling resistance deceleration (m/s²). */
  rollingResistance: number;
  /** Multiplier on top speed. */
  speedMul: number;
  /** Multiplier on push acceleration. */
  accelMul: number;
  /** 0..1 — how much the surface shakes the tyre at speed. */
  roughness: number;
  /** 0..1 — dust particle emission. */
  dust: number;
  /** Dust tint. */
  dustColor: number;
}

export const SURFACES: Record<SurfaceId, SurfaceConfig> = {
  paved: {
    id: 'paved', name: 'Concrete', grip: 1.0, rollingResistance: 0.22, speedMul: 1.0,
    accelMul: 1.0, roughness: 0.0, dust: 0.08, dustColor: 0xd8d2c4,
  },
  dirt: {
    id: 'dirt', name: 'Dusty road', grip: 0.9, rollingResistance: 0.42, speedMul: 0.97,
    accelMul: 0.95, roughness: 0.15, dust: 0.85, dustColor: 0xc99a6a,
  },
  gravel: {
    id: 'gravel', name: 'Gravel', grip: 0.74, rollingResistance: 0.68, speedMul: 0.92,
    accelMul: 0.86, roughness: 0.6, dust: 0.6, dustColor: 0xb7ab98,
  },
  grass: {
    id: 'grass', name: 'Grass', grip: 0.8, rollingResistance: 1.5, speedMul: 0.74,
    accelMul: 0.75, roughness: 0.3, dust: 0.12, dustColor: 0x8fbf4f,
  },
  mud: {
    id: 'mud', name: 'Mud', grip: 0.55, rollingResistance: 1.8, speedMul: 0.66,
    accelMul: 0.6, roughness: 0.65, dust: 0.3, dustColor: 0x6b4a2b,
  },
};
