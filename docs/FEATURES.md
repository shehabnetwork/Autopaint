# Features

Status: ✅ done · 🚧 partial · ⏳ planned

## Canvas

The canvas is a **raster** document: every tool paints pixels into the active layer, like a
paint program. There are no retained vector objects.

| Feature | Status | Notes |
|---|---|---|
| Brush | ✅ | Pressure-sensitive with a stylus; full width for a mouse |
| Eraser | ✅ | Erases pixels (`destination-out`), works over any colour |
| Line | ✅ | Drag to draw, stamped into the layer |
| Rectangle / ellipse | ✅ | Drag to size, optional fill |
| Bucket fill | ✅ | Flood fill with tolerance, on the active layer |
| Layers | ✅ | Add, duplicate, delete, reorder, rename, opacity, visibility, merge down, clear |
| Hide / show | ✅ | Eye icon on every layer row, plus a **Hide/Show** button that toggles the active layer or all selected layers at once |
| Multi-layer selection | ✅ | Click, Ctrl+click to add, Shift+click for a range; the panel shows "N selected" |
| Select and transform pixels | ✅ | Handles appear the moment the marquee is released: drag to move, corners to resize (Shift keeps the ratio), the ring just outside a corner or the handle above rotates freely (Shift snaps to 15°), and the bar flips H/V, rotates 90°, applies (Enter) or cancels (Esc) |
| Selection as a mask | ✅ | While a selection exists, brush, eraser, shapes and bucket only paint inside it |
| Deselect | ✅ | **Deselect** button in the bar, Escape, or clicking outside the floating piece; Apply (✓) commits and deselects |
| Draw past the edge | ✅ | A stroke keeps following the pointer outside the canvas and comes back with it; shapes and resizes work the same way |
| Cursors | ✅ | Brush/eraser shows a circle or square at the real brush size; resize, rotate and bucket cursors match the action |
| Undo / redo | ✅ | 10 pixel snapshots per layer operation |
| Brushes | ✅ | Ink, Pencil, Marker, Airbrush with size, opacity and softness |
| Brush tip | ✅ | Round or square end caps, stored per stroke |
| Colour | ✅ | 24-colour palette plus a system colour picker |
| Zoom / pan | ⏳ | Canvas is fixed at 1024², scaled to the window |

## Prompt and generation

| Feature | Status | Notes |
|---|---|---|
| Free text prompt | ✅ | Plus the preset's style words |
| Style presets | ✅ | Photo, Anime (tag style), 3D, Pencil, Oil, Architecture, None |
| Input mode | ✅ | **Layout (ControlNet)** sends the flattened canvas as the control image; **Image (img2img)** uses it as the starting image with a denoise slider |
| Generation scope | ✅ | Dropdown in the prompt panel: **All visible layers** (default) or **Selected layers only**, which sends just the highlighted ones |
| Cut flat background | ✅ | Option on the result panel: the border-connected background becomes transparent when the image is added to the canvas |
| Result placement | ✅ | “To canvas” and drag-drop scale the picture to fill the canvas from (0,0), so a 1024² generation lands 1:1 |
| ComfyUI connection check | ✅ | `GET /system_stats`, badge in the top bar |
| Model discovery | ✅ | Reads `/object_info`; Settings becomes dropdowns and stale names self-correct |
| Canvas upload | ✅ | `POST /upload/image` |
| Queue workflow | ✅ | `POST /prompt` |
| Progress | ✅ | WebSocket `progress` events |
| Result polling | ✅ | `GET /history/{id}` fallback, 5 min timeout |
| Seed lock / re-roll | ✅ | Lock keeps the last seed |
| Fast / quality mode | ✅ | 8 steps Lightning vs 25 steps plain |
| LoRA strength | ✅ | 0–1.5 slider |
| Demo renderer | ✅ | When ComfyUI is offline |

## Project and results

| Feature | Status | Notes |
|---|---|---|
| Autosave | ✅ | Flattened PNG + settings in localStorage (layers need an explicit Save) |
| Save / load project JSON | ✅ | Every layer as a PNG plus its name, opacity and visibility |
| Session gallery | ✅ | In memory, newest first |
| Delete a generation | ✅ | Trash button on the result, × on each thumbnail, 6-second undo |
| Image → layer | ✅ | “To canvas” or drag onto the canvas opens the result as its own layer |
| Download image | ✅ | Fetched as a blob, saved locally |
| Persist gallery to disk | ⏳ | M4 |

## Verification

| Check | Status | Notes |
|---|---|---|
| Unit tests | ✅ | 27 tests: prompt, geometry and rotation helpers, brushes, workflow (both modes), model lists |
| Typecheck | ✅ | `tsc --noEmit` |
| Production build | ✅ | ~615 kB JS, 14 kB CSS |
| Headless end-to-end | ✅ | 46 checks: paint, undo/redo, layers, multi-layer selection, scope default and override, hide/show, visibility, erase, bucket, drag outside the canvas, selection transform (move/flip/rotate/resize/Shift), cursors, mask clipping, deselect, scoped generation, background cut, full-canvas placement, real generation, image → layer |
| Real ComfyUI generation | ✅ | ComfyUI 0.42 + Juggernaut XL v9 + scribble ControlNet + Lightning LoRA on an RTX 5070 Ti |
