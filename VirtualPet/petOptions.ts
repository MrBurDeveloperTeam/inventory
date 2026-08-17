export type PetId = 'mallow' | 'silverbelt' | 'fastrat' | 'gulu' | 'munchkin' | 'mochi';

export interface PetOption {
  id: PetId;
  label: string;
  spriteSheetUrl: string;
  mouthPosition: {
    left: string;
    top: string;
  };
  idleFrames: number;
  idleDuration: string;
  sleepInFrames: number[];
  sleepHoldFrame: number;
  hoverRow: number;
  hoverFrames: number;
  hoverDuration: string;
  clickRow: number;
  clickFrames: number;
  clickDuration: string;
}

export const PET_OPTIONS: PetOption[] = [
  {
    id: 'mallow',
    label: 'Mallow',
    spriteSheetUrl: '/images/mallow-spritesheet.webp',
    mouthPosition: { left: '46%', top: '46.5%' },
    idleFrames: 6,
    idleDuration: '1.1s',
    sleepInFrames: [1, 2, 3, 4],
    sleepHoldFrame: 4,
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  {
    id: 'silverbelt',
    label: 'Silverbelt',
    spriteSheetUrl: '/images/silverbelt-spritesheet.webp',
    mouthPosition: { left: '45.5%', top: '51%' },
    idleFrames: 6,
    idleDuration: '1.1s',
    sleepInFrames: [1, 2, 3, 4],
    sleepHoldFrame: 4,
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  {
    id: 'fastrat',
    label: 'Fast Rat',
    spriteSheetUrl: '/images/fastrat-spritesheet.webp',
    mouthPosition: { left: '44%', top: '48%' },
    idleFrames: 2,
    idleDuration: '1.1s',
    sleepInFrames: [1, 2, 3],
    sleepHoldFrame: 3,
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  {
    id: 'gulu',
    label: 'Gulu',
    spriteSheetUrl: '/images/gulu-spritesheet.webp',
    mouthPosition: { left: '56%', top: '44%' },
    idleFrames: 4,
    idleDuration: '1.1s',
    sleepInFrames: [1, 2, 3, 4],
    sleepHoldFrame: 4,
    hoverRow: 8,
    hoverFrames: 6,
    hoverDuration: '1.0s',
    clickRow: 8,
    clickFrames: 6,
    clickDuration: '1.0s',
  },
  {
    id: 'munchkin',
    label: 'Munchkin',
    spriteSheetUrl: '/images/munchkinspritesheet.webp',
    mouthPosition: { left: '64.5%', top: '53.5%' },
    idleFrames: 6,
    idleDuration: '1.1s',
    sleepInFrames: [0, 1, 2, 3, 7],
    sleepHoldFrame: 7,
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  {
    id: 'mochi',
    label: 'Mochi',
    spriteSheetUrl: '/images/mochi-spritesheet.webp',
    mouthPosition: { left: '42%', top: '48.5%' },
    idleFrames: 6,
    idleDuration: '1.1s',
    sleepInFrames: [0, 1, 3, 4],
    sleepHoldFrame: 4,
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
];

export const DEFAULT_PET_ID: PetId = 'mallow';

export const normalizePetId = (value?: string | null): PetId => {
  return PET_OPTIONS.some((pet) => pet.id === value) ? (value as PetId) : DEFAULT_PET_ID;
};

export const getPetOption = (value?: string | null): PetOption => {
  return PET_OPTIONS.find((pet) => pet.id === normalizePetId(value)) || PET_OPTIONS[0];
};
