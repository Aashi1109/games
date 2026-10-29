export interface AudioPlayOptions {
  classId?: string;
  volume?: number;
  pan?: number;
  local?: boolean;
}
interface SampleOptions {
  volume?: number;
  pan?: number;
  rate?: number;
  delay?: number;
  offset?: number;
  duration?: number;
  loop?: boolean;
  group?: string;
}
interface Voice {
  group: string;
  source?: AudioBufferSourceNode;
  gain?: GainNode;
  panner?: StereoPannerNode;
}
interface AudioOptions {
  enabled?: boolean;
  contextFactory?: () => AudioContext | null;
  fetcher?: typeof fetch;
  baseUrl?: string | URL;
}
export type GameAudio = ReturnType<typeof createGameAudio>;
import { getClass } from '../shared/classes.ts';

const ASSET_IDS = [
  'fire-assault',
  'fire-sniper',
  'fire-scout',
  'fire-heavy',
  'reload',
  'reload-alternate',
  'bolt',
  'dry-fire',
  'footstep-1',
  'footstep-2',
  'slide',
  'hit',
  'hurt',
  'power-echo',
  'power-dash',
  'power-shield',
  'power-pop',
  'round-start',
  'respawn',
];
export const AUDIO_ASSETS = Object.freeze(
  Object.fromEntries(ASSET_IDS.map((id) => [id, `audio/${id}.wav`])),
);
export const MAX_AUDIO_VOICES = 32;

const CUES: Readonly<Record<string, [string, number]>> = Object.freeze({
  bolt: ['bolt', 0.3],
  'dry-fire': ['dry-fire', 0.4],
  slide: ['slide', 1],
  hit: ['hit', 1],
  hurt: ['hurt', 1],
  echo: ['power-echo', 1],
  'air-juke': ['power-dash', 1],
  bulwark: ['power-shield', 1],
  pop: ['power-pop', 1],
  'round-start': ['round-start', 0.25],
  respawn: ['respawn', 0.18],
});
const MASTER_VOLUME = 0.65;
const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const defaultContext = () => {
  const Context =
    globalThis.AudioContext ||
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  return Context ? new Context() : null;
};

