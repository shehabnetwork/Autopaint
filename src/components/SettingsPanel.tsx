import { DEFAULT_SETTINGS, useStore } from '../store/useStore';
import { PRESETS } from '../lib/presets';
import { randomSeed } from '../lib/util';

interface ModelFieldProps {
  label: string;
  value: string;
  options: string[];
  hint?: string;
  onChange: (value: string) => void;
}

/** A dropdown when ComfyUI told us what is installed, a free-text input otherwise. */
function ModelField({ label, value, options, hint, onChange }: ModelFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {options.length > 0 ? (
        <select className="select select-block" value={value} onChange={(event) => onChange(event.target.value)}>
          {value && !options.includes(value) ? <option value={value}>{value} (not installed)</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input className="input" value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      )}
      {hint ? <span className="muted small">{hint}</span> : null}
    </label>
  );
}

export function SettingsPanel() {
  const settings = useStore((state) => state.settings);
  const available = useStore((state) => state.available);
  const patchSettings = useStore((state) => state.patchSettings);
  const setQuality = useStore((state) => state.setQuality);
  const connection = useStore((state) => state.connection);
  const checkConnection = useStore((state) => state.checkConnection);

  return (
    <details className="panel settings">
      <summary>
        <span>Settings</span>
        <span className="muted">
          {settings.quality === 'fast' ? 'fast' : 'quality'} · {settings.width}px
        </span>
      </summary>

      <div className="settings-body">
        <div className="field">
          <span className="field-label">Quality</span>
          <div className="segmented">
            <button
              type="button"
              className={settings.quality === 'fast' ? 'segment active' : 'segment'}
              onClick={() => setQuality('fast')}
            >
              Fast (8 steps)
            </button>
            <button
              type="button"
              className={settings.quality === 'quality' ? 'segment active' : 'segment'}
              onClick={() => setQuality('quality')}
            >
              Quality (25 steps)
            </button>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Width</span>
            <select
              className="select"
              value={settings.width}
              onChange={(event) => {
                const size = Number(event.target.value);
                patchSettings({ width: size, height: size });
              }}
            >
              <option value={768}>768</option>
              <option value={832}>832</option>
              <option value={1024}>1024</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Steps</span>
            <input
              className="input"
              type="number"
              min={1}
              max={60}
              value={settings.steps}
              aria-label="Steps"
              onChange={(event) => patchSettings({ steps: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span className="field-label">CFG</span>
            <input
              className="input"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={settings.cfg}
              aria-label="CFG"
              onChange={(event) => patchSettings({ cfg: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">Seed</span>
          <div className="seed-row">
            <input
              className="input"
              type="number"
              value={settings.seed}
              aria-label="Seed"
              onChange={(event) => patchSettings({ seed: Number(event.target.value) })}
            />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => patchSettings({ seed: randomSeed() })}
              title="New random seed"
            >
              Random
            </button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.lockSeed}
                onChange={(event) => patchSettings({ lockSeed: event.target.checked })}
              />
              Lock
            </label>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            ControlNet strength <span className="muted">{settings.controlStrength.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.controlStrength}
            onChange={(event) => patchSettings({ controlStrength: Number(event.target.value) })}
          />
          <span className="field-label">
            Stops at <span className="muted">{settings.controlEnd.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={settings.controlEnd}
            onChange={(event) => patchSettings({ controlEnd: Number(event.target.value) })}
          />
        </div>

        <label className="field">
          <span className="field-label">Negative prompt (empty = preset default)</span>
          <textarea
            className="input"
            rows={2}
            value={settings.negative}
            placeholder={PRESETS.find((p) => p.id === settings.presetId)?.negative ?? ''}
            onChange={(event) => patchSettings({ negative: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">ComfyUI URL</span>
          <input
            className="input"
            value={settings.comfyUrl}
            onChange={(event) => patchSettings({ comfyUrl: event.target.value })}
            spellCheck={false}
          />
          <span className="muted small">
            /comfy uses the built-in proxy. An absolute URL needs a restart of ComfyUI with
            --enable-cors-header.
          </span>
        </label>

        <ModelField
          label="Checkpoint"
          value={settings.checkpoint}
          options={available.checkpoints}
          hint={
            available.checkpoints.length > 0
              ? 'Installed in ComfyUI.'
              : 'Start ComfyUI and refresh to list the installed checkpoints.'
          }
          onChange={(checkpoint) => patchSettings({ checkpoint })}
        />

        <ModelField
          label="ControlNet (SDXL)"
          value={settings.controlNet}
          options={available.controlnets}
          hint="Scribble suits freehand drawings; lineart and canny also work."
          onChange={(controlNet) => patchSettings({ controlNet })}
        />

        <div className="field">
          <span className="field-label">Lightning LoRA</span>
          <div className="seed-row">
            {available.loras.length > 0 ? (
              <select
                className="select select-block"
                value={settings.lora}
                onChange={(event) => patchSettings({ lora: event.target.value })}
              >
                {settings.lora && !available.loras.includes(settings.lora) ? (
                  <option value={settings.lora}>{settings.lora} (not installed)</option>
                ) : null}
                {available.loras.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={settings.lora}
                onChange={(event) => patchSettings({ lora: event.target.value })}
                spellCheck={false}
              />
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.useLora}
                onChange={(event) => patchSettings({ useLora: event.target.checked })}
              />
              Use
            </label>
          </div>
          {settings.useLora ? (
            <label className="field">
              <span className="field-label">
                LoRA strength <span className="muted">{settings.loraStrength.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={settings.loraStrength}
                aria-label="LoRA strength"
                onChange={(event) => patchSettings({ loraStrength: Number(event.target.value) })}
              />
              <span className="muted small">
                Reduce to 0.5–0.8 if an anime or stylised checkpoint comes out washed out at
                full strength.
              </span>
            </label>
          ) : null}
          {available.loras.length === 0 ? (
            <span className="muted small">No LoRA installed yet; fast mode needs one.</span>
          ) : null}
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.demoMode}
            onChange={(event) => patchSettings({ demoMode: event.target.checked })}
          />
          Always use the demo renderer (no ComfyUI)
        </label>

        <div className="settings-footer">
          <span className="muted small">
            Connection: {connection.status}
            {connection.version ? ` · ${connection.version}` : ''}
          </span>
          <div className="seed-row">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => void checkConnection()}
              title="Ask ComfyUI which models are installed"
            >
              Refresh models
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => patchSettings(DEFAULT_SETTINGS)}
            >
              Reset all
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
