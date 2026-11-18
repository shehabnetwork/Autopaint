import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { Image as KonvaImage, Circle, Ellipse, Group, Layer, Line, Rect, Stage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { CANVAS_SIZE } from '../types';
import type { PixelBounds, Tool } from '../types';
import { useStore } from '../store/useStore';
import { brushSoftness } from '../lib/brush';
import {
  clampToCanvas,
  isMeaningfulRect,
  rectFromPoints,
  rotatePoint,
  rotatedBounds,
} from '../lib/geometry';
import type { Point } from '../lib/geometry';
import {
  commitStroke,
  drawEllipse,
  drawLine,
  drawRect,
  floodFill,
  paintDot,
  paintSegment,
  strokeWidth,
} from '../layers/paint';
import type { PaintStyle } from '../layers/paint';
import { createLayerCanvas, cutRegion, getLayerCanvas } from '../layers/registry';
import { imageLayer } from '../layers/imageLayer';

interface PreviewShape {
  kind: Extract<Tool, 'line' | 'rect' | 'ellipse'>;
  a: Point;
  b: Point;
}

/** A lifted selection that can be moved, resized, rotated and flipped before it is stamped back. */
interface FloatingPiece {
  canvas: HTMLCanvasElement;
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  origin: PixelBounds;
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';
type TransformMode = 'move' | 'resize' | 'rotate';

const MIN_SIZE = 8;
/** How far outside a corner the rotate zone sits, in screen pixels. */
const CORNER_ROTATE_GAP = 16;

export function CanvasStage() {
  const layers = useStore((state) => state.layers);
  const activeLayerId = useStore((state) => state.activeLayerId);
  const layerVersion = useStore((state) => state.layerVersion);
  const documentId = useStore((state) => state.documentId);
  const tool = useStore((state) => state.tool);
  const brush = useStore((state) => state.brush);
  const tip = useStore((state) => state.tip);
  const color = useStore((state) => state.color);
  const strokeSize = useStore((state) => state.strokeWidth);
  const opacity = useStore((state) => state.opacity);
  const fillShapes = useStore((state) => state.fillShapes);
  const selection = useStore((state) => state.selection);
  const setSelection = useStore((state) => state.setSelection);
  const beginHistory = useStore((state) => state.beginHistory);
  const commitHistory = useStore((state) => state.commitHistory);
  const discardHistory = useStore((state) => state.discardHistory);
  const bumpLayer = useStore((state) => state.bumpLayer);
  const addLayer = useStore((state) => state.addLayer);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const lastRef = useRef<{ point: Point; pressure: number } | null>(null);
  const modeRef = useRef<TransformMode | null>(null);
  const cornerRef = useRef<Corner | null>(null);
  const dragStartRef = useRef<{
    point: Point;
    cx: number;
    cy: number;
    width: number;
    height: number;
    rotation: number;
    angle: number;
  } | null>(null);
  const trackingRef = useRef(false);

  // Interaction data lives in refs: pointerdown -> pointerup can arrive inside one React batch,
  // so reading state there would miss what the previous event just set.
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<PreviewShape | null>(null);
  const marqueeRef = useRef<{ a: Point; b: Point } | null>(null);
  const floatingRef = useRef<FloatingPiece | null>(null);

  // Brush cursor drawn on the canvas: white underlay + dark outline reads on any colour.
  const cursorGroupRef = useRef<Konva.Group | null>(null);
  const cursorCircleRef = useRef<Konva.Circle | null>(null);
  const cursorCircleOutlineRef = useRef<Konva.Circle | null>(null);
  const cursorRectRef = useRef<Konva.Rect | null>(null);
  const cursorRectOutlineRef = useRef<Konva.Rect | null>(null);

  const [size, setSize] = useState(600);
  const [scratch, setScratchState] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreviewState] = useState<PreviewShape | null>(null);
  const [marquee, setMarqueeState] = useState<{ a: Point; b: Point } | null>(null);
  const [floating, setFloatingState] = useState<FloatingPiece | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [cursorStyle, setCursorStyle] = useState('crosshair');

  const setScratch = (value: HTMLCanvasElement | null) => {
    scratchRef.current = value;
    setScratchState(value);
  };
  const setPreview = (value: PreviewShape | null) => {
    previewRef.current = value;
    setPreviewState(value);
  };
  const setMarquee = (value: { a: Point; b: Point } | null) => {
    marqueeRef.current = value;
    setMarqueeState(value);
  };
  const setFloating = (value: FloatingPiece | null) => {
    floatingRef.current = value;
    setFloatingState(value);
  };

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize(Math.max(280, Math.floor(Math.min(rect.width, rect.height - 8))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    layerRef.current?.batchDraw();
  }, [layerVersion, layers, scratch, floating, preview, selection, marquee]);

  const scale = size / CANVAS_SIZE;
  const baseCursor = tool === 'move' ? 'default' : tool === 'bucket' ? 'copy' : tool === 'brush' || tool === 'eraser' ? 'none' : 'crosshair';

  useEffect(() => {
    setCursorStyle(baseCursor);
  }, [baseCursor]);

  /** Stamp the floating piece with its transform, then either keep or clear the selection. */
  const applyFloating = (keepSelection = false) => {
    const piece = floatingRef.current;
    if (!piece) return;
    const ctx = getLayerCanvas(activeLayerId).getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.translate(piece.cx, piece.cy);
      ctx.rotate((piece.rotation * Math.PI) / 180);
      ctx.scale(piece.flipX ? -1 : 1, piece.flipY ? -1 : 1);
      ctx.drawImage(piece.canvas, -piece.width / 2, -piece.height / 2, piece.width, piece.height);
      ctx.restore();
    }
    setSelection(
      keepSelection
        ? rotatedBounds({ x: piece.cx, y: piece.cy }, piece.width, piece.height, piece.rotation)
        : null,
    );
    setFloating(null);
    commitHistory();
    bumpLayer();
  };

  /** Put the pixels back where they were lifted from. */
  const cancelFloating = () => {
    const piece = floatingRef.current;
    if (!piece) return;
    const ctx = getLayerCanvas(activeLayerId).getContext('2d');
    if (ctx) ctx.drawImage(piece.canvas, piece.origin.x, piece.origin.y);
    setSelection(piece.origin);
    setFloating(null);
    discardHistory();
    bumpLayer();
  };

  const updateFloating = (patch: Partial<FloatingPiece>) => {
    const piece = floatingRef.current;
    if (!piece) return;
    setFloating({ ...piece, ...patch });
  };

  // The keyboard handler below is registered once, so it must call the newest closures.
  const applyFloatingRef = useRef(applyFloating);
  applyFloatingRef.current = applyFloating;
  const cancelFloatingRef = useRef(cancelFloating);
  cancelFloatingRef.current = cancelFloating;

  /** Lift a rectangle of the active layer into a floating transform and show its handles. */
  const liftSelection = (box: PixelBounds) => {
    beginHistory();
    const cut = cutRegion(getLayerCanvas(activeLayerId), box);
    setSelection(box);
    setFloating({
      canvas: cut,
      cx: box.x + box.width / 2,
      cy: box.y + box.height / 2,
      width: box.width,
      height: box.height,
      rotation: 0,
      flipX: false,
      flipY: false,
      origin: box,
    });
    bumpLayer();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (floatingRef.current) cancelFloatingRef.current();
        else if (useStore.getState().selection) setSelection(null);
        return;
      }
      if (event.key === 'Enter' && floatingRef.current) {
        event.preventDefault();
        applyFloatingRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new or loaded document replaces the pixels, so a floating piece must not survive it.
  useEffect(() => {
    if (!floatingRef.current) return;
    floatingRef.current = null;
    setFloatingState(null);
    discardHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // Leaving the move tool stamps the transform but keeps the selection, so the next tool paints
  // only inside it.
  useEffect(() => {
    if (floatingRef.current && tool !== 'move') applyFloating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const style = (erase = false): PaintStyle => ({
    color,
    size: strokeSize,
    opacity,
    softness: brushSoftness(brush),
    tip,
    erase,
  });

  const pointFromEvent = (event: PointerEvent): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.container().getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  };

  const pointer = (): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const position = stage.getRelativePointerPosition();
    return position ? { x: position.x, y: position.y } : null;
  };

  const insidePiece = (piece: FloatingPiece, point: Point): boolean => {
    const local = rotatePoint(point, { x: piece.cx, y: piece.cy }, -piece.rotation);
    return Math.abs(local.x - piece.cx) <= piece.width / 2 && Math.abs(local.y - piece.cy) <= piece.height / 2;
  };

  const updateBrushCursor = (point: Point | null) => {
    const group = cursorGroupRef.current;
    const circle = cursorCircleRef.current;
    const outline = cursorCircleOutlineRef.current;
    const square = cursorRectRef.current;
    const squareOutline = cursorRectOutlineRef.current;
    if (!group || !circle || !outline || !square || !squareOutline) return;

    const active = point !== null && (tool === 'brush' || tool === 'eraser');
    group.visible(active);
    if (active && point) {
      group.position(point);
      const diameter = Math.max(2, strokeSize);
      const round = tool === 'eraser' || tip === 'round';
      circle.visible(round);
      outline.visible(round);
      square.visible(!round);
      squareOutline.visible(!round);

      if (round) {
        circle.radius(diameter / 2);
        outline.radius(diameter / 2);
      } else {
        square.width(diameter);
        square.height(diameter);
        square.offset({ x: diameter / 2, y: diameter / 2 });
        squareOutline.width(diameter);
        squareOutline.height(diameter);
        squareOutline.offset({ x: diameter / 2, y: diameter / 2 });
      }
    }
    layerRef.current?.batchDraw();
  };

  // ---- interaction ----

  const attachTracking = () => {
    if (trackingRef.current) return;
    trackingRef.current = true;

    const onMove = (event: PointerEvent) => {
      const point = pointFromEvent(event);
      if (point) handleMove(point, event);
    };
    const onUp = () => {
      detachTracking();
      handleEnd();
    };

    const detachTracking = () => {
      trackingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startResize = (corner: Corner) => (event: KonvaEventObject<PointerEvent>) => {
    event.cancelBubble = true;
    const piece = floatingRef.current;
    const point = pointer();
    if (!piece || !point) return;
    modeRef.current = 'resize';
    cornerRef.current = corner;
    dragStartRef.current = {
      point,
      cx: piece.cx,
      cy: piece.cy,
      width: piece.width,
      height: piece.height,
      rotation: piece.rotation,
      angle: 0,
    };
    attachTracking();
  };

  const startRotate = (event: KonvaEventObject<PointerEvent>) => {
    event.cancelBubble = true;
    const piece = floatingRef.current;
    const point = pointer();
    if (!piece || !point) return;
    modeRef.current = 'rotate';
    dragStartRef.current = {
      point,
      cx: piece.cx,
      cy: piece.cy,
      width: piece.width,
      height: piece.height,
      rotation: piece.rotation,
      angle: Math.atan2(point.y - piece.cy, point.x - piece.cx),
    };
    attachTracking();
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    const point = pointer();
    if (!point) return;

    if (tool === 'move') {
      const piece = floatingRef.current;
      if (piece) {
        if (insidePiece(piece, point)) {
          modeRef.current = 'move';
          dragStartRef.current = {
            point,
            cx: piece.cx,
            cy: piece.cy,
            width: piece.width,
            height: piece.height,
            rotation: piece.rotation,
            angle: 0,
          };
          attachTracking();
          return;
        }
        // Clicking away commits the transform and deselects; the press then starts a new marquee.
        applyFloating();
      }

      const box = useStore.getState().selection;
      if (box) {
        liftSelection(box);
        modeRef.current = 'move';
        dragStartRef.current = {
          point,
          cx: box.x + box.width / 2,
          cy: box.y + box.height / 2,
          width: box.width,
          height: box.height,
          rotation: 0,
          angle: 0,
        };
        attachTracking();
        return;
      }

      setMarquee({ a: point, b: point });
      attachTracking();
      return;
    }

    if (tool === 'bucket') {
      beginHistory();
      const ctx = getLayerCanvas(activeLayerId).getContext('2d');
      const box = useStore.getState().selection;
      if (ctx) floodFill(ctx, point.x, point.y, CANVAS_SIZE, style(), 32, box ?? undefined);
      commitHistory();
      bumpLayer();
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      const canvas = createLayerCanvas(CANVAS_SIZE);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Painting is masked by the selection, so the preview already shows the clipped result.
      const box = useStore.getState().selection;
      if (box) {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.width, box.height);
        ctx.clip();
      }
      beginHistory();
      paintDot(ctx, point.x, point.y, strokeWidth(style(), evtPressure(event)), style(tool === 'eraser'));
      lastRef.current = { point, pressure: evtPressure(event) };
      setScratch(canvas);
      attachTracking();
      return;
    }

    setPreview({ kind: tool as PreviewShape['kind'], a: point, b: point });
    attachTracking();
  };

  const evtPressure = (event: KonvaEventObject<PointerEvent>): number =>
    event.evt.pointerType === 'pen' ? Math.max(0.05, event.evt.pressure) : 1;

  const handleMove = (point: Point, event: PointerEvent) => {
    updateBrushCursor(point);
    const pressure = event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 1;

    const piece = floatingRef.current;
    const start = dragStartRef.current;
    if (piece && start && modeRef.current) {
      if (modeRef.current === 'move') {
        updateFloating({
          cx: start.cx + (point.x - start.point.x),
          cy: start.cy + (point.y - start.point.y),
        });
        return;
      }

      if (modeRef.current === 'rotate') {
        const angle = Math.atan2(point.y - piece.cy, point.x - piece.cx);
        let degrees = start.rotation + ((angle - start.angle) * 180) / Math.PI;
        if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
        updateFloating({ rotation: degrees });
        return;
      }

      if (modeRef.current === 'resize' && cornerRef.current) {
        const corner = cornerRef.current;
        const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
        const signY = corner === 'se' || corner === 'sw' ? 1 : -1;
        const anchorX = (-signX * start.width) / 2;
        const anchorY = (-signY * start.height) / 2;

        const local = rotatePoint(point, { x: start.cx, y: start.cy }, -start.rotation);
        const localX = local.x - start.cx;
        const localY = local.y - start.cy;

        let width = Math.max(MIN_SIZE, Math.abs(localX - anchorX));
        let height = Math.max(MIN_SIZE, Math.abs(localY - anchorY));

        if (event.shiftKey && start.width > 0 && start.height > 0) {
          const ratio = Math.max(width / start.width, height / start.height);
          width = start.width * ratio;
          height = start.height * ratio;
        }

        const midX = anchorX + (signX * width) / 2;
        const midY = anchorY + (signY * height) / 2;
        const center = rotatePoint(
          { x: start.cx + midX, y: start.cy + midY },
          { x: start.cx, y: start.cy },
          start.rotation,
        );
        updateFloating({ cx: center.x, cy: center.y, width, height });
        return;
      }
    }

    const marqueeNow = marqueeRef.current;
    if (marqueeNow) {
      setMarquee({ ...marqueeNow, b: point });
      return;
    }

    const scratchNow = scratchRef.current;
    if (scratchNow && lastRef.current) {
      const ctx = scratchNow.getContext('2d');
      if (ctx) {
        paintSegment(
          ctx,
          lastRef.current.point,
          point,
          strokeWidth(style(), lastRef.current.pressure),
          strokeWidth(style(), pressure),
          style(tool === 'eraser'),
        );
      }
      lastRef.current = { point, pressure };
      layerRef.current?.batchDraw();
      return;
    }

    const previewNow = previewRef.current;
    if (previewNow) setPreview({ ...previewNow, b: point });
  };

  const handleEnd = () => {
    if (modeRef.current) {
      modeRef.current = null;
      cornerRef.current = null;
      dragStartRef.current = null;
      return;
    }

    const marqueeNow = marqueeRef.current;
    if (marqueeNow) {
      const rect = clampToCanvas(rectFromPoints(marqueeNow.a, marqueeNow.b));
      setMarquee(null);
      if (isMeaningfulRect(rect) && tool === 'move') liftSelection(rect);
      else setSelection(isMeaningfulRect(rect) ? rect : null);
      return;
    }

    const scratchNow = scratchRef.current;
    if (scratchNow) {
      const ctx = getLayerCanvas(activeLayerId).getContext('2d');
      if (ctx) commitStroke(scratchNow, ctx, style(tool === 'eraser'));
      lastRef.current = null;
      setScratch(null);
      commitHistory();
      bumpLayer();
      return;
    }

    const previewNow = previewRef.current;
    if (previewNow) {
      const ctx = getLayerCanvas(activeLayerId).getContext('2d');
      setPreview(null);
      if (!ctx) return;
      beginHistory();
      const box = useStore.getState().selection;
      ctx.save();
      if (box) {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.width, box.height);
        ctx.clip();
      }
      if (previewNow.kind === 'line') {
        drawLine(ctx, previewNow.a, previewNow.b, style());
      } else {
        const rect = clampToCanvas(rectFromPoints(previewNow.a, previewNow.b));
        if (previewNow.kind === 'rect') drawRect(ctx, rect, style(), fillShapes);
        else drawEllipse(ctx, rect, style(), fillShapes);
      }
      ctx.restore();
      commitHistory();
      bumpLayer();
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    const src =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain') ||
      event.dataTransfer.getData('text/html');
    if (!src || !/^(https?:|data:image\/)/i.test(src.trim())) return;

    try {
      const canvas = await imageLayer(src.trim(), {
        cutWhite: useStore.getState().cutBackground,
      });
      addLayer('Image', canvas);
      useStore.getState().setNotice('Image added as a new layer');
    } catch {
      useStore.getState().setNotice('Could not load that image');
    }
  };

  const hasContent = layers.some((layer) => layer.visible && layer.opacity > 0);
  const handleSize = 10 / scale;
  const rotateOffset = 28 / scale;
  const zoneSize = 26 / scale;
  const zoneGap = CORNER_ROTATE_GAP / scale;

  const pieceBox = floating
    ? rotatedBounds({ x: floating.cx, y: floating.cy }, floating.width, floating.height, floating.rotation)
    : null;

  // The transform bar sits well clear of the rotate handle; if there is no room above the
  // selection it drops below it instead of covering the handle.
  const barBox: PixelBounds | null = floating && pieceBox ? pieceBox : selection;
  const barWidth = floating ? 214 : 108;
  const barTop = barBox
    ? barBox.y * scale - 78 >= 4
      ? barBox.y * scale - 78
      : Math.min(size - 44, (barBox.y + barBox.height) * scale + 16)
    : 0;
  const barLeft = barBox
    ? Math.min(
        Math.max((barBox.x + barBox.width / 2) * scale, barWidth / 2 + 6),
        size - barWidth / 2 - 6,
      )
    : 0;

  // When the selection touches the top of the canvas there is no room above it, so the rotate
  // handle moves just inside the box instead of being clipped by the stage.
  const rotateHandleInside = pieceBox ? pieceBox.y * scale < 90 : false;
  const rotateHandleY = floating
    ? rotateHandleInside
      ? -floating.height / 2 + 22 / scale
      : -floating.height / 2 - rotateOffset
    : 0;

  const corners: Array<{ id: Corner; x: number; y: number }> = floating    ? [
        { id: 'nw', x: -floating.width / 2, y: -floating.height / 2 },
        { id: 'ne', x: floating.width / 2, y: -floating.height / 2 },
        { id: 'se', x: floating.width / 2, y: floating.height / 2 },
        { id: 'sw', x: -floating.width / 2, y: floating.height / 2 },
      ]
    : [];

  return (
    <div
      className={dropActive ? 'canvas-shell drop-active' : 'canvas-shell'}
      ref={wrapRef}
      onDragOver={(event) => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="paper" style={{ width: size, height: size }}>
        <Stage
          ref={stageRef}
          width={size}
          height={size}
          scaleX={scale}
          scaleY={scale}
          style={{ cursor: cursorStyle }}
          onPointerDown={handlePointerDown}
          onPointerMove={() => updateBrushCursor(pointer())}
          onPointerLeave={() => updateBrushCursor(null)}
        >
          <Layer ref={layerRef}>
            <Rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE} fill="#ffffff" listening={false} />

            {layers.map((layer) =>
              layer.visible ? (
                <KonvaImage
                  key={layer.id}
                  image={getLayerCanvas(layer.id)}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  opacity={layer.opacity}
                  listening={false}
                />
              ) : null,
            )}

            {floating ? (
              <>
                <Group x={floating.cx} y={floating.cy} rotation={floating.rotation}>
                  <KonvaImage
                    image={floating.canvas}
                    x={-floating.width / 2}
                    y={-floating.height / 2}
                    width={floating.width}
                    height={floating.height}
                    scaleX={floating.flipX ? -1 : 1}
                    scaleY={floating.flipY ? -1 : 1}
                    listening={false}
                  />
                  <Rect
                    x={-floating.width / 2}
                    y={-floating.height / 2}
                    width={floating.width}
                    height={floating.height}
                    stroke="#6ea8fe"
                    strokeWidth={1.5 / scale}
                    listening={false}
                  />
                </Group>

                <Group x={floating.cx} y={floating.cy} rotation={floating.rotation}>
                  {/* Rotate zones just outside each corner, behind the resize handles. */}
                  {corners.map((corner) => (
                    <Rect
                      key={`rotate-${corner.id}`}
                      x={corner.x + Math.sign(corner.x) * zoneGap - zoneSize / 2}
                      y={corner.y + Math.sign(corner.y) * zoneGap - zoneSize / 2}
                      width={zoneSize}
                      height={zoneSize}
                      fill="rgba(0,0,0,0.001)"
                      onPointerDown={startRotate}
                      onMouseEnter={() => setCursorStyle('grab')}
                      onMouseLeave={() => setCursorStyle(baseCursor)}
                    />
                  ))}

                  {!rotateHandleInside ? (
                    <Line
                      points={[0, -floating.height / 2, 0, rotateHandleY]}
                      stroke="#6ea8fe"
                      strokeWidth={1.5 / scale}
                      listening={false}
                    />
                  ) : null}
                  <Circle
                    x={0}
                    y={rotateHandleY}
                    radius={7 / scale}
                    fill="#10151e"
                    stroke="#6ea8fe"
                    strokeWidth={1.5 / scale}
                    onPointerDown={startRotate}
                    onMouseEnter={() => setCursorStyle('grab')}
                    onMouseLeave={() => setCursorStyle(baseCursor)}
                  />
                  {corners.map((corner) => (
                    <Rect
                      key={corner.id}
                      x={corner.x - handleSize / 2}
                      y={corner.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="#ffffff"
                      stroke="#3b82f6"
                      strokeWidth={1.5 / scale}
                      cornerRadius={2 / scale}
                      onPointerDown={startResize(corner.id)}
                      onMouseEnter={() =>
                        setCursorStyle(
                          corner.id === 'nw' || corner.id === 'se' ? 'nwse-resize' : 'nesw-resize',
                        )
                      }
                      onMouseLeave={() => setCursorStyle(baseCursor)}
                    />
                  ))}
                </Group>
              </>
            ) : null}

            {scratch ? <KonvaImage image={scratch} opacity={opacity} listening={false} /> : null}

            {preview && preview.kind === 'line' ? (
              <Line
                points={[preview.a.x, preview.a.y, preview.b.x, preview.b.y]}
                stroke={color}
                strokeWidth={strokeSize}
                lineCap={tip === 'round' ? 'round' : 'butt'}
                opacity={opacity}
                listening={false}
              />
            ) : null}

            {preview && preview.kind === 'rect' ? (
              <Rect
                {...rectFromPoints(preview.a, preview.b)}
                stroke={color}
                strokeWidth={strokeSize}
                fill={fillShapes ? color : undefined}
                opacity={opacity}
                listening={false}
              />
            ) : null}

            {preview && preview.kind === 'ellipse' ? (
              <Ellipse
                x={rectFromPoints(preview.a, preview.b).x + rectFromPoints(preview.a, preview.b).width / 2}
                y={rectFromPoints(preview.a, preview.b).y + rectFromPoints(preview.a, preview.b).height / 2}
                radiusX={rectFromPoints(preview.a, preview.b).width / 2}
                radiusY={rectFromPoints(preview.a, preview.b).height / 2}
                stroke={color}
                strokeWidth={strokeSize}
                fill={fillShapes ? color : undefined}
                opacity={opacity}
                listening={false}
              />
            ) : null}

            {!floating && selection ? (
              <Rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                stroke="#6ea8fe"
                strokeWidth={1.5 / scale}
                dash={[8 / scale, 6 / scale]}
                listening={false}
              />
            ) : null}

            {marquee ? (
              <Rect
                {...rectFromPoints(marquee.a, marquee.b)}
                fill="rgba(110,168,254,0.12)"
                stroke="#6ea8fe"
                strokeWidth={1.5 / scale}
                listening={false}
              />
            ) : null}

            <Group ref={cursorGroupRef} visible={false} listening={false}>
              <Circle
                ref={cursorCircleOutlineRef}
                stroke="#ffffff"
                strokeWidth={3 / scale}
                listening={false}
              />
              <Circle ref={cursorCircleRef} stroke="#111827" strokeWidth={1 / scale} listening={false} />
              <Rect ref={cursorRectOutlineRef} stroke="#ffffff" strokeWidth={3 / scale} listening={false} />
              <Rect ref={cursorRectRef} stroke="#111827" strokeWidth={1 / scale} listening={false} />
            </Group>
          </Layer>
        </Stage>

        {barBox ? (
          <div
            className="transform-bar"
            style={{
              left: barLeft,
              top: barTop,
              transform: 'translateX(-50%)',
            }}
          >
            {floating ? (
              <>
                <button
                  type="button"
                  onClick={() => updateFloating({ flipX: !floating.flipX })}
                  title="Flip horizontal"
                >
                  ⇄
                </button>
                <button
                  type="button"
                  onClick={() => updateFloating({ flipY: !floating.flipY })}
                  title="Flip vertical"
                >
                  ⇅
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateFloating({
                      width: floating.height,
                      height: floating.width,
                      rotation: floating.rotation + 90,
                    })
                  }
                  title="Rotate 90°"
                >
                  ⟳
                </button>
                <button type="button" className="primary" onClick={() => applyFloating()} title="Apply and deselect (Enter)">
                  ✓
                </button>
                <button type="button" onClick={() => cancelFloating()} title="Cancel and restore (Esc)">
                  ✕
                </button>
              </>
            ) : (
              <button
                type="button"
                className="deselect"
                onClick={() => setSelection(null)}
                title="Remove the selection (Esc)"
              >
                Deselect
              </button>
            )}
          </div>
        ) : null}
      </div>

      {!hasContent ? (
        <div className="canvas-hint">
          <strong>Paint something</strong>
          <span>Brush, shapes and fills paint into the selected layer — or drag a generated image here.</span>
        </div>
      ) : null}
    </div>
  );
}

export type { PixelBounds };
