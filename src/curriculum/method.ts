/**
 * Canonical typing-method tables (DEC-17). Nothing else in the app may hard-code key→finger; a change to a core
 * assignment is a new version. METHODS lists every official method: add a table there and Settings offers it.
 */
export type Hand = 'left' | 'right';
export type FingerName = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';
/** Stable finger ids used everywhere in the UI: lp lr lm li · ri rm rr rp · thumb. */
export type FingerId = 'lp' | 'lr' | 'lm' | 'li' | 'ri' | 'rm' | 'rr' | 'rp' | 'thumb';
export interface Assignment { hand: Hand; finger: FingerName }
export interface TypingMethod {
  id: string;
  name: string;
  version: string;
  /** Lowercase base keys only; shifted symbols inherit their base key's finger. */
  assignments: Readonly<Record<string, FingerId>>;
  shift: 'opposite';
  space: 'either';
  blurb: string;
}

const NUMBERS: Record<string, FingerId> = { '1': 'lp', '2': 'lr', '3': 'lm', '4': 'li', '5': 'li', '6': 'ri', '7': 'ri', '8': 'rm', '9': 'rr', '0': 'rp' };
const RIGHT_PINKY_EXTRAS: Record<string, FingerId> = { '-': 'rp', '=': 'rp', '[': 'rp', ']': 'rp', "'": 'rp', '\\': 'rp' };
const COMMON: Record<string, FingerId> = {
  q: 'lp', a: 'lp', '`': 'lp', w: 'lr', s: 'lr', e: 'lm', d: 'lm', r: 'li', f: 'li', t: 'li', g: 'li', v: 'li',
  y: 'ri', u: 'ri', h: 'ri', j: 'ri', n: 'ri', m: 'ri', i: 'rm', k: 'rm', ',': 'rm', o: 'rr', l: 'rr', '.': 'rr', p: 'rp', ';': 'rp', '/': 'rp',
  ' ': 'thumb', ...NUMBERS, ...RIGHT_PINKY_EXTRAS,
};

export const TRADITIONAL: TypingMethod = {
  id: 'traditional@1.0', name: 'Traditional touch typing', version: '1.0',
  assignments: { ...COMMON, z: 'lp', x: 'lr', c: 'lm', b: 'li' },
  shift: 'opposite', space: 'either',
  blurb: 'Conventional column assignments: each finger owns a slanted column, F and J are landmarks, Shift is on the opposite hand.',
};
/** Every official method, default first. With one entry Settings hides the method control; a second entry brings it back. */
export const METHODS: readonly TypingMethod[] = [TRADITIONAL];
/** DEC-17: Traditional is the default. A stored choice of any listed method always wins. */
export const DEFAULT_METHOD_ID = TRADITIONAL.id;
/** Keys whose finger differs between two methods: the evidence a switch must reset. */
export const reassignedKeys = (a: TypingMethod, b: TypingMethod): string[] => Object.keys(a.assignments).filter((k) => a.assignments[k] !== b.assignments[k]);

let active: TypingMethod = TRADITIONAL;
export const activeMethod = (): TypingMethod => active;
export function setMethod(id: string): TypingMethod {
  active = METHODS.find((m) => m.id === id) ?? TRADITIONAL;
  return active;
}

/** Shifted symbol → the unshifted key that produces it. */
const SHIFTED: Record<string, string> = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '{': '[', '}': ']', '|': '\\', '~': '`' };
export const baseKey = (k: string): string => (SHIFTED[k] ?? k).toLowerCase();
export const isShifted = (k: string): boolean => k in SHIFTED || (k.length === 1 && k !== k.toLowerCase());

/** Finger id owning a key under the active method, or null for keys the method does not cover. */
export function fingerOf(key: string, method = active): FingerId | null {
  return method.assignments[baseKey(key)] ?? null;
}
export function keysOf(finger: FingerId, method = active): string[] {
  return Object.entries(method.assignments).filter(([, f]) => f === finger).map(([k]) => k);
}
export const HOME: Readonly<Record<FingerId, string>> = { lp: 'a', lr: 's', lm: 'd', li: 'f', ri: 'j', rm: 'k', rr: 'l', rp: ';', thumb: ' ' };
/** Home-row landmark of the finger that owns `key` (F/J are landmarks, not anchors — spec §4.2). */
export const homeOf = (key: string, method = active): string => HOME[fingerOf(key, method) ?? 'li'];
/** Same finger on the other hand's home key: a partner to alternate with in rhythm drills. */
const MIRROR: Readonly<Record<FingerId, FingerId>> = { lp: 'rp', lr: 'rr', lm: 'rm', li: 'ri', ri: 'li', rm: 'lm', rr: 'lr', rp: 'lp', thumb: 'thumb' };
export const mirrorOf = (key: string, method = active): string => HOME[MIRROR[fingerOf(key, method) ?? 'li']];
export const handOf = (finger: FingerId): Hand | 'either' => (finger === 'thumb' ? 'either' : finger.startsWith('l') ? 'left' : 'right');
/** Each Shift belongs to the pinky on its own side, like any other key. */
export const SHIFT_FINGER: Readonly<Record<Hand, FingerId>> = { left: 'lp', right: 'rp' };
/** The Shift key to hold for `key` (method shift 'opposite': the other hand from the key's finger); null when unshifted. */
export function shiftSideFor(key: string, method = active): Hand | null {
  if (!isShifted(key)) return null;
  const f = fingerOf(key, method), h = f ? handOf(f) : null;
  return h === 'left' ? 'right' : h === 'right' ? 'left' : null;
}
