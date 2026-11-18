import { describe, expect, it } from 'vitest';
import {
  clampToCanvas,
  isInside,
  isMeaningfulRect,
  rectFromPoints,
  rotatePoint,
  rotatedBounds,
} from './geometry';

describe('rectFromPoints', () => {
  it('normalises a drag that goes up and to the left', () => {
    expect(rectFromPoints({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 70,
    });
  });
});

describe('clampToCanvas', () => {
  it('keeps the rectangle inside the canvas', () => {
    expect(clampToCanvas({ x: -10, y: 1000, width: 200, height: 100 })).toEqual({
      x: 0,
      y: 1000,
      width: 200,
      height: 24,
    });
  });

  it('never returns negative sizes', () => {
    const rect = clampToCanvas({ x: 1100, y: 1100, width: 50, height: 50 });
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});

describe('isInside', () => {
  const box = { x: 10, y: 10, width: 100, height: 50 };

  it('accepts points on and inside the edges', () => {
    expect(isInside(box, { x: 10, y: 10 })).toBe(true);
    expect(isInside(box, { x: 60, y: 35 })).toBe(true);
    expect(isInside(box, { x: 110, y: 60 })).toBe(true);
  });

  it('rejects points outside', () => {
    expect(isInside(box, { x: 5, y: 35 })).toBe(false);
    expect(isInside(box, { x: 60, y: 70 })).toBe(false);
  });
});

describe('isMeaningfulRect', () => {
  it('ignores accidental clicks', () => {
    expect(isMeaningfulRect({ x: 0, y: 0, width: 2, height: 40 })).toBe(false);
    expect(isMeaningfulRect({ x: 0, y: 0, width: 20, height: 20 })).toBe(true);
  });
});

describe('rotatePoint', () => {
  it('turns 90° clockwise on screen coordinates', () => {
    const point = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(10);
  });

  it('leaves the pivot alone', () => {
    const pivot = { x: 40, y: 60 };
    const point = rotatePoint(pivot, pivot, 37);
    expect(point.x).toBeCloseTo(40);
    expect(point.y).toBeCloseTo(60);
  });

  it('undoes itself with the opposite angle', () => {
    const origin = { x: 5, y: 9 };
    const pivot = { x: 100, y: 50 };
    const there = rotatePoint(origin, pivot, 72);
    const back = rotatePoint(there, pivot, -72);
    expect(back.x).toBeCloseTo(origin.x);
    expect(back.y).toBeCloseTo(origin.y);
  });
});

describe('rotatedBounds', () => {
  it('swaps width and height at 90°', () => {
    const bounds = rotatedBounds({ x: 100, y: 100 }, 200, 100, 90);
    expect(bounds.width).toBeCloseTo(100);
    expect(bounds.height).toBeCloseTo(200);
    expect(bounds.x).toBeCloseTo(50);
    expect(bounds.y).toBeCloseTo(0);
  });

  it('grows the box by √2 at 45°', () => {
    const bounds = rotatedBounds({ x: 0, y: 0 }, 100, 100, 45);
    expect(bounds.width).toBeCloseTo(100 * Math.SQRT2);
    expect(bounds.height).toBeCloseTo(100 * Math.SQRT2);
  });

  it('is unchanged at 0°', () => {
    const bounds = rotatedBounds({ x: 100, y: 100 }, 40, 20, 0);
    expect(bounds).toMatchObject({ x: 80, y: 90, width: 40, height: 20 });
  });
});
