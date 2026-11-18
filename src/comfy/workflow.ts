import type { GenSettings } from '../types';

/** A node in a ComfyUI API-format workflow. */
export interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

export interface WorkflowRequest {
  prompt: string;
  negative: string;
  imageName: string;
  seed: number;
  settings: GenSettings;
}

/**
 * Two graphs behind one builder.
 *
 * controlnet (default): SDXL + ControlNet Scribble, empty latent, denoise 1.
 *   1 checkpoint · 2 lora (optional) · 3 positive · 4 negative · 5 load image
 *   6 controlnet loader · 7 controlnet apply · 8 empty latent · 9 sampler
 *   10 vae decode · 11 save
 *
 * img2img: the canvas itself is the starting image.
 *   5 load image → 12 vae encode → 9 sampler (denoise from settings) · no ControlNet
 */
export function buildWorkflow({ prompt, negative, imageName, seed, settings }: WorkflowRequest): ComfyWorkflow {
  const useLora = settings.useLora && settings.lora.trim().length > 0;
  const mode = settings.mode ?? 'controlnet';

  // Guard against a corrupted project file or an out-of-range value typed by hand:
  // ComfyUI rejects the whole prompt if a sampler value is outside its limits.
  const steps = Math.min(60, Math.max(1, Math.round(settings.steps) || 8));
  const cfg = Math.min(20, Math.max(0, Number.isFinite(settings.cfg) ? settings.cfg : 1.5));
  const width = Math.round(Math.min(2048, Math.max(256, settings.width)) / 64) * 64;
  const height = Math.round(Math.min(2048, Math.max(256, settings.height)) / 64) * 64;
  const loraStrength = Math.min(2, Math.max(0, Number(settings.loraStrength ?? 1) || 0));
  const rawDenoise = Number(settings.denoise);
  const denoise = Math.min(1, Math.max(0.05, Number.isFinite(rawDenoise) ? rawDenoise : 0.65));

  // With a LoRA the sampler and both text encoders hang off node 2, otherwise off node 1.
  const model: [string, number] = useLora ? ['2', 0] : ['1', 0];
  const clip: [string, number] = useLora ? ['2', 1] : ['1', 1];

  const workflow: ComfyWorkflow = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: settings.checkpoint },
      _meta: { title: 'Checkpoint' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip },
      _meta: { title: 'Positive prompt' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip },
      _meta: { title: 'Negative prompt' },
    },
    '5': {
      class_type: 'LoadImage',
      inputs: { image: imageName },
      _meta: { title: mode === 'img2img' ? 'Canvas (init image)' : 'Sketch' },
    },
    '9': {
      class_type: 'KSampler',
      inputs: {
        model,
        positive: mode === 'img2img' ? ['3', 0] : ['7', 0],
        negative: mode === 'img2img' ? ['4', 0] : ['7', 1],
        latent_image: mode === 'img2img' ? ['12', 0] : ['8', 0],
        seed,
        steps,
        cfg,
        sampler_name: settings.sampler,
        scheduler: settings.scheduler,
        denoise: mode === 'img2img' ? denoise : 1,
      },
      _meta: { title: 'Sampler' },
    },
    '10': {
      class_type: 'VAEDecode',
      inputs: { samples: ['9', 0], vae: ['1', 2] },
      _meta: { title: 'Decode' },
    },
    '11': {
      class_type: 'SaveImage',
      inputs: { images: ['10', 0], filename_prefix: 'sketch2img' },
      _meta: { title: 'Save' },
    },
  };

  if (mode === 'img2img') {
    workflow['12'] = {
      class_type: 'VAEEncode',
      inputs: { pixels: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'Encode canvas' },
    };
  } else {
    workflow['6'] = {
      class_type: 'ControlNetLoader',
      inputs: { control_net_name: settings.controlNet },
      _meta: { title: 'ControlNet' },
    };
    workflow['7'] = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: {
        positive: ['3', 0],
        negative: ['4', 0],
        control_net: ['6', 0],
        image: ['5', 0],
        strength: settings.controlStrength,
        start_percent: 0,
        end_percent: settings.controlEnd,
      },
      _meta: { title: 'Apply ControlNet' },
    };
    workflow['8'] = {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
      _meta: { title: 'Latent' },
    };
  }

  if (useLora) {
    workflow['2'] = {
      class_type: 'LoraLoader',
      inputs: {
        model: ['1', 0],
        clip: ['1', 1],
        lora_name: settings.lora,
        strength_model: loraStrength,
        strength_clip: loraStrength,
      },
      _meta: { title: 'LoRA' },
    };
  }

  return workflow;
}
