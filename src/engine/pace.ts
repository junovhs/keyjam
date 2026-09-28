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

/** Above this many presses a minute a press is tagged "Too fast!" in red (and the one-time modal opens). */
export const PACE_FAST_BPM = 110;
/** Above this many a minute, a yellow "Slow down" tag: an early warning. Neither tag ever blocks or costs a press. */
export const PACE_WARN_BPM = 90;
/** Presses the live check looks back over: few enough to be instant, enough that one quick pair never trips it. */
export const LIVE_WINDOW = 4;
/** True when the last few presses (from `from` on; any key, right or wrong) typically came faster than `bpm`. */
export function tooFastNow(strokes: readonly Keystroke[], from = 0, bpm = PACE_FAST_BPM): boolean {
  const lats = strokes.slice(Math.max(1, from)).map((s) => s.latencyMs).filter((ms) => ms < 2000).slice(-LIVE_WINDOW);
  return lats.length >= LIVE_WINDOW && median(lats) < 60_000 / bpm;
}
/**
 * The warning for the press just made: 'fast' over PACE_FAST_BPM, 'warn' over PACE_WARN_BPM, else null.
 * The press itself must also be over the line, so slowing down clears the warning on the very next key.
 */
export function paceLevel(strokes: readonly Keystroke[], from = 0): 'fast' | 'warn' | null {
  const last = strokes.at(-1)?.latencyMs ?? Infinity;
  for (const [level, bpm] of [['fast', PACE_FAST_BPM], ['warn', PACE_WARN_BPM]] as const) {
    if (last < 60_000 / bpm && tooFastNow(strokes, from, bpm)) return level;
  }
  return null;
}

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

/** The pace modal's beat: the hero key flashes at this tempo, a calm pace to press along to. */
export const PACE_BPM = 78;
/** The pace modal's heading. */
export const PACE_TITLE = 'Slow down. This isn’t a race.';
/** The pace modal's message: about technique, with no number and no claim about the finger used. */
export const PACE_NOTE = "Going fast isn't the point. Here it actually works against what this app is for. We're slowly programming good muscle memory into your fingers, and that only happens slowly: one calm, correct press at a time, with each key on the finger shown.";
