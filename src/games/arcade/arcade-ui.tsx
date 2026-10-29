'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { writeStored } from './src/lib/core.ts';

const paths: Record<string, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  sound: 'm11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'm11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8V4Z',
  restart: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  shuffle:
    'M3 6h3c6 0 6 12 12 12h3m-5-4 5 4-5 4M3 18h3c2 0 4-2 6-6s4-6 6-6h3m-5-4 5 4-5 4',
};

export function ArcadeIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.arrow} />
    </svg>
  );
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('arcade-storage', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('arcade-storage', listener);
  };
}

export function useArcadeSetting(key: string, fallback: string) {
  const read = useCallback(() => {
    try {
      return localStorage.getItem(`little-break:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  return useSyncExternalStore(subscribe, read, () => fallback);
}

export function saveArcadeSetting(key: string, value: unknown) {
  writeStored(key, value);
  window.dispatchEvent(new Event('arcade-storage'));
}

export function useArcadeSound() {
  const enabled = useArcadeSetting('sound', 'true') !== 'false';
  const context = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    const close = () => {
      void context.current?.close().catch(() => {});
      context.current = null;
    };
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      close();
    };
  }, []);
  const sound = useCallback((kind = 'tap') => {
    if (!enabledRef.current || document.hidden) return;
    try {
      context.current ??= new AudioContext();
      const audio = context.current;
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
      const values: Record<string, [number, number]> = {
        tap: [400, 0.045],
        good: [620, 0.1],
        win: [830, 0.22],
        lose: [170, 0.16],
      };
      const [frequency, duration] = values[kind] ?? values.tap;
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * (kind === 'lose' ? 0.65 : 1.35),
        audio.currentTime + duration,
      );
      gain.gain.setValueAtTime(0.055, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      /* Sound is optional. */
    }
  }, []);
  const toggleSound = () => {
    enabledRef.current = !enabled;
    saveArcadeSetting('sound', !enabled);
    if (!enabled) sound();
  };
  return { enabled, sound, toggleSound };
}
