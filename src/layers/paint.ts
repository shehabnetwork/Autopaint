import type { BrushTip, PixelBounds } from '../types';

export interface PaintStyle {
  color: string;
  /** Painted size in canvas pixels at full pressure. */
  size: number;
  /** 0–1, applied once when the stroke is committed. */
  opacity: number;
  /** 0 = hard edge, 1 = very soft. */
  softness: number;
  tip: BrushTip;
  erase?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function strokeWidth(style: PaintStyle, pressure: number): number {
  const p = clamp(pressure, 0.05, 1);
  return Math.max(1, style.size * (0.25 + 0.75 * p));
}

function applySoftness(ctx: CanvasRenderingContext2D, style: PaintStyle): void {
  ctx.filter = style.softness > 0 ? `blur(${Math.max(1, style.size * 0.25 * style.softness)}px)` : 'none';
}

/** A single dab, used for the first point of a stroke and for taps. */
export function paintDot(ctx: CanvasRenderingContext2D, x: number, y: number, diameter: number, style: PaintStyle): void {
  const radius = diameter / 2;
  ctx.save();
  applySoftness(ctx, style);
  ctx.fillStyle = style.color;
  ctx.beginPath();

  if (style.tip === 'flat') {
    // A square dab rotated to 45° reads as a chisel mark.
    const s = radius * 0.92;
    ctx.rect(x - s, y - s, s * 2, s * 2);
  } else {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }

  ctx.fill();
  ctx.restore();
}

/** One segment of a stroke, drawn at full alpha; the stroke is composited once on release. */
export function paintSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  widthFrom: number,
  widthTo: number,
  style: PaintStyle,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return;

  const nx = -dy / length;
  const ny = dx / length;
  const halfFrom = widthFrom / 2;
  const halfTo = widthTo / 2;

  ctx.save();
  applySoftness(ctx, style);
  ctx.fillStyle = style.color;

  ctx.beginPath();
  ctx.moveTo(from.x + nx * halfFrom, from.y + ny * halfFrom);
  ctx.lineTo(to.x + nx * halfTo, to.y + ny * halfTo);
  ctx.lineTo(to.x - nx * halfTo, to.y - ny * halfTo);
  ctx.lineTo(from.x - nx * halfFrom, from.y - ny * halfFrom);
  ctx.closePath();
  ctx.fill();

  if (style.tip === 'round') {
    ctx.beginPath();
    ctx.arc(to.x, to.y, halfTo, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Alpha-composite the scratch stroke onto the layer, or erase where it was drawn. */
export function commitStroke(
  scratch: HTMLCanvasElement,
  target: CanvasRenderingContext2D,
  style: PaintStyle,
): void {
  target.save();
  target.globalAlpha = clamp(style.opacity, 0, 1);
  target.globalCompositeOperation = style.erase ? 'destination-out' : 'source-over';
  target.drawImage(scratch, 0, 0);
  target.restore();
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: PaintStyle,
): void {
  ctx.save();
  applySoftness(ctx, style);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = Math.max(1, style.size);
  ctx.lineCap = style.tip === 'round' ? 'round' : 'butt';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

export function drawRect(
  ctx: CanvasRenderingContext2D,
  bounds: PixelBounds,
  style: PaintStyle,
  filled: boolean,
): void {
  ctx.save();
  applySoftness(ctx, style);
  if (filled) {
    ctx.fillStyle = style.color;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1, style.size);
    ctx.lineJoin = 'round';
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.restore();
}

export function drawEllipse(
  ctx: CanvasRenderingContext2D,
  bounds: PixelBounds,
  style: PaintStyle,
  filled: boolean,
): void {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const cx = bounds.x + rx;
  const cy = bounds.y + ry;
  ctx.save();
  applySoftness(ctx, style);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = style.color;
    ctx.fill();
  } else {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1, style.size);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Flood fill from a seed pixel. Builds a mask of similar pixels, then paints the colour
 * through it so partially transparent edges keep their shape.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  seedX: number,
  seedY: number,
  size: number,
  style: PaintStyle,
  tolerance = 32,
  bounds?: PixelBounds,
): boolean {
  const x = Math.floor(seedX);
  const y = Math.floor(seedY);
  if (x < 0 || y < 0 || x >= size || y >= size) return false;

  // Limit the flood to the selection so it cannot leak out of a masked area.
  const minX = bounds ? Math.max(0, Math.floor(bounds.x)) : 0;
  const minY = bounds ? Math.max(0, Math.floor(bounds.y)) : 0;
  const maxX = bounds ? Math.min(size - 1, Math.ceil(bounds.x + bounds.width)) : size - 1;
  const maxY = bounds ? Math.min(size - 1, Math.ceil(bounds.y + bounds.height)) : size - 1;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;

  const source = ctx.getImageData(0, 0, size, size);
  const data = source.data;
  const start = (y * size + x) * 4;
  const targetR = data[start];
  const targetG = data[start + 1];
  const targetB = data[start + 2];
  const targetA = data[start + 3];

  const toleranceSq = tolerance * tolerance * 3;
  const visited = new Uint8Array(size * size);
  const mask = ctx.createImageData(size, size);
  const maskData = mask.data;
  const stack: number[] = [y * size + x];
  let painted = 0;

  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (visited[index]) continue;
    visited[index] = 1;

    const px = index * 4;
    const dr = data[px] - targetR;
    const dg = data[px + 1] - targetG;
    const db = data[px + 2] - targetB;
    const da = data[px + 3] - targetA;
    if (dr * dr + dg * dg + db * db + da * da > toleranceSq) continue;

    maskData[px] = 255;
    maskData[px + 1] = 255;
    maskData[px + 2] = 255;
    maskData[px + 3] = 255;
    painted += 1;

    const column = index % size;
    const row = (index - column) / size;
    if (column > minX) stack.push(index - 1);
    if (column < maxX) stack.push(index + 1);
    if (row > minY) stack.push(index - size);
    if (row < maxY) stack.push(index + size);
  }

  if (painted === 0) return false;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = size;
  maskCanvas.height = size;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return false;
  maskCtx.putImageData(mask, 0, 0);
  maskCtx.globalCompositeOperation = 'source-in';
  maskCtx.fillStyle = style.color;
  maskCtx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.globalAlpha = clamp(style.opacity, 0, 1);
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
  return true;
}
