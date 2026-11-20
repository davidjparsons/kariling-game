import type { StickId } from './sticks';
import type { TyreId } from './tyres';

/** Cosmetic only — no appearance choice affects racing performance. */
export interface CharacterAppearance {
  age: 'child' | 'adult';
  gender: 'boy' | 'girl';
  hair: 'short' | 'spiky' | 'curly' | 'bob' | 'ponytail' | 'cap';
  skin: number;
  hairColor: number;
  shirt: 'tee' | 'tank' | 'jersey';
  shirtColor: number;
  bottoms: 'shorts' | 'trousers';
  bottomsColor: number;
  footwear: 'sandals' | 'barefoot' | 'sneakers';
  footwearColor: number;
}

export interface TyreLook {
  /** Painted sidewall colour (null = plain rubber). */
  stripe: number | null;
  pattern: 'plain' | 'stripes' | 'spots' | 'zigzag';
  accent: number;
}

export interface RacerLoadout {
  appearance: CharacterAppearance;
  tyreId: TyreId;
  tyreLook: TyreLook;
  stickId: StickId;
}

export const SKIN_TONES = [0xf1c9a5, 0xd9a47a, 0xc68a5e, 0xa86e45, 0x8a5634, 0x6b3f24];

export const DEFAULT_PLAYER: RacerLoadout = {
  appearance: {
    age: 'child', gender: 'boy', hair: 'short', skin: 0xc68a5e, hairColor: 0x1c1410,
    shirt: 'tee', shirtColor: 0x29b6f6, bottoms: 'shorts', bottomsColor: 0x37474f,
    footwear: 'sandals', footwearColor: 0x1e88e5,
  },
  tyreId: 'mtb',
  tyreLook: { stripe: 0xff9800, pattern: 'stripes', accent: 0xffffff },
  stickId: 'wood',
};

/** Bot roster — distinct looks, tyres and names so they're easy to tell apart. */
export const BOT_ROSTER: { name: string; loadout: RacerLoadout }[] = [
  {
    name: 'Inday',
    loadout: {
      appearance: {
        age: 'child', gender: 'girl', hair: 'ponytail', skin: 0xd9a47a, hairColor: 0x2a1a10,
        shirt: 'tee', shirtColor: 0xff5c8a, bottoms: 'shorts', bottomsColor: 0xffffff,
        footwear: 'sandals', footwearColor: 0xff4081,
      },
      tyreId: 'bmx', tyreLook: { stripe: 0xffffff, pattern: 'stripes', accent: 0xe53935 }, stickId: 'bottle',
    },
  },
  {
    name: 'Totoy',
    loadout: {
      appearance: {
        age: 'child', gender: 'boy', hair: 'curly', skin: 0x8a5634, hairColor: 0x120c08,
        shirt: 'tank', shirtColor: 0xffeb3b, bottoms: 'shorts', bottomsColor: 0x1565c0,
        footwear: 'barefoot', footwearColor: 0x000000,
      },
      tyreId: 'moto', tyreLook: { stripe: 0xfdd835, pattern: 'spots', accent: 0x111111 }, stickId: 'wood',
    },
  },
  {
    name: 'Ate Joy',
    loadout: {
      appearance: {
        age: 'adult', gender: 'girl', hair: 'bob', skin: 0xf1c9a5, hairColor: 0x3b2314,
        shirt: 'jersey', shirtColor: 0x43a047, bottoms: 'trousers', bottomsColor: 0x263238,
        footwear: 'sneakers', footwearColor: 0xffffff,
      },
      tyreId: 'road', tyreLook: { stripe: 0x00e676, pattern: 'zigzag', accent: 0x1b5e20 }, stickId: 'wood',
    },
  },
  {
    name: 'Dodong',
    loadout: {
      appearance: {
        age: 'child', gender: 'boy', hair: 'cap', skin: 0xa86e45, hairColor: 0x1c1410,
        shirt: 'tee', shirtColor: 0xff7043, bottoms: 'shorts', bottomsColor: 0x795548,
        footwear: 'sandals', footwearColor: 0x43a047,
      },
      tyreId: 'mtb', tyreLook: { stripe: 0x7c4dff, pattern: 'stripes', accent: 0xffffff }, stickId: 'bottle',
    },
  },
];
