import type { GameState, UpgradeId } from './engine.ts';
interface Cell {
  col: number;
  row: number;
}
interface Route {
  returning: boolean;
  path: Cell[];
  target: Cell;
}
import { COLS, ROWS, SURFACE, TILE, nearBase, UPGRADE_DEFS } from './engine.ts';

const ORES = new Set(['iron', 'crystal', 'gold']);
const cellKey = (col: number, row: number) => row * COLS + col;
const center = (point: Cell) => ({
  x: (point.col + 0.5) * TILE,
  y: (point.row + 0.5) * TILE,
});

// Search only when a destination changes. Digging costs time; existing tunnels
// are cheaper and are the only routes used when hauling a full load home.
function findRoute(state: GameState, returning: boolean): Route | null {
  const p = state.player;
  const start = {
    col: Math.floor(p.x / TILE),
    row: Math.floor(p.y / TILE),
    cost: 0,
  };
  const home = { col: Math.floor(state.base.x / TILE), row: SURFACE - 1 };
  const frontier = [start],
    costs = new Map([[cellKey(start.col, start.row), 0]]),
    previous = new Map<number, number>();
  while (frontier.length) {
    frontier.sort((a, b) => b.cost - a.cost);
    const current = frontier.pop()!,
      key = cellKey(current.col, current.row);
    if (current.cost !== costs.get(key)) continue;
    const cell = state.tiles[current.row][current.col];
    const arrived = returning
      ? current.col === home.col && current.row === home.row
      : ORES.has(cell.type);
    if (arrived) {
      const path = [{ col: current.col, row: current.row }];
      let cursor = key;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor)!;
        path.push({ col: cursor % COLS, row: Math.floor(cursor / COLS) });
      }
      path.reverse();
      return {
        returning,
        path,
        target: { col: current.col, row: current.row },
      };
    }
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const col = current.col + dx,
        row = current.row + dy;
      if (col < 0 || col >= COLS || row < SURFACE - 1 || row >= ROWS) continue;
      const next = state.tiles[row][col];
      if (
        next.type === 'bedrock' ||
        (next.type !== 'air' && (returning || row <= SURFACE))
      )
        continue;
      const cost =
        current.cost +
        TILE / p.speed +
        next.hp / (1.8 * (1 + state.upgrades.drill * 0.55));
      const nextKey = cellKey(col, row);
      if (cost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, cost);
      previous.set(nextKey, key);
      frontier.push({ col, row, cost });
    }
  }
  return null;
}

function chooseUpgrade(state: GameState) {
  if (!nearBase(state)) return null;
  const affordable = (id: UpgradeId) => {
    const definition = UPGRADE_DEFS.find((def) => def.id === id)!,
      level = state.upgrades[id];
    return (
      level < definition.max &&
      state.credits >=
        definition.costs[Math.min(level, definition.costs.length - 1)]
    );
  };
  if (state.base.hp <= state.base.maxHp - 45 && affordable('repair'))
    return 'repair';
  if (state.upgrades.turret < 2 && affordable('turret')) return 'turret';
  if (
    state.upgrades.turret >= 2 &&
    state.upgrades.armor < 1 &&
    affordable('armor')
  )
    return 'armor';
  return null;
}

/** Optional attract-mode player. Reads state and returns ordinary player actions. */
export function createPilot() {
  let route: Route | null = null,
    lastMode = '',
    lastPhase = '',
    lastTime = -1;
  return function pilot(state: GameState) {
    const action = {
      input: { dx: 0, dy: 0, drill: false, fire: false, recall: false },
      interact: false,
      upgradeId: null as UpgradeId | null,
    };
    if (!['mining', 'wave'].includes(state.phase)) return action;
    const p = state.player;
    if (
      state.phase !== lastPhase ||
      p.mode !== lastMode ||
      state.totalTime < lastTime
    )
      route = null;
    lastPhase = state.phase;
    lastMode = p.mode;
    lastTime = state.totalTime;
    action.upgradeId = chooseUpgrade(state);
    const defending = state.phase === 'wave' || state.waveTimer < 8;
    if (defending && p.mode === 'turret') {
      action.input.fire = state.phase === 'wave';
      return action;
    }
    if (!defending && p.mode === 'turret') {
      action.interact = true;
      return action;
    }
    if (defending && nearBase(state)) {
      action.interact = true;
      action.input.fire = state.phase === 'wave';
      return action;
    }
    const returning = defending || p.cargo.length >= p.capacity;
    if (returning && !nearBase(state) && p.recallCooldown <= 0) {
      action.input.recall = true;
      route = null;
      return action;
    }
    if (returning && nearBase(state)) return action; // The engine deposits this frame.
    if (
      !route ||
      route.returning !== returning ||
      (!returning &&
        state.tiles[route.target.row][route.target.col].type === 'air')
    ) {
      route = findRoute(state, returning);
    }
    if (!route) return action;
    while (route.path.length) {
      const waypoint = center(route.path[0]);
      const dx = waypoint.x - p.x,
        dy = waypoint.y - p.y;
      if (Math.abs(dx) <= 3.5 && Math.abs(dy) <= 3.5) {
        route.path.shift();
        continue;
      }
      // Keep turns near tile centers so the suit never clips a tunnel corner.
      // Ease toward the waypoint within one maximum engine step. This avoids
      // oscillating across tile centers when a demo tab runs at a low frame rate.
      const steer = (delta: number) =>
        Math.max(-1, Math.min(1, delta / (p.speed * 0.1)));
      if (Math.abs(dx) > 3.5) action.input.dx = steer(dx);
      else action.input.dy = steer(dy);
      action.input.drill = !returning;
      return action;
    }
    route = null;
    return action;
  };
}
