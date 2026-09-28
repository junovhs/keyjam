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

/** Median ms between consecutive correct presses inside a word; retries, word boundaries and pauses (≥ 2 s) excluded. */
export function medianInterval(strokes: readonly Keystroke[]): number | null {
  const lats = strokes.filter((s, i, all) => {
    const prev = all[i - 1];
    return s.correct && prev?.correct && prev.index === s.index - 1 && s.key !== ' ' && prev.key !== ' ' && s.latencyMs < 2000;
  }).map((s) => s.latencyMs).sort((a, b) => a - b);
  return lats.length >= 6 ? lats[Math.floor(lats.length / 2)]! : null;
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
