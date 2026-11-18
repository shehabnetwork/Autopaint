import { seededRandom } from './util';

/**
 * Local stand-in image used when ComfyUI is offline (or demo mode is on).
 * It is not AI: it frames your painting with a coloured wash so the UI stays usable and every
 * result is clearly labelled "Demo" in the result panel.
 */
export function renderDemo(source: HTMLCanvasElement, seed: number): string {
  const size = source.width;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D canvas context.');

  const rand = seededRandom(seed);
  const hue = Math.floor(rand() * 360);

  const wash = ctx.createLinearGradient(0, 0, size, size);
  wash.addColorStop(0, `hsl(${hue} 55% 20%)`);
  wash.addColorStop(0.5, `hsl(${(hue + 30) % 360} 45% 30%)`);
  wash.addColorStop(1, `hsl(${(hue + 60) % 360} 40% 14%)`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  // The painting itself, lifted off the white background with a soft shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = size * 0.03;
  ctx.drawImage(source, size * 0.04, size * 0.04, size * 0.92, size * 0.92);
  ctx.restore();

  // Warm light from the top-left so it reads as a render, not a paste.
  const glow = ctx.createRadialGradient(size * 0.2, size * 0.1, 0, size * 0.2, size * 0.1, size);
  glow.addColorStop(0, `hsl(${(hue + 40) % 360} 90% 70% / 0.25)`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.78);
  vignette.addColorStop(0, 'transparent');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.9);
}
