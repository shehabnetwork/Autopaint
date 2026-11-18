import { useStore } from '../store/useStore';

export function Gallery() {
  const results = useStore((state) => state.results);
  const activeResultId = useStore((state) => state.activeResultId);
  const setActiveResult = useStore((state) => state.setActiveResult);
  const removeResult = useStore((state) => state.removeResult);

  if (results.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>This session</h2>
        <span className="muted">{results.length} image{results.length === 1 ? '' : 's'}</span>
      </div>
      <div className="gallery">
        {results.map((result) => (
          <div className="thumb-wrap" key={result.id}>
            <button
              type="button"
              className={result.id === activeResultId ? 'thumb active' : 'thumb'}
              onClick={() => setActiveResult(result.id)}
              title={`seed ${result.seed} — ${result.prompt.slice(0, 80)}`}
            >
              <img src={result.imageUrl} alt="" loading="lazy" />
            </button>
            <button
              type="button"
              className="thumb-delete"
              onClick={() => removeResult(result.id)}
              aria-label="Delete this generation"
              title="Delete this generation"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
