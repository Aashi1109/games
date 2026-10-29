type Board = number[][];
interface Move {
  from: number;
  to: number;
}
import type { ArcadeApi } from '../lib/types.ts';
import { seeded } from '../lib/core.ts';

export const SHELF_LEVELS = [
  { colors: 3, capacity: 3, steps: 28, name: 'The corner shop' },
  { colors: 3, capacity: 4, steps: 48, name: 'Morning deliveries' },
  { colors: 4, capacity: 4, steps: 75, name: 'A busier little shop' },
  { colors: 5, capacity: 4, steps: 100, name: 'The weekend market' },
  { colors: 5, capacity: 4, steps: 145, name: 'The grand stockroom' },
];

const PARCELS = [
  {
    name: 'Mint',
    fill: '#b3d2af',
    edge: '#567453',
    mark: '<path d="M11 18C5 11 12 4 21 4c0 9-4 16-10 14Z"/><path d="M8 21 19 9" fill="none" stroke="currentColor" stroke-width="2"/>',
  },
  {
    name: 'Peach',
    fill: '#edae95',
    edge: '#9b5843',
    mark: '<circle cx="13" cy="14" r="8"/><path d="M13 6q0-6 6-4" fill="none" stroke="currentColor" stroke-width="2"/>',
  },
  {
    name: 'Sky',
    fill: '#a8c6db',
    edge: '#426882',
    mark: '<path d="m13 3 10 18H3Z"/>',
  },
  {
    name: 'Honey',
    fill: '#ebce80',
    edge: '#8b6b28',
    mark: '<path d="m13 2 3.1 6.4 7.1 1-5.1 5 1.2 7.1-6.3-3.4-6.3 3.4 1.2-7.1-5.1-5 7.1-1Z"/>',
  },
  {
    name: 'Lilac',
    fill: '#c8b8d8',
    edge: '#78618b',
    mark: '<path d="m13 2 10 11-10 11L3 13Z"/>',
  },
];

const clone = (board: Board) => board.map((shelf) => [...shelf]);

export function shelfIsSorted(board: Board, capacity: number) {
  return (
    board.length > 0 &&
    board.some((shelf) => shelf.length > 0) &&
    board.every(
      (shelf) =>
        shelf.length === 0 ||
        (shelf.length === capacity &&
          shelf.every((color) => color === shelf[0])),
    )
  );
}

export function moveParcel(
  board: Board,
  from: number,
  to: number,
  capacity: number,
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= board.length ||
    to >= board.length ||
    from === to
  )
    return null;
  const source = board[from];
  const destination = board[to];
  if (!source.length || destination.length >= capacity) return null;
  const color = source[source.length - 1];
  if (destination.length && destination[destination.length - 1] !== color)
    return null;
  const next = clone(board);
  next[from].pop();
  next[to].push(color);
  return next;
}

export function availableShelfMoves(board: Board, capacity: number) {
  const moves = [];
  for (let from = 0; from < board.length; from += 1) {
    for (let to = 0; to < board.length; to += 1) {
      if (moveParcel(board, from, to, capacity)) moves.push({ from, to });
    }
  }
  return moves;
}

