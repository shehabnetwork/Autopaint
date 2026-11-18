export const CANVAS_SIZE = 1024;

/** Drawing tools. Everything paints pixels into the active layer. */
export type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'bucket' | 'move';

/** Brush presets. Size and opacity are copied into the stroke so every stroke keeps its look. */
export type BrushId = 'ink' | 'pencil' | 'marker' | 'soft';

/** Stroke end caps: round gives a pen/brush look, flat gives a chisel/marker look. */
export type BrushTip = 'round' | 'flat';

/** How the canvas reaches ComfyUI. */
export type GenMode = 'controlnet' | 'img2img';

/** Which layers feed generation: everything visible, or only the selected ones. */
export type GenScope = 'all' | 'selected';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** 0–1, applied when the layers are composited. */
  opacity: number;
}

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QualityMode = 'fast' | 'quality';

export interface GenSettings {
  mode: GenMode;
  scope: GenScope;
  /** Only used in img2img mode: how far to move away from the canvas image. */
  denoise: number;
  presetId: string;
  negative: string;
  steps: number;
  cfg: number;
  seed: number;
  lockSeed: boolean;
  controlStrength: number;
  controlEnd: number;
  width: number;
  height: number;
  quality: QualityMode;
  comfyUrl: string;
  checkpoint: string;
  controlNet: string;
  lora: string;
  useLora: boolean;
  loraStrength: number;
  sampler: string;
  scheduler: string;
  demoMode: boolean;
}

export interface GenerationResult {
  id: string;
  imageUrl: string;
  prompt: string;
  negative: string;
  seed: number;
  createdAt: number;
  source: 'comfy' | 'demo';
  canvasDataUrl: string;
  promptId?: string;
  settings: GenSettings;
}

export interface ProjectLayer extends Layer {
  /** PNG data URL of the layer pixels. */
  png: string;
}

export interface Project {
  version: 2;
  name: string;
  layers: ProjectLayer[];
  activeLayerId: string;
  settings: GenSettings;
  savedAt: number;
}

export interface ConnectionState {
  status: 'unknown' | 'checking' | 'online' | 'offline';
  version?: string;
  error?: string;
  checkedAt?: number;
}

export interface ModelLists {
  checkpoints: string[];
  controlnets: string[];
  loras: string[];
}
