import { describe, expect, it } from 'vitest';
import { fresh, sanitize } from '../state/save';
import { applyRun, blockingStop, currentStage, currentTrail, exerciseIndex, groveOpen, openEverything, trailUnlocked } from './progress';
import { lessonExercises } from '../curriculum/lesson-flow';
import { mergeProgress } from '../state/progress-sync';
import { MAIN_TRAILS, TRAILS, trailById } from '../curriculum';
import { KeyModel } from './keymodel';
const T = 1_700_000_000_000;
const ANCHORS = lessonExercises(trailById('anchors'));
/** Guided steps always pass (DEC-11), so the first accuracy gate is the first assessed exercise. */
const FIRST_ASSESSED = ANCHORS.findIndex((e) => e.assessment !== 'guided');
const sample = (acc = 100) => ({ hits: 40, attempts: 40, maxCombo: 40, wpm: 8, acc, rhythm: 0.2, now: T });
describe('visible exercises: every pass means progress', () => {
  it('advances each named exercise exactly once, then opens the next lesson', () => {
    const s = fresh(), m = new KeyModel();
    const n = ANCHORS.length;
    for (let i = 0; i < n; i++) {
      expect(exerciseIndex(s)).toBe(i);
      const result = applyRun(s, m, sample(90));
      expect(result).toMatchObject({ passed: true, firstClear: i === n - 1, blockers: [], exercise: { index: i, total: n } });
      expect(s.lessonSteps.anchors).toBe(i + 1);
      expect(s.trail).toBe(i === n - 1 ? 'inner-pair' : 'anchors');
    }
  });
  it('fails only the current exercise and never repeats already-passed exercises', () => {
    const s = fresh(), m = new KeyModel();
    for (let i = 0; i < FIRST_ASSESSED; i++) applyRun(s, m, sample());
    expect(applyRun(s, m, sample(89))).toMatchObject({ passed: false, blockers: ['89% accuracy; 90% needed to continue'] });
    expect(exerciseIndex(s)).toBe(FIRST_ASSESSED);
    expect(applyRun(s, m, sample(90)).passed).toBe(true);
    expect(exerciseIndex(s)).toBe(FIRST_ASSESSED + 1);
  });
  it('cannot skip application based on high mastery or hold a pass because of low mastery', () => {
    const s = fresh(), m = new KeyModel(); s.trail = 'middle-up';
    for (const k of 'ei') for (let i = 0; i < 50; i++) m.record(k, true, 100, T);
    expect(currentStage(s, m)).toBe('drill');
    for (let i = 0; i < 2; i++) applyRun(s, m, sample());
    expect(currentStage(s, m)).toBe('words');
    for (const k of 'ei') for (let i = 0; i < 50; i++) m.record(k, false, null, T);
    expect(applyRun(s, m, { ...sample(95), wpm: 1, rhythm: 0 }).passed).toBe(true);
    expect(exerciseIndex(s)).toBe(3);
  });
  it('a checkpoint stays one cumulative passage at 97%, without speed or repeats', () => {
    const s = fresh(), m = new KeyModel(); s.trail = 'roots-checkpoint';
    expect(lessonExercises(currentTrail(s))).toHaveLength(1);
    expect(applyRun(s, m, sample(96)).passed).toBe(false);
    expect(groveOpen(s, 'home')).toBe(false);
    expect(applyRun(s, m, sample(97))).toMatchObject({ firstClear: true, advance: 'grove' });
    expect(groveOpen(s, 'home')).toBe(true);
  });
  it('a failed replay and absence never revoke earned clears', () => {
    const s = fresh(), m = new KeyModel();
    for (let i = 0; i < ANCHORS.length; i++) applyRun(s, m, sample());
    s.trail = 'anchors'; applyRun(s, m, { ...sample(20), now: T + 90 * 86400000 });
    expect(s.trails.anchors!.cleared).toBe(true);
  });
  it('reload and sync retain partial success without legacy auto-credit clearing the lesson', () => {
    const s = fresh(), m = new KeyModel(); applyRun(s, m, sample());
    const reloaded = sanitize(JSON.parse(JSON.stringify(s)));
    expect(reloaded.trail).toBe('anchors'); expect(reloaded.trails.anchors!.cleared).toBe(false);
    expect(exerciseIndex(reloaded)).toBe(1);
    applyRun(reloaded, m, sample());
    const merged = mergeProgress(s, reloaded);
    expect(merged.lessonSteps.anchors).toBe(2); expect(merged.trails.anchors!.cleared).toBe(false);
    expect(sanitize(merged)).toEqual(merged);
  });
});

describe('dev sandbox (?dev)', () => {
  it('opens every chapter, lesson and stop on a fresh save without marking anything done', () => {
    const s = fresh();
    expect(TRAILS.every((t) => trailUnlocked(s, t))).toBe(false);
    openEverything();
    try {
      expect(TRAILS.every((t) => groveOpen(s, t.grove) && trailUnlocked(s, t) && !blockingStop(s, t))).toBe(true);
      expect(MAIN_TRAILS.some((t) => s.trails[t.id]?.cleared)).toBe(false);
      s.trail = 'opposite-shift';
      expect(exerciseIndex(s)).toBe(0);
    } finally { openEverything(false); }
  });
});
