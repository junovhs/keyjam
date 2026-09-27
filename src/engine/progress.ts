import { lessonExercises } from '../curriculum/lesson-flow';
import { GROVES, MAIN_TRAILS, checkpointOf, cumulativeKeys, gateFor, groveOf, nextTrail, trailById, trailsInGrove, type Trail, type StageName } from '../curriculum';
import { freshProgress, type SaveV6, type TrailProgress } from '../state/save';
import { KeyModel } from './keymodel';
import { STOPS, type Stop } from '../curriculum/stops';
import { pairCompleted } from '../curriculum/finger-course';
import { bumpStreak, starsFor, swiftBonus, xpFor, type Stars } from './scoring';

export const STAGE_NAMES: readonly StageName[] = ['drill', 'mix', 'words'];
export const progressOf = (s: SaveV6, id: string): TrailProgress => s.trails[id] ?? (s.trails[id] = freshProgress());
export const isCleared = (s: SaveV6, id: string): boolean => !!s.trails[id]?.cleared;
/** Dev sandbox (?dev): every chapter, lesson and finger stop is open and nothing blocks; nothing is marked done. */
let everythingOpen = false;
export const openEverything = (on = true): void => { everythingOpen = on; };
export const everythingIsOpen = (): boolean => everythingOpen;

/** Chapter clears are permanent; optional chapters also need the setting. */
export function groveOpen(s: SaveV6, groveId: string): boolean {
  const g = GROVES.find((x) => x.id === groveId)!;
  if (everythingOpen) return true;
  if (g.optional) { if (!s.settings.codeGrove) return false; const cp = s.trails[g.opensAfter!]; return !!cp && cp.cleared; }
  if (g.n === 1) return true;
  const prev = GROVES.find((x) => !x.optional && x.n === g.n - 1)!;
  const cp = s.trails[checkpointOf(prev.id).id];
  return !!cp && cp.cleared;
}

export function trailUnlocked(s: SaveV6, trail: Trail): boolean {
  if (everythingOpen) return true;
  if (!groveOpen(s, trail.grove)) return false;
  const inGrove = trailsInGrove(trail.grove);
  const i = inGrove.findIndex((t) => t.id === trail.id);
  return (i === 0 || isCleared(s, inGrove[i - 1]!.id)) && !blockingStop(s, trail);
}

export const stopDone = (s: SaveV6, stop: Stop): boolean => pairCompleted(s.fingerCourses, stop.pair) > stop.level;
/** A lesson the learner has already begun or cleared is never held back by a stop (DEC-19: nothing earned is revoked). */
const started = (s: SaveV6, trailId: string): boolean => isCleared(s, trailId) || s.lessonSteps[trailId] !== undefined;
/** The unfinished stop that holds `trail` back: one placed after the lesson before it on the main path. */
export function blockingStop(s: SaveV6, trail: Trail): Stop | null {
  if (everythingOpen || started(s, trail.id)) return null;
  const i = MAIN_TRAILS.findIndex((t) => t.id === trail.id);
  if (i < 1) return null;
  return STOPS.find((st) => st.after === MAIN_TRAILS[i - 1]!.id && !stopDone(s, st)) ?? null;
}
/** The stop Continue should run now: the one blocking the learner's current lesson, if any. */
export const pendingStop = (s: SaveV6): Stop | null => blockingStop(s, currentTrail(s));

export const currentTrail = (s: SaveV6): Trail => trailById(s.trail);
/** Keys a trail practices: its new keys (+ space on trail 1), or the 5 weakest unlocked keys when it adds none. */
export function focusKeys(trail: Trail, model: KeyModel, now = Date.now()): string[] {
  const own = [...trail.newKeys, ...(trail.space ? [' '] : [])];
  if (own.length) return own;
  const unlocked = [...cumulativeKeys(trail).keys];
  return unlocked.map((k) => ({ k, m: model.mastery(k, now) })).sort((a, b) => a.m - b.m).slice(0, 5).map((x) => x.k);
}
export const minMastery = (keys: string[], model: KeyModel, now = Date.now()): number => keys.reduce((m, k) => Math.min(m, model.mastery(k, now)), 1);
/** Stage for the next run comes from evidence, not a counter: drill until the new keys settle, mix until they are solid, then words. */
export function stageFor(trail: Trail, model: KeyModel, now = Date.now()): StageName {
  if (trail.checkpoint) return 'words';
  const m = minMastery(focusKeys(trail, model, now).filter((k) => k !== ' '), model, now);
  if (!trail.newKeys) return m < 0.5 ? 'mix' : 'words';
  return m < 0.35 ? 'drill' : m < 0.7 ? 'mix' : 'words';
}
/** Cleared lessons replay their application exercise; unfinished lessons resume their saved step. */
export const exerciseIndex = (s: SaveV6, t = currentTrail(s)): number => s.trails[t.id]?.cleared ? lessonExercises(t).length - 1 : Math.min(s.lessonSteps[t.id] ?? 0, lessonExercises(t).length - 1);
export const currentStage = (s: SaveV6, _model: KeyModel, _now = Date.now()): StageName => lessonExercises(currentTrail(s))[exerciseIndex(s)]!.stage;

