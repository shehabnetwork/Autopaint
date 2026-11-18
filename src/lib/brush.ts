import type { BrushId, BrushTip } from '../types';

export interface BrushPreset {
  id: BrushId;
  name: string;
  /** Default width in canvas pixels. */
  size: number;
  /** Default stroke opacity. */
  opacity: number;
  /** 0 = hard edge, 1 = very soft. */
  softness: number;
  /** Default end caps. */
  tip: BrushTip;
}

export const BRUSHES: BrushPreset[] = [
  { id: 'ink', name: 'Ink', size: 8, opacity: 1, softness: 0, tip: 'round' },
  { id: 'pencil', name: 'Pencil', size: 4, opacity: 0.7, softness: 0, tip: 'round' },
  { id: 'marker', name: 'Marker', size: 22, opacity: 0.5, softness: 0, tip: 'flat' },
  { id: 'soft', name: 'Airbrush', size: 60, opacity: 0.3, softness: 1, tip: 'round' },
];

export function getBrush(id: BrushId): BrushPreset {
  return BRUSHES.find((brush) => brush.id === id) ?? BRUSHES[0];
}

export function brushSoftness(id: BrushId | undefined): number {
  return id ? getBrush(id).softness : 0;
}
