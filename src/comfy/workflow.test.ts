import { describe, expect, it } from 'vitest';
import type { GenSettings } from '../types';
import { buildWorkflow } from './workflow';

function settings(patch: Partial<GenSettings> = {}): GenSettings {
  return {
    mode: 'controlnet',
    scope: 'all',
    denoise: 0.65,
    presetId: 'photo',
    negative: '',
    steps: 8,
    cfg: 1.5,
    seed: 1,
    lockSeed: true,
    controlStrength: 0.7,
    controlEnd: 0.8,
    width: 1024,
    height: 1024,
    quality: 'fast',
    comfyUrl: '/comfy',
    checkpoint: 'sd_xl_base_1.0.safetensors',
    controlNet: 'controlnet-scribble-sdxl-1.0.safetensors',
    lora: 'sdxl_lightning_8step_lora.safetensors',
    useLora: true,
    loraStrength: 1,
    sampler: 'dpmpp_sde',
    scheduler: 'sgm_uniform',
    demoMode: false,
    ...patch,
  };
}

const request = {
  prompt: 'a large circle in the top left',
  negative: 'blurry',
  imageName: 'sketch-1.png',
  seed: 4242,
};

describe('buildWorkflow', () => {
  it('wires the sampler through the ControlNet apply node', () => {
    const workflow = buildWorkflow({ ...request, settings: settings() });
    expect(workflow['9'].class_type).toBe('KSampler');
    expect(workflow['9'].inputs.positive).toEqual(['7', 0]);
    expect(workflow['9'].inputs.negative).toEqual(['7', 1]);
    expect(workflow['7'].class_type).toBe('ControlNetApplyAdvanced');
    expect(workflow['7'].inputs.image).toEqual(['5', 0]);
  });

  it('passes the prompt, seed and sketch name through', () => {
    const workflow = buildWorkflow({ ...request, settings: settings() });
    expect(workflow['3'].inputs.text).toBe(request.prompt);
    expect(workflow['4'].inputs.text).toBe(request.negative);
    expect(workflow['5'].inputs.image).toBe('sketch-1.png');
    expect(workflow['9'].inputs.seed).toBe(4242);
  });

  it('adds a LoRA node and hangs the encoders off it', () => {
    const workflow = buildWorkflow({ ...request, settings: settings() });
    expect(workflow['2'].class_type).toBe('LoraLoader');
    expect(workflow['9'].inputs.model).toEqual(['2', 0]);
    expect(workflow['3'].inputs.clip).toEqual(['2', 1]);
  });

  it('drops the LoRA node when it is disabled', () => {
    const workflow = buildWorkflow({ ...request, settings: settings({ useLora: false }) });
    expect(workflow['2']).toBeUndefined();
    expect(workflow['9'].inputs.model).toEqual(['1', 0]);
    expect(workflow['3'].inputs.clip).toEqual(['1', 1]);
  });

  it('passes the LoRA strength through, clamped', () => {
    const half = buildWorkflow({ ...request, settings: settings({ loraStrength: 0.6 }) });
    expect(half['2'].inputs).toMatchObject({ strength_model: 0.6, strength_clip: 0.6 });

    const tooMuch = buildWorkflow({ ...request, settings: settings({ loraStrength: 9 }) });
    expect(tooMuch['2'].inputs).toMatchObject({ strength_model: 2 });
  });

  it('honours size and ControlNet settings', () => {
    const workflow = buildWorkflow({
      ...request,
      settings: settings({ width: 768, height: 832, controlStrength: 0.9, controlEnd: 0.6 }),
    });
    expect(workflow['8'].inputs).toMatchObject({ width: 768, height: 832 });
    expect(workflow['7'].inputs).toMatchObject({ strength: 0.9, end_percent: 0.6 });
  });

  it('clamps values ComfyUI would reject', () => {
    const workflow = buildWorkflow({
      ...request,
      settings: settings({ steps: 43883, cfg: -3, width: 5000, height: 100 }),
    });
    expect(workflow['9'].inputs.steps).toBe(60);
    expect(workflow['9'].inputs.cfg).toBe(0);
    expect(workflow['8'].inputs).toMatchObject({ width: 2048, height: 256 });
  });
});

describe('img2img mode', () => {
  it('encodes the canvas and skips ControlNet', () => {
    const workflow = buildWorkflow({
      ...request,
      settings: settings({ mode: 'img2img', denoise: 0.5 }),
    });
    expect(workflow['12'].class_type).toBe('VAEEncode');
    expect(workflow['12'].inputs.pixels).toEqual(['5', 0]);
    expect(workflow['9'].inputs.latent_image).toEqual(['12', 0]);
    expect(workflow['9'].inputs.denoise).toBe(0.5);
    expect(workflow['9'].inputs.positive).toEqual(['3', 0]);
    expect(workflow['6']).toBeUndefined();
    expect(workflow['7']).toBeUndefined();
    expect(workflow['8']).toBeUndefined();
  });

  it('clamps denoise into a usable range', () => {
    const workflow = buildWorkflow({
      ...request,
      settings: settings({ mode: 'img2img', denoise: 0 }),
    });
    expect(workflow['9'].inputs.denoise).toBe(0.05);
  });
});
