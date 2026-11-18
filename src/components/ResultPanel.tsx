import { useStore } from '../store/useStore';
import type { GenerationResult } from '../types';
import { imageLayer } from '../layers/imageLayer';
import { Icon } from './Icon';

async function saveImage(result: GenerationResult): Promise<void> {
  const extension = result.source === 'demo' ? 'jpg' : 'png';
  const filename = `sketch-${result.seed}-${result.id.slice(0, 6)}.${extension}`;

  if (result.imageUrl.startsWith('data:')) {
    const anchor = document.createElement('a');
    anchor.href = result.imageUrl;
    anchor.download = filename;
    anchor.click();
    return;
  }

  const response = await fetch(result.imageUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ResultPanel() {
  const result = useStore((state) => state.results.find((item) => item.id === state.activeResultId) ?? null);
  const generating = useStore((state) => state.generating);
  const genError = useStore((state) => state.genError);
  const patchSettings = useStore((state) => state.patchSettings);
  const setNotice = useStore((state) => state.setNotice);
  const removeResult = useStore((state) => state.removeResult);
  const addLayer = useStore((state) => state.addLayer);
  const cutBackground = useStore((state) => state.cutBackground);
  const setCutBackground = useStore((state) => state.setCutBackground);

  const sendToCanvas = async (imageUrl: string) => {
    try {
      const canvas = await imageLayer(imageUrl, { cutWhite: cutBackground });
      addLayer('Generated', canvas);
      setNotice(cutBackground ? 'Added as a layer, background cut' : 'Added as a new layer');
    } catch {
      setNotice('Could not add that image');
    }
  };

  if (genError && !result) {
    return (
      <section className="panel result-panel">
        <div className="empty">
          <Icon name="image" size={28} />
          <p>Generation failed.</p>
          <span>{genError}</span>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel result-panel">
        <div className="empty">
          <Icon name="image" size={28} />
          <p>{generating ? 'Generating your image…' : 'No image yet'}</p>
          <span>
            {generating
              ? 'This usually takes 2–5 seconds on a warm GPU.'
              : 'Draw a layout, add a prompt, then press Generate.'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel result-panel">
      <div className="result-head">
        <div className="chips">
          <span className={result.source === 'comfy' ? 'chip chip-ok' : 'chip chip-warn'}>
            {result.source === 'comfy' ? 'ComfyUI' : 'Demo render'}
          </span>
          <span className="chip">seed {result.seed}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => {
            patchSettings({ seed: result.seed, lockSeed: true });
            setNotice('Seed locked');
          }}
          title="Reuse this seed for the next generation"
        >
          <Icon name="refresh" size={14} /> Reuse seed
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small btn-icon"
          onClick={() => removeResult(result.id)}
          title="Delete this generation"
          aria-label="Delete this generation"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      <img
        className="result-image"
        src={result.imageUrl}
        alt={`Generated from prompt: ${result.prompt}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/uri-list', result.imageUrl);
          event.dataTransfer.setData('text/plain', result.imageUrl);
          event.dataTransfer.effectAllowed = 'copy';
        }}
      />

      <div className="result-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void saveImage(result)}>
          <Icon name="download" size={14} /> Download
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => void sendToCanvas(result.imageUrl)}
          title="Place this image on the canvas as a new layer"
        >
          <Icon name="image" size={14} /> To canvas
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => {
            void navigator.clipboard?.writeText(result.prompt);
            setNotice('Prompt copied');
          }}
        >
          Copy prompt
        </button>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={cutBackground}
          onChange={(event) => setCutBackground(event.target.checked)}
        />
        Cut the flat background when adding
      </label>

      <p className="muted small">
        Drag the image onto the canvas or press “To canvas”: it lands as its own layer, so you can
        paint over it, hide it, or lower its opacity. Then switch the input to{' '}
        <strong>Image (img2img)</strong> to keep the parts you like.
      </p>

      <details className="details">
        <summary>Prompt used</summary>
        <p>{result.prompt}</p>
        <p className="muted">Negative: {result.negative}</p>
      </details>

      {result.source === 'demo' ? (
        <p className="hint">
          This is a local placeholder, not an AI image. Start ComfyUI and click the connection badge to
          generate for real.
        </p>
      ) : null}
    </section>
  );
}
