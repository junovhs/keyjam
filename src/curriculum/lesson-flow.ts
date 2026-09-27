import type { StageName, Trail } from './types';
import { fingerOf, handOf } from './method';
import { headlineOf } from './headline';

/** A finite visible step; guided discovery is separate from assessed performance. */
export interface LessonExercise {
  name: string;
  stage: StageName;
  format: 'movement' | 'words' | 'passage';
  instruction: string;
  length: number;
  assessment?: 'guided';
  guidedKeys?: string;
  text?: string;
  guidance?: 'on-demand';
  /** Earlier movements receiving deliberate attention again in this exercise. */
  focusKeys?: string;
  /** A transition loop (spec B1): the one technical transition this exercise isolates, from movements.ts. */
  target?: string;
  /** Steady beat (spec B2): the loop typed to a soft pulse at the learner's own pace, judged for evenness only. */
  beat?: true;
}
/** Spec B1: the target both ways with a rest between — `ed de ded ed de ded …` — only its two letters and spaces, about `len` characters. */
export function transitionLoop(target: string, len: number): string {
  const [a, b] = [target[0]!, target[1]!];
  const units = [a + b, b + a, a + b + a];
  let text = '';
  for (let i = 0; text.length + units[i % 3]!.length + 1 <= len + 1; i++) text += (text ? ' ' : '') + units[i % 3];
  return text;
}

const move = (name: string, stage: StageName, instruction: string, length = 24): LessonExercise => ({ name, stage, format: 'movement', instruction, length });
const use = (name: string, format: 'words' | 'passage', instruction: string, length: number, independent = false): LessonExercise => ({ name, stage: 'words', format, instruction, length, ...(independent ? { guidance: 'on-demand' as const } : {}) });
const ROW = (k: string): string => 'qwertyuiop'.includes(k) ? 'top row' : 'zxcvbnm'.includes(k) ? 'bottom row' : 'home row';
/** Spec B1: a target typed both ways with a rest between, assessed, no speed. The line names the mechanics under the active
 * method, never the finger used (DEC-15). Any two-letter movement: a technical target or a lesson's headline (CURR-50). */
export function loop(target: string): LessonExercise {
  if (!/^[a-z]{2}$/.test(target) || target[0] === target[1]) throw new Error(`Not a two-letter movement: ${target}`);
  const [a, b] = [target[0]!, target[1]!];
  const [fa, fb] = [fingerOf(a), fingerOf(b)];
  const rows = ROW(a) === ROW(b) ? `along the ${ROW(a)}` : `${ROW(a)} to ${ROW(b)}`;
  const how = fa === fb ? `Same finger, ${rows}. Let the finger travel; do not reset to its home key between.`
    : fa && fb && handOf(fa) === handOf(fb) ? `Two fingers of one hand, ${rows}. Let the second finger prepare while the first presses.`
      : `Alternate hands, ${rows}. Let one hand prepare while the other presses.`;
  return { name: `Connect [${a}] and [${b}]`, stage: 'mix', format: 'movement', instruction: how, length: 24, target, focusKeys: target };
}
/** Spec B2: the same phrase to a quiet pulse; guided (DEC-11) — finishing is completing — and judged only for evenness. */
export function beat(target: string): LessonExercise {
  const text = transitionLoop(target, 24);
  return { name: 'Keep it even', stage: 'mix', format: 'movement', instruction: 'A quiet pulse at your own pace. Land each press near it; nothing is timed and nothing is scored.', length: text.length, assessment: 'guided', guidedKeys: target, text, target, focusKeys: target, beat: true };
}
const guide = (name: string, keys: string, text: string, instruction: string, format: LessonExercise['format'] = 'movement'): LessonExercise => ({ name, guidedKeys: keys, text, instruction, assessment: 'guided', stage: 'drill', format, length: text.length });

/** Small planned visits preview the next keys (R U, V M) or widen early language (H N); never random novelty. Later lessons
 * have none: the lesson 1 tour already shows the whole instrument, and a visit must serve its lesson (CURR-50). */
