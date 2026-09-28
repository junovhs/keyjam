import { afterEach, expect, it } from 'vitest';
import { FINGER_PAIRS, fingerCourseId, pairCompleted, FINGER_LEVEL_COUNT, fingerLevels } from '../curriculum/finger-course';
import { DEFAULT_METHOD_ID, METHODS, fingerOf, setMethod } from '../curriculum/method';
import { fingerById } from '../curriculum/fingers';
import { fresh, sanitize } from '../state/save';
import { mergeProgress } from '../state/progress-sync';
import { Run } from './run';
import { completeFingerPages, completeFingerPractice, fingerPages, fingerPractice, FINGER_PAGES, MIN_FINGER_HITS, PAGE_MAX_CHARS, type FingerPractice } from './finger-practice';

const index = FINGER_PAIRS[0]!;
afterEach(() => setMethod(DEFAULT_METHOD_ID));
function typePassage(text: string, misses: Record<string, number> = {}): Run {
  const run = new Run(text);
  let time = 1;
  run.begin(time);
  for (const key of text) {
    const id = fingerOf(key) ?? '';
    for (let i = 0; i < (misses[id] ?? 0); i++) run.type(key === 'j' ? 'f' : 'j', time += 200);
    delete misses[id];
    run.type(key, time += 200);
  }
  return run;
}

it('does not let high overall accuracy carry the weaker side, then targets only that side', () => {
  const progress: Record<string, number> = {};
  const practice = fingerPractice(index, 0, progress);
  const run = typePassage(practice.text, { li: 2 });
  expect(run.metrics(10000).acc).toBeGreaterThanOrEqual(95);
  expect(completeFingerPractice(progress, index, 0, practice, run)).toEqual({ passed: false, newlyPassed: ['ri'] });
  expect(pairCompleted(progress, index)).toBe(0);
  const retry = fingerPractice(index, 0, progress);
  expect(retry.sides).toEqual(['li']);
  expect([...retry.text].every(k => k === ' ' || fingerOf(k) === 'li')).toBe(true);
  expect(completeFingerPractice(progress, index, 0, retry, typePassage(retry.text)).passed).toBe(true);
  expect(pairCompleted(progress, index)).toBe(1);
  expect(fingerPractice(index, 1, progress).sides).toEqual(['li', 'ri']);
});

it('qualifies the left independently when the right misses, using wanted rather than typed keys', () => {
  const progress: Record<string, number> = {};
  const practice = fingerPractice(index, 0, progress);
  // Misses on J are typed F; they must be charged to the right, not the left.
  const result = completeFingerPractice(progress, index, 0, practice, typePassage(practice.text, { ri: 2 }));
  expect(result).toEqual({ passed: false, newlyPassed: ['li'] });
  expect(fingerPractice(index, 0, progress).sides).toEqual(['ri']);
});

it('requires sufficient evidence and an exact 95% ratio', () => {
  for (const [hits, misses, qualifies] of [[MIN_FINGER_HITS - 1, 0, false], [MIN_FINGER_HITS, 0, true], [38, 2, true], [35, 2, false]] as const) {
    const progress: Record<string, number> = {};
    const practice: FingerPractice = { text: 'f'.repeat(hits), sides: ['li'], helperKeys: [] };
    completeFingerPractice(progress, index, 0, practice, typePassage(practice.text, { li: misses }));
    expect(progress[fingerCourseId('li')] === 1).toBe(qualifies);
    expect(progress[fingerCourseId('ri')]).toBeUndefined();
  }
});

it('never credits an aborted run or a different passage; a clean later level credits the ones before it (FIX-03)', () => {
  const progress: Record<string, number> = {};
  const practice = fingerPractice(index, 0, progress);
  const aborted = new Run(practice.text); aborted.begin(1);
  for (const k of practice.text.slice(0, -1)) aborted.type(k, 100);
  expect(completeFingerPractice(progress, index, 0, practice, aborted).passed).toBe(false);
  expect(completeFingerPractice(progress, index, 0, practice, typePassage('f'.repeat(40))).passed).toBe(false);
  expect(progress).toEqual({});
  const skipped = fingerPractice(index, 3, progress);
  expect(completeFingerPractice(progress, index, 3, skipped, typePassage(skipped.text)).passed).toBe(true);
  expect(pairCompleted(progress, index)).toBe(4);
});

