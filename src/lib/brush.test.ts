import { describe, expect, it } from 'vitest';
import { BRUSHES, brushSoftness, getBrush } from './brush';

describe('brush presets', () => {
  it('exposes four presets', () => {
    expect(BRUSHES).toHaveLength(4);
  });

  it('gives the marker a flat tip and the ink a round one', () => {
    expect(getBrush('marker').tip).toBe('flat');
    expect(getBrush('ink').tip).toBe('round');
    expect(getBrush('soft').softness).toBe(1);
  });

  it('falls back to the first brush for an unknown id', () => {
    // @ts-expect-error deliberately invalid id
    expect(getBrush('nope').id).toBe('ink');
    expect(brushSoftness(undefined)).toBe(0);
  });
});
