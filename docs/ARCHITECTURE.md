# Architecture

## One picture

```text
 Browser (React + Konva)                         ComfyUI (127.0.0.1:8188)
 ┌──────────────────────────────┐                ┌───────────────────────────┐
 │ Canvas ──► Scene graph       │                │ LoadImage                 │
 │   │            │             │  1 upload PNG  │   ↓                       │
 │   │            ▼             │ ─────────────► │ ControlNetApplyAdvanced   │
 │   │      Prompt builder      │                │   ↓                       │
 │   │            │             │  2 POST /prompt│ KSampler (SDXL+Lightning) │
 │   │            ▼             │ ─────────────► │   ↓                       │
 │   │      renderSketch()      │                │ VAEDecode → SaveImage     │
 │   │            │             │  3 WS progress │                           │
 │   ▼            ▼             │ ◄──────────────│                           │
 │ Result panel ◄─ image URL    │  4 GET /history│                           │
 └──────────────────────────────┘                └───────────────────────────┘
```

There is no backend process. The Vite dev server (and preview server) proxies `/comfy/*` to
`http://127.0.0.1:8188` so the browser sees one origin and WebSockets just work.

## Modules

| Module | Depends on | Job |
|---|---|---|
| `types.ts` | – | Vocabulary: `Shape`, `Scene`, `GenSettings`, `GenerationResult` |
| `store/useStore.ts` | types, lib, comfy | All mutable state and the generate action |
| `canvas/CanvasStage.tsx` | store, geometry | Pointer input → shapes; renders the Konva layer |
| `lib/sketch.ts` | types | Scene → 1024×1024 black-on-white PNG |
| `lib/prompt.ts` | types, presets | Scene + text → prompt, negative prompt |
| `lib/geometry.ts` | types | Bounds, hit testing, region/size words |
| `lib/demo.ts` | types | Offline fake render |
| `comfy/client.ts` | types | HTTP + WS against ComfyUI |
| `comfy/workflow.ts` | types | Settings → ComfyUI API-format graph |

Rule of thumb: components never call `fetch` or build workflows. They call store actions.

## Data model

The document is a **stack of raster layers**, not a scene graph:

```ts
interface Layer { id, name, visible, opacity }
```

Pixels live in `src/layers/registry.ts`: a `Map<layerId, HTMLCanvasElement>` at 1024×1024.
The store only holds the layer list, the active layer id and a `layerVersion` counter that tells
the canvas to repaint after a pixel change. Keeping the canvases out of React state means a brush
dab does not re-render the UI, and undo snapshots stay explicit `ImageData` copies.

`compositeLayers()` flattens the visible layers (with per-layer opacity) onto white; that is what
gets uploaded to ComfyUI, saved in the autosave, and exposed as `window.__wigExport` for tests.

### Pointer handling

`pointerdown` starts an interaction on the Konva stage, but the subsequent `pointermove` /
`pointerup` are listened for on `window`, with coordinates mapped through the stage's bounding
rect. That is what lets a stroke, a shape drag or a selection resize continue past the edge of
the canvas (or a little outside it) instead of ending at the boundary. `pointerleave` only hides
the brush cursor; it never ends an interaction.

The brush cursor is a Konva group (two circles and two squares, one white outline under one dark
outline) moved imperatively on hover, so a large brush shows its real footprint without
re-rendering React on every mouse move. The stage's CSS cursor is set to `none` for the brush and
eraser, and to `nwse-resize` / `nesw-resize` / `grab` over the transform controls.

### Painting (`src/layers/paint.ts`)

A stroke is drawn into a **scratch canvas** at full alpha while the pointer moves, previewed on
top of the layers, and composited onto the active layer once on release with the stroke opacity
and `destination-out` for the eraser. That avoids the dark joints you get when every segment is
blended separately. `paintSegment()` builds a quad between two points with the pressure-scaled
width and adds round caps when the tip is round.

The bucket uses a flood fill that expands from the seed while the RGBA distance stays within the
tolerance, builds a mask, and paints the colour through it.

Undo keeps the last 10 `ImageData` snapshots of the layer a change touched (≈4 MB each). Layer
add/delete/reorder are not undoable; deletion asks nothing but is one click to recreate.

### Export

`compositeLayers()` over the layers chosen by `settings.scope` — every visible layer by default,
or only the selected ones — → `canvasToBlob()` → `POST /upload/image` → `POST /prompt`. If nothing
chosen is visible the app falls back to all visible layers, so the button never sends an empty
canvas. The same bitmap is used for both modes, so what you see is what the model gets.

When a result comes back, `imageLayer()` draws it at (0,0) scaled to fill the canvas (aspect kept,
so a square generation is exactly 1:1), and can run `cutBackground()` first: it picks the most
common colour along the four edges and clears every border-connected pixel within a tolerance of
it. Interior whites survive because the flood cannot reach them without crossing the subject.

