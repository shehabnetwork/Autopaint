import type { Layer, PixelBounds } from '../types';
import { CANVAS_SIZE } from '../types';

/**
 * Layer pixels live outside React and outside the store: a 1024×1024 canvas per layer.
 * The store only holds the layer list (id, name, visibility, opacity), so undo snapshots
 * stay explicit and the UI does not re-render on every brush dab.
 */
const canvases = new Map<string, HTMLCanvasElement>();

export function createLayerCanvas(size = CANVAS_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function getLayerCanvas(id: string): HTMLCanvasElement {
  let canvas = canvases.get(id);
  if (!canvas) {
    canvas = createLayerCanvas();
    canvases.set(id, canvas);
  }
  return canvas;
}

export function setLayerCanvas(id: string, canvas: HTMLCanvasElement): void {
  canvases.set(id, canvas);
}

export function disposeLayerCanvas(id: string): void {
  canvases.delete(id);
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createLayerCanvas(source.width);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(source, 0, 0);
  return canvas;
}

/** Flatten visible layers, in order, into one canvas. Used for export and autosave. */
export function compositeLayers(layers: Layer[], size = CANVAS_SIZE): HTMLCanvasElement {
  const out = createLayerCanvas(size);
  const ctx = out.getContext('2d');
  if (!ctx) return out;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  for (const layer of layers) {
    if (!layer.visible) continue;
    const canvas = canvases.get(layer.id);
    if (!canvas) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    ctx.drawImage(canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  return out;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): string {
  return canvas.toDataURL(type, quality);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the canvas as PNG.'));
    }, 'image/png');
  });
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load an image.'));
    image.src = src;
  });
}

/** Copy a data URL into a fresh layer canvas. */
export async function canvasFromDataUrl(src: string, size = CANVAS_SIZE): Promise<HTMLCanvasElement> {
  const image = await loadImageElement(src);
  const canvas = createLayerCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(image, 0, 0, size, size);
  return canvas;
}

export function clearRect(canvas: HTMLCanvasElement, rect: PixelBounds): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
}

/** Lift a rectangle out of a layer into its own cropped canvas, clearing the source. */
export function cutRegion(canvas: HTMLCanvasElement, rect: PixelBounds): HTMLCanvasElement {
  const cut = document.createElement('canvas');
  cut.width = Math.max(1, Math.round(rect.width));
  cut.height = Math.max(1, Math.round(rect.height));
  const ctx = cut.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      canvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
  }

  const source = canvas.getContext('2d');
  if (source) source.clearRect(rect.x, rect.y, rect.width, rect.height);
  return cut;
}

/**
 * Make the flat background of an image transparent, the way a magic wand on the border would:
 * pick the most common colour along the edges, then clear every border-connected pixel that is
 * within `tolerance` of it. Interior whites (a shirt, a cloud) survive because the flood cannot
 * reach them without crossing the subject.
 */
export function cutBackground(source: HTMLCanvasElement, tolerance = 32): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;

  const outCtx = out.getContext('2d');
  if (!outCtx) return source;
  outCtx.drawImage(source, 0, 0);

  const image = outCtx.getImageData(0, 0, width, height);
  const data = image.data;

  // Dominant colour along the four edges, quantised so near-identical whites group together.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = buckets.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };

  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    sample(0, y);
    sample(width - 1, y);
  }

  let seed = { r: 255, g: 255, b: 255 };
  let best = 0;
  for (const entry of buckets.values()) {
    if (entry.count > best) {
      best = entry.count;
      seed = { r: entry.r, g: entry.g, b: entry.b };
    }
  }

  const toleranceSq = tolerance * tolerance * 3;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const matches = (index: number): boolean => {
    const i = index * 4;
    if (data[i + 3] === 0) return true;
    const dr = data[i] - seed.r;
    const dg = data[i + 1] - seed.g;
    const db = data[i + 2] - seed.b;
    return dr * dr + dg * dg + db * db <= toleranceSq;
  };

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (matches(index)) {
      data[index * 4 + 3] = 0;
      queue.push(index);
    }
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.pop() as number;
    const x = index % width;
    const y = (index - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  outCtx.putImageData(image, 0, 0);
  return out;
}
