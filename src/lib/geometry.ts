import type { PixelBounds } from '../types';
import { CANVAS_SIZE } from '../types';

export interface Point {
  x: number;
  y: number;
}

export function rotatePoint(point: Point, pivot: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/** Axis-aligned box around a rotated rectangle. */
export function rotatedBounds(center: Point, width: number, height: number, degrees: number): PixelBounds {
  const corners: Point[] = [
    { x: center.x - width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y + height / 2 },
    { x: center.x - width / 2, y: center.y + height / 2 },
  ].map((corner) => rotatePoint(corner, center, degrees));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Normalise a drag rectangle so width and height are positive. */
export function rectFromPoints(a: Point, b: Point): PixelBounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function clampToCanvas(rect: PixelBounds, size = CANVAS_SIZE): PixelBounds {
  const x = Math.max(0, Math.min(size, rect.x));
  const y = Math.max(0, Math.min(size, rect.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(size - x, rect.width)),
    height: Math.max(0, Math.min(size - y, rect.height)),
  };
}

export function isInside(bounds: PixelBounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function isMeaningfulRect(rect: PixelBounds): boolean {
  return rect.width > 3 && rect.height > 3;
}
