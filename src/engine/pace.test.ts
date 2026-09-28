import { describe, expect, it } from 'vitest';
import { trailById } from '../curriculum';
import { lessonExercises } from '../curriculum/lesson-flow';
import { fresh, sanitize } from '../state/save';
import { mergeProgress } from '../state/progress-sync';
import { KeyModel } from './keymodel';
import { LIVE_WINDOW, PACE_NOTE, freshPace, tooFastNow, medianInterval, notePace, paceFactor, paceNoteApplies, relaxedIntervalMs, typedFast } from './pace';
import { applyRun } from './progress';
import { Run } from './run';

/** Type `text` perfectly with `ms` between presses. */
function typed(text: string, ms: number): Run {
  const run = new Run(text); let now = 1_000; run.begin(now);
  for (const c of text) { now += ms; run.type(c, now); }
  return run;
}
const middleUp = trailById('middle-up');

describe('pace note (PACE-01)', () => {
  it('fires well under the relaxed pace and not at a relaxed pace', () => {
    const text = 'ed de ded ed de ded fed feed';
    expect(relaxedIntervalMs(middleUp)).toBe(800); // Roots: 15 WPM
    expect(typedFast(typed(text, 60).strokes, middleUp)).toBe(true);
    expect(typedFast(typed(text, 500).strokes, middleUp)).toBe(false);
    expect(typedFast(typed(text, 390).strokes, middleUp)).toBe(true);
  });
  it('ignores boundaries, retries and pauses, and needs enough presses', () => {
    expect(medianInterval(typed('ed', 50).strokes)).toBeNull();
    const run = new Run('dede dede dede'); let now = 0; run.begin(now);
    for (const c of 'dede dede dede') { now += c === ' ' ? 5_000 : 100; run.type(c, now); }
    expect(medianInterval(run.strokes)).toBe(100);
  });
  it('applies to drills, loops and words in chapters 1–4 only', () => {
    const [find, loop, words, , phrase] = lessonExercises(trailById('ring-pair'));
    for (const e of [find!, loop!, words!]) expect(paceNoteApplies(trailById('ring-pair'), e), e.name).toBe(true);
    expect(paceNoteApplies(trailById('ring-pair'), phrase ?? lessonExercises(trailById('ring-pair')).at(-1)!)).toBe(false);
    expect(paceNoteApplies(trailById('roots-checkpoint'), lessonExercises(trailById('roots-checkpoint'))[0]!)).toBe(false);
    expect(paceNoteApplies(trailById('sentences'), lessonExercises(trailById('sentences'))[0]!)).toBe(false);
    expect(paceNoteApplies(trailById('common-words'), lessonExercises(trailById('common-words'))[0]!)).toBe(false);
  });
  it('never changes passing, stars or XP', () => {
    const text = 'ed de ded ed de ded fed feed';
    const outcomes = [60, 500].map((ms) => {
      const run = typed(text, ms), s = fresh();
      s.trail = 'middle-up';
      const m = run.metrics(run.end);
      const o = applyRun(s, new KeyModel(), { hits: run.hits, attempts: run.attempts, maxCombo: run.maxCombo, wpm: m.wpm, acc: m.acc, rhythm: run.rhythm(), now: run.end });
      return { passed: o.passed, stars: o.stars, xp: o.xp, cleared: s.lessonSteps['middle-up'] };
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
  });
  it('says nothing numeric and claims nothing about the finger used', () => {
    expect(PACE_NOTE).not.toMatch(/\d|wpm/i);
    expect(PACE_NOTE).not.toMatch(/you used|wrong finger/i);
  });
});

describe('live speed limit (PACE-01)', () => {
  it('trips within a few presses above 100 BPM, never at or below it', () => {
    expect(tooFastNow(typed('dededede', 500).strokes)).toBe(true);
    expect(tooFastNow(typed('dededede', 600).strokes)).toBe(false);
    expect(tooFastNow(typed('dededede', 900).strokes)).toBe(false);
    expect(tooFastNow(typed('ded', 100).strokes)).toBe(false);
  });
  it('counts only presses after `from`, so a closed modal needs a fresh window', () => {
    const run = typed('dededededede', 200);
    expect(tooFastNow(run.strokes, run.strokes.length)).toBe(false);
    expect(tooFastNow(run.strokes, run.strokes.length - LIVE_WINDOW)).toBe(true);
  });
});

describe('established pace (PACE-02)', () => {
  const quick = typed('ffjjfjfj ffjjfjfj', 60).strokes, steady = typed('ffjjfjfj ffjjfjfj', 450).strokes;
  const anchors = trailById('anchors');
  it('sets only from repeated fast Roots runs, never from a single run', () => {
    let ev = freshPace();
    ev = notePace(ev, anchors, quick); expect(ev).toEqual({ fastEarly: 1, established: false });
    ev = notePace(ev, anchors, steady); expect(ev.established).toBe(false);
    ev = notePace(ev, anchors, quick); expect(ev.established).toBe(false);
    ev = notePace(ev, anchors, quick); expect(ev).toEqual({ fastEarly: 3, established: true });
    // Outside Roots, fast runs are not early evidence.
    let later = freshPace();
    for (let i = 0; i < 5; i++) later = notePace(later, trailById('ring-pair'), quick);
    expect(later.established).toBe(false);
  });
  it('lowers the threshold once established', () => {
    expect(paceFactor({ fastEarly: 3, established: true })).toBeLessThan(paceFactor(freshPace()));
    const moderate = typed('ed de ded ed de ded fed feed', 450).strokes;
    expect(typedFast(moderate, middleUp, paceFactor(freshPace()))).toBe(false);
    expect(typedFast(moderate, middleUp, paceFactor({ fastEarly: 3, established: true }))).toBe(true);
  });
  it('defaults to false in older saves, round-trips, and merges across devices', () => {
    const legacy = sanitize({ trail: 'anchors', stats: {} });
    expect(legacy.pace).toEqual({ fastEarly: 0, established: false });
    const s = fresh(); s.pace = { fastEarly: 3, established: true };
    expect(sanitize(JSON.parse(JSON.stringify(s))).pace).toEqual({ fastEarly: 3, established: true });
    expect(sanitize({ pace: { fastEarly: -4, established: 'yes' } }).pace).toEqual({ fastEarly: 0, established: false });
    const a = fresh(), b = fresh(); b.pace = { fastEarly: 3, established: true };
    expect(mergeProgress(a, b).pace.established).toBe(true);
  });
});
