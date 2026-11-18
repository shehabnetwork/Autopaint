import { describe, expect, it } from 'vitest';
import { readOptions } from './client';

const payload = {
  CheckpointLoaderSimple: {
    input: {
      required: {
        ckpt_name: [['juggernaut.safetensors', 'sd_xl_base_1.0.safetensors'], { tooltip: 'models/checkpoints' }],
      },
    },
  },
};

describe('readOptions', () => {
  it('reads a required dropdown list', () => {
    expect(readOptions(payload, 'CheckpointLoaderSimple', 'ckpt_name')).toEqual([
      'juggernaut.safetensors',
      'sd_xl_base_1.0.safetensors',
    ]);
  });

  it('returns an empty list for an unknown node', () => {
    expect(readOptions(payload, 'Nope', 'ckpt_name')).toEqual([]);
  });

  it('returns an empty list when the field is missing', () => {
    expect(readOptions(payload, 'CheckpointLoaderSimple', 'control_net_name')).toEqual([]);
  });

  it('accepts optional inputs and ignores non-string entries', () => {
    const withOptional = {
      LoraLoader: { input: { optional: { lora_name: [[42, 'lora.safetensors'], {}] } } },
    } as unknown;
    expect(readOptions(withOptional, 'LoraLoader', 'lora_name')).toEqual(['lora.safetensors']);
  });

  it('survives a malformed payload', () => {
    expect(readOptions(null, 'CheckpointLoaderSimple', 'ckpt_name')).toEqual([]);
    expect(readOptions({ CheckpointLoaderSimple: {} }, 'CheckpointLoaderSimple', 'ckpt_name')).toEqual([]);
  });
});
