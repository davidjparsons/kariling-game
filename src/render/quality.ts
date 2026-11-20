export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  grass: number;
  antialias: boolean;
  /** Multiplier on scattered vegetation density. */
  foliage: number;
  terrainSegments: number;
  dust: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { pixelRatio: 1, shadows: false, shadowMapSize: 512, grass: 1200, antialias: false, foliage: 0.55, terrainSegments: 90, dust: 120 },
  medium: { pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, grass: 3500, antialias: true, foliage: 0.8, terrainSegments: 130, dust: 220 },
  high: { pixelRatio: 2, shadows: true, shadowMapSize: 2048, grass: 8000, antialias: true, foliage: 1, terrainSegments: 170, dust: 320 },
};

export function defaultQuality(): Quality {
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 500;
  if (touch && small) return 'medium';
  return touch ? 'medium' : 'high';
}
