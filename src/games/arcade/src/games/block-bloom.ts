type Board = number[][];
type Shape = [number, number][];
interface Piece {
  shape: Shape;
  color: number;
}
import type { ArcadeApi } from '../lib/types.ts';
import { seeded, daySeed } from '../lib/core.ts';

export const BOARD_SIZE = 8;
export const SHAPES: Shape[] = [
  [[0, 0]],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
];
const SHAPE_NAMES = [
  'single square',
  'horizontal domino',
  'vertical domino',
  'horizontal line of three',
  'vertical line of three',
  'two by two square',
  'vertical L, foot pointing right',
  'T, stem pointing down',
  'horizontal zigzag, lower row shifted right',
  'horizontal line of four',
  'vertical line of four',
  'three-square L, foot pointing right',
  'three wide by two tall rectangle',
];
export function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<number>(BOARD_SIZE).fill(0),
  );
}
export function canPlace(
  board: Board,
  shape: Shape | null | undefined,
  x: number,
  y: number,
) {
  return (
    !!shape &&
    shape.length > 0 &&
    shape.every(
      ([dx, dy]) =>
        Number.isInteger(x + dx) &&
        Number.isInteger(y + dy) &&
        x + dx >= 0 &&
        x + dx < BOARD_SIZE &&
        y + dy >= 0 &&
        y + dy < BOARD_SIZE &&
        !board[y + dy][x + dx],
    )
  );
}
export function hasPlacement(board: Board, shape: Shape | null | undefined) {
  if (!shape) return false;
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (canPlace(board, shape, x, y)) return true;
  return false;
}
export function placePiece(
  board: Board,
  shape: Shape,
  x: number,
  y: number,
  color = 1,
) {
  if (!canPlace(board, shape, x, y)) return null;
  const next = board.map((row) => [...row]);
  for (const [dx, dy] of shape) next[y + dy][x + dx] = color;
  const rows: number[] = [],
    columns: number[] = [];
  for (let n = 0; n < BOARD_SIZE; n++) {
    if (next[n].every(Boolean)) rows.push(n);
    if (next.every((row) => Boolean(row[n]))) columns.push(n);
  }
  const cleared = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (rows.includes(r) || columns.includes(c)) {
        cleared.push([c, r]);
        next[r][c] = 0;
      }
  return { board: next, lines: rows.length + columns.length, cleared };
}

