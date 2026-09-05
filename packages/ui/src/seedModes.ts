export type SeedModeId = 'legacy' | 'torch_cpu' | 'scale_alike' | 'nvidia_gpu';

export interface SeedModeOption {
  id: SeedModeId;
  label: string;
}

export const SEED_MODES: SeedModeOption[] = [
  { id: 'legacy', label: 'Legacy' },
  { id: 'scale_alike', label: 'Scale Alike' },
  { id: 'torch_cpu', label: 'Torch CPU' },
  { id: 'nvidia_gpu', label: 'Nvidia GPU' },
];

export const DEFAULT_SEED_MODE_ID: SeedModeId = 'legacy';

export const SEED_MODE_TO_INT: Record<SeedModeId, number> = {
  legacy: 0,
  torch_cpu: 1,
  scale_alike: 2,
  nvidia_gpu: 3,
};

export const INT_TO_SEED_MODE: Record<number, SeedModeId> = {
  0: 'legacy',
  1: 'torch_cpu',
  2: 'scale_alike',
  3: 'nvidia_gpu',
};

export function seedModeToInt(id: SeedModeId | undefined): number {
  return id ? SEED_MODE_TO_INT[id] : 0;
}

export function intToSeedMode(value: number | undefined): SeedModeId {
  if (value === undefined) return DEFAULT_SEED_MODE_ID;
  return INT_TO_SEED_MODE[value] ?? DEFAULT_SEED_MODE_ID;
}