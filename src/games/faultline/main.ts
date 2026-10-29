import type { Difficulty, GameState, GameInput } from './engine.ts';
import {
  createGame,
  step,
  interact,
  buyUpgrade,
  serialize,
  restore,
  nearBase,
  UPGRADE_DEFS,
  SURFACE,
  TILE,
} from './engine.ts';
import { Renderer } from './renderer.ts';
import { Soundscape } from './audio.ts';
import { createPilot } from './demo.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    document.body.dataset.screen = 'menu';
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
      scope.byId<T>(id);
    const canvas = $<HTMLCanvasElement>('world'),
      panel = $<HTMLDialogElement>('panel');
    const renderer = new Renderer(canvas, $<HTMLCanvasElement>('minimap')),
      sound = new Soundscape();
    const SAVE_KEY = 'faultline.expedition.v1',
      SETTINGS_KEY = 'faultline.settings.v1',
      RECORD_KEY = 'faultline.record.v1';
    const keys = new Set(),
      touchMoves = new Set();
    const preview = new URLSearchParams(location.search).has('preview');
    let pilot = createPilot();
    let state = createGame(),
      active = false,
      paused = false,
      loaded = false,
      difficulty: Difficulty = 'normal',
      saveTimer = 0,
      hudTimer = 0;
    const pointer = { x: 0, y: 0, down: false, valid: false };
    let touchDrill = false,
      recallRequested = false;
    let toastTimer = 0,
      bannerTimer = 0,
      lastFullToast = -10,
      lastWarning = -1,
      lastPhase = 'mining',
      modalKind = '',
      resultShown = false;
    let lastTime = performance.now(),
      movement = { dx: 0, dy: 0 };
    const settings: {
      muted: boolean;
      volume: number;
      reduced: boolean;
      touch?: boolean;
    } = {
      muted: false,
      volume: 0.4,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    let stored: GameState | null = null,
      storageAvailable = true;
    try {
      const savedSettings = JSON.parse(
        localStorage.getItem(SETTINGS_KEY) ?? 'null',
      );
      if (savedSettings && typeof savedSettings === 'object') {
        if (typeof savedSettings.muted === 'boolean')
          settings.muted = savedSettings.muted;
        if (typeof savedSettings.reduced === 'boolean')
          settings.reduced = savedSettings.reduced;
        if (typeof savedSettings.touch === 'boolean')
          settings.touch = savedSettings.touch;
        if (Number.isFinite(savedSettings.volume))
          settings.volume = Math.max(0, Math.min(1, savedSettings.volume));
      }
    } catch {}
    try {
      stored = restore(localStorage.getItem(SAVE_KEY));
    } catch {
      storageAvailable = false;
    }
    if (stored && ['won', 'lost'].includes(stored.phase)) stored = null;
    renderer.reduced = settings.reduced;
    sound.setMuted(settings.muted || preview);
    sound.setVolume(settings.volume);
    let touchDevice =
      settings.touch ??
      (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    document.body.dataset.touch = String(touchDevice);
    function persistSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        storageAvailable = false;
      }
    }
    function save() {
      if (!active || preview || ['won', 'lost'].includes(state.phase)) return;
      try {
        localStorage.setItem(SAVE_KEY, serialize(state));
      } catch {
        storageAvailable = false;
      }
    }
    function clearSave() {
      if (preview) return;
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        storageAvailable = false;
      }
      stored = null;
      $('continue').hidden = true;
    }
    function soundButton() {
      const muted = settings.muted;
      $('sound').textContent = muted ? '♫̸' : '♪';
      $('sound').setAttribute(
        'aria-label',
        muted ? 'Unmute sound' : 'Mute sound',
      );
      $('sound').setAttribute('aria-pressed', String(muted));
    }
    soundButton();
    async function unlock() {
      await sound.unlock();
      if (scope.disposed) return;
      sound.setPhase(paused ? 'paused' : active ? state.phase : 'menu');
    }
    function clearInput() {
      keys.clear();
      touchMoves.clear();
      pointer.down = false;
      touchDrill = false;
      recallRequested = false;
      root
        .querySelectorAll('.pressed')
        .forEach((el) => el.classList.remove('pressed'));
    }
    function toast(message: string, duration = 3) {
      $('toast').textContent = message;
      $('toast').hidden = false;
      toastTimer = duration;
    }
    function banner(title: string, copy: string, duration = 4) {
      $('banner-title').textContent = title;
      $('banner-copy').textContent = copy;
      $('wave-banner').hidden = false;
      bannerTimer = duration;
    }
    function consumeEvents() {
      for (const event of state.events) {
        renderer.event(event);
        const map: Record<string, string> = {
          mine: event.value ? 'pickup' : 'break',
          hit: 'enemy-hit',
          kill: 'enemy-hit',
          'base-hit': 'base-hit',
          shoot: 'shoot',
          deposit: 'deposit',
          recall: 'recall',
          upgrade: 'upgrade',
          wave: 'wave',
          won: 'win',
          lost: 'lose',
        };
        if (map[event.type]) sound.play(map[event.type]);
        if (event.type === 'deposit')
          toast(`Cargo deposited · +${event.value} salvage`);
        if (event.type === 'recall')
          toast('Back at the shelter. E: turret · U: upgrades', 3);
        if (event.type === 'full' && state.totalTime - lastFullToast > 5) {
          toast('Cargo full. Press R to recall and deposit.', 3);
          lastFullToast = state.totalTime;
        }
        if (event.type === 'interact')
          toast(
            state.player.mode === 'turret'
              ? 'Cannon linked. Aim + click, or hold Space for assisted fire.'
              : 'Autoturret online. Head down the shaft to mine.',
            4,
          );
        if (event.type === 'wave') {
          banner(
            `WAVE ${event.value} / 04`,
            event.value === 4
              ? 'A siege beast is approaching. Hold the line.'
              : 'Return to the shelter. Take control of the cannon.',
            4.5,
          );
          lastWarning = -1;
        }
        if (event.type === 'wave-clear') {
          banner(
            'RIDGE SECURED',
            '+5 salvage. Mine, repair, and prepare for the next wave.',
            4,
          );
          lastWarning = -1;
          save();
        }
      }
      state.events = [];
    }
    function begin(continued = false) {
      if (!loaded) return;
      clearInput();
      if (panel.open) panel.close();
      state =
        continued && stored
          ? stored
          : createGame({
              seed: Math.floor(Math.random() * 0xffffffff),
              difficulty,
            });
      active = true;
      paused = false;
      resultShown = false;
      saveTimer = 0;
      lastWarning = -1;
      lastFullToast = -10;
      lastPhase = state.phase;
      pilot = createPilot();
      renderer.particles = [];
      renderer.floats = [];
      document.body.dataset.screen = 'play';
      $('menu').hidden = true;
      $('hud').hidden = false;
      $('pause').hidden = false;
      $('touch-controls').hidden = !touchDevice;
      $('wave-banner').hidden = true;
      $('toast').hidden = true;
      sound.setPhase(state.phase);
      updateHUD();
      canvas.focus({ preventScroll: true });
      save();
      if (continued)
        toast(
          'Expedition restored. Your last position and upgrades are saved.',
          4,
        );
      else
        banner(
          'WELCOME TO THE RIDGE',
          touchDevice
            ? 'Use the direction pad. Hold DRILL against rock.'
            : 'WASD to move. Hold Space against rock to drill.',
          5,
        );
      if (!storageAvailable)
        toast(
          'Browser storage is unavailable. This expedition will not autosave.',
          5,
        );
    }
    scope.listen($('start'), 'click', () => {
      unlock();
      if (stored) {
        openPanel(
          'restart',
          'New expedition',
          'Your saved expedition will be replaced.',
          ['Start fresh', 'Keep my save'],
          () => {
            clearSave();
            begin();
          },
        );
      } else begin();
    });
    scope.listen($('continue'), 'click', () => {
      unlock();
      begin(true);
    });
    root.querySelectorAll<HTMLElement>('[data-difficulty]').forEach((button) =>
      scope.listen(button, 'click', () => {
        const value = button.dataset.difficulty;
        if (value === 'normal' || value === 'hard' || value === 'relaxed')
          difficulty = value;
        root
          .querySelectorAll<HTMLElement>('[data-difficulty]')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        sound.play('click');
      }),
    );
    scope.listen($('sound'), 'click', () => {
      unlock();
      settings.muted = !settings.muted;
      sound.setMuted(settings.muted);
      persistSettings();
      soundButton();
      if (active && !paused) canvas.focus({ preventScroll: true });
    });
    scope.listen($('pause'), 'click', () => showPause());
    scope.listen($('help'), 'click', () => showHelp());
    scope.listen($('workshop'), 'click', () => showWorkshop());
    scope.listen($('recall'), 'click', () => requestRecall());
    scope.listen($('interact'), 'click', () => useTurret());
    function requestRecall() {
      if (!active || paused) return;
      if (state.player.recallCooldown > 0) {
        toast(
          `Recall recharging · ${Math.ceil(state.player.recallCooldown)} seconds`,
        );
        return;
      }
      recallRequested = true;
      canvas.focus({ preventScroll: true });
    }
    function useTurret() {
      if (!active || paused) return;
      if (!interact(state)) {
        toast('Return to the shelter first. Press R for recall.');
        return;
      }
      pointer.valid = false;
      consumeEvents();
      updateHUD();
      canvas.focus({ preventScroll: true });
    }
    function pauseSimulation() {
      paused = active;
      clearInput();
      sound.setPhase('paused');
      save();
    }
    function dialogStart(
      kind: string,
      title: string,
      eyebrow = 'RIDGE CONTROL',
    ) {
      pauseSimulation();
      modalKind = kind;
      $('panel-title').textContent = title;
      $('panel-eyebrow').textContent = eyebrow;
      $('panel-content').replaceChildren();
      if (!panel.open) panel.showModal();
    }
    function closePanel() {
      panel.close();
    }
    scope.listen(panel, 'close', () => {
      const kind = modalKind;
      modalKind = '';
      clearInput();
      if (active && !['won', 'lost'].includes(state.phase)) {
        paused = false;
        sound.setPhase(state.phase);
        canvas.focus({ preventScroll: true });
      } else {
        paused = false;
        sound.setPhase(active ? state.phase : 'menu');
      }
      if (kind === 'result' && active) {
        goToMenu();
      }
    });
    scope.listen(panel, 'cancel', (event) => {
      if (modalKind === 'result') {
        event.preventDefault();
        closePanel();
      }
    });
    function button(label: string, handler: () => void, className = '') {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = className;
      el.textContent = String(label);
      scope.listen(el, 'click', handler);
      return el;
    }
    function paragraph(text: string) {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }
    function openPanel(
      kind: string,
      title: string,
      message: string,
      actions: [string, string],
      onConfirm: () => void,
    ) {
      dialogStart(kind, title);
      $('panel-content').append(paragraph(message));
      const row = document.createElement('div');
      row.className = 'panel-actions';
      row.append(
        button(actions[0], () => {
          modalKind = '';
          panel.close();
          onConfirm();
        }),
        button(actions[1], closePanel),
      );
      $('panel-content').append(row);
    }
    function settingsUI(container: HTMLElement) {
      const volume = document.createElement('label');
      volume.className = 'settings-row';
      volume.append(document.createTextNode('Sound volume'));
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.value = String(settings.volume * 100);
      range.setAttribute('aria-label', 'Sound volume');
      scope.listen(range, 'input', () => {
        settings.volume = Number(range.value) / 100;
        sound.setVolume(settings.volume);
        persistSettings();
      });
      volume.append(range);
      const motion = document.createElement('label');
      motion.className = 'settings-row';
      motion.append(document.createTextNode('Reduce motion & screen shake'));
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = settings.reduced;
      scope.listen(check, 'change', () => {
        settings.reduced = check.checked;
        renderer.reduced = settings.reduced;
        persistSettings();
      });
      motion.append(check);
      const controls = document.createElement('label');
      controls.className = 'settings-row';
      controls.append(document.createTextNode('On-screen movement controls'));
      const touch = document.createElement('input');
      touch.type = 'checkbox';
      touch.checked = touchDevice;
      scope.listen(touch, 'change', () => {
        settings.touch = touch.checked;
        touchDevice = touch.checked;
        document.body.dataset.touch = String(touchDevice);
        $('touch-controls').hidden = !active || !touchDevice;
        persistSettings();
      });
      controls.append(touch);
      container.append(volume, motion, controls);
    }
    function showPause() {
      if (!active || ['won', 'lost'].includes(state.phase)) return;
      dialogStart('pause', 'CATCH YOUR BREATH', 'EXPEDITION PAUSED');
      const content = $('panel-content');
      content.append(
        paragraph(
          storageAvailable
            ? 'Your expedition is saved on this browser. The ridge can wait.'
            : 'The ridge can wait. Browser storage is unavailable for this session.',
        ),
      );
      content.append(
        button('RESUME EXPEDITION →', closePanel, 'primary-button'),
      );
      settingsUI(content);
      const row = document.createElement('div');
      row.className = 'panel-actions';
      row.append(
        button('How to play', showHelp),
        button('Exit to title', () => {
          save();
          goToMenu();
        }),
      );
      content.append(row);
    }
    function showHelp() {
      dialogStart('help', 'SURVIVE THE RIDGE', 'FIELD MANUAL / 04');
      const content = $('panel-content');
      const steps = document.createElement('div');
      steps.className = 'help-steps';
      const descriptions = [
        [
          'DIG & HAUL',
          'Move in any direction with your mining suit. Hold Space while moving into rock. Iron is worth 3 salvage, crystal 6, and gold 10.',
        ],
        [
          'DEPOSIT & UPGRADE',
          'Return to the shelter to empty your cargo. R recalls you instantly, then recharges for 25 seconds. Open the workshop with U.',
        ],
        [
          'HOLD THE LINE',
          'When a wave arrives, press E at the shelter to operate the cannon. Aim and hold the mouse, or hold Space for assisted fire. Survive all four waves to evacuate.',
        ],
      ];
      descriptions.forEach(([title, text], i) => {
        const row = document.createElement('div');
        row.className = 'help-step';
        const number = document.createElement('b');
        number.textContent = String(i + 1).padStart(2, '0');
        const body = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = title;
        body.append(strong, paragraph(text));
        row.append(number, body);
        steps.append(row);
      });
      content.append(steps);
      const grid = document.createElement('div');
      grid.className = 'key-grid';
      for (const [key, label] of [
        ['WASD / ↑↓←→', 'Move & jetpack'],
        ['SPACE', 'Drill / assisted fire'],
        ['R', 'Recall & deposit'],
        ['E', 'Enter / leave turret'],
        ['U', 'Workshop'],
        ['ESC', 'Pause / resume'],
      ]) {
        const row = document.createElement('div');
        const k = document.createElement('kbd');
        k.textContent = key;
        row.append(k, document.createTextNode(label));
        grid.append(row);
      }
      content.append(
        grid,
        paragraph(
          'On touchscreens, use the direction pad and hold DRILL / FIRE. In turret mode, tap a creature to aim or hold FIRE for assisted targeting. The shelter fires slowly on its own while you mine.',
        ),
      );
      content.append(
        button(
          active ? 'BACK TO EXPEDITION →' : 'READY TO DIG →',
          closePanel,
          'primary-button',
        ),
      );
    }
    function showWorkshop() {
      if (!active || ['won', 'lost'].includes(state.phase)) return;
      dialogStart('workshop', 'THE WORKSHOP', 'RIDGE STATION / SERVICE BAY');
      renderWorkshop();
    }
    function renderWorkshop() {
      const content = $('panel-content');
      content.replaceChildren();
      const balance = document.createElement('div');
      balance.className = 'upgrade-balance';
      const label = document.createElement('span');
      label.textContent = 'AVAILABLE SALVAGE';
      const amount = document.createElement('strong');
      amount.textContent = String(state.credits);
      balance.append(label, amount);
      content.append(balance);
      const atBase = nearBase(state);
      if (!atBase)
        content.append(
          paragraph(
            'Upgrades are fitted at the shelter. Return on foot or recall after closing the workshop.',
          ),
        );
      const list = document.createElement('div');
      list.className = 'upgrade-list';
      for (const def of UPGRADE_DEFS) {
        const level = state.upgrades[def.id],
          maxed = level >= def.max,
          cost = def.costs[Math.min(level, def.costs.length - 1)];
        const row = document.createElement('div');
        row.className = 'upgrade-row';
        const text = document.createElement('div'),
          title = document.createElement('h3'),
          levelText = document.createElement('span');
        title.textContent = def.name;
        levelText.className = 'upgrade-level';
        levelText.textContent =
          def.id === 'repair'
            ? `${Math.ceil(state.base.hp)} / ${state.base.maxHp} HULL`
            : `${level} / ${def.max}`;
        title.append(levelText);
        text.append(title, paragraph(def.description));
        const purchase = button(maxed ? 'MAXED' : `${cost} ◈`, () => {
          if (buyUpgrade(state, def.id)) {
            consumeEvents();
            toast(
              `${def.name} ${def.id === 'repair' ? 'complete' : 'installed'}.`,
            );
            renderWorkshop();
            updateHUD();
            save();
          }
        });
        purchase.setAttribute('aria-label', `${def.name}, ${cost} salvage`);
        purchase.disabled =
          !atBase ||
          maxed ||
          state.credits < cost ||
          (def.id === 'repair' && state.base.hp >= state.base.maxHp);
        row.append(text, purchase);
        list.append(row);
      }
      content.append(
        list,
        button('BACK TO THE RIDGE →', closePanel, 'primary-button'),
      );
    }
    function goToMenu() {
      clearInput();
      active = false;
      paused = false;
      modalKind = '';
      if (panel.open) panel.close();
      document.body.dataset.screen = 'menu';
      $('bottom-motto').textContent = 'GOOD ORE. BAD COMPANY.';
      $('menu').hidden = false;
      $('hud').hidden = true;
      $('pause').hidden = true;
      $('touch-controls').hidden = true;
      $('wave-banner').hidden = true;
      $('toast').hidden = true;
      try {
        stored = restore(localStorage.getItem(SAVE_KEY));
      } catch {
        stored = null;
      }
      if (stored && ['won', 'lost'].includes(stored.phase)) stored = null;
      $('continue').hidden = !stored;
      state = createGame();
      makeTitleScene();
      sound.setPhase('menu');
      $('start').focus({ preventScroll: true });
    }
    function showResult() {
      if (resultShown) return;
      resultShown = true;
      clearSave();
      clearInput();
      const won = state.phase === 'won';
      dialogStart(
        'result',
        won ? 'YOU HELD THE LINE.' : 'THE RIDGE CLAIMED YOU.',
        won ? 'EVACUATION CONFIRMED' : 'SIGNAL LOST',
      );
      sound.setPhase(won ? 'won' : 'lost');
      const content = $('panel-content');
      const stamp = document.createElement('div');
      stamp.className = 'result-stamp';
      stamp.textContent = won
        ? 'CREW 04 / SAFELY EXTRACTED'
        : `EXPEDITION ENDED / WAVE ${Math.max(1, state.wave)}`;
      content.append(
        stamp,
        paragraph(
          won
            ? 'Four waves survived. The shelter is still standing, and the recovery ship has your signal. Take a breath. You earned it.'
            : 'The shelter fell before the recovery ship arrived. Mine early, upgrade the coil cannon, and take manual control when the creatures close in.',
        ),
      );
      const stats = document.createElement('div');
      stats.className = 'result-stats';
      for (const [value, label] of [
        [state.kills, 'CREATURES'],
        [state.oreMined, 'ORE MINED'],
        [formatTime(state.totalTime), 'SURVIVED'],
      ]) {
        const item = document.createElement('div'),
          v = document.createElement('strong'),
          l = document.createElement('span');
        v.textContent = String(value);
        l.textContent = String(label);
        item.append(v, l);
        stats.append(item);
      }
      content.append(stats);
      if (won) {
        const score =
          state.oreMined * 10 + state.kills * 20 + Math.ceil(state.base.hp);
        let record = 0;
        try {
          record = Number(localStorage.getItem(RECORD_KEY)) || 0;
          if (score > record && !preview)
            localStorage.setItem(RECORD_KEY, String(score));
        } catch {}
        content.append(
          paragraph(
            `Expedition score: ${score.toLocaleString()}${score > record ? ' · A new personal best.' : ` · Best: ${record.toLocaleString()}`}`,
          ),
        );
      }
      content.append(
        button(
          'ANOTHER EXPEDITION ↗',
          () => {
            modalKind = '';
            panel.close();
            begin();
          },
          'primary-button',
        ),
      );
      content.append(button('Return to title', goToMenu, 'text-button'));
    }
    function formatTime(seconds: number) {
      return `${Math.floor(Math.max(0, seconds) / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60)
        .toString()
        .padStart(2, '0')}`;
    }
    function updateHUD() {
      const p = state.player;
      const health = Math.ceil((state.base.hp / state.base.maxHp) * 100);
      $('health-number').textContent = `${health}%`;
      $('health-fill').style.width = `${health}%`;
      $('health-fill').style.backgroundColor = health < 30 ? '#ed815a' : '';
      $('base-label').textContent =
        p.mode === 'turret'
          ? 'MANUAL CANNON LINKED'
          : health < 30
            ? 'CRITICAL · REPAIRS NEEDED'
            : 'AUTOTURRET ONLINE';
      $('phase-label').textContent =
        state.phase === 'wave' ? 'THREATS REMAINING' : 'NEXT WAVE';
      $('wave-clock').textContent =
        state.phase === 'wave'
          ? String(state.enemies.length + state.waveRemaining).padStart(2, '0')
          : formatTime(state.waveTimer);
      root
        .querySelector('.wave-status')!
        .classList.toggle(
          'danger',
          state.phase === 'wave' || state.waveTimer < 12,
        );
      $('wave-number').textContent =
        `WAVE ${String(Math.min(4, state.phase === 'wave' ? state.wave : state.wave + 1)).padStart(2, '0')} / 04`;
      $('threat-label').textContent =
        state.phase === 'wave'
          ? state.wave === 4
            ? 'SIEGE BEAST DETECTED'
            : 'HOSTILES ON THE RIDGE'
          : 'NO THREATS DETECTED';
      $('wave-pips').setAttribute(
        'aria-label',
        `${state.phase === 'wave' ? state.wave - 1 : state.wave} of 4 waves survived`,
      );
      [...$('wave-pips').children].forEach((pip, i) => {
        pip.classList.toggle(
          'done',
          i < (state.phase === 'wave' ? state.wave - 1 : state.wave),
        );
        pip.classList.toggle(
          'active',
          state.phase === 'wave' && i === state.wave - 1,
        );
      });
      $('cargo-count').textContent = `${p.cargo.length} / ${p.capacity}`;
      $('credits').textContent = String(state.credits);
      $('depth').textContent =
        `DEPTH ${Math.max(0, Math.floor(((p.y - SURFACE * TILE) / TILE) * 5))} M`;
      const slots = $('cargo-slots');
      const signature = p.capacity + ':' + p.cargo.map((o) => o.type).join(',');
      if (slots.dataset.signature !== signature) {
        slots.dataset.signature = signature;
        slots.replaceChildren();
        for (let i = 0; i < p.capacity; i++) {
          const slot = document.createElement('span');
          slot.className = 'cargo-slot' + (p.cargo[i] ? ' filled' : '');
          if (p.cargo[i]) {
            slot.style.setProperty(
              '--ore',
              { iron: '#abbdb8', crystal: '#6ddbbd', gold: '#ffbf58' }[
                p.cargo[i].type
              ],
            );
            const ore = document.createElement('i');
            slot.append(ore);
            slot.setAttribute('aria-label', p.cargo[i].type);
          } else slot.setAttribute('aria-label', 'Empty cargo slot');
          slots.append(slot);
        }
      }
      $('recall-state').textContent =
        p.recallCooldown > 0
          ? `READY IN ${Math.ceil(p.recallCooldown)}s`
          : 'TO SHELTER';
      $<HTMLButtonElement>('recall').disabled = p.recallCooldown > 0;
      $('interact-label').textContent =
        p.mode === 'turret' ? 'LEAVE TURRET' : 'TURRET';
      $('interact-hint').textContent =
        p.mode === 'turret'
          ? 'RETURN TO MINING'
          : nearBase(state)
            ? 'LINK CANNON'
            : 'AT THE SHELTER';
      $('touch-drill').replaceChildren(
        document.createTextNode(p.mode === 'turret' ? 'FIRE' : 'DRILL'),
        document.createElement('br'),
      );
      const hold = document.createElement('span');
      hold.textContent = 'HOLD';
      $('touch-drill').append(hold);
      let objective =
        p.mode === 'turret'
          ? 'Aim + click to fire. Space uses assisted targeting. E to leave.'
          : state.phase === 'wave'
            ? 'The shelter is under attack. Recall with R, then E to defend.'
            : p.cargo.length === p.capacity
              ? 'Cargo full. Return to the shelter or recall with R.'
              : nearBase(state)
                ? 'Cargo deposits here. U to upgrade. Head down the shaft to mine.'
                : state.oreMined === 0
                  ? 'Move into ore and hold Space to drill. Use ↑ / W to jetpack.'
                  : 'Mine deeper for crystal and gold. Recall before the next wave.';
      if (touchDevice) {
        objective =
          p.mode === 'turret'
            ? 'Hold FIRE for assisted targeting. Tap a creature to aim.'
            : state.phase === 'wave'
              ? 'Shelter under attack. Tap RECALL, then TURRET to defend.'
              : p.cargo.length === p.capacity
                ? 'Cargo full. Tap RECALL to deposit at the shelter.'
                : nearBase(state)
                  ? 'Cargo deposited. Tap UPGRADE, or head down the shaft.'
                  : 'Use the direction pad + hold DRILL to mine. Jetpack up to return.';
      }
      $('objective-text').textContent = objective;
      $('bottom-motto').textContent =
        p.mode === 'turret'
          ? 'KEEP THEM OFF THE RIDGE.'
          : 'GOOD ORE. BAD COMPANY.';
    }
    function isTextInput(target: EventTarget | null) {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      );
    }
    scope.listen(window, 'keydown', (event) => {
      if (isTextInput(event.target)) return;
      const code = event.code;
      if (code === 'KeyM' && !event.repeat) {
        $('sound').click();
        return;
      }
      if (code === 'Escape') {
        if (!panel.open && active) {
          event.preventDefault();
          showPause();
        }
        return;
      }
      if (!active || paused || panel.open) return;
      if (
        event.target instanceof HTMLButtonElement &&
        ['Space', 'Enter'].includes(code)
      )
        return;
      if (
        [
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyR',
          'KeyE',
          'KeyU',
        ].includes(code)
      )
        event.preventDefault();
      if (code === 'KeyR' && !event.repeat) requestRecall();
      else if (code === 'KeyE' && !event.repeat) useTurret();
      else if (code === 'KeyU' && !event.repeat) showWorkshop();
      else keys.add(code);
    });
    scope.listen(window, 'keyup', (event) => keys.delete(event.code));
    scope.listen(window, 'blur', () => {
      clearInput();
      if (active && !paused && !resultShown) showPause();
    });
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden) {
        clearInput();
        save();
        if (active && !paused && !resultShown) showPause();
      }
    });
    scope.listen(window, 'pagehide', save);
    scope.listen(canvas, 'pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.valid = true;
    });
    scope.listen(canvas, 'pointerdown', (event) => {
      if (!active || paused || event.button !== 0) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.valid = true;
      pointer.down = true;
      unlock();
    });
    scope.listen(canvas, 'pointerup', () => {
      pointer.down = false;
    });
    scope.listen(canvas, 'pointercancel', () => {
      pointer.down = false;
    });
    scope.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    function holdButton(el: HTMLElement, on: () => void, off: () => void) {
      scope.listen(el, 'pointerdown', (event) => {
        if (!active || paused) return;
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        el.classList.add('pressed');
        on();
        unlock();
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        scope.listen(el, type, () => {
          el.classList.remove('pressed');
          off();
        });
    }
    root.querySelectorAll<HTMLElement>('[data-move]').forEach((el) =>
      holdButton(
        el,
        () => touchMoves.add(el.dataset.move),
        () => touchMoves.delete(el.dataset.move),
      ),
    );
    holdButton(
      $('touch-drill'),
      () => {
        touchDrill = true;
      },
      () => {
        touchDrill = false;
      },
    );
    function readInput() {
      const dx =
        Number(
          keys.has('KeyD') || keys.has('ArrowRight') || touchMoves.has('right'),
        ) -
        Number(
          keys.has('KeyA') || keys.has('ArrowLeft') || touchMoves.has('left'),
        );
      const dy =
        Number(
          keys.has('KeyS') || keys.has('ArrowDown') || touchMoves.has('down'),
        ) -
        Number(keys.has('KeyW') || keys.has('ArrowUp') || touchMoves.has('up'));
      const drill = keys.has('Space') || touchDrill || pointer.down;
      const target = pointer.valid
        ? renderer.toWorld(pointer.x, pointer.y)
        : null;
      if (
        pointer.down &&
        state.player.mode === 'mine' &&
        !dx &&
        !dy &&
        target
      ) {
        const angle = Math.atan2(
          target.y - state.player.y,
          target.x - state.player.x,
        );
        state.player.drillDirX = Math.cos(angle);
        state.player.drillDirY = Math.sin(angle);
        if (Math.abs(Math.cos(angle)) > 0.3)
          state.player.facing = Math.cos(angle) < 0 ? -1 : 1;
      }
      const input: GameInput = {
        dx,
        dy,
        drill,
        fire: drill,
        recall: recallRequested,
      };
      if (pointer.down && target) {
        input.aimX = target.x;
        input.aimY = target.y;
      }
      movement = { dx, dy };
      recallRequested = false;
      return input;
    }
    function makeTitleScene() {
      // A silent diorama made from the actual game map and sprites.
      const tunnel = [
        [11, 14],
        [11, 15],
        [12, 15],
        [12, 16],
        [13, 16],
        [13, 17],
        [14, 17],
        [14, 18],
        [14, 19],
        [15, 19],
        [15, 20],
        [16, 20],
        [16, 21],
      ];
      for (const [r, c] of tunnel)
        for (let ox = 0; ox < 2; ox++)
          if (state.tiles[r]?.[c + ox])
            state.tiles[r][c + ox] = {
              type: 'air',
              hp: 0,
              maxHp: 0,
              variant: (r + c) % 4,
            };
      state.player.x = 20.3 * TILE;
      state.player.y = 16.35 * TILE;
      state.player.cargo = [
        { type: 'iron', value: 3 },
        { type: 'crystal', value: 6 },
        { type: 'gold', value: 10 },
      ];
      state.player.drilling = true;
      state.player.drillTarget = {
        col: 22,
        row: 16,
        x: 22.5 * TILE,
        y: 16.5 * TILE,
      };
      state.enemies = [
        {
          id: 1,
          type: 'crawler',
          x: 1250,
          y: SURFACE * TILE - 20,
          hp: 30,
          maxHp: 30,
          speed: 0,
          damage: 0,
          attackTimer: 0,
          side: 1,
        },
        {
          id: 2,
          type: 'crawler',
          x: 1400,
          y: SURFACE * TILE - 20,
          hp: 30,
          maxHp: 30,
          speed: 0,
          damage: 0,
          attackTimer: 0,
          side: 1,
        },
      ];
    }
    makeTitleScene();
    async function initialize() {
      const failed = await renderer.load();
      if (scope.disposed) return;
      await document.fonts.ready;
      if (scope.disposed) return;
      loaded = true;
      $<HTMLButtonElement>('start').disabled = false;
      $('start-label').textContent = 'BEGIN EXPEDITION';
      $('continue').hidden = !stored;
      if (failed.length)
        $('load-note').textContent =
          'Some artwork could not load. Reload to retry.';
      if (preview) {
        begin();
        $('wave-banner').hidden = true;
        $('toast').hidden = true;
        const play = document.createElement('a');
        play.href = './';
        play.textContent = 'PLAY YOURSELF ↗';
        play.className = 'demo-play';
        root.querySelector('.topbar nav')!.prepend(play);
      }
    }
    initialize().catch((error) => {
      if (scope.disposed) return;
      $('load-note').textContent =
        'Unable to prepare the expedition. Please reload.';
      console.error(error);
    });
    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (active && !paused && !resultShown) {
        let input;
        if (preview) {
          const action = pilot(state);
          if (action.upgradeId) buyUpgrade(state, action.upgradeId);
          if (action.interact) interact(state);
          consumeEvents();
          input = action.input;
          movement = { dx: input.dx || 0, dy: input.dy || 0 };
        } else input = readInput();
        step(state, input, dt);
        consumeEvents();
        if (state.player.drilling) sound.play('drill');
        if (state.phase !== lastPhase) {
          lastPhase = state.phase;
          sound.setPhase(state.phase);
        }
        if (
          state.phase === 'mining' &&
          state.waveTimer <= 10 &&
          lastWarning !== state.wave
        ) {
          lastWarning = state.wave;
          toast('Movement on the ridge. Wave incoming in 10 seconds.', 4);
          sound.play('wave');
        }
        if ((saveTimer += dt) >= 5) {
          save();
          saveTimer = 0;
        }
        if ((hudTimer += dt) >= 0.1) {
          updateHUD();
          hudTimer = 0;
        }
        if (['won', 'lost'].includes(state.phase)) {
          updateHUD();
          showResult();
        }
      }
      renderer.draw(state, dt, {
        menu: !active,
        paused: paused || resultShown,
        input: movement,
        aim:
          active && pointer.valid
            ? renderer.toWorld(pointer.x, pointer.y)
            : null,
      });
      if (!paused) {
        if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').hidden = true;
        if (bannerTimer > 0 && (bannerTimer -= dt) <= 0)
          $('wave-banner').hidden = true;
      }
      scope.raf(frame);
    }
    scope.raf(frame);
    scope.add(() => {
      save();
      renderer.dispose();
      sound.dispose();
      root.querySelector('.demo-play')?.remove();
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