const COLORS = ['', '#d95442', '#498e7c', '#6962a4', '#e4b651', '#427baf'];
export function mount(host: HTMLElement, api: ArcadeApi) {
  const run = Number(api.load('runs', 0)) || 0;
  api.save('runs', run + 1);
  const rng = seeded(`${daySeed()}:bloom:${run}`);
  let board = emptyBoard(),
    pieces: (Piece | null)[] = [],
    selected = 0,
    score = 0,
    lines = 0,
    moves = 0,
    streak = 0,
    cursor = { x: 2, y: 2 },
    ended = false;
  let bonus = { x: 3, y: 3 };
  host.innerHTML = `<section class="bloom" aria-label="Block Bloom puzzle"><div class="bloom-garden"><div class="bloom-caption"><span>YOUR LITTLE GARDEN</span><span>8 × 8 · room to grow</span></div><div class="bloom-grid" role="grid" aria-label="Block placement board"></div><p class="bloom-rule">Clear full rows or columns to make space for new pieces.</p></div><div class="bloom-side"><h3>Your next move</h3><p>Choose a piece, then place it on the board.</p><div class="bloom-tray" aria-label="Your three pieces"></div><div class="bloom-status" role="status" aria-live="polite">Choose one of your three pieces.</div><p class="bloom-tip bloom-legend">The marked 2 × 2 patch gives <strong>+5 points</strong> for each square you place inside it. It moves after each turn.</p><button class="bloom-action" type="button">Finish this garden</button></div></section>`;
  const grid = host.querySelector<HTMLElement>('.bloom-grid')!,
    tray = host.querySelector<HTMLElement>('.bloom-tray')!,
    status = host.querySelector<HTMLElement>('.bloom-status')!;
  const cells: HTMLButtonElement[] = [];
  const rows = Array.from({ length: 8 }, () => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.style.display = 'contents';
    grid.append(row);
    return row;
  });
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'bloom-cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = -1;
      rows[y].append(cell);
      cells.push(cell);
    }
  function deal() {
    pieces = Array.from({ length: 3 }, () => ({
      shape: SHAPES[Math.floor(rng() * SHAPES.length)],
      color: 1 + Math.floor(rng() * 5),
    }));
    selected = 0;
  }
  function stats() {
    api.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Lines', value: lines },
      { label: 'Moves', value: moves },
    ]);
  }
  function render() {
    const shape = pieces[selected]?.shape,
      valid = canPlace(board, shape, cursor.x, cursor.y);
    for (const cell of cells) {
      const x = Number(cell.dataset.x),
        y = Number(cell.dataset.y),
        value = board[y][x];
      const covered = shape?.some(
        ([dx, dy]) => cursor.x + dx === x && cursor.y + dy === y,
      );
      cell.className =
        'bloom-cell' +
        (value ? ' filled' : '') +
        (x >= bonus.x && x < bonus.x + 2 && y >= bonus.y && y < bonus.y + 2
          ? ' bonus'
          : '') +
        (covered ? (valid ? ' preview' : ' invalid') : '') +
        (x === cursor.x && y === cursor.y ? ' cursor' : '');
      cell.style.backgroundColor = value
        ? COLORS[value]
        : covered && valid
          ? `${COLORS[pieces[selected]!.color]}a0`
          : '';
      cell.tabIndex = x === cursor.x && y === cursor.y ? 0 : -1;
      cell.setAttribute(
        'aria-label',
        `Row ${y + 1}, column ${x + 1}, ${value ? 'occupied' : x >= bonus.x && x < bonus.x + 2 && y >= bonus.y && y < bonus.y + 2 ? 'empty bonus square' : 'empty'}`,
      );
    }
    tray.replaceChildren();
    pieces.forEach((piece, i) => {
      const button = document.createElement('button');
      button.className = 'bloom-piece' + (selected === i ? ' selected' : '');
      button.disabled = !piece;
      button.setAttribute('aria-pressed', String(selected === i));
      button.setAttribute(
        'aria-label',
        piece
          ? `Piece ${i + 1}: ${SHAPE_NAMES[SHAPES.indexOf(piece.shape)]}, ${piece.shape.length} squares`
          : `Piece ${i + 1} used`,
      );
      button.dataset.piece = String(i);
      if (piece) {
        const w = Math.max(...piece.shape.map((p) => p[0])) + 1,
          h = Math.max(...piece.shape.map((p) => p[1])) + 1;
        const mini = document.createElement('span');
        mini.className = 'bloom-mini';
        mini.style.gridTemplateColumns = `repeat(${w},1fr)`;
        mini.setAttribute('aria-hidden', 'true');
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const square = document.createElement('span');
            square.style.backgroundColor = piece.shape.some(
              (p) => p[0] === x && p[1] === y,
            )
              ? COLORS[piece.color]
              : 'transparent';
            if (square.style.backgroundColor === 'transparent')
              square.style.boxShadow = 'none';
            mini.append(square);
          }
        button.append(mini);
      }
      const number = document.createElement('span');
      number.className = 'bloom-piece-number';
      number.textContent = piece ? String(i + 1) : '✓';
      button.append(number);
      tray.append(button);
    });
    stats();
  }
  function finish() {
    if (ended) return;
    ended = true;
    api.finish({
      title: lines > 0 ? 'A lovely little garden.' : 'Room for a fresh start.',
      message: `You placed ${moves} pieces and cleared ${lines} ${lines === 1 ? 'line' : 'lines'}. Every garden starts with one little block.`,
      score,
      unit: 'points',
    });
  }
  function place(x: number, y: number) {
    if (api.isPaused() || ended) return;
    const piece = pieces[selected];
    cursor = { x, y };
    const result = piece && placePiece(board, piece.shape, x, y, piece.color);
    if (!piece || !result) {
      status.textContent = 'A little too snug. Try another spot or piece.';
      api.sound('tap');
      render();
      return;
    }
    const patch = piece.shape.filter(
      ([dx, dy]) =>
        x + dx >= bonus.x &&
        x + dx < bonus.x + 2 &&
        y + dy >= bonus.y &&
        y + dy < bonus.y + 2,
    ).length;
    streak = result.lines ? streak + 1 : 0;
    const earned =
      piece.shape.length * 10 +
      result.lines * result.lines * 100 +
      Math.max(0, streak - 1) * 50 +
      patch * 5;
    score += earned;
    lines += result.lines;
    moves++;
    board = result.board;
    pieces[selected] = null;
    status.textContent = result.lines
      ? `${result.lines > 1 ? 'Beautiful combo!' : 'Lovely line!'} +${earned} points${streak > 1 ? ` · ${streak} turn streak` : ''}`
      : `A nice little fit. +${earned} points${patch ? ' · garden bonus!' : ''}`;
    api.sound(result.lines ? 'good' : 'tap');
    if (pieces.every((p) => !p)) deal();
    else selected = pieces.findIndex(Boolean);
    bonus = { x: Math.floor(rng() * 7), y: Math.floor(rng() * 7) };
    render();
    if (!pieces.some((p) => p && hasPlacement(board, p.shape))) {
      status.textContent = 'This garden is full. Beautiful work.';
      finish();
    }
  }
  const onClick = (event: MouseEvent) => {
    const cell = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.bloom-cell');
    if (cell) place(Number(cell.dataset.x), Number(cell.dataset.y));
  };
  const onFocus = (event: FocusEvent) => {
    const cell = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.bloom-cell');
    if (cell) {
      cursor = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
      render();
    }
  };
  const onHover = (event: PointerEvent) => {
    if (api.isPaused() || ended || event.pointerType === 'touch') return;
    const cell = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.bloom-cell');
    if (cell) {
      cursor = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
      render();
    }
  };
  const onTray = (event: MouseEvent) => {
    if (api.isPaused() || ended) return;
    const button = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('[data-piece]');
    if (button && pieces[Number(button.dataset.piece)]) {
      selected = Number(button.dataset.piece);
      render();
      tray
        .querySelector<HTMLElement>(`[data-piece="${selected}"]`)!
        .focus({ preventScroll: true });
      api.sound('tap');
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (api.isPaused() || ended || !host.contains(document.activeElement))
      return;
    if (['1', '2', '3'].includes(event.key)) {
      event.preventDefault();
      const n = Number(event.key) - 1;
      if (pieces[n]) {
        selected = n;
        render();
        cells[cursor.y * 8 + cursor.x].focus({ preventScroll: true });
      }
      return;
    }
    const focusedCell = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.bloom-cell');
    if (!focusedCell) return;
    cursor = {
      x: Number(focusedCell.dataset.x),
      y: Number(focusedCell.dataset.y),
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      place(cursor.x, cursor.y);
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (directions[event.key]) {
      event.preventDefault();
      const [dx, dy] = directions[event.key];
      cursor = {
        x: Math.max(0, Math.min(7, cursor.x + dx)),
        y: Math.max(0, Math.min(7, cursor.y + dy)),
      };
      render();
      cells[cursor.y * 8 + cursor.x].focus({ preventScroll: true });
    }
  };
  grid.addEventListener('click', onClick);
  grid.addEventListener('pointermove', onHover);
  grid.addEventListener('focusin', onFocus);
  tray.addEventListener('click', onTray);
  host.addEventListener('keydown', onKey);
  const finishButton = host.querySelector<HTMLElement>('.bloom-action')!;
  const onFinish = () => {
    if (!api.isPaused()) finish();
  };
  finishButton.addEventListener('click', onFinish);
  deal();
  render();
  api.setHint(
    'Choose a piece, then tap where its top-left square should go. Fill rows or columns to clear them.',
  );
  return () => {
    grid.removeEventListener('click', onClick);
    grid.removeEventListener('pointermove', onHover);
    grid.removeEventListener('focusin', onFocus);
    tray.removeEventListener('click', onTray);
    host.removeEventListener('keydown', onKey);
    finishButton.removeEventListener('click', onFinish);
  };
}
