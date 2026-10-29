interface Garden {
  best: number;
  flowers: number[];
  seeds: string[];
}
type Mode = 'daily' | 'practice';
type Phase = 'ready' | 'active' | 'paused' | 'finished';
type GameElements = {
  '#help-toggle': HTMLButtonElement;
  '#rules-close': HTMLButtonElement;
  '#daily': HTMLButtonElement;
  '#practice': HTMLButtonElement;
  '#pause': HTMLButtonElement;
  '#restart': HTMLButtonElement;
  '#finish': HTMLButtonElement;
  '#start': HTMLButtonElement;
  '#undo': HTMLButtonElement;
  '#submit': HTMLButtonElement;
  '#show-results': HTMLButtonElement;
  '#results-close': HTMLButtonElement;
  '#again': HTMLButtonElement;
  '#replay': HTMLButtonElement;
  '#dictionary-search': HTMLInputElement;
};
import { WORDS, makeBoard, extendPath, assessWord } from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const wordsDocked = matchMedia(
      '(min-width: 900px) and (min-height: 600px)',
    );
    const wordsDrawer = root.querySelector<HTMLDetailsElement>('.word-drawer')!;
    const syncWordsDrawer = () => {
      wordsDrawer.open = wordsDocked.matches;
    };
    syncWordsDrawer();
    scope.listen(wordsDocked, 'change', syncWordsDrawer);
    const $ = <K extends string>(selector: K) =>
      root.querySelector<
        K extends keyof GameElements ? GameElements[K] : HTMLElement
      >(selector)!;
    const day = new Date().toISOString().slice(0, 10);
    let mode: Mode = 'daily';
    let board = makeBoard(`daily-${day}`);
    let phase: Phase = 'ready';
    let path: number[] = [];
    let revealed = false;
    let found = new Set<string>();
    let score = 0;
    let seconds = 180;
    let practiceCount = 0;
    let pointer: {
      id: number;
      first: number;
      last: number;
      moved: boolean;
    } | null = null;
    let lastFrame = 0;
    let lastClock = '';
    let feedbackTimer: ReturnType<typeof setTimeout> | 0 = 0;
    function signal(kind: string) {
      scope.clearTimeout(feedbackTimer);
      $('.board-column').dataset.feedback = kind;
      feedbackTimer = scope.timeout(() => {
        delete $('.board-column').dataset.feedback;
      }, 550);
    }
    function loadGarden(): Garden {
      try {
        const raw: unknown = JSON.parse(
          localStorage.getItem('word-weave-garden') || '{}',
        );
        const value: Record<string, unknown> =
          raw && typeof raw === 'object'
            ? (raw as Record<string, unknown>)
            : {};
        return {
          best:
            typeof value.best === 'number' &&
            Number.isFinite(value.best) &&
            value.best >= 0
              ? Math.floor(value.best)
              : 0,
          flowers: Array.isArray(value.flowers)
            ? [
                ...new Set(
                  value.flowers.filter(
                    (n: unknown): n is number =>
                      typeof n === 'number' &&
                      Number.isInteger(n) &&
                      n >= 0 &&
                      n < 8,
                  ),
                ),
              ]
            : [],
          seeds: Array.isArray(value.seeds)
            ? value.seeds
                .filter(
                  (seed: unknown): seed is string =>
                    typeof seed === 'string' && seed.length < 150,
                )
                .slice(-1000)
            : [],
        };
      } catch {
        return { best: 0, flowers: [], seeds: [] };
      }
    }
    const garden = loadGarden();
    function save() {
      try {
        localStorage.setItem('word-weave-garden', JSON.stringify(garden));
      } catch {
        /* A private or full store does not interrupt play. */
      }
    }
    function flower(index: number, empty = false) {
      const petals = 5 + (index % 4);
      const colors = [
        '#9e653e',
        '#697957',
        '#ad6959',
        '#687863',
        '#b38b3f',
        '#667b80',
        '#825d6b',
        '#6a793a',
      ];
      return `<svg viewBox="0 0 45 65" role="img" aria-label="${empty ? 'Uncollected flower' : `Pressed flower ${index + 1}`}" class="${empty ? 'empty' : ''}"><path d="M23 61V23M23 48C3 48 6 30 23 42M23 39c18 2 16-16 0-8" fill="none" stroke="currentColor" stroke-width="1.5"/>${Array.from({ length: petals }, (_, i) => `<ellipse cx="23" cy="13" rx="5" ry="10" fill="${empty ? 'none' : colors[index]}" stroke="currentColor" stroke-width=".8" transform="rotate(${(i * 360) / petals} 23 23)"/>`).join('')}<circle cx="23" cy="23" r="4" fill="${empty ? 'none' : '#d4b361'}" stroke="currentColor" stroke-width="1"/></svg>`;
    }
    function renderGarden() {
      $('#best').textContent = String(garden.best);
      $('#garden-count').textContent = `${garden.flowers.length} / 8`;
      $('#garden').innerHTML = Array.from({ length: 8 }, (_, index) =>
        flower(index, !garden.flowers.includes(index)),
      ).join('');
    }
    const letters = Array.from({ length: 16 }, (_, index) => {
      const button = document.createElement('button');
      button.className = 'letter';
      button.type = 'button';
      button.dataset.index = String(index);
      button.tabIndex = index === 0 ? 0 : -1;
      $('#letter-board').append(button);
      return button;
    });
    scope.add(() => {
      for (const button of letters) button.remove();
    });
    function renderSelection() {
      letters.forEach((button, index) => {
        const order = path.indexOf(index);
        button.innerHTML =
          board.letters[index] +
          (order >= 0
            ? `<small class="order" aria-hidden="true">${order + 1}</small>`
            : '');
        button.classList.toggle('chosen', order >= 0 && !revealed);
        button.classList.toggle('revealed', order >= 0 && revealed);
        button.setAttribute(
          'aria-label',
          `Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1}: ${board.letters[index]}${order >= 0 ? `, letter ${order + 1} in your path` : ''}`,
        );
        button.setAttribute('aria-pressed', String(order >= 0));
        button.disabled = phase !== 'active';
      });
      const points = path
        .map(
          (index) =>
            `${(index % 4) * 25 + 12.5},${Math.floor(index / 4) * 25 + 12.5}`,
        )
        .join(' ');
      $('#thread').innerHTML = `<polyline points="${points}"/>`;
      $('#current-word').textContent = path.length
        ? path.map((index) => board.letters[index]).join('')
        : 'Choose a first letter';
      $('#current-word').style.fontSize = path.length ? '' : '14px';
      $('#submit').disabled = phase !== 'active' || path.length < 3;
      $('#undo').disabled = phase !== 'active' || !path.length;
    }
    function updateStats() {
      $('#score').textContent = String(score);
      $('.clock').classList.toggle(
        'is-low',
        mode === 'daily' && seconds <= 30 && phase === 'active',
      );
      $('#found-count').textContent =
        `${found.size} / ${board.solutions.length} words`;
      $('#empty-words').hidden = found.size > 0;
      $('#pause').disabled = !['active', 'paused'].includes(phase);
      $('#pause').textContent = phase === 'paused' ? 'Resume' : 'Pause';
      $('#restart').disabled = phase === 'ready';
      $('#finish').disabled = phase !== 'active';
      $('#clock-label').textContent =
        mode === 'daily' ? 'TIME LEFT' : 'TAKE YOUR TIME';
      const time =
        mode === 'practice'
          ? '∞'
          : `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
      if (time !== lastClock) {
        $('#clock').textContent = time;
        lastClock = time;
      }
    }
    function cover(kind: 'ready' | 'paused' | null) {
      const overlay = $('#cover');
      overlay.hidden = !kind;
      if (!kind) return;
      const paused = kind === 'paused';
      overlay.innerHTML = `<h2>${paused ? 'Take a<br><em>breather.</em>' : 'Find your<br>next <em>word.</em>'}</h2><p>${paused ? 'Your time and letters are waiting.' : `Link neighboring letters to gather words.<br>${mode === 'daily' ? 'You have three minutes.' : 'Wander for as long as you like.'}`}</p><button id="${paused ? 'resume' : 'start'}" class="ink-button">${paused ? 'Keep playing' : mode === 'daily' ? 'Start daily puzzle' : 'Start free practice'} <span>→</span></button>`;
    }
    function prepare(nextMode: Mode, newBoard = true) {
      mode = nextMode;
      if (newBoard)
        board = makeBoard(
          mode === 'daily'
            ? `daily-${day}`
            : `practice-${Date.now()}-${++practiceCount}`,
        );
      phase = 'ready';
      path = [];
      found = new Set();
      score = 0;
      seconds = 180;
      revealed = false;
      pointer = null;
      $('#results').hidden = true;
      $('#show-results').hidden = true;
      $('#found-words').replaceChildren();
      $('#daily').classList.toggle('selected', mode === 'daily');
      $('#practice').classList.toggle('selected', mode === 'practice');
      $('#daily').setAttribute('aria-pressed', String(mode === 'daily'));
      $('#practice').setAttribute('aria-pressed', String(mode === 'practice'));
      $('#board-label').textContent =
        mode === 'daily' ? 'THE DAILY PATCH' : 'A PRACTICE PATCH';
      $('#round-note').innerHTML =
        mode === 'daily'
          ? 'Three minutes to explore.<br>See what takes root.'
          : 'An untimed little wander.<br>Stay as long as you like.';
      $('#feedback').textContent =
        `${board.solutions.length} words are growing in this patch. You only need 8 for a flower.`;
      cover('ready');
      renderSelection();
      updateStats();
    }
    function start() {
      phase = 'active';
      lastFrame = performance.now();
      cover(null);
      updateStats();
      renderSelection();
      letters[0].focus({ preventScroll: true });
      if (matchMedia('(min-width: 800px)').matches)
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function pause() {
      if (!['active', 'paused'].includes(phase)) return;
      phase = phase === 'active' ? 'paused' : 'active';
      pointer = null;
      lastFrame = performance.now();
      cover(phase === 'paused' ? 'paused' : null);
      renderSelection();
      updateStats();
      if (phase === 'paused') $('#resume').focus({ preventScroll: true });
      else
        letters
          .find((button) => button.tabIndex === 0)
          ?.focus({ preventScroll: true });
    }
    function select(index: number, tap = false) {
      if (phase !== 'active') return;
      revealed = false;
      const next =
        tap && path.at(-1) === index
          ? path.slice(0, -1)
          : extendPath(path, index);
      if (next) {
        path = next;
        renderSelection();
      } else
        $('#feedback').textContent = path.includes(index)
          ? 'A tile gets one turn per word. Try another neighbor.'
          : 'That letter is a little too far away. Choose a neighbor.';
    }
    function submit() {
      if (phase !== 'active') return;
      const result = assessWord(board, path, found);
      if (!result.ok) {
        $('#feedback').textContent = result.reason;
        signal('error');
        return;
      }
      found.add(result.word);
      score += result.score;
      signal('success');
      const item = document.createElement('li');
      const word = document.createElement('strong');
      word.textContent = result.word;
      const points = document.createElement('span');
      points.textContent = `+${result.score}`;
      item.append(word, points);
      $('#found-words').prepend(item);
      $('#feedback').textContent =
        `${result.word.toUpperCase()} · +${result.score} ${result.score === 1 ? 'point' : 'points'}. ${found.size === 8 ? 'A flower is ready to press when you finish.' : 'A lovely find.'}`;
      path = [];
      renderSelection();
      updateStats();
      if (found.size === board.solutions.length) endRound();
    }
    function endRound() {
      if (!['active', 'paused'].includes(phase)) return;
      phase = 'finished';
      pointer = null;
      path = [];
      revealed = false;
      cover(null);
      garden.best = Math.max(garden.best, score);
      let flowerMessage = '';
      if (found.size >= 8 && !garden.seeds.includes(board.seed)) {
        garden.seeds.push(board.seed);
        if (garden.flowers.length < 8) {
          garden.flowers.push(garden.flowers.length);
          flowerMessage = ' A new flower has joined your collection.';
        } else
          flowerMessage = ' Your pressed-flower collection is in full bloom.';
      }
      save();
      renderGarden();
      renderSelection();
      updateStats();
      $('#results').hidden = false;
      $('#show-results').hidden = false;
      $('#result-title').textContent =
        found.size === board.solutions.length
          ? 'Every word, in bloom.'
          : found.size >= 8
            ? 'A page worth keeping.'
            : 'A little further next time.';
      $('#result-summary').textContent =
        `You gathered ${found.size} of ${board.solutions.length} words for ${score} ${score === 1 ? 'point' : 'points'}.${flowerMessage} ${found.size < 8 ? 'Eight discoveries will earn a pressed flower on your next fresh board.' : ''}`;
      const missed = board.solutions.filter(({ word }) => !found.has(word));
      $('#missed-words').replaceChildren();
      missed.forEach((solution) => {
        const button = document.createElement('button');
        button.textContent = solution.word;
        button.type = 'button';
        scope.listen(button, 'click', () => {
          path = [...solution.path];
          revealed = true;
          renderSelection();
          $('#feedback').textContent =
            `${solution.word.toUpperCase()}: follow the numbered letters. This is a reveal, so it adds no points.`;
          $('#results').hidden = true;
        });
        $('#missed-words').append(button);
      });
      if (!missed.length)
        $('#missed-words').textContent =
          'Not a single word left behind. What a beautiful harvest.';
      $('#feedback').textContent =
        'Round complete. Your results and missed words are ready.';
      $('#results-close').focus({ preventScroll: true });
    }
    scope.listen($('#cover'), 'click', (event) => {
      if (
        (event.target instanceof Element ? event.target : null)?.closest(
          '#start',
        )
      )
        start();
      else if (
        (event.target instanceof Element ? event.target : null)?.closest(
          '#resume',
        )
      )
        pause();
    });
    scope.listen($('#daily'), 'click', () => prepare('daily'));
    scope.listen($('#practice'), 'click', () => prepare('practice'));
    scope.listen($('#pause'), 'click', pause);
    scope.listen($('#restart'), 'click', () => {
      prepare(mode, false);
      start();
    });
    scope.listen($('#finish'), 'click', endRound);
    scope.listen($('#again'), 'click', () => {
      prepare('practice');
      start();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    scope.listen($('#replay'), 'click', () => {
      prepare(mode, false);
      start();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    scope.listen($('#submit'), 'click', submit);
    scope.listen($('#undo'), 'click', () => {
      if (phase === 'active') {
        path.pop();
        renderSelection();
      }
    });
    scope.listen($('#help-toggle'), 'click', () => {
      $('#rules').hidden = !$('#rules').hidden;
      $('#help-toggle').setAttribute(
        'aria-expanded',
        String(!$('#rules').hidden),
      );
    });
    const grid = $('#letter-board');
    scope.listen(grid, 'pointerdown', (event) => {
      const button = (
        event.target instanceof Element ? event.target : null
      )?.closest<HTMLButtonElement>('.letter');
      if (
        !button ||
        phase !== 'active' ||
        (event.pointerType === 'mouse' && event.button !== 0)
      )
        return;
      event.preventDefault();
      const index = Number(button.dataset.index);
      pointer = {
        id: event.pointerId,
        first: index,
        last: index,
        moved: false,
      };
      grid.setPointerCapture(event.pointerId);
      letters.forEach((item, i) => {
        item.tabIndex = i === index ? 0 : -1;
      });
      button.focus({ preventScroll: true });
      select(index, true);
    });
    scope.listen(grid, 'pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId || phase !== 'active')
        return;
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLButtonElement>('.letter');
      if (!hit || !grid.contains(hit)) return;
      const index = Number(hit.dataset.index);
      if (index === pointer.last) return;
      pointer.moved = true;
      pointer.last = index;
      select(index);
    });
    scope.listen(grid, 'pointerup', (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dragged = pointer.moved;
      pointer = null;
      if (grid.hasPointerCapture(event.pointerId))
        grid.releasePointerCapture(event.pointerId);
      if (dragged && path.length >= 3) submit();
    });
    scope.listen(grid, 'pointercancel', () => {
      pointer = null;
    });
    scope.listen(grid, 'click', (event) => {
      if (event.detail === 0) {
        const button = (
          event.target instanceof Element ? event.target : null
        )?.closest<HTMLButtonElement>('.letter');
        if (button) select(Number(button.dataset.index), true);
      }
    });
    scope.listen(grid, 'keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (phase !== 'active') return;
      const button = (
        event.target instanceof Element ? event.target : null
      )?.closest<HTMLButtonElement>('.letter');
      if (!button) return;
      const index = Number(button.dataset.index);
      let next = index;
      if (event.key === 'ArrowLeft') next = index % 4 ? index - 1 : index;
      else if (event.key === 'ArrowRight')
        next = index % 4 < 3 ? index + 1 : index;
      else if (event.key === 'ArrowUp') next = index >= 4 ? index - 4 : index;
      else if (event.key === 'ArrowDown') next = index < 12 ? index + 4 : index;
      else if (event.key === ' ') {
        event.preventDefault();
        select(index, true);
        return;
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        path.pop();
        renderSelection();
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        path = [];
        renderSelection();
        return;
      } else return;
      event.preventDefault();
      letters.forEach((item, i) => {
        item.tabIndex = i === next ? 0 : -1;
      });
      letters[next].focus({ preventScroll: true });
    });
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden && phase === 'active') pause();
    });
    function renderWordbook() {
      const query = $('#dictionary-search').value.toLowerCase().trim();
      $('#dictionary-list').replaceChildren(
        ...WORDS.filter((word) => word.includes(query)).map((word) => {
          const span = document.createElement('span');
          span.textContent = word;
          return span;
        }),
      );
    }
    scope.listen($('#dictionary-search'), 'input', renderWordbook);
    $('#wordbook-count').textContent = WORDS.length.toLocaleString();
    $('#edition').textContent = `${day} · DAILY EDITION · UTC`;
    renderWordbook();
    renderGarden();
    prepare('daily', false);
    function tick(now: number) {
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0;
      lastFrame = now;
      if (phase === 'active' && mode === 'daily') {
        seconds = Math.max(0, seconds - dt);
        updateStats();
        if (seconds === 0) endRound();
      }
      scope.raf(tick);
    }
    scope.raf(tick);
    scope.listen($('#results-close'), 'click', () => {
      $('#results').hidden = true;
    });
    scope.listen($('#show-results'), 'click', () => {
      $('#results').hidden = false;
      $('#results-close').focus({ preventScroll: true });
    });
    scope.listen($('#rules-close'), 'click', () => {
      $('#rules').hidden = true;
      $('#help-toggle').setAttribute('aria-expanded', 'false');
      $('#help-toggle').focus({ preventScroll: true });
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