export function createShelfPuzzle(seed: string | number, level = 0) {
  if (!Number.isInteger(level) || level < 0 || level >= SHELF_LEVELS.length)
    throw new RangeError('Unknown shelf level.');
  const config = SHELF_LEVELS[level];
  const random = seeded(String(seed));
  let board = Array.from({ length: config.colors + 2 }, (_, color) =>
    color < config.colors ? Array<number>(config.capacity).fill(color) : [],
  );
  const trace = [];
  const seen = new Set([JSON.stringify(board)]);
  let best = null;
  let bestQuality = -Infinity;

  // Work backwards from the goal. A reverse move may uncover only the same
  // color (or an empty shelf), so every recorded inverse is a legal play move.
  for (let step = 0; step < config.steps; step += 1) {
    const candidates = [];
    for (let from = 0; from < board.length; from += 1) {
      const source = board[from];
      if (
        !source.length ||
        (source.length > 1 &&
          source[source.length - 2] !== source[source.length - 1])
      )
        continue;
      for (let to = 0; to < board.length; to += 1) {
        if (to === from || board[to].length >= config.capacity) continue;
        const next = clone(board);
        next[to].push(next[from].pop()!);
        const key = JSON.stringify(next);
        if (!seen.has(key)) candidates.push({ from, to, next, key });
      }
    }
    if (!candidates.length) break;
    const choice = candidates[Math.floor(random() * candidates.length)];
    board = choice.next;
    seen.add(choice.key);
    trace.push({ from: choice.to, to: choice.from });
    const mixed = board.reduce(
      (count, shelf) =>
        count +
        shelf.slice(1).filter((color, index) => color !== shelf[index]).length,
      0,
    );
    const empty = board.filter((shelf) => !shelf.length).length;
    // Keep an open shelf in the introductory board and seek more interleaving
    // in later depots. No guessed random layout is ever exposed to the player.
    const quality =
      mixed * 8 +
      Math.min(trace.length, config.steps) / config.steps +
      (level === 0 && empty ? 15 : 0);
    if (mixed > 0 && quality > bestQuality) {
      bestQuality = quality;
      best = { board: clone(board), solutionMoves: [...trace].reverse() };
    }
  }

  if (!best) {
    // A small, guaranteed reachable teaching layout for a degenerate shuffle.
    board = Array.from({ length: config.colors + 2 }, (_, color) =>
      color < config.colors ? Array<number>(config.capacity).fill(color) : [],
    );
    const buffer = config.colors;
    board[buffer].push(board[0].pop()!);
    board[0].push(board[1].pop()!);
    best = {
      board,
      solutionMoves: [
        { from: 0, to: 1 },
        { from: buffer, to: 0 },
      ],
    };
  }
  return { ...config, ...best, level, seed: String(seed) };
}

function symbol(color: number) {
  return `<svg viewBox="0 0 26 26" aria-hidden="true">${PARCELS[color].mark}</svg>`;
}