for (const method of METHODS) it(`all paired levels are passable with enough complete coverage under ${method.name}`, () => {
  setMethod(method.id);
  for (const pair of FINGER_PAIRS) {
    const progress: Record<string, number> = {};
    for (let level = 0; level < FINGER_LEVEL_COUNT; level++) {
      // Each page is short (PAGE_MAX_CHARS); the stop's pages together carry enough of each side, and the gauntlet every key.
      const pages = fingerPages(pair, level, progress);
      const all = pages.map(p => p.text).join(' ');
      for (const p of pages) expect(p.text.length).toBeLessThanOrEqual(PAGE_MAX_CHARS);
      for (const id of pair.sides) {
        expect([...all].filter(k => fingerOf(k) === id).length).toBeGreaterThanOrEqual(MIN_FINGER_HITS);
        if (level === 9) for (let n = 33; n <= 126; n++) {
          const key = String.fromCharCode(n);
          if (fingerOf(key) === id) expect(all).toContain(key);
        }
      }
      expect(completeFingerPages(progress, pair, level, pages, pages.map(p => typePassage(p.text))).passed).toBe(true);
      expect(pairCompleted(progress, pair)).toBe(level + 1);
    }
    const replay = fingerPractice(pair, 0, progress);
    expect(replay.sides).toEqual(pair.sides);
    completeFingerPractice(progress, pair, 0, replay, typePassage(replay.text, { [pair.sides[0]]: 50 }));
    expect(pairCompleted(progress, pair)).toBe(10); // Replay never takes away earned work.
  }
});

it('retains partial passes through reload and sync without making progress visible as separate courses', () => {
  const local = fresh(), remote = fresh();
  const practice = fingerPractice(index, 0, local.fingerCourses);
  completeFingerPractice(local.fingerCourses, index, 0, practice, typePassage(practice.text, { li: 2 }));
  const reloaded = sanitize(JSON.parse(JSON.stringify(local)));
  expect(pairCompleted(reloaded.fingerCourses, index)).toBe(0);
  expect(fingerPractice(index, 0, reloaded.fingerCourses).sides).toEqual(['li']);
  completeFingerPractice(remote.fingerCourses, index, 0, practice, typePassage(practice.text, { ri: 2 }));
  const merged = mergeProgress(reloaded, remote);
  expect(pairCompleted(merged.fingerCourses, index)).toBe(1);
  expect(merged.trail).toBe('anchors'); expect(merged.trails).toEqual({});
});

it('preserves older unequal side courses and only makes their shared levels available', () => {
  const save = sanitize({ fingerCourses: { [fingerCourseId('li')]: 10, [fingerCourseId('ri')]: 3 } });
  expect(pairCompleted(save.fingerCourses, index)).toBe(3);
  expect(fingerPractice(index, 3, save.fingerCourses).sides).toEqual(['ri']);
  expect(fingerPractice(index, 2, save.fingerCourses).sides).toEqual(['li', 'ri']);
});

it('gives every stop three pages with the same sides, and different text from level 2 up', () => {
  for (const pair of FINGER_PAIRS) for (let level = 0; level < FINGER_LEVEL_COUNT; level++) {
    const pages = fingerPages(pair, level, {}, { seed: 5 });
    expect(pages).toHaveLength(FINGER_PAGES);
    for (const p of pages) { expect(p.text.length).toBeGreaterThan(0); expect(p.sides).toEqual(pages[0]!.sides); }
    // Level 1 is the anchor keys alone, so its pages match by design.
    if (level > 0) expect(new Set(pages.map(p => p.text)).size, `${pair.id} level ${level + 1}`).toBe(FINGER_PAGES);
  }
});

it('judges a stop on all of its pages together, and only once every page is finished', () => {
  const pages = fingerPages(index, 1, {}, { seed: 1 });
  const runs = pages.map(p => typePassage(p.text));
  expect(completeFingerPages({}, index, 1, pages, runs.slice(0, 2)).passed).toBe(false);
  const unfinished = new Run(pages[2]!.text); unfinished.begin(0);
  expect(completeFingerPages({}, index, 1, pages, [runs[0]!, runs[1]!, unfinished]).passed).toBe(false);
  expect(completeFingerPages({}, index, 1, pages, [runs[1]!, runs[0]!, runs[2]!]).passed).toBe(false);
  const progress: Record<string, number> = {};
  expect(completeFingerPages(progress, index, 1, pages, runs)).toEqual({ passed: true, newlyPassed: ['li', 'ri'] });
  expect(pairCompleted(progress, index)).toBe(2);
});

it('lets a clean page make up for a slip on another, because the pages are scored together', () => {
  const pages = fingerPages(index, 0, {});
  // Two misses on the left in 12 presses fail one page alone; across three pages it is 36 of 38.
  const shaky = typePassage(pages[0]!.text, { li: 2 });
  expect(completeFingerPractice({}, index, 0, pages[0]!, shaky).newlyPassed).not.toContain('li');
  const progress: Record<string, number> = {};
  const result = completeFingerPages(progress, index, 0, pages, [shaky, typePassage(pages[1]!.text), typePassage(pages[2]!.text)]);
  expect(result.newlyPassed).toContain('li');
});
