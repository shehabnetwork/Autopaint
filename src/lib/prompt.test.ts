import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('combines the user text with the preset style', () => {
    const { prompt, negative } = buildPrompt('a red barn in a green field', 'photo');
    expect(prompt).toContain('a red barn in a green field');
    expect(prompt).toContain('photorealistic');
    expect(negative).toContain('watermark');
  });

  it('falls back to the preset base sentence for empty text', () => {
    expect(buildPrompt('   ', 'photo').prompt).toContain('landscape');
  });

  it('lets the user override the negative prompt', () => {
    expect(buildPrompt('x', 'photo', 'my own negative').negative).toBe('my own negative');
  });

  it('does not add a style for the none preset', () => {
    expect(buildPrompt('a cat', 'none').prompt).toBe('a cat');
  });
});
