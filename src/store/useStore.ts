import { create } from 'zustand';
import type {
  BrushId,
  BrushTip,
  ConnectionState,
  GenerationResult,
  GenMode,
  GenSettings,
  Layer,
  ModelLists,
  PixelBounds,
  Project,
  Tool,
} from '../types';
import { CANVAS_SIZE } from '../types';
import { buildPrompt } from '../lib/prompt';
import { getBrush } from '../lib/brush';
import { renderDemo } from '../lib/demo';
import { errorMessage, randomSeed, sleep, uid } from '../lib/util';
import {
  canvasFromDataUrl,
  canvasToBlob,
  cloneCanvas,
  compositeLayers,
  createLayerCanvas,
  disposeLayerCanvas,
  getLayerCanvas,
  setLayerCanvas,
} from '../layers/registry';
import { ComfyClient, fetchModelLists } from '../comfy/client';
import { buildWorkflow } from '../comfy/workflow';

export const DRAFT_KEY = 'wig:draft.v2';
const HISTORY_LIMIT = 10;

export interface Notice {
  text: string;
  actionLabel?: string;
  action?: () => void;
}

interface HistoryEntry {
  layerId: string;
  before: ImageData;
}

export const DEFAULT_SETTINGS: GenSettings = {
  mode: 'controlnet',
  scope: 'all',
  denoise: 0.65,
  presetId: 'photo',
  negative: '',
  steps: 8,
  cfg: 1.5,
  seed: 123456,
  lockSeed: true,
  controlStrength: 0.7,
  controlEnd: 0.8,
  width: 1024,
  height: 1024,
  quality: 'fast',
  comfyUrl: '/comfy',
  checkpoint: 'sd_xl_base_1.0.safetensors',
  controlNet: 'controlnet-scribble-sdxl-1.0.safetensors',
  lora: 'sdxl_lightning_8step_lora.safetensors',
  useLora: true,
  loraStrength: 1,
  sampler: 'dpmpp_sde',
  scheduler: 'sgm_uniform',
  demoMode: false,
};

export const PALETTE = [
  { name: 'Ink', value: '#111827' },
  { name: 'Graphite', value: '#4b5563' },
  { name: 'White', value: '#ffffff' },
  { name: 'Red', value: '#e5484d' },
  { name: 'Crimson', value: '#b42318' },
  { name: 'Rose', value: '#fb7185' },
  { name: 'Orange', value: '#f5a524' },
  { name: 'Amber', value: '#fbbf24' },
  { name: 'Sand', value: '#e4c590' },
  { name: 'Yellow', value: '#fde047' },
  { name: 'Lime', value: '#a3e635' },
  { name: 'Green', value: '#46a758' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#12a594' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Sky', value: '#38bdf8' },
  { name: 'Blue', value: '#3e63dd' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8e4ec6' },
  { name: 'Magenta', value: '#d946ef' },
  { name: 'Pink', value: '#e93d82' },
  { name: 'Brown', value: '#8b5e34' },
  { name: 'Skin', value: '#f2c7a5' },
  { name: 'Mint', value: '#a7f3d0' },
];

function makeLayer(name: string): Layer {
  const id = uid();
  setLayerCanvas(id, createLayerCanvas(CANVAS_SIZE));
  return { id, name, visible: true, opacity: 1 };
}

function readDraft(): { png: string; settings: Partial<GenSettings>; promptText: string } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { png?: string; settings?: Partial<GenSettings>; promptText?: string };
    if (!parsed?.png) return null;
    return { png: parsed.png, settings: parsed.settings ?? {}, promptText: parsed.promptText ?? '' };
  } catch {
    return null;
  }
}

const draft = readDraft();
const firstLayer = makeLayer('Layer 1');

interface AppState {
  layers: Layer[];
  activeLayerId: string;
  /** Layers feeding generation and highlighted in the panel; always contains the active layer. */
  selectedLayerIds: string[];
  /** Knock the flat background out of an imported generation. */
  cutBackground: boolean;
  layerVersion: number;
  /** Changes whenever the document is replaced (new/load) so the canvas can drop transient state. */
  documentId: string;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: PixelBounds | null;

  tool: Tool;
  brush: BrushId;
  tip: BrushTip;
  color: string;
  strokeWidth: number;
  opacity: number;
  fillShapes: boolean;

  promptText: string;
  settings: GenSettings;

  connection: ConnectionState;
  available: ModelLists;
  generating: boolean;
  progress: { value: number; max: number } | null;
  genError: string | null;
  statusText: string;
  notice: Notice | null;

