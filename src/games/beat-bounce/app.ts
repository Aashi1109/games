type GameElements = {
  sound: HTMLButtonElement;
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  stage: HTMLCanvasElement;
  play: HTMLButtonElement;
  tap: HTMLButtonElement;
  calibrate: HTMLButtonElement;
  offset: HTMLInputElement;
};
import { createBeatRenderer } from './renderer.ts';
import {
  TRACKS,
  createRun,
  expire,
  tap,
  accuracy,
  grade,
  calibrationOffset,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const $ = <K extends string>(id: K) =>
      scope.byId<K extends keyof GameElements ? GameElements[K] : HTMLElement>(
        id,
      );
    const canvas = $('stage');
    const renderer = createBeatRenderer(canvas);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let selected = TRACKS[0],
      run = createRun(selected),
      mode = 'idle',
      previousMode = 'playing';
    let audio: AudioContext | null = null,
      master: GainNode | undefined,
      nodes: OscillatorNode[] = [],
      epoch = 0,
      fallbackEpoch = 0,
      pausedAt = 0,
      muted = false,
      busy = false;
    let offset = 0,
      best: Record<string, number> = {},
      flash = 0,
      feedbackAt = 0,
      calibration: number[] = [],
      calibratedBeats = new Set<number>();
    try {
      const n = Number(localStorage.getItem('beat-bounce-offset'));
      offset = Number.isFinite(n) ? Math.max(-250, Math.min(250, n)) : 0;
      const saved: unknown = JSON.parse(
        localStorage.getItem('beat-bounce-best') || '{}',
      );
      if (saved && typeof saved === 'object') {
        const values = saved as Record<string, unknown>;
        best = Object.fromEntries(
          TRACKS.map((track) => [track.id, Number(values[track.id])]),
        );
      }
    } catch {}
    best = Object.fromEntries(
      TRACKS.map((track) => {
        const value = Number(best[track.id]);
        return [
          track.id,
          Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0,
        ];
      }),
    );
    function save(key: string, value: unknown) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
    $('offset').value = String(offset);
    $('offset-value').textContent = `${offset} ms`;
    function showTracks() {
      $('tracks').replaceChildren(
        ...TRACKS.map((track) => {
          const button = document.createElement('button');
          button.className = 'track';
          button.setAttribute('aria-pressed', String(track === selected));
          button.style.setProperty('--record', track.color);
          button.innerHTML = `<span class="mini-record" aria-hidden="true"></span><span><small class="level">${track.level} · ${track.bpm} BPM</small><b>${track.name}</b><small>${track.subtitle}</small><small>Best: ${Number(best[track.id]) || 0}</small></span>`;
          button.disabled = ['playing', 'calibrating', 'paused'].includes(mode);
          scope.handler(button, 'onclick', () => {
            selected = track;
            run = createRun(track);
            mode = 'idle';
            $('track-title').textContent =
              `${track.level.slice(0, 2)} — ${track.name.toUpperCase()}`;
            $('tempo').innerHTML =
              `${track.bpm} BPM<br><small>FOUR BEATS TO GET READY</small>`;
            overlay(
              'Find your groove.',
              'Tap when a note reaches the line. Space works too.',
              `Play ${track.name}`,
            );
            showTracks();
            stats(0);
          });
          return button;
        }),
      );
    }
    function overlay(title: string, copy: string, button: string) {
      $('overlay').hidden = false;
      $('overlay-title').textContent = title;
      $('overlay-copy').textContent = copy;
      $('play').textContent = button;
    }
    function stopNotes() {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {}
      }
      nodes = [];
    }
    function voice(
      when: number,
      freq: number,
      duration = 0.12,
      type: OscillatorType = 'sine',
      volume = 0.1,
    ) {
      if (!audio || !master) return;
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(volume, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + duration + 0.02);
      nodes.push(osc);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
    function audibleTime() {
      if (!audio) return performance.now() / 1000 - fallbackEpoch;
      const ts = audio.getOutputTimestamp?.();
      let now = audio.currentTime;
      if (ts && (ts.contextTime ?? 0) > 0 && audio.state === 'running')
        now = Math.min(
          now,
          (ts.contextTime ?? 0) +
            (performance.now() - (ts.performanceTime ?? 0)) / 1000,
        );
      return now - epoch;
    }
    async function start(calibrate = false) {
      if (busy) return;
      busy = true;
      root.querySelector<HTMLDetailsElement>('.calibration')!.open = false;
      try {
        if (!audio) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            audio = new AC({ latencyHint: 'interactive' });
            master = audio.createGain();
            master.gain.value = muted ? 0 : 0.7;
            master.connect(audio.destination);
          }
        }
        if (audio) await audio.resume();
        if (scope.disposed) return;
        stopNotes();
        epoch = (audio?.currentTime || 0) + 0.3;
        fallbackEpoch = performance.now() / 1000 + 0.3;
        mode = calibrate ? 'calibrating' : 'playing';
        run = createRun(selected);
        calibration = [];
        calibratedBeats = new Set<number>();
        const bpm = calibrate ? 96 : selected.bpm,
          beatLength = 60 / bpm,
          length = calibrate ? 14 : selected.beats;
        for (let beat = 0; beat < length; beat++) {
          voice(
            epoch + beat * beatLength,
            beat % 4 === 0 ? 880 : 660,
            0.06,
            'sine',
            calibrate ? 0.3 : 0.16,
          );
          if (!calibrate && beat >= 4) {
            voice(
              epoch + beat * beatLength,
              beat % 4 === 0 ? 65 : 90,
              0.14,
              'sine',
              0.28,
            );
            if (beat % 2 === 0)
              voice(
                epoch + beat * beatLength,
                [130.81, 146.83, 164.81, 196][Math.floor(beat / 8) % 4],
                0.3,
                'triangle',
                0.1,
              );
          }
        }
        if (!calibrate) {
          const melody = [
            261.63, 329.63, 392, 440, 392, 329.63, 293.66, 329.63,
          ];
          for (const note of run.notes)
            voice(
              epoch + note.time,
              melody[Math.floor(note.beat) % 8] *
                (selected.id === 'afterhours' ? 2 : 1),
              0.16,
              'triangle',
              0.12,
            );
        }
        $('overlay').hidden = true;
        $('pause').disabled = false;
        $('pause').textContent = 'Pause';
        $('restart').disabled = false;
        $('tap').disabled = false;
        $('calibrate').disabled = true;
        $('offset').disabled = true;
        document.body.classList.add('running', 'session-active');
        showTracks();
        $('tap').focus();
        feedback(
          calibrate
            ? 'Listen to four clicks, then tap with the next eight.'
            : 'Four beats to get ready…',
        );
      } catch {
        mode = 'idle';
        overlay(
          'AUDIO COULD NOT START',
          'Try again, or turn sound off and play visually.',
          'Try again',
        );
        audio = null;
      } finally {
        busy = false;
      }
    }
    function feedback(label: string) {
      $('feedback').textContent = label;
      $('feedback').dataset.tone =
        label === 'Perfect!'
          ? 'perfect'
          : label.includes('early') || label.includes('late')
            ? 'good'
            : label === 'Off beat'
              ? 'miss'
              : '';
      feedbackAt = performance.now();
    }
    function action() {
      if (mode === 'calibrating') {
        const time = audibleTime(),
          beat = Math.round(time / (60 / 96));
        if (beat < 4 || beat > 11 || calibratedBeats.has(beat)) return;
        const error = time - (beat * 60) / 96;
        if (Math.abs(error) > 0.25) return;
        calibration.push(error);
        calibratedBeats.add(beat);
        flash = 1;
        feedback(`${calibration.length} / 8 timing taps`);
        if (calibration.length === 8) completeCalibration();
        return;
      }
      if (mode !== 'playing') return;
      const time = audibleTime() - offset / 1000;
      if (time < (4 * 60) / selected.bpm - 0.16) return;
      const result = tap(run, time);
      if (result) {
        feedback(result.label);
        flash = result.error === null ? 0.25 : 1;
      }
      stats(time);
    }
    function completeCalibration() {
      offset = calibrationOffset(calibration);
      $('offset').value = String(offset);
      $('offset-value').textContent = `${offset} ms`;
      save('beat-bounce-offset', offset);
      finishControls();
      overlay(
        'TIMING, TUNED.',
        `Saved ${offset} ms from ${calibration.length} taps. You can fine-tune the slider below.`,
        `Play ${selected.name}`,
      );
      mode = 'idle';
      showTracks();
    }
    function finishControls() {
      stopNotes();
      document.body.classList.remove('running');
      $('pause').disabled = true;
      $('tap').disabled = true;
      $('calibrate').disabled = false;
      $('offset').disabled = false;
    }
    async function pause() {
      if (!['playing', 'calibrating', 'paused'].includes(mode) || busy) return;
      busy = true;
      try {
        if (mode === 'paused') {
          if (audio) {
            await audio.resume();
            if (scope.disposed) return;
          } else {
            fallbackEpoch += performance.now() / 1000 - pausedAt;
          }
          mode = previousMode;
          $('overlay').hidden = true;
          $('pause').textContent = 'Pause';
          $('tap').disabled = false;
          document.body.classList.add('running');
          $('tap').focus();
        } else {
          previousMode = mode;
          pausedAt = performance.now() / 1000;
          if (audio) await audio.suspend();
          if (scope.disposed) return;
          mode = 'paused';
          $('pause').textContent = 'Resume';
          $('tap').disabled = true;
          document.body.classList.remove('running');
          overlay(
            'TAKE A BREATHER.',
            'Your rhythm is right where you left it.',
            'Resume',
          );
          $('play').focus();
        }
      } finally {
        busy = false;
      }
    }
    function stats(time: number) {
      $('score').textContent = String(run.score).padStart(5, '0');
      $('combo').textContent = `×${run.combo}`;
      $('progress').style.transform =
        `scaleX(${Math.max(0, Math.min(1, time / run.duration))})`;
      $('elapsed').textContent = `${format(time)} / ${format(run.duration)}`;
    }
    function format(time: number) {
      const s = Math.max(0, Math.floor(time));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function end() {
      mode = 'finished';
      finishControls();
      best[selected.id] = Math.max(Number(best[selected.id]) || 0, run.score);
      save('beat-bounce-best', best);
      overlay(
        `GRADE ${grade(run)} — ${accuracy(run)}% ACCURACY`,
        `${run.perfect} perfect · ${run.good} good · ${run.missed} missed · best combo ${run.bestCombo}. Score ${run.score}.`,
        'Spin it again',
      );
      showTracks();
      $('play').focus();
      feedback(
        run.missed === 0 && run.strays === 0
          ? 'Full combo. Beautiful.'
          : 'Every groove gets better with another go.',
      );
    }
    function render() {
      let time =
        mode === 'idle' || mode === 'finished'
          ? 1.2
          : mode === 'paused'
            ? pausedAt - fallbackEpoch
            : audibleTime();
      if (mode === 'paused' && audio) time = audio.currentTime - epoch;
      if (mode === 'playing') {
        expire(run, time - offset / 1000);
        stats(time);
        if (time < (4 * 60) / selected.bpm)
          feedback(
            time < 0
              ? 'Ready…'
              : `COUNT IN · ${Math.min(4, Math.floor(time / (60 / selected.bpm)) + 1)} / 4`,
          );
        if (run.done) end();
      }
      if (mode === 'calibrating' && time > (12 * 60) / 96) {
        finishControls();
        mode = 'idle';
        overlay(
          'LET’S TRY THAT AGAIN.',
          `Caught ${calibration.length} of 8 taps. Tap once with each click after the count-in.`,
          'Play track',
        );
        showTracks();
      }
      const notes =
        mode === 'calibrating'
          ? Array.from({ length: 8 }, (_, i) => ({
              time: ((i + 4) * 60) / 96,
              status: calibratedBeats.has(i + 4) ? ('perfect' as const) : null,
            }))
          : run.notes;
      renderer.draw({
        notes,
        time,
        track: mode === 'calibrating' ? { ...selected, bpm: 96 } : selected,
        flash,
        mode,
        reducedMotion: reducedMotion.matches,
      });
      if (mode !== 'paused') flash = Math.max(0, flash - 0.035);
      if (
        mode === 'playing' &&
        performance.now() - feedbackAt > 1700 &&
        time > (4 * 60) / selected.bpm
      )
        $('feedback').textContent = 'Stay in the groove.';
      scope.raf(render);
    }
    scope.handler($('play'), 'onclick', () =>
      mode === 'paused' ? pause() : start(),
    );
    scope.handler($('pause'), 'onclick', pause);
    scope.handler($('restart'), 'onclick', () =>
      start(
        mode === 'calibrating' ||
          (previousMode === 'calibrating' && mode === 'paused'),
      ),
    );
    scope.listen($('tap'), 'pointerdown', (e) => {
      e.preventDefault();
      $('tap').focus();
      action();
    });
    scope.listen($('tap'), 'click', (e) => {
      if (e.detail === 0) action();
    });
    scope.listen(canvas, 'pointerdown', action);
    scope.listen(document, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        pause();
      }
      if (
        e.code === 'Space' &&
        !e.repeat &&
        !['INPUT', 'SELECT', 'SUMMARY', 'BUTTON', 'A'].includes(
          e.target instanceof Element ? e.target.tagName : '',
        )
      ) {
        e.preventDefault();
        action();
      }
    });
    scope.listen($('tap'), 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) action();
      }
    });
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden && ['playing', 'calibrating'].includes(mode)) pause();
    });
    scope.handler($('calibrate'), 'onclick', () => start(true));
    scope.handler($('offset'), 'oninput', () => {
      offset = Number($('offset').value);
      $('offset-value').textContent = `${offset} ms`;
      save('beat-bounce-offset', offset);
    });
    scope.handler($('sound'), 'onclick', () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      $('sound').textContent = muted ? 'Sound off' : 'Sound on';
      $('sound').setAttribute('aria-pressed', String(!muted));
    });
    scope.listen(window, 'pagehide', (event) => {
      if (event.persisted) {
        if (['playing', 'calibrating'].includes(mode)) {
          previousMode = mode;
          mode = 'paused';
          pausedAt = performance.now() / 1000;
          $('pause').textContent = 'Resume';
          $('tap').disabled = true;
          document.body.classList.remove('running');
          overlay(
            'TAKE A BREATHER.',
            'Your rhythm is right where you left it.',
            'Resume',
          );
          audio?.suspend().catch(() => {});
        }
      } else {
        stopNotes();
        renderer.dispose();
        audio?.close().catch(() => {});
      }
    });
    showTracks();
    stats(0);
    render();
    scope.add(() => {
      stopNotes();
      renderer.dispose();
      audio?.close().catch(() => {});
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
