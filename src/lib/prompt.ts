import { getPreset } from './presets';

export interface BuiltPrompt {
  prompt: string;
  negative: string;
}

/**
 * The canvas is pixels now, so there is nothing to describe: the prompt is what you typed,
 * plus the style words of the chosen preset.
 */
export function buildPrompt(userText: string, presetId: string, negativeOverride = ''): BuiltPrompt {
  const preset = getPreset(presetId);
  const text = userText.trim();
  const parts = [text || preset.base];
  if (preset.style) parts.push(preset.style);
  const negative = negativeOverride.trim() || preset.negative;
  return { prompt: parts.join(', '), negative };
}
