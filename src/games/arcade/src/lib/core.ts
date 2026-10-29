type BrowserEvents = WindowEventMap &
  DocumentEventMap &
  HTMLElementEventMap &
  MediaQueryListEventMap;
type Paint = string | CanvasGradient | CanvasPattern;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function seeded(seed: string | number) {
  let value = 2166136261;
  for (const char of String(seed))
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(array: readonly T[], rng = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const daySeed = () => new Date().toISOString().slice(0, 10);
export function listen<K extends string>(
  target: EventTarget,
  type: K,
  handler: (
    event: K extends keyof BrowserEvents ? BrowserEvents[K] : Event,
  ) => unknown,
  options?: boolean | AddEventListenerOptions,
) {
  target.addEventListener(type, handler as EventListener, options);
  return () =>
    target.removeEventListener(type, handler as EventListener, options);
}

export function createCanvas(host: HTMLElement, width = 960, height = 600) {
  const viewport = document.createElement('div');
  viewport.className = 'canvas-viewport';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-board';
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Game playfield. Use the controls described below.',
  );
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.setProperty('--canvas-ratio', String(width / height));
  const ctx = canvas.getContext('2d')!;
  viewport.append(canvas);
  host.append(viewport);
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = Math.max(
      1,
      canvas.getBoundingClientRect().width || width,
    );
    canvas.width = Math.round(displayWidth * ratio);
    canvas.height = Math.round(((displayWidth * height) / width) * ratio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return {
    canvas,
    ctx,
    width,
    height,
    setSize(nextWidth: number, nextHeight = height) {
      width = nextWidth;
      height = nextHeight;
      this.width = width;
      this.height = height;
      canvas.style.aspectRatio = `${width} / ${height}`;
      canvas.style.setProperty('--canvas-ratio', String(width / height));
      resize();
    },
    point(event: PointerEvent | MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * width,
        y: ((event.clientY - rect.top) / rect.height) * height,
      };
    },
    destroy() {
      observer.disconnect();
      viewport.remove();
    },
  };
}

export function animate(tick: (dt: number, elapsed: number) => void) {
  let last = performance.now(),
    elapsed = 0,
    frame: number,
    stopped = false;
  function update(now: number) {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    elapsed += dt;
    tick(dt, elapsed);
    if (!stopped) frame = requestAnimationFrame(update);
  }
  frame = requestAnimationFrame(update);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  fill?: Paint | null,
  stroke?: Paint | null,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string | number,
  x: number,
  y: number,
  size: number,
  color: Paint,
  align: CanvasTextAlign = 'left',
  weight = 700,
) {
  ctx.font = `${weight} ${size}px 'Break Sans', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(String(text), x, y);
}

/**
 * @param {string} key
 * @param {unknown} [fallback]
 */
export function readStored(key: string, fallback: unknown = null): unknown {
  try {
    const raw = localStorage.getItem(`little-break:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(`little-break:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
