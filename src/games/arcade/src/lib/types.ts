export interface Point {
  x: number;
  y: number;
}
export interface ArcadeStat {
  label: string;
  value: string | number;
}
export interface ArcadeResult {
  title?: string;
  message?: string;
  score: number;
  unit?: string;
}
export interface ArcadeApi {
  isPaused(): boolean;
  setStats(stats: ArcadeStat[]): void;
  setHint(message: string): void;
  sound(kind?: string): void;
  finish(result: ArcadeResult): void;
  save(key: string, value: unknown): boolean;
  load(key: string, fallback?: unknown): unknown;
  getBest(): number;
}
