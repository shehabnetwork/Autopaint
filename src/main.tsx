import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store/useStore';
import { compositeLayers, cutBackground, loadImageElement } from './layers/registry';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root not found in index.html');
}

// Test hook: the headless smoke test reads state and the flattened canvas through this.
// It is a local, single-user app, so exposing the store on window costs nothing.
declare global {
  interface Window {
    __wig?: typeof useStore;
    __wigExport?: () => string;
    __wigCutBackground?: (src: string, tolerance?: number) => Promise<string>;
  }
}
window.__wig = useStore;
window.__wigExport = () => compositeLayers(useStore.getState().layers).toDataURL('image/png');
window.__wigCutBackground = async (src: string, tolerance = 32) => {
  const image = await loadImageElement(src);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  source.getContext('2d')?.drawImage(image, 0, 0);
  return cutBackground(source, tolerance).toDataURL('image/png');
};

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
