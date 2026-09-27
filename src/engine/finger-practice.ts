import { FINGER_TWISTERS } from '../curriculum/language';
import { VOCABULARY } from '../curriculum/headline';
import { rng, shuffle } from './rng';
import { fingerById } from '../curriculum/fingers';
import { baseKey, fingerOf, type FingerId } from '../curriculum/method';
import { fingerLevels, fingerCourseId, pairCompleted, FINGER_PASS_ACC, FINGER_PAGES, type FingerPair } from '../curriculum/finger-course';
export { FINGER_PAGES };
import type { Run } from './run';

/** Require enough correct target presses to distinguish familiarity from a few lucky hits. */
export const MIN_FINGER_HITS = 20;
/** Snapshot of the sides deliberately exercised by this passage; incidental word letters cannot earn a level. */
export interface FingerPractice { text: string; sides: readonly FingerId[]; helperKeys: string[] }

/** Alternate both sides' tokens, or concentrate on the unfinished side after a partial pass. */
export function fingerPractice(pair: FingerPair, level: number, progress: Readonly<Record<string, number>>, opts: { known?: ReadonlySet<string>; seed?: number; page?: number } = {}): FingerPractice {
  const pending = pair.sides.filter(id => (progress[fingerCourseId(id)] ?? 0) <= level);
  const sides: readonly FingerId[] = pending.length ? pending : pair.sides;
  const page = opts.page ?? 0;
  const r = rng(opts.seed === undefined ? undefined : opts.seed + page * 7919);
  // Without a course record (tests, tools) every printable key counts as known.
  const allowed = new Set<string>(opts.known ?? Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i).toLowerCase()));
  for (const id of pair.sides) for (const k of fingerById(id)!.keys) if (/[a-z;,./]/.test(k)) allowed.add(k);
  const helperKeys: string[] = [];

  if (level < 4) {
    // Each page is its own kind of drill (page 1 the level's reaches, page 2 new shapes, page 3 real words), not one pattern three times.
    const len = level === 3 ? 36 : 24, kind = page % FINGER_PAGES;
    const keysAt = (id: FingerId) => { const f = fingerById(id)!; return level === 0 ? [f.anchor] : [...new Set(fingerLevels(f)[level]!.text.replaceAll(' ', ''))]; };
    const count = (w: string, id: FingerId) => [...w].filter(k => fingerOf(k) === id).length;
    if (kind === 2) {
      const vocab = [...new Set([...FINGER_TWISTERS[pair.id].words, ...VOCABULARY])].filter(w => w.length >= 3 && /^[a-z]+$/.test(w) && [...w].every(k => allowed.has(k)));
      const pools = sides.map(id => {
        const ks = keysAt(id).filter(k => /[a-z]/.test(k));
        return shuffle(vocab.filter(w => ks.some(k => w.includes(k))).sort((a, b) => count(b, id) / b.length - count(a, id) / a.length).slice(0, 24), r);
      });
      if (pools.every(p => p.length >= 4)) {
        const words: string[] = [], have = sides.map(() => 0);
        for (let i = 0; have.some(h => h < len) && i < 400; i++) {
          const side = i % sides.length;
          if (have[side]! >= len) continue;
          const pool = pools[side]!, w = pool[Math.floor(i / sides.length) % pool.length]!;
          words.push(w); sides.forEach((id, j) => { have[j] = have[j]! + count(w, id); });
        }
        return { text: words.join(' '), sides, helperKeys };
      }
    }
    if (kind >= 1) {
      const shapes = ['akak', 'kaka', 'aakk', 'kkaa', 'kaak', 'akka'];
      const shape = (sh: string, a: string, k: string) => [...sh].map(c => (c === 'a' ? a : k)).join('');
      const tokens: string[] = [];
      if (level === 0 && sides.length === 2) {
        // Landmarks only: trade the two home keys between hands in changing shapes.
        const [a, b] = sides.map(id => fingerById(id)!.anchor) as [string, string];
        while (tokens.length * 2 < len) tokens.push(shape(shapes[Math.floor(r() * 5)]!, a, b));
        return { text: tokens.join(' '), sides, helperKeys };
      }
      if (level > 0) {
        const per = sides.map(id => {
          const a = fingerById(id)!.anchor, ks = keysAt(id).filter(k => k !== a), out: string[] = [];
          while (out.length * 4 < len) out.push(shape(shapes[Math.floor(r() * 5)]!, a, ks[Math.floor(r() * ks.length)] ?? a));
          return out;
        });
        for (let i = 0; i < Math.max(...per.map(p => p.length)); i++) for (const p of per) if (p[i]) tokens.push(p[i]!);
        return { text: tokens.join(' '), sides, helperKeys };
      }
    }
    const passages = sides.map(id => {
      const f = fingerById(id)!;
      if (level === 0) return f.anchor.repeat(len).match(/.{1,6}/g)!;
      let text = fingerLevels(f)[level]!.text.replaceAll(' ', '');
      // A retried page deals the level's own four-key reaches in a fresh order, starting `page` keys into the cycle.
      if (page > 0) {
        const reaches = [...new Set(fingerLevels(f)[level]!.text.split(' '))];
        text = '';
        while (text.length < len + page) text += shuffle(reaches, r).join('');
      }
      return text.slice(page, page + len).match(/.{1,6}/g)!;
    });
    const blocks: string[] = [];
    for (let i = 0; i < Math.max(...passages.map(p => p.length)); i++) for (const p of passages) if (p[i]) blocks.push(p[i]!);
    return { text: blocks.join(level === 0 ? '' : ' '), sides, helperKeys };
  }

  // Levels 4–10 are hard on purpose: words dense in these fingers, same-finger runs, twisters, then capitals, numbers and symbols.
  const twisters = FINGER_TWISTERS[pair.id];
  const fits = (w: string) => [...w].every(k => allowed.has(k.toLowerCase()));
  const own = (k: string) => sides.includes(fingerOf(k)!);
  const density = (w: string) => [...w].filter(own).length / w.length;
  const runs = (w: string) => [...w].filter((k, i) => i > 0 && k !== w[i - 1] && own(k) && fingerOf(k) === fingerOf(w[i - 1]!)).length;
  const vocab = [...new Set([...twisters.words, ...VOCABULARY])].filter(w => w.length >= 3 && /^[a-z]+$/.test(w) && fits(w));
  const dense = vocab.filter(w => density(w) >= 0.5).sort((a, b) => density(b) - density(a)).slice(0, 40);
  const withRuns = vocab.filter(w => runs(w) > 0 && density(w) >= 0.4).sort((a, b) => runs(b) - runs(a) || density(b) - density(a)).slice(0, 40);
  const pool = shuffle(level === 5 && withRuns.length >= 6 ? withRuns : dense.length >= 6 ? dense : vocab.filter(w => density(w) > 0), r);
  const owned = sides.flatMap(id => [...fingerById(id)!.keys]);
  const digits = owned.filter(k => /[0-9]/.test(k));
  const symbols = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).filter(k => !/[a-zA-Z0-9 ]/.test(k) && own(k) && (!opts.known || opts.known.has(k)));
  const lines = twisters.lines.filter(l => [...l].every(k => k === ' ' || allowed.has(k.toLowerCase())));
  const lower = twisters.lines.map(l => l.toLowerCase().replace(/[^a-z ]/g, '')).filter(l => [...l].every(k => k === ' ' || allowed.has(k)));
  const target = level === 9 ? 50 : level === 6 ? 36 : 30;
  const count = (text: string, id: FingerId) => [...text].filter(k => fingerOf(k) === id).length;
  const done = (tokens: string[]) => sides.every(id => count(tokens.join(' '), id) >= target);
  const cap = (w: string, i: number) => i % 2 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1);
  const tokens: string[] = [];
  if (level === 6) tokens.push(...shuffle(lower, r).slice(0, 2));
  if (level === 9) tokens.push(...shuffle(lines, r).slice(0, 2));
  // The gauntlet touches every key these fingers own: each letter in CAPITALS, every digit, every symbol the learner has met.
  if (level === 9) for (const k of owned.filter(k => /[a-z]/.test(k))) { const w = vocab.find(w => w.includes(k)) ?? k; tokens.push(w, w.toUpperCase()); }
  if (level === 9) tokens.push(digits.join(''), ...symbols.map(k => k + baseKey(k)));
  for (let i = 0; !done(tokens) && i < 200; i++) {
    const deficit = sides.find(id => count(tokens.join(' '), id) < target) ?? sides[0]!;
    const choices = pool.filter(w => [...w].some(k => fingerOf(k) === deficit));
    const word = (choices.length ? choices : pool)[i % Math.max(1, (choices.length ? choices : pool).length)] ?? owned[0]!;
    const sym = symbols.length ? symbols[i % symbols.length]! : '';
    const num = digits.length ? shuffle(digits, r).join('').slice(0, 3) : '';
    if (level === 7) tokens.push(cap(word, i));
    else if (level === 8) tokens.push(word, num + sym, ...(sym ? [sym + word] : []));
    else if (level === 9) tokens.push(i % 4 === 0 ? cap(word, 0) : word, ...(i % 3 === 0 && num ? [num] : []), ...(i % 2 === 0 && sym ? [sym] : []), ...(i % 5 === 4 && allowed.has('.') ? ['.'] : []));
    else tokens.push(word);
  }
  let text = tokens.filter(Boolean).join(' ').replace(/ \./g, '.');
  if (level === 9 && !/[.]$/.test(text) && allowed.has('.')) text += '.';
  return { text, sides, helperKeys };
}

