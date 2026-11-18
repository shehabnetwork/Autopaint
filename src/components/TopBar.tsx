import { useRef } from 'react';
import { useStore } from '../store/useStore';
import type { Project } from '../types';
import { Icon } from './Icon';

function downloadJson(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sketch-project-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TopBar({ onHelp }: { onHelp: () => void }) {
  const connection = useStore((state) => state.connection);
  const checkConnection = useStore((state) => state.checkConnection);
  const newProject = useStore((state) => state.newProject);
  const toProject = useStore((state) => state.toProject);
  const loadProject = useStore((state) => state.loadProject);
  const setNotice = useStore((state) => state.setNotice);
  const hasContent = useStore((state) => state.layerVersion > 0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const badgeClass =
    connection.status === 'online'
      ? 'badge badge-online'
      : connection.status === 'offline'
        ? 'badge badge-offline'
        : 'badge';

  const badgeLabel =
    connection.status === 'online'
      ? `ComfyUI ${connection.version ?? ''}`.trim()
      : connection.status === 'offline'
        ? 'ComfyUI offline'
        : connection.status === 'checking'
          ? 'Checking…'
          : 'Check ComfyUI';

  const handleOpenFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Project;
      await loadProject(parsed);
    } catch {
      setNotice('Could not read that file.');
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">S→I</div>
        <div>
          <h1>Sketch to Image</h1>
          <p>Local canvas + ComfyUI</p>
        </div>
      </div>

      <button
        type="button"
        className={badgeClass}
        onClick={() => void checkConnection()}
        title={connection.error ?? 'Click to check the ComfyUI connection'}
      >
        <span className="dot" />
        {badgeLabel}
      </button>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (hasContent && !window.confirm('Clear the canvas and start a new project?')) return;
            newProject();
          }}
        >
          <Icon name="plus" /> New
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            downloadJson(toProject());
            setNotice('Project saved');
          }}
        >
          <Icon name="save" /> Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="folder" /> Load
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onHelp} title="Help">
          <Icon name="help" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void handleOpenFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
