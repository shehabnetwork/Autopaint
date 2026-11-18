import { CANVAS_SIZE } from '../types';
import { createLayerCanvas, cutBackground, loadImageElement } from './registry';

/**
 * Draw an image into a layer at the canvas origin, scaled to fill the canvas while keeping its
 * aspect ratio. A generation made at 1024×1024 lands exactly 1:1 at (0,0), which is what makes
 * "To canvas" and img2img round-trips line up.
 *
 * With `cutWhite` the flat background is knocked out first, so the picture sits over the layers
 * below instead of covering them with a white square.
 */
export async function imageLayer(
  src: string,
  options: { cutWhite?: boolean; tolerance?: number } = {},
): Promise<HTMLCanvasElement> {
  const image = await loadImageElement(src);

  const source = document.createElement('canvas');
  source.width = image.naturalWidth || CANVAS_SIZE;
  source.height = image.naturalHeight || CANVAS_SIZE;
  source.getContext('2d')?.drawImage(image, 0, 0);

  const picture = options.cutWhite ? cutBackground(source, options.tolerance ?? 32) : source;

  const scale = Math.min(CANVAS_SIZE / picture.width, CANVAS_SIZE / picture.height);
  const width = Math.min(CANVAS_SIZE, picture.width * scale);
  const height = Math.min(CANVAS_SIZE, picture.height * scale);

  const canvas = createLayerCanvas(CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(picture, 0, 0, width, height);
  return canvas;
}
