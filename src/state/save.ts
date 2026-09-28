import { lessonExercises } from '../curriculum/lesson-flow';
import { MAIN_TRAILS, TRAILS, gateFor, nextTrail, trailById } from '../curriculum';
import { KeyModel, type Confusions, type KeyStats } from '../engine/keymodel';
import { DEFAULT_METHOD_ID, METHODS } from '../curriculum/method';
import { FINGER_PAGES } from '../curriculum/finger-course';
import { ERROR_CLASSES, emptyTally, type ErrorTally } from '../engine/errors';
import { TransitionModel, type TransitionStats } from '../engine/transitions';
import { freshPace, type PaceEvidence } from '../engine/pace';

export const KEY = 'keygrove.v6';
const PREV_V5 = 'keygrove.v5';
const PREV = ['keygrove.v4', 'keygrove.v3', 'keygrove.v2'];

/** Per-trail record. `cleared` records a passage meeting the visible accuracy target; `recent` holds the last runs' accuracy. */
export interface TrailProgress { runs: number; cleared: boolean; stars: 0 | 1 | 2 | 3; bestWpm: number; bestAcc: number; fails: number; recent: number[]; cleanStreak: number }
export interface Stats { runs: number; chars: number; attempts: number; bestWpm: number; bestAcc: number; xp: number; days: number; lastDay: string; bestCombo: number }
/** `onboarded`: the method question has been answered (or the save predates it). */
/** `paceSeen`: the too-fast modal has shown once; from then on going too fast only shows a tag over the letter. */
export interface Settings { guideStrong: boolean; reviewOn: boolean; codeGrove: boolean; method: string; onboarded: boolean; paceSeen: boolean }
export interface SaveV6 {
  v: 6;
  fingerCourses: Record<string, number>;
  /** Completed visible exercises per lesson; presence distinguishes new partial progress from legacy passes. */
  lessonSteps: Record<string, number>;
  /** Pages passed in each unfinished finger stop, keyed by stop id: a passed page is kept. */
  stopPages: Record<string, number>;
  trail: string;
  trails: Record<string, TrailProgress>;
  keys: KeyStats;
  confusions: Confusions;
  stats: Stats;
  settings: Settings;
  /** Rolling error-class tally (§29), decayed per run. */
  errors: ErrorTally;
  /** Two-key transition stats (§25), keyed 'ab'. */
  transitions: TransitionStats;
  /** Evidence of an existing fast typing habit (PACE-02); tunes the pace note, never shown. */
  pace: PaceEvidence;
}
/** @deprecated alias kept while callers migrate. */
export type SaveV5 = SaveV6;

export const freshProgress = (): TrailProgress => ({ runs: 0, cleared: false, stars: 0, bestWpm: 0, bestAcc: 0, fails: 0, recent: [], cleanStreak: 0 });
export const fresh = (): SaveV6 => ({
  v: 6, fingerCourses: {}, lessonSteps: {}, stopPages: {}, trail: MAIN_TRAILS[0]!.id, trails: {}, keys: {}, confusions: {},
  stats: { runs: 0, chars: 0, attempts: 0, bestWpm: 0, bestAcc: 0, xp: 0, days: 0, lastDay: '', bestCombo: 0 },
  settings: { guideStrong: false, reviewOn: true, codeGrove: false, method: DEFAULT_METHOD_ID, onboarded: false, paceSeen: false },
  errors: emptyTally(),
  transitions: {},
  pace: freshPace(),
});

/** Methods the app no longer offers (DEC-17): id → the keys whose finger differed from the default method. A save that
 * names one moves to the default; evidence for those keys is reset and its finger-course credit carries over. */
export const RETIRED_METHODS: Readonly<Record<string, readonly string[]>> = { 'relaxed-qwerty@1.0': ['z', 'x', 'c', 'b'] };

const num = (v: unknown, max = Infinity): number => Math.min(max, Math.max(0, Number(v) || 0));
const int = (v: unknown, max: number) => Math.floor(num(v, max));

