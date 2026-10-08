import * as THREE from 'three';
import { createDaylight } from './daylight.js';
import { createArena, createAvatar, createWeapon, createTarget } from './arena.js';
import { STEP, EYE_HEIGHT, stepPlayer, getNearbyRope } from '../shared/simulation.js';
import { MAPS, getMap, isMapId } from '../shared/world.js';
import { createShotEffects } from './shot-effects.js';
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';
import { MODES, DEFAULT_MODE, isModeId } from '../shared/modes.js';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY, normalizeBotDifficulty, getBotDifficulty } from '../shared/bot-difficulty.js';
import { getAbilityHudState } from './ability-hud.js';
import { createViewMotion } from './view-motion.js';
import { createHealthHud } from './health-hud.js';
import { createDamageFeedback } from './damage-feedback.js';
import { createPlayerLabel, PLAYER_LABEL_HEIGHT } from './player-label.js';
import { updateCharacter } from './characters.js';
import { loadGameModels, hasGameModels, disposeModel } from './game-models.js';
import { getPower } from '../shared/powers.js';
import { createPowerEffects } from './power-effects.js';
import { createMovementStyle } from './movement-style.js';
import { createBlastInput } from './blast-input.js';
import { createGameAudio } from './audio.js';
import { createAudioFeedback, spatialAudio } from './audio-feedback.js';
import './ui.css';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { sensitivity: 1, sound: true, motion: !reducedMotion.matches, quality: 'balanced' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('drift-settings') || '{}')); } catch { /* Storage is optional. */ }
delete settings.sight;
settings.sensitivity = Math.min(2, Math.max(0.2, Number(settings.sensitivity) || 1));
if (!['low', 'balanced', 'high'].includes(settings.quality)) settings.quality = 'balanced';
const PUBLIC_ROOMS = { solstice: 'open', 'canyon-relay': 'open-canyon', 'freight-yard': 'open-freight', 'sky-garden': 'open-garden', vertex: 'open-vertex' };
const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room') || '';
let selectedRoom = /^[a-z0-9-]{1,12}$/i.test(roomFromUrl) ? roomFromUrl.toLowerCase() : '';
let selectedMap = 'canyon-relay';
try {
  const saved = localStorage.getItem('drift-map');
  if (isMapId(saved)) selectedMap = saved;
} catch { /* Storage is optional. */ }
if (isMapId(urlParams.get('map'))) selectedMap = urlParams.get('map');
const publicMap = Object.keys(PUBLIC_ROOMS).find((id) => PUBLIC_ROOMS[id] === selectedRoom);
if (publicMap) { selectedMap = publicMap; selectedRoom = ''; }
try { $('player-name').value = localStorage.getItem('drift-name') || 'Rookie'; } catch { /* Optional. */ }
let selectedClass = DEFAULT_CLASS;
try {
  const saved = localStorage.getItem('drift-class');
  if (isClassId(saved)) selectedClass = saved;
} catch { /* Optional. */ }
let selectedMode = DEFAULT_MODE;
try {
  const saved = localStorage.getItem('drift-mode');
  if (isModeId(saved)) selectedMode = saved;
} catch { /* Optional. */ }
let createMode = DEFAULT_MODE;
let createTeam = 'a';
let roomMode = DEFAULT_MODE;
let selectedBotDifficulty = DEFAULT_BOT_DIFFICULTY;
try { selectedBotDifficulty = normalizeBotDifficulty(localStorage.getItem('drift-bot-difficulty')); } catch { /* Optional. */ }
let selectedBotFill = true;
let roomBotDifficulty = DEFAULT_BOT_DIFFICULTY;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  $('boot').hidden = true;
  $('unsupported').hidden = false;
  $('unsupported-message').textContent = 'DRIFT needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.';
}

if (renderer) {
  loadGameModels(selectedClass).then(run).catch((error) => {
    console.error('Unable to open arena models:', error);
    $('boot').hidden = true;
    $('unsupported').hidden = false;
    $('unsupported-message').textContent = 'The character models could not load. Check your connection and reload the page to try again.';
  });
}

