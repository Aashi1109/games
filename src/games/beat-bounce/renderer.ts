import type { Note, Track } from './engine.ts';
// The rhythm runway uses the same audible clock as scoring. No simulated stats.
export function createBeatRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let w = 1000,
    h = 320,
    dpr = 1;
  function resize() {
    const b = canvas.getBoundingClientRect();
    w = Math.max(260, b.width);
    h = Math.max(140, b.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  function line(
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: string,
    width = 1,
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function circle(
    x: number,
    y: number,
    r: number,
    fill: string | null,
    stroke: string | null = null,
    width = 1,
  ) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  function label(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left',
  ) {
    ctx.font = `700 ${size}px GrooveText,sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }
  function draw({
    notes,
    time,
    track,
    flash,
    mode,
    reducedMotion,
  }: {
    notes: Pick<Note, 'time' | 'status'>[];
    time: number;
    track: Track;
    flash: number;
    mode: string;
    reducedMotion: boolean;
  }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f5ed';
    ctx.fillRect(0, 0, w, h);
    const small = w < 600,
      target = w * 0.22,
      y = h * 0.5,
      r = small ? 21 : 31,
      rate = small ? 112 : 245,
      beat = 60 / track.bpm,
      active = mode === 'playing' || mode === 'calibrating';
    const band = Math.min(80, h * 0.3);
    ctx.fillStyle = '#efede3';
    ctx.fillRect(0, y - band, w, band * 2);
    line(0, y - band, w, y - band, '#d8d7cb');
    line(0, y + band, w, y + band, '#d8d7cb');
    line(0, y, w, y, '#bbbeb1');
    for (
      let n = Math.floor(time / beat) - 2;
      n < (time + w / rate) / beat + 3;
      n++
    ) {
      const x = target + (n * beat - time) * rate;
      if (x < 0 || x > w) continue;
      const measure = n % 4 === 0;
      line(
        x,
        y - band,
        x,
        y - band + (measure ? 10 : 5),
        measure ? '#8d9582' : '#c5c9bc',
      );
      line(
        x,
        y + band - (measure ? 10 : 5),
        x,
        y + band,
        measure ? '#8d9582' : '#c5c9bc',
      );
    }
    // Coral gate and a persistent target ring remain legible even with no sound.
    ctx.fillStyle = '#c94b3714';
    ctx.fillRect(target - r - 10, y - band, 2 * r + 20, band * 2);
    line(target, y - band - 13, target, y + band + 13, '#c94b37', 2);
    circle(target, y, r + 9, '#f8f5ed', '#c94b37', 3);
    if (flash > 0)
      circle(
        target,
        y,
        r + 9 + (reducedMotion ? 0 : (1 - flash) * 24),
        null,
        `rgba(201,75,55,${flash * 0.65})`,
        3,
      );
    for (const note of notes) {
      const x = target + (note.time - time) * rate;
      if (x < -50 || x > w + 50) continue;
      ctx.save();
      ctx.globalAlpha = note.status?.startsWith('miss')
        ? 0.2
        : note.status?.startsWith('perfect')
          ? 0.4
          : note.status
            ? 0.3
            : 1;
      circle(x + 2, y + 4, r, '#272b2c18');
      circle(x, y, r, note.status === 'perfect' ? '#c94b37' : '#282a2d');
      circle(x, y, r * 0.34, track.color);
      circle(x, y, 2, '#f8f5ed');
      ctx.restore();
    }
    label(
      'HIT HERE',
      target,
      y + band + 32,
      small ? 8 : 9,
      '#a03929',
      'center',
    );
    if (!small) {
      label('FOLLOW THE NOTES', w - 4, 28, 9, '#6a7163', 'right');
      line(w - 120, 24, w - 138, 24, '#6a7163');
      line(w - 138, 24, w - 133, 20, '#6a7163');
      line(w - 138, 24, w - 133, 28, '#6a7163');
    }
    const index = Math.floor(Math.max(0, time) / beat) % 4,
      by = Math.max(18, y - band - 33);
    for (let i = 0; i < 4; i++)
      circle(
        target - 25 + i * 17,
        by,
        active && i === index ? 4 : 2.5,
        active && i === index ? '#c94b37' : '#babfaf',
      );
  }
  return { draw, dispose: () => observer.disconnect() };
}