export function mount(host: HTMLElement, api: ArcadeApi) {
  const stored = api.load('shelf-shuffle-progress', { level: 0, round: 0 });
  const progress =
    stored && typeof stored === 'object'
      ? (stored as { level?: unknown; round?: unknown })
      : {};
  const level =
    typeof progress.level === 'number' && Number.isInteger(progress.level)
      ? Math.max(0, Math.min(SHELF_LEVELS.length - 1, progress.level))
      : 0;
  const round =
    typeof progress.round === 'number' &&
    Number.isInteger(progress.round) &&
    progress.round >= 0
      ? progress.round
      : 0;
  const puzzle = createShelfPuzzle(`little-shop-${level}-${round}`, level);
  let board = clone(puzzle.board);
  let selected: number | null = null;
  let history: Move[] = [];
  let assists = 0;
  let done = false;
  let suggested: Move | null = null;
  let statusText = 'Select a top parcel, then a matching or empty shelf.';
  host.innerHTML = `<section class="ss-root"><div class="ss-layout"><div class="ss-shop"><div class="ss-awning" aria-hidden="true"></div><div class="ss-shop-top"><span>DISPATCH ARCHIVE</span><span class="ss-open">SORTING DESK</span></div><div class="ss-board" role="group" aria-label="Parcel sorting shelves"></div><div class="ss-shop-bottom"><span>${puzzle.colors} kinds · ${puzzle.capacity} parcels each</span><div class="ss-level-dots" aria-label="Depot ${level + 1} of ${SHELF_LEVELS.length}">${SHELF_LEVELS.map((_, index) => `<i class="ss-level-dot${index <= level ? ' active' : ''}"></i>`).join('')}</div></div></div><aside class="ss-aside"><div class="ss-eyebrow">Depot ${level + 1} of ${SHELF_LEVELS.length}</div><h3>${puzzle.name}.</h3><p>A place for every parcel. Fill each shelf with one kind, leaving the two spare shelves empty.</p><div class="ss-legend">${PARCELS.slice(
    0,
    puzzle.colors,
  )
    .map(
      (parcel, color) =>
        `<span style="color:${parcel.edge}">${symbol(color)}${parcel.name}</span>`,
    )
    .join(
      '',
    )}</div><div class="ss-buttons"><button class="ss-action" type="button" data-ss-undo>Undo</button><button class="ss-action" type="button" data-ss-hint>Show a move</button><button class="ss-action" type="button" data-ss-reset>Reset</button></div><p class="ss-rule"><strong>Tab / Enter</strong> to select and place. Escape clears your selection.</p><p class="ss-status" role="status" aria-live="polite"></p></aside></div></section>`;
  const grid = host.querySelector<HTMLElement>('.ss-board')!;
  const status = host.querySelector<HTMLElement>('.ss-status')!;
  const undoButton = host.querySelector<HTMLButtonElement>('[data-ss-undo]')!;
  const hintButton = host.querySelector<HTMLButtonElement>('[data-ss-hint]')!;
  const resetButton = host.querySelector<HTMLButtonElement>('[data-ss-reset]')!;
  grid.style.setProperty('--ss-count', String(board.length));
  grid.style.setProperty('--ss-mobile', board.length > 6 ? '4' : '3');
  grid.style.setProperty('--ss-capacity', String(puzzle.capacity));
  const buttons = board.map((shelf, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.shelf = String(index);
    grid.append(button);
    return button;
  });

  function render() {
    buttons.forEach((button, index) => {
      const shelf = board[index];
      const canPlace =
        selected !== null &&
        moveParcel(board, selected, index, puzzle.capacity);
      button.className = `ss-shelf${selected === index ? ' ss-selected' : ''}${canPlace ? ' ss-can-place' : ''}${suggested && (suggested.from === index || suggested.to === index) ? ' ss-hint' : ''}`;
      button.setAttribute('aria-pressed', String(selected === index));
      button.setAttribute(
        'aria-label',
        `Shelf ${index + 1}, ${
          shelf.length
            ? `top to bottom: ${[...shelf]
                .reverse()
                .map((color) => PARCELS[color].name)
                .join(', ')}`
            : 'empty'
        }, ${shelf.length} of ${puzzle.capacity} spaces filled.${selected === index ? ' Selected.' : canPlace ? ' You can place here.' : ''}`,
      );
      button.innerHTML = `<span class="ss-stack">${shelf.length ? shelf.map((color) => `<span class="ss-parcel" style="--parcel-fill:${PARCELS[color].fill};--parcel-edge:${PARCELS[color].edge}">${symbol(color)}</span>`).join('') : '<span class="ss-empty-mark" aria-hidden="true">+</span>'}</span><span class="ss-plank" aria-hidden="true"></span><span class="ss-shelf-label">${index + 1}<span aria-hidden="true"> · ${shelf.length}/${puzzle.capacity}</span></span>`;
    });
    const sorted = board.filter(
      (shelf) =>
        shelf.length === puzzle.capacity &&
        shelf.every((color) => color === shelf[0]),
    ).length;
    status.textContent = statusText;
    undoButton.disabled = !history.length || done;
    hintButton.disabled = done;
    api.setStats([
      { label: 'Moves', value: history.length },
      { label: 'Sorted', value: `${sorted}/${puzzle.colors}` },
      { label: 'Depot', value: level + 1 },
    ]);
    if (shelfIsSorted(board, puzzle.capacity) && !done) {
      done = true;
      const next = Math.min(SHELF_LEVELS.length - 1, level + 1);
      api.save('shelf-shuffle-progress', { level: next, round: round + 1 });
      api.finish({
        title: 'Everything in its place.',
        message: `Depot ${level + 1} sorted in ${history.length} moves. ${level < SHELF_LEVELS.length - 1 ? `One more round opens Depot ${next + 1}, with a little more to untangle.` : 'You are a master of the stockroom. Play again for a fresh layout.'}`,
        score: Math.max(
          100,
          1500 + level * 250 - history.length * 12 - assists * 30,
        ),
        unit: 'points',
      });
    }
  }

  function choose(event: MouseEvent) {
    const button = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('[data-shelf]');
    if (!button || done || api.isPaused()) return;
    const index = Number(button.dataset.shelf);
    suggested = null;
    if (selected === null) {
      if (!board[index].length)
        statusText = 'This shelf is empty. Choose a shelf with a parcel first.';
      else {
        selected = index;
        statusText = `${PARCELS[board[index].at(-1)!].name} parcel selected. Choose a matching top parcel or an empty shelf.`;
        api.sound('tap');
      }
    } else if (selected === index) {
      selected = null;
      statusText = 'Selection cleared. Choose any top parcel.';
    } else {
      const next = moveParcel(board, selected, index, puzzle.capacity);
      if (!next)
        statusText =
          board[index].length >= puzzle.capacity
            ? 'That shelf is full. Choose a shelf with room.'
            : 'Choose a matching top parcel or an empty shelf.';
      else {
        history.push({ from: selected, to: index });
        board = next;
        selected = null;
        statusText = availableShelfMoves(board, puzzle.capacity).length
          ? 'A little tidier. Pick another top parcel.'
          : 'No legal moves remain. Undo to try a different route, or reset this depot.';
        api.sound('good');
      }
    }
    render();
  }

  function undo() {
    if (!history.length || done || api.isPaused()) return;
    const previous = history.pop()!;
    board[previous.from].push(board[previous.to].pop()!);
    selected = null;
    suggested = null;
    assists += 1;
    statusText = 'One step back. There is always room for another approach.';
    api.sound('tap');
    render();
  }

  function hint() {
    if (done || api.isPaused()) return;
    const moves = availableShelfMoves(board, puzzle.capacity);
    const value = ({ from, to }: Move) => {
      const source = board[from];
      return (
        (board[to].length ? 5 : 0) +
        (source.length === 1 ? 4 : 0) +
        (source.some((color) => color !== source[0]) ? 3 : 0) +
        (board[to].length === puzzle.capacity - 1 ? 2 : 0)
      );
    };
    moves.sort((a, b) => value(b) - value(a));
    suggested = moves[0] || null;
    selected = null;
    if (suggested) {
      assists += 1;
      statusText = `Try shelf ${suggested.from + 1} → shelf ${suggested.to + 1}. Undo if you want another route.`;
    } else
      statusText =
        'No legal moves remain. Undo a move or reset the depot to try again.';
    render();
  }

  function reset() {
    if (done || api.isPaused()) return;
    board = clone(puzzle.board);
    selected = null;
    history = [];
    assists = 0;
    suggested = null;
    statusText = 'Same puzzle, fresh shelves. Use the spare space.';
    render();
  }

  function keys(event: KeyboardEvent) {
    if (api.isPaused() || done) return;
    if (event.key === 'Escape') {
      if (selected === null && suggested === null) return;
      event.preventDefault();
      event.stopPropagation();
      selected = null;
      suggested = null;
      statusText = 'Selection cleared. Choose any top parcel.';
      render();
      return;
    }
    const button = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('[data-shelf]');
    if (
      !button ||
      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    )
      return;
    event.preventDefault();
    const index = Number(button.dataset.shelf);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                index + (event.key === 'ArrowLeft' ? -1 : 1),
              ),
            );
    buttons[next].focus();
  }

  grid.addEventListener('click', choose);
  host.addEventListener('keydown', keys);
  undoButton.addEventListener('click', undo);
  hintButton.addEventListener('click', hint);
  resetButton.addEventListener('click', reset);
  api.setHint(
    'Sort each kind onto its own full shelf. Select a top parcel, then a matching parcel or an empty shelf. Undo is always available.',
  );
  render();
  return () => {
    done = true;
    grid.removeEventListener('click', choose);
    host.removeEventListener('keydown', keys);
    undoButton.removeEventListener('click', undo);
    hintButton.removeEventListener('click', hint);
    resetButton.removeEventListener('click', reset);
  };
}
