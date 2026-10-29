type Layer = 'effect' | 'ambient' | 'music';
interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
  layer: Layer;
}
interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  start?: number;
  layer?: Layer;
}
interface NoiseOptions {
  duration: number;
  gain: number;
  frequency: number;
  filter?: BiquadFilterType;
  start?: number;
  layer?: Layer;
}
// Faultline's original sound palette is synthesized locally. Nothing downloads,
// and no AudioContext is created until the first player gesture calls unlock().
const PHASES = new Set(['menu', 'mining', 'wave', 'won', 'lost', 'paused']);
const ACTIVE_PHASES = new Set(['menu', 'mining', 'wave']);
const MAX_VOICES = 32;
const EPSILON = 0.0001;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export class Soundscape {
  muted: boolean;
  volume: number;
  phase: string;
  context: AudioContext | null;
  _master: GainNode | null;
  _compressor: DynamicsCompressorNode | null;
  _noiseBuffer: AudioBuffer | null;
  _voices: Set<Voice>;
  _lastPlayed: Map<string, number>;
  _timer: ReturnType<typeof setInterval> | null;
  _nextBeat: number;
  _beat: number;
  _sceneStarted: boolean;
  _disposed: boolean;

  constructor() {
    this.muted = false;
    this.volume = 0.4;
    this.phase = 'menu';
    this.context = null;
    this._master = null;
    this._compressor = null;
    this._noiseBuffer = null;
    this._voices = new Set();
    this._lastPlayed = new Map();
    this._timer = null;
    this._nextBeat = 0;
    this._beat = 0;
    this._sceneStarted = false;
    this._disposed = false;
  }

  async unlock() {
    if (this._disposed) return false;
    try {
      if (!this.context) {
        const AudioContextClass =
          globalThis.AudioContext ||
          (
            globalThis as typeof globalThis & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass({ latencyHint: 'interactive' });
        this._master = this.context!.createGain();
        this._master.gain.value = this.muted ? 0 : this.volume;
        this._compressor = this.context.createDynamicsCompressor();
        this._compressor.threshold.value = -18;
        this._compressor.knee.value = 20;
        this._compressor.ratio.value = 4;
        this._compressor.attack.value = 0.004;
        this._compressor.release.value = 0.2;
        this._master.connect(this._compressor);
        this._compressor.connect(this.context.destination);
        this._noiseBuffer = this._makeNoise();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this._disposed || this.context.state !== 'running') return false;
      this._startScene();
      return true;
    } catch {
      // Sound is optional: an unsupported or blocked device never blocks play.
      return false;
    }
  }

  setMuted(muted: boolean) {
    this.muted = Boolean(muted);
    this._setMaster();
    if (this.muted) this._stopScene();
    else this._startScene();
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = clamp(volume, 0, 1);
    this._setMaster();
    if (this.volume === 0) this._stopScene();
    else this._startScene();
  }

  setPhase(phase: string) {
    if (!PHASES.has(phase) || this.phase === phase) return;
    this.phase = phase;
    this._stopScene();
    if (phase === 'paused') {
      for (const voice of [...this._voices]) this._stopVoice(voice);
    }
    this._startScene();
  }

  play(name: string, intensity = 1) {
    if (!this._canPlay() || this.phase === 'paused') return false;
    const now = this.context!.currentTime;
    const cooldowns: Record<string, number> = {
      drill: 0.075,
      break: 0.045,
      pickup: 0.065,
      shoot: 0.048,
      'enemy-hit': 0.06,
      'base-hit': 0.18,
      click: 0.055,
    };
    const cooldown = cooldowns[name] ?? 0.12;
    if (now - (this._lastPlayed.get(name) ?? -Infinity) < cooldown)
      return false;
    const power = Number.isFinite(intensity) ? clamp(intensity, 0.05, 1.5) : 1;
    const tone = (
      frequency: number,
      duration: number,
      gain: number,
      type: OscillatorType = 'sine',
      endFrequency = frequency,
      offset = 0,
    ) =>
      this._tone({
        frequency,
        endFrequency,
        duration,
        gain: gain * power,
        type,
        start: now + offset,
      });
    const noise = (
      duration: number,
      gain: number,
      frequency: number,
      filter: BiquadFilterType = 'bandpass',
      offset = 0,
    ) =>
      this._noise({
        duration,
        gain: gain * power,
        frequency,
        filter,
        start: now + offset,
      });

    switch (name) {
      case 'drill':
        noise(0.11, 0.2, 1150 + Math.random() * 550);
        tone(98 + Math.random() * 12, 0.095, 0.11, 'sawtooth', 62);
        break;
      case 'break':
        noise(0.24, 0.36, 700, 'lowpass');
        tone(92, 0.16, 0.23, 'triangle', 35);
        noise(0.06, 0.12, 2900, 'highpass', 0.035);
        break;
      case 'pickup':
        tone(680, 0.12, 0.12, 'sine', 800);
        tone(1020, 0.16, 0.09, 'sine', 1120, 0.055);
        break;
      case 'deposit':
        [220, 330, 440, 660].forEach((note, i) =>
          tone(note, 0.28, 0.14, 'triangle', note, i * 0.065),
        );
        noise(0.17, 0.1, 1200, 'lowpass');
        break;
      case 'shoot':
        tone(150, 0.1, 0.3, 'triangle', 42);
        noise(0.075, 0.28, 1650, 'lowpass');
        tone(740, 0.035, 0.07, 'square', 210);
        break;
      case 'enemy-hit':
        noise(0.11, 0.16, 2000);
        tone(180, 0.065, 0.12, 'triangle', 80);
        break;
      case 'base-hit':
        tone(68, 0.4, 0.36, 'sine', 27);
        noise(0.4, 0.33, 530, 'lowpass');
        tone(145, 0.17, 0.1, 'square', 100, 0.045);
        break;
      case 'wave':
        [0, 0.23, 0.46].forEach((offset) => {
          tone(164.81, 0.17, 0.13, 'triangle', 164.81, offset);
          tone(246.94, 0.17, 0.06, 'sine', 246.94, offset);
        });
        break;
      case 'upgrade':
        [329.63, 440, 659.25, 880].forEach((note, i) =>
          tone(note, 0.3, 0.13, 'sine', note, i * 0.08),
        );
        break;
      case 'recall':
        tone(140, 0.58, 0.19, 'sine', 790);
        noise(0.65, 0.18, 1200, 'bandpass');
        tone(790, 0.2, 0.09, 'sine', 660, 0.48);
        break;
      case 'win':
        [261.63, 329.63, 392, 523.25, 659.25].forEach((note, i) =>
          tone(note, 0.65, 0.13, 'triangle', note, i * 0.12),
        );
        [261.63, 392, 523.25].forEach((note) =>
          tone(note, 1.1, 0.065, 'sine', note, 0.65),
        );
        break;
      case 'lose':
        [196, 164.81, 130.81, 98].forEach((note, i) =>
          tone(note, 0.7, 0.13, 'triangle', note * 0.97, i * 0.2),
        );
        noise(0.9, 0.11, 370, 'lowpass');
        break;
      case 'click':
        tone(540, 0.045, 0.07, 'sine', 410);
        break;
      default:
        return false;
    }
    this._lastPlayed.set(name, now);
    return true;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._stopScene();
    for (const voice of [...this._voices]) this._stopVoice(voice, true);
    this._master?.disconnect();
    this._compressor?.disconnect();
    if (this.context && this.context.state !== 'closed')
      this.context.close().catch(() => {});
    this._noiseBuffer = null;
    this._lastPlayed.clear();
  }

  _canPlay() {
    return (
      !this._disposed &&
      !this.muted &&
      this.volume > 0 &&
      this.context?.state === 'running'
    );
  }

  _setMaster() {
    if (!this.context || !this._master || this.context.state === 'closed')
      return;
    const now = this.context!.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.025);
  }

  _makeNoise() {
    const buffer = this.context!.createBuffer(
      1,
      this.context!.sampleRate * 4,
      this.context!.sampleRate,
    );
    const data = buffer.getChannelData(0);
    // A little integrated noise softens the white-noise edge on cave air/rocks.
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.035) / 1.035;
      data[i] = white * 0.6 + brown * 1.8;
    }
    return buffer;
  }

  _track(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    nodes: AudioNode[],
    start: number,
    duration: number,
    layer: Layer,
  ) {
    if (this._voices.size >= MAX_VOICES) {
      const oldest =
        [...this._voices].find((voice) => voice.layer === 'effect') ||
        this._voices.values().next().value;
      if (oldest) this._stopVoice(oldest, true);
    }
    const voice = { source, gain, nodes: [source, gain, ...nodes], layer };
    this._voices.add(voice);
    source.onended = () => this._disconnectVoice(voice);
    source.start(start);
    if (Number.isFinite(duration)) source.stop(start + duration + 0.035);
    return voice;
  }

  _disconnectVoice(voice: Voice) {
    if (!this._voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  _stopVoice(voice: Voice, immediate = false) {
    if (!this._voices.has(voice)) return;
    const now = this.context!.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(EPSILON, now, 0.015);
      voice.source.stop(now + (immediate ? 0 : 0.07));
    } catch {
      /* An already-ended source still needs its connections removed. */
    }
    if (immediate) this._disconnectVoice(voice);
  }

  _envelope(
    gain: GainNode,
    start: number,
    duration: number,
    peak: number,
    layer: Layer,
  ) {
    gain.gain.setValueAtTime(EPSILON, start);
    if (Number.isFinite(duration)) {
      const attack = Math.min(layer === 'music' ? 0.012 : 0.006, duration / 4);
      gain.gain.linearRampToValueAtTime(
        Math.max(EPSILON, peak),
        start + attack,
      );
      gain.gain.exponentialRampToValueAtTime(EPSILON, start + duration);
    } else {
      gain.gain.linearRampToValueAtTime(peak, start + 1.7);
    }
    gain.connect(this._master!);
  }

  _tone({
    frequency,
    endFrequency = frequency,
    duration,
    gain,
    type = 'sine',
    start = this.context!.currentTime,
    layer = 'effect',
  }: ToneOptions) {
    const source = this.context!.createOscillator();
    const envelope = this.context!.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, start);
    if (frequency !== endFrequency)
      source.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFrequency),
        start + duration,
      );
    source.connect(envelope);
    this._envelope(envelope, start, duration, gain, layer);
    return this._track(source, envelope, [], start, duration, layer);
  }

  _noise({
    duration,
    gain,
    frequency,
    filter = 'bandpass',
    start = this.context!.currentTime,
    layer = 'effect',
  }: NoiseOptions) {
    const source = this.context!.createBufferSource();
    const tone = this.context!.createBiquadFilter();
    const envelope = this.context!.createGain();
    source.buffer = this._noiseBuffer;
    source.loop = !Number.isFinite(duration);
    tone.type = filter;
    tone.frequency.value = frequency;
    tone.Q.value = filter === 'bandpass' ? 0.8 : 0.5;
    source.connect(tone);
    tone.connect(envelope);
    this._envelope(envelope, start, duration, gain, layer);
    return this._track(source, envelope, [tone], start, duration, layer);
  }

  _startScene() {
    if (
      this._sceneStarted ||
      !this._canPlay() ||
      !ACTIVE_PHASES.has(this.phase)
    )
      return;
    this._sceneStarted = true;
    const start = this.context!.currentTime;
    const underground = this.phase === 'mining';
    this._noise({
      duration: Infinity,
      gain: underground ? 0.105 : 0.055,
      frequency: underground ? 175 : 320,
      filter: 'lowpass',
      start,
      layer: 'ambient',
    });
    this._noise({
      duration: Infinity,
      gain: underground ? 0.021 : 0.032,
      frequency: 1650,
      filter: 'bandpass',
      start,
      layer: 'ambient',
    });
    this._beat = 0;
    this._nextBeat = start + 0.3;
    this._timer = globalThis.setInterval(() => this._schedule(), 100);
  }

  _stopScene() {
    if (this._timer !== null) globalThis.clearInterval(this._timer);
    this._timer = null;
    this._sceneStarted = false;
    for (const voice of [...this._voices]) {
      if (voice.layer !== 'effect') this._stopVoice(voice);
    }
  }

  _schedule() {
    if (!this._canPlay()) return;
    const now = this.context!.currentTime;
    // Never catch up a long background-tab gap with a burst of scheduled notes.
    if (this._nextBeat < now - 0.25) this._nextBeat = now + 0.03;
    const wave = this.phase === 'wave';
    const interval = wave ? 0.34 : 0.8;
    while (this._nextBeat < now + 0.18) {
      const start = this._nextBeat;
      const beat = this._beat++;
      if (wave) {
        const sequence = [55, 55, 65.406, 55, 49, 49, 65.406, 73.416];
        this._tone({
          frequency: sequence[beat % sequence.length],
          duration: 0.23,
          gain: 0.11,
          type: 'triangle',
          start,
          layer: 'music',
        });
        if (beat % 2 === 0)
          this._tone({
            frequency: 86,
            endFrequency: 35,
            duration: 0.18,
            gain: 0.14,
            start,
            layer: 'music',
          });
        if (beat % 4 === 3)
          this._noise({
            duration: 0.055,
            gain: 0.045,
            frequency: 3200,
            filter: 'highpass',
            start,
            layer: 'music',
          });
      } else if (beat % 8 === 0) {
        const notes = [164.81, 146.83, 130.81, 196];
        const frequency = notes[Math.floor(beat / 8) % notes.length];
        this._tone({
          frequency,
          duration: 2.5,
          gain: this.phase === 'menu' ? 0.022 : 0.013,
          start,
          layer: 'music',
        });
        this._tone({
          frequency: frequency * 1.5,
          duration: 2.1,
          gain: 0.008,
          start: start + 0.07,
          layer: 'music',
        });
      }
      this._nextBeat += interval;
    }
  }
}
