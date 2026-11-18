# Web Image Generator — agent instructions

## What this is

A local, single-user paint app with an AI backend. You paint on raster layers, type a prompt,
press **Generate**, and ComfyUI returns an image on the right; you can drop that image back onto
the canvas as a layer. Two input modes: ControlNet (the painting is the layout) and img2img (the
painting is the starting image).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

ComfyUI must be running at `http://127.0.0.1:8188`. The dev server proxies `/comfy/*` to it,
so the browser never needs CORS. If ComfyUI is not running the app still starts and shows
"Offline" — generation then falls back to a clearly labelled local demo render, and the canvas
and prompt builder keep working.

```bash
npm run build      # production build into dist/
npm run preview    # serves dist/ with the same /comfy proxy
npm run typecheck  # tsc --noEmit
npm test           # vitest (prompt builder, workflow wiring, geometry)
```

There is also a headless end-to-end check (draws, types, generates, asserts the result):

```bash
npm run dev
chrome --headless=new --remote-debugging-port=9222 --window-size=1440,1000 --user-data-dir=%TEMP%\wig-cdp about:blank
npm run smoke
```

`COMFY_URL` (env) overrides the proxy target, default `http://127.0.0.1:8188`.

## Hard rules

- **One user, no auth.** Do not add accounts, sessions, tokens, or a database.
- **Button-triggered generation only.** Live/streaming mode was explicitly rejected. Do not
  add debounce-and-fire, job cancellation, or preview streams.
- **Pixels are the source of truth.** Each layer owns a 1024×1024 canvas in
  `src/layers/registry.ts`. Do not reintroduce retained vector objects — erasing, painting and
  layer compositing all assume a raster document.
- **Never expose ComfyUI to the network.** The app talks to it through the Vite proxy or
  `localhost` only.
- **Keep `src/comfy/workflow.ts` and the node table in `docs/ARCHITECTURE.md` in sync.**
- TypeScript strict. No `any` unless it is at the ComfyUI JSON boundary and commented.
- No new runtime dependencies without a line in `docs/PLAN.md` → Decisions.
- UI copy and docs in simple English. Arabic is fine in issues/chat, not in code comments.

## Map

| Path | Responsibility |
|---|---|
| `src/types.ts` | Layer, settings, result and project types. |
| `src/store/useStore.ts` | Zustand store: layers, active layer, pixel history, prompt, settings, results. |
| `src/layers/registry.ts` | Layer canvases, composite/export, cut region, PNG import. |
| `src/layers/paint.ts` | Brush dabs, stroke segments, shapes, eraser commit, flood fill. |
| `src/layers/imageLayer.ts` | Draw a generated image into a full-canvas layer. |
| `src/canvas/CanvasStage.tsx` | Konva stage, tools, layers preview, marquee and pixel move. |
| `src/components/LayersPanel.tsx` | Layer list and layer operations. |
| `src/lib/brush.ts` | Brush presets (size, opacity, softness, tip). |
| `src/lib/geometry.ts` | Rectangle helpers for selections. |
| `src/lib/prompt.ts` | Prompt text + preset style → prompt and negative prompt. |
| `src/lib/presets.ts` | Style presets (photo, anime, 3d, ...). |
| `src/lib/demo.ts` | Fake local render used when ComfyUI is offline. |
| `src/comfy/client.ts` | HTTP + WebSocket client (upload, queue, progress, results). |
| `src/comfy/workflow.ts` | Builds the ComfyUI API-format workflow from settings. |
| `src/components/*` | UI panels. No business logic beyond calling the store. |
| `scripts/smoke.mjs` | Headless Chrome end-to-end check over the DevTools Protocol. |
| `docs/` | Plan, features, architecture, ComfyUI setup. |

## Conventions

- One component per file, named exports are fine, default export only for `App`.
- Keep files under ~400 lines. Split before growing a file.
- CSS lives in `src/styles.css` (plain CSS + variables). No Tailwind, no CSS-in-JS.
- Every user-visible error goes through `setGenError` so the result panel can show it.
- Numbers that affect image output live in `GenSettings`, never hardcoded in components.

## Before you call it done

1. `npm run typecheck` passes.
2. `npm test` passes.
3. `npm run build` passes.
4. `npm run smoke` passes (when a dev server and Chrome with `--remote-debugging-port=9222` are running).
5. Manual check: draw a rectangle + circle, type a prompt, press Generate, and confirm either
   an image or a clear "ComfyUI offline" message appears.

## Gotchas found the hard way

- **Vite's file watcher goes stale on this machine.** Symptom: the browser runs old code (e.g.
  `ReferenceError: Line is not defined`) while the file on disk is correct. Restart `npm run dev`
  rather than debugging the component. `server.watch.ignored` already excludes `.dsh-tmp` and
  `dist`, which helps but does not eliminate it.
- One interaction = one `attachTracking()`: window `pointermove`/`pointerup`/`pointercancel`
  listeners are added on pointerdown and removed on the first up, so `handleEnd` runs exactly once.
- **Pointer events arrive faster than React renders.** Interaction data (scratch canvas, preview,
  marquee, floating selection) is mirrored into refs; reading the state value inside `onPointerUp`
  loses a one-move drag. Keep the ref mirrors.
- **Interactions listen on `window`, not only on the stage.** Ending a stroke on `pointerleave`
  breaks drawing past the canvas edge — that was a reported bug. `pointerleave` may hide the brush
  cursor, nothing else.
- A new/loaded document bumps `documentId`; the canvas uses it to drop a floating selection, since
  `newProject()` cannot reach component state.
- The brush cursor is drawn on the Konva layer and updated imperatively (`updateBrushCursor`), not
  through React state, because it moves on every pointermove.
- Drawn UI affordances live inside the scaled Konva layer, so their sizes are divided by the stage
  scale (`1.5 / scale` for a 1.5 px outline).
- `window.__wig` exposes the store and `window.__wigExport()` returns the flattened canvas as a
  PNG data URL. The smoke script drives pixels through them; keep both.
- ControlNet mode uploads the painting as-is. Scribble/lineart ControlNets want dark line art, so
  a full-colour painting belongs in img2img mode; do not "helpfully" binarise the canvas.
- ComfyUI 0.4x answers **403** to any request whose `Origin` is not its own, and browsers send
  `Origin` on POST. `vite.config.ts` rewrites it to the target origin; without that, upload and
  `/prompt` fail while `GET /system_stats` still works (so the badge says "online").
- `buildWorkflow` clamps steps/cfg/size: a corrupted draft (e.g. steps = 43883) otherwise makes
  ComfyUI reject the whole prompt with a validation error.
- `.right-rail > *` must stay `flex: 0 0 auto`, otherwise panels shrink and clip their content.
- Autosave stores one flattened PNG (localStorage cannot hold several 1024² layers); layers are
  only preserved by an explicit Save.
- ComfyUI temp files under the user's `%TEMP%` can be unreadable to sandboxed builds; point
  `TEMP`/`TMP` at a workspace folder when building in a restricted environment.