  results: GenerationResult[];
  activeResultId: string | null;

  bootstrapped: boolean;

  setTool: (tool: Tool) => void;
  setBrush: (brush: BrushId) => void;
  setTip: (tip: BrushTip) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setFillShapes: (fill: boolean) => void;
  setSelection: (selection: PixelBounds | null) => void;
  bumpLayer: () => void;

  addLayer: (name?: string, canvas?: HTMLCanvasElement) => string;
  duplicateLayer: (id?: string) => void;
  deleteLayer: (id?: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  setLayerVisible: (id: string, visible: boolean) => void;
  setLayersVisible: (ids: string[], visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  renameLayer: (id: string, name: string) => void;
  setActiveLayer: (id: string) => void;
  selectLayer: (id: string, mode?: 'replace' | 'toggle') => void;
  selectLayerRange: (id: string) => void;
  setCutBackground: (value: boolean) => void;
  clearLayer: (id?: string) => void;
  mergeDown: (id?: string) => void;

  beginHistory: () => void;
  commitHistory: () => void;
  discardHistory: () => void;
  undo: () => void;
  redo: () => void;

  stampCanvas: (canvas: HTMLCanvasElement, x: number, y: number) => void;

  setPromptText: (text: string) => void;
  patchSettings: (patch: Partial<GenSettings>) => void;
  setQuality: (quality: GenSettings['quality']) => void;
  setPreset: (presetId: string) => void;
  setMode: (mode: GenMode) => void;

  generate: () => Promise<void>;
  checkConnection: () => Promise<void>;
  setActiveResult: (id: string | null) => void;
  removeResult: (id: string) => void;
  clearError: () => void;
  setNotice: (message: string) => void;
  notify: (notice: Notice) => void;

  restoreAutosave: () => Promise<void>;
  toProject: () => Project;
  loadProject: (project: Partial<Project>) => Promise<void>;
  newProject: () => void;
}

export const useStore = create<AppState>()((set, get) => ({
  layers: [firstLayer],
  activeLayerId: firstLayer.id,
  selectedLayerIds: [firstLayer.id],
  cutBackground: true,
  layerVersion: 0,
  documentId: uid(),
  past: [],
  future: [],
  selection: null,

  tool: 'brush',
  brush: 'ink',
  tip: 'round',
  color: PALETTE[0].value,
  strokeWidth: 8,
  opacity: 1,
  fillShapes: false,

  promptText: draft?.promptText ?? '',
  settings: { ...DEFAULT_SETTINGS, ...(draft?.settings ?? {}) },

  connection: { status: 'unknown' },
  available: { checkpoints: [], controlnets: [], loras: [] },
  generating: false,
  progress: null,
  genError: null,
  statusText: '',
  notice: null,

  results: [],
  activeResultId: null,

  bootstrapped: false,

  setTool: (tool) => set({ tool }),
  setBrush: (brush) => {
    const preset = getBrush(brush);
    set({ brush, strokeWidth: preset.size, opacity: preset.opacity, tip: preset.tip });
  },
  setTip: (tip) => set({ tip }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setOpacity: (opacity) => set({ opacity }),
  setFillShapes: (fillShapes) => set({ fillShapes }),
  setSelection: (selection) => set({ selection }),
  bumpLayer: () => set((state) => ({ layerVersion: state.layerVersion + 1 })),

  addLayer: (name, canvas) => {
    const layer = makeLayer(name ?? `Layer ${get().layers.length + 1}`);
    if (canvas) setLayerCanvas(layer.id, canvas);
    const index = get().layers.findIndex((item) => item.id === get().activeLayerId);
    const layers = [...get().layers];
    layers.splice(index + 1, 0, layer);
    set({
      layers,
      activeLayerId: layer.id,
      selectedLayerIds: [layer.id],
      layerVersion: get().layerVersion + 1,
    });
    return layer.id;
  },

  duplicateLayer: (id) => {
    const target = id ?? get().activeLayerId;
    const source = get().layers.find((layer) => layer.id === target);
    if (!source) return;
    const copy = cloneCanvas(getLayerCanvas(source.id));
    get().addLayer(`${source.name} copy`, copy);
  },

  deleteLayer: (id) => {
    const target = id ?? get().activeLayerId;
    const layers = get().layers;
    if (layers.length <= 1) {
      get().setNotice('Keep at least one layer');
      return;
    }
    const index = layers.findIndex((layer) => layer.id === target);
    if (index === -1) return;
    disposeLayerCanvas(target);
    const next = layers.filter((layer) => layer.id !== target);
    const activeLayerId = next[Math.max(0, index - 1)].id;
    const stillSelected = get().selectedLayerIds.filter((id) => id !== target);
    set({
      layers: next,
      activeLayerId,
      selectedLayerIds: stillSelected.length > 0 ? stillSelected : [activeLayerId],
      layerVersion: get().layerVersion + 1,
    });
  },

  moveLayer: (id, direction) => {
    const layers = [...get().layers];
    const index = layers.findIndex((layer) => layer.id === id);
    if (index === -1) return;
    const swap = direction === 'up' ? index + 1 : index - 1;
    if (swap < 0 || swap >= layers.length) return;
    [layers[index], layers[swap]] = [layers[swap], layers[index]];
    set({ layers, layerVersion: get().layerVersion + 1 });
  },

  setLayerVisible: (id, visible) =>
    set((state) => ({
      layers: state.layers.map((layer) => (layer.id === id ? { ...layer, visible } : layer)),
      layerVersion: state.layerVersion + 1,
    })),

  setLayersVisible: (ids, visible) => {
    const target = new Set(ids);
    set((state) => ({
      layers: state.layers.map((layer) => (target.has(layer.id) ? { ...layer, visible } : layer)),
      layerVersion: state.layerVersion + 1,
    }));
  },

  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)),
      layerVersion: state.layerVersion + 1,
    })),

