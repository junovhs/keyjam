import { activeMethod, baseKey, fingerOf, type FingerId } from './method';
import type { Finger } from './fingers';

export const FINGER_LEVEL_COUNT = 10;
export const FINGER_PASS_ACC = 95;
/** A finger stop is this many pages; each is judged and saved on its own. */
export const FINGER_PAGES = 3;
export const fingerCourseId = (id: FingerId): string => `${activeMethod().id}/${id}`;
export interface FingerLevel { name: string; instruction: string; text: string }
/** Derive every reach (including shifted punctuation) from the canonical method. */
export function fingerLevels(f: Finger): FingerLevel[] {
  const owned = [...f.keys];
  const row = (s: string) => [...s].filter(k => owned.includes(k));
  const home = row('asdfghjkl;');
  const upper = row('qwertyuiop');
  const lower = row('zxcvbnm,./');
  const reaches = (ks: string[]) => (ks.length ? ks : home).map(k => f.anchor + k + k + f.anchor);
  const level = (name: string, instruction: string, tokens: string[]): FingerLevel => {
    let text = tokens.join(' ');
    while (text.length < 48) text += ' ' + tokens.join(' ');
    return { name, instruction, text };
  };
  // Same-finger row jumps: upper to lower and back without resting on the home row.
  const jumps = upper.flatMap(u => lower.map(l => u + l + l + u)).concat(lower.flatMap(l => upper.map(u => l + u + u + l)));
  // Levels 4–10 are generated per run (engine/finger-practice.ts); `text` stays empty and their placement comes from LEVEL_NEEDS.
  const hard = (name: string, instruction: string): FingerLevel => ({ name, instruction, text: '' });
  return [
    level('Find your landmarks', 'Small home-row movements. Let your hand stay comfortable.', reaches(home)),
    level('Reach up and across', 'Meet the upper row and nearby home-row reaches. Either thumb presses Space between the six-letter groups.', reaches([...home.filter(k => k !== f.anchor), ...upper])),
    level('Reach down', 'Explore the lower row in short groups. Then use these keys in real words next.', reaches(lower)),
    level('Row jumps', 'Jump straight between the upper and lower rows with one finger, without stopping on the home row. Let the finger travel; keep the wrist still.', jumps.length ? jumps : reaches(owned)),
    hard('Finger-heavy words', 'Words packed with these fingers\' keys. Keep the rest of the hand quiet while these fingers do the work.'),
    hard('Same-finger runs', 'One finger presses two different keys in a row. Move it cleanly from key to key; do not let a neighbour help.'),
    hard('Twisters', 'Tongue twisters for your fingers. Where it knots, slow down; accuracy is the only target.'),
    hard('Capital reaches', 'The same hard words in Title case and CAPITALS. Hold Shift with the opposite hand.'),
    hard('Numbers and symbols', 'Reach from letters to the number row and the symbols these fingers own, and back again.'),
    hard('The gauntlet', 'A long, awkward passage: capitals, numbers, symbols and twisters. 95% for each finger.'),
  ];
}
/** What a level's text needs before it can appear on the main path (DEC-19). 'text' means the characters of its static text. */
export const LEVEL_NEEDS: readonly ('text' | 'letters' | 'capitals' | 'symbols')[] = ['text', 'text', 'text', 'text', 'letters', 'letters', 'letters', 'capitals', 'symbols', 'symbols'];

/** Player-facing courses group matching fingers; assignments still come from the active method. */
export interface FingerPair {
  id: 'index' | 'middle' | 'ring' | 'pinky';
  name: string;
  sides: readonly [Exclude<FingerId, 'thumb'>, Exclude<FingerId, 'thumb'>];
}
/** One visible progression for each pair, backed by two existing method-specific records. */
export const FINGER_PAIRS: readonly FingerPair[] = [
  { id: 'index', name: 'Index fingers', sides: ['li', 'ri'] },
  { id: 'middle', name: 'Middle fingers', sides: ['lm', 'rm'] },
  { id: 'ring', name: 'Ring fingers', sides: ['lr', 'rr'] },
  { id: 'pinky', name: 'Pinkies', sides: ['lp', 'rp'] },
];
/** Both sides must have cleared a level before the shared course can move beyond it. */
export function pairCompleted(progress: Readonly<Record<string, number>>, pair: FingerPair): number {
  return Math.min(...pair.sides.map(id => progress[fingerCourseId(id)] ?? 0));
}
