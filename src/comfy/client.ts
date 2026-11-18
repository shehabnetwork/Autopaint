import { errorMessage, sleep, uid } from '../lib/util';
import type { ModelLists } from '../types';
import type { ComfyWorkflow } from './workflow';

export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

interface HistoryEntry {
  outputs?: Record<string, { images?: ImageRef[] }>;
  status?: { status_str?: string; completed?: boolean };
}

export interface ProgressInfo {
  value: number;
  max: number;
}

export class ComfyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComfyError';
  }
}

function trimBase(base: string): string {
  const trimmed = (base || '/comfy').trim();
  return trimmed.replace(/\/+$/, '') || '/comfy';
}

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `HTTP ${response.status}`;
    try {
      const json = JSON.parse(text) as {
        error?: { message?: string; details?: string };
        node_errors?: Record<string, { errors?: Array<{ message?: string }> }>;
      };
      const nodeMessages = json.node_errors
        ? Object.entries(json.node_errors)
            .map(([id, node]) => `node ${id}: ${node.errors?.map((e) => e.message).join('; ') ?? 'error'}`)
            .join(' | ')
        : '';
      return [json.error?.message, json.error?.details, nodeMessages].filter(Boolean).join(' — ') || text;
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Thin client for a local ComfyUI. It only uses endpoints the ComfyUI web UI itself uses:
 * /system_stats, /upload/image, /prompt, /history, /view and the /ws socket.
 */
export class ComfyClient {
  readonly base: string;
  readonly clientId: string;

  constructor(base: string) {
    this.base = trimBase(base);
    this.clientId = uid();
  }

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  private wsUrl(): string {
    if (isAbsolute(this.base)) {
      return `${this.base.replace(/^http/i, 'ws')}/ws`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${this.base}/ws`;
  }

  private async fetchJson<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.url(path), { ...init, signal: controller.signal });
      if (!response.ok) throw new ComfyError(await readError(response));
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ComfyError(`ComfyUI did not answer within ${Math.round(timeoutMs / 1000)}s.`);
      }
      if (error instanceof ComfyError) throw error;
      throw new ComfyError(`Cannot reach ComfyUI at ${this.base}. Is it running? (${errorMessage(error)})`);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async systemStats(): Promise<{ system?: { comfyui_version?: string }; devices?: Array<{ name?: string }> }> {
    return this.fetchJson('/system_stats', undefined, 4000);
  }

  /** Raw /object_info for one node class; used to discover installed model files. */
  async objectInfo(node: string): Promise<Record<string, unknown>> {
    return this.fetchJson(`/object_info/${encodeURIComponent(node)}`, undefined, 6000);
  }

  /** Uploads the sketch and returns the name LoadImage expects ("subfolder/name" when nested). */
  async uploadImage(blob: Blob, filename: string): Promise<string> {
    const form = new FormData();
    form.append('image', blob, filename);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const response = await fetch(this.url('/upload/image'), { method: 'POST', body: form });
    if (!response.ok) throw new ComfyError(await readError(response));
    const data = (await response.json()) as { name: string; subfolder?: string };
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }

  async queue(workflow: ComfyWorkflow): Promise<string> {
    const data = await this.fetchJson<{ prompt_id?: string; node_errors?: Record<string, unknown> }>('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
    });
    if (data.node_errors && Object.keys(data.node_errors).length > 0) {
      throw new ComfyError(`ComfyUI rejected the workflow: ${JSON.stringify(data.node_errors).slice(0, 400)}`);
    }
    if (!data.prompt_id) throw new ComfyError('ComfyUI did not return a prompt id.');
    return data.prompt_id;
  }

  async history(promptId: string): Promise<HistoryEntry | null> {
    const data = await this.fetchJson<Record<string, HistoryEntry>>(`/history/${encodeURIComponent(promptId)}`);
    return data[promptId] ?? null;
  }

  /** Polls /history until the job produces images, fails, or the timeout is reached. */
  async waitForImages(promptId: string, timeoutMs = 300_000): Promise<ImageRef[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const entry = await this.history(promptId);
      if (entry) {
        const images = collectImages(entry);
        if (images.length > 0) return images;
        if (entry.status?.status_str === 'error') {
          throw new ComfyError('ComfyUI reported an execution error. Check the ComfyUI console for details.');
        }
      }
      await sleep(700);
    }
    throw new ComfyError('Generation timed out after 5 minutes. Check the ComfyUI console.');
  }

  viewUrl(ref: ImageRef): string {
    const params = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder ?? '',
      type: ref.type ?? 'output',
    });
    return `${this.base}/view?${params.toString()}`;
  }

  /** Best-effort progress bar. A failed socket never breaks a generation. */
  watchProgress(onProgress: (progress: ProgressInfo | null) => void): () => void {
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${this.wsUrl()}?clientId=${encodeURIComponent(this.clientId)}`);
    } catch {
      return () => {};
    }

    socket.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          data?: { value?: number; max?: number };
        };
        if (message.type === 'progress' && typeof message.data?.max === 'number') {
          onProgress({ value: message.data.value ?? 0, max: message.data.max });
        }
        if (message.type === 'executing') onProgress(null);
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => {
      onProgress(null);
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
    };
  }
}

function collectImages(entry: HistoryEntry): ImageRef[] {
  const images: ImageRef[] = [];
  for (const output of Object.values(entry.outputs ?? {})) {
    for (const image of output.images ?? []) {
      if (image?.filename) images.push(image);
    }
  }
  return images;
}

/**
 * Pull a dropdown's option list out of an /object_info payload.
 * Shape: { "<node>": { input: { required: { <field>: [ ["a","b"], {...} ] } } } }
 */
export function readOptions(payload: unknown, node: string, field: string): string[] {
  const root = payload as Record<string, unknown> | null | undefined;
  const nodeInfo = root?.[node] as { input?: Record<string, Record<string, unknown>> } | undefined;
  const spec = nodeInfo?.input?.required?.[field] ?? nodeInfo?.input?.optional?.[field];
  if (!Array.isArray(spec)) return [];
  const options = spec[0];
  if (!Array.isArray(options)) return [];
  return options.filter((value): value is string => typeof value === 'string');
}

/** Ask ComfyUI which checkpoints, ControlNets and LoRAs are installed. */
export async function fetchModelLists(base: string): Promise<ModelLists> {
  const client = new ComfyClient(base);
  const [checkpoint, controlnet, lora] = await Promise.all([
    client.objectInfo('CheckpointLoaderSimple'),
    client.objectInfo('ControlNetLoader'),
    client.objectInfo('LoraLoader'),
  ]);
  return {
    checkpoints: readOptions(checkpoint, 'CheckpointLoaderSimple', 'ckpt_name'),
    controlnets: readOptions(controlnet, 'ControlNetLoader', 'control_net_name'),
    loras: readOptions(lora, 'LoraLoader', 'lora_name'),
  };
}
