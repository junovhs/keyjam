import { lessonExercises } from '../curriculum/lesson-flow';
import { expect, it } from 'vitest';
import { MAIN_TRAILS, gateFor, trailsInGrove } from '../curriculum';
import { METHODS, setMethod, DEFAULT_METHOD_ID } from '../curriculum/method';
import { fresh } from '../state/save';
import { STOPS } from '../curriculum/stops';
import { KeyModel } from './keymodel';
import { applyRun, currentStage, exerciseIndex, pendingStop, trailUnlocked } from './progress';
import { completeFingerPage, fingerPractice, FINGER_PAGES } from './finger-practice';
import { generate } from './textgen';
import { Run } from './run';
import { recordPerformance } from './learning';
import { TransitionModel } from './transitions';

for (const method of METHODS) it(`${method.name}: the complete course and optional branch can be learned slowly, with recoverable mistakes`, () => {
  setMethod(method.id);
  try {
    const state = fresh(), model = new KeyModel(), transitions = new TransitionModel();
    let now = 1_700_000_000_000, total = 0, stops = 0;
    const path = [...MAIN_TRAILS, ...trailsInGrove('code')];
    for (const trail of path) {
      if (trail.id === 'braces') { state.settings.codeGrove = true; state.trail = trail.id; }
      expect(state.trail).toBe(trail.id);
      // DEC-20: finger stops woven before this lesson hold it until both hands pass them.
      for (let stop = pendingStop(state); stop; stop = pendingStop(state)) {
        expect(trailUnlocked(state, trail)).toBe(false);
        const known = new Set(MAIN_TRAILS.filter(t => state.trails[t.id]?.cleared).flatMap(t => [...t.newKeys]));
        // As in the app: each short page is judged on its own, and the last one passes the stop.
        for (let page = 0; page < FINGER_PAGES; page++) {
          const practice = fingerPractice(stop.pair, stop.level, state.fingerCourses, { known, seed: stops, page });
          const run = new Run(practice.text); run.begin(now);
          for (const ch of practice.text) { now += 900; run.type(ch, now); }
          const judged = completeFingerPage(state.fingerCourses, state.stopPages, stop.id, stop.pair, stop.level, page, practice, run);
          expect(judged.pagePassed, `${stop.id} page ${page + 1}`).toBe(true);
          if (page === FINGER_PAGES - 1) expect(judged.stopPassed, stop.id).toBe(true);
        }
        stops++;
      }
      expect(trailUnlocked(state, trail)).toBe(true);
      let runs = 0;
      while (!state.trails[trail.id]?.cleared && runs < lessonExercises(trail).length + 1) {
        const stage = currentStage(state, model, now);
        const exercise = lessonExercises(trail)[exerciseIndex(state)]!;
        const guided = exercise.assessment === 'guided';
        const text = generate(trail, stage, { seed: ++runs, heat: model.heatMap(now), exercise });
        const before = JSON.stringify({ keys: model.toJSON(), transitions: transitions.toJSON(), stats: state.stats });
        const run = new Run(text); run.begin(now);
        if (runs === 1 && trail.n % 3 === 0) {
          now += 1200; const miss = text[0] === 'f' ? 'j' : 'f'; run.type(miss, now); recordPerformance(run, model, transitions, now, guided ? text.length : 0);
        }
        for (const ch of text) { now += ch === ' ' ? 1900 : 1200; run.type(ch, now); recordPerformance(run, model, transitions, now, guided ? text.length : 0); }
        const metrics = run.metrics(now);
        const outcome = applyRun(state, model, { hits: run.hits, attempts: run.attempts, maxCombo: run.maxCombo, wpm: metrics.wpm, acc: metrics.acc, rhythm: run.rhythm(), now, stage });
        const passed = guided || metrics.acc >= (trail.checkpoint ? 97 : gateFor(trail).passAcc);
        expect(outcome.passed, `${trail.id}: passing must immediately advance an exercise`).toBe(passed);
        if (passed) expect(state.lessonSteps[trail.id]).toBe(runs);
        if (guided) expect(JSON.stringify({ keys: model.toJSON(), transitions: transitions.toJSON(), stats: state.stats })).toBe(before);
        else model.endRun();
        total++;
      }
      expect(state.trails[trail.id]?.cleared, `${trail.id} stalled after ${runs} runs`).toBe(true);
    }
    expect(stops).toBe(STOPS.length);
    expect(total).toBeGreaterThanOrEqual(40);
    expect(total).toBeLessThanOrEqual(160);
    expect(Object.values(state.trails).filter(p => p.cleared)).toHaveLength(40);
  } finally { setMethod(DEFAULT_METHOD_ID); }
});