`GenSettings` carries every number that changes the output: steps, cfg, seed, seed lock,
control strength/end, width/height, model names (checkpoint, ControlNet, LoRA), quality mode,
ComfyUI URL. Defaults live in `store/useStore.ts`.

Model names are **discovered, not hardcoded**: on every connection check the store calls
`fetchModelLists()`, which reads `/object_info` for `CheckpointLoaderSimple`,
`ControlNetLoader` and `LoraLoader`. The lists feed the Settings dropdowns, and a name that
ComfyUI no longer reports is replaced with the first installed match (preferring `juggernaut`/
`sdxl` for checkpoints, `scribble`/`lineart`/`canny` for ControlNets, `lightning`/`lcm` for
LoRAs). With no LoRA installed, fast mode disables the LoRA node instead of failing.

## Generation flow

1. `generate()` in the store:
   - build the prompt and negative from the scene + text + preset,
   - render the canvas: `renderSketch` (black strokes and fills, no images) for ControlNet, or
     `renderComposite` (everything, including image objects) for img2img,
   - if `demoMode`, render locally and stop,
   - otherwise `uploadImage()` → `queue(buildWorkflow(...))` → `waitForImages(promptId)`.
2. `waitForImages` polls `GET /history/{id}` every 700 ms. A WebSocket connection only drives
   the progress bar; losing it does not break the generation.
3. The result image is loaded through `/comfy/view?...`, so the `<img>` is same-origin and can
   be downloaded as a blob.

## ComfyUI workflow node map

`buildWorkflow()` produces an API-format graph. Node ids are stable and documented here.

| Id | Class | Key inputs |
|---|---|---|
| 1 | `CheckpointLoaderSimple` | `ckpt_name` |
| 2 | `LoraLoader` | model/clip from 1, `lora_name`, strengths |
| 3 | `CLIPTextEncode` | positive text (clip from 2 or 1) |
| 4 | `CLIPTextEncode` | negative text (clip from 2 or 1) |
| 5 | `LoadImage` | uploaded sketch name |
| 6 | `ControlNetLoader` | `control_net_name` |
| 7 | `ControlNetApplyAdvanced` | positive 3, negative 4, control_net 6, image 5, strength, start, end |
| 8 | `EmptyLatentImage` | width, height, batch 1 |
| 9 | `KSampler` | model 2/1, positive 7, negative 7, latent 8, seed, steps, cfg, sampler, scheduler |
| 10 | `VAEDecode` | samples 9, vae 1 |
| 11 | `SaveImage` | images 10, `filename_prefix` |

Turning LoRA off re-points 9.model to `1:0` and both encoders' clip to `1:1`.

**img2img mode** replaces the ControlNet branch with:

| Id | Class | Key inputs |
|---|---|---|
| 12 | `VAEEncode` | pixels from node 5 (the canvas), vae from node 1 |

and the sampler takes `positive: 3`, `negative: 4`, `latent_image: 12`, `denoise: settings.denoise`
(0.05–1, default 0.65). Nodes 6, 7 and 8 are omitted. Image objects on the canvas only reach
the model in this mode, which is why the UI warns about it.

Sampler defaults: `dpmpp_sde` + `sgm_uniform`, cfg 1.5–2.0 with Lightning, 1.0 denoise.
See `COMFYUI.md` for the model files these names expect.

## Prompt pipeline

```text
shape ──► descriptor ──► sentence ─┐
  │        (kind, size, region)     ├──► scene text ──► final prompt
  └─────── label overrides kind ────┘         │
                                              ├── user text
                                              └── preset style
```

- Region words from the bounding-box centre (3×3 grid).
- Size words from the area fraction (large > 25 %, medium > 6 %, small).
- A shape's `label` replaces its noun: `circle + "sun"` → "a large sun in the top left".
- No shapes and no text → the preset's base sentence, so the button is never useless.

`buildPrompt()` is pure and unit-tested; it never touches the network.

## Error handling

| Failure | Behaviour |
|---|---|
| ComfyUI unreachable | Connection badge turns red, `genError` explains how to start it, demo mode stays available |
| `POST /prompt` returns `node_errors` | Error text includes the offending node ids |
| Execution error | Shown in the result panel with the ComfyUI message |
| 5 minute timeout | "Generation timed out" plus a hint to check the ComfyUI console |
| WebSocket fails | Progress bar falls back to a spinner; polling still finishes the job |

## Extension points

- **Inpainting (M3):** add a second workflow builder; the mask is the region the user painted
  over the previous result. `types.ts` gains an optional `baseImageUrl` on the settings.
- **Colour-map mode:** `renderSketch` already receives colours; add a mode that keeps them and
  swap the ControlNet to a segmentation model.
- **Backend:** put one HTTP service between the browser and ComfyUI when the app needs to run
  on another machine; only `comfy/client.ts` changes its base URL.
