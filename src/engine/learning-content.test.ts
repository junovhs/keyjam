import { afterEach, expect, it } from 'vitest';
import { MAIN_TRAILS, TRAILS, allowedChars, trailById } from '../curriculum';
import { lessonExercises } from '../curriculum/lesson-flow';
import { DEFAULT_METHOD_ID, METHODS, fingerOf, setMethod } from '../curriculum/method';
import { FINGER_PAIRS } from '../curriculum/finger-course';
import { PRACTICE_WORDS, readablePhrases } from '../curriculum/language';
import { generate } from './textgen';
import { fingerPages, fingerPractice, MIN_FINGER_HITS, PAGE_MAX_CHARS } from './finger-practice';
afterEach(() => setMethod(DEFAULT_METHOD_ID));

it('every planned exercise covers its assessed focus or explicitly guided keys, at a bounded length', () => {
  for (const method of METHODS) {
    setMethod(method.id);
    for (const trail of TRAILS) for (const exercise of lessonExercises(trail)) for (let seed = 0; seed < 10; seed++) {
      const text = generate(trail, exercise.stage, { exercise, seed });
      const allowed = allowedChars(trail);
      if (exercise.assessment === 'guided') for (const k of exercise.guidedKeys ?? '') allowed.add(k);
      expect([...text].every(k => allowed.has(k)), `${trail.id}/${exercise.name}: ${text}`).toBe(true);
      expect(text.length).toBeGreaterThanOrEqual(4);
      expect(text.length, `${trail.id}/${exercise.name}/${seed}: ${text}`).toBeLessThan(trail.length * 2 + 100);
      for (const k of exercise.assessment === 'guided' ? exercise.guidedKeys ?? '' : exercise.focusKeys ?? trail.newKeys) expect(text.toLowerCase(), `${trail.id}/${exercise.name}`).toContain(k.toLowerCase());
      expect(text).not.toContain('  ');
    }
  }
});
it('introduces Space deliberately after the short landmark exercises (the guided keyboard tour groups keys by row)', () => {
  const t = trailById('anchors'), exercises = lessonExercises(t);
  const space = exercises.findIndex(e => e.name === 'Meet [space]');
  expect(space).toBe(exercises.length - 1);
  for (const exercise of exercises.slice(0, space).filter(e => e.name !== 'Take a gentle keyboard tour')) {
    const text = generate(t, exercise.stage, { exercise, seed: 3 });
    expect(text).not.toContain(' '); expect(text.length).toBeLessThanOrEqual(30);
  }
  const last = exercises[space]!;
  const text = generate(t, last.stage, { exercise: last, seed: 3 });
  expect(text).toContain(' ');
  expect(text.split(' ').slice(0, -1).every(w => w.length === 6)).toBe(true);
});
it('guarantees real words with E/I and G/H and constrained phrases with G/H', () => {
  for (const id of ['middle-up', 'index-reach']) {
    const t = trailById(id), ex = lessonExercises(t)[2]!;
    const text = generate(t, ex.stage, { exercise: ex, seed: 2 });
    expect(text.split(' ').every(w => PRACTICE_WORDS.includes(w))).toBe(true);
    expect(text).not.toMatch(/\b(iii|diff|ref)\b/);
  }
  const t = trailById('index-reach'), ex = lessonExercises(t).at(-1)!;
  const text = generate(t, ex.stage, { exercise: ex, seed: 7 });
  expect(readablePhrases(allowedChars(t)).some(p => text.includes(p))).toBe(true);
});
it('hard paired levels stay inside what the learner knows, dense in the pair and without helper keys', () => {
  for (const method of METHODS) {
    setMethod(method.id);
    for (const pair of FINGER_PAIRS) {
      const own = (k: string) => pair.sides.some(id => fingerOf(k) === id);
      const jumps = fingerPractice(pair, 3, {}, { seed: 3 });
      expect([...jumps.text].every(k => k === ' ' || own(k))).toBe(true);
      const known = new Set('abcdefghijklmnopqrstuvwxyz');
      for (const level of [4, 5, 6]) {
        const p = fingerPractice(pair, level, {}, { known, seed: 3 });
        expect(p.helperKeys).toEqual([]);
        expect(p.text).toMatch(/^[a-z ]+$/);
        // Short (PAGE_MAX_CHARS) but dense: at least a third of all letters on this pair, and over a stop's pages
        // enough presses for each side to judge it (MIN_FINGER_HITS).
        expect(p.text.length).toBeLessThanOrEqual(PAGE_MAX_CHARS);
        expect([...p.text.replaceAll(' ', '')].filter(own).length * 3).toBeGreaterThanOrEqual(p.text.replaceAll(' ', '').length);
        const stop = fingerPages(pair, level, {}, { known, seed: 3 }).map(q => q.text).join(' ');
        for (const id of pair.sides) expect([...stop].filter(k => fingerOf(k) === id).length).toBeGreaterThanOrEqual(MIN_FINGER_HITS);
      }
      const gauntlet = fingerPages(pair, 9, {}, { seed: 2 }).map(q => q.text);
      for (const page of gauntlet) { expect(page.length).toBeLessThanOrEqual(PAGE_MAX_CHARS); expect(page).toMatch(/[A-Z]/); }
      for (const id of pair.sides) expect([...gauntlet.join(' ')].filter(k => fingerOf(k) === id).length).toBeGreaterThanOrEqual(MIN_FINGER_HITS);
    }
  }
});
it('paired movement practice avoids an exhaustive bigram dump and has no Space in its landmark run', () => {
  const pair = FINGER_PAIRS[0]!;
  expect(fingerPractice(pair, 0, {}).text).toMatch(/^[fj]+$/);
  for (const level of [1, 2]) {
    const text = fingerPractice(pair, level, {}).text;
    expect(text.length).toBeLessThan(140);
    expect(text.split(' ').filter(w => w.length <= 2).length).toBeLessThan(3);
  }
});
it('main path reserves a majority of planned exercises for language/application', () => {
  const exercises = MAIN_TRAILS.flatMap((t) => lessonExercises(t));
  const meaningful = exercises.filter(e => e.format !== 'movement');
  expect(meaningful.length).toBeGreaterThan(exercises.length / 2);
});