  renameLayer: (id, name) =>
    set((state) => ({
      layers: state.layers.map((layer) => (layer.id === id ? { ...layer, name } : layer)),
    })),

  setActiveLayer: (id) => set({ activeLayerId: id, selectedLayerIds: [id] }),

  /** Ctrl/Cmd-click toggles a layer; a plain click replaces the selection. */
  selectLayer: (id, mode = 'replace') =>
    set((state) => {
      if (mode === 'replace') return { activeLayerId: id, selectedLayerIds: [id] };
      const has = state.selectedLayerIds.includes(id);
      const ids = has
        ? state.selectedLayerIds.filter((value) => value !== id)
        : [...state.selectedLayerIds, id];
      if (ids.length === 0) return { selectedLayerIds: [state.activeLayerId] };
      return { selectedLayerIds: ids, activeLayerId: id };
    }),

  /** Shift-click selects the run of layers between the active one and this one. */
  selectLayerRange: (id) =>
    set((state) => {
      const from = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
      const to = state.layers.findIndex((layer) => layer.id === id);
      if (from < 0 || to < 0) return { activeLayerId: id, selectedLayerIds: [id] };
      const [start, end] = from < to ? [from, to] : [to, from];
      return {
        selectedLayerIds: state.layers.slice(start, end + 1).map((layer) => layer.id),
        activeLayerId: id,
      };
    }),

  setCutBackground: (cutBackground) => set({ cutBackground }),

  clearLayer: (id) => {
    const target = id ?? get().activeLayerId;
    get().beginHistory();
    const canvas = getLayerCanvas(target);
    canvas.getContext('2d')?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    get().commitHistory();
    get().bumpLayer();
  },

  mergeDown: (id) => {
    const target = id ?? get().activeLayerId;
    const layers = get().layers;
    const index = layers.findIndex((layer) => layer.id === target);
    if (index <= 0) {
      get().setNotice('Nothing below to merge into');
      return;
    }
    const below = layers[index - 1];
    const above = layers[index];

    get().beginHistory();
    const belowCtx = getLayerCanvas(below.id).getContext('2d');
    if (belowCtx) {
      belowCtx.save();
      belowCtx.globalAlpha = above.opacity;
      belowCtx.drawImage(getLayerCanvas(above.id), 0, 0);
      belowCtx.restore();
    }
    disposeLayerCanvas(above.id);
    set({
      layers: layers.filter((layer) => layer.id !== above.id),
      activeLayerId: below.id,
      layerVersion: get().layerVersion + 1,
    });
    get().commitHistory();
  },