/** Samples are fetched before interaction, but the audio device is opened only by unlock(). */
export function createGameAudio({
  enabled = true,
  contextFactory = defaultContext,
  fetcher = (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  baseUrl,
}: AudioOptions = {}) {
  const base = new URL(
    baseUrl ?? '/drift/',
    globalThis.location?.href ?? 'http://localhost/',
  );
  const bytes = new Map<string, ArrayBuffer>(),
    buffers = new Map<string, AudioBuffer>(),
    decoding = new Map<string, Promise<void>>(),
    voices = new Set<Voice>();
  const requests = new AbortController();
  let context: AudioContext | undefined,
    master: GainNode | undefined,
    compressor: DynamicsCompressorNode | undefined;
  let loading: Promise<void[]> | null | undefined,
    unlocking: Promise<boolean> | null | undefined;
  let slideVoice: Voice | null | undefined,
    footstep = 0;
  let disposed = false;
  const contextStateChanged = () => {
    if (context?.state !== 'running') stopAll();
  };

  async function decode(id: string) {
    if (disposed || !context || buffers.has(id) || !bytes.has(id)) return;
    if (decoding.has(id)) return decoding.get(id);
    const audioContext = context,
      data = bytes.get(id)!;
    const task = Promise.resolve()
      .then(() =>
        disposed ? undefined : audioContext.decodeAudioData(data.slice(0)),
      )
      .then((buffer) => {
        if (!disposed && buffer) {
          buffers.set(id, buffer);
          bytes.delete(id);
        }
      })
      .catch(() => {
        /* Retain the raw bytes for the next unlock attempt. */
      })
      .finally(() => decoding.delete(id));
    decoding.set(id, task);
    return task;
  }

  function preload() {
    if (disposed) return Promise.resolve();
    if (loading) return loading;
    loading = Promise.all(
      ASSET_IDS.map(async (id) => {
        try {
          if (!buffers.has(id) && !bytes.has(id)) {
            const response = await fetcher(
              new URL(AUDIO_ASSETS[id], base).href,
              { signal: requests.signal },
            );
            if (!response.ok || disposed) return;
            const data = await response.arrayBuffer();
            if (!disposed) bytes.set(id, data);
          }
        } catch {
          /* A missing sample must not prevent loading the others. */
        }
      }),
    ).finally(() => {
      loading = null;
    });
    return loading;
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    if (unlocking) return unlocking;
    try {
      if (!context) {
        const nextContext = contextFactory();
        if (!nextContext) return Promise.resolve(false);
        const nextMaster = nextContext.createGain();
        nextMaster.gain.value = enabled ? MASTER_VOLUME : 0;
        compressor = nextContext.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        nextMaster.connect(compressor).connect(nextContext.destination);
        context = nextContext;
        master = nextMaster;
        context.addEventListener?.('statechange', contextStateChanged);
      }
      // resume() is deliberately called synchronously inside the gesture handler.
      unlocking = Promise.resolve(context.resume())
        .then(async () => {
          if (disposed || context?.state !== 'running') return false;
          await preload();
          await Promise.all(ASSET_IDS.map(decode));
          return !disposed && context?.state === 'running';
        })
        .catch(() => false)
        .finally(() => {
          unlocking = null;
        });
      return unlocking;
    } catch {
      return Promise.resolve(false);
    }
  }

  function clean(voice: Voice) {
    voices.delete(voice);
    if (slideVoice === voice) slideVoice = null;
    if (voice.source) voice.source.onended = null;
    voice.source?.disconnect();
    voice.gain?.disconnect();
    voice.panner?.disconnect();
  }

  function stop(voice: Voice, fade = 0) {
    if (!context || !voice.source || !voice.gain) {
      clean(voice);
      return;
    }
    const now = context.currentTime;
    try {
      if (fade) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + fade);
        voice.source.stop(now + fade);
      } else {
        voice.source.stop(now);
        clean(voice);
      }
    } catch {
      clean(voice);
    }
  }

  function stopGroup(group: string) {
    for (const voice of voices) if (voice.group === group) stop(voice);
  }

  function sample(
    id: string,
    {
      volume = 1,
      pan = 0,
      rate = 1,
      delay = 0,
      offset = 0,
      duration,
      loop = false,
      group = 'effect',
    }: SampleOptions = {},
  ) {
    const buffer = buffers.get(id);
    volume = clamp(volume, 0, 1, 0);
    if (
      disposed ||
      !enabled ||
      context?.state !== 'running' ||
      !buffer ||
      !volume
    )
      return null;
    const length = Math.min(
      duration ?? buffer.duration - offset,
      buffer.duration - offset,
    );
    if (length <= 0) return null;
    if (voices.size >= MAX_AUDIO_VOICES) {
      const oldest =
        [...voices].find((voice) => !voice.source?.loop) ??
        voices.values().next().value;
      if (oldest) stop(oldest);
    }
    const voice: Voice = { group };
    const start = context.currentTime + delay,
      end = start + length / rate;
    try {
      const source = (voice.source = context.createBufferSource()),
        gain = (voice.gain = context.createGain());
      const panner = (voice.panner = context.createStereoPanner?.());
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.loop = loop;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        volume,
        start + Math.min(loop ? 0.04 : 0.002, length / rate / 4),
      );
      if (!loop) {
        gain.gain.setValueAtTime(
          volume,
          Math.max(start + length / rate / 2, end - 0.012),
        );
        gain.gain.linearRampToValueAtTime(0, end);
      }
      source.connect(gain);
      if (panner) {
        panner.pan.value = clamp(pan, -1, 1, 0);
        gain.connect(panner).connect(master!);
      } else gain.connect(master!);
      voices.add(voice);
      source.onended = () => clean(voice);
      source.start(start, offset);
      if (!loop) source.stop(end);
      return voice;
    } catch {
      clean(voice);
      return null;
    }
  }

  function play(
    kind: string,
    {
      classId = 'assault',
      volume = 1,
      pan = 0,
      local = true,
    }: AudioPlayOptions = {},
  ) {
    volume = clamp(volume, 0, 1, 0);
    if (kind === 'fire') {
      const loadout = getClass(classId);
      const shot = sample(`fire-${loadout.id}`, {
        volume,
        pan,
        rate: 0.99 + Math.random() * 0.02,
      });
      if (shot && loadout.id === 'sniper' && local) {
        sample('bolt', { volume: volume * 0.3, delay: 0.36, group: 'bolt' });
      }
      return Boolean(shot);
    }
    if (kind === 'footstep') {
      const id = `footstep-${(footstep % 2) + 1}`;
      const step = sample(
        buffers.has(id) ? id : `footstep-${((footstep + 1) % 2) + 1}`,
        { volume, pan },
      );
      if (step) footstep++;
      return Boolean(step);
    }
    const cue = Object.hasOwn(CUES, kind) ? CUES[kind] : null;
    return Boolean(cue && sample(cue[0], { volume: volume * cue[1], pan }));
  }

  function stopReload() {
    stopGroup('reload');
  }

  function startReload(classId: string, remainingSeconds: number) {
    stopReload();
    stopGroup('bolt');
    const total = getClass(classId).reloadTime;
    const remaining = clamp(remainingSeconds, 0, total, 0);
    if (!remaining) return false;
    const alternate = classId === 'sniper' && buffers.has('reload-alternate');
    const id = alternate ? 'reload-alternate' : 'reload';
    // Quiet gaps in the approved recording separate eject, seat, and chamber.
    // Space the handling actions out instead of slowing the heavy weapon's pitch.
    const parts = alternate
      ? [
          [0, 0.12],
          [0.46, 0.23],
          [0.9, 0.376],
        ]
      : [
          [0.04, 0.4],
          [0.95, 0.16],
          [1.11, 0.385],
        ];
    const at = [0.02, total * 0.58, total - parts[2][1]];
    const elapsed = total - remaining;
    let started = false;
    for (let index = 0; index < parts.length; index++) {
      const [offset, duration] = parts[index];
      const progress = Math.max(0, elapsed - at[index]);
      if (progress >= duration) continue;
      started =
        Boolean(
          sample(id, {
            offset: offset + progress,
            duration: duration - progress,
            delay: Math.max(0, at[index] - elapsed),
            volume: 0.5,
            group: 'reload',
          }),
        ) || started;
    }
    return started;
  }

  function setSliding(sliding: boolean) {
    if (sliding) {
      slideVoice ||= sample('slide', { loop: true, group: 'slide' });
      return Boolean(slideVoice);
    }
    if (slideVoice) {
      const voice = slideVoice;
      slideVoice = null;
      stop(voice, 0.06);
    }
    return false;
  }

  function stopAll() {
    for (const voice of voices) stop(voice);
    footstep = 0;
  }

  function setEnabled(value: boolean) {
    if (disposed) return;
    enabled = Boolean(value);
    if (!enabled) stopAll();
    if (master) master.gain.value = enabled ? MASTER_VOLUME : 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    requests.abort();
    stopAll();
    context?.removeEventListener?.('statechange', contextStateChanged);
    master?.disconnect();
    compressor?.disconnect();
    bytes.clear();
    buffers.clear();
    decoding.clear();
    if (context) void Promise.resolve(context.close?.()).catch(() => {});
  }

  return {
    preload,
    unlock,
    setEnabled,
    play,
    startReload,
    stopReload,
    setSliding,
    stopAll,
    dispose,
  };
}
