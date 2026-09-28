import { groveOf } from '../curriculum';
import type { LessonExercise } from '../curriculum/lesson-flow';
import type { Trail } from '../curriculum/types';
import type { Keystroke } from './run';

/**
 * Pace note (PACE-01). Fast and accurate can still be old habits, and the app cannot see fingers (DEC-15), so a run typed
 * far above a relaxed pace earns a suggestion to slow down and check fingering. Never a gate, score or number (DEC-14).
 */

/** How far above the chapter's relaxed pace counts as "far": twice as fast. */
export const PACE_FACTOR = 2;
/** With an established pace (PACE-02) the note comes sooner: half again the relaxed pace. */
export const ESTABLISHED_FACTOR = 1.5;
/** A Roots press this quick (~60 WPM) is beyond a new learner: it is an existing typing habit. */
export const ESTABLISHED_MS = 200;
/** Runs of that evidence needed; one fast run is never enough. */
export const ESTABLISHED_RUNS = 3;

/** Saved pace evidence (PACE-02): fast Roots runs so far, and whether they establish an existing fast habit. Never shown. */
export interface PaceEvidence { fastEarly: number; established: boolean }
/** No pace evidence yet. */
export const freshPace = (): PaceEvidence => ({ fastEarly: 0, established: false });
/** Count a Roots run typed at an established pace; three of them set the flag, which then stays. */
export function notePace(ev: PaceEvidence, trail: Trail, strokes: readonly Keystroke[]): PaceEvidence {
  if (ev.established || trail.grove !== 'roots') return ev;
  const median = medianInterval(strokes);
  const fastEarly = ev.fastEarly + (median !== null && median < ESTABLISHED_MS ? 1 : 0);
  return { fastEarly, established: fastEarly >= ESTABLISHED_RUNS };
}
/** The note's factor for this learner. */
export const paceFactor = (ev: PaceEvidence): number => (ev.established ? ESTABLISHED_FACTOR : PACE_FACTOR);
/** The chapters where technique is being formed; Bark onward (capitals, symbols, Flow) never shows the note. */
const PACE_GROVES = new Set(['roots', 'home', 'canopy', 'undergrowth']);

/** Ms between consecutive correct presses inside a word, in order; retries, word boundaries and pauses (≥ 2 s) excluded. */
function wordIntervals(strokes: readonly Keystroke[]): number[] {
  return strokes.filter((s, i, all) => {
    const prev = all[i - 1];
    return s.correct && prev?.correct && prev.index === s.index - 1 && s.key !== ' ' && prev.key !== ' ' && s.latencyMs < 2000;
  }).map((s) => s.latencyMs);
}
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Median ms between consecutive correct presses inside a word; retries, word boundaries and pauses (≥ 2 s) excluded. */
export function medianInterval(strokes: readonly Keystroke[]): number | null {
  const lats = wordIntervals(strokes);
  return lats.length >= 6 ? median(lats) : null;
}

/** Pace bands, in words a minute (a word is five presses, as everywhere in the app). */
export const PACE_PERFECT_WPM = 25;
/** Over this, a yellow "Slow down" tag: a warning only. */
export const PACE_WARN_WPM = 36;
/** Over this, "Too fast!": the press is blocked (a miss) once the one-time modal has shown. */
export const PACE_BLOCK_WPM = 50;
/** The tempo we want, in presses a minute: the pace modal's key flashes at it. */
export const PACE_BPM = PACE_PERFECT_WPM * 5;
/** Ms per press at `wpm`. */
const msAt = (wpm: number): number => 12_000 / wpm;
/** Presses the live check looks back over: few enough to be instant, enough that one quick pair never trips it. */
export const LIVE_WINDOW = 4;
/** True when the last few presses (from `from` on; any key, right or wrong) typically came faster than `wpm`. */
export function tooFastNow(strokes: readonly Keystroke[], from = 0, wpm = PACE_BLOCK_WPM): boolean {
  const lats = strokes.slice(Math.max(1, from)).map((s) => s.latencyMs).filter((ms) => ms < 2000).slice(-LIVE_WINDOW);
  return lats.length >= LIVE_WINDOW && median(lats) < msAt(wpm);
}
/**
 * The warning for the press just made: 'fast' over PACE_BLOCK_WPM, 'warn' over PACE_WARN_WPM, else null.
 * The press itself must also be over the line, so slowing down clears the warning on the very next key.
 */
export function paceLevel(strokes: readonly Keystroke[], from = 0): 'fast' | 'warn' | null {
  const last = strokes.at(-1)?.latencyMs ?? Infinity;
  for (const [level, wpm] of [['fast', PACE_BLOCK_WPM], ['warn', PACE_WARN_WPM]] as const) {
    if (last < msAt(wpm) && tooFastNow(strokes, from, wpm)) return level;
  }
  return null;
}
/** Would a press arriving `gapMs` after the last one be over PACE_BLOCK_WPM? Then it is blocked. (Needs an earlier press.) */
export function blockedNext(strokes: readonly Keystroke[], from: number, gapMs: number): boolean {
  if (!strokes.length) return false;
  return paceLevel([...strokes, { key: '', typed: '', index: -1, correct: true, latencyMs: gapMs }], from) === 'fast';
}
/**
 * Was the word just finished (the last stroke is its correct Space) typed at PACE_PERFECT_WPM or slower?
 * Its presses after the first letter count, the Space included; the pause before the word does not.
 */
export function perfectWord(strokes: readonly Keystroke[]): boolean {
  const end = strokes.length - 1, space = strokes[end];
  if (!space?.correct || space.key !== ' ') return false;
  let start = end - 1;
  while (start >= 0 && !(strokes[start]!.correct && strokes[start]!.key === ' ')) start--;
  const lats = strokes.slice(start + 2, end + 1).map((s) => s.latencyMs);
  return lats.length >= 2 && median(lats) >= msAt(PACE_PERFECT_WPM);
}
/** Perfect words in a row that earn one "Perfect speed". */
export const PERFECT_EVERY = 3;

/** Ms per press at the chapter's relaxed pace (its wpmTarget; a word is five characters). */
export const relaxedIntervalMs = (trail: Trail): number => 12_000 / (trail.wpmTarget ?? groveOf(trail).wpmTarget);

/** The note belongs to technique exercises (drills, loops, words) in chapters 1–4, not to phrases, passages or checkpoints. */
export const paceNoteApplies = (trail: Trail, exercise: LessonExercise): boolean =>
  PACE_GROVES.has(trail.grove) && !trail.checkpoint && (exercise.format === 'movement' || exercise.format === 'words');

/** True when the run's typical press came faster than `factor` times the chapter's relaxed pace. */
export function typedFast(strokes: readonly Keystroke[], trail: Trail, factor = PACE_FACTOR): boolean {
  const median = medianInterval(strokes);
  return median !== null && median < relaxedIntervalMs(trail) / factor;
}

/** The pace modal's heading. */
export const PACE_TITLE = 'Slow down. This isn’t a race.';
/** The pace modal's message: about technique, with no number and no claim about the finger used. */
export const PACE_NOTE = "Going fast isn't the point. Here it actually works against what this app is for. We're slowly programming good muscle memory into your fingers, and that only happens slowly: one calm, correct press at a time, with each key on the finger shown.";
