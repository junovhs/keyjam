import { accOf, wpmOf } from './scoring';

export type RunStatus = 'idle' | 'playing' | 'complete';
export type KeyOutcome = 'ok' | 'miss' | 'done' | 'ignored';
/** `key` is what the text wanted at `index`; `typed` is what was pressed. */
export interface Keystroke { key: string; typed: string; index: number; correct: boolean; latencyMs: number }

/** One attempt at a text. Pure: no DOM, no clock of its own (pass `now`). */
export class Run {
  pos = 0; status: RunStatus = 'idle';
  hits = 0; attempts = 0; errors = 0;
  /** Accuracy's own counts: keystrokes where the text wanted a letter, never a space (FIX-05). */
  scoredHits = 0; scoredAttempts = 0;
  combo = 0; maxCombo = 0; wrong = false;
  start = 0; end = 0; private lastKeyAt = 0;
  readonly strokes: Keystroke[] = [];
  constructor(public readonly text: string) {}

  get current(): string { return this.text[this.pos] ?? ''; }
  begin(now: number): void {
    if (this.status === 'playing') return;
    this.status = 'playing'; this.pos = this.hits = this.attempts = this.scoredHits = this.scoredAttempts = this.errors = this.combo = this.maxCombo = 0;
    this.wrong = false; this.start = now; this.lastKeyAt = now; this.strokes.length = 0;
  }
  /** Ms since the last press (or the run's start). */
  gap(now: number): number { return now - this.lastKeyAt; }
  /**
   * Every printable attempt counts, including a letter where a space was needed; accuracy skips the wanted spaces.
   * `rushed`: the press came too fast (PACE-01) and counts as a miss whatever key it was.
   */
  type(k: string, now: number, rushed = false): KeyOutcome {
    if (this.status !== 'playing' || k.length !== 1) return 'ignored';
    const want = this.current;
    const latencyMs = now - this.lastKeyAt; this.lastKeyAt = now;
    this.attempts++;
    const ok = !rushed && k === want;
    if (want !== ' ') { this.scoredAttempts++; if (ok) this.scoredHits++; }
    this.strokes.push({ key: want, typed: k, index: this.pos, correct: ok, latencyMs });
    if (ok) {
      this.hits++; this.pos++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.wrong = false;
      if (this.pos === this.text.length) { this.status = 'complete'; this.end = now; return 'done'; }
      return 'ok';
    }
    this.errors++; this.combo = 0; this.wrong = true; return 'miss';
  }
  elapsed(now: number): number { return this.start ? (this.end || now) - this.start : 0; }
  /**
   * 0..1 cadence of this run: ½·(1 − cv/0.6) + ½·(1 − spikeRate/0.3) within words, excluding retries, boundaries and interruptions,
   * a spike being a press > 1.8× the run's median interval. Slow and even scores as well as fast and even.
   */
  rhythm(): number {
    const lats = this.strokes.filter((s, i, all) => {
      const prev = all[i - 1];
      return s.correct && prev?.correct && prev.index === s.index - 1
        && s.key !== ' ' && prev.key !== ' ' && s.latencyMs > 0 && s.latencyMs < 2000;
    }).map((s) => s.latencyMs);
    if (lats.length < 4) return 0;
    const mean = lats.reduce((a, b) => a + b, 0) / lats.length;
    const sd = Math.sqrt(lats.reduce((a, l) => a + (l - mean) ** 2, 0) / lats.length);
    const sorted = [...lats].sort((a, b) => a - b); const median = sorted[Math.floor(sorted.length / 2)]!;
    const spikes = lats.filter((l) => l > 1.8 * median).length / lats.length;
    const cvScore = Math.max(0, Math.min(1, 1 - (sd / mean) / 0.6));
    const spikeScore = Math.max(0, Math.min(1, 1 - spikes / 0.3));
    return 0.5 * cvScore + 0.5 * spikeScore;
  }
  metrics(now: number): { wpm: number; acc: number; pct: number } {
    return { wpm: wpmOf(this.hits, this.elapsed(now)), acc: accOf(this.scoredHits, this.scoredAttempts), pct: Math.round((this.pos / this.text.length) * 100) };
  }
}
