import { getClass } from '../shared/classes.js';

const ASSET_IDS = ['fire-assault', 'fire-sniper', 'fire-scout', 'fire-heavy', 'reload', 'reload-alternate',
  'bolt', 'dry-fire', 'footstep-1', 'footstep-2', 'slide', 'hit', 'hurt', 'power-echo', 'power-dash',
  'power-shield', 'power-pop', 'round-start', 'respawn'];
export const AUDIO_ASSETS = Object.freeze(Object.fromEntries(ASSET_IDS.map((id) => [id, `audio/${id}.wav`])));
export const MAX_AUDIO_VOICES = 32;

const CUES = Object.freeze({
  bolt: ['bolt', .3], 'dry-fire': ['dry-fire', .4], slide: ['slide', 1], hit: ['hit', 1], hurt: ['hurt', 1],
  echo: ['power-echo', 1], 'air-juke': ['power-dash', 1], bulwark: ['power-shield', 1], pop: ['power-pop', 1],
  'round-start': ['round-start', .25], respawn: ['respawn', .18],
});
const MASTER_VOLUME = .65;
const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const defaultContext = () => {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Context ? new Context() : null;
};

/** Samples are fetched before interaction, but the audio device is opened only by unlock(). */
export function createGameAudio({ enabled = true, contextFactory = defaultContext,
  fetcher = (...args) => globalThis.fetch(...args), baseUrl } = {}) {
  const base = new URL(baseUrl ?? './', globalThis.location?.href ?? 'http://localhost/');
  const bytes = new Map(), buffers = new Map(), decoding = new Map(), voices = new Set();
  let context, master, loading, unlocking, slideVoice, footstep = 0;

  async function decode(id) {
    if (buffers.has(id) || !bytes.has(id)) return;
    if (decoding.has(id)) return decoding.get(id);
    const task = Promise.resolve().then(() => context.decodeAudioData(bytes.get(id).slice(0)))
      .then((buffer) => { buffers.set(id, buffer); bytes.delete(id); })
      .catch(() => { /* Retain the raw bytes for the next unlock attempt. */ })
      .finally(() => decoding.delete(id));
    decoding.set(id, task);
    return task;
  }

  function preload() {
    if (loading) return loading;
    loading = Promise.all(ASSET_IDS.map(async (id) => {
      try {
        if (!buffers.has(id) && !bytes.has(id)) {
          const response = await fetcher(new URL(AUDIO_ASSETS[id], base).href);
          if (!response.ok) return;
          bytes.set(id, await response.arrayBuffer());
        }
      } catch { /* A missing sample must not prevent loading the others. */ }
    })).finally(() => { loading = null; });
    return loading;
  }

  function unlock() {
    if (unlocking) return unlocking;
    try {
      if (!context) {
        const nextContext = contextFactory();
        if (!nextContext) return Promise.resolve(false);
        const nextMaster = nextContext.createGain();
        nextMaster.gain.value = enabled ? MASTER_VOLUME : 0;
        const compressor = nextContext.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = .003;
        compressor.release.value = .12;
        nextMaster.connect(compressor).connect(nextContext.destination);
        context = nextContext;
        master = nextMaster;
        context.addEventListener?.('statechange', () => {
          if (context.state !== 'running') stopAll();
        });
      }
      // resume() is deliberately called synchronously inside the gesture handler.
      unlocking = Promise.resolve(context.resume()).then(async () => {
        if (context.state !== 'running') return false;
        await preload();
        await Promise.all(ASSET_IDS.map(decode));
        return context.state === 'running';
      }).catch(() => false).finally(() => { unlocking = null; });
      return unlocking;
    } catch { return Promise.resolve(false); }
  }

  function clean(voice) {
    voices.delete(voice);
    if (slideVoice === voice) slideVoice = null;
    if (voice.source) voice.source.onended = null;
    voice.source?.disconnect();
    voice.gain?.disconnect();
    voice.panner?.disconnect();
  }

  function stop(voice, fade = 0) {
    const now = context.currentTime;
    try {
      if (fade) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + fade);
        voice.source.stop(now + fade);
      } else { voice.source.stop(now); clean(voice); }
    } catch { clean(voice); }
  }

  function stopGroup(group) {
    for (const voice of voices) if (voice.group === group) stop(voice);
  }

  function sample(id, { volume = 1, pan = 0, rate = 1, delay = 0, offset = 0,
    duration, loop = false, group = 'effect' } = {}) {
    const buffer = buffers.get(id);
    volume = clamp(volume, 0, 1, 0);
    if (!enabled || context?.state !== 'running' || !buffer || !volume) return null;
    const length = Math.min(duration ?? buffer.duration - offset, buffer.duration - offset);
    if (length <= 0) return null;
    if (voices.size >= MAX_AUDIO_VOICES) {
      const oldest = [...voices].find((voice) => !voice.source.loop) ?? voices.values().next().value;
      stop(oldest);
    }
    const voice = { group };
    const start = context.currentTime + delay, end = start + length / rate;
    try {
      const source = voice.source = context.createBufferSource(), gain = voice.gain = context.createGain();
      const panner = voice.panner = context.createStereoPanner?.();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.loop = loop;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + Math.min(loop ? .04 : .002, length / rate / 4));
      if (!loop) {
        gain.gain.setValueAtTime(volume, Math.max(start + length / rate / 2, end - .012));
        gain.gain.linearRampToValueAtTime(0, end);
      }
      source.connect(gain);
      if (panner) { panner.pan.value = clamp(pan, -1, 1, 0); gain.connect(panner).connect(master); }
      else gain.connect(master);
      voices.add(voice);
      source.onended = () => clean(voice);
      source.start(start, offset);
      if (!loop) source.stop(end);
      return voice;
    } catch { clean(voice); return null; }
  }

  function play(kind, { classId = 'assault', volume = 1, pan = 0, local = true } = {}) {
    volume = clamp(volume, 0, 1, 0);
    if (kind === 'fire') {
      const loadout = getClass(classId);
      const shot = sample(`fire-${loadout.id}`, { volume, pan, rate: .99 + Math.random() * .02 });
      if (shot && loadout.id === 'sniper' && local) {
        sample('bolt', { volume: volume * .3, delay: .36, group: 'bolt' });
      }
      return Boolean(shot);
    }
    if (kind === 'footstep') {
      const id = `footstep-${footstep % 2 + 1}`;
      const step = sample(buffers.has(id) ? id : `footstep-${(footstep + 1) % 2 + 1}`, { volume, pan });
      if (step) footstep++;
      return Boolean(step);
    }
    const cue = Object.hasOwn(CUES, kind) ? CUES[kind] : null;
    return Boolean(cue && sample(cue[0], { volume: volume * cue[1], pan }));
  }

  function stopReload() { stopGroup('reload'); }

  function startReload(classId, remainingSeconds) {
    stopReload();
    stopGroup('bolt');
    const total = getClass(classId).reloadTime;
    const remaining = clamp(remainingSeconds, 0, total, 0);
    if (!remaining) return false;
    const alternate = classId === 'sniper' && buffers.has('reload-alternate');
    const id = alternate ? 'reload-alternate' : 'reload';
    // Quiet gaps in the approved recording separate eject, seat, and chamber.
    // Space the handling actions out instead of slowing the heavy weapon's pitch.
    const parts = alternate ? [[0, .12], [.46, .23], [.90, .376]] : [[.04, .4], [.95, .16], [1.11, .385]];
    const at = [.02, total * .58, total - parts[2][1]];
    const elapsed = total - remaining;
    let started = false;
    for (let index = 0; index < parts.length; index++) {
      const [offset, duration] = parts[index];
      const progress = Math.max(0, elapsed - at[index]);
      if (progress >= duration) continue;
      started = Boolean(sample(id, { offset: offset + progress, duration: duration - progress,
        delay: Math.max(0, at[index] - elapsed), volume: .5, group: 'reload' })) || started;
    }
    return started;
  }

  function setSliding(sliding) {
    if (sliding) {
      slideVoice ||= sample('slide', { loop: true, group: 'slide' });
      return Boolean(slideVoice);
    }
    if (slideVoice) { const voice = slideVoice; slideVoice = null; stop(voice, .06); }
    return false;
  }

  function stopAll() {
    for (const voice of voices) stop(voice);
    footstep = 0;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) stopAll();
    if (master) master.gain.value = enabled ? MASTER_VOLUME : 0;
  }

  return { preload, unlock, setEnabled, play, startReload, stopReload, setSliding, stopAll };
}