  beginHistory: () => {
    const state = get();
    const canvas = getLayerCanvas(state.activeLayerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const before = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    set({ future: [] });
    // Stash on the widest scope we have without another field: the past entry is pushed by commit.
    pendingBefore = { layerId: state.activeLayerId, before };
  },

  commitHistory: () => {
    if (!pendingBefore) return;
    set((state) => ({
      past: [...state.past, pendingBefore as HistoryEntry].slice(-HISTORY_LIMIT),
      future: [],
      layerVersion: state.layerVersion + 1,
    }));
    pendingBefore = null;
  },

  /** Throw away the pending snapshot (used when a transform is cancelled and pixels are restored). */
  discardHistory: () => {
    pendingBefore = null;
  },

  undo: () => {
    const state = get();
    const entry = state.past[state.past.length - 1];
    if (!entry) return;
    const canvas = getLayerCanvas(entry.layerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.putImageData(entry.before, 0, 0);
    set({
      past: state.past.slice(0, -1),
      future: [{ layerId: entry.layerId, before: current }, ...state.future].slice(0, HISTORY_LIMIT),
      layerVersion: state.layerVersion + 1,
    });
  },

  redo: () => {
    const state = get();
    const entry = state.future[0];
    if (!entry) return;
    const canvas = getLayerCanvas(entry.layerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.putImageData(entry.before, 0, 0);
    set({
      future: state.future.slice(1),
      past: [...state.past, { layerId: entry.layerId, before: current }].slice(-HISTORY_LIMIT),
      layerVersion: state.layerVersion + 1,
    });
  },

  stampCanvas: (canvas, x, y) => {
    const ctx = getLayerCanvas(get().activeLayerId).getContext('2d');
    if (!ctx) return;
    get().beginHistory();
    ctx.drawImage(canvas, x, y);
    get().commitHistory();
    get().bumpLayer();
  },

  setPromptText: (promptText) => set({ promptText }),

  patchSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

  setQuality: (quality) =>
    set((state) => ({
      settings:
        quality === 'fast'
          ? { ...state.settings, quality, steps: 8, cfg: 1.5, useLora: true }
          : { ...state.settings, quality, steps: 25, cfg: 6.5, useLora: false },
    })),

  setPreset: (presetId) => set((state) => ({ settings: { ...state.settings, presetId, negative: '' } })),
  setMode: (mode) => set((state) => ({ settings: { ...state.settings, mode } })),

  generate: async () => {
    const state = get();
    if (state.generating) return;

    const { prompt, negative } = buildPrompt(
      state.promptText,
      state.settings.presetId,
      state.settings.negative,
    );
    const seed = state.settings.lockSeed ? state.settings.seed : randomSeed();
    const offline = state.connection.status === 'offline';
    const useDemo = state.settings.demoMode || offline;

    set({ generating: true, genError: null, progress: null, statusText: 'Preparing canvas…' });

    try {
      const visible = state.layers.filter((layer) => layer.visible);
      const selected = new Set(state.selectedLayerIds);
      const chosen =
        state.settings.scope === 'selected'
          ? visible.filter((layer) => selected.has(layer.id))
          : visible;
      const sourceLayers = chosen.length > 0 ? chosen : visible;
      const composite = compositeLayers(sourceLayers, CANVAS_SIZE);
      const blob = await canvasToBlob(composite);
      const dataUrl = composite.toDataURL('image/png');

      let imageUrl = '';
      let source: GenerationResult['source'] = 'demo';
      let promptId: string | undefined;

      if (useDemo) {
        set({ statusText: offline ? 'ComfyUI offline — demo render' : 'Demo render…' });
        await sleep(250);
        imageUrl = renderDemo(composite, seed);
      } else {
        const client = new ComfyClient(state.settings.comfyUrl);
        set({ statusText: 'Uploading canvas to ComfyUI…' });
        const imageName = await client.uploadImage(blob, `canvas-${Date.now()}.png`);

        set({ statusText: 'Queued in ComfyUI…' });
        const workflow = buildWorkflow({
          prompt,
          negative,
          imageName,
          seed,
          settings: state.settings,
        });
        promptId = await client.queue(workflow);

        set({ statusText: 'Generating…' });
        const stop = client.watchProgress((progress) => set({ progress }));
        try {
          const images = await client.waitForImages(promptId);
          imageUrl = client.viewUrl(images[0]);
          source = 'comfy';
        } finally {
          stop();
        }
      }

      const result: GenerationResult = {
        id: uid(),
        imageUrl,
        prompt,
        negative,
        seed,
        createdAt: Date.now(),
        source,
        canvasDataUrl: dataUrl,
        promptId,
        settings: { ...state.settings, seed },
      };

      set((current) => ({
        results: [result, ...current.results].slice(0, 24),
        activeResultId: result.id,
        generating: false,
        progress: null,
        statusText: '',
        settings: { ...current.settings, seed },
      }));
    } catch (error) {
      set({ generating: false, progress: null, statusText: '', genError: errorMessage(error) });
    }
  },

  checkConnection: async () => {
    const { settings } = get();
    set({ connection: { status: 'checking' } });
    try {
      const client = new ComfyClient(settings.comfyUrl);
      const stats = await client.systemStats();

      let available = get().available;
      try {
        available = await fetchModelLists(settings.comfyUrl);
      } catch {
        available = get().available;
      }

      const current = get().settings;
      const patch: Partial<GenSettings> = {
        checkpoint: pickModel(current.checkpoint, available.checkpoints, ['juggernaut', 'sdxl', 'xl']),
        controlNet: pickModel(current.controlNet, available.controlnets, [
          'scribble',
          'lineart',
          'softedge',
          'canny',
        ]),
        lora: pickModel(current.lora, available.loras, ['lightning', 'lcm', 'turbo']),
      };
      if (available.loras.length === 0) patch.useLora = false;

      set({
        connection: {
          status: 'online',
          version: stats.system?.comfyui_version ?? 'unknown',
          checkedAt: Date.now(),
        },
        available,
        settings: { ...current, ...patch },
      });
    } catch (error) {
      set({ connection: { status: 'offline', error: errorMessage(error), checkedAt: Date.now() } });
    }
  },

  setActiveResult: (activeResultId) => set({ activeResultId }),

  removeResult: (id) => {
    const state = get();
    const index = state.results.findIndex((result) => result.id === id);
    if (index === -1) return;

    const removed = state.results[index];
    const results = state.results.filter((result) => result.id !== id);
    const activeResultId =
      state.activeResultId === id
        ? (results[Math.min(index, results.length - 1)]?.id ?? null)
        : state.activeResultId;

    set({ results, activeResultId });
    get().notify({
      text: 'Generation deleted',
      actionLabel: 'Undo',
      action: () => {
        const current = get().results;
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, removed);
        set({ results: restored, activeResultId: removed.id });
      },
    });
  },

  clearError: () => set({ genError: null }),

  setNotice: (message) => {
    const notice = message ? { text: message } : null;
    set({ notice });
    if (!notice) return;
    setTimeout(() => {
      if (get().notice?.text === notice.text) set({ notice: null });
    }, 2500);
  },

  notify: (notice) => {
    set({ notice });
    setTimeout(
      () => {
        if (get().notice === notice) set({ notice: null });
      },
      notice.action ? 6000 : 2500,
    );
  },

  restoreAutosave: async () => {
    if (get().bootstrapped) return;
    set({ bootstrapped: true });
    if (!draft?.png) return;
    try {
      const canvas = await canvasFromDataUrl(draft.png);
      setLayerCanvas(get().layers[0].id, canvas);
      get().bumpLayer();
    } catch {
      /* an unreadable autosave should not block the app */
    }
  },

  toProject: () => {
    const state = get();
    return {
      version: 2,
      name: 'project',
      layers: state.layers.map((layer) => ({
        ...layer,
        png: getLayerCanvas(layer.id).toDataURL('image/png'),
      })),
      activeLayerId: state.activeLayerId,
      settings: state.settings,
      savedAt: Date.now(),
    };
  },

  loadProject: async (project) => {
    if (!project || !Array.isArray(project.layers) || project.layers.length === 0) {
      set({ genError: 'That file is not a project file.' });
      return;
    }

    const layers: Layer[] = [];
    for (const layer of project.layers) {
      const id = uid();
      const canvas = await canvasFromDataUrl(layer.png);
      setLayerCanvas(id, canvas);
      layers.push({ id, name: layer.name, visible: layer.visible, opacity: layer.opacity });
    }

    set({
      layers,
      activeLayerId: layers[0].id,
      selectedLayerIds: [layers[0].id],
      selection: null,
      past: [],
      future: [],
      documentId: uid(),
      settings: { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) },
      genError: null,
      layerVersion: get().layerVersion + 1,
      notice: { text: 'Project loaded' },
    });
  },

  newProject: () => {
    for (const layer of get().layers) disposeLayerCanvas(layer.id);
    const layer = makeLayer('Layer 1');
    set({
      layers: [layer],
      activeLayerId: layer.id,
      selectedLayerIds: [layer.id],
      selection: null,
      past: [],
      future: [],
      documentId: uid(),
      activeResultId: null,
      genError: null,
      layerVersion: get().layerVersion + 1,
      notice: { text: 'New project' },
    });
  },
}));

/** Set by beginHistory, consumed by commitHistory (keeps the store free of extra fields). */
let pendingBefore: HistoryEntry | null = null;

function pickModel(current: string, options: string[], preferred: string[]): string {
  if (options.length === 0) return current;
  if (options.includes(current)) return current;
  const lower = options.map((option) => option.toLowerCase());
  for (const keyword of preferred) {
    const index = lower.findIndex((name) => name.includes(keyword));
    if (index >= 0) return options[index];
  }
  return options[0];
}
