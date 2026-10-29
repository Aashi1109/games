export interface Order {
  id: number;
  recipe: number;
  patience: number;
  initialPatience: number;
  customer: number;
}
export interface Shift {
  phase: 'ready' | 'running' | 'paused' | 'ended';
  remaining: number;
  orders: Order[];
  selected: number | null;
  assembly: string[];
  score: number;
  combo: number;
  served: number;
  walkouts: number;
  mistakes: number;
  nextArrival: number;
  nextId: number;
  rng: () => number;
  message: string;
  result: 'closed' | 'complete' | null;
  revision: number;
}
export type ServeResult =
  { ok: true; earned: number } | { ok: false; reason: string };
export const INGREDIENTS = [
  { id: 'bun', name: 'Bun', key: '1' },
  { id: 'patty', name: 'Patty', key: '2' },
  { id: 'cheese', name: 'Cheese', key: '3' },
  { id: 'lettuce', name: 'Lettuce', key: '4' },
  { id: 'tomato', name: 'Tomato', key: '5' },
  { id: 'pickle', name: 'Pickles', key: '6' },
];
export const RECIPES = [
  {
    name: 'The Classic',
    code: 'CLASSIC',
    items: ['bun', 'patty', 'cheese', 'bun'],
  },
  {
    name: 'Garden Party',
    code: 'GARDEN',
    items: ['bun', 'lettuce', 'tomato', 'pickle', 'bun'],
  },
  {
    name: 'Double Trouble',
    code: 'DOUBLE',
    items: ['bun', 'patty', 'cheese', 'patty', 'bun'],
  },
  {
    name: 'The House Special',
    code: 'HOUSE',
    items: ['bun', 'patty', 'lettuce', 'tomato', 'bun'],
  },
  {
    name: 'Big Little Stack',
    code: 'BIG STACK',
    items: ['bun', 'patty', 'cheese', 'lettuce', 'pickle', 'bun'],
  },
  {
    name: 'Golden Garden',
    code: 'GOLDEN',
    items: ['bun', 'cheese', 'tomato', 'cheese', 'bun'],
  },
];
export function safeScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}
export function createShift(rng = Math.random): Shift {
  return {
    phase: 'ready',
    remaining: 120,
    orders: [],
    selected: null,
    assembly: [],
    score: 0,
    combo: 0,
    served: 0,
    walkouts: 0,
    mistakes: 0,
    nextArrival: 5,
    nextId: 1,
    rng,
    message: 'Your counter is ready. Time to make someone’s lunch.',
    result: null,
    revision: 0,
  };
}
function addOrder(state: Shift) {
  if (state.orders.length >= 3) return;
  const recipe = Math.floor(state.rng() * (state.remaining > 80 ? 3 : 6));
  const patience = state.remaining > 80 ? 34 : state.remaining > 40 ? 29 : 25;
  const order = {
    id: state.nextId++,
    recipe,
    patience,
    initialPatience: patience,
    customer: Math.floor(state.rng() * 6),
  };
  state.orders.push(order);
  if (state.selected === null) state.selected = order.id;
  state.revision++;
}
export function startShift(state: Shift) {
  if (state.phase !== 'ready') return false;
  state.phase = 'running';
  addOrder(state);
  addOrder(state);
  state.message = 'Pick a ticket. Build its recipe from left to right.';
  return true;
}
export function pauseShift(state: Shift) {
  if (state.phase === 'running') state.phase = 'paused';
  else if (state.phase === 'paused') state.phase = 'running';
}
export function advanceShift(state: Shift, dt: number) {
  if (state.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  const elapsed = Math.min(dt, state.remaining);
  state.remaining = Math.max(0, state.remaining - elapsed);
  for (const order of state.orders)
    order.patience = Math.max(0, order.patience - elapsed);
  const expired = state.orders.filter((order) => order.patience <= 0);
  if (expired.length) {
    state.walkouts += expired.length;
    state.combo = 0;
    state.orders = state.orders.filter((order) => order.patience > 0);
    if (!state.orders.some((order) => order.id === state.selected))
      state.selected = state.orders[0]?.id ?? null;
    state.message =
      expired.length > 1
        ? `${expired.length} customers left. Take the next order one step at a time.`
        : 'A customer left. A fresh ticket is a fresh start.';
    state.revision++;
  }
  if (state.walkouts >= 4 || state.remaining <= 0) {
    state.phase = 'ended';
    state.result = state.walkouts >= 4 ? 'closed' : 'complete';
    state.revision++;
    return;
  }
  state.nextArrival -= elapsed;
  if (
    (state.nextArrival <= 0 || state.orders.length === 0) &&
    state.orders.length < 3
  ) {
    addOrder(state);
    state.nextArrival =
      state.remaining > 80 ? 8 : state.remaining > 40 ? 6 : 4.5;
  }
}
export function chooseOrder(state: Shift, id: number) {
  if (
    state.phase !== 'running' ||
    !state.orders.some((order) => order.id === id)
  )
    return false;
  state.selected = id;
  state.revision++;
  return true;
}
export function addIngredient(state: Shift, id: string) {
  if (
    state.phase !== 'running' ||
    !INGREDIENTS.some((item) => item.id === id) ||
    state.assembly.length >= 8
  )
    return false;
  state.assembly.push(id);
  state.revision++;
  return true;
}
export function undoIngredient(state: Shift) {
  if (state.phase !== 'running' || state.assembly.length === 0) return false;
  state.assembly.pop();
  state.revision++;
  return true;
}
export function clearPlate(state: Shift) {
  if (state.phase !== 'running') return false;
  state.assembly = [];
  state.revision++;
  return true;
}
export function serveOrder(state: Shift): ServeResult {
  if (state.phase !== 'running') return { ok: false, reason: 'inactive' };
  const order = state.orders.find((item) => item.id === state.selected);
  if (!order || !state.assembly.length) return { ok: false, reason: 'empty' };
  if (order.patience <= 0) return { ok: false, reason: 'expired' };
  const recipe = RECIPES[order.recipe];
  if (
    recipe.items.length !== state.assembly.length ||
    !recipe.items.every((item, i) => state.assembly[i] === item)
  ) {
    state.combo = 0;
    state.mistakes++;
    order.patience = Math.max(0, order.patience - 5);
    state.message =
      'Not quite their order. Check the ticket; undo the top layer to fix it.';
    state.revision++;
    return { ok: false, reason: 'recipe' };
  }
  const earned =
    100 +
    recipe.items.length * 15 +
    Math.round((order.patience / order.initialPatience) * 50) +
    Math.min(state.combo, 7) * 25;
  state.score += earned;
  state.combo++;
  state.served++;
  state.orders = state.orders.filter((item) => item.id !== order.id);
  state.selected = state.orders[0]?.id ?? null;
  state.assembly = [];
  state.message = `${recipe.name}, coming right up! +${earned}${state.combo > 1 ? ` · ${state.combo} perfect orders in a row` : ''}`;
  state.revision++;
  return { ok: true, earned };
}
