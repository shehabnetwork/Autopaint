import { useEffect, useState } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { PromptPanel } from './components/PromptPanel';
import { LayersPanel } from './components/LayersPanel';
import { ResultPanel } from './components/ResultPanel';
import { Gallery } from './components/Gallery';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpDialog } from './components/HelpDialog';
import { DRAFT_KEY, useStore } from './store/useStore';
import { compositeLayers } from './layers/registry';

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const store = useStore.getState();
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (modifier && key === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }

      switch (key) {
        case 'v':
          store.setTool('move');
          break;
        case 'b':
          store.setTool('brush');
          break;
        case 'e':
          store.setTool('eraser');
          break;
        case 'l':
          store.setTool('line');
          break;
        case 'r':
          store.setTool('rect');
          break;
        case 'o':
          store.setTool('ellipse');
          break;
        case 'g':
          store.setTool('bucket');
          break;
        case 'escape':
          store.setSelection(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * Autosave keeps one flattened PNG plus the settings. Layers are only preserved by an explicit
 * Save (project JSON), because localStorage cannot hold several 1024² PNGs.
 */
function useAutosave() {
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useStore.subscribe((state) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const png = compositeLayers(state.layers).toDataURL('image/png');
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ png, settings: state.settings, promptText: state.promptText, savedAt: Date.now() }),
          );
        } catch {
          /* storage full or blocked: autosave is best effort */
        }
      }, 1200);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
}

export default function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const notice = useStore((state) => state.notice);
  const checkConnection = useStore((state) => state.checkConnection);
  const restoreAutosave = useStore((state) => state.restoreAutosave);

  useKeyboardShortcuts();
  useAutosave();

  useEffect(() => {
    void restoreAutosave();
    void checkConnection();
  }, [restoreAutosave, checkConnection]);

  return (
    <div className="app">
      <TopBar onHelp={() => setHelpOpen(true)} />

      <main className="workspace">
        <Toolbar />
        <CanvasStage />
        <aside className="right-rail">
          <PromptPanel />
          <LayersPanel />
          <ResultPanel />
          <Gallery />
          <SettingsPanel />
        </aside>
      </main>

      {notice ? (
        <div className="toast" role="status">
          <span>{notice.text}</span>
          {notice.action && notice.actionLabel ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                notice.action?.();
                useStore.getState().setNotice('');
              }}
            >
              {notice.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
