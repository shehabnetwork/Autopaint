import { useStore } from '../store/useStore';
import { Icon } from './Icon';

export function LayersPanel() {
  const layers = useStore((state) => state.layers);
  const activeLayerId = useStore((state) => state.activeLayerId);
  const selectedLayerIds = useStore((state) => state.selectedLayerIds);
  const selectLayer = useStore((state) => state.selectLayer);
  const selectLayerRange = useStore((state) => state.selectLayerRange);
  const addLayer = useStore((state) => state.addLayer);
  const duplicateLayer = useStore((state) => state.duplicateLayer);
  const deleteLayer = useStore((state) => state.deleteLayer);
  const moveLayer = useStore((state) => state.moveLayer);
  const mergeDown = useStore((state) => state.mergeDown);
  const clearLayer = useStore((state) => state.clearLayer);
  const setLayerVisible = useStore((state) => state.setLayerVisible);
  const setLayersVisible = useStore((state) => state.setLayersVisible);
  const setLayerOpacity = useStore((state) => state.setLayerOpacity);
  const renameLayer = useStore((state) => state.renameLayer);

  const active = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
  const selectedCount = selectedLayerIds.length;
  const selectedLayers = layers.filter((layer) => selectedLayerIds.includes(layer.id));
  const allSelectedVisible = selectedLayers.every((layer) => layer.visible);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Layers</h2>
        <span className="muted">
          {selectedCount > 1 ? `${selectedCount} selected` : `${layers.length}`}
        </span>
      </div>

      <div className="layer-list">
        {[...layers].reverse().map((layer) => {
          const isSelected = selectedLayerIds.includes(layer.id);
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={
                isActive ? 'layer-row active' : isSelected ? 'layer-row selected' : 'layer-row'
              }
              onClick={(event) => {
                if (event.shiftKey) selectLayerRange(layer.id);
                else if (event.ctrlKey || event.metaKey) selectLayer(layer.id, 'toggle');
                else selectLayer(layer.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') selectLayer(layer.id);
              }}
              title="Click to select · Ctrl+click to add · Shift+click for a range"
            >
              <button
                type="button"
                className="layer-eye"
                title={layer.visible ? 'Hide this layer' : 'Show this layer'}
                aria-label={layer.visible ? 'Hide this layer' : 'Show this layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  setLayerVisible(layer.id, !layer.visible);
                }}
              >
                <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={12} />
              </button>
              <span className="layer-name">{layer.name}</span>
              <span className="layer-opacity">{Math.round(layer.opacity * 100)}%</span>
            </div>
          );
        })}
      </div>

      <p className="muted small">
        Ctrl+click adds a layer, Shift+click takes a range. Set the layer scope in the prompt panel
        to “Selected layers only” to generate from just these.
      </p>

      <div className="layer-toolbar">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => addLayer()} title="Add layer">
          <Icon name="plus" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => duplicateLayer()}
          title="Duplicate layer"
        >
          Copy
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => moveLayer(active.id, 'up')} title="Move layer up">
          <Icon name="up" size={13} />
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => moveLayer(active.id, 'down')} title="Move layer down">
          <Icon name="down" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => setLayersVisible(selectedLayerIds, !allSelectedVisible)}
          title={
            allSelectedVisible
              ? `Hide ${selectedCount > 1 ? `${selectedCount} layers` : 'this layer'}`
              : `Show ${selectedCount > 1 ? `${selectedCount} layers` : 'this layer'}`
          }
          aria-label={allSelectedVisible ? 'Hide layers' : 'Show layers'}
        >
          <Icon name={allSelectedVisible ? 'eyeOff' : 'eye'} size={13} />
          {allSelectedVisible ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => mergeDown()} title="Merge into the layer below">
          Merge
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => deleteLayer()}
          title="Delete layer"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>

      <label className="field">
        <span className="field-label">Layer name</span>
        <input
          className="input"
          value={active.name}
          onChange={(event) => renameLayer(active.id, event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">
          Opacity <span className="muted">{Math.round(active.opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={active.opacity}
          aria-label="Layer opacity"
          onChange={(event) => setLayerOpacity(active.id, Number(event.target.value))}
        />
      </label>

      <button type="button" className="btn btn-ghost btn-small" onClick={() => clearLayer()}>
        Clear this layer
      </button>
    </section>
  );
}
