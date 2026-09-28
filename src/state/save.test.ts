import { describe, expect, it } from 'vitest';
import { KEY, RETIRED_METHODS, fresh, freshProgress, load, loadGuest, saveGuest, migrateV4, sanitize, save } from './save';
import { DEFAULT_METHOD_ID } from '../curriculum/method';

const V4 = {
  selected: 'top', completed: ['home', 'reach'], focus: 'all',
  fingerStats: { rm: { runs: 3, hits: 40, attempts: 80, bestWpm: 20, bestAcc: 60 }, li: { runs: 1, hits: 20, attempts: 20, bestWpm: 30, bestAcc: 100 } },
  stats: { runs: 12, chars: 500, attempts: 560, bestWpm: 31, bestAcc: 100, xp: 420, streak: 4, bestCombo: 19 },
};

describe('save v6', () => {
  it('migrates a v5 save: stage 3 → cleared, key stats gain review fields, v6 written on save', () => {
    const v5 = { v: 5, trail: 'ring-pair', trails: { anchors: { stage: 3, stars: 2, bestWpm: 20, bestAcc: 100, fails: 0 }, 'ring-pair': { stage: 1, stars: 0, bestWpm: 0, bestAcc: 0, fails: 1 } }, keys: { f: { err: 0.1, lat: 300, seen: 40, last: 1_700_000_000_000 } }, stats: { runs: 5, chars: 100, attempts: 110, bestWpm: 20, bestAcc: 100, xp: 120, days: 1, lastDay: '2026-09-18', bestCombo: 12 }, settings: { guideStrong: false, reviewOn: true, codeGrove: false } };
    const mem = new Map<string, string>([['keygrove.v5', JSON.stringify(v5)]]);
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const s = load(storage);
    expect(s.v).toBe(6);
    expect(s.trails['anchors']).toMatchObject({ cleared: true, runs: 3, stars: 2 });
    expect(s.trails['ring-pair']).toMatchObject({ cleared: false, runs: 1, fails: 1 });
    expect(s.keys['f']).toMatchObject({ err: 0.1, lat: 300, seen: 40, hits: 36 });
    expect(s.keys['f']!.due).toBeGreaterThan(s.keys['f']!.last);
    save(s, storage);
    expect(mem.has(KEY)).toBe(true);
    expect(sanitize(JSON.parse(mem.get(KEY)!))).toEqual(s);
  });
  it('fresh round-trips through sanitize and JSON', () => {
    const s = fresh();
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('migrates a v4 save: cleared lessons → cleared trails, current = first uncleared, stats kept, heat seeded', () => {
    const s = migrateV4(V4);
    expect(s.v).toBe(6);
    expect(s.trails['anchors']).toMatchObject({ cleared: true, stars: 1 });
    expect(s.trails['index-reach']).toMatchObject({ cleared: true, stars: 1 });
    expect(s.trails['middle-up']).toBeUndefined();
    expect(s.trail).toBe('middle-up');
    expect(s.stats).toMatchObject({ runs: 12, chars: 500, xp: 420, bestWpm: 31, bestCombo: 19 });
    expect(s.keys['k']!.err).toBeGreaterThan(s.keys['f']!.err);
    const again = sanitize(JSON.parse(JSON.stringify(s)));
    expect(again).toEqual(s);
  });
  it('load prefers v5, falls back to v4, then fresh; save writes v5', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(load(storage)).toEqual(fresh());
    mem.set('keygrove.v4', JSON.stringify(V4));
    expect(load(storage).trail).toBe('middle-up');
    const s = fresh(); s.trail = 'ring-pair'; save(s, storage);
    expect(mem.has(KEY)).toBe(true);
    expect(load(storage).trail).toBe('ring-pair');
    mem.set(KEY, '{not json');
    expect(load(storage)).toEqual(fresh());
  });
  it('sanitize drops unknown trails and clamps', () => {
    const s = sanitize({ trail: 'nope', trails: { anchors: { stage: 9, stars: -1, bestWpm: 1e9 }, ghost: { stage: 3 } }, stats: { xp: 'x' }, settings: { guideStrong: 'yes', codeGrove: true } });
    expect(s.trail).toBe('anchors');
    expect(s.trails['anchors']).toEqual({ runs: 3, cleared: true, stars: 0, bestWpm: 400, bestAcc: 0, fails: 0, recent: [], cleanStreak: 0 });
    expect(s.trails['ghost']).toBeUndefined();
    expect(s.settings).toMatchObject({ guideStrong: false, codeGrove: true });
  });

  it('onboarding: a fresh save asks; a save without the flag (pre-question) never asks; an explicit answer is kept', () => {
    expect(fresh().settings.onboarded).toBe(false);
    expect(sanitize({ v: 6, settings: { guideStrong: true } }).settings.onboarded).toBe(true);
    expect(sanitize({ v: 6, settings: { onboarded: false } }).settings.onboarded).toBe(false);
    expect(migrateV4(V4).settings.onboarded).toBe(true);
  });
});

it('guest reload retains course work independently of account saves', () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const guest = fresh(); guest.stats.runs = 3;
  saveGuest(guest, storage);
  const account = fresh(); account.stats.runs = 20; save(account, storage);
  expect(loadGuest(storage).stats.runs).toBe(3);
  expect(load(storage).stats.runs).toBe(20);
});


