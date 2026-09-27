import type { Trail } from './types';
import { activeMethod, fingerOf, handOf, isShifted } from './method';
import { allowedChars } from './index';
import { carriersOf } from './headline';
import { defaultHeadline } from './lesson-flow';

export type BriefIcon = 'hand' | 'bumps' | 'anchor' | 'feather' | 'eye' | 'space' | 'rhythm' | 'stretch' | 'shift';
/**
 * `keys`/`press` are key tokens: a lowercase key, SHIFT_TOKEN.left/right for a Shift key itself, or a capital, which must
 * be typed holding the opposite-hand Shift.
 */
export interface BriefTip { icon: BriefIcon; title: string; body: string; keys?: string; press?: string }
/** `badge` marks a briefing that introduces new keys (drawn apart from the rest); `required` cannot be skipped with Esc. */
export interface Briefing { title: string; lead: string; tips: readonly BriefTip[]; badge?: string; required?: true }
/** Press tokens for the Shift keys themselves (not typable characters, so they never collide with a real key). */
export const SHIFT_TOKEN = { left: '‹', right: '›' } as const;
const tip = (icon: BriefIcon, title: string, body: string, keys?: string, press?: string): BriefTip => ({ icon, title, body, ...(keys ? { keys } : {}), ...(press ? { press } : {}) });
const brief = (title: string, lead: string, ...tips: BriefTip[]): Briefing => ({ title, lead, tips });
const BRIEFINGS: Record<string, Briefing> = {
  anchors: brief('Find your bearings', 'Small, accurate movements. As slowly as you need.',
    tip('hand', 'Find [f] and [j] deliberately', 'Press [f] with your {f}, then [j] with your {j}.', 'fj', 'fj'),
    tip('bumps', 'Landmarks, not anchors', 'Feel the bumps to orient yourself. Your hands may adjust a little; you do not need to return here after every press.', 'fj'),
    tip('feather', 'An easy touch', 'Use only the pressure needed for the key. Let the other fingers stay easy. Pause if you notice tension or strain.', 'fj')),
  'inner-pair': brief('Another pair joins in', 'Connect the fingers rather than holding the hand still.',
    tip('hand', 'Find [d] and [k] deliberately', 'Press [d] with your {d}, then [k] with your {k}.', 'dk', 'dk'),
    tip('feather', 'Prepare the next finger', 'While one finger presses, let the next get ready. Keep the movements small without making the hand rigid.', 'fjdk')),
  'middle-up': brief('Move into your first words', 'Connect an upward reach to a familiar movement.',
    tip('stretch', 'Find [e] and [i] deliberately', 'Press [e] with your {e}, then [i] with your {i}. A small hand adjustment is welcome.', 'ei', 'ei'),
    tip('eye', 'Connect, rather than reset', '[e] and [d] share a finger; [i] and [k] share a finger. Move toward the next letter, without a compulsory return between presses.', 'edik')),
  'index-reach': brief('Reach inward', 'These small movements open more useful words.',
    tip('stretch', 'Find [g] and [h] deliberately', 'Press [g] with your {g}, then [h] with your {h}. Keep the press light.', 'gh', 'gh'),
    tip('eye', 'Carry coordination into a word', 'See hi or hide as a little movement phrase. Find each letter slowly, then connect them without unnecessary resets.', 'hi')),
  'core-words': brief('Reach down', 'The lower row is part of the same instrument.',
    tip('stretch', 'Find [v] and [m] deliberately', 'Press [v] with your {v}, then [m] with your {m}. Let the hand make a small comfortable adjustment.', 'vm', 'vm'),
    tip('eye', 'Look ahead by one movement', 'Connect give and him. Prepare the next finger while the current one presses; there is no need to hurry.', 'vm')),
  'roots-checkpoint': brief('Your first connected passage', 'Use the movements from all three letter rows.',
    tip('rhythm', '97% accuracy, at your pace', 'Slow practice counts fully. Read a word ahead, pause when you need to, and use the landmarks if you lose your bearings.', 'fjdkeighvm')),
};
/** Only for keys typed with Shift: says what the on-screen help actually does. */
const SHIFT_NOTE = ' Hold [shift] with your other hand; the keyboard lights the one to use.';
/** Words a briefing names for a movement: its carriers as the words line uses them, skipping two-letter fragments. */
export const briefingWords = (target: string, trail: Trail): string[] => carriersOf(target, allowedChars(trail)).filter((w) => w.length >= 3).slice(0, 3);
const list = (ws: readonly string[]): string => (ws.length > 1 ? `${ws.slice(0, -1).join(', ')} and ${ws.at(-1)}` : ws[0] ?? '');
/** What a new-key letter lesson builds toward (CURR-52): its headline movement, how the hand makes it, and the words that
 * carry it. Names the lesson default, never a per-learner pick; the fingers are prescribed, never observed (DEC-15). */
