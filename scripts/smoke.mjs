/**
 * Headless smoke test. Drives the real app in Chrome through the DevTools Protocol:
 * paints pixels, uses layers, undo/redo, the eraser, the bucket, the move tool, then generates.
 *
 * Usage:
 *   1) npm run dev                                  (or npm run preview)
 *   2) chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *   3) npm run smoke
 *
 * Exits non-zero on the first failed check. No dependencies: Node 22+ has fetch and WebSocket.
 */
const CDP_URL = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Auto-detect: with ComfyUI reachable the app generates for real, otherwise it falls back. */
async function detectRealGeneration() {
  if (process.env.SMOKE_REAL === '1') return true;
  if (process.env.SMOKE_DEMO === '1') return false;
  try {
    const response = await fetch(new URL('comfy/system_stats', APP_URL), { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function connect() {
  const targets = await (await fetch(`${CDP_URL}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target. Start Chrome with --remote-debugging-port=9222.');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Cannot open the DevTools socket.'));
  });

  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(message.params.exceptionDetails.text ?? 'exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1);
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed');
    }
    return result.result.value;
  };

  return { send, evaluate, consoleErrors, close: () => socket.close() };
}

/** Poll an expression until it is truthy; Vite can be cold on the first page load. */
async function waitFor(evaluate, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  return false;
}

async function main() {
  const REAL_GENERATION = await detectRealGeneration();
  console.log(`mode: ${REAL_GENERATION ? 'real ComfyUI generation' : 'offline demo render'}`);

  const { send, evaluate, consoleErrors, close } = await connect();
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });

    const mounted = await waitFor(evaluate, `Boolean(document.querySelector('.workspace'))`);
    check('app mounts', mounted);
    if (!mounted) throw new Error('The app did not mount; stopping.');

    await evaluate(`localStorage.removeItem('wig:draft.v2'); location.reload(); true`);
    const remounted = await waitFor(evaluate, `Boolean(document.querySelector('.workspace'))`);
    check('app remounts with an empty project', remounted && (await evaluate(`window.__wig.getState().layers.length`)) === 1);

    const box = await evaluate(`(() => {
      const paper = document.querySelector('.paper');
      const r = paper.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, viewport: { w: innerWidth, h: innerHeight } };
    })()`);
    check('canvas is present', Boolean(box), box ? `${Math.round(box.w)}x${Math.round(box.h)}` : '');
    check(
      'canvas is fully inside the viewport',
      box.y >= 0 && box.y + box.h <= box.viewport.h + 1 && box.x >= 0,
      `y=${Math.round(box.y)} h=${Math.round(box.h)}`,
    );
    if (box.y < 0) throw new Error('Canvas is off-screen; run Chrome with a larger --window-size.');

    const scale = box.w / 1024;
    const toScreen = (x, y) => ({ x: box.x + x * scale, y: box.y + y * scale });

    const dragPx = async (fromX, fromY, toX, toY, steps = 8, modifiers = 0) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1, modifiers });
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: fromX + (toX - fromX) * t,
          y: fromY + (toY - fromY) * t,
          button: 'left',
          buttons: 1,
          modifiers,
        });
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1, modifiers });
      await sleep(150);
    };

    const dragLogical = async (fromX, fromY, toX, toY, steps = 10) => {
      const a = toScreen(fromX, fromY);
      const b = toScreen(toX, toY);
      await dragPx(a.x, a.y, b.x, b.y, steps);
    };

    const paint = async (points, color, size) => {
      await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('${color}'); s.setStrokeWidth(${size}); s.setTool('brush'); return true; })()`);
      const first = toScreen(points[0][0], points[0][1]);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: first.x, y: first.y, button: 'left', clickCount: 1 });
      for (let i = 1; i < points.length; i += 1) {
        const p = toScreen(points[i][0], points[i][1]);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 });
      }
      const last = toScreen(points[points.length - 1][0], points[points.length - 1][1]);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', clickCount: 1 });
      await sleep(250);
    };

    const exportPng = () => evaluate(`window.__wigExport()`);
    const store = (expression) => evaluate(`(() => { const s = window.__wig.getState(); return ${expression}; })()`);
    const pixel = (x, y) =>
      evaluate(`(async () => {
        const image = new Image();
        image.src = window.__wigExport();
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const d = ctx.getImageData(${x}, ${y}, 1, 1).data;
        return [d[0], d[1], d[2]];
      })()`);
    const isRed = (rgb) => rgb[0] > 150 && rgb[1] < 120 && rgb[2] < 120;

    // ---------- painting ----------
    const blank = await exportPng();
    check('canvas starts blank', typeof blank === 'string' && blank.startsWith('data:image/png'), `${blank.length} chars`);

    await paint(
      [
        [200, 700],
        [350, 520],
        [500, 700],
        [650, 520],
        [800, 700],
      ],
      '#3e63dd',
      26,
    );
    const painted = await exportPng();
    check('painting changes pixels', painted !== blank, `${painted.length} chars`);

    await evaluate(`window.__wig.getState().undo(); true`);
    await sleep(200);
    const undone = await exportPng();
    check('undo clears the stroke', undone === blank);

    await evaluate(`window.__wig.getState().redo(); true`);
    await sleep(200);
    const redone = await exportPng();
    check('redo brings it back', redone === painted);

    // ---------- layers ----------
    await evaluate(`(() => { const s = window.__wig.getState(); s.addLayer('Second'); s.setTool('rect'); s.setFillShapes(true); s.setColor('#fbbf24'); return true; })()`);
    await sleep(200);
    await dragLogical(560, 560, 820, 780);
    const withSecond = await exportPng();
    const layerCount = await store('s.layers.length');
    check('a second layer is added and paints', layerCount === 2 && withSecond !== redone, `${layerCount} layers`);

    const secondId = await store('s.layers[1].id');
    await evaluate(`window.__wig.getState().setLayerVisible('${secondId}', false); true`);
    await sleep(200);
    const hidden = await exportPng();
    check('hiding a layer removes its pixels', hidden === redone);

    await evaluate(`window.__wig.getState().setLayerVisible('${secondId}', true); true`);
    await evaluate(`window.__wig.getState().setActiveLayer('${secondId}'); true`);
    await sleep(200);

    // ---------- eraser ----------
    await evaluate(`(() => { const s = window.__wig.getState(); s.setTool('eraser'); s.setStrokeWidth(80); return true; })()`);
    await dragLogical(600, 600, 700, 700);
    const erased = await exportPng();
    check('the eraser removes pixels', erased !== withSecond);

    // ---------- bucket ----------
    await evaluate(`window.__wig.getState().undo(); true`);
    await sleep(150);
    await evaluate(`window.__wig.getState().addLayer('Fill'); true`);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setTool('bucket'); s.setColor('#12a594'); s.setStrokeWidth(10); return true; })()`);
    const fillPoint = toScreen(400, 300);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fillPoint.x, y: fillPoint.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fillPoint.x, y: fillPoint.y, button: 'left', clickCount: 1 });
    await sleep(600);
    const filled = await exportPng();
    check('the bucket fills an area', filled !== erased);

    // ---------- move tool ----------
    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(120); s.setTool('brush'); return true; })()`);
    const moveDot = toScreen(450, 350);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: moveDot.x, y: moveDot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: moveDot.x, y: moveDot.y, button: 'left', clickCount: 1 });
    await sleep(300);

    await evaluate(`window.__wig.getState().setTool('move'); true`);
    await dragLogical(300, 250, 600, 450);
    const selection = await store('s.selection');
    check('marquee selects the area', Boolean(selection && selection.width > 50), JSON.stringify(selection));
    check(
      'handles appear right after the selection',
      await evaluate(`Boolean(document.querySelector('.transform-bar'))`),
    );

    const beforeMove = await exportPng();
    await dragLogical(450, 350, 700, 600);
    await evaluate(`document.querySelector('.transform-bar button.primary').click()`);
    await sleep(300);
    const afterMove = await exportPng();
    const movedTo = await pixel(700, 600);
    const leftBehind = await pixel(450, 350);
    check(
      'dragging the selection moves pixels',
      afterMove !== beforeMove && isRed(movedTo) && !isRed(leftBehind),
      `${JSON.stringify(movedTo)} / ${JSON.stringify(leftBehind)}`,
    );

    // ---------- selection transforms ----------
    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);

    // A single red dot on the left half.
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(120); s.setTool('brush'); return true; })()`);
    const dot = toScreen(250, 500);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dot.x, y: dot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dot.x, y: dot.y, button: 'left', clickCount: 1 });
    await sleep(300);
    check('a red dot is painted', isRed(await pixel(250, 500)), JSON.stringify(await pixel(250, 500)));

    await evaluate(`window.__wig.getState().setTool('move'); true`);
    await dragLogical(150, 400, 650, 800);
    const dotBox = await store('s.selection');
    check('marquee selects the dot area', Boolean(dotBox && dotBox.width > 400), JSON.stringify(dotBox));

    // Click inside the selection to lift it into a floating transform.
    const inside = toScreen(400, 600);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: inside.x, y: inside.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: inside.x, y: inside.y, button: 'left', clickCount: 1 });
    await sleep(250);
    const barVisible = await evaluate(`Boolean(document.querySelector('.transform-bar'))`);
    check('lifting a selection shows the transform bar', barVisible);

    // Flip horizontally, then apply.
    await evaluate(`document.querySelectorAll('.transform-bar button')[0].click()`);
    await sleep(150);
    await evaluate(`document.querySelector('.transform-bar button.primary').click()`);
    await sleep(300);
    const flippedLeft = await pixel(250, 500);
    const flippedRight = await pixel(550, 500);
    check('flip horizontal moves the pixels', !isRed(flippedLeft) && isRed(flippedRight), `${JSON.stringify(flippedLeft)} → ${JSON.stringify(flippedRight)}`);

    // Rotate 90°: clear the old selection first, otherwise the drag would lift it again.
    await evaluate(`window.__wig.getState().setSelection(null); true`);
    await sleep(100);
    await dragLogical(150, 400, 650, 800);
    const inside2 = toScreen(400, 600);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: inside2.x, y: inside2.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: inside2.x, y: inside2.y, button: 'left', clickCount: 1 });
    await sleep(250);
    await evaluate(`document.querySelectorAll('.transform-bar button')[2].click()`);
    await sleep(150);
    await evaluate(`document.querySelectorAll('.transform-bar button.primary')[0].click()`);
    await sleep(300);
    // The dot sat at (550,500); a 90° turn about the box centre (400,600) lands it at (500,750).
    const rotated = await pixel(500, 750);
    check('rotate 90° moves the pixels', isRed(rotated), JSON.stringify(rotated));

    // Resize from a corner handle.
    const redCount = () =>
      evaluate(`(async () => {
        const image = new Image();
        image.src = window.__wigExport();
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 1024, 1024).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) count += 1;
        }
        return count;
      })()`);

    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(120); s.setTool('brush'); return true; })()`);
    const dot2 = toScreen(250, 500);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dot2.x, y: dot2.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dot2.x, y: dot2.y, button: 'left', clickCount: 1 });
    await sleep(300);

    const beforeResize = await redCount();
    await evaluate(`window.__wig.getState().setTool('move'); true`);
    await dragLogical(180, 430, 320, 570);
    const liftAt = toScreen(250, 500);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: liftAt.x, y: liftAt.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: liftAt.x, y: liftAt.y, button: 'left', clickCount: 1 });
    await sleep(250);

    const se = toScreen(320, 570);
    const seTo = toScreen(520, 770);
    await dragPx(se.x, se.y, seTo.x, seTo.y, 8);
    await sleep(150);
    await evaluate(`document.querySelector('.transform-bar button.primary').click()`);
    await sleep(350);
    const afterResize = await redCount();
    check('dragging a corner handle enlarges the selection', afterResize > beforeResize * 1.8, `${beforeResize} → ${afterResize} red px`);

    // ---------- shift keeps the aspect ratio ----------
    const redBox = () =>
      evaluate(`(async () => {
        const image = new Image();
        image.src = window.__wigExport();
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 1024, 1024).data;
        let minX = 1024, minY = 1024, maxX = 0, maxY = 0;
        for (let y = 0; y < 1024; y += 1) {
          for (let x = 0; x < 1024; x += 1) {
            const i = (y * 1024 + x) * 4;
            if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        return maxX > 0 ? { width: maxX - minX + 1, height: maxY - minY + 1 } : null;
      })()`);

    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(120); s.setTool('brush'); return true; })()`);
    const dot3 = toScreen(250, 500);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dot3.x, y: dot3.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dot3.x, y: dot3.y, button: 'left', clickCount: 1 });
    await sleep(300);

    await evaluate(`window.__wig.getState().setTool('move'); true`);
    await dragLogical(180, 430, 320, 570);
    const seShift = toScreen(320, 570);
    const seShiftTo = toScreen(620, 610);
    await dragPx(seShift.x, seShift.y, seShiftTo.x, seShiftTo.y, 8, 8);
    await sleep(150);
    await evaluate(`document.querySelector('.transform-bar button.primary').click()`);
    await sleep(350);
    const shifted = await redBox();
    const aspect = shifted ? shifted.width / shifted.height : 0;
    check('shift resize keeps the aspect ratio', Math.abs(aspect - 1) < 0.15, `${JSON.stringify(shifted)} aspect ${aspect.toFixed(2)}`);

    // ---------- drawing continues outside the canvas ----------
    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(40); s.setTool('brush'); return true; })()`);
    const startEdge = toScreen(900, 300);
    const outside = toScreen(1150, 300);
    const backInside = toScreen(900, 700);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startEdge.x, y: startEdge.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: outside.x, y: outside.y, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: backInside.x, y: backInside.y, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: backInside.x, y: backInside.y, button: 'left', clickCount: 1 });
    await sleep(400);
    // The stroke should have carried on after leaving: the return leg crosses (960, 600).
    const resumed = await pixel(960, 600);
    check('painting continues after leaving the canvas', isRed(resumed), JSON.stringify(resumed));

    // ---------- cursors ----------
    await evaluate(`window.__wig.getState().setTool('brush'); true`);
    await sleep(150);
    const brushCursor = await evaluate(`document.querySelector('.paper > div').style.cursor`);
    check('the brush hides the system cursor (a size cursor is drawn)', brushCursor === 'none', brushCursor);
    await evaluate(`window.__wig.getState().setTool('bucket'); true`);
    await sleep(150);
    const bucketCursor = await evaluate(`document.querySelector('.paper > div').style.cursor`);
    check('the bucket uses a distinct cursor', bucketCursor !== 'none', bucketCursor);

    // ---------- selection as a mask, and deselecting ----------
    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`window.__wig.getState().setTool('move'); true`);
    await dragLogical(200, 200, 600, 600);
    await sleep(250);

    const barRect = await evaluate(`(() => {
      const bar = document.querySelector('.transform-bar');
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      return { bottom: r.bottom, top: r.top };
    })()`);
    const handleY = await evaluate(`(() => {
      const paper = document.querySelector('.paper').getBoundingClientRect();
      return paper.y + 200 * (paper.width / 1024) - 28;
    })()`);
    check(
      'the transform bar clears the rotate handle',
      Boolean(barRect) && barRect.bottom < handleY - 2,
      `${barRect?.bottom?.toFixed(0)} < ${handleY.toFixed(0)}`,
    );

    await evaluate(`window.__wig.getState().setTool('brush'); true`);
    await sleep(200);
    check(
      'a kept selection offers a Deselect button',
      await evaluate(`Boolean(document.querySelector('.transform-bar button.deselect'))`),
    );

    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(60); return true; })()`);
    await dragLogical(100, 400, 900, 400);
    await sleep(300);
    const insideMask = await pixel(400, 400);
    const outsideMask = await pixel(150, 400);
    check(
      'painting is clipped to the selection',
      isRed(insideMask) && !isRed(outsideMask),
      `${JSON.stringify(insideMask)} / ${JSON.stringify(outsideMask)}`,
    );

    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
    await sleep(150);
    check('Escape clears the selection', (await store('s.selection')) === null);

    await dragLogical(120, 400, 260, 400);
    await sleep(250);
    const afterDeselect = await pixel(150, 400);
    check('painting works outside after deselect', isRed(afterDeselect), JSON.stringify(afterDeselect));

    // ---------- generation ----------
    await evaluate(`(() => {
      const input = document.querySelector('.prompt-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'a moody landscape, dramatic light');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(150);

    const layersBeforeGeneration = await store('s.layers.length');
    await evaluate(`document.querySelector('.generate').click()`);

    let result = null;
    const attempts = REAL_GENERATION ? 960 : 40;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      result = await evaluate(`(() => {
        const img = document.querySelector('.result-image');
        return img ? { src: img.src.slice(0, 60), complete: img.complete, width: img.naturalWidth } : null;
      })()`);
      if (result && result.complete && result.width > 0) break;
      await sleep(250);
    }

    check('a result image is shown', Boolean(result), result ? `${result.width}px wide` : 'none');
    if (REAL_GENERATION) {
      check('the image came from ComfyUI', Boolean(result) && result.src.includes('/comfy/view'), result ? result.src : '');
    } else {
      check('demo render used while ComfyUI is offline', Boolean(result) && result.src.startsWith('data:image'));
    }

    // ---------- image back to canvas ----------
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.result-actions button')].find((b) => b.textContent.includes('To canvas'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await sleep(1200);
    const layersAfterImage = await store('s.layers.length');
    check('a generation becomes a layer', layersAfterImage === layersBeforeGeneration + 1, `${layersAfterImage} layers`);

    // ---------- generate from selected layers only ----------
    const sampleGenerated = (x, y) =>
      evaluate(`(async () => {
        const url = window.__wig.getState().results[0].canvasDataUrl;
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const d = ctx.getImageData(${x}, ${y}, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      })()`);
    const isBlue = (rgb) => rgb[2] > 150 && rgb[0] < 120;
    const isOpaqueWhite = (rgb) => rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240;

    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);

    // Blue on layer 1
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#3e63dd'); s.setStrokeWidth(140); s.setTool('brush'); return true; })()`);
    const blueDot = toScreen(300, 300);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: blueDot.x, y: blueDot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: blueDot.x, y: blueDot.y, button: 'left', clickCount: 1 });
    await sleep(250);

    // Red on a second layer
    await evaluate(`window.__wig.getState().addLayer('Second'); true`);
    await sleep(150);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(140); return true; })()`);
    const redDot = toScreen(700, 700);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: redDot.x, y: redDot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: redDot.x, y: redDot.y, button: 'left', clickCount: 1 });
    await sleep(250);

    await evaluate(`(() => { const s = window.__wig.getState(); s.selectLayer(s.layers[0].id); return true; })()`);
    await sleep(150);
    check('a layer selection can be narrowed', (await store('s.selectedLayerIds.length')) === 1);
    check(
      'layer scope defaults to all layers',
      (await evaluate(`document.querySelector('[aria-label="Layer scope"]').value`)) === 'all',
    );

    const waitForNewResult = async (previous) => {
      for (let attempt = 0; attempt < (REAL_GENERATION ? 960 : 40); attempt += 1) {
        if ((await store('s.results.length')) > previous) return true;
        await sleep(250);
      }
      return false;
    };

    // Default scope: both layers are sent even though only one is selected.
    let count = await store('s.results.length');
    await evaluate(`document.querySelector('.generate').click()`);
    await waitForNewResult(count);
    await sleep(400);
    const allBlue = await sampleGenerated(300, 300);
    const allRed = await sampleGenerated(700, 700);
    check(
      'the default scope sends every visible layer',
      isBlue(allBlue) && isRed(allRed),
      `${JSON.stringify(allBlue)} / ${JSON.stringify(allRed)}`,
    );

    // Switch to selected-only and generate again.
    await evaluate(`(() => {
      const select = document.querySelector('[aria-label="Layer scope"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'selected');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(200);
    check(
      'the UI states the generation scope',
      await evaluate(`document.body.innerText.includes('Generating from 1 of 2 layers')`),
    );

    count = await store('s.results.length');
    await evaluate(`document.querySelector('.generate').click()`);
    await waitForNewResult(count);
    await sleep(400);
    const selBlue = await sampleGenerated(300, 300);
    const selRed = await sampleGenerated(700, 700);
    check(
      'the selected scope sends only the selected layer',
      isBlue(selBlue) && !isRed(selRed) && isOpaqueWhite(selRed),
      `${JSON.stringify(selBlue)} / ${JSON.stringify(selRed)}`,
    );

    // ---------- cutting the flat background ----------
    await evaluate(`(() => { const box = [...document.querySelectorAll('label.checkbox')].find(l => l.textContent.includes('Cut the flat background')); return Boolean(box); })()`);
    check(
      'a cut-background option is offered',
      await evaluate(`[...document.querySelectorAll('label.checkbox')].some((l) => l.textContent.includes('Cut the flat background'))`),
    );

    const cut = await evaluate(`(async () => {
      const source = document.createElement('canvas');
      source.width = 40;
      source.height = 40;
      const ctx = source.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 40, 40);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(10, 10, 20, 20);
      const out = await window.__wigCutBackground(source.toDataURL());
      const image = new Image();
      image.src = out;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const target = canvas.getContext('2d');
      target.drawImage(image, 0, 0);
      return {
        corner: target.getImageData(2, 2, 1, 1).data[3],
        centre: target.getImageData(20, 20, 1, 1).data[3],
      };
    })()`);
    check(
      'the cut clears the white border and keeps the subject',
      cut.corner === 0 && cut.centre === 255,
      JSON.stringify(cut),
    );

    // ---------- imported results fill the canvas from 0,0 ----------
    await evaluate(`window.__wig.getState().setCutBackground(false); true`);
    await evaluate(`(async () => {
      const source = document.createElement('canvas');
      source.width = 100;
      source.height = 100;
      const ctx = source.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 50, 100);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(50, 0, 50, 100);
      const state = window.__wig.getState();
      const id = 'placement-test';
      window.__wig.setState({
        results: [{
          id,
          imageUrl: source.toDataURL(),
          prompt: 'placement',
          negative: '',
          seed: 1,
          createdAt: Date.now(),
          source: 'demo',
          canvasDataUrl: '',
          settings: state.settings,
        }],
        activeResultId: id,
      });
      return id;
    })()`);
    await sleep(300);
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.result-actions button')].find((b) => b.textContent.includes('To canvas'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await sleep(900);

    const cornerLeft = await pixel(10, 512);
    const cornerRight = await pixel(1014, 512);
    const topLeft = await pixel(4, 4);
    check(
      'an imported result fills the canvas from 0,0',
      cornerLeft[0] > 200 && cornerLeft[2] < 80 && cornerRight[2] > 200 && cornerRight[0] < 80 && topLeft[0] > 200,
      `${JSON.stringify(cornerLeft)} / ${JSON.stringify(cornerRight)} / ${JSON.stringify(topLeft)}`,
    );

    // ---------- hide / show layers ----------
    await evaluate(`window.__wig.getState().newProject(); true`);
    await sleep(200);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#e5484d'); s.setStrokeWidth(140); s.setTool('brush'); return true; })()`);
    const hideDot = toScreen(400, 400);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hideDot.x, y: hideDot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hideDot.x, y: hideDot.y, button: 'left', clickCount: 1 });
    await sleep(250);
    await evaluate(`window.__wig.getState().addLayer('Second'); true`);
    await sleep(150);
    await evaluate(`(() => { const s = window.__wig.getState(); s.setColor('#3e63dd'); return true; })()`);
    const showDot = toScreen(700, 700);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: showDot.x, y: showDot.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: showDot.x, y: showDot.y, button: 'left', clickCount: 1 });
    await sleep(250);

    const clickLayerButton = (label) =>
      evaluate(`(() => {
        const button = [...document.querySelectorAll('.layer-toolbar button')].find((b) => b.textContent.trim().startsWith('${label}'));
        if (!button) return false;
        button.click();
        return true;
      })()`);

    check('there is a hide-layer button', await clickLayerButton('Hide'));
    await sleep(250);
    const layerHidden = await store(`s.layers.find((l) => l.name === 'Second').visible`);
    const hiddenPixel = await pixel(700, 700);
    check('the hide button hides the selected layer', layerHidden === false && !isBlue(hiddenPixel), `${layerHidden} / ${JSON.stringify(hiddenPixel)}`);

    check('the same button shows it again', await clickLayerButton('Show'));
    await sleep(250);
    const shown = await store(`s.layers.find((l) => l.name === 'Second').visible`);
    const shownPixel = await pixel(700, 700);
    check('the layer comes back', shown === true && isBlue(shownPixel), `${shown} / ${JSON.stringify(shownPixel)}`);

    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    const failed = checks.filter((item) => !item.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exitCode = failed.length === 0 ? 0 : 1;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(`SMOKE FAILED: ${error.message}`);
  process.exitCode = 1;
});
