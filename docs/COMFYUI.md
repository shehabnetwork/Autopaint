# ComfyUI setup

The app expects a local ComfyUI at `http://127.0.0.1:8188`. It does not install or manage it.

## 1. Install ComfyUI

```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
python -m venv venv
venv\Scripts\activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

The CUDA 12.8 wheels matter on RTX 50-series (Blackwell). An older PyTorch will not see the
card at all, and ComfyUI will silently fall back to CPU.

## 2. Model files

Put each file in the folder shown, then set the matching name in the app's Settings panel
(names must match exactly, including extension).

| File | Folder | Notes |
|---|---|---|
| SDXL checkpoint, e.g. `sd_xl_base_1.0.safetensors` or a merge like `juggernautXL_v9.safetensors` | `models/checkpoints` | Any SDXL 1.0 checkpoint works |
| Scribble ControlNet for SDXL, e.g. `controlnet-scribble-sdxl-1.0.safetensors` | `models/controlnet` | Use the SDXL version, not the SD1.5 one |
| SDXL-Lightning 8-step LoRA, e.g. `sdxl_lightning_8step_lora.safetensors` | `models/loras` | Optional but it is what makes 8 steps look good |
| SDXL inpainting checkpoint (M3 only) | `models/checkpoints` | Later |

Alternative ControlNets that also work with the same sketch: `lineart`, `canny`, `softedge`.
Switch the ControlNet file in Settings; the graph does not change.

## 3. Start it

```bash
python main.py --enable-cors-header
```

`--enable-cors-header` is only needed if you point the app at an absolute URL instead of the
built-in `/comfy` proxy. Without it, keep the default proxy URL.

## 4. Check it from the app

Click the connection badge in the top bar. It calls `GET /system_stats` and shows the ComfyUI
version, or the error. You can also check by hand:

```bash
curl http://127.0.0.1:8188/system_stats
```

## 5. What the app sends

| Step | Request |
|---|---|
| Upload | `POST /upload/image` — multipart, field `image`, `overwrite=true` |
| Queue | `POST /prompt` — `{ "prompt": <graph>, "client_id": "<uuid>" }` |
| Progress | `WS /ws?clientId=<uuid>` — `progress`, `executing`, `execution_error` |
| Result | `GET /history/<prompt_id>` → `outputs.<node>.images[]` |
| Image | `GET /view?filename=…&subfolder=…&type=output` |

All of these are proxied through `/comfy` by the Vite dev server and preview server.

## 6. Measured timings (RTX 5070 Ti 16 GB, 1024×1024)

| Mode | Steps | Measured |
|---|---|---|
| Fast (Lightning), first run | 8 | ~11 s (checkpoint load into VRAM) |
| Fast (Lightning), warm | 8 | ~5 s in ComfyUI, ~6 s click-to-image |
| Quality (no LoRA) | 25 | ~10–15 s |

These are real numbers from Juggernaut XL v9 + scribble ControlNet + Lightning 8-step LoRA.
If you are far outside them, check that `/system_stats` reports the GPU and not the CPU, and
that the checkpoint is fp16 rather than fp32.

## 7. Using a different checkpoint (Illustrious, NoobAI, any SDXL)

The workflow is not tied to one checkpoint. Anything SDXL 1.0 works: Illustrious XL, NoobAI-XL,
Pony, RealVis, Juggernaut. Illustrious and NoobAI are SDXL finetunes with the same UNet, VAE and
text encoders, so the graph does not change.

1. Put the `.safetensors` into `models/checkpoints` (Illustrious: `OnomaAIResearch/Illustrious-xl-early-release-v0`
   or `Jommarn/Illustrious-XL-v2.0`; anime-tag alternative: `Laxhar/noobai-XL-1.1`).
2. In the app, open **Settings → Refresh models**, then pick it in the **Checkpoint** dropdown.
3. Pick **Anime** as the style preset — it adds `masterpiece, best quality` and a booru-style
   negative prompt, which these models expect.
4. Tune the speed/quality trade-off:

| Checkpoint | Quality mode | Steps / CFG | Lightning LoRA |
|---|---|---|---|
| Photoreal (Juggernaut, RealVis) | Fast | 8 / 1.5 | on, strength 1.0 |
| Anime finetune (Illustrious, NoobAI) | Quality | 24–28 / 5–7 | off, or on at 0.6 for speed |
| Any model with washed-out colours | Quality | 25 / 6.5 | off |

Why: Lightning is trained on SDXL base. On a heavily finetuned anime model it often destroys
colour and contrast. If you want the speed, keep it on and drop **LoRA strength** to 0.5–0.8
instead of switching it off.

SDXL ControlNets do work on finetunes, but a ControlNet published specifically for Illustrious
(or a union ControlNet) follows the sketch more obediently. Drop it in `models/controlnet` and
select it in Settings; the graph is unchanged.

Licences: Illustrious and NoobAI ship their own model licences, separate from SDXL. Check them
before any commercial use.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `HTTP 403` on generate | ComfyUI rejects requests whose `Origin` is not its own. Use the `/comfy` proxy (it rewrites `Origin`); an absolute URL needs `--enable-cors-header` |
| Badge stays offline | ComfyUI not running, or not on 8188. Start it and click the badge again. |
| `node_errors` mentions a missing file | The checkpoint / ControlNet / LoRA name in Settings does not match `models/…` |
| Image ignores the drawing | Raise Control strength (0.8–1.0) and lower cfg; make strokes thicker |
| Image looks burnt with Lightning | cfg 1.0–1.5, or switch to quality mode |
| WebSocket errors in the console | Harmless; polling still completes the job |
| Out of VRAM | Lower the size to 768, close other GPU apps, or use `--lowvram` |
| CORS error | You are using an absolute URL without `--enable-cors-header`; use `/comfy` instead |
