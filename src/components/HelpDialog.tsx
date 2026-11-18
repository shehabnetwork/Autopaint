import { useEffect } from 'react';

const COMFOY_SETUP = [
  'Install ComfyUI (torch cu128 for RTX 50-series) and start it: python main.py',
  'models/checkpoints: an SDXL checkpoint, e.g. sd_xl_base_1.0.safetensors',
  'models/controlnet: controlnet-scribble-sdxl-1.0.safetensors',
  'models/loras: sdxl_lightning_8step_lora.safetensors (optional, for 8 steps)',
  'Set the same file names in Settings, then click the connection badge.',
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h2>How this works</h2>
        <ol className="steps">
          <li>Paint on the canvas. Every stroke, shape and fill lands in the selected layer.</li>
          <li>Use layers for the parts you want to keep separate: sky, ground, figures, a generated image.</li>
          <li>
            Move tool: drag a box and the handles appear at once. Corner handles resize (Shift
            keeps the ratio), the ring outside a corner or the top handle rotates, and the bar
            flips, rotates 90°, applies (Enter) or cancels (Esc).
          </li>
          <li>
            While a selection exists, the other tools only paint inside it. <strong>Deselect</strong>{' '}
            in the bar or Escape removes it.
          </li>
          <li>Write a short prompt and press Generate. Layout mode sends your painting as a ControlNet sketch; Image mode repaints the canvas itself.</li>
          <li>Drag the result back onto the canvas (it becomes a layer) and keep going.</li>
        </ol>

        <h3>ComfyUI setup</h3>
        <ul className="steps">
          {COMFOY_SETUP.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="muted small">
          Full notes live in docs/COMFYUI.md. Without ComfyUI the app still works: Generate produces a demo
          render so you can paint and experiment.
        </p>

        <h3>Shortcuts</h3>
        <div className="shortcuts">
          <span><kbd>B</kbd> brush</span>
          <span><kbd>E</kbd> eraser</span>
          <span><kbd>L</kbd> line</span>
          <span><kbd>R</kbd> rectangle</span>
          <span><kbd>O</kbd> circle</span>
          <span><kbd>G</kbd> fill</span>
          <span><kbd>V</kbd> select / move</span>
          <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span>
          <span><kbd>Esc</kbd> deselect</span>
        </div>

        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
