export interface Preset {
  id: string;
  name: string;
  /** Style words appended to every prompt. */
  style: string;
  /** Default negative prompt; the user can override it in Settings. */
  negative: string;
  /** Used when the canvas is empty and there is no text. */
  base: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'photo',
    name: 'Photo',
    style: 'photorealistic photo, 35mm lens, natural light, sharp focus, detailed',
    negative:
      'illustration, cartoon, painting, drawing, sketch, low quality, blurry, watermark, text, logo, deformed',
    base: 'a beautiful landscape at golden hour',
  },
  {
    id: 'anime',
    name: 'Anime',
    // Tag style: this is what Illustrious / NoobAI / Pony-style models are trained on.
    style: 'masterpiece, best quality, anime illustration, clean lineart, vibrant colors, detailed background',
    negative:
      'worst quality, bad quality, lowres, bad anatomy, bad hands, extra digits, jpeg artifacts, signature, watermark, text, photo, 3d render',
    base: 'a scenic anime landscape',
  },
  {
    id: '3d',
    name: '3D render',
    style: '3d render, soft studio lighting, octane render, clay and plastic materials, depth of field',
    negative: 'flat, 2d, sketch, photo, low quality, blurry, watermark, text',
    base: 'a small isometric diorama scene',
  },
  {
    id: 'pencil',
    name: 'Pencil',
    style: 'detailed graphite pencil drawing, cross hatching, paper texture, monochrome',
    negative: 'color, photo, 3d render, blurry, low quality, watermark, text',
    base: 'a detailed pencil study',
  },
  {
    id: 'oil',
    name: 'Oil painting',
    style: 'oil painting, expressive brushstrokes, rich colours, canvas texture, classical composition',
    negative: 'photo, 3d render, low quality, blurry, watermark, text',
    base: 'a classical landscape painting',
  },
  {
    id: 'arch',
    name: 'Architecture',
    style: 'architectural visualization, clean geometry, soft daylight, wide angle, minimal materials',
    negative: 'people, text, watermark, low quality, blurry, cluttered',
    base: 'a modern minimal building',
  },
  {
    id: 'none',
    name: 'None',
    style: '',
    negative: 'low quality, blurry, watermark, text',
    base: 'a simple scene',
  },
];

export const DEFAULT_PRESET_ID = 'photo';

export function getPreset(id: string): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
