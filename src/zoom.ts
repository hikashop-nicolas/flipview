export interface ZoomOptions {
  min?: number;
  max?: number;
  step?: number;
}

export interface ZoomHandle {
  in(): void;
  out(): void;
  reset(): void;
  scale(): number;
  /** Re-clamp the pan after the book has been resized. */
  refresh(): void;
  destroy(): void;
}

const DEFAULTS = { min: 1, max: 4, step: 0.5 } as const;

/**
 * Scales `target` inside `stage`. While zoomed, pointer drags pan instead of
 * flipping: the handlers run in the capture phase and stop propagation, so the
 * flip engine never sees them and the two gestures cannot fight.
 */
export function createZoom(
  stage: HTMLElement,
  target: HTMLElement,
  options: ZoomOptions,
  onChange: (scale: number) => void,
): ZoomHandle {
  const opt = { ...DEFAULTS, ...options };
  let scale = 1;
  let x = 0;
  let y = 0;

  const points = new Map<number, { x: number; y: number }>();
  let panFrom: { x: number; y: number; ox: number; oy: number } | null = null;
  let pinchFrom: { dist: number; scale: number } | null = null;

  function clamp(): void {
    const box = stage.getBoundingClientRect();
    const overflowX = Math.max(0, (box.width * scale - box.width) / 2);
    const overflowY = Math.max(0, (box.height * scale - box.height) / 2);
    x = Math.min(overflowX, Math.max(-overflowX, x));
    y = Math.min(overflowY, Math.max(-overflowY, y));
  }

  function apply(): void {
    clamp();
    target.style.transform =
      scale === 1 ? "" : `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${scale})`;
    target.style.transformOrigin = "center center";
    onChange(scale);
  }

  /** Zoom keeping the point under the cursor roughly put. */
  function zoomTo(next: number, originX?: number, originY?: number): void {
    const clamped = Math.min(opt.max, Math.max(opt.min, Number(next.toFixed(3))));
    if (clamped === scale) return;
    if (originX !== undefined && originY !== undefined) {
      const box = stage.getBoundingClientRect();
      const dx = originX - (box.left + box.width / 2);
      const dy = originY - (box.top + box.height / 2);
      const ratio = clamped / scale;
      x = x * ratio - dx * (ratio - 1);
      y = y * ratio - dy * (ratio - 1);
    }
    scale = clamped;
    if (scale === 1) {
      x = 0;
      y = 0;
    }
    apply();
  }

  function onWheel(e: WheelEvent): void {
    // Trackpad pinch and ctrl+wheel zoom; a plain wheel still scrolls the page.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
  }

  function onPointerDown(e: PointerEvent): void {
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2) {
      pinchFrom = { dist: spread(), scale };
      panFrom = null;
      e.stopPropagation();
      return;
    }
    if (scale === 1) return;
    panFrom = { x: e.clientX, y: e.clientY, ox: x, oy: y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("fv-panning");
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchFrom && points.size === 2) {
      const now = spread();
      if (pinchFrom.dist > 0) zoomTo((pinchFrom.scale * now) / pinchFrom.dist);
      e.stopPropagation();
      return;
    }
    if (!panFrom) return;
    x = panFrom.ox + (e.clientX - panFrom.x);
    y = panFrom.oy + (e.clientY - panFrom.y);
    apply();
    e.stopPropagation();
  }

  function onPointerUp(e: PointerEvent): void {
    points.delete(e.pointerId);
    if (points.size < 2) pinchFrom = null;
    if (panFrom) {
      panFrom = null;
      stage.classList.remove("fv-panning");
      e.stopPropagation();
    }
  }

  function onDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    zoomTo(scale > 1 ? 1 : 2, e.clientX, e.clientY);
  }

  function spread(): number {
    const [a, b] = [...points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown, true);
  stage.addEventListener("pointermove", onPointerMove, true);
  stage.addEventListener("pointerup", onPointerUp, true);
  stage.addEventListener("pointercancel", onPointerUp, true);
  stage.addEventListener("dblclick", onDoubleClick, true);

  return {
    in: () => zoomTo(scale + opt.step),
    out: () => zoomTo(scale - opt.step),
    reset: () => zoomTo(1),
    scale: () => scale,
    refresh: apply,
    destroy() {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerdown", onPointerDown, true);
      stage.removeEventListener("pointermove", onPointerMove, true);
      stage.removeEventListener("pointerup", onPointerUp, true);
      stage.removeEventListener("pointercancel", onPointerUp, true);
      stage.removeEventListener("dblclick", onDoubleClick, true);
      target.style.transform = "";
    },
  };
}
