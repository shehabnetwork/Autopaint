# Plan

## Goal

A local web tool where I draw a rough scene with simple shapes, write a short description,
press one button, and get a generated image that follows my layout.

The reference is Krea's sketch-to-image / Realtime canvas. The important part to copy is not
the live streaming; it is that **the drawing controls the composition**.

## Non-goals (for now)

- Live generation while drawing (rejected: a button is better here).
- Multi-user, accounts, auth, sharing, cloud deploy.
- Mobile layout as a first-class target.
- Video, upscaling, model training, LoRAs per project.
- FLUX.2 (too large for 16 GB). FLUX in general is a later experiment.

## Constraints (from the owner)

| Constraint | Decision |
|---|---|
| Hardware | RTX 5070 16 GB (or similar), plus an M6 Mac for development |
| Models | SDXL family only for v1. No FLUX.2. |
| Users | One, local. No authentication. |
| Response | Fast matters more than quality. 4–8 steps, 1024 px. |
| Interaction | Explicit Generate button. No live mode. |
| Input | Draw first. Editing an existing image comes after v1. |

## Milestones

### M0 — Prove the pipeline (done when the workflow file is agreed)
- [x] Decide model stack: SDXL + SDXL-Lightning LoRA + ControlNet Scribble.
- [x] Write the workflow in ComfyUI API format.
- [ ] Measure real seconds/image on the owner's GPU. (Owner step, documented in `COMFYUI.md`.)

### M1 — Vertical slice
- [x] Canvas with rectangle, ellipse, line, freehand, eraser, select/move.
- [x] Scene graph + undo/redo.
- [x] Prompt box, style presets, rule-based scene description.
- [x] ComfyUI client: upload sketch, queue workflow, poll result, show image.
- [x] Clear errors when ComfyUI is offline.
- [x] Demo renderer so the UI is usable without ComfyUI.

### M2 — Comfort
- [x] Seed control + seed lock + re-roll.
- [x] Settings panel (steps, cfg, control strength, size, model names).
- [x] Save/load project as JSON, autosave draft to localStorage.
- [x] Session gallery + download.
- [ ] Optional: local LLM prompt rewriting (Ollama).

### M3 — Edit an existing image
- [ ] Put the last result on the canvas and draw over it.
- [ ] Inpainting workflow: drawn region becomes a mask, SDXL inpainting checkpoint.
- [ ] Keep the project format backwards compatible.

### M4 — Nice to have
- [ ] Shift-drag to scale/rotate a shape.
- [ ] Colour-map mode (one colour = one class) for segmentation ControlNet.
- [ ] Persist gallery to disk.

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-16 | SDXL + Lightning + ControlNet Scribble, not FLUX | Best ControlNet ecosystem, fits 16 GB, 1–3 s at 1024 px |
| 2026-11-16 | No backend server | Single user, local. Vite proxy removes CORS. |
| 2026-11-16 | Button generation, no live mode | Owner's preference; removes most complexity |
| 2026-11-16 | React + Vite + Konva + Zustand | Konva gives hit testing and drag for free |
| 2026-11-16 | Rule-based prompt builder (no LLM in v1) | Works offline, predictable, zero cost |
| 2026-11-16 | Juggernaut XL v9 as the default checkpoint | Open download, strong photoreal results, fits 16 GB |
| 2026-11-16 | Model names discovered from `/object_info`, not hardcoded | Removes the "file name does not exist" failure mode |
| 2026-11-17 | Vector canvas: transforms, fills, pressure brushes, image objects, img2img | Owner asked for a canvas that a skilled illustrator can actually paint in |
| 2026-11-17 | Rotation stored per shape, applied about its own centre | One field rotates every shape type, including freehand strokes |
| 2026-11-17 | Z-order = array order | Undo, save/load and both renderers stay trivial |
| 2026-11-17 | Raster layers replace vector objects | Painting, erasing and blending need pixels; the auto layout description is gone with the shapes |
| 2026-11-16 | Inpainting instead of an edit model (Qwen/Kontext) | Fits in 16 GB, reuses the same checkpoint |

## Risks

| Risk | Mitigation |
|---|---|
| Owner's GPU is 12 GB, not 16 GB | SDXL still fits; only FLUX would be tight |
| Blackwell needs a recent PyTorch | Documented in `COMFYUI.md` |
| Scribble ControlNet ignores weak drawings | Prompt builder describes shapes; strength is adjustable |
| Model file names differ per install | Checkpoint / ControlNet / LoRA names are settings, not constants |
| ComfyUI offline during development | Demo renderer keeps the UI testable |