/** A stop's pages: the same sides and rules, different text on each (FINGER_PAGES of them). */
export function fingerPages(pair: FingerPair, level: number, progress: Readonly<Record<string, number>>, opts: { known?: ReadonlySet<string>; seed?: number } = {}): FingerPractice[] {
  const pages: FingerPractice[] = [];
  for (let page = 0; page < FINGER_PAGES; page++) {
    // A reshuffle can repeat an earlier page when a level has only a couple of reaches; deal again (a bounded few times).
    let p = fingerPractice(pair, level, progress, { ...opts, page });
    for (let retry = 1; retry < 12 && pages.some(q => q.text === p.text); retry++) {
      p = fingerPractice(pair, level, progress, { ...opts, seed: opts.seed === undefined ? undefined : opts.seed + retry * 104729, page });
    }
    pages.push(p);
  }
  return pages;
}

type PageRun = Pick<Run, 'status' | 'text' | 'strokes'>;

/** Record per-side passes from a completed passage, never from its aggregate accuracy or the mistyped key's owner. */
export function completeFingerPractice(
  progress: Record<string, number>, pair: FingerPair, level: number,
  practice: FingerPractice, run: PageRun,
): { passed: boolean; newlyPassed: FingerId[] } {
  return completeFingerPages(progress, pair, level, [practice], [run]);
}

