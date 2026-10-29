import { RoomError, isRecord, isRoomSession, isRoomState } from './types.ts';
import type {
  Point,
  Stroke,
  RoomState,
  RoomSession,
  RoomPlayer,
} from './types.ts';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Connection lost. Trying again…';
import { canvasPoint } from './viewport.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
      scope.byId<T>(id);
    const canvas = $<HTMLCanvasElement>('drawing');
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('This browser cannot create a drawing canvas.');
    const ctx = context;
    const COLORS = [
      ['Ink', '#353048'],
      ['Coral', '#d96a45'],
      ['Gold', '#e5b841'],
      ['Leaf', '#528661'],
      ['Blue', '#4c81aa'],
      ['Lilac', '#9872bd'],
    ];
    const api = new URL('api/rooms', location.href).pathname;
    let session: RoomSession | null = null;
    let state: RoomState | null = null;
    let solo = false,
      joining = false,
      polling = false,
      busy = false,
      queue = Promise.resolve();
    let brush = 7,
      color = COLORS[0][1],
      eraser = false,
      drawing = false,
      currentId = '',
      lastFlush = 0;
    let draft: Point[] = [],
      pending: Stroke[] = [],
      localStrokes: Stroke[] = [];
    let overlayKey = '',
      rosterKey = '',
      messageKey = '';
    const keyboardCursor: Point = [0.5, 0.5];
    function notice(text: string) {
      if (scope.disposed) return;
      $('notice').textContent = text;
    }
    function storedSession(value: RoomSession | null) {
      if (scope.disposed) return;
      try {
        if (value)
          sessionStorage.setItem(
            `doodle-session:${location.pathname}`,
            JSON.stringify(value),
          );
        else sessionStorage.removeItem(`doodle-session:${location.pathname}`);
      } catch {}
    }
    function entryMode(join: boolean) {
      joining = join;
      $('create-tab').setAttribute('aria-pressed', String(!join));
      $('join-tab').setAttribute('aria-pressed', String(join));
      $('code-field').hidden = !join;
      $<HTMLInputElement>('code').required = join;
      $<HTMLButtonElement>('enter').textContent = join
        ? 'Join room'
        : 'Create room';
    }
    function request(
      path: string,
      body: { name: string },
    ): Promise<RoomSession>;
    function request(path: string): Promise<RoomState>;
    function request(
      path: string,
      body: Record<string, unknown>,
    ): Promise<RoomState | { left: true }>;
    async function request(
      path: string,
      body?: Record<string, unknown>,
    ): Promise<RoomSession | RoomState | { left: true }> {
      if (scope.disposed)
        throw new DOMException('Game unmounted', 'AbortError');
      const controller = new AbortController(),
        timeout = scope.timeout(() => controller.abort(), 7000);
      try {
        const response = await fetch(api + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.any([controller.signal, scope.signal]),
        });
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          throw new Error(
            'The room server is not available. Start the game with pnpm start.',
          );
        }
        if (!response.ok) {
          throw new RoomError(
            isRecord(result) && typeof result.error === 'string'
              ? result.error
              : 'Room request failed.',
            response.status,
          );
        }
        if (scope.disposed)
          throw new DOMException('Game unmounted', 'AbortError');
        if (body && 'name' in body && isRoomSession(result)) return result;
        if (
          body?.action === 'leave' &&
          isRecord(result) &&
          result.left === true
        )
          return { left: true };
        if (isRoomState(result)) return result;
        throw new Error(
          'The studio sent an invalid response. Please try again.',
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          throw new Error(
            'The studio is taking too long to respond. Trying again shortly.',
          );
        throw error;
      } finally {
        scope.clearTimeout(timeout);
      }
    }
    function schedule(fn: () => void | Promise<void>) {
      queue = queue
        .then(() => {
          if (!scope.disposed) return fn();
        })
        .catch((error: unknown) => {
          if (scope.disposed) return;
          notice(errorMessage(error));
          if (
            error instanceof RoomError &&
            (error.status === 401 || error.status === 404)
          ) {
            session = null;
            storedSession(null);
            exitUI();
          }
        });
      return queue;
    }
    function act(data: Record<string, unknown>) {
      return schedule(async () => {
        if (!session) return;
        const next = await request(`/${session.code}/actions`, data);
        if (!('left' in next)) apply(next);
      });
    }
    function enterUI() {
      if (scope.disposed) return;
      setPalette(false);
      setRoster(false);
      document.body.classList.add('in-studio');
      root.querySelector<HTMLElement>('.roster-note')!.textContent =
        '50 points for helping each friend guess. Up to 200 for a speedy answer.';
      $('entry').hidden = true;
      $('workspace').hidden = false;
      $('leave').hidden = false;
      overlayKey = rosterKey = messageKey = '';
      notice('');
      window.scrollTo(0, 0);
    }
    function exitUI() {
      if (scope.disposed) return;
      document.body.classList.remove('in-studio', 'solo-mode');
      $('entry').hidden = false;
      $('workspace').hidden = true;
      $('leave').hidden = true;
      solo = false;
      state = null;
      pending = [];
      draft = [];
      drawing = false;
      history.replaceState(null, '', location.pathname);
      window.scrollTo(0, 0);
    }
    scope.handler($('create-tab'), 'onclick', () => entryMode(false));
    scope.handler($('join-tab'), 'onclick', () => entryMode(true));
    scope.handler($('room-form'), 'onsubmit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      $<HTMLButtonElement>('enter').disabled = true;
      notice('Opening the studio…');
      try {
        const name = $<HTMLInputElement>('name').value.trim();
        session = await request(
          joining
            ? `/${$<HTMLInputElement>('code').value.trim().toUpperCase()}/join`
            : '',
          { name },
        );
        if (scope.disposed) return;
        storedSession(session);
        solo = false;
        enterUI();
        history.replaceState(
          null,
          '',
          `${location.pathname}?room=${session.code}`,
        );
        apply(await request(`/${session.code}`));
      } catch (error) {
        notice(errorMessage(error));
      } finally {
        busy = false;
        $<HTMLButtonElement>('enter').disabled = false;
      }
    });
    function practice() {
      session = null;
      solo = true;
      localStrokes = [];
      enterUI();
      document.body.classList.add('solo-mode');
      root.querySelector<HTMLElement>('.roster-note')!.textContent =
        'No clock. No scores. Try a bold outline, add a little color, and see where your pencil goes.';
      $('room-code').textContent = 'SOLO';
      $('mode-label').textContent = 'YOUR SKETCH STUDIO';
      $('invite').hidden = true;
      $('round').textContent = 'No timer. No pressure.';
      $('timer').textContent = '∞';
      $('duration-label').hidden = true;
      $<HTMLButtonElement>('start').hidden = true;
      $('prompt-label').textContent = 'WARM-UP PROMPT';
      $('prompt').textContent = 'A cat having a very good day';
      $('paper-overlay').hidden = true;
      $('toolbar').hidden = false;
      $('tool-state').hidden = false;
      $('guess-form').hidden = true;
      $('player-count').textContent = '1 artist';
      $('players').replaceChildren(
        playerRow(
          {
            name: $<HTMLInputElement>('name').value.trim() || 'You',
            score: 0,
            connected: true,
          },
          true,
        ),
      );
      $('messages').replaceChildren(
        message(
          'You’re in the solo sketch studio. Invite friends from the home screen for scored multiplayer.',
          'system',
        ),
      );
      $('paper-foot').textContent =
        'Draw with a mouse or finger. Keyboard: arrows move the cursor, hold Shift to draw. Undo and clear are always here.';
      renderCanvas();
    }
    scope.handler($('practice'), 'onclick', practice);
    function message(text: string, kind = 'system', name = '') {
      const p = document.createElement('div');
      p.className = `message ${kind}`;
      if (name) {
        const b = document.createElement('b');
        b.textContent = name + ':';
        p.append(b);
      }
      p.append(document.createTextNode(text));
      return p;
    }
    function playerRow(
      p: Omit<RoomPlayer, 'id'> & { id?: string },
      local = false,
    ) {
      const row = document.createElement('div');
      row.className = 'player';
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = Array.from(p.name.trim())[0]?.toUpperCase() || 'D';
      const info = document.createElement('span');
      info.className = 'player-info';
      const name = document.createElement('b');
      name.textContent = p.name + (state && state.me === p.id ? ' (you)' : '');
      const sub = document.createElement('small');
      sub.textContent = local
        ? 'Resident doodler'
        : !p.connected
          ? 'Reconnecting…'
          : state &&
              state.artist === p.id &&
              ['choosing', 'drawing'].includes(state.phase)
            ? 'Drawing'
            : p.id !== undefined && state?.guessed.includes(p.id)
              ? 'Got it!'
              : p.id === state?.host
                ? 'Room host'
                : 'Art club member';
      info.append(name, sub);
      row.append(avatar, info);
      if (!local) {
        const points = document.createElement('span');
        points.className = 'player-score';
        points.textContent = String(p.score);
        row.append(points);
        if (state && state.me === state.host && p.id !== state.me) {
          const kick = document.createElement('button');
          kick.className = 'kick';
          kick.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
          kick.setAttribute('aria-label', `Remove ${p.name}`);
          scope.handler(kick, 'onclick', () =>
            act({ action: 'kick', playerId: p.id }),
          );
          row.append(kick);
        }
      }
      return row;
    }
    function apply(next: RoomState) {
      if (scope.disposed) return;
      if (solo || !session) return;
      if (next.turnId !== state?.turnId || next.phase !== 'drawing') {
        draft = [];
        drawing = false;
      }
      state = next;
      $('invite').hidden = false;
      $('room-code').textContent = state.code;
      $('mode-label').textContent = 'PRIVATE STUDIO';
      $('timer').textContent = ['lobby', 'finished'].includes(state.phase)
        ? '—'
        : String(state.remaining);
      $('round').textContent =
        state.phase === 'lobby'
          ? 'Waiting for friends'
          : state.phase === 'finished'
            ? 'Final scores'
            : `Round ${Math.min(state.round, state.rounds)} of ${state.rounds}`;
      $('player-count').textContent = `${state.players.length}/8`;
      const roster = JSON.stringify([
        state.players,
        state.artist,
        state.phase,
        state.guessed,
        state.host,
      ]);
      if (roster !== rosterKey) {
        rosterKey = roster;
        $('players').replaceChildren(
          ...[...state.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => playerRow(p)),
        );
      }
      const isHost = state.host === state.me,
        isArtist = state.artist === state.me,
        canDraw = isArtist && state.phase === 'drawing';
      $('duration-label').hidden =
        !isHost || !['lobby', 'finished'].includes(state.phase);
      $<HTMLButtonElement>('start').hidden =
        !isHost || !['lobby', 'finished'].includes(state.phase);
      $<HTMLButtonElement>('start').disabled =
        state.players.filter((p) => p.connected).length < 2;
      $<HTMLButtonElement>('start').textContent =
        state.phase === 'finished' ? 'Play another match' : 'Start the party';
      $('toolbar').hidden = !canDraw;
      $('tool-state').hidden = !canDraw;
      $('guess-form').hidden = false;
      $<HTMLInputElement>('guess').disabled =
        state.phase !== 'drawing' ||
        isArtist ||
        state.guessed.includes(state.me) ||
        state.spectator;
      $('guess-form').querySelector('button')!.disabled =
        $<HTMLInputElement>('guess').disabled;
      $<HTMLInputElement>('guess').placeholder = state.spectator
        ? 'Join the next match…'
        : isArtist
          ? 'Your pencil does the talking…'
          : state.guessed.includes(state.me)
            ? 'You got it! Nicely done.'
            : 'Wild guesses welcome…';
      const artistName =
        state.players.find((p) => p.id === next.artist)?.name || 'The artist';
      $('prompt-label').textContent = canDraw
        ? 'YOUR SECRET WORD'
        : state.phase === 'drawing'
          ? `${artistName.toUpperCase()} IS DRAWING`
          : state.phase === 'reveal'
            ? 'THE WORD WAS'
            : 'THE ART CLUB';
      $('prompt').textContent = canDraw
        ? state.word
        : state.phase === 'drawing'
          ? state.hint
          : state.phase === 'reveal'
            ? state.reveal
            : state.phase === 'finished'
              ? 'Every masterpiece deserves an encore.'
              : 'A blank page. Infinite possibilities.';
      $('paper-foot').textContent = state.spectator
        ? 'You joined during a match. Enjoy the drawings; you’ll play in the next match.'
        : canDraw
          ? 'Your word is private. Draw it — no spelling! Arrows move a cursor; Shift + arrows draws.'
          : state.phase === 'drawing'
            ? 'Watch the drawing and type your guess. The first letter appears halfway through.'
            : 'Two rounds. Everybody draws. Nobody needs to be good at it.';
      const key = `${state.phase}:${state.turnId}:${isArtist}:${state.players.length}:${state.host}`;
      if (key !== overlayKey) {
        overlayKey = key;
        $('choices').replaceChildren();
        $('paper-overlay').hidden = ['drawing', 'reveal'].includes(state.phase);
        if (state.phase === 'lobby') {
          $('paper-title').textContent = 'Pull up a chair.';
          $('paper-copy').textContent = isHost
            ? 'Copy the invite above. When a friend joins, start the party.'
            : 'You’re in! The host will start when everyone is ready.';
        }
        if (state.phase === 'choosing') {
          $('paper-title').textContent = isArtist
            ? 'Pick your masterpiece.'
            : `${artistName} is up!`;
          $('paper-copy').textContent = isArtist
            ? 'Choose a word to draw. Only you can see these.'
            : 'The artist is choosing a secret word.';
          for (const [index, word] of state.choices.entries()) {
            const b = document.createElement('button');
            b.textContent = word;
            scope.handler(b, 'onclick', () => act({ action: 'choose', index }));
            $('choices').append(b);
          }
        }
        if (state.phase === 'reveal') {
          $('paper-title').textContent = state.reveal;
          $('paper-copy').textContent =
            'Pencils down! The next artist is up in a moment.';
        }
        if (state.phase === 'finished') {
          const max = Math.max(...state.players.map((p) => p.score));
          const winners = state.players.filter((p) => p.score === max);
          $('paper-title').textContent =
            winners.length === 1
              ? `${winners[0].name} takes the crown!`
              : `${winners.length} artists share the crown!`;
          $('paper-copy').textContent =
            `${max} points of artistic excellence. Final scores are on the scorecard.`;
        }
      }
      const last = state.messages.at(-1)?.id;
      if (last !== messageKey) {
        messageKey = last || '';
        const box = $('messages'),
          nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 65;
        box.replaceChildren(
          ...state.messages.map((m) => message(m.text, m.kind, m.name)),
        );
        if (nearBottom) box.scrollTop = box.scrollHeight;
      }
      renderCanvas();
    }
    scope.handler($<HTMLButtonElement>('start'), 'onclick', () => {
      setRoster(false);
      act({
        action: 'start',
        duration: Number($<HTMLSelectElement>('duration').value),
      });
    });
    scope.handler($('guess-form'), 'onsubmit', (e) => {
      e.preventDefault();
      const text = $<HTMLInputElement>('guess').value.trim();
      if (!text) return;
      $<HTMLInputElement>('guess').value = '';
      act({ action: 'guess', text });
    });
    scope.handler($('invite'), 'onclick', async () => {
      if (!session) return;
      const code = session.code;
      const url = new URL(location.href);
      url.search = `?room=${code}`;
      try {
        await navigator.clipboard.writeText(url.href);
        notice('Invite copied. Send it to your friends.');
      } catch {
        notice(
          `Room code: ${code}. Share this page’s address with your friends.`,
        );
      }
    });
    scope.handler($('leave'), 'onclick', async () => {
      if (session) await act({ action: 'leave' });
      session = null;
      storedSession(null);
      exitUI();
      notice('You left the studio. Your next masterpiece awaits.');
    });
    for (const [name, hex] of COLORS) {
      const b = document.createElement('button');
      b.className = 'color';
      b.style.setProperty('--pencil', hex);
      b.title = `${name} pencil`;
      b.setAttribute('aria-label', `${name} pencil`);
      b.setAttribute('aria-pressed', String(hex === color));
      scope.handler(b, 'onclick', () => {
        color = hex;
        eraser = false;
        updateTools();
      });
      $('palette').append(b);
    }
    function updateTools() {
      const name = COLORS.find((c) => c[1] === color)?.[0] || 'Ink';
      $('palette-toggle').style.setProperty('--selected-pencil', color);
      $('palette-toggle').setAttribute(
        'aria-label',
        `Choose pencil color: ${name}`,
      );
      setPalette(false);
      $('tool-state').textContent = eraser
        ? 'Eraser selected'
        : `${$<HTMLSelectElement>('brush').selectedOptions[0].textContent} ${name.toLowerCase()} pencil`;
      for (const [index, b] of [...$('palette').children].entries())
        b.setAttribute(
          'aria-pressed',
          String(!eraser && COLORS[index][1] === color),
        );
      $('erase').setAttribute('aria-pressed', String(eraser));
    }
    scope.handler($<HTMLSelectElement>('brush'), 'onchange', () => {
      brush = Number($<HTMLSelectElement>('brush').value);
      updateTools();
    });
    scope.handler($('erase'), 'onclick', () => {
      eraser = !eraser;
      updateTools();
    });
    scope.handler($('undo'), 'onclick', () => {
      flush();
      if (solo) {
        const id = localStrokes.at(-1)?.id;
        localStrokes = localStrokes.filter((s) => s.id !== id);
        renderCanvas();
      } else act({ action: 'undo' });
    });
    scope.handler($('clear'), 'onclick', () => {
      flush();
      if (solo) {
        localStrokes = [];
        renderCanvas();
      } else act({ action: 'clear' });
    });
    function canDraw() {
      return solo || (state?.phase === 'drawing' && state.artist === state.me);
    }
    function point(e: PointerEvent) {
      return canvasPoint(e.clientX, e.clientY, canvas.getBoundingClientRect());
    }
    function paint(stroke: Omit<Stroke, 'id'>) {
      if (!stroke.points.length) return;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0][0] * 900, stroke.points[0][1] * 620);
      for (const p of stroke.points.slice(1))
        ctx.lineTo(p[0] * 900, p[1] * 620);
      if (stroke.points.length === 1) {
        ctx.arc(
          stroke.points[0][0] * 900,
          stroke.points[0][1] * 620,
          stroke.size / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else ctx.stroke();
    }
    function renderCanvas() {
      if (scope.disposed) return;
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, 0, 900, 620);
      for (const stroke of solo ? localStrokes : state?.strokes || [])
        paint(stroke);
      for (const stroke of pending) paint(stroke);
      if (draft.length)
        paint({
          points: draft,
          color: eraser ? '#fffaf0' : color,
          size: brush,
        });
      if (document.activeElement === canvas && !drawing && canDraw()) {
        ctx.strokeStyle = '#766294';
        ctx.lineWidth = 1;
        const [x, y] = keyboardCursor;
        ctx.beginPath();
        ctx.moveTo(x * 900 - 6, y * 620);
        ctx.lineTo(x * 900 + 6, y * 620);
        ctx.moveTo(x * 900, y * 620 - 6);
        ctx.lineTo(x * 900, y * 620 + 6);
        ctx.stroke();
      }
    }
    function flush() {
      if (!draft.length) return;
      const points = draft.slice(0, 120),
        stroke = {
          id: currentId,
          points,
          color: eraser ? '#fffaf0' : color,
          size: brush,
        };
      draft = drawing ? [points.at(-1)!] : [];
      if (solo) {
        localStrokes.push(stroke);
        if (localStrokes.length > 1200) localStrokes.shift();
        renderCanvas();
        return;
      }
      pending.push(stroke);
      schedule(async () => {
        try {
          if (session) {
            const next = await request(`/${session.code}/actions`, {
              action: 'stroke',
              strokeId: stroke.id,
              ...stroke,
            });
            pending = pending.filter((s) => s !== stroke);
            if (!('left' in next)) apply(next);
          }
        } finally {
          pending = pending.filter((s) => s !== stroke);
          renderCanvas();
        }
      });
    }
    scope.listen(canvas, 'pointerdown', (e) => {
      if (!canDraw() || e.button > 0) return;
      e.preventDefault();
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      currentId =
        crypto.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      draft = [point(e)];
      lastFlush = performance.now();
      renderCanvas();
    });
    scope.listen(canvas, 'pointermove', (e) => {
      if (!drawing) return;
      draft.push(point(e));
      if (draft.length >= 115 || performance.now() - lastFlush > 85) {
        flush();
        lastFlush = performance.now();
      }
      renderCanvas();
    });
    const endDrawing = () => {
      if (!drawing) return;
      drawing = false;
      flush();
    };
    scope.listen(canvas, 'pointerup', endDrawing);
    scope.listen(canvas, 'pointercancel', endDrawing);
    scope.listen(canvas, 'lostpointercapture', endDrawing);
    scope.listen(canvas, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (!canDraw() || !e.key.startsWith('Arrow')) return;
      e.preventDefault();
      const old: Point = [...keyboardCursor];
      const axis = ['ArrowLeft', 'ArrowRight'].includes(e.key) ? 0 : 1;
      keyboardCursor[axis] = Math.max(
        0,
        Math.min(
          1,
          keyboardCursor[axis] +
            (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -0.015 : 0.015),
        ),
      );
      if (e.shiftKey) {
        currentId = 'keyboard-' + Date.now();
        draft = [old, [...keyboardCursor]];
        flush();
      }
      renderCanvas();
    });
    scope.listen(canvas, 'focus', renderCanvas);
    scope.listen(canvas, 'blur', renderCanvas);
    scope.interval(() => {
      if (!session || solo || polling) return;
      polling = true;
      schedule(async () => {
        try {
          if (session) {
            apply(await request(`/${session.code}`));
            if (
              $('notice').textContent.includes('respond') ||
              $('notice').textContent.includes('Connection')
            )
              notice('Connected again.');
          }
        } finally {
          polling = false;
        }
      });
    }, 700);
    const code = new URL(location.href).searchParams.get('room');
    if (code && /^[A-F0-9]{6}$/i.test(code)) {
      entryMode(true);
      $<HTMLInputElement>('code').value = code.toUpperCase();
    }
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem(`doodle-session:${location.pathname}`) || 'null',
      );
      if (
        isRoomSession(saved) &&
        (!code || saved.code === code.toUpperCase())
      ) {
        session = saved;
        enterUI();
        request(`/${session.code}`)
          .then(apply)
          .catch((error: unknown) => {
            if (scope.disposed) return;
            session = null;
            storedSession(null);
            exitUI();
            notice(errorMessage(error));
          });
      }
    } catch {}
    // Small-screen disclosures preserve every tool without a scrolling toolbar.
    function setPalette(open: boolean) {
      $('toolbar').classList.toggle('palette-open', open);
      $('palette-toggle').setAttribute('aria-expanded', String(open));
    }
    function setRoster(open: boolean) {
      root
        .querySelector<HTMLElement>('.roster')!
        .classList.toggle('roster-open', open);
      $('roster-toggle').setAttribute('aria-expanded', String(open));
    }
    scope.handler($('palette-toggle'), 'onclick', () =>
      setPalette($('palette-toggle').getAttribute('aria-expanded') !== 'true'),
    );
    scope.handler($('roster-toggle'), 'onclick', () =>
      setRoster($('roster-toggle').getAttribute('aria-expanded') !== 'true'),
    );
    scope.listen(document, 'pointerdown', (event) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest('#toolbar')) setPalette(false);
      if (!event.target.closest('.roster')) setRoster(false);
    });
    scope.listen(document, 'keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($('palette-toggle').getAttribute('aria-expanded') === 'true') {
        setPalette(false);
        $('palette-toggle').focus({ preventScroll: true });
      }
      if ($('roster-toggle').getAttribute('aria-expanded') === 'true') {
        setRoster(false);
        $('roster-toggle').focus({ preventScroll: true });
      }
    });
    scope.add(() => {
      session = null;
      $('palette').replaceChildren();
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