const VISITS: Readonly<Record<string, LessonExercise>> = {
  anchors: guide('Visit the upper row', 'ru', 'rruururu', '[r] uses your {r}; [u] your {u}. Find each slowly. A small hand adjustment is welcome.'),
  'inner-pair': guide('Visit the lower row', 'vm', 'vvmmvmvm', '[v] uses your {v}; [m] your {m}. Let the next finger prepare while the other presses.'),
  'middle-up': guide('A little more language', 'hn', 'hi hi in in', 'Meet [h] with your {h} and [n] with your {n}. Try hi and in with the guide; this whole step has no score.', 'words'),
};

/** A new-key lesson's headline movement without a per-learner pick: lesson 3 meets `ed` (spec C1), others use headlineOf. */
export const defaultHeadline = (t: Trail): string | null => (t.id === 'middle-up' ? 'ed' : headlineOf(t));

/** Slot 2's target and form, chosen per learner by the D5 rule (engine/next-practice); absent = no evidence, the shipped default. */
export interface SlotPick { target: string; form: 'loop' | 'beat' }

/** Passes advance immediately; discovery never adds an accuracy or speed requirement. */
export function lessonExercises(t: Trail, pick?: SlotPick): readonly LessonExercise[] {
  if (t.checkpoint) return [use('Chapter passage', 'passage', 'Read a word ahead. Connect familiar movements at whatever pace stays comfortable.', t.length, t.grove === 'flow')];
  if (t.id === 'anchors') return [
    guide('Find [f] and [j] deliberately', 'fj', 'ffjjfjfj', 'Feel the bumps: [f] with your {f}, [j] with your {j}. Press lightly. There is no score here.'),
    guide('Take a gentle keyboard tour', 'abcdefghijklmnopqrstuvwxyz;', 'asdf gh jkl; qwer ty uiop zxcv bnm', 'A quick map, not a test. Keep [f] and [j] as landmarks; touch each key once with the shown finger. You do not need to remember them yet.'),
    move('Alternate hands', 'mix', 'Let one hand prepare while the other presses. [f] and [j] help you find your bearings.', 16),
    VISITS.anchors!,
    move('Meet [space]', 'words', 'Either thumb presses [space] between these short groups. Take as much time as you need.', 24),
  ];
  if (t.id === 'inner-pair') return [
    guide('Find [d] and [k] deliberately', 'dk', 'ddkkdkdk', '[d] uses your {d}; [k] your {k}. Keep the press small and easy.'),
    { name: 'Connect four fingers', stage: 'mix', format: 'movement', instruction: 'Connect [d]/[k] with [f]/[j]. Prepare the next finger; do not hold the others rigid.', length: 23, text: 'df jk fd kj dfjk kjfd' },
    VISITS['inner-pair']!,
    { name: 'Carry the coordination', stage: 'mix', format: 'movement', instruction: 'Read one short group ahead. Slow, accurate movement counts fully.', length: 31, text: 'dfjk kjfd fdjk jkdf dfkj kjdf' },
  ];
  if (t.newKeys && ['rhythm', 'words'].includes(t.kind)) {
    const names = [...t.newKeys].map(k => k === ' ' ? '[space]' : `[${k}]`).join(' and ');
    const ownership = [...t.newKeys].map(k => `[${k}] uses your {${k}}`).join('; ');
    const visits = VISITS[t.id] ? [VISITS[t.id]!] : [];
    // CURR-50: one headline movement carries the lesson — the D5 technical pick when it touches a new key, else the most
    // common English movement the new letters make. Slot 2 loops it, slot 3's words carry it, slot 4's phrase reuses it.
    // (Words no longer switch to a chunk; ing / nce / ion live in the Flow Bigrams lesson and in ordinary prose.)
    const headline = pick?.target ?? defaultHeadline(t) ?? undefined;
    return [
      guide(`Find ${names} deliberately`, t.newKeys, [...t.newKeys].map(k => k.repeat(2)).join('').repeat(2), `${ownership}. Find each without rushing; use only the pressure you need.`),
      // Spec C3/D5: slot 2 isolates the learner's chosen target; without evidence, lesson 3 still meets `ed` (spec C1) and the
      // first two lessons keep the generic loop.
      pick ? (pick.form === 'beat' ? beat(pick.target) : t.id === 'middle-up' && (pick.target === 'ed' || pick.target === 'de')
        ? { name: 'Middle fingers up and home', stage: 'mix', format: 'movement', instruction: 'Left middle moves [e]↔[d] while right middle moves [i]↔[k]. Keep both movements small and even.', length: 26, target: pick.target, focusKeys: 'edik', text: 'ed ik de ki ed ik de ki ed' }
        : loop(pick.target))
        : t.id === 'middle-up'
          ? { name: 'Middle fingers up and home', stage: 'mix', format: 'movement', instruction: 'Left middle moves [e]↔[d] while right middle moves [i]↔[k]. Keep both movements small and even.', length: 26, target: 'ed', focusKeys: 'edik', text: 'ed ik de ki ed ik de ki ed' }
          : headline ? loop(headline)
          // The slash lesson has no letter to loop: rehearse the real pairs its words and phrase will use.
          : t.newKeys === '/' ? { name: 'Connect the slash', stage: 'mix', format: 'movement', instruction: 'The slash joins two words. Keep the right hand light as it reaches down; let the left prepare the next letter.', length: 28, text: 'yes/no and/or his/her in/out', focusKeys: '/' }
            : move('Connect the movements', 'mix', 'Move between nearby keys with the same finger, then alternate hands. Prepare instead of resetting.', 24),
      { ...use('Carry it into words', 'words', 'See the whole word. Let the next finger prepare while the current one presses.', t.n <= 5 ? 32 : 40), ...(headline ? { target: headline } : {}) },
      ...visits,
      // Lesson 3's phrase is already built from its own words (did, fed, if, kid); its E/D phrases would tip it left-handed.
      { ...use('A small phrase', 'passage', 'Connect the word to the next. Pause between words when you need to; there is no hurry.', t.n === 3 ? 32 : 48), ...(headline && t.id !== 'middle-up' ? { target: headline } : {}) },
    ];
  }
  if (t.newKeys || t.shift) {
    const keys = t.shift ? 'FfJj' : t.newKeys;
    const introduction = t.shift ? 'fFjJ fFjJ' : [...keys].map(k => k + k).join(' ');
    return [
      guide('Find the movement deliberately', keys, introduction, t.shift
        ? 'For [F] your right pinky holds right [shift]; for [J] your left pinky holds left [shift]. Hold Shift first, press the letter, release both.'
        : 'Try each new key slowly. The guide names its finger and any opposite-hand Shift. Adjust the hand comfortably.'),
      use('Use it in context', 'words', 'Connect the movement to a useful word, number or expression. Accuracy has no minimum speed.', Math.min(48, t.length)),
      use('Put it to work', 'passage', 'Read ahead and prepare the next movement. Pause whenever the hands need to soften.', t.length),
    ];
  }
  const independent = t.grove === 'flow';
  const exercises = [
    use(t.id === 'bigrams' ? 'Connect common sequences' : 'Connect familiar words', 'words', t.id === 'bigrams'
      ? 'Meet th, he, in and other common sequences inside words. Let the next movement follow without a reset.'
      : 'Practice a word as a small connected phrase. Keep each press light and deliberate.', Math.min(60, t.length)),
    use(independent ? 'Write with less guidance' : 'Put it to work', 'passage', independent
      ? 'Read the words and recall their movements. Finger hints start hidden; show them whenever they help. There is no speed target.'
      : 'Connect familiar movements in a meaningful passage. Choose a pace that lets your hands stay comfortable.', t.length, independent),
  ];
  return t.id === 'index-stretch-down' ? exercises.map(e => ({ ...e, focusKeys: 'cvbnm' })) : exercises;
}