/** Judge a whole stop: every page must be finished, and each side is scored on its strokes across all of them. */
export function completeFingerPages(
  progress: Record<string, number>, pair: FingerPair, level: number,
  pages: readonly FingerPractice[], runs: readonly PageRun[],
): { passed: boolean; newlyPassed: FingerId[] } {
  const newlyPassed: FingerId[] = [];
  if (!pages.length || runs.length !== pages.length || runs.some((run, i) => run.status !== 'complete' || run.text !== pages[i]!.text)) return { passed: false, newlyPassed };
  const all = runs.flatMap(run => run.strokes);
  for (const id of pages[0]!.sides) {
    if (!pair.sides.includes(id as Exclude<FingerId, 'thumb'>)) continue;
    const strokes = all.filter(s => fingerOf(s.key) === id);
    const hits = strokes.filter(s => s.correct).length;
    const key = fingerCourseId(id);
    // Exact ratio: 94.6% must not pass because the display rounds it to 95%.
    // Passing a level also credits any earlier ones this side never ran: a required stop reached past skipped levels
    // (a save that predates the stops, DEC-20) must still be passable (FIX-03). Earned records never go down.
    if (hits >= MIN_FINGER_HITS && hits * 100 >= strokes.length * FINGER_PASS_ACC && (progress[key] ?? 0) <= level) {
      progress[key] = level + 1;
      newlyPassed.push(id);
    }
  }
  return { passed: pairCompleted(progress, pair) > level, newlyPassed };
}

export interface SideScore { id: FingerId; hits: number; attempts: number; acc: number; passed: boolean }
/** One page's score for each side it exercised, counted on that side's own keys only. */
export function sideScores(pair: FingerPair, practice: FingerPractice, run: PageRun): SideScore[] {
  return practice.sides.filter(id => pair.sides.includes(id as Exclude<FingerId, 'thumb'>)).map(id => {
    const strokes = run.strokes.filter(s => fingerOf(s.key) === id), hits = strokes.filter(s => s.correct).length;
    // Exact ratio: 94.6% must not pass because the display rounds it to 95%.
    return { id, hits, attempts: strokes.length, acc: strokes.length ? Math.floor((hits / strokes.length) * 100) : 100, passed: hits >= MIN_PAGE_HITS && hits * 100 >= strokes.length * FINGER_PASS_ACC };
  });
}
/** Correct presses a side needs on one page. */
export const MIN_PAGE_HITS = 12;
/**
 * Judge one page of a stop on its own. A page passes when every side it exercised reaches the target; a passed page is
 * saved in `pages`, and the last one credits the level to both sides. Earned records never go down.
 */
export function completeFingerPage(
  progress: Record<string, number>, pages: Record<string, number>, stopId: string, pair: FingerPair, level: number,
  page: number, practice: FingerPractice, run: PageRun,
): { pagePassed: boolean; stopPassed: boolean; scores: SideScore[] } {
  const scores = sideScores(pair, practice, run);
  const pagePassed = run.status === 'complete' && run.text === practice.text && scores.length > 0 && scores.every(s => s.passed);
  if (pagePassed && pairCompleted(progress, pair) <= level) {
    pages[stopId] = Math.max(pages[stopId] ?? 0, page + 1);
    if (pages[stopId]! >= FINGER_PAGES) {
      for (const id of pair.sides) if ((progress[fingerCourseId(id)] ?? 0) <= level) progress[fingerCourseId(id)] = level + 1;
      delete pages[stopId];
    }
  }
  return { pagePassed, stopPassed: pairCompleted(progress, pair) > level, scores };
}