export interface RunInput { hits: number; attempts: number; maxCombo: number; wpm: number; acc: number; rhythm: number; now: number; stage?: StageName }
export interface Outcome {
  exercise: { index: number; total: number; name: string; nextName: string | null };
  passed: boolean; stars: Stars; xp: number; firstClear: boolean;
  /** What this run unlocked: the trail cleared, the next grove opened, or nothing new yet. */
  advance: 'trail' | 'grove' | 'none';
  /** Mastery of the focus keys after this run, and what still blocks clearing. */
  mastery: { key: string; mastery: number }[];
  blockers: string[];
  nextTrail: Trail | null;
  /** Legacy compatibility field; stars never gate the next chapter. */
  needsTwoStars: boolean;
  /** 0..1 speed bonus applied to XP this run. */
  swift: number;
}

/** Each visible accuracy pass advances one planned exercise; the final exercise clears its lesson. */
export function applyRun(s: SaveV6, model: KeyModel, r: RunInput): Outcome {
  const trail = currentTrail(s);
  const exercises = lessonExercises(trail), index = exerciseIndex(s, trail);
  const guided = exercises[index]!.assessment === 'guided';
  const p = progressOf(s, trail.id);
  if (!p.cleared) s.lessonSteps[trail.id] ??= 0;
  const gate = gateFor(trail);
  const stars = guided ? 0 : starsFor(gate, r.acc, r.rhythm);
  const target = trail.checkpoint ? 97 : gate.passAcc;
  const passed = guided || r.acc >= target;
  const wasCleared = p.cleared;
  let advance: Outcome['advance'] = 'none';
  let next: Trail | null = null;
  const needsTwoStars = false;
  let firstClear = false;
  if (!guided) {
    p.runs++;
    p.recent = [...p.recent, r.acc].slice(-5);
    p.cleanStreak = r.acc >= 97 && r.rhythm >= 0.6 ? (p.cleanStreak ?? 0) + 1 : 0;
  }
  const focus = focusKeys(trail, model, r.now);
  const mastery = focus.map((k) => ({ key: k, mastery: model.mastery(k, r.now) }));
  const blockers = passed ? [] : [`${r.acc}% accuracy; ${target}% needed to continue`];

  if (passed) {
    if (!guided) p.fails = 0;
    p.stars = Math.max(p.stars, stars) as Stars;
    if (!wasCleared) {
      s.lessonSteps[trail.id] = index + 1;
      if (index + 1 === exercises.length) { p.cleared = true; firstClear = true; advance = 'trail'; }
    }
    if (p.cleared) {
      const n = nextTrail(trail);
      if (n) {
        next = n;
        s.trail = n.id;
        advance = trail.checkpoint ? 'grove' : 'trail';
      }
    }
  } else {
    p.fails++;
  }
  const swift = swiftBonus(r.wpm, gate.swiftWpm);
  const xp = guided ? 0 : xpFor(r.hits, r.acc, r.maxCombo, firstClear, swift);
  if (!guided) {
    p.bestWpm = Math.max(p.bestWpm, r.wpm); p.bestAcc = Math.max(p.bestAcc, r.acc);
    const st = s.stats;
    st.runs++; st.chars += r.hits; st.attempts += r.attempts; st.xp += xp;
    st.bestWpm = Math.max(st.bestWpm, r.wpm); st.bestAcc = Math.max(st.bestAcc, r.acc); st.bestCombo = Math.max(st.bestCombo, r.maxCombo);
    const streak = bumpStreak(st.days, st.lastDay, r.now); st.days = streak.days; st.lastDay = streak.lastDay;
  }
  const exercise = { index, total: exercises.length, name: exercises[index]!.name, nextName: !p.cleared ? exercises[exerciseIndex(s, trail)]!.name : null };
  return { exercise, passed, stars, xp, firstClear, advance, mastery, blockers, nextTrail: next, needsTwoStars, swift };
}

/** Position on the main path, 1-based, for the header. */
export const pathIndex = (trail: Trail): number => { const i = MAIN_TRAILS.findIndex((t) => t.id === trail.id); return i >= 0 ? i + 1 : trailsInGrove(trail.grove).findIndex((t) => t.id === trail.id) + 1; };
export const pathLength = (trail: Trail): number => (groveOf(trail).optional ? trailsInGrove(trail.grove).length : MAIN_TRAILS.length);
