import type { Tool } from '../types';
import { PALETTE, useStore } from '../store/useStore';
import { BRUSHES } from '../lib/brush';
import type { IconName } from './Icon';
import { Icon } from './Icon';

const TOOLS: Array<{ id: Tool; label: string; hotkey: string; icon: IconName }> = [
  { id: 'brush', label: 'Brush', hotkey: 'B', icon: 'pen' },
  { id: 'eraser', label: 'Eraser', hotkey: 'E', icon: 'eraser' },
  { id: 'line', label: 'Line', hotkey: 'L', icon: 'line' },
  { id: 'rect', label: 'Rectangle', hotkey: 'R', icon: 'rect' },
  { id: 'ellipse', label: 'Circle / ellipse', hotkey: 'O', icon: 'ellipse' },
  { id: 'bucket', label: 'Fill area', hotkey: 'G', icon: 'fill' },
  { id: 'move', label: 'Select and move pixels', hotkey: 'V', icon: 'cursor' },
];

export function Toolbar() {
  const tool = useStore((state) => state.tool);
  const setTool = useStore((state) => state.setTool);
  const brush = useStore((state) => state.brush);
  const setBrush = useStore((state) => state.setBrush);
  const tip = useStore((state) => state.tip);
  const setTip = useStore((state) => state.setTip);
  const color = useStore((state) => state.color);
  const setColor = useStore((state) => state.setColor);
  const strokeWidth = useStore((state) => state.strokeWidth);
  const setStrokeWidth = useStore((state) => state.setStrokeWidth);
  const opacity = useStore((state) => state.opacity);
  const setOpacity = useStore((state) => state.setOpacity);
  const fillShapes = useStore((state) => state.fillShapes);
  const setFillShapes = useStore((state) => state.setFillShapes);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const canUndo = useStore((state) => state.past.length > 0);
  const canRedo = useStore((state) => state.future.length > 0);

  return (
    <aside className="toolbar" aria-label="Drawing tools">
      <div className="tool-grid">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tool === item.id ? 'tool active' : 'tool'}
            onClick={() => setTool(item.id)}
            title={`${item.label} (${item.hotkey})`}
            aria-pressed={tool === item.id}
            data-tool={item.id}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <span className="toolbar-label">Brush</span>
        <select
          className="select select-block"
          value={brush}
          aria-label="Brush"
          onChange={(event) => setBrush(event.target.value as (typeof BRUSHES)[number]['id'])}
        >
          {BRUSHES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button
            type="button"
            className={tip === 'round' ? 'segment active' : 'segment'}
            onClick={() => setTip('round')}
            aria-pressed={tip === 'round'}
            title="Round tip"
          >
            ○
          </button>
          <button
            type="button"
            className={tip === 'flat' ? 'segment active' : 'segment'}
            onClick={() => setTip('flat')}
            aria-pressed={tip === 'flat'}
            title="Square tip"
          >
            □
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <label className="toolbar-label" htmlFor="brush-size">
          Size <span className="muted">{strokeWidth}</span>
        </label>
        <input
          id="brush-size"
          type="range"
          min={1}
          max={160}
          step={1}
          value={strokeWidth}
          aria-label="Stroke width"
          onChange={(event) => setStrokeWidth(Number(event.target.value))}
        />
        <label className="toolbar-label" htmlFor="brush-opacity">
          Opacity <span className="muted">{Math.round(opacity * 100)}%</span>
        </label>
        <input
          id="brush-opacity"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          aria-label="Opacity"
          onChange={(event) => setOpacity(Number(event.target.value))}
        />
      </div>

      <div className="toolbar-section">
        <span className="toolbar-label">Colour</span>
        <div className="swatches">
          {PALETTE.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={color === entry.value ? 'swatch active' : 'swatch'}
              style={{ background: entry.value }}
              onClick={() => setColor(entry.value)}
              title={entry.name}
              aria-label={entry.name}
            />
          ))}
          <label
            className={PALETTE.some((entry) => entry.value === color) ? 'swatch swatch-custom' : 'swatch swatch-custom active'}
            style={{ background: color }}
            title="Custom colour"
          >
            <input
              type="color"
              value={color}
              aria-label="Custom colour"
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className={fillShapes ? 'tool-wide active' : 'tool-wide'}
          onClick={() => setFillShapes(!fillShapes)}
          aria-pressed={fillShapes}
          title="Fill new rectangles and ellipses with the current colour"
        >
          <Icon name="fill" size={15} /> Fill shapes
        </button>
      </div>

      <div className="toolbar-section toolbar-history">
        <button type="button" className="tool" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="tool"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Icon name="redo" />
        </button>
      </div>
    </aside>
  );
}
