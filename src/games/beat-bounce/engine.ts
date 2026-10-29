export interface Track {
  id: string;
  name: string;
  bpm: number;
  beats: number;
  subtitle: string;
  level: string;
  color: string;
}
export type NoteStatus = 'miss' | 'perfect' | 'good' | null;
export interface Note {
  time: number;
  beat: number;
  status: NoteStatus;
}
export interface Run {
  notes: Note[];
  score: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  missed: number;
  strays: number;
  done: boolean;
  duration: number;
}
export const TRACKS: Track[] = [
  {
    id: 'sunroom',
    name: 'Sunroom',
    bpm: 96,
    beats: 48,
    subtitle: 'An easy afternoon groove',
    level: '01 / Easy',
    color: '#d84b35',
  },
  {
    id: 'sidewalk',
    name: 'Sidewalk Shuffle',
    bpm: 112,
    beats: 64,
    subtitle: 'A little swing in your step',
    level: '02 / Medium',
    color: '#477c6a',
  },
  {
    id: 'afterhours',
    name: 'After Hours',
    bpm: 132,
    beats: 80,
    subtitle: 'Quick feet. Offbeat energy.',
    level: '03 / Hard',
    color: '#7c568e',
  },
];
export function chart(track: Track): Note[] {
  const notes: Note[] = [];
  for (let beat = 4; beat < track.beats; beat++) {
    if (beat % 8 === 7) continue;
    notes.push({ time: (beat * 60) / track.bpm, beat, status: null });
    if (track.id !== 'sunroom' && beat % 8 === 5)
      notes.push({
        time: ((beat + 0.5) * 60) / track.bpm,
        beat: beat + 0.5,
        status: null,
      });
    if (track.id === 'afterhours' && beat % 8 === 2)
      notes.push({
        time: ((beat + 0.5) * 60) / track.bpm,
        beat: beat + 0.5,
        status: null,
      });
  }
  return notes;
}
export function createRun(track: Track): Run {
  return {
    notes: chart(track),
    score: 0,
    combo: 0,
    bestCombo: 0,
    perfect: 0,
    good: 0,
    missed: 0,
    strays: 0,
    done: false,
    duration: (track.beats * 60) / track.bpm,
  };
}
export function expire(run: Run, time: number) {
  if (run.done) return;
  for (const note of run.notes)
    if (!note.status && time - note.time > 0.16) {
      note.status = 'miss';
      run.missed++;
      run.combo = 0;
    }
  run.done = time >= run.duration;
}
export function tap(run: Run, time: number) {
  if (run.done || time < 0) return null;
  expire(run, time);
  const note = run.notes
    .filter((n) => !n.status)
    .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
  if (!note || Math.abs(note.time - time) > 0.16) {
    run.combo = 0;
    run.strays++;
    run.score = Math.max(0, run.score - 25);
    return { label: 'Off beat', error: null };
  }
  const error = time - note.time;
  note.status = Math.abs(error) <= 0.065 ? 'perfect' : 'good';
  run[note.status]++;
  run.combo++;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  run.score +=
    (note.status === 'perfect' ? 100 : 60) +
    Math.min(50, Math.floor(run.combo / 5) * 10);
  return {
    label:
      note.status === 'perfect'
        ? 'Perfect!'
        : error < 0
          ? 'A little early'
          : 'A little late',
    error,
  };
}
export function accuracy(run: Run) {
  return Math.max(
    0,
    Math.round(((run.perfect + run.good * 0.6) / run.notes.length) * 100),
  );
}
export function grade(run: Run) {
  const a = accuracy(run);
  return a >= 95 ? 'S' : a >= 85 ? 'A' : a >= 70 ? 'B' : a >= 50 ? 'C' : 'D';
}
export function calibrationOffset(samples: number[]) {
  const sorted = samples
    .filter((x) => Number.isFinite(x) && Math.abs(x) <= 0.25)
    .sort((a, b) => a - b);
  return sorted.length
    ? Math.round(sorted[Math.floor(sorted.length / 2)] * 1000)
    : 0;
}