function movementTip(trail: Trail): BriefTip | null {
  if (trail.newKeys === '/') return tip('eye', 'Your movement: the slash', "The slash joins two words. You'll practise it, then use it in yes/no and and/or.", '/');
  const target = defaultHeadline(trail);
  const words = target ? briefingWords(target, trail) : [];
  if (!target || words.length < 2) return null;
  const [a, b] = [target[0]!, target[1]!], [fa, fb] = [fingerOf(a), fingerOf(b)];
  const how = fa === fb ? `[${a}] and [${b}] share your {${a}}; let it travel from one to the other.`
    : fa && fb && handOf(fa) === handOf(fb) ? `[${a}] then [${b}], both on your ${handOf(fa)} hand; let the second finger get ready early.`
      : `[${a}] on one hand, [${b}] on the other; let each hand prepare while the other presses.`;
  return tip('eye', `Your movement: [${a}] to [${b}]`, `${how} You'll practise it, then use it in ${list(words)}.`, target);
}
/** The Shift lesson's introduction: two new keys, whose pinky owns each, and the opposite-hand rule, each pressed to go on. */
function shiftBriefing(): Briefing {
  const both = SHIFT_TOKEN.left + SHIFT_TOKEN.right;
  return brief('New keys: Shift', 'Capitals come from two new keys, held by the hand that is not typing the letter.',
    tip('shift', 'New keys: the two Shift keys', 'There is a [shift] at each end of the bottom row, and each belongs to a pinky: your left pinky owns left [shift] and your right pinky owns right [shift]. Press each one to find it.', both, both),
    tip('hand', 'Always the opposite hand', 'A capital from the left hand, like [F]: your right pinky holds right [shift]. A capital from the right hand, like [J]: your left pinky holds left [shift]. One hand holds while the other types, so no hand has to grab two keys at once. Type both.', 'FJ', 'FJ'),
    tip('feather', 'Hold, press, release', 'Hold [shift] first, press the letter, then let both go. Capitals are drawn larger and underlined, and the keyboard lights the [shift] to use.', both));
}
const cache = new Map<string, Briefing | null>();
/** Later new movements also receive a short explicit introduction, resolved through the active method. */
export function briefingFor(trail: Trail): Briefing | null {
  const key = `${activeMethod().id}/${trail.id}`;
  if (!cache.has(key)) cache.set(key, build(trail));
  return cache.get(key)!;
}
function build(trail: Trail): Briefing | null {
  const movement = trail.kind === 'words' ? movementTip(trail) : null;
  const authored = BRIEFINGS[trail.id];
  // Roots keeps its authored steps; the movement step joins as step 2 (CURR-52).
  if (authored) return movement ? { ...authored, tips: [authored.tips[0]!, movement, ...authored.tips.slice(1)] } : authored;
  if (trail.shift) return { ...shiftBriefing(), badge: 'New keys', required: true };
  if (!trail.newKeys) return null;
  // Letter lessons: press each new key with its finger, see what the lesson builds toward, then keep it light.
  if (movement) return brief(trail.name, 'Meet the movement before expecting yourself to remember it.',
    tip('hand', 'Find each key deliberately', [...trail.newKeys].map(k => `[${k}] uses your {${k}}.`).join(' ') + ([...trail.newKeys].some(isShifted) ? SHIFT_NOTE : ''), trail.newKeys, trail.newKeys),
    movement,
    tip('feather', 'Small and comfortable', 'Allow an easy hand adjustment. Keep the press light; pause if you notice tension. Slow, accurate practice counts fully.'));
  return brief(trail.name, 'Meet the movement before expecting yourself to remember it.',
    ...[...trail.newKeys].reduce<string[]>((chunks, k, i) => { if (i % 2 === 0) chunks.push(k); else chunks[chunks.length - 1] += k; return chunks; }, []).slice(0, 3).map(ks => tip('hand', 'Find each key deliberately', [...ks].map(k => `[${k}] uses your {${k}}.`).join(' ') + ([...ks].some(isShifted) ? SHIFT_NOTE : ''), ks)),
    tip('feather', 'Small and comfortable', 'Allow an easy hand adjustment. Keep the press light; pause if you notice tension. Slow, accurate practice counts fully.'));
}
export const briefedTrails = (): string[] => Object.keys(BRIEFINGS);