/** Coerce any object into a valid SaveV6, dropping unknown trails and clamping numbers. Accepts v5 shapes too. */
export function sanitize(x: unknown): SaveV6 {
  const s = fresh();
  if (!x || typeof x !== 'object') return s;
  const o = x as Record<string, unknown>;
  if (typeof o.trail === 'string' && TRAILS.some((t) => t.id === o.trail)) s.trail = o.trail;
  if (o.trails && typeof o.trails === 'object') {
    for (const [id, v] of Object.entries(o.trails as Record<string, unknown>)) {
      if (!TRAILS.some((t) => t.id === id) || !v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      const stage = int(r.stage, 3); // v5 field
      const cleared = typeof r.cleared === 'boolean' ? r.cleared : stage >= 3;
      const recent = Array.isArray(r.recent) ? r.recent.filter((v): v is number => typeof v === 'number').slice(-5).map((v) => num(v, 100)) : [];
      s.trails[id] = { runs: int(r.runs, 9999) || (cleared ? 3 : stage), cleared, stars: int(r.stars, 3) as 0 | 1 | 2 | 3, bestWpm: num(r.bestWpm, 400), bestAcc: num(r.bestAcc, 100), fails: int(r.fails, 99), recent, cleanStreak: int(r.cleanStreak, 99) };
    }
  }
  if (o.lessonSteps && typeof o.lessonSteps === 'object') {
    for (const t of TRAILS) {
      const value = (o.lessonSteps as Record<string, unknown>)[t.id];
      if (typeof value === 'number' && Number.isFinite(value)) s.lessonSteps[t.id] = int(value, lessonExercises(t).length);
    }
  }
  // Credit passing work that older hidden mastery/stage gates left uncleared.
  // Only move a newly credited current lesson: preserve deliberately selected replays.
  const wasCurrentCleared = !!s.trails[s.trail]?.cleared;
  for (const t of TRAILS) {
    const p = s.trails[t.id];
    const target = t.checkpoint ? 97 : gateFor(t).passAcc;
    if (!(t.id in s.lessonSteps) && p && p.runs > 0 && (p.bestAcc >= target || p.recent.some(acc => acc >= target))) p.cleared = true;
  }
  if (!wasCurrentCleared && s.trails[s.trail]?.cleared) {
    while (s.trails[s.trail]?.cleared) {
      const next = nextTrail(trailById(s.trail));
      if (!next) break;
      s.trail = next.id;
    }
  }
  if (o.stopPages && typeof o.stopPages === 'object') {
    for (const [id, v] of Object.entries(o.stopPages as Record<string, unknown>)) {
      if (/^stop-[a-z]+-\d+$/.test(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) s.stopPages[id] = int(v, FINGER_PAGES);
    }
  }
  if (o.fingerCourses && typeof o.fingerCourses === 'object') {
    const stored = o.fingerCourses as Record<string, unknown>;
    for (const method of METHODS) for (const finger of new Set(Object.values(method.assignments))) {
      if (finger === 'thumb') continue;
      const id = `${method.id}/${finger}`;
      // A retired method's credit for the same finger carries over to the default method: earned levels are never revoked.
      const values = [stored[id], ...(method.id === DEFAULT_METHOD_ID ? Object.keys(RETIRED_METHODS).map((r) => stored[`${r}/${finger}`]) : [])]
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (values.length) s.fingerCourses[id] = int(Math.max(...values), 10);
    }
  }
  const storedMethod = (o.settings && typeof o.settings === 'object' ? (o.settings as Record<string, unknown>).method : undefined);
  const moved = typeof storedMethod === 'string' ? RETIRED_METHODS[storedMethod] ?? [] : [];
  const km = KeyModel.fromJSON(o.keys, o.confusions).toJSON();
  // Evidence gathered under a retired method's finger for a key no longer describes the learner's movement.
  for (const k of moved) delete km.keys[k];
  s.keys = km.keys; s.confusions = km.confusions;
  const q = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  for (const k of ['runs', 'chars', 'attempts', 'bestWpm', 'bestAcc', 'xp', 'days', 'bestCombo'] as const) s.stats[k] = num(q[k]);
  s.stats.lastDay = typeof q.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.lastDay) ? q.lastDay : '';
  const st = (o.settings && typeof o.settings === 'object' ? o.settings : {}) as Record<string, unknown>;
  for (const k of ['guideStrong', 'reviewOn', 'codeGrove', 'paceSeen'] as const) if (typeof st[k] === 'boolean') s.settings[k] = st[k];
  // A save written before the question existed has already chosen by playing: never ask it.
  s.settings.onboarded = typeof st.onboarded === 'boolean' ? st.onboarded : true;
  if (typeof st.method === 'string' && METHODS.some((m) => m.id === st.method)) s.settings.method = st.method;
  const er = (o.errors && typeof o.errors === 'object' ? o.errors : {}) as Record<string, unknown>;
  for (const c of ERROR_CLASSES) s.errors[c] = num(er[c], 999);
  s.transitions = TransitionModel.fromJSON(o.transitions).toJSON();
  for (const pair of Object.keys(s.transitions)) if ([...pair].some((k) => moved.includes(k))) delete s.transitions[pair];
  const pc = (o.pace && typeof o.pace === 'object' ? o.pace : {}) as Record<string, unknown>;
  s.pace = { fastEarly: int(pc.fastEarly, 99), established: pc.established === true };
  return s;
}

/** v2–v4 saves: six lessons unlocked at 80%. Map cleared lessons onto the trails they covered. */
const LESSON_TRAILS: Record<string, string[]> = {
  home: ['anchors', 'inner-pair', 'ring-pair', 'outer-pair'],
  reach: ['index-reach'],
  top: ['middle-up', 'index-up', 'core-words', 'roots-checkpoint', 'home-words', 'home-checkpoint', 'index-stretch-up', 'ring-up', 'pinky-up', 'canopy-checkpoint'],
  bottom: ['index-down', 'index-stretch-down', 'middle-down', 'ring-down', 'last-reaches', 'undergrowth-checkpoint'],
  words: [], notes: [],
};
/**
 * Ownership as taught by the v2–v4 app (traditional touch typing: Z pinky, X ring, C middle, V/B left index).
 * Used ONLY to convert legacy per-finger stats into per-key stats. Deliberately not the live method table —
 * replacing it with activeMethod() would mis-attribute historical evidence.
 */
const FINGER_KEYS: Record<string, string> = { lp: 'qaz', lr: 'wsx', lm: 'edc', li: 'rftgvb', ri: 'yhnujm', rm: 'ik,', rr: 'ol.', rp: 'p;/' };

export function migrateV4(raw: unknown): SaveV6 {
  const s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Record<string, unknown>;
  const completed = Array.isArray(o.completed) ? o.completed.filter((x): x is string => typeof x === 'string') : [];
  for (const lesson of completed) for (const id of LESSON_TRAILS[lesson] ?? []) {
    const t = trailById(id);
    // A checkpoint cleared under the old 80% rule counts as ★★ so the next grove stays open.
    s.trails[id] = { runs: 3, cleared: true, stars: t.checkpoint ? 2 : 1, bestWpm: 0, bestAcc: 0, fails: 0, recent: [], cleanStreak: 0 };
  }
  const first = MAIN_TRAILS.find((t) => !s.trails[t.id]);
  s.trail = (first ?? MAIN_TRAILS.at(-1)!).id;
  const q = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  s.stats.runs = num(q.runs); s.stats.chars = num(q.chars); s.stats.attempts = num(q.attempts);
  s.stats.bestWpm = num(q.bestWpm, 400); s.stats.bestAcc = num(q.bestAcc, 100); s.stats.xp = num(q.xp); s.stats.bestCombo = num(q.bestCombo);
  // Seed key heat from per-finger accuracy so remedial offers start informed (deterministic: worst keys first).
  const km = new KeyModel();
  if (o.fingerStats && typeof o.fingerStats === 'object') {
    for (const [fid, v] of Object.entries(o.fingerStats as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      const attempts = num(r.attempts), hits = num(r.hits);
      if (attempts < 5) continue;
      const misses = Math.round(5 * Math.max(0, Math.min(1, 1 - hits / attempts)));
      for (const k of FINGER_KEYS[fid] ?? '') for (let i = 0; i < 5; i++) km.record(k, i >= misses, 400, 0);
    }
  }
  s.keys = km.toJSON().keys;
  s.settings.onboarded = true;
  return s;
}

export function load(storage: Pick<Storage, 'getItem'> = localStorage): SaveV6 {
  try {
    const cur = storage.getItem(KEY);
    if (cur) return sanitize(JSON.parse(cur));
    const v5 = storage.getItem(PREV_V5);
    if (v5) return sanitize(JSON.parse(v5)); // v5 → v6: cleared from stage, key stats extended with defaults
    for (const k of PREV) { const v = storage.getItem(k); if (v) return migrateV4(JSON.parse(v)); }
  } catch { /* corrupt or unavailable storage → fresh */ }
  return fresh();
}
export function save(s: SaveV6, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}
/** Nothing of a save stays on the device: the current key and every earlier one. */
export function clear(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try { for (const k of [KEY, PREV_V5, ...PREV]) storage.removeItem(k); } catch { /* unavailable storage holds nothing anyway */ }
}

/** Guest work is durable but never read as another person's account cache. */
export const GUEST_KEY = 'keygrove.guest.v6';
export function loadGuest(storage: Pick<Storage, 'getItem'> = localStorage): SaveV6 {
  try { const raw = storage.getItem(GUEST_KEY); return raw ? sanitize(JSON.parse(raw)) : fresh(); }
  catch { return fresh(); }
}
export function saveGuest(s: SaveV6, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(GUEST_KEY, JSON.stringify(s)); } catch { /* export remains available */ }
}