function run() {
  const fallbackClass = selectedClass;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const daylight = createDaylight(renderer);
  scene.environment = daylight.environment;
  scene.environmentIntensity = 0.045;
  scene.backgroundIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(85, innerWidth / innerHeight, 0.05, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  let currentMap = getMap(selectedMap);
  let arena = createArena(scene, currentMap, daylight.background);
  let weaponClass = selectedClass;
  let weapon = createWeapon(camera, weaponClass);
  weapon.group.visible = false;
  const targets = new Map();
  function loadTargets() {
    for (const target of targets.values()) disposeGroup(target.group);
    targets.clear();
    currentMap.targets.forEach((target) => {
      const group = createTarget();
      const label = createPlayerLabel('Practice', 100);
      group.add(label.sprite);
      group.position.set(target.x, target.y, target.z);
      group.rotation.y = Math.atan2(-target.x, -target.z);
      scene.add(group);
      targets.set(target.id, { group, hitAt: -10 });
    });
  }
  loadTargets();

  let socket = null;
  let player = null;
  let playerId = '';
  let room = '';
  let players = [];
  let yaw = 0, pitch = 0;
  let sequence = 0;
  let pending = [], outgoing = [];
  let locked = false, connecting = false;
  let trigger = false, aiming = false;
  let accumulator = 0;
  let remaining = 300;
  let recoil = 0, hitAlpha = 0;
  let toastUntil = 0;
  let lastFrame = performance.now(), lastHud = 0, lastPing = 0;
  let frameCount = 0, lastFps = performance.now();
  let audioActive = false;
  let connectionTimer;
  let inviteFeedbackTimer;
  let settingsOrigin = 'lobby';
  let pendingClass = null;
  let joinAttempt = 0, classSelection = 0;
  const modelLoads = new Map();
  const modelRetryAt = new Map();
  let feedItems = [];
  const keys = new Set();
  const offset = new THREE.Vector3();
  const viewMotion = createViewMotion();
  const healthHud = createHealthHud();
  const damageFeedback = createDamageFeedback();
  const animateDamage = () => settings.motion && !reducedMotion.matches;
  const avatars = new Map();
  const characterMotion = {};
  const avatarPosition = new THREE.Vector3();
  const shotEffects = createShotEffects(scene, camera, { viewportHeight: () => renderer.domElement.height });
  const powerEffects = createPowerEffects(scene, { requestClassModels });
  const movementStyle = createMovementStyle();
  const blastInput = createBlastInput();
  const gameAudio = createGameAudio({ enabled: false });
  const audioFeedback = createAudioFeedback(gameAudio);
  void gameAudio.preload();
  const blastPose = {};
  let blastPreview = null;
  let celebration = null;
  let powerFeedbackLife = -1, powerFeedbackSeq = -1, powerFeedbackUntil = 0;
  let predictedPower = null;
  const muzzle = new THREE.Vector3();

  const mapOrder = ['canyon-relay', 'freight-yard', 'sky-garden', 'vertex', 'solstice'];
  const mapNotes = { 'canyon-relay': 'Stone arch · Cliff stations', 'freight-yard': 'Rail depot · Gantry crane', 'sky-garden': 'Amphitheatre · Conservatory', vertex: 'Reactor ring · Glass bridges', solstice: 'Terraces · Training court' };

  function mapThumbnail(map) {
    const thumbnail = document.createElement('canvas');
    thumbnail.width = 184; thumbnail.height = 120;
    thumbnail.className = 'map-thumbnail';
    thumbnail.setAttribute('aria-hidden', 'true');
    const ctx = thumbnail.getContext('2d');
    const palette = map.theme.palette;
    ctx.fillStyle = map.theme.ground;
    ctx.fillRect(0, 0, thumbnail.width, thumbnail.height);
    // Use the playable layout itself as a tiny plan view, so each thumbnail
    // stays recognizable and needs no downloaded artwork or second renderer.
    const scale = 104 / map.size;
    ctx.translate(thumbnail.width / 2, thumbnail.height / 2);
    ctx.rotate(-0.3);
    ctx.scale(1.35, 0.86);
    ctx.fillStyle = palette.floor || '#bcbcaf';
    ctx.fillRect(-52, -52, 104, 104);
    const surfaces = map.boxes.filter((box) => box.y >= 0 && box.w < map.size / 2 && box.d < map.size / 2)
      .sort((a, b) => a.y + a.h - b.y - b.h);
    for (const box of surfaces) {
      const x = (box.x - box.w / 2) * scale; const z = (box.z - box.d / 2) * scale;
      ctx.fillStyle = '#263b3555';
      ctx.fillRect(x + 1.5, z + 2.5, box.w * scale, box.d * scale);
      ctx.fillStyle = palette[box.style] || '#ded8c4';
      ctx.fillRect(x, z, box.w * scale, box.d * scale);
    }
    ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 1;
    for (const rope of map.ropes) {
      ctx.beginPath(); ctx.moveTo(rope.from.x * scale, rope.from.z * scale);
      ctx.lineTo(rope.to.x * scale, rope.to.z * scale); ctx.stroke();
    }
    return thumbnail;
  }

  $('map-choices').replaceChildren(...mapOrder.map((id, index) => {
    const map = MAPS[id];
    const label = document.createElement('label');
    label.className = 'map-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'arena'; input.value = id;
    input.setAttribute('aria-label', map.name);
    const body = document.createElement('span');
    body.className = 'map-option-body';
    const title = document.createElement('span'); title.className = 'map-option-name'; title.textContent = map.name;
    const detail = document.createElement('span'); detail.className = 'map-option-detail'; detail.textContent = mapNotes[id];
    body.append(title, detail);
    const number = document.createElement('span');
    number.className = 'map-option-number'; number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      // Choosing an arena is a new join intent; an old invite must not override it.
      selectedRoom = '';
      loadMap(id);
      const url = new URL(location.href);
      url.searchParams.set('map', selectedMap);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    });
    label.append(input, mapThumbnail(map), body, number);
    return label;
  }));

  $('lobby-modes').replaceChildren(...Object.values(MODES).map((mode) => {
    const label = document.createElement('label');
    label.className = 'mode-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'mode'; input.value = mode.id;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      selectedMode = mode.id;
      try { localStorage.setItem('drift-mode', selectedMode); } catch { /* Optional. */ }
      syncModes();
    });
    label.append(input, document.createTextNode(mode.name));
    return label;
  }));
  $('create-modes').replaceChildren(...Object.values(MODES).map((mode) => {
    const label = document.createElement('label');
    label.className = 'mode-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'create-mode'; input.value = mode.id;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      createMode = mode.id;
      syncCreatePanel();
    });
    label.append(input, document.createTextNode(mode.name));
    return label;
  }));
  $('create-teams').replaceChildren(...['a', 'b'].map((team) => {
    const label = document.createElement('label');
    label.className = 'team-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'create-team'; input.value = team;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      createTeam = team;
    });
    label.append(input, document.createTextNode(`Team ${team.toUpperCase()}`));
    return label;
  }));
  function syncModes() {
    for (const input of $('lobby-modes').querySelectorAll('input')) {
      input.checked = input.value === selectedMode;
      input.disabled = connecting;
    }
  }
  function syncCreatePanel() {
    for (const input of $('create-modes').querySelectorAll('input')) {
      input.checked = input.value === createMode;
      input.disabled = connecting;
    }
    $('create-team-field').hidden = !MODES[createMode].teams;
    for (const input of $('create-teams').querySelectorAll('input')) {
      input.checked = input.value === createTeam;
      input.disabled = connecting;
    }
  }
  syncModes();
  syncCreatePanel();

  $('bot-difficulty-options').replaceChildren(...BOT_DIFFICULTIES.map((difficulty) => {
    const label = document.createElement('label');
    label.className = 'difficulty-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'bot-difficulty'; input.value = difficulty.id;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      selectedBotDifficulty = difficulty.id;
      try { localStorage.setItem('drift-bot-difficulty', selectedBotDifficulty); } catch { /* Optional. */ }
      syncBotSettings();
    });
    label.append(input, document.createTextNode(difficulty.label));
    return label;
  }));
  $('bot-fill').addEventListener('change', (event) => {
    if (connecting || player) return;
    selectedBotFill = event.target.checked;
    syncBotSettings();
  });

  function syncBotSettings() {
    const roomSettings = $('join-room-dialog').open || (Boolean(selectedRoom) && !$('create-room-dialog').open);
    $('bot-fill').checked = selectedBotFill;
    $('bot-fill').disabled = connecting || roomSettings;
    for (const input of $('bot-difficulty-options').querySelectorAll('input')) {
      input.checked = input.value === selectedBotDifficulty;
      input.disabled = connecting || !selectedBotFill || roomSettings;
    }
    $('bot-difficulty-note').textContent = roomSettings ? 'Invites use the room’s bot settings.'
      : selectedBotFill ? getBotDifficulty(selectedBotDifficulty).description : 'Bots off. Play with friends or practise.';
  }
  syncBotSettings();

  function syncMapDetails() {
    for (const input of $('map-choices').querySelectorAll('input')) {
      input.checked = input.value === currentMap.id;
      input.disabled = connecting;
    }
    $('map-preview').setAttribute('aria-label', `Arena preview: ${currentMap.name}`);
    $('map-name').textContent = currentMap.name;
    $('map-description').textContent = currentMap.description;
    $('map-subtitle').textContent = currentMap.subtitle;
    $('map-number').textContent = `${String(mapOrder.indexOf(currentMap.id) + 1).padStart(2, '0')} / ${String(mapOrder.length).padStart(2, '0')}`;
    $('map-traversal').textContent = currentMap.ropes.length ? `${currentMap.ropes.length} rope routes` : 'Mantle routes';
    $('map-scale').textContent = `${currentMap.size} m arena`;
  }

  function loadMap(mapId) {
    const nextMap = getMap(mapId);
    if (nextMap.id !== currentMap.id) {
      arena.dispose();
      shotEffects.clear();
      powerEffects.clear();
      movementStyle.reset();
      celebration = null;
      currentMap = nextMap;
      arena = createArena(scene, currentMap, daylight.background);
      loadTargets();
    }
    selectedMap = currentMap.id;
    try { localStorage.setItem('drift-map', selectedMap); } catch { /* Optional. */ }
    syncMapDetails();
    updateLobbyRoom();
  }

  syncMapDetails();

  function saveClass(classId) {
    selectedClass = classId;
    try { localStorage.setItem('drift-class', classId); } catch { /* Optional. */ }
  }

  function syncClasses() {
    $('lobby-power-description').textContent = getPower(selectedClass).description;
    for (const input of $('lobby-classes').querySelectorAll('input')) {
      input.checked = input.value === selectedClass;
      input.disabled = connecting;
    }
    const next = pendingClass || player?.nextClassId || selectedClass;
    $('pause-power-description').textContent = getPower(next).description;
    for (const input of $('pause-classes').querySelectorAll('input')) input.checked = input.value === next;
    const status = pendingClass ? `Selecting ${getClass(pendingClass).name}…`
      : player && player.classId !== next ? `${getClass(next).name} ready for your next respawn. Current: ${getClass(player.classId).name}.`
        : `${getClass(next).name} equipped. Changes apply on your next respawn.`;
    if ($('class-status').textContent !== status) $('class-status').textContent = status;
  }

  // Small rendered previews keep the class picker independent of 3D downloads.
  const characterPortraits = {
    assault: new URL('../output/models/tripo-runtime/ember-portrait.png', import.meta.url).href,
    sniper: new URL('../output/models/tripo-runtime/wisp-portrait.png', import.meta.url).href,
    scout: new URL('../output/models/tripo-runtime/dash-portrait.png', import.meta.url).href,
    heavy: new URL('../output/models/tripo-runtime/rook-portrait.png', import.meta.url).href,
  };
  const classRoles = { assault: 'All-rounder', sniper: 'Precision', scout: 'Close range', heavy: 'Sustained fire' };
  for (const location of ['lobby', 'pause']) {
    const options = Object.values(CLASSES).map((loadout) => {
      const power = getPower(loadout.id);
      const label = document.createElement('label');
      label.className = 'class-option';
      label.style.setProperty('--class-color', loadout.color);
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `${location}-class`; input.value = loadout.id;
      input.setAttribute('aria-label', `${loadout.name}, ${loadout.character}. ${loadout.weapon}, ${loadout.automatic ? 'automatic' : 'single shot'}. ${loadout.damage} damage, ${loadout.magazine} rounds, ${loadout.reloadTime} second reload. Q: ${power.name}. ${power.description}`);
      const body = document.createElement('span');
      body.className = 'class-option-body';
      const portrait = document.createElement('img');
      portrait.className = 'class-portrait';
      portrait.src = characterPortraits[loadout.id];
      portrait.alt = '';
      portrait.width = 70; portrait.height = 88;
      body.append(portrait);
      const identity = document.createElement('span');
      identity.className = 'class-option-identity';
      for (const [className, text] of [
        ['class-option-character', loadout.character],
        ['class-option-name', loadout.name],
        ['class-option-role', classRoles[loadout.id]],
        ['class-option-weapon', `${loadout.weapon} · ${loadout.mode}`],
      ]) {
        const span = document.createElement('span'); span.className = className; span.textContent = text; identity.append(span);
      }
      const stats = document.createElement('span');
      stats.className = 'class-option-stats';
      for (const [value, caption] of [[loadout.damage, 'DAMAGE'], [loadout.magazine, 'ROUNDS'], [`${loadout.reloadTime}s`, 'RELOAD']]) {
        const stat = document.createElement('span');
        const number = document.createElement('strong'); number.textContent = value;
        const name = document.createElement('span'); name.textContent = caption;
        stat.append(number, name); stats.append(stat);
      }
      body.append(identity, stats);
      const ability = document.createElement('span');
      ability.className = 'class-option-power';
      const powerName = document.createElement('strong');
      powerName.textContent = `Q · ${power.name} · ${power.cooldown}s`;
      ability.append(powerName);
      body.append(ability);
      input.addEventListener('change', async () => {
        if (!input.checked || !isClassId(input.value)) return;
        if (location === 'lobby') {
          if (connecting) return;
          saveClass(input.value);
          syncClasses();
          preloadClass(input.value);
        } else {
          if (!player || socket?.readyState !== WebSocket.OPEN) { syncClasses(); return; }
          const classId = input.value;
          const selection = ++classSelection;
          const connection = socket;
          pendingClass = classId;
          syncClasses();
          try {
            await requestClassModels(classId);
            if (selection !== classSelection || socket !== connection || !player) return;
            connection.send(JSON.stringify({ type: 'class', classId }));
          } catch {
            if (selection !== classSelection || socket !== connection || !player) return;
            pendingClass = null;
            syncClasses();
            $('class-status').textContent = 'Could not load that character. Select it again to retry.';
            return;
          }
        }
        syncClasses();
      });
      label.append(input, body); return label;
    });
    $(`${location}-classes`).replaceChildren(...options);
  }
  syncClasses();

  function requestClassModels(classId) {
    if (hasGameModels(classId)) return Promise.resolve();
    if (modelLoads.has(classId)) return modelLoads.get(classId);
    const request = loadGameModels(classId).then(() => {
      modelRetryAt.delete(classId);
      // Reconcile current state: the player may have changed class or room meanwhile.
      if (player) { syncWeapon(); updateAvatars(); }
    }).catch((error) => {
      modelRetryAt.set(classId, performance.now() + 15000);
      console.warn(`Unable to load ${getClass(classId).character}:`, error);
      throw error;
    }).finally(() => modelLoads.delete(classId));
    modelLoads.set(classId, request);
    return request;
  }

  function preloadClass(classId) {
    if (hasGameModels(classId) || performance.now() < (modelRetryAt.get(classId) || 0)) return;
    // One watcher per class, rather than one callback per network snapshot.
    if (!modelLoads.has(classId)) requestClassModels(classId).catch(() => {});
  }

  function syncWeapon(reset = false) {
    if (!player) return;
    const classId = getClass(player?.classId).id;
    if (classId === weaponClass || !hasGameModels(classId)) {
      if (reset) { weapon.reset(); recoil = 0; aiming = false; }
      if (classId !== weaponClass) preloadClass(classId);
      return;
    }
    const replacement = createWeapon(camera, classId);
    replacement.reset();
    weapon.dispose();
    weapon = replacement;
    weaponClass = classId;
    recoil = 0;
    aiming = false;
  }

  function setQuality() {
    const scale = settings.quality === 'low' ? 0.75 : settings.quality === 'high' ? Math.min(devicePixelRatio, 1.75) : Math.min(devicePixelRatio, 1.25);
    renderer.setPixelRatio(scale);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = settings.quality !== 'low';
  }
  setQuality();
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); setQuality(); });

  function syncAudio() {
    const active = Boolean(settings.sound && player && locked && !document.hidden && document.hasFocus());
    if (audioActive && !active) audioFeedback.clear();
    audioActive = active;
    gameAudio.setEnabled(active);
    return active;
  }

  function sound(kind, options = {}) {
    if (syncAudio()) gameAudio.play(kind, { classId: player?.classId, ...options });
  }

  function soundAt(kind, source, radius = 18) {
    const spatial = spatialAudio(source, player && { ...player, yaw }, radius);
    if (spatial) sound(kind, { ...spatial, local: false });
  }

  function primeAudio() {
    void gameAudio.unlock();
  }

  function showToast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastUntil = performance.now() + 2600;
  }

  function clearControls() {
    keys.clear(); trigger = false; aiming = false;
    audioFeedback.clear();
    syncAudio();
    blastInput.cancel(); blastPreview = null; powerEffects.setBlastAim(null);
    $('sniper-scope').hidden = true; $('crosshair').classList.remove('ads');
  }
  function updateBlastPreview(force = false) {
    if (!blastInput.sync(player, locked)) {
      blastPreview = null; powerEffects.setBlastAim(null); return null;
    }
    // Mouse aim is immediate, while player yaw/pitch update on fixed ticks.
    Object.assign(blastPose, player, { yaw, pitch });
    blastPreview = powerEffects.setBlastAim(blastPose, currentMap, force);
    return blastPreview;
  }
  function powerFeedback(event) {
    // Prediction and its server acknowledgement share one life/sequence key.
    if (!player || player.health <= 0 || event.owner !== playerId || event.life !== player.life) return;
    if (powerFeedbackLife === event.life && powerFeedbackSeq >= event.abilitySeq) return;
    powerFeedbackLife = event.life; powerFeedbackSeq = event.abilitySeq;
    powerFeedbackUntil = performance.now() + 450;
    if (['echo', 'air-juke', 'bulwark'].includes(event.powerId)) sound(event.powerId);
  }
  function powerLowersWeapon() { return blastInput.aiming || (player?.abilityTime > 0 && (player.classId === 'scout' || player.classId === 'heavy')); }
  function isAiming() { return aiming && locked && player?.health > 0 && player.reloadIn <= 0 && !powerLowersWeapon(); }

  function updateLobbyRoom() {
    $('play-label').textContent = connecting ? 'Joining arena…' : selectedRoom ? 'Join room' : 'Enter arena';
    $('play-context').textContent = selectedRoom ? `Room ${selectedRoom.toUpperCase()}` : 'Open room';
    $('entry-note').textContent = selectedRoom ? `Joining ${selectedRoom.toUpperCase()} uses that room’s arena and bot settings.` : 'No account or install needed.';
    syncBotSettings();
  }

  function setLobbyBusy(busy) {
    connecting = busy;
    for (const id of ['play', 'create-room', 'create-room-submit', 'join-toggle', 'room-code', 'join-submit', 'player-name']) $(id).disabled = busy;
    $('lobby').setAttribute('aria-busy', String(busy));
    updateLobbyRoom();
    syncClasses();
    syncMapDetails();
    syncModes();
    syncCreatePanel();
  }

  function activeMenu() {
    if ($('create-room-dialog').open) return $('create-room-dialog');
    if ($('join-room-dialog').open) return $('join-room-dialog');
    return !$('settings').hidden ? $('settings') : !$('pause').hidden ? $('pause') : null;
  }

  function syncMenuState() {
    const modalOpen = Boolean(activeMenu());
    $('lobby').inert = modalOpen;
    $('hud').inert = modalOpen;
  }

  function showPause() {
    if (!player || !$('settings').hidden) return;
    const opening = $('pause').hidden;
    $('pause').hidden = false;
    syncMenuState();
    if (opening || !$('pause').contains(document.activeElement)) $('resume').focus();
  }

  function captureFailed() {
    if ((!player && !connecting) || locked) return;
    $('capture-note').textContent = 'Click Back to the arena to capture your mouse. If it does not respond, open DRIFT in an active desktop browser window and try again.';
    $('capture-note').hidden = false;
    showPause();
  }

  function requestLock() {
    if (!canvas.requestPointerLock) { captureFailed(); return; }
    try {
      const result = canvas.requestPointerLock();
      result?.catch(captureFailed);
    } catch { captureFailed(); }
  }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked && !player && !connecting) {
      document.exitPointerLock();
      return;
    }
    clearControls();
    if (locked) {
      $('capture-note').hidden = true;
      $('pause').hidden = true;
      $('class-menu').open = false;
      $('settings').hidden = true;
      syncMenuState();
      canvas.tabIndex = -1;
      canvas.focus({ preventScroll: true });
    } else if (player) {
      showPause();
    }
    if (player) {
      $('scoreboard').hidden = true;
    }
  });
  document.addEventListener('pointerlockerror', captureFailed);
  document.addEventListener('mousemove', (event) => {
    if (!locked || !player || player.health <= 0) return;
    const sensitivity = 0.0018 * settings.sensitivity * (isAiming() ? getClass(player.classId).aimFov / 95 : 1);
    yaw -= event.movementX * sensitivity;
    yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * sensitivity, -1.48, 1.48);
  });
  document.addEventListener('mousedown', (event) => {
    if (!locked) return;
    if (blastInput.aiming && (event.button === 0 || event.button === 2)) {
      if (event.button === 0) blastInput.confirm(player, updateBlastPreview(true)?.landed, { yaw, pitch });
      else blastInput.cancel();
      trigger = aiming = false;
      if (!blastInput.aiming) { blastPreview = null; powerEffects.setBlastAim(null); }
      return;
    }
    if (event.button === 0) trigger = true;
    if (event.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', (event) => { if (event.button === 0) trigger = false; if (event.button === 2) aiming = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !$('settings').hidden) { event.preventDefault(); closeSettings(); return; }
    if (event.code === 'Escape' && player) {
      event.preventDefault();
      clearControls();
      if (document.pointerLockElement) document.exitPointerLock();
      showPause();
      return;
    }
    const menu = activeMenu();
    if (event.code === 'Tab' && menu) {
      const controls = [...menu.querySelectorAll('button, input, select, summary, a[href], [tabindex="0"]')].filter((control) => {
        if (control.disabled || !control.getClientRects().length) return false;
        if (control.type !== 'radio') return true;
        const group = [...menu.querySelectorAll('input[type="radio"]')].filter((radio) => radio.name === control.name);
        return control === (group.find((radio) => radio.checked) || group[0]);
      });
      const first = controls[0], last = controls.at(-1);
      if (first && (!menu.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
      return;
    }
    if (!player) return;
    if (!locked) return;
    if (['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyR', 'KeyE', 'KeyQ'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyQ' && player.classId === 'assault') {
      if (!event.repeat) {
        blastInput.toggle(player, locked); trigger = aiming = false;
        updateBlastPreview(true);
      }
      return;
    }
    keys.add(event.code);
    if (event.code === 'Tab') { $('scoreboard').hidden = false; renderScores(); }
  });
  document.addEventListener('keyup', (event) => { keys.delete(event.code); if (event.code === 'Tab') $('scoreboard').hidden = true; });
  addEventListener('blur', clearControls);
  document.addEventListener('visibilitychange', () => {
    clearControls();
    if (document.hidden && document.pointerLockElement) document.exitPointerLock();
    lastFrame = performance.now();
    accumulator = 0;
  });

  function showError(message) {
    $('lobby-error').textContent = message;
    setLobbyBusy(false);
  }

  function clearAvatars() {
    for (const avatar of avatars.values()) disposeGroup(avatar.group);
    avatars.clear();
  }

  function leave(message = '') {
    joinAttempt++;
    classSelection++;
    clearTimeout(connectionTimer);
    clearTimeout(inviteFeedbackTimer);
    const current = socket;
    socket = null;
    current?.close();
    player = null;
    powerFeedbackLife = powerFeedbackSeq = -1; powerFeedbackUntil = 0;
    predictedPower = null;
    viewMotion.reset(null);
    damageFeedback.reset();
    healthHud.reset();
    playerId = '';
    players = [];
    pending = [];
    outgoing = [];
    sequence = 0;
    pendingClass = null;
    setLobbyBusy(false);
    clearControls();
    clearAvatars();
    shotEffects.clear();
    powerEffects.clear();
    movementStyle.reset();
    celebration = null;
    if (document.pointerLockElement) document.exitPointerLock();
    locked = false;
    document.body.dataset.screen = 'lobby';
    $('hud').hidden = true;
    $('pause').hidden = true;
    $('class-menu').open = false;
    $('settings').hidden = true;
    $('scoreboard').hidden = true;
    $('capture-note').hidden = true;
    $('menu-status').textContent = '';
    $('copy-link-label').textContent = 'Copy invite link';
    syncMenuState();
    weapon.group.visible = false;
    $('lobby-error').textContent = message;
    $('play').focus();
    feedItems = [];
    $('kill-feed').replaceChildren();
  }

  async function start(nextRoom, quickplay = !nextRoom) {
    if (connecting || player) return;
    if (!canvas.requestPointerLock) { showError('Please open this game in a desktop browser with a keyboard and mouse.'); return; }
    const name = $('player-name').value.trim().slice(0, 16) || 'Rookie';
    if (quickplay) {
      selectedRoom = '';
    } else {
      nextRoom = String(nextRoom || 'open').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,12}$/.test(nextRoom)) { showError('Use a room code of 1–12 letters, numbers, or hyphens.'); return; }
      const publicMapId = Object.keys(PUBLIC_ROOMS).find((id) => PUBLIC_ROOMS[id] === nextRoom);
      if (publicMapId) loadMap(publicMapId);
      selectedRoom = Object.values(PUBLIC_ROOMS).includes(nextRoom) ? '' : nextRoom;
    }
    try { localStorage.setItem('drift-name', name); } catch { /* Optional. */ }
    setLobbyBusy(true);
    $('lobby-error').textContent = '';
    $('capture-note').hidden = true;
    primeAudio();
    requestLock();
    const attempt = ++joinAttempt;
    const classId = selectedClass;
    if (!hasGameModels(classId)) $('play-label').textContent = `Loading ${getClass(classId).character}…`;
    try {
      await requestClassModels(classId);
    } catch {
      if (attempt === joinAttempt) leave('Could not load your character. Check your connection and try again.');
      return;
    }
    if (attempt !== joinAttempt) return;
    updateLobbyRoom();
    const socketUrl = new URL('./ws', location.href);
    socketUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(socketUrl);
    socket = connection;
    const connectionTimeout = () => { if (socket === connection && !player) leave('The server did not respond. Please try again.'); };
    // The static lobby can load before Cloudflare starts the match container.
    connectionTimer = setTimeout(connectionTimeout, 40000);
    connection.addEventListener('open', () => {
      if (socket !== connection) return;
      clearTimeout(connectionTimer);
      connectionTimer = setTimeout(connectionTimeout, 8000);
      const botFill = selectedBotFill;
      const botDifficulty = selectedBotDifficulty;
      const mode = quickplay ? selectedMode : createMode;
      const team = quickplay ? undefined : MODES[mode].teams ? createTeam : undefined;
      connection.send(JSON.stringify(quickplay
        ? { type: 'join', quickplay: true, mapId: selectedMap, mode, team, name, classId, botFill, botDifficulty }
        : { type: 'join', room: nextRoom, name, classId, mapId: selectedMap, mode, team, botFill, botDifficulty }));
    });
    connection.addEventListener('message', (event) => {
      if (socket !== connection) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'error') {
        if (player) {
          pendingClass = null;
          syncClasses();
          $('class-status').textContent = message.message || 'Could not change class. Try again.';
          showToast(message.message || 'Could not change class. Try again.');
        } else leave(message.message || 'Unable to join the room.');
        return;
      }
      if (message.type === 'welcome') {
        clearTimeout(connectionTimer);
        playerId = message.id;
        room = message.room;
        roomBotDifficulty = normalizeBotDifficulty(message.botDifficulty);
        selectedRoom = Object.values(PUBLIC_ROOMS).includes(room) ? '' : room;
        loadMap(message.mapId);
        setLobbyBusy(false);
        player = { ...message.player };
        powerFeedbackLife = player.life; powerFeedbackSeq = player.abilitySeq; powerFeedbackUntil = 0;
        predictedPower = null;
        powerEffects.sync({ players: [player], effects: message.effects || [] }, playerId);
        movementStyle.reset();
        celebration = null;
        viewMotion.reset(player);
        damageFeedback.reset();
        healthHud.reset(player.health);
        saveClass(getClass(player.nextClassId || player.classId).id);
        syncClasses();
        syncWeapon(true);
        yaw = player.yaw || 0;
        pitch = player.pitch || 0;
        sound('round-start');
        offset.set(0, 0, 0);
        sequence = player.seq || 0;
        pending = [];
        outgoing = [];
        accumulator = 0;
        document.body.dataset.screen = 'playing';
        $('hud').hidden = false;
        $('settings').hidden = true;
        if (!locked) showPause();
        else syncMenuState();
        const roomName = selectedRoom ? `Room ${room.toUpperCase()}` : 'Open arena';
        $('room-label').textContent = `${currentMap.name.toUpperCase()} / ${selectedRoom ? room.toUpperCase() : 'OPEN'}`;
        $('pause-room').textContent = `${currentMap.name} · ${roomName}`;
        roomMode = isModeId(message.mode) ? message.mode : DEFAULT_MODE;
        $('hud-mode').textContent = MODES[roomMode].name.toUpperCase();
        $('score-map').textContent = `${currentMap.name.toUpperCase()} / ${MODES[roomMode].name.toUpperCase()}`;
        $('pause-room').style.overflowWrap = '';
        clearTimeout(inviteFeedbackTimer);
        $('copy-link-label').textContent = 'Copy invite link';
        $('menu-status').textContent = '';
        const url = new URL(location.href);
        url.searchParams.set('room', room);
        url.searchParams.set('map', currentMap.id);
        history.replaceState(null, '', url);
        weapon.group.visible = true;
        showToast(`Q · ${getPower(player.classId).name}. ${currentMap.ropes.length ? 'E to ride ropes. Space to jump off.' : 'Keep moving.'}`);
      } else if (message.type === 'class-selected' && player && isClassId(message.classId)) {
        player.nextClassId = message.classId;
        if (!pendingClass || pendingClass === message.classId) {
          pendingClass = null;
          saveClass(message.classId);
        }
        syncClasses();
      } else if (message.type === 'state' && player) {
        receiveState(message);
      } else if (message.type === 'pong') {
        $('ping').textContent = `${Math.max(0, Math.round(performance.now() - message.sent))} ms`;
      }
    });
    connection.addEventListener('close', () => { if (socket === connection) leave('Connection lost. Your room is still in the link—join again when ready.'); });
    connection.addEventListener('error', () => { if (socket === connection && !player) leave('Could not connect to the game server. Please try again.'); });
  }

  function receiveState(message) {
    players = message.players;
    roomBotDifficulty = normalizeBotDifficulty(message.botDifficulty);
    remaining = message.remaining;
    const authoritative = players.find((item) => item.id === playerId);
    if (authoritative) {
      if (predictedPower && authoritative.seq >= predictedPower.inputSeq) {
        if (authoritative.life !== predictedPower.life || authoritative.abilitySeq < predictedPower.abilitySeq) {
          powerEffects.cancelActivation(predictedPower);
          powerFeedbackLife = authoritative.life; powerFeedbackSeq = authoritative.abilitySeq; powerFeedbackUntil = 0;
        }
        predictedPower = null;
      }
      const old = player;
      if (authoritative.life !== old.life) {
        player = { ...authoritative };
        powerFeedbackUntil = 0;
        predictedPower = null;
        viewMotion.reset(player);
        damageFeedback.reset();
        healthHud.reset(player.health);
        pending = [];
        outgoing = [];
        offset.set(0, 0, 0);
        yaw = player.yaw;
        pitch = player.pitch;
        clearControls();
        movementStyle.reset();
        syncWeapon(true);
        if (!(message.events || []).some((event) => event.type === 'round')) sound('respawn');
        showToast(`${getClass(player.classId).name} equipped. Keep moving.`);
      } else {
        if (old.health > 0 && authoritative.health <= 0) audioFeedback.clear();
        if (authoritative.health < old.health) {
          const hit = (message.events || []).findLast((event) => event.type === 'shot' && event.hit === playerId);
          damageFeedback.hit(old.health - authoritative.health, hit?.from);
          sound('hurt');
        }
        pending = pending.filter((input) => input.seq > authoritative.seq);
        player = { ...authoritative };
        if (player.health > 0) for (const input of pending) stepPlayer(player, input, STEP, currentMap);
        const error = new THREE.Vector3(old.x - player.x, old.y - player.y, old.z - player.z);
        if (error.lengthSq() < 16 && player.health > 0) {
          offset.add(error);
          offset.y += (old.eyeHeight ?? EYE_HEIGHT) - (player.eyeHeight ?? EYE_HEIGHT);
          viewMotion.reconcile(old, player);
        } else {
          offset.set(0, 0, 0);
          viewMotion.reset(player);
        }
      }
      syncClasses();
      if (weaponClass !== player.classId) syncWeapon();
      healthHud.update(player.health, { animate: animateDamage() });
    }
    const audible = syncAudio();
    audioFeedback.sync(player, audible);
    const listener = player && { ...player, yaw };
    audioFeedback.observe(players, message.effects || [], listener, { active: audible });
    updateAvatars();
    powerEffects.sync({ players, effects: message.effects || [] }, playerId);
    for (const event of message.events || []) {
      if (event.type === 'shot') {
        powerEffects.event(event);
        if (audible) audioFeedback.remoteShot(event, listener);
        if (celebration?.winnerId === event.id) celebration = null;
        const remoteGun = avatars.get(event.id)?.group.userData.character.gun;
        const origin = event.id === playerId ? weapon.muzzlePosition(muzzle)
          : remoteGun?.localToWorld(muzzle.fromArray(remoteGun.userData.anchors.muzzle));
        shotEffects.shoot(event, { origin });
        const victim = players.find((item) => item.id === event.hit);
        const friendlyHit = MODES[roomMode]?.teams && victim?.team && victim.team === player?.team;
        if (event.hit && event.id === playerId && !friendlyHit) { hitAlpha = 1; sound('hit'); }
        if (targets.has(event.hit)) targets.get(event.hit).hitAt = performance.now() / 1000;
      } else if (event.type === 'kill') {
        const killerState = players.find((item) => item.id === event.killer);
        const victimState = players.find((item) => item.id === event.victim);
        const killer = killerState ? displayName(killerState) : event.killerName || 'Player';
        const victim = victimState ? displayName(victimState) : event.victimName || 'Player';
        const line = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = killer;
        line.append(strong, document.createTextNode(`  →  ${victim}`));
        $('kill-feed').prepend(line);
        feedItems.push({ line, until: performance.now() + 5000 });
        if (event.killer === playerId) showToast(event.airborne ? `AIR MAIL · Eliminated ${victim}` : `Eliminated ${victim}`);
      } else if (event.type === 'power') {
        powerEffects.event(event);
        if (event.action === 'activate') {
          powerFeedback(event);
          if (event.owner !== playerId && ['echo', 'air-juke', 'bulwark'].includes(event.powerId)) soundAt(event.powerId, event);
        } else if (event.action === 'pop') soundAt('pop', event);
        if (celebration?.winnerId === event.owner) celebration = null;
      } else if (event.type === 'round') {
        audioFeedback.clear();
        sound('round-start');
        shotEffects.clear();
        powerEffects.clear();
        blastInput.cancel(); blastPreview = null;
        movementStyle.reset();
        powerFeedbackUntil = 0;
        if (MODES[roomMode]?.teams) {
          celebration = null;
          showToast(event.winnerTeam ? `Team ${event.winnerTeam.toUpperCase()} wins the round, ${event.scoreA}–${event.scoreB}! Fresh start.` : `Round tied, ${event.scoreA}–${event.scoreB}. Fresh start.`);
        } else {
          celebration = event.winnerId ? { winnerId: event.winnerId, startedAt: performance.now() / 1000 } : null;
          showToast(event.winnerId ? `${event.winnerName} takes the round! Fresh start.` : 'New round. Fresh start.');
        }
      }
    }
    if (!$('scoreboard').hidden) renderScores();
    renderZones();
  }

  function disposeGroup(group) {
    disposeModel(group);
  }

  function updateAvatars() {
    const seen = new Set();
    for (const state of players) {
      if (state.id === playerId) continue;
      seen.add(state.id);
      let avatar = avatars.get(state.id);
      const loadout = getClass(state.classId);
      const visualClass = hasGameModels(loadout.id) ? loadout.id : avatar?.classId || fallbackClass;
      if (visualClass !== loadout.id) preloadClass(loadout.id);
      const replace = !avatar || avatar.classId !== visualClass;
      const reset = replace || avatar.state.life !== state.life;
      if (replace) {
        const group = createAvatar(getClass(visualClass).color, visualClass);
        const label = createPlayerLabel(displayName(state), state.health);
        group.add(label.sprite);
        group.position.set(state.x, state.y, state.z);
        scene.add(group);
        if (avatar) disposeGroup(avatar.group);
        avatar = { group, label, state, classId: visualClass };
        avatars.set(state.id, avatar);
      }
      if (reset) {
        avatar.group.position.set(state.x, state.y, state.z);
        avatar.group.rotation.y = state.yaw;
        avatar.group.scale.y = 1;
        avatar.label.sprite.scale.y = PLAYER_LABEL_HEIGHT / avatar.group.scale.y;
      }
      avatar.state = state;
      avatar.label.update(state.health);
      avatar.group.visible = state.health > 0;
      if (reset) animateAvatar(avatar, 0, 0, true);
    }
    for (const [id, avatar] of avatars) if (!seen.has(id)) { disposeGroup(avatar.group); avatars.delete(id); }
  }

  function animateAvatar(avatar, delta, time, reset = false) {
    const state = avatar.state;
    characterMotion.delta = delta; characterMotion.time = time; characterMotion.reset = reset;
    characterMotion.speed = Math.hypot(state.vx, state.vz);
    characterMotion.grounded = state.grounded;
    characterMotion.vy = state.vy;
    characterMotion.crouching = state.crouching; characterMotion.sliding = state.sliding;
    characterMotion.pitch = state.pitch;
    characterMotion.reloading = state.reloadIn > 0;
    characterMotion.firing = state.fired;
    characterMotion.abilityTime = state.abilityTime;
    characterMotion.shieldHealth = state.shieldHealth;
    characterMotion.dashX = state.dashX; characterMotion.dashZ = state.dashZ; characterMotion.yaw = state.yaw;
    characterMotion.celebration = 0;
    if (celebration?.winnerId === state.id) {
      const elapsed = time - celebration.startedAt;
      if (elapsed > 2 || state.health <= 0 || !state.grounded || state.crouching || state.sliding || characterMotion.speed > .15 || state.reloadIn > 0 || state.fired || state.abilityTime > 0) celebration = null;
      else if (!reset && animateDamage()) characterMotion.celebration = Math.max(0, elapsed / 2);
    }
    updateCharacter(avatar.group, characterMotion);
    avatar.group.userData.character.head.getWorldPosition(avatarPosition);
    avatar.group.worldToLocal(avatarPosition);
    avatar.label.sprite.position.y = avatarPosition.y + .38;
  }

  function displayName(state) { return `${state.name}${state.bot ? ' · AI' : ''}`; }

  function renderScores() {
    const teams = MODES[roomMode]?.teams;
    const sorted = [...players].sort((a, b) => (teams ? (a.team || '').localeCompare(b.team || '') : 0) || b.kills - a.kills || a.deaths - b.deaths);
    const rows = sorted.map((state) => {
      const row = document.createElement('tr');
      if (state.id === playerId) row.className = 'self';
      const nameCell = document.createElement('td'); nameCell.textContent = displayName(state) + (state.id === playerId ? ' (you)' : '');
      const teamCell = document.createElement('td'); teamCell.textContent = state.team ? `TEAM ${state.team.toUpperCase()}` : ''; teamCell.hidden = !teams;
      const killsCell = document.createElement('td'); killsCell.textContent = state.kills;
      const deathsCell = document.createElement('td'); deathsCell.textContent = state.deaths;
      row.append(nameCell, teamCell, killsCell, deathsCell);
      return row;
    });
    $('score-rows').replaceChildren(...rows);
    $('score-team-header').hidden = !teams;
    if (teams) {
      const totals = players.reduce((acc, p) => { if (p.team) acc[p.team] = (acc[p.team] || 0) + p.kills; return acc; }, { a: 0, b: 0 });
      $('score-teams').hidden = false;
      $('score-teams').textContent = `TEAM A ${totals.a} · TEAM B ${totals.b}`;
    } else {
      $('score-teams').hidden = true;
    }
  }

  function renderZones() {
    const container = $('hud-zones');
    if (roomMode !== 'domination' || !currentMap.zones?.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.replaceChildren(...currentMap.zones.map((zone) => {
      let holder;
      let contested = false;
      for (const state of players) {
        if (state.health <= 0) continue;
        const dx = state.x - zone.x, dz = state.z - zone.z;
        if (Math.hypot(dx, dz) > zone.radius) continue;
        if (holder === undefined) holder = state.team;
        else if (holder !== state.team) { contested = true; break; }
      }
      const bar = document.createElement('div');
      bar.className = 'hud-zone';
      const fill = document.createElement('div');
      fill.className = `hud-zone-fill ${contested ? 'contested' : holder ? `team-${holder}` : 'empty'}`;
      bar.appendChild(fill);
      return bar;
    }));
  }

  function inputForTick() {
    const active = locked && player?.health > 0;
    blastInput.sync(player, active);
    const throwBlast = blastInput.takeThrow(player, active);
    return {
      seq: ++sequence,
      forward: active ? Number(keys.has('KeyW')) - Number(keys.has('KeyS')) : 0,
      strafe: active ? Number(keys.has('KeyD')) - Number(keys.has('KeyA')) : 0,
      yaw: throwBlast?.yaw ?? yaw, pitch: throwBlast?.pitch ?? pitch,
      jump: active && keys.has('Space'),
      sprint: active && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
      crouch: active && (keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight')),
      fire: active && trigger && !blastInput.aiming && !throwBlast,
      reload: active && keys.has('KeyR'),
      interact: active && keys.has('KeyE'),
      ability: player?.classId === 'assault' ? Boolean(throwBlast) : active && keys.has('KeyQ'),
    };
  }

  function tick() {
    if (!player || socket?.readyState !== WebSocket.OPEN) return;
    const input = inputForTick();
    const before = { ...player };
    viewMotion.beforeStep(player);
    stepPlayer(player, input, STEP, currentMap);
    viewMotion.afterStep(player);
    audioFeedback.step(before, player, input, STEP, syncAudio());
    if (player.abilityUsed) {
      const event = { type: 'power', action: 'activate', powerId: getPower(player.classId).id, owner: playerId,
        life: player.life, abilitySeq: player.abilitySeq, x: player.x, y: player.y, z: player.z,
        yaw: player.yaw, dashX: player.dashX, dashZ: player.dashZ };
      powerFeedback(event);
      powerEffects.event(event);
      predictedPower = { ...event, inputSeq: input.seq };
    }
    const style = movementStyle.update(player, performance.now());
    if (style) showToast(`${style} · Launch → land → slide`);
    pending.push(input);
    outgoing.push(input);
    if (pending.length > 120) { leave('The connection is too far behind. Please join again.'); return; }
    if (outgoing.length >= 2) { socket.send(JSON.stringify({ type: 'input', inputs: outgoing })); outgoing = []; }
    if (player.fired) recoil = getClass(player.classId).recoil;
  }

  function updateHud(now) {
    if (!player) return;
    const health = Math.max(0, player.health);
    const loadout = getClass(player.classId);
    const power = getPower(player.classId);
    const ability = getAbilityHudState(player, { aiming: blastInput.aiming, preview: blastPreview, deployed: now < powerFeedbackUntil });
    $('ability-name').textContent = power.name;
    $('ability-block').style.setProperty('--power-color', power.color);
    $('ability-block').dataset.power = power.id;
    $('ability-block').dataset.state = ability.state;
    $('ability-block').dataset.ready = String(ability.ready);
    $('ability-block').dataset.active = String(ability.active);
    $('ability-block').dataset.motion = animateDamage() ? 'on' : 'off';
    $('ability-status').textContent = ability.status;
    $('ability-hint').textContent = ability.hint;
    $('ability-countdown').textContent = ability.state === 'cooldown' ? ability.status.replace(/s$/, '') : '';
    $('ability-fill').style.strokeDashoffset = String((1 - ability.progress) * 100);
    $('ability-block').setAttribute('aria-label', `${power.name}: ${ability.status}. ${ability.hint}. ${power.description}`);
    const speed = Math.hypot(player.vx, player.vz);
    healthHud.update(health, { animate: animateDamage() });
    $('ammo').textContent = player.ammo;
    $('ammo-max').textContent = loadout.magazine;
    $('class-name').textContent = `${loadout.character} · ${loadout.name}`.toUpperCase();
    $('weapon-name').textContent = loadout.weapon;
    $('weapon-mode').textContent = loadout.mode;
    $('speed').textContent = speed.toFixed(1);
    $('movement-state').textContent = player.ropeId ? 'ON ROPE' : player.sliding ? 'SLIDING' : !player.grounded ? 'AIRBORNE' : speed > 7.8 ? 'SPRINTING' : 'GROUNDED';
    const nearbyRope = health > 0 && locked && getNearbyRope(player, currentMap);
    $('interact-hint').hidden = !locked || health <= 0 || (!player.ropeId && !nearbyRope);
    $('interact-action').textContent = player.ropeId ? 'Release rope · SPACE to jump off' : 'Ride rope';
    $('reload-hint').textContent = player.reloadIn > 0 ? 'RELOADING…' : !loadout.automatic && player.fireCooldown > 0 ? 'CYCLING BOLT…' : 'R · RELOAD';
    $('player-count').textContent = `${players.length || 1} / 6`;
    const botCount = players.filter((state) => state.bot).length;
    const difficultyLabel = getBotDifficulty(roomBotDifficulty).label;
    $('bot-count').textContent = botCount ? `${botCount} AI · ${difficultyLabel} difficulty` : '';
    $('bot-count').hidden = botCount === 0;
    $('pause-bots').textContent = botCount ? `${difficultyLabel} bots · ${botCount} in this room` : 'No bots in this room';
    const seconds = Math.max(0, Math.ceil(remaining || 0));
    $('match-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    $('warmup-tip').hidden = players.length - botCount > 1;
    $('warmup-tip').textContent = botCount ? 'AI opponents are active. Copy an invite link to bring friends.' : 'Warm up on the orange targets. Copy an invite link to bring friends.';
    $('death-notice').hidden = health > 0;
    $('respawn-count').textContent = Math.max(1, Math.ceil(player.respawnIn || 0));
    $('crosshair').style.setProperty('--gap', `${(isAiming() ? 3 : 6) + recoil * 7 + (speed > 8 ? 2 : 0)}px`);
    if (now > toastUntil) $('toast').classList.remove('visible');
    for (const feed of feedItems) if (now > feed.until) feed.line.remove();
    feedItems = feedItems.filter((feed) => now <= feed.until);
  }

  $('play').addEventListener('click', () => start(selectedRoom));
  function closeCreateRoom() {
    $('create-room-dialog').close();
    $('bot-settings-home').append($('bot-settings'));
    $('create-room').setAttribute('aria-expanded', 'false');
    syncBotSettings();
  }
  $('create-room').addEventListener('click', () => {
    if (connecting || player) return;
    closeJoinRoom();
    $('create-room-context').textContent = `${currentMap.name} · ${$('player-name').value.trim() || 'Rookie'} · ${getClass(selectedClass).character}`;
    $('create-bot-settings').append($('bot-settings'));
    $('create-room-dialog').showModal();
    $('create-room').setAttribute('aria-expanded', 'true');
    syncCreatePanel();
    syncBotSettings();
  });
  $('create-room-close').addEventListener('click', closeCreateRoom);
  $('create-room-cancel').addEventListener('click', closeCreateRoom);
  $('create-room-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeCreateRoom();
  });
  $('create-room-dialog').addEventListener('click', (event) => {
    if (event.target !== $('create-room-dialog')) return;
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeCreateRoom();
  });
  $('create-room-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (connecting || player) return;
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const nextRoom = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 8);
    closeCreateRoom();
    start(nextRoom);
  });
  function closeJoinRoom() {
    $('join-room-dialog').close();
    $('join-toggle').setAttribute('aria-expanded', 'false');
    syncBotSettings();
  }
  $('join-toggle').addEventListener('click', () => {
    if (connecting || player) return;
    if ($('create-room-dialog').open) closeCreateRoom();
    $('join-room-dialog').showModal();
    $('join-toggle').setAttribute('aria-expanded', 'true');
    syncBotSettings();
    $('room-code').focus();
  });
  $('join-room-close').addEventListener('click', closeJoinRoom);
  $('join-room-cancel').addEventListener('click', closeJoinRoom);
  $('join-room-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeJoinRoom();
  });
  $('join-room-dialog').addEventListener('click', (event) => {
    if (event.target !== $('join-room-dialog')) return;
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeJoinRoom();
  });
  $('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (connecting || player) return;
    closeJoinRoom();
    start($('room-code').value, false);
  });
  $('resume').addEventListener('click', () => { primeAudio(); requestLock(); });
  $('leave').addEventListener('click', () => {
    selectedRoom = '';
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    leave();
    $('map-choices').querySelector('input:checked')?.focus();
    $('map-preview').scrollIntoView({ block: 'nearest' });
  });
  $('copy-link').addEventListener('click', async () => {
    const currentSocket = socket;
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    url.searchParams.set('map', currentMap.id);
    clearTimeout(inviteFeedbackTimer);
    try {
      await navigator.clipboard.writeText(url.href);
      if (socket !== currentSocket || !player) return;
      $('copy-link-label').textContent = 'Link copied';
      $('menu-status').textContent = 'Invite link copied. Send it to a friend to join this room.';
      inviteFeedbackTimer = setTimeout(() => {
        $('copy-link-label').textContent = 'Copy invite link';
        $('menu-status').textContent = '';
      }, 3000);
    } catch {
      if (socket !== currentSocket || !player) return;
      $('pause-room').textContent = `Invite link: ${url.href}`;
      $('pause-room').style.overflowWrap = 'anywhere';
      $('copy-link-label').textContent = 'Copy invite link';
      $('menu-status').textContent = 'Copy is unavailable here. Select and copy the invite link above.';
    }
  });

  function openSettings() {
    settingsOrigin = player ? 'pause' : 'lobby';
    $('pause').hidden = true;
    $('settings').hidden = false;
    syncMenuState();
    $('settings-close').focus();
  }
  function closeSettings() {
    $('settings').hidden = true;
    if (settingsOrigin === 'pause' && player) {
      $('pause').hidden = false;
      syncMenuState();
      $('pause-settings').focus();
    } else {
      syncMenuState();
      $('settings-open').focus();
    }
  }
  $('settings-open').addEventListener('click', openSettings);
  $('pause-settings').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  for (const id of ['sensitivity', 'sound', 'motion', 'quality']) {
    const input = $(id);
    if (input.type === 'checkbox') input.checked = settings[id]; else input.value = settings[id];
    input.addEventListener('input', () => {
      settings[id] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
      $('sensitivity-value').textContent = Number(settings.sensitivity).toFixed(1);
      if (id === 'quality') setQuality();
      if (id === 'sound') { syncAudio(); if (settings.sound) primeAudio(); }
      try { localStorage.setItem('drift-settings', JSON.stringify(settings)); } catch { /* Optional. */ }
    });
  }
  $('sensitivity-value').textContent = Number(settings.sensitivity).toFixed(1);
  updateLobbyRoom();

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (document.hidden) return;
    const time = now / 1000;
    arena.update(time);
    accumulator += delta;
    let steps = 0;
    while (accumulator >= STEP && steps < 6) { tick(); accumulator -= STEP; steps++; }
    updateBlastPreview();
    if (!player) {
      const orbit = animateDamage() ? Math.sin(time * 0.055) * 0.08 : 0;
      const preview = currentMap.preview || { position: { x: 26, y: 18, z: 31 }, target: { x: -2, y: 1, z: -3 } };
      camera.position.set(preview.position.x * Math.cos(orbit) + preview.position.z * Math.sin(orbit), preview.position.y,
        preview.position.z * Math.cos(orbit) - preview.position.x * Math.sin(orbit));
      camera.lookAt(preview.target.x, preview.target.y, preview.target.z);
      camera.fov = 62;
      camera.updateProjectionMatrix();
    } else {
      offset.multiplyScalar(Math.exp(-delta * 16));
      const movement = Math.hypot(player.vx, player.vz);
      const aimed = isAiming();
      const view = viewMotion.sample(player, accumulator / STEP, delta, animateDamage(), aimed, offset, currentMap);
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(pitch + (animateDamage() ? recoil * 0.009 : 0), yaw, view.roll, 'YXZ');
      const targetFov = aimed ? getClass(player.classId).aimFov : 85 + (animateDamage() ? Math.min(movement, 14) * 0.35 + view.powerFov : 0);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-delta * 12));
      camera.updateProjectionMatrix();
      const scoped = aimed && player.classId === 'sniper' && camera.fov < 45;
      $('sniper-scope').hidden = !scoped;
      $('crosshair').hidden = player.health <= 0 || !locked || scoped;
      $('crosshair').classList.toggle('ads', aimed && player.classId !== 'sniper');
      weapon.group.visible = player.health > 0 && !scoped;
      weapon.update({ time, delta, phase: view.phase, moving: view.moving, sliding: view.slide, firing: recoil, aiming: aimed, motion: animateDamage(), reloading: player.reloadIn > 0, lowered: powerLowersWeapon(), abilityTime: player.abilityTime, shieldHealth: player.shieldHealth, dashX: player.dashX, dashZ: player.dashZ, yaw: player.yaw });
      if (now - lastPing > 2000 && socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'ping', sent: now })); lastPing = now; }
    }
    for (const avatar of avatars.values()) {
      const state = avatar.state;
      avatar.group.position.lerp(avatarPosition.set(state.x, state.y, state.z), 1 - Math.exp(-delta * 18));
      const angle = Math.atan2(Math.sin(state.yaw - avatar.group.rotation.y), Math.cos(state.yaw - avatar.group.rotation.y));
      avatar.group.rotation.y += angle * (1 - Math.exp(-delta * 20));
      avatar.label.sprite.scale.y = PLAYER_LABEL_HEIGHT / avatar.group.scale.y;
      animateAvatar(avatar, delta, time);
    }
    characterMotion.delta = delta; characterMotion.time = time;
    characterMotion.speed = 0; characterMotion.grounded = true;
    characterMotion.vy = 0;
    characterMotion.crouching = false; characterMotion.sliding = false; characterMotion.pitch = 0;
    characterMotion.reset = false; characterMotion.reloading = false; characterMotion.firing = false; characterMotion.celebration = 0;
    characterMotion.abilityTime = 0; characterMotion.shieldHealth = 0; characterMotion.dashX = characterMotion.dashZ = characterMotion.yaw = 0;
    for (const target of targets.values()) {
      target.group.rotation.z = Math.max(0, 0.25 - (time - target.hitAt)) * Math.sin((time - target.hitAt) * 35);
      updateCharacter(target.group, characterMotion);
    }
    shotEffects.update(delta);
    powerEffects.update(delta, time, { quality: settings.quality, motion: animateDamage(), localPlayer: player, camera });
    recoil = Math.max(0, recoil - delta * 12);
    hitAlpha = Math.max(0, hitAlpha - delta * 5);
    $('hit-marker').style.opacity = hitAlpha;
    damageFeedback.update(delta, player, yaw, animateDamage());
    if (now - lastHud > 90) { updateHud(now); lastHud = now; }
    if (now - lastFps > 750) { $('fps').textContent = `${Math.round(frameCount * 1000 / (now - lastFps))} fps`; frameCount = 0; lastFps = now; }
    frameCount++;
    renderer.render(scene, camera);
  }

  $('boot').hidden = true;
  requestAnimationFrame(frame);
}
