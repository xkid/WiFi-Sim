import { MaterialType } from './types';

// dB loss per wall type (approximate)
export const MATERIAL_ATTENUATION: Record<MaterialType, number> = {
  [MaterialType.CONCRETE]: 12,
  [MaterialType.BRICK]: 8,
  [MaterialType.DRYWALL]: 3,
  [MaterialType.GLASS]: 2,
  [MaterialType.METAL]: 20,
};

export const MOXA_PRODUCTS = [
  { id: 'AWK-1137C', name: 'Moxa AWK-1137C', txPower: 20, frequency: 5 },
  { id: 'AWK-3131A', name: 'Moxa AWK-3131A', txPower: 23, frequency: 2.4 },
  { id: 'AWK-4131A', name: 'Moxa AWK-4131A Outdoor', txPower: 26, frequency: 5 },
  { id: 'GENERIC-AP', name: 'Generic Router', txPower: 18, frequency: 2.4 },
];

export const COLORS = {
  primary: '#3b82f6', // blue-500
  accent: '#10b981', // emerald-500
  danger: '#ef4444', // red-500
  grid: '#334155', // slate-700
};