describe('credit passing attempts held by the old hidden gates', () => {
  it('loads five passing first-lesson attempts at lesson two for both guests and accounts', () => {
    const old = fresh();
    old.trails.anchors = { ...freshProgress(), runs: 5, bestAcc: 100, recent: [95, 100, 92, 97, 100] };
    old.stats.runs = 5;
    const storage = { getItem: () => JSON.stringify(old) };
    for (const loadSave of [load, loadGuest]) {
      const s = loadSave(storage);
      expect(s.trails.anchors!.cleared).toBe(true);
      expect(s.trail).toBe('inner-pair');
      expect(s.stats.runs).toBe(5);
      expect(sanitize(s)).toEqual(s);
    }
  });
  it('credits older best scores and recent passes, but not below-target checkpoints or empty records', () => {
    const old = fresh();
    old.trails.anchors = { ...freshProgress(), runs: 10, bestAcc: 90, recent: [80, 80, 80, 80, 80] };
    old.trails['inner-pair'] = { ...freshProgress(), runs: 1, recent: [90] };
    old.trails['middle-up'] = { ...freshProgress(), bestAcc: 100 };
    old.trails['roots-checkpoint'] = { ...freshProgress(), runs: 5, bestAcc: 96, recent: [96] };
    const s = sanitize(old);
    expect(s.trail).toBe('middle-up');
    expect(s.trails['inner-pair']!.cleared).toBe(true);
    expect(s.trails['middle-up']!.cleared).toBe(false);
    expect(s.trails['roots-checkpoint']!.cleared).toBe(false);
  });
  it('retains intentional replay selections and permanent clears', () => {
    const old = fresh();
    old.trails.anchors = { ...freshProgress(), runs: 1, cleared: true, bestAcc: 80 };
    expect(sanitize(old).trail).toBe('anchors');
    expect(sanitize(old).trails.anchors!.cleared).toBe(true);
  });
});

describe('retired typing methods (DEC-17)', () => {
  const retired = Object.keys(RETIRED_METHODS)[0]!;
  const stat = { err: 0.1, lat: 300, seen: 40, last: 1_700_000_000_000 };
  const old = {
    v: 6, trail: 'core-words', trails: { anchors: { runs: 3, cleared: true, stars: 1, bestWpm: 20, bestAcc: 98, fails: 0, recent: [98], cleanStreak: 0 } },
    lessonSteps: { anchors: 5, 'core-words': 1 },
    keys: { f: stat, z: stat, x: stat, c: stat, b: stat },
    transitions: { fj: { err: 0, lat: 200, lat2: 40000, seen: 10, hits: 10, last: 1 }, cd: { err: 0, lat: 200, lat2: 40000, seen: 10, hits: 10, last: 1 }, ab: { err: 0, lat: 200, lat2: 40000, seen: 10, hits: 10, last: 1 } },
    fingerCourses: { [`${retired}/li`]: 6, [`${DEFAULT_METHOD_ID}/li`]: 2, [`${retired}/rp`]: 3 },
    settings: { guideStrong: false, reviewOn: true, codeGrove: false, method: retired, onboarded: true, paceSeen: false },
  };
  it('moves to the default method, resetting only the keys whose finger differed', () => {
    const s = sanitize(old);
    expect(s.settings.method).toBe(DEFAULT_METHOD_ID);
    expect(Object.keys(s.keys).sort()).toEqual(['f']);
    expect(Object.keys(s.transitions)).toEqual(['fj']);
  });
  it('keeps lessons and carries finger-course credit over (never revoked)', () => {
    const s = sanitize(old);
    expect(s.trails.anchors!.cleared).toBe(true);
    expect(s.lessonSteps).toMatchObject({ anchors: 5, 'core-words': 1 });
    expect(s.trail).toBe('core-words');
    expect(s.fingerCourses[`${DEFAULT_METHOD_ID}/li`]).toBe(6);
    expect(s.fingerCourses[`${DEFAULT_METHOD_ID}/rp`]).toBe(3);
    expect(Object.keys(s.fingerCourses).some((k) => k.startsWith(retired))).toBe(false);
  });
  it('a save already on the default method is untouched', () => {
    const s = sanitize({ ...old, settings: { ...old.settings, method: DEFAULT_METHOD_ID } });
    expect(Object.keys(s.keys).sort()).toEqual(['b', 'c', 'f', 'x', 'z']);
    expect(Object.keys(s.transitions).sort()).toEqual(['ab', 'cd', 'fj']);
  });
});
