'use client';

import { GameRuntime } from '../../components/game-runtime';
import { DriftShell } from './shell';
import './client/ui.css';

const load = () => import('./client/main.ts');

export function DriftGame() {
  return (
    <GameRuntime load={load}>
      <DriftShell />
    </GameRuntime>
  );
}
