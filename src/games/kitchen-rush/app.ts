import {
  INGREDIENTS,
  RECIPES,
  safeScore,
  createShift,
  startShift,
  pauseShift,
  advanceShift,
  chooseOrder,
  addIngredient,
  undoIngredient,
  clearPlate,
  serveOrder,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const pauseIcon =
      '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    const playIcon =
      '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
      scope.byId<T>(id);
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastAssembly = '',
      layerId = 0;
    let state = createShift(),
      lastRevision = -1,
      lastTime = 0,
      raf = 0,
      disposed = false,
      best = 0,
      sound = false,
      audio: AudioContext | undefined;
    try {
      best = safeScore(
        JSON.parse(localStorage.getItem('kitchen-rush-best') ?? 'null'),
      );
    } catch {}
    $('best').textContent = String(best);
    const layer: Record<string, string> = {
      bun: '<path d="M8 30C8 5 35 2 70 2s62 3 62 28v7H8Z" fill="#eeb24f" stroke="#aa652d" stroke-width="2"/><path d="M12 30h116" stroke="#fbd481" stroke-width="4"/><g stroke="#fff1b3" stroke-width="3" stroke-linecap="round"><path d="m39 12 4 2m18-5 3 2m19 0-2 3m19 1 3 2m-49 4 3-1m19 3 3-1"/></g>',
      patty:
        '<path d="M8 15Q15 6 35 9L107 8Q130 9 133 20l-3 9Q75 39 11 29Z" fill="#74402e" stroke="#452f27" stroke-width="2"/><path d="M19 18q8 5 18 0m14 5 13-4m15-1 14 5m17-7 10 4" stroke="#a9683e" stroke-width="3" fill="none"/>',
      cheese:
        '<path d="m6 14 123-6 5 13-30 4-19 12-18-10-38 1-14-6Z" fill="#f7c639" stroke="#d99725" stroke-width="2"/>',
      lettuce:
        '<path d="M5 21Q-1 11 14 10Q17-1 34 8Q42-2 56 7Q68-3 82 6Q100-2 107 7Q128 1 132 13Q147 19 132 29Q122 36 109 28Q96 39 82 29Q63 39 54 28Q36 35 29 28Q11 34 5 21Z" fill="#6f9d42" stroke="#3c712e" stroke-width="2"/><path d="M19 17q51 13 101-1" fill="none" stroke="#acc76c" stroke-width="3"/>',
      tomato:
        '<ellipse cx="70" cy="21" rx="63" ry="14" fill="#d94f35" stroke="#aa3327" stroke-width="2"/><ellipse cx="70" cy="18" rx="52" ry="9" fill="#ed8060"/><path d="m35 15 5 4m25-7v6m27-5-4 6m20-2-6 3" stroke="#ffe3a1" stroke-width="3"/>',
      pickle:
        '<g fill="#668444" stroke="#405f36" stroke-width="2"><ellipse cx="30" cy="21" rx="24" ry="12"/><ellipse cx="74" cy="17" rx="25" ry="13"/><ellipse cx="111" cy="23" rx="23" ry="11"/></g><g fill="none" stroke="#c2c978" stroke-width="3"><path d="m17 20 20 1m25-4 21-1m16 7h19"/></g>',
    };
    function ingredient(id: string) {
      const key = `food-${++layerId}`;
      const shades: Record<string, string[]> = {
        bun: ['#ffe29b', '#e8a447', '#a85928'],
        patty: ['#a1643e', '#683924', '#3c251c'],
        cheese: ['#ffe389', '#f5bd31', '#c98220'],
        lettuce: ['#a7cc67', '#669b39', '#3b6928'],
        tomato: ['#ffac80', '#df6744', '#a63626'],
        pickle: ['#a4bc63', '#6b8d43', '#365a2d'],
      };
      const [light, mid, dark] = shades[id];
      const art = layer[id].replace(
        /fill="#[a-fA-F0-9]{6}"/,
        `fill="url(#${key})"`,
      );
      const gloss =
        id === 'bun'
          ? '<path d="M18 23Q29 8 71 8q38 0 50 13" stroke="#fff0b766" stroke-width="2" fill="none"/><path d="M14 33h113" stroke="#aa5c2644" stroke-width="2"/>'
          : id === 'patty'
            ? '<g stroke="#301b1866" stroke-width="2"><path d="m29 12 7 17m20-18 7 20m19-21 8 20m17-19 6 17"/></g>'
            : id === 'tomato'
              ? '<path d="M19 25q50 10 100-1" fill="none" stroke="#942a2555" stroke-width="2"/>'
              : '';
      return `<svg data-kind="${id}" viewBox="0 0 140 40" aria-hidden="true"><defs><linearGradient id="${key}" x2="0" y2="1"><stop stop-color="${light}"/><stop offset=".48" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>${art}${gloss}</svg>`;
    }
    function customer(n: number, worried = false) {
      const skins = [
        '#d59468',
        '#edbe8a',
        '#ba805d',
        '#efc59e',
        '#dba476',
        '#a97558',
      ];
      const hats = [
        '#a7382b',
        '#638159',
        '#d0a540',
        '#4e6f7e',
        '#744b59',
        '#cb703a',
      ];
      return `<svg class="customer" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="29" fill="#eadcc1"/><path d="M7 60q0-23 23-23t23 23" fill="${hats[n]}"/><ellipse cx="30" cy="27" rx="17" ry="19" fill="${skins[n]}"/><path d="M12 24q-2-20 19-21t19 21l-10-8-8 3-8-5Z" fill="${n % 2 ? '#69452f' : '#3d342c'}"/><circle cx="24" cy="28" r="1.5" fill="#3b3025"/><circle cx="36" cy="28" r="1.5" fill="#3b3025"/><path d="${worried ? 'M25 37q5-4 10 0' : 'M25 35q5 6 10 0'}" fill="none" stroke="#784432" stroke-width="1.5" stroke-linecap="round"/>${n === 3 ? '<g fill="none" stroke="#4c3b2c"><circle cx="23" cy="28" r="5"/><circle cx="37" cy="28" r="5"/><path d="M28 28h4"/></g>' : ''}</svg>`;
    }
    $('ingredients').innerHTML = INGREDIENTS.map(
      (i) =>
        `<button class="ingredient" data-ingredient="${i.id}" aria-label="Add ${i.name}, shortcut ${i.key}"><kbd>${i.key}</kbd>${ingredient(i.id)}<span>${i.name}</span></button>`,
    ).join('');
    $('play-area').inert = true;
    $('play-area').tabIndex = -1;
    function tone(good = true) {
      if (!sound) return;
      try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
        const o = audio.createOscillator(),
          g = audio.createGain();
        o.connect(g);
        g.connect(audio.destination);
        o.frequency.setValueAtTime(good ? 540 : 170, audio.currentTime);
        o.frequency.exponentialRampToValueAtTime(
          good ? 830 : 100,
          audio.currentTime + 0.12,
        );
        g.gain.setValueAtTime(0.035, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.17);
        o.start();
        o.stop(audio.currentTime + 0.18);
      } catch {}
    }
    function render() {
      $('clock').textContent =
        `${Math.floor(Math.ceil(state.remaining) / 60)}:${String(Math.ceil(state.remaining) % 60).padStart(2, '0')}`;
      $('clock').classList.toggle('urgent', state.remaining < 20);
      if (lastRevision !== state.revision) {
        lastRevision = state.revision;
        const activeTicket =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.dataset.order
            : undefined;
        $('orders').innerHTML =
          state.orders
            .map((o) => {
              const recipe = RECIPES[o.recipe];
              return `<button class="ticket ${o.id === state.selected ? 'selected' : ''}" data-order="${o.id}" aria-pressed="${o.id === state.selected}" aria-label="Order ${o.id}: ${recipe.name}. Recipe: ${recipe.items.join(', ')}"><div class="ticket-head">${customer(o.customer, o.patience < 10)}<div class="ticket-title"><span>NO. ${String(o.id).padStart(2, '0')}</span><strong>${recipe.name}</strong></div></div><div class="ticket-recipe">${recipe.items.map((id, i) => `<span>${i ? '<b class="recipe-arrow">›</b>' : ''}${ingredient(id)}</span>`).join('')}</div><div class="patience"><span data-patience="${o.id}"></span></div><div class="ticket-time"><span>${o.id === state.selected ? '● MAKING THIS' : 'TAP TO SELECT'}</span><span data-time="${o.id}"></span></div></button>`;
            })
            .join('') +
          Array.from(
            { length: 3 - state.orders.length },
            () =>
              '<div class="empty-ticket"><span>Next guest, coming soon.</span></div>',
          ).join('');
        if (activeTicket)
          $('orders')
            .querySelector<HTMLElement>(`[data-order="${activeTicket}"]`)
            ?.focus({ preventScroll: true });
        const selected = state.orders.find((o) => o.id === state.selected);
        $('active-recipe').textContent = selected
          ? RECIPES[selected.recipe].name.toUpperCase()
          : 'FRESH TICKET ON ITS WAY';
        const assemblyKey = state.assembly.join(',');
        if (assemblyKey !== lastAssembly) {
          const previousCount = lastAssembly
            ? lastAssembly.split(',').length
            : 0;
          $('stack').innerHTML = state.assembly.map(ingredient).join('');
          $('stack').style.setProperty(
            '--layers',
            String(Math.max(1, state.assembly.length)),
          );
          if (!reduceMotion && state.assembly.length > previousCount)
            $('stack').lastElementChild?.animate(
              [
                { transform: 'translateY(-22px)', opacity: 0.3 },
                { transform: 'translateY(0)', opacity: 1 },
              ],
              { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' },
            );
          lastAssembly = assemblyKey;
        }
        root
          .querySelector('.plate-scene')!
          .classList.toggle('has-food', state.assembly.length > 0);
        $('stack').setAttribute(
          'aria-label',
          `Your burger, bottom to top: ${state.assembly.join(', ') || 'empty'}`,
        );
        $('plate-note').hidden = state.assembly.length > 0;
        $('score').textContent = String(state.score);
        $('combo').textContent = `×${state.combo}`;
        $('walkouts').textContent = `${Math.min(4, state.walkouts)}/4`;
        $('message').textContent = state.message;
        $<HTMLButtonElement>('undo').disabled = $<HTMLButtonElement>(
          'clear',
        ).disabled = !state.assembly.length;
        $<HTMLButtonElement>('serve').disabled =
          !state.assembly.length || !selected;
      }
      for (const order of state.orders) {
        const meter = $('orders').querySelector<HTMLElement>(
            `[data-patience="${order.id}"]`,
          ),
          timer = $('orders').querySelector<HTMLElement>(
            `[data-time="${order.id}"]`,
          );
        if (meter) {
          meter.style.transform = `scaleX(${order.patience / order.initialPatience})`;
          meter.style.background = order.patience < 10 ? '#b93025' : '#58825a';
        }
        if (timer) {
          timer.textContent = `${Math.ceil(order.patience)}s`;
          timer.classList.toggle('warning', order.patience < 10);
        }
      }
    }
    function begin() {
      state = createShift();
      lastRevision = -1;
      startShift(state);
      lastTime = performance.now();
      $('overlay').hidden = true;
      $('play-area').inert = false;
      $<HTMLButtonElement>('pause').disabled = $<HTMLButtonElement>(
        'restart',
      ).disabled = false;
      $<HTMLButtonElement>('pause').innerHTML = pauseIcon + ' Pause';
      $<HTMLButtonElement>('pause').setAttribute('aria-label', 'Pause shift');
      $('shift-label').textContent = 'THE KITCHEN IS OPEN';
      render();
      $('orders').querySelector('button')?.focus({ preventScroll: true });
    }
    function togglePause() {
      if (!['running', 'paused'].includes(state.phase)) return;
      pauseShift(state);
      lastTime = performance.now();
      const paused = state.phase === 'paused';
      $('play-area').inert = paused;
      $('overlay').hidden = !paused;
      $<HTMLButtonElement>('pause').innerHTML = paused
        ? playIcon + ' Resume'
        : pauseIcon + ' Pause';
      $<HTMLButtonElement>('pause').setAttribute(
        'aria-label',
        paused ? 'Resume shift' : 'Pause shift',
      );
      $('shift-label').textContent = paused
        ? 'TAKING A BREATHER'
        : 'THE KITCHEN IS OPEN';
      if (paused) {
        $('overlay').innerHTML =
          '<div class="receipt"><h2>Take a breather.</h2><p>The grill is off. Your customers and the clock will wait.</p><button class="big-button" data-action="resume">BACK TO THE GRILL</button></div>';
        $('overlay').querySelector('button')!.focus();
      } else
        $('orders').querySelector('button')?.focus({ preventScroll: true });
    }
    function finish() {
      const newBest = state.score > best;
      best = Math.max(best, state.score);
      try {
        localStorage.setItem('kitchen-rush-best', JSON.stringify(best));
      } catch {}
      $('best').textContent = String(best);
      $<HTMLButtonElement>('pause').disabled = true;
      $('play-area').inert = true;
      $('shift-label').textContent = 'THAT’S A WRAP';
      $('overlay').hidden = false;
      $('overlay').innerHTML =
        `<div class="receipt"><h2>${state.result === 'closed' ? 'A little too hot!' : 'Order up, chef!'}</h2><div class="receipt-score">${state.score}</div><small>${newBest ? 'A FRESH PERSONAL BEST' : 'TOTAL TIPS EARNED'}</small><div class="receipt-lines"><p>Happy customers <b>${state.served}</b></p><p>Orders to fix <b>${state.mistakes}</b></p><p>Walkouts <b>${Math.min(4, state.walkouts)} / 4</b></p><p>Your best shift <b>${best}</b></p></div><p>${state.result === 'closed' ? 'Four guests left the queue. Try serving the oldest ticket first.' : 'The lunch rush is over. The next great shift is yours.'}</p><button class="big-button" data-action="start">ONE MORE SHIFT</button></div>`;
      $('overlay').querySelector('button')!.focus();
    }
    function add(id: string) {
      if (addIngredient(state, id)) {
        tone();
        render();
        $('play-area').focus({ preventScroll: true });
      }
    }
    function serve() {
      const result = serveOrder(state);
      if (
        !result.ok &&
        (result.reason === 'empty' || result.reason === 'inactive')
      )
        return;
      tone(result.ok);
      render();
      const pop = $('service-pop');
      pop.getAnimations().forEach((animation) => animation.cancel());
      pop.textContent = result.ok
        ? `SERVED +${result.earned}`
        : 'CHECK THE TICKET';
      pop.classList.toggle('error', !result.ok);
      if (!reduceMotion)
        pop.animate(
          [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 1, transform: 'translateY(-12px)', offset: 0.7 },
            { opacity: 0, transform: 'translateY(-22px)' },
          ],
          { duration: 900, fill: 'forwards', easing: 'ease-out' },
        );
      else {
        pop.textContent = '';
      }
    }
    const controller = new AbortController(),
      options = { signal: controller.signal };
    scope.listen(
      $('ingredients'),
      'click',
      (e) => {
        if (!(e.target instanceof Element)) return;
        const b = e.target.closest<HTMLElement>('[data-ingredient]');
        if (b) add(b.dataset.ingredient ?? '');
      },
      options,
    );
    scope.listen(
      $('orders'),
      'click',
      (e) => {
        if (!(e.target instanceof Element)) return;
        const b = e.target.closest<HTMLElement>('[data-order]');
        if (b) {
          chooseOrder(state, Number(b.dataset.order));
          render();
        }
      },
      options,
    );
    scope.listen(
      $('overlay'),
      'click',
      (e) => {
        if (!(e.target instanceof Element)) return;
        const b = e.target.closest('button');
        if (b?.id === 'start' || b?.dataset.action === 'start') begin();
        else if (b?.dataset.action === 'resume') togglePause();
      },
      options,
    );
    scope.listen(
      $<HTMLButtonElement>('undo'),
      'click',
      () => {
        undoIngredient(state);
        render();
      },
      options,
    );
    scope.listen(
      $<HTMLButtonElement>('clear'),
      'click',
      () => {
        clearPlate(state);
        render();
      },
      options,
    );
    scope.listen($<HTMLButtonElement>('serve'), 'click', serve, options);
    scope.listen($<HTMLButtonElement>('pause'), 'click', togglePause, options);
    scope.listen($<HTMLButtonElement>('restart'), 'click', begin, options);
    scope.listen(
      $<HTMLButtonElement>('sound'),
      'click',
      () => {
        sound = !sound;
        $<HTMLButtonElement>('sound').textContent = sound
          ? 'Sound on'
          : 'Sound off';
        $<HTMLButtonElement>('sound').setAttribute(
          'aria-pressed',
          String(sound),
        );
        tone();
      },
      options,
    );
    scope.listen(
      window,
      'keydown',
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (
          e.repeat ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          e.target.closest('input,textarea,select,[contenteditable]')
        )
          return;
        if (e.key.toLowerCase() === 'p' || e.key === 'Escape') {
          if (['running', 'paused'].includes(state.phase)) {
            e.preventDefault();
            togglePause();
          }
          return;
        }
        if (
          state.phase !== 'running' ||
          e.target.closest('a') ||
          (e.target.closest('button') && !$('play-area').contains(e.target))
        )
          return;
        const item = INGREDIENTS.find((i) => i.key === e.key);
        if (item) {
          e.preventDefault();
          add(item.id);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          undoIngredient(state);
          render();
        } else if (e.key === 'Enter' && !e.target.closest('button')) {
          e.preventDefault();
          serve();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const i = state.orders.findIndex((o) => o.id === state.selected),
            count = state.orders.length;
          if (count) {
            chooseOrder(
              state,
              state.orders[
                (i + (e.key === 'ArrowRight' ? 1 : count - 1)) % count
              ].id,
            );
            render();
          }
        }
      },
      options,
    );
    scope.listen(
      document,
      'visibilitychange',
      () => {
        if (document.hidden && state.phase === 'running') togglePause();
      },
      options,
    );
    function frame(now: number) {
      if (disposed) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
      lastTime = now;
      const wasRunning = state.phase === 'running';
      advanceShift(state, dt);
      render();
      if (wasRunning && state.phase === 'ended') finish();
      raf = scope.raf(frame);
    }
    scope.listen(window, 'pagehide', (event) => {
      if (event.persisted) {
        if (state.phase === 'running') togglePause();
        return;
      }
      disposed = true;
      scope.cancelFrame(raf);
      controller.abort();
      audio?.close();
    });
    render();
    raf = scope.raf(frame);
    scope.add(() => {
      disposed = true;
      controller.abort();
      audio?.close().catch(() => {});
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
