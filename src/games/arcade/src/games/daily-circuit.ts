import type { ArcadeApi } from '../lib/types.ts';
import { daySeed, seeded } from '../lib/core.ts';

const DIRECTIONS = [
  { bit: 1, opposite: 4, dx: 0, dy: -1 },
  { bit: 2, opposite: 8, dx: 1, dy: 0 },
  { bit: 4, opposite: 1, dx: 0, dy: 1 },
  { bit: 8, opposite: 2, dx: -1, dy: 0 },
];

export function rotateTile(mask: number, turns = 1) {
  const count = ((turns % 4) + 4) % 4;
  let value = mask & 15;
  for (let i = 0; i < count; i += 1) value = ((value << 1) & 15) | (value >> 3);
  return value;
}

export function inspectCircuit(tiles: number[], size: number, source: number) {
  const powered = new Set<number>();
  if (
    size < 1 ||
    tiles.length !== size * size ||
    source < 0 ||
    source >= tiles.length
  ) {
    return { powered, openEnds: 0, solved: false };
  }
  const queue = [source];
  powered.add(source);
  let openEnds = 0;
  for (let index = 0; index < tiles.length; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    for (const direction of DIRECTIONS) {
      if (!(tiles[index] & direction.bit)) continue;
      const nx = x + direction.dx;
      const ny = y + direction.dy;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= size ||
        ny >= size ||
        !(tiles[ny * size + nx] & direction.opposite)
      )
        openEnds += 1;
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % size;
    const y = Math.floor(index / size);
    for (const direction of DIRECTIONS) {
      const nx = x + direction.dx;
      const ny = y + direction.dy;
      if (
        !(tiles[index] & direction.bit) ||
        nx < 0 ||
        ny < 0 ||
        nx >= size ||
        ny >= size
      )
        continue;
      const neighbor = ny * size + nx;
      if (tiles[neighbor] & direction.opposite && !powered.has(neighbor)) {
        powered.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return {
    powered,
    openEnds,
    solved: powered.size === tiles.length && openEnds === 0,
  };
}

export function createCircuit(seed: string | number, size = 5) {
  if (!Number.isInteger(size) || size < 2 || size > 8)
    throw new RangeError('Circuit size must be between 2 and 8.');
  const random = seeded(String(seed));
  const solution = Array<number>(size * size).fill(0);
  const source = Math.floor(size / 2) * size + Math.floor(size / 2);
  const visited = new Set([source]);
  const frontier = [source];
  // Randomized Prim construction guarantees one connected network without loops.
  while (visited.size < solution.length) {
    const position = Math.floor(random() * frontier.length);
    const index = frontier[position];
    const x = index % size;
    const y = Math.floor(index / size);
    const choices = DIRECTIONS.filter(({ dx, dy }) => {
      const nx = x + dx;
      const ny = y + dy;
      return (
        nx >= 0 &&
        ny >= 0 &&
        nx < size &&
        ny < size &&
        !visited.has(ny * size + nx)
      );
    });
    if (!choices.length) {
      frontier.splice(position, 1);
      continue;
    }
    const direction = choices[Math.floor(random() * choices.length)];
    const neighbor = (y + direction.dy) * size + x + direction.dx;
    solution[index] |= direction.bit;
    solution[neighbor] |= direction.opposite;
    visited.add(neighbor);
    frontier.push(neighbor);
  }
  const tiles = solution.map((mask) =>
    rotateTile(mask, Math.floor(random() * 4)),
  );
  if (inspectCircuit(tiles, size, source).solved) {
    const index = tiles.findIndex((mask) => mask !== 15);
    tiles[index] = rotateTile(tiles[index]);
  }
  return { seed: String(seed), size, source, solution, tiles };
}

function tileName(mask: number) {
  const count = DIRECTIONS.filter(({ bit }) => mask & bit).length;
  if (count === 1) return 'bulb';
  if (count === 4) return 'four-way junction';
  if (count === 3) return 'T junction';
  return mask === 5 || mask === 10 ? 'straight wire' : 'elbow wire';
}

function tileArt(mask: number, powered: boolean, source: boolean) {
  const color = powered ? '#e4ba65' : '#81977a';
  const paths = ['M40 40V0', 'M40 40H80', 'M40 40V80', 'M40 40H0'];
  const wires = DIRECTIONS.map(({ bit }, i) =>
    mask & bit ? `<path d="${paths[i]}"/>` : '',
  ).join('');
  const degree = DIRECTIONS.filter(({ bit }) => mask & bit).length;
  let center =
    '<circle cx="40" cy="40" r="8" fill="#233a2c" stroke="' +
    color +
    '" stroke-width="3"/><circle cx="40" cy="40" r="3" fill="' +
    color +
    '"/>';
  if (degree === 1)
    center = `<circle cx="40" cy="35" r="13" fill="${powered ? '#eac775' : '#596d52'}" stroke="#1a3025" stroke-width="3"/><circle cx="37" cy="31" r="4" fill="${powered ? '#fff1b6' : '#8c9d7b'}"/><path d="M34 48h12v7H34z" fill="#b6ad7f"/><path d="M35 50h10M35 53h10" stroke="#354b34" stroke-width="1.5"/>`;
  if (source)
    center =
      '<rect x="25" y="22" width="30" height="37" rx="3" fill="#dbb860" stroke="#263b2a" stroke-width="3"/><path d="M34 19h12M43 29l-9 13h7l-4 10 11-15h-8z" fill="#35452d" stroke="#35452d" stroke-width="2" stroke-linejoin="round"/>';
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><g fill="none" stroke="#172e21" stroke-width="13" stroke-linecap="square">${wires}</g><g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="square">${wires}</g><g fill="none" stroke="${powered ? '#f2d48c' : '#9caf8a'}" stroke-width="2" stroke-linecap="square">${wires}</g>${center}</svg>`;
}

export function mount(host: HTMLElement, api: ArcadeApi) {
  let puzzle: ReturnType<typeof createCircuit>;
  let moves = 0;
  let done = false;
  let mode = 'daily';
  let practice = 0;
  let buttons: HTMLButtonElement[] = [];
  const today = daySeed();
  host.innerHTML = `<section class="dc-root"><div class="dc-layout"><div class="dc-machine"><div class="dc-machine-header"><span>POWER DISTRIBUTION</span><span class="dc-tag" data-dc-tag></span></div><div class="dc-grid" role="group" aria-label="Rotating circuit puzzle"></div><div class="dc-machine-footer"><span data-dc-power></span><div class="dc-meter" aria-hidden="true"><div class="dc-meter-fill"></div></div><span data-dc-bulbs></span></div></div><aside class="dc-aside"><div class="dc-date" data-dc-date></div><h3>Close the circuit.</h3><p>Turn the tiles to link every wire and bulb to the battery. Gold traces carry power.</p><div class="dc-light-note"><strong>Tap a tile</strong> to turn it clockwise. Shift + tap turns it back. With a keyboard, use arrow keys to move and Enter or Space to turn.</div><p class="dc-status" role="status" aria-live="polite"></p><button class="dc-button" type="button" data-dc-practice>Try a practice circuit</button><button class="dc-button" type="button" data-dc-reset>Reset this circuit</button><div class="dc-legend"><span><i class="dc-dot on"></i>Powered</span><span><i class="dc-dot"></i>Waiting</span></div></aside></div></section>`;
  const grid = host.querySelector<HTMLElement>('.dc-grid')!;
  const status = host.querySelector<HTMLElement>('.dc-status')!;
  const practiceButton = host.querySelector<HTMLElement>('[data-dc-practice]')!;
  const resetButton = host.querySelector<HTMLElement>('[data-dc-reset]')!;

  function render() {
    const state = inspectCircuit(puzzle.tiles, puzzle.size, puzzle.source);
    const bulbs = puzzle.tiles
      .map((mask, index) => ({ mask, index }))
      .filter(
        ({ mask, index }) =>
          index !== puzzle.source && tileName(mask) === 'bulb',
      );
    const litBulbs = bulbs.filter(({ index }) =>
      state.powered.has(index),
    ).length;
    buttons.forEach((button, index) => {
      const powered = state.powered.has(index);
      const source = index === puzzle.source;
      const name = source ? 'battery' : tileName(puzzle.tiles[index]);
      const connections = DIRECTIONS.filter(
        ({ bit }) => puzzle.tiles[index] & bit,
      )
        .map(
          ({ bit }) =>
            (
              ({ 1: 'up', 2: 'right', 4: 'down', 8: 'left' }) as Record<
                number,
                string
              >
            )[bit],
        )
        .join(', ');
      button.className = `dc-tile${powered ? ' dc-powered' : ''}${source ? ' dc-source' : ''}`;
      button.innerHTML = tileArt(puzzle.tiles[index], powered, source);
      button.setAttribute(
        'aria-label',
        `Row ${Math.floor(index / puzzle.size) + 1}, column ${(index % puzzle.size) + 1}: ${name}, ${powered ? 'powered' : 'unpowered'}, connects ${connections}. ${puzzle.tiles[index] === 15 ? 'Fixed junction.' : 'Press to rotate.'}`,
      );
    });
    host.querySelector<HTMLElement>('[data-dc-power]')!.textContent =
      `${state.powered.size}/${puzzle.tiles.length} linked`;
    host.querySelector<HTMLElement>('[data-dc-bulbs]')!.textContent =
      `${litBulbs}/${bulbs.length} bulbs`;
    host.querySelector<HTMLElement>('.dc-meter-fill')!.style.width =
      `${(state.powered.size / puzzle.tiles.length) * 100}%`;
    api.setStats([
      { label: 'Turns', value: moves },
      { label: 'Bulbs lit', value: `${litBulbs}/${bulbs.length}` },
      {
        label: 'Board',
        value: mode === 'daily' ? 'Daily' : `${puzzle.size} × ${puzzle.size}`,
      },
    ]);
    status.textContent = state.solved
      ? 'Every bulb is connected. Circuit complete.'
      : moves === 0
        ? 'Start at the battery and work your way out. Every wire end needs a matching neighbor.'
        : `${state.openEnds} wire ${state.openEnds === 1 ? 'end needs' : 'ends need'} a matching neighbor. Keep following the copper.`;
    if (state.solved && !done) {
      done = true;
      const score = Math.max(100, puzzle.tiles.length * 100 - moves * 12);
      if (mode === 'daily')
        api.save('daily-circuit-last-solve', { day: today, moves, score });
      api.finish({
        title: 'You lit up the day.',
        message: `All ${bulbs.length} bulbs are glowing in ${moves} turns. ${mode === 'daily' ? 'A fresh daily circuit arrives tomorrow.' : 'A lovely little practice run.'}`,
        score,
        unit: 'points',
      });
    }
  }

  function start(seed: string | number, size: number) {
    puzzle = createCircuit(seed, size);
    moves = 0;
    done = false;
    grid.style.setProperty('--dc-size', String(size));
    grid.innerHTML = '';
    buttons = puzzle.tiles.map((mask, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.tabIndex = index === puzzle.source ? 0 : -1;
      grid.append(button);
      return button;
    });
    host.querySelector<HTMLElement>('[data-dc-tag]')!.textContent =
      `${size} × ${size} · ${mode === 'daily' ? 'daily' : 'practice'}`;
    host.querySelector<HTMLElement>('[data-dc-date]')!.textContent =
      mode === 'daily'
        ? `Daily edition · ${today} UTC`
        : `Practice edition · ${practice}`;
    practiceButton.textContent =
      mode === 'daily' ? 'Try a practice circuit' : 'Another practice circuit';
    api.setHint(
      'Rotate every tile into one complete circuit. Tap or press Enter / Space; arrow keys move between tiles.',
    );
    render();
  }

  function turn(event: MouseEvent) {
    const button = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.dc-tile');
    if (!button || done || api.isPaused()) return;
    const index = Number(button.dataset.index);
    buttons.forEach((item) => {
      item.tabIndex = item === button ? 0 : -1;
    });
    button.focus({ preventScroll: true });
    if (puzzle.tiles[index] === 15) {
      status.textContent =
        'This four-way junction already connects in every direction. Turn its neighbors instead.';
      return;
    }
    puzzle.tiles[index] = rotateTile(
      puzzle.tiles[index],
      event.shiftKey ? -1 : 1,
    );
    moves += 1;
    api.sound('tap');
    render();
  }

  function navigate(event: KeyboardEvent) {
    const button = (
      event.target instanceof Element ? event.target : null
    )?.closest<HTMLElement>('.dc-tile');
    if (!button || api.isPaused()) return;
    const index = Number(button.dataset.index);
    let next = index;
    const size = puzzle.size;
    if (event.key === 'ArrowLeft') next = index % size ? index - 1 : index;
    else if (event.key === 'ArrowRight')
      next = index % size < size - 1 ? index + 1 : index;
    else if (event.key === 'ArrowUp')
      next = index >= size ? index - size : index;
    else if (event.key === 'ArrowDown')
      next = index + size < buttons.length ? index + size : index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons.forEach((item, i) => {
      item.tabIndex = i === next ? 0 : -1;
    });
    buttons[next].focus();
  }

  function openPractice() {
    if (api.isPaused() || done) return;
    mode = 'practice';
    practice += 1;
    start(
      `${today}-practice-${practice}-${Date.now()}`,
      [4, 5, 6][(practice - 1) % 3],
    );
  }

  function reset() {
    if (api.isPaused() || done) return;
    start(puzzle.seed, puzzle.size);
  }

  grid.addEventListener('click', turn);
  grid.addEventListener('keydown', navigate);
  practiceButton.addEventListener('click', openPractice);
  resetButton.addEventListener('click', reset);
  start(today, 5);
  return () => {
    grid.removeEventListener('click', turn);
    grid.removeEventListener('keydown', navigate);
    practiceButton.removeEventListener('click', openPractice);
    resetButton.removeEventListener('click', reset);
    done = true;
  };
}
