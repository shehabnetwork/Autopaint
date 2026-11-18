import { PRESETS } from '../lib/presets';
import { useStore } from '../store/useStore';
import type { GenScope } from '../types';
import { Icon } from './Icon';

export function PromptPanel() {
  const promptText = useStore((state) => state.promptText);
  const setPromptText = useStore((state) => state.setPromptText);
  const settings = useStore((state) => state.settings);
  const setPreset = useStore((state) => state.setPreset);
  const setMode = useStore((state) => state.setMode);
  const patchSettings = useStore((state) => state.patchSettings);
  const generate = useStore((state) => state.generate);
  const generating = useStore((state) => state.generating);
  const progress = useStore((state) => state.progress);
  const statusText = useStore((state) => state.statusText);
  const genError = useStore((state) => state.genError);
  const clearError = useStore((state) => state.clearError);
  const connection = useStore((state) => state.connection);
  const layers = useStore((state) => state.layers);
  const selectedLayerIds = useStore((state) => state.selectedLayerIds);

  const isDemo = settings.demoMode || connection.status === 'offline';
  const canGenerate = !generating;
  const percent = progress ? Math.round((progress.value / Math.max(1, progress.max)) * 100) : null;
  const feeding = layers.filter((layer) => selectedLayerIds.includes(layer.id) && layer.visible).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Prompt</h2>
        <select
          className="select"
          value={settings.presetId}
          onChange={(event) => setPreset(event.target.value)}
          aria-label="Style preset"
        >
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className="prompt-input"
        value={promptText}
        onChange={(event) => setPromptText(event.target.value)}
        placeholder="Describe the picture. Example: a red barn in a green field, golden hour"
        rows={3}
        spellCheck={false}
      />

      <div className="field">
        <span className="field-label">Input</span>
        <div className="segmented">
          <button
            type="button"
            className={settings.mode === 'controlnet' ? 'segment active' : 'segment'}
            onClick={() => setMode('controlnet')}
            title="The painting is used as a ControlNet sketch: it fixes the layout, the model paints it"
          >
            Layout (ControlNet)
          </button>
          <button
            type="button"
            className={settings.mode === 'img2img' ? 'segment active' : 'segment'}
            onClick={() => setMode('img2img')}
            title="The whole canvas is the starting image, repainted with the denoise amount"
          >
            Image (img2img)
          </button>
        </div>
      </div>

      {settings.mode === 'img2img' ? (
        <label className="field">
          <span className="field-label">
            Denoise <span className="muted">{settings.denoise.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.2}
            max={0.95}
            step={0.05}
            value={settings.denoise}
            aria-label="Denoise"
            onChange={(event) => patchSettings({ denoise: Number(event.target.value) })}
          />
          <span className="muted small">
            Low keeps the canvas close, high lets the model repaint more of it.
          </span>
        </label>
      ) : null}

      <div className="field">
        <span className="field-label">Layers used for generation</span>
        <select
          className="select select-block"
          value={settings.scope}
          aria-label="Layer scope"
          onChange={(event) => patchSettings({ scope: event.target.value as GenScope })}
        >
          <option value="all">All visible layers</option>
          <option value="selected">Selected layers only</option>
        </select>
      </div>

      {settings.scope === 'selected' && feeding !== layers.length ? (
        <p className="muted small">
          Generating from {feeding} of {layers.length} layers.
        </p>
      ) : null}

      <button type="button" className="btn btn-primary generate" disabled={!canGenerate} onClick={() => void generate()}>
        <Icon name="bolt" />
        {generating ? 'Generating…' : isDemo ? 'Generate demo image' : 'Generate'}
      </button>

      {generating ? (
        <div className="progress" role="progressbar" aria-valuenow={percent ?? undefined}>
          <div
            className={percent === null ? 'bar indeterminate' : 'bar'}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      ) : null}

      {statusText ? <p className="status">{statusText}</p> : null}

      {genError ? (
        <div className="alert">
          <span>{genError}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}

      {isDemo ? (
        <p className="hint">
          ComfyUI is not reachable, so Generate produces a local demo render. Start ComfyUI and click the
          badge above to switch to real generation.
        </p>
      ) : null}
    </section>
  );
}
