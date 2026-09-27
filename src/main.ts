import { lessonExercises, type LessonExercise, type SlotPick } from './curriculum/lesson-flow';
import { nextPractice } from './engine/next-practice';
import { beatInterval, evenness, onBeat } from './engine/beat';
import { demoSchedule, demoStepMs, type DemoStep } from './engine/demo';
import { PACE_NOTE, notePace, paceFactor, paceNoteApplies, typedFast } from './engine/pace';
import { briefingFor, type BriefIcon, type Briefing } from './curriculum/briefings';
import { fingerPractice, completeFingerPage, FINGER_PAGES, type FingerPractice, type SideScore } from './engine/finger-practice';
import type { Stop } from './curriculum/stops';
import { fingerLevels, pairCompleted, FINGER_PASS_ACC, type FingerPair } from './curriculum/finger-course';
import { MAIN_TRAILS, trailById, allowedChars, gateFor, groveOf, renderCopy, resolveCopy, trailsInGrove, type StageName, type Trail } from './curriculum';
import { fingerById, fingerForKey, remedialText } from './curriculum/fingers';
import { METHODS, activeMethod, baseKey, fingerOf, isShifted, reassignedKeys, setMethod } from './curriculum/method';
import { KeyModel, MASTERED } from './engine/keymodel';
import { TransitionModel } from './engine/transitions';
import { decide, sessionReview, type Decision } from './engine/coach';
import { missedTarget, classifyRun, rollTally } from './engine/errors';
import { STOPS } from './curriculum/stops';
import { applyRun, blockingStop, currentStage, pendingStop, stopDone, currentTrail, exerciseIndex, focusKeys, isCleared, pathIndex, pathLength, progressOf, type Outcome } from './engine/progress';
import { Run } from './engine/run';
import { accOf } from './engine/scoring';
import { recordPerformance } from './engine/learning';
import { attemptPrompts, classifyPreparation, wordBigrams, type TracedRun } from './engine/preparation';
import { KEEPSAKES, courseComplete, fingerCharmAt, keepsakeFor, ownedKeepsakes, type Keepsake } from './engine/keepsakes';
import { spawnCharm } from './ui/charm-fx';
import { objectArt, collectionHtml } from './ui/scene';
import './ui/journey.css';
import { generate, generateDrill } from './engine/textgen';
import { clear as clearStored, fresh, load, loadGuest, saveGuest, sanitize, save as persist, type SaveV6 } from './state/save';
import { $, escapeHtml, toast } from './ui/dom';
import { createAccount } from './ui/account';
import { createProgressSync, type SyncStatus } from './state/progress-sync';
import { hasStoredSession, shippedConfig } from './state/supabase';
import { mountPanel, type PanelHandle } from 'dopedocs/panel';
import { docs } from './docs-content';
import './docs.css';
import { renderMap } from './ui/map';
import { sound, wireAudioToggle, type CueName } from './ui/sound';
import { loadHands, onFingerHover, paintHand, pulseFinger } from './ui/hands';
import { CanvasPrompt } from './render/prompt';
import { selfTest as textflowSelfTest } from './render/textflow';

/** What the current run is for: the trail itself, a finger drill, or a coach drill (confusion / reach / review). */
/** `slow`: the exercise just finished, replayed once as guided practice from the pace note (PACE-03); not a separate screen. */
type Mode = { kind: 'trail' } | { kind: 'remedial'; pair: FingerPair; level: number; stop: Stop } | { kind: 'coach'; decision: Decision } | { kind: 'explore'; key: string } | { kind: 'slow'; text: string };

// Guests have a separate durable save. Account state never leaks into a
// signed-out session; first signup carries the current guest course forward.
const accountService = shippedConfig();
let signedIn = accountService !== null && hasStoredSession(accountService);
let state: SaveV6 = signedIn ? load() : loadGuest();
if (!signedIn) clearStored();
setMethod(state.settings.method);

/**
 * Dev-only experience journal. Add ?dev=1 to any build to keep an exact, session-scoped
 * record of the prompts shown and the strokes/results produced. Nothing is sent anywhere.
 * Console: keyjam.dev.report() / keyjam.dev.clear()
 */
const devTraceEnabled = new URLSearchParams(location.search).has('dev');
const DEV_TRACE_KEY = 'keygrove.dev-runs.v1';
const devRuns: unknown[] = (() => {
  if (!devTraceEnabled) return [];
  try { const x = JSON.parse(sessionStorage.getItem(DEV_TRACE_KEY) ?? '[]'); return Array.isArray(x) ? x : []; }
  catch { return []; }
})();
function devHandLoad(text: string): { left: number; right: number; thumb: number; unknown: number } {
  const out = { left: 0, right: 0, thumb: 0, unknown: 0 };
  for (const ch of text) {
    const f = fingerOf(ch.toLowerCase());
    if (!f) out.unknown++;
    else if (f === 'thumb') out.thumb++;
    else if (f.startsWith('l')) out.left++;
    else if (f.startsWith('r')) out.right++;
    else out.unknown++;
  }
  return out;
}
/** Bigrams of the current prompt the learner already had evidence for when it appeared (typing records as it goes). */
let devKnownAtStart: Set<string> = new Set();
function devPreparation(lessonId: string, index: number, text: string) {
  const warmed = new Set(attemptPrompts(devRuns as TracedRun[], lessonId, index).flatMap(wordBigrams));
  return classifyPreparation(text, warmed, devKnownAtStart);
}
function devRecord(record: Record<string, unknown>): void {
  if (!devTraceEnabled) return;
  devRuns.push(record);
  try { sessionStorage.setItem(DEV_TRACE_KEY, JSON.stringify(devRuns)); } catch { /* console trace still works */ }
  console.info('[KeyJam dev run]', record);
}
function devReport(): string {
  return JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), method: activeMethod().id, runs: devRuns }, null, 2);
}
function clearDevReport(): void {
  devRuns.length = 0;
  try { sessionStorage.removeItem(DEV_TRACE_KEY); } catch { /* no-op */ }
}

/** Keep the current course durable, including during an optional replay. */
function store(): void { const copy = replayReturn ? { ...state, trail: replayReturn } : state; if (signedIn) persist(copy); else saveGuest(copy); }
let keys = KeyModel.fromJSON(state.keys, state.confusions);
let trans = TransitionModel.fromJSON(state.transitions);
let mode: Mode = { kind: 'trail' };
let run = new Run('');
let outcome: Outcome | null = null;
let practice: FingerPractice | null = null;
/** The finger stop page being typed (0-based): each page is judged and saved on its own. */
const stopPageIndex = (): number => mode.kind !== 'remedial' || stopDone(state, mode.stop) ? 0 : Math.min(state.stopPages[mode.stop.id] ?? 0, FINGER_PAGES - 1);
const stopPage = () => stopPageIndex() + 1;
let fingerPassed = false;
let pagePassed = false;
/** Coach decisions for the run just finished: [0] may be required (blocks Continue). */
let decisions: Decision[] = [];
/** A required decision the player still has to act on before the next trail run. */
let gate: Decision | null = null;
let replayReturn: string | null = null;
let completionHome = false;
let runTrail = currentTrail(state);
let runStage: StageName = 'drill';
/** Slot 2's target for the lesson in progress, chosen once so it holds across the lesson's exercises (spec D5). */
let slotPick: { trail: string; pick: SlotPick | null } | null = null;
const pickFor = (t: Trail): SlotPick | undefined => {
  if (!slotPick || slotPick.trail !== t.id) slotPick = { trail: t.id, pick: nextPractice(trans, new Set([...allowedChars(t)].filter((k) => k.length === 1 && k === k.toLowerCase())), Date.now(), t.newKeys) };
  return slotPick.pick ?? undefined;
};
let runExercise: LessonExercise = lessonExercises(runTrail, pickFor(runTrail))[0]!;
/** Steady beat (spec B2): a soft pulse at the learner's own pace while a beat exercise is on screen; nothing is timed against it. */
let pulse: { timer: number; t0: number; interval: number } | null = null;
function startPulse(): void {
  stopPulse();
  if (mode.kind !== 'trail' || !runExercise.beat) return;
  const interval = beatInterval(trans.reference()), t0 = performance.now();
  const dot = $('beatDot'); dot.hidden = false; dot.style.setProperty('--fill', '0');
  const tick = () => { sound.play('step', 0.6); dot.classList.remove('tick'); void dot.offsetWidth; dot.classList.add('tick'); };
  pulse = { timer: window.setInterval(tick, interval), t0, interval };
}
function stopPulse(): void { if (pulse) window.clearInterval(pulse.timer); pulse = null; $('beatDot').hidden = true; }
let runExerciseIndex = 0;
let beforeMastery: Record<string, number> = {};
/** The briefing being read before this run, if any; `seenBriefs` keeps each exercise to one briefing per session. */
let brief: { briefing: Briefing; step: number; pressed: Set<string> } | null = null;
const seenBriefs = new Set<string>();
let helpVisible = true;
const guided = () => mode.kind === 'explore' || mode.kind === 'slow' || (mode.kind === 'trail' && runExercise.assessment === 'guided');
const actionable = (d: Decision) => !['rushing', 'fatigue', 'steady', 'reach'].includes(d.kind);
const courseFrontier = () => MAIN_TRAILS.find(t => !isCleared(state, t.id)) ?? MAIN_TRAILS.at(-1)!;

const now = () => performance.now();
const arena = () => $('arena');
const settingsModal = () => $('settingsModal');
const trail = (): Trail => currentTrail(state);
const stageName = () => currentStage(state, keys);
const fingerLevel = () => mode.kind === 'remedial' ? fingerLevels(fingerById(mode.pair.sides[0])!)[mode.level]! : null;
const practiceAllowed = () => mode.kind === 'remedial' || guided() ? new Set(run.text) : allowedChars(runTrail);
const focusPair = (): FingerPair | null => (mode.kind === 'remedial' ? mode.pair : null);

function save(): void { const j = keys.toJSON(); state.keys = j.keys; state.confusions = j.confusions; state.transitions = trans.toJSON(); store(); sync.wrote(); }
/** Account adoption resets the active passage so strokes from two accounts never mix. */
function adopt(next: SaveV6): void {
  state = next; keys = KeyModel.fromJSON(state.keys, state.confusions); trans = TransitionModel.fromJSON(state.transitions); slotPick = null; gate = null; replayReturn = null; setMethod(state.settings.method); store(); syncSettingsUi();
  mode = { kind: 'trail' }; resetRun(); if (courseComplete(state)) showCompletion();
}

const unlockedLetters = () => [...allowedChars(trail())].filter((k) => k.length === 1 && k !== ' ' && k === k.toLowerCase());
const dueNow = () => new Set(keys.dueKeys([...allowedChars(trail())].filter((k) => k.length === 1 && k !== ' ' && k === k.toLowerCase()), Date.now()));
function makeText(): string {
  const allowed = allowedChars(trail());
  if (mode.kind === 'explore') return mode.key === ' ' ? '   ' : mode.key.repeat(2) + ' ' + mode.key.repeat(2);
  if (mode.kind === 'slow') return mode.text;
  if (mode.kind === 'remedial') {
    practice = fingerPractice(mode.pair, mode.level, state.fingerCourses, { known: new Set(MAIN_TRAILS.filter(t => isCleared(state, t.id)).flatMap(t => [...t.newKeys])), page: stopPageIndex() });
    return practice.text;
  }
  if (mode.kind === 'coach') {
    const d = mode.decision;
    if (d.kind === 'remedial') { const f = fingerForKey(d.keys[0] ?? 'f'); return f && 'keys' in f ? remedialText(f, allowed, 30) : generate(trail(), 'drill'); }
    return generateDrill(d.kind === 'confusion' ? 'confusion' : d.kind === 'reach' ? 'reach' : d.kind === 'transition' ? 'transition' : 'review', d.keys, trail());
  }
  return generate(trail(), stageName(), { exercise: runExercise, heat: keys.heatMap(Date.now(), dueNow()), pairHeat: trans.heatMap(unlockedLetters()), weakPairs: trans.weakest(unlockedLetters()).filter((w) => w.mastery < 0.6).slice(0, 8).map((w) => w.pair) });
}
function resetRun(): void {
  completionHome = false;
  // DEC-19: a finger stop placed before the current lesson runs first; Continue always passes through it.
  const due = mode.kind === 'trail' && !replayReturn ? pendingStop(state) : null;
  if (due) mode = { kind: 'remedial', pair: due.pair, level: due.level, stop: due };
  $('result').querySelector<HTMLElement>('.score')!.hidden = false;
  runTrail = trail(); runStage = stageName();
  runExerciseIndex = exerciseIndex(state); runExercise = lessonExercises(runTrail, pickFor(runTrail))[runExerciseIndex]!;
  beforeMastery = Object.fromEntries([...allowedChars(runTrail)].map(k => [k.toLowerCase(), keys.mastery(k)]));
  startPulse();
  practice = null; fingerPassed = false; pagePassed = false;
  helpVisible = mode.kind !== 'trail' || runExercise.guidance !== 'on-demand';
  run = new Run(makeText()); outcome = null; decisions = [];
  if (devTraceEnabled) devKnownAtStart = new Set(wordBigrams(run.text).filter((g) => (trans.stat(g)?.seen ?? 0) > 0));
  $('nextAction').textContent = 'Continue';
  $('skipPractice').hidden = mode.kind === 'trail' || mode.kind === 'remedial';
  $('skipPractice').textContent = 'Back to my course';
  document.body.classList.remove('showing-result');
  arena().classList.remove('result-mode'); endBrief(); render(); $('lessonTitle').focus();
  if (mode.kind === 'trail') openBrief();
  if (mode.kind === 'slow') startDemo(); else stopDemo();
}
/** Switch into a coach drill (required or accepted offer). */
function startCoach(d: Decision): void { mode = { kind: 'coach', decision: d }; resetRun(); toast(d.title); }

// ---- rendering -------------------------------------------------------------
function header(): void {
  const t = runTrail, g = groveOf(t);
  if (mode.kind === 'explore') {
    $('route').innerHTML = ''; $('lessonNo').textContent = 'Your whole keyboard'; $('modeLabel').textContent = 'Guided exploration'; return;
  }
  $('route').innerHTML = trailsInGrove(g.id).map(x => '<i class="' + (x.id === t.id ? 'current' : isCleared(state, x.id) ? 'done' : '') + '"></i>').join('');
  // A woven finger stop sits on the chapter's route, just before the lesson it opens (DEC-20).
  if (mode.kind === 'remedial') { $('lessonNo').textContent = `Finger stop · Level ${mode.level + 1} of 10 · Page ${stopPage()} of ${FINGER_PAGES}`; $('modeLabel').textContent = `${g.name} · Chapter ${g.n}`; return; }
  $('lessonNo').textContent = `Lesson ${pathIndex(t)} of ${pathLength(t)} · Exercise ${runExerciseIndex + 1}/${lessonExercises(t).length}`;
  $('modeLabel').textContent = mode.kind === 'trail' ? `${g.name} · Chapter ${g.n}` : 'A little practice';
}
function labels(): void {
  const t = runTrail, g = groveOf(t), f = focusPair();
  $('lessonTitle').textContent = f ? f.name + ' · ' + fingerLevel()!.name : mode.kind === 'coach' ? mode.decision.title : mode.kind === 'slow' ? 'Practise slowly' : t.name;
  $('lessonCopy').innerHTML = renderCopy(f ? fingerLevel()!.instruction + (practice?.helperKeys.length ? ` New helper keys: ${practice.helperKeys.join(' ').toUpperCase()}. Try their short introduction first; the hand guide shows which fingers to use.` : '') : mode.kind === 'coach' ? mode.decision.reason : mode.kind === 'slow' ? SLOW_COPY : runExercise.instruction);
  $('summaryLabel').textContent = replayReturn ? 'A familiar place' : 'This passage';
  $('focusName').innerHTML = renderCopy(mode.kind === 'trail' ? replayReturn ? 'Replay · your course is waiting' : `${runExerciseIndex + 1}/${lessonExercises(t).length} · ${runExercise.name}` : 'Short practice · then your course');
  $('gateLabel').textContent = mode.kind !== 'trail' ? 'No test here' : t.checkpoint ? 'Chapter passage' : 'Accuracy before speed';
  $('focusInstruction').textContent = mode.kind === 'trail' ? `${t.checkpoint ? 97 : gateFor(t).passAcc}% accuracy · at your pace` : 'No passing score · just a little familiarity';
  if (f) {
    $('focusName').textContent = 'Practice adapts to the movements that need attention';
    $('gateLabel').textContent = 'Accuracy before speed';
    $('focusInstruction').textContent = `${FINGER_PASS_ACC}% for each finger · at your pace`;
  }
  if (guided()) {
    $('gateLabel').textContent = 'Guided · no score';
    $('focusInstruction').textContent = 'Try each movement slowly. Pauses and corrections are welcome.';
  }
  if (mode.kind === 'explore') {
    $('lessonTitle').textContent = 'Meet ' + (mode.key === ' ' ? 'Space' : mode.key.toUpperCase());
    $('lessonCopy').textContent = 'Choose any key below. The guide shows its finger. Press lightly; let your hand adjust comfortably.';
    $('focusName').textContent = 'A small movement, at your pace';
  }
  $('exploreKeyboard').textContent = mode.kind === 'explore' ? 'Back to my lesson' : 'Explore the keyboard';
  $<HTMLButtonElement>('exploreKeyboard').disabled = run.status === 'playing' && mode.kind !== 'explore';
  $('guideToggle').hidden = guided() || !!brief;
  $('guideToggle').textContent = helpVisible ? 'Hide finger hints' : 'Show finger hints';
  $('guideToggle').setAttribute('aria-pressed', String(helpVisible));
  $('skipGuided').hidden = mode.kind !== 'trail' || !guided() || !!brief;
  $('beginCue').classList.toggle('gone', run.status !== 'idle' || !!brief);
  $('beginCue').textContent = mode.kind === 'trail' ? 'Begin typing when you\'re ready · any key'
    : mode.kind === 'remedial' ? `Page ${stopPage()} of ${FINGER_PAGES} · begin typing when you're ready`
    : 'Begin typing when you\'re ready · a short practice';
}
const useDom = new URLSearchParams(location.search).get('dom') === '1';
const canvasPrompt: CanvasPrompt | null = useDom ? null : new CanvasPrompt($('prompt'), { theme: 'dark', compact: true, orb: false });
function prompt(): void {
  if (canvasPrompt) { canvasPrompt.set({ text: run.text, pos: run.pos, wrong: run.wrong, reading: (mode.kind === 'remedial' ? mode.level >= 3 : runStage === 'words') && run.text.length > 50 }); return; }
  const p = $('prompt'); p.innerHTML = '';
  [...run.text].forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c === ' ' ? 'SPACE' : c;
    s.className = 'ch' + (c === ' ' ? ' space' : '') + (i < run.pos ? ' done' : '') + (i === run.pos ? ' current' : '') + (i === run.pos && run.wrong ? ' wrong' : '');
    p.appendChild(s);
  });
  p.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
}
function metrics(): { wpm: number; acc: number; pct: number } {
  const m = run.metrics(now());
  if (mode.kind === 'remedial' && run.text) m.pct = Math.round(((stopPageIndex() + run.pos / run.text.length) / FINGER_PAGES) * 100);
  setText($('wpm'), String(m.wpm)); setText($('acc'), guided() ? 'No score' : m.acc + '%'); setText($('pct'), m.pct + '%');
  const combo = $('combo');
  if (combo.textContent !== String(run.combo)) { combo.textContent = String(run.combo); if (run.combo > 0 && run.combo % 10 === 0) { combo.classList.remove('tick'); void combo.offsetWidth; combo.classList.add('tick'); } }
  const fill = document.getElementById('progressFill'), scale = `scaleX(${m.pct / 100})`; if (fill && fill.style.transform !== scale) fill.style.transform = scale;
  return m;
}
/**
 * Keystrokes write only what changed (PERF-02): a same-value write still invalidates style and layout. Text goes
 * through setText; hint HTML through setHtml, which remembers what it last wrote to each element.
 */
function setText(el: HTMLElement, text: string): void { if (el.textContent !== text) el.textContent = text; }
const shownHtml = new WeakMap<Element, string>();
function setHtml(el: HTMLElement, html: string): void { if (shownHtml.get(el) === html) return; el.innerHTML = html; shownHtml.set(el, html); }
let fingerLabelEls: HTMLElement[] | null = null;
const fingerLabels = () => fingerLabelEls ??= [...document.querySelectorAll<HTMLElement>('[data-finger-label]')];
/** Badges above the hands: the active finger shows the key it is being asked for; the rest show their home keys. */
function badges(active: Partial<Record<string, string>>): void {
  for (const x of fingerLabels()) {
    const id = x.dataset.fingerLabel!, key = active[id];
    if (x.classList.contains('active') !== (key !== undefined)) x.classList.toggle('active', key !== undefined);
    setText(x, (key ?? fingerById(id)?.anchor ?? x.textContent ?? '').toUpperCase());
  }
}
function nextVisual(): void {
  if (brief) { paintBrief(); return; }
  if (!helpVisible && !guided() && run.status !== 'complete') {
    badges({}); paintHand('left', null); paintHand('right', null);
    setHtml($('handInstruction'), 'Prepare the next movement. Finger hints are here whenever you want them.'); setText($('nextCue'), ''); return;
  }
  const c = run.current, f = fingerForKey(c);
  badges(f && 'anchor' in f && c !== ' ' ? { [f.id]: baseKey(c) } : {});
  const shifted = isShifted(c);
  if (c === ' ') {
    paintHand('left', 'thumb'); paintHand('right', 'thumb');
    setHtml($('handInstruction'), 'Press with either thumb.');
  } else if (f) {
    paintHand('left', f.id); paintHand('right', f.id);
    const shiftNote = shifted && 'hand' in f ? ` · hold ${f.hand === 'left' ? 'right' : 'left'} [shift]` : '';
    const anchor = 'anchor' in f && f.anchor !== c.toLowerCase() ? ` · landmark [${f.anchor}]` : '';
    setHtml($('handInstruction'), '<strong>' + escapeHtml(f.full) + '</strong>' + renderCopy(anchor + shiftNote));
  } else {
    paintHand('left', null); paintHand('right', null);
    setHtml($('handInstruction'), run.status === 'complete' ? 'Run complete.' : 'Let your hands rest comfortably.');
  }
  setText($('nextCue'), '');
}
/** Key pitch (cap + gap) measured from the number row, so the stagger tracks every responsive cap size. Build and resize only. */
function measurePitch(): void {
  const [a, b] = $('keymap').querySelectorAll<HTMLElement>('.keyrow:first-child .keycap');
  const u = a && b ? b.getBoundingClientRect().left - a.getBoundingClientRect().left : 0;
  if (u > 0) $('keymap').style.setProperty('--u', `${u}px`);
}
window.addEventListener('resize', measurePitch);
/** The layout the keymap was last built for (explore mode and the familiar keys); a keystroke never changes it. */
let keymapBuilt = '';
/** The cap currently showing a shifted label (e.g. "A" → the passage's "A" or "!"), to restore when the key moves on. */
let keymapLabelled: HTMLElement | null = null;
const capLabel = (k: string) => k === ' ' ? 'SPACE' : k.toUpperCase();
/**
 * The on-screen keyboard. It is built once per layout (PERF-02); after that a keystroke only moves the `hot` class,
 * the shifted label and the shift caps, touching the two or three caps that change instead of rebuilding fifty.
 */
function keymap(): void {
  const map = $('keymap');
  const focused = new Set([...practiceAllowed()].map(baseKey));
  const layout = `${mode.kind === 'explore'}|${[...focused].sort().join('')}`;
  if (layout !== keymapBuilt || !map.firstElementChild) {
    const homes = new Set('fj');
    const rows = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
    const cap = (k: string): string => {
      const classes = `keycap ${homes.has(k) ? 'home ' : ''}${focused.has(k) ? 'familiar ' : ''}${k === ' ' ? ' spacebar' : ''}`;
      return mode.kind === 'explore'
        ? `<button type="button" class="${classes}" data-key="${escapeHtml(k)}" aria-label="Explore ${escapeHtml(k === ' ' ? 'Space' : k.toUpperCase())}">${escapeHtml(capLabel(k))}</button>`
        : `<span class="${classes}" data-key="${escapeHtml(k)}">${escapeHtml(capLabel(k))}</span>`;
    };
    // Real ANSI stagger, in key pitch from the backtick's left edge: Tab 1.5u, Caps 1.75u, Shift 2.25u.
    const stagger = [0, 1.5, 1.75, 2.25];
    map.innerHTML = rows.map((r, i) => `<div class="keyrow" style="--row-offset:calc(var(--u, 0px) * ${stagger[i]})">${[...r].map(cap).join('')}</div>`).join('')
      + `<div class="keyrow"><span class="keycap shiftcap" data-shift="r">⇧</span>${cap(' ')}<span class="keycap shiftcap" data-shift="l">⇧</span></div>`;
    keymapBuilt = layout; keymapLabelled = null;
    measurePitch();
  }
  const c = baseKey(run.current), shifted = isShifted(run.current), show = helpVisible || guided();
  const hot = new Set<Element>();
  const target = show ? map.querySelector<HTMLElement>(`[data-key="${CSS.escape(c)}"]`) : null;
  if (target) hot.add(target);
  const side = show && shifted ? fingerForKey(run.current)?.id[0] : undefined;
  // The opposite hand holds Shift: a right-hand key lights the left Shift, drawn first in the row.
  const shiftCap = side ? map.querySelector(`[data-shift="${side}"]`) : null;
  if (shiftCap) hot.add(shiftCap);
  for (const el of map.querySelectorAll('.keycap.hot')) if (!hot.has(el)) el.classList.remove('hot');
  for (const el of hot) if (!el.classList.contains('hot')) el.classList.add('hot');
  const label = target && shifted ? run.current : null;
  if (keymapLabelled && (keymapLabelled !== target || !label)) { setText(keymapLabelled, capLabel(keymapLabelled.dataset.key!)); keymapLabelled = null; }
  if (target && label) { setText(target, label); keymapLabelled = target; }
}
// Hover and explore clicks are delegated once, not rebound to every cap on every build.
{
  const capOf = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('#keymap [data-key]') ?? null;
  $('keymap').addEventListener('pointerover', (e) => { const el = capOf(e); if (el && !el.contains(e.relatedTarget as Node | null)) peekKey(el.dataset.key!); });
  $('keymap').addEventListener('pointerout', (e) => { const el = capOf(e); if (el && !el.contains(e.relatedTarget as Node | null)) peekKey(null); });
  $('keymap').addEventListener('click', (e) => { const el = capOf(e); if (el && mode.kind === 'explore') { mode = { kind: 'explore', key: el.dataset.key! }; resetRun(); } });
}
/** Hovering a keycap paints its finger; hovering a finger lights its keys. Null restores the live state. */
function peekKey(k: string | null): void {
  if (k === null) { nextVisual(); return; }
  const f = fingerForKey(k);
  badges({});
  if (!f) return;
  paintHand('left', f.id); paintHand('right', f.id);
  if ('anchor' in f && k !== ' ') badges({ [f.id]: k });
}
function peekFinger(id: string | null): void {
  $('keymap').querySelectorAll('.keycap.peek').forEach((x) => x.classList.remove('peek'));
  if (id === null) { nextVisual(); return; }
  const f = fingerById(id);
  paintHand('left', id); paintHand('right', id);
  const keys = id === 'thumb' ? [' '] : f ? [...f.keys] : [];
  $('keymap').querySelectorAll<HTMLElement>('[data-key]').forEach(el => { if (keys.includes(el.dataset.key!)) el.classList.add('peek'); });
}
onFingerHover(peekFinger);
$('practiseSlowly').onclick = practiseSlowly;
$('replayDemo').onclick = startDemo;
/** A finger named in lesson copy (UI-14): pointer hover or keyboard focus shows it on the hands, with its nail pulsing. */
function peekFingerRef(e: Event, on: boolean): void {
  const ref = (e.target as Element | null)?.closest?.<HTMLElement>('.finger-ref');
  if (!ref) return;
  const related = (e as FocusEvent | PointerEvent).relatedTarget as Node | null;
  if (!on && related && ref.contains(related)) return;
  const id = on ? ref.dataset.finger ?? null : null;
  peekFinger(id); pulseFinger(id);
}
document.addEventListener('pointerover', (e) => peekFingerRef(e, true));
document.addEventListener('pointerout', (e) => peekFingerRef(e, false));
document.addEventListener('focusin', (e) => peekFingerRef(e, true));
document.addEventListener('focusout', (e) => peekFingerRef(e, false));
function render(): void { header(); labels(); prompt(); metrics(); keymap(); nextVisual(); if (brief) renderBrief(); }

// ---- briefing: a few steps before a lesson, read one at a time ------------------
const BRIEF_ICONS: Record<BriefIcon, string> = {
  hand: '<svg viewBox="0 0 24 24"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v4m0-2a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L3 14.5a1.6 1.6 0 0 1 2.6-1.8L9 15.5"/></svg>',
  bumps: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M9 15.5h6"/><path d="M12 9.5v.01"/></svg>',
  anchor: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M3 13h4M17 13h4"/></svg>',
  feather: '<svg viewBox="0 0 24 24"><path d="M20 4c-6 0-11 3-13 9l-3 7 7-3c6-2 9-7 9-13Z"/><path d="M4 20 15 9"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  space: '<svg viewBox="0 0 24 24"><path d="M4 10v4h16v-4"/><path d="M8 17h8"/></svg>',
  rhythm: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-6 3 12 3-9 2 3h5"/></svg>',
  stretch: '<svg viewBox="0 0 24 24"><path d="M12 20V6M8 10l4-4 4 4"/><path d="M6 20h12"/></svg>',
};
/** Open the lesson's briefing before its first exercise, once per lesson per session. */
function openBrief(): void {
  const briefing = briefingFor(runTrail);
  if (!briefing || seenBriefs.has(runTrail.id) || run.status !== 'idle') return;
  brief = { briefing, step: 0, pressed: new Set() };
  arena().classList.add('brief-mode'); document.body.classList.add('brief-open');
  render();
  $('lessonTitle').focus();
}
/** Close the briefing. `read` marks it seen, so only a briefing the learner finished (or skipped) stays away on retries. */
function endBrief(read = false): void {
  if (!brief) return;
  if (read) seenBriefs.add(runTrail.id);
  if (briefTimer) { clearTimeout(briefTimer); briefTimer = null; }
  brief = null;
  arena().classList.remove('brief-mode'); document.body.classList.remove('brief-open');
  $('briefCard').hidden = true;
  $('keymap').querySelectorAll('.keycap.hot').forEach((x) => x.classList.remove('hot'));
}
let briefTimer: ReturnType<typeof setTimeout> | null = null;
const briefTip = () => brief?.briefing.tips[brief.step] ?? null;
/** A press step is waiting for keys the learner has not pressed yet. */
const briefWaiting = (): boolean => { const t = briefTip(); return !!t?.press && [...t.press].some((k) => !brief!.pressed.has(k)); };
function briefNext(): void {
  if (!brief || briefWaiting()) return;
  sound.play('step');
  if (brief.step + 1 < brief.briefing.tips.length) { brief.step++; brief.pressed = new Set(); renderBrief(); paintBrief(); return; }
  endBrief(true); render(); $('lessonTitle').focus();
}
/** A key pressed during a press step: fill its tile; when all are filled, show the check, wait a beat, move on. */
function briefPress(k: string): void {
  const t = briefTip();
  if (!brief || !t?.press || briefTimer) return;
  const key = k.toLowerCase();
  const tile = $('briefKeys').querySelector<HTMLElement>(`[data-brief-key="${key}"]`);
  if (!t.press.includes(key) || brief.pressed.has(key)) { const any = $('briefKeys').querySelector<HTMLElement>('.brief-key:not(.filled)'); any?.classList.remove('miss'); void any?.offsetWidth; any?.classList.add('miss'); sound.play('miss'); return; }
  brief.pressed.add(key);
  tile?.classList.add('filled');
  sound.play('fill', 1, 1 + brief.pressed.size * 0.08);
  paintHand('left', null); paintHand('right', null); paintBrief();
  if (!briefWaiting()) {
    $('briefKeys').insertAdjacentHTML('beforeend', '<span class="brief-check" role="img" aria-label="Done"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></span>');
    sound.play('complete');
    briefTimer = setTimeout(() => { briefTimer = null; briefNext(); }, 900);
  }
}
/** Light the step's keys and paint its fingers on the shared hand illustrations. */
function paintBrief(): void {
  if (!brief) return;
  const t = briefTip()!;
  const ks = [...(t.keys ?? runTrail.newKeys ?? 'fj')];
  // During a press step, only the keys still to press stay lit.
  const lit = t.press ? ks.filter((k) => !brief!.pressed.has(k)) : ks;
  $('keymap').querySelectorAll<HTMLElement>('[data-key]').forEach((el) => el.classList.toggle('hot', lit.includes(el.dataset.key!)));
  const perSide = (side: 'left' | 'right') => lit.map((k) => fingerOf(k)).find((f) => f === 'thumb' || f?.startsWith(side[0]!)) ?? null;
  paintHand('left', perSide('left')); paintHand('right', perSide('right'));
  // Each lit finger's badge shows the key it is being asked for (E above the middle finger, not its home D).
  const active: Partial<Record<string, string>> = {};
  for (const k of lit) { const f = fingerOf(k); if (f && f !== 'thumb' && !active[f]) active[f] = k; }
  badges(active);
  setHtml($('handInstruction'), '');
}
function renderBrief(): void {
  if (!brief) return;
  const { briefing, step } = brief, t = briefTip()!, exs = lessonExercises(runTrail), last = step + 1 === briefing.tips.length;
  $('lessonTitle').textContent = 'Before you begin';
  $('lessonCopy').innerHTML = renderCopy(`${briefing.title} — ${briefing.lead}`);
  $('summaryLabel').textContent = 'This exercise'; $('focusName').innerHTML = renderCopy(`${runExerciseIndex + 1}/${exs.length} · ${runExercise.name}`);
  const nextEx = exs[runExerciseIndex + 1];
  $('gateLabel').textContent = 'Next up'; $('focusInstruction').innerHTML = renderCopy(nextEx ? `${runExerciseIndex + 2}/${exs.length} · ${nextEx.name}` : 'Lesson complete');
  $('briefCount').textContent = `${step + 1}/${briefing.tips.length}`;
  $('briefDots').innerHTML = briefing.tips.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('');
  $('briefIcon').innerHTML = BRIEF_ICONS[t.icon];
  $('briefTitle').innerHTML = renderCopy(t.title); $('briefText').innerHTML = renderCopy(t.body);
  const keysEl = $('briefKeys'), next = $<HTMLButtonElement>('briefNext');
  if (t.press) {
    keysEl.hidden = false; next.hidden = true;
    keysEl.innerHTML = [...t.press].map((k) => `<span class="brief-key" data-brief-key="${escapeHtml(k)}">${escapeHtml(k === ' ' ? 'Space' : k.toUpperCase())}<small>${escapeHtml(resolveCopy(`{${k}}`))}</small></span>`).join('');
  } else {
    keysEl.hidden = true; keysEl.innerHTML = ''; next.hidden = false;
    $('briefNextLabel').textContent = last ? 'Start typing' : 'Next';
    $('briefNextHint').innerHTML = '<small>any key</small>';
  }
  const card = $('briefCard'); card.hidden = false; card.classList.remove('brief-fade'); void card.offsetWidth; card.classList.add('brief-fade');
}
$('briefNext').onclick = briefNext;

// ---- run lifecycle -----------------------------------------------------------
function begin(): void { if (run.status === 'playing') return; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); run.begin(now()); stopDemo(); sound.play('begin'); render(); }
function startMaintenance(): void {
  replayReturn = null;
  const focus = keys.weakest(unlockedLetters()).slice(0, 6).map(k => k.key);
  startCoach({ kind: 'review', required: false, keys: focus, title: 'Keep it familiar', reason: 'A short passage with a few useful movements. Your course is complete; this is yours to use whenever it helps.' });
}
/** Completion is a lasting place to return to, not just a transient result. */
function showCompletion(): void {
  completionHome = true; run = new Run(''); outcome = null; decisions = []; gate = null;
  const k = keepsakeFor('flow');
  $('resultEyebrow').textContent = 'All seven chapters · yours to keep';
  $('resultTitle').textContent = 'Your course, complete.';
  $('resultCopy').textContent = 'From F and J to full passages. Your charms and every lesson are here to revisit. Take these movements into your own writing, or settle in for a little practice.';
  $('resultMastery').textContent = `36 lessons complete · ${allCharmsUnlocked ? KEEPSAKES.length : ownedKeepsakes(state).length} of ${KEEPSAKES.length} charms`;
  $('resultOffer').hidden = true;
  $('result').querySelector<HTMLElement>('.score')!.hidden = true;
  $('resultObject').hidden = false;
  $('resultObject').innerHTML = `${objectArt(k)}<span class="eyebrow">Yours to keep</span><h3>${escapeHtml(k.name)}</h3><p>${escapeHtml(k.line)}</p>`;
  $('result').classList.add('with-object');
  arena().classList.remove('map-mode'); arena().classList.add('result-mode');
  document.body.classList.add('showing-result');
  $('nextAction').textContent = 'Keep my hands familiar'; $('skipPractice').hidden = true;
  $('resultTitle').focus();
}
function continueAfterResult(firstKey?: string): void {
  if (mode.kind === 'explore') { resetRun(); return; }
  if (mode.kind === 'remedial') {
    // A passed or replayed stop hands back to the course; an unpassed one runs again.
    if (stopDone(state, mode.stop)) mode = { kind: 'trail' };
    resetRun(); return;
  }
  if (completionHome) { startMaintenance(); return; }
  if (courseComplete(state) && state.trail === 'flow-checkpoint' && !gate) {
    if (mode.kind !== 'trail' || replayReturn) { mode = { kind: 'trail' }; replayReturn = null; showCompletion(); } else startMaintenance();
    return;
  }
  if (mode.kind !== 'trail') { gate = null; mode = { kind: 'trail' }; }
  else if (gate) { const d = gate; gate = null; startCoach(d); return; }
  replayReturn = null;
  resetRun();
  if (firstKey !== undefined && !brief && firstKey === run.current) { begin(); typeKey(firstKey); }
}
function typeKey(k: string): void {
  const r = run.type(k, now());
  if (r === 'ignored') return;
  const last = run.strokes.at(-1)!;
  recordPerformance(run, keys, trans, Date.now(), guided() ? run.text.length : 0);
  if (last.correct || !guided()) canvasPrompt?.onKey(last.correct ? 'ok' : 'miss', last.correct ? run.pos - 1 : run.pos, last.key === ' ');
  // The keystroke tick rises a hair with the combo, so a clean run audibly warms up; a miss is a low shrug.
  if (!last.correct && !guided()) sound.play('miss');
  else if (last.correct && last.key === ' ') sound.play('word', 1, 1 + Math.min(run.combo, 40) * 0.004);
  else if (last.correct) sound.play('key');
  if (pulse && last.correct) $('beatDot').style.setProperty('--fill', onBeat(performance.now(), pulse.t0, pulse.interval).toFixed(2));
  if (r === 'done') {
    canvasPrompt?.onComplete();
    stopPulse(); return finish();
  }
  prompt(); metrics(); keymap(); nextVisual();
}
function abort(): void { if (run.status !== 'playing') return; sound.play('error'); toast('Run stopped.'); resetRun(); }

function thirds(): { errors: number; lat: number }[] {
  const st = run.strokes; const n = Math.max(1, Math.floor(st.length / 3));
  return [0, 1, 2].map((i) => { const part = st.slice(i * n, i === 2 ? st.length : (i + 1) * n); const ok = part.filter((x) => x.correct); return { errors: part.length - ok.length, lat: ok.length ? ok.reduce((a, x) => a + x.latencyMs, 0) / ok.length : 0 }; });
}
/** The one line a slow replay shows (PACE-03): an invitation, not a tempo. */
const SLOW_COPY = 'Same text. Take your time and check each key uses the finger shown.';
/** Replay the exercise just typed, once, as guided practice; Continue afterwards returns to the course (PACE-03). */
/** The running "Press like this" demo (PACE-04): its timers, while the keys light in a steady 25 WPM rhythm. */
let demo: number[] | null = null;
function lightDemo(s: DemoStep | null): void {
  $('keymap').querySelectorAll('.keycap.demo').forEach((x) => x.classList.remove('demo'));
  if (!s) return;
  // Only the demonstrated key is lit; the usual next-key highlight returns when the demo ends.
  $('keymap').querySelectorAll('.keycap.hot').forEach((x) => x.classList.remove('hot'));
  $('keymap').querySelector<HTMLElement>(`[data-key="${CSS.escape(s.key)}"]`)?.classList.add('demo');
  paintHand('left', s.finger); paintHand('right', s.finger); pulseFinger(s.finger);
  badges(s.finger && s.finger !== 'thumb' ? { [s.finger]: s.key } : {});
}
/** Show the first loop or word of a slow replay at a relaxed pace; any key ends it. Only ever in a slow replay. */
function startDemo(): void {
  stopDemo();
  if (mode.kind !== 'slow' || run.status !== 'idle') return;
  const steps = demoSchedule(run.text);
  $('replayDemo').hidden = true;
  setHtml($('handInstruction'), '<strong>Press like this</strong> · watch the pace, then type');
  demo = steps.map((s) => window.setTimeout(() => lightDemo(s), s.at));
  demo.push(window.setTimeout(stopDemo, (steps.at(-1)?.at ?? 0) + demoStepMs()));
}
function stopDemo(): void {
  if (demo) { demo.forEach(clearTimeout); demo = null; pulseFinger(null); keymap(); nextVisual(); }
  $('replayDemo').hidden = !(mode.kind === 'slow' && run.status === 'idle');
}
function practiseSlowly(): void { if (run.status !== 'complete' || !run.text) return; mode = { kind: 'slow', text: run.text }; resetRun(); }
/** What Continue opens next on the way to `lesson`: a finger stop woven before it (DEC-20), or the lesson itself. */
function stepName(lesson: Trail): string {
  const stop = blockingStop(state, lesson);
  return stop ? `${stop.pair.name} · ${fingerLevels(fingerById(stop.pair.sides[0])!)[stop.level]!.name}` : lesson.name;
}
/** Lessons whose pace note has shown this session (PACE-01). */
const paceNoted = new Set<string>();
function finish(): void {
  let newCharm: Keepsake | null = null;
  const m = metrics(), t = runTrail, wasReplay = replayReturn !== null;
  let title = 'Practice complete.', copy = 'A little more familiarity to take into your next passage.';
  decisions = []; gate = null; if (!guided()) keys.endRun();
  const focus = focusKeys(t, keys);
  if (mode.kind === 'trail') {
    state.trail = t.id;
    outcome = applyRun(state, keys, { hits: run.hits, attempts: run.attempts, maxCombo: run.maxCombo, wpm: m.wpm, acc: m.acc, rhythm: run.rhythm(), now: Date.now(), stage: runStage });
    if (!guided()) {
      const p = progressOf(state, t.id);
      const unlocked = [...allowedChars(t)].filter(k => k === k.toLowerCase());
      const errors = classifyRun(run.text, run.strokes, activeMethod());
      state.errors = rollTally(state.errors, errors);
      const missedKeys = [...new Set(run.strokes.filter(s => !s.correct).map(s => s.key.toLowerCase()))];
      decisions = decide(keys, { thirds: thirds(), wpm: m.wpm, acc: m.acc, rhythm: run.rhythm(), runsOnTrail: p.runs, focusKeys: focus, unlocked, passed: outcome.passed, fails: p.fails, recentAcc: p.recent, errors, missedKeys, weakPairs: trans.weakest(unlocked) });
      // One bounded repair between course attempts. Timing alone never sends a player off course.
      if (!outcome.passed && !wasReplay && missedKeys.length && run.errors >= 3) gate = decisions.find(actionable) ?? { kind: 'precision', required: false, keys: missedKeys.slice(0, 3), title: 'A little room to settle', reason: `A short practice with ${missedKeys.slice(0, 3).map(k => k === ' ' ? 'Space' : k.toUpperCase()).join(' · ')}, then we will try the passage again.` };
    }
    if (wasReplay) { title = 'A familiar place, revisited.'; copy = 'Your next lesson is waiting right where you left it.'; state.trail = replayReturn!; }
    else if (outcome.firstClear && t.id === 'flow-checkpoint') { title = 'Look what your hands can do.'; copy = 'You completed all 36 lessons: letters, capitals, punctuation, numbers and a longer mixed passage. Keep using this in everyday writing. Fluency grows with use.'; }
    else if (outcome.firstClear && t.checkpoint) { title = `${groveOf(t).name}, complete.`; copy = keepsakeFor(t.grove).line + (outcome.nextTrail ? ` Next, ${groveOf(outcome.nextTrail).name}: ${resolveCopy(outcome.nextTrail.blurb ?? groveOf(outcome.nextTrail).blurb)}` : ' A small extra, made yours.'); }
    else if (outcome.firstClear) { title = 'Lesson complete.'; copy = `${t.name} is complete. ${outcome.nextTrail ? `Next: ${stepName(outcome.nextTrail)}.` : 'The whole path is open.'}`; }
    else if (!outcome.passed) { title = 'Try this passage again.'; copy = `${gate ? 'A short practice will help with the missed keys, then we’ll try again.' : 'Take your time; there is no timer to beat.'}`; }
    else { title = 'Exercise complete.'; copy = `${outcome.exercise.index + 1} of ${outcome.exercise.total} complete. Next: ${outcome.exercise.nextName}.`; }
    copy = `${m.acc}% accuracy · ${t.checkpoint ? 97 : gateFor(t).passAcc}% needed. ${copy}`;
  }
  if (guided()) {
    title = 'A little more familiar.';
    copy = mode.kind === 'explore' ? 'Choose another key, repeat this movement, or return to your lesson. There is no score here.'
      : mode.kind === 'slow' ? 'Same text, taken slowly. Your lesson is waiting where you left it.'
      : `Guided practice complete. Next: ${outcome?.exercise.nextName ?? 'your next lesson'}. Take this movement at whatever pace feels comfortable.`;
  }
  let scores: SideScore[] = [];
  if (mode.kind === 'remedial' && practice) {
    const replay = pairCompleted(state.fingerCourses, mode.pair) > mode.level;
    const before = pairCompleted(state.fingerCourses, mode.pair), page = stopPageIndex();
    const judged = completeFingerPage(state.fingerCourses, state.stopPages, mode.stop.id, mode.pair, mode.level, page, practice, run);
    fingerPassed = judged.stopPassed; pagePassed = judged.pagePassed; scores = judged.scores;
    // UI-16: rows jumps, twisters and the gauntlet each earn this pair a charm.
    const after = pairCompleted(state.fingerCourses, mode.pair);
    if (after > before) newCharm = fingerCharmAt(mode.pair.id, after) ?? null;
    title = replay ? 'Finger stop revisited.' : fingerPassed ? `${mode.pair.name}, steady.` : pagePassed ? `Page ${page + 1} of ${FINGER_PAGES} saved.` : 'A little more practice here.';
    copy = replay ? 'A passed stop stays passed. Your course is waiting where you left it.'
      : fingerPassed ? `All ${FINGER_PAGES} pages passed. Your progress is saved, and your course continues.`
      : pagePassed ? `Both hands reached ${FINGER_PASS_ACC}%. Next is page ${page + 2}: ${page + 1 === 1 ? 'the same keys in new shapes' : 'these keys in real words'}.`
      : `Each hand needs ${FINGER_PASS_ACC}% on its own keys. ${page ? `Your ${page === 1 ? 'first page is' : `first ${page} pages are`} saved; only` : 'Only'} this page runs again.`;
  }
  const newly = guided() ? [] : [...allowedChars(t)].filter(k => k === k.toLowerCase()).filter(k => keys.mastery(k) >= MASTERED && (beforeMastery[k] ?? 0) < MASTERED);
  $('resultMastery').textContent = newly.length ? `Settled this time: ${newly.map(k => k === ' ' ? 'Space' : k.toUpperCase()).join(' · ')}` : `${run.hits} characters typed · ${run.errors === 0 ? 'no missed keys' : `${run.errors} missed ${run.errors === 1 ? 'key' : 'keys'}`}`;
  if (guided()) $('resultMastery').textContent = 'Slow is welcome. Let your hands stay easy.';
  const acc = m.acc;
  // A stop page shows each hand's own accuracy: that, not the total, is what passes it.
  if (mode.kind === 'remedial' && scores.length) $('resultMastery').textContent = scores.map(sc => `${fingerById(sc.id)!.full} ${sc.acc}%${sc.passed ? ' ✓' : ` · needs ${FINGER_PASS_ACC}%`}`).join('   ·   ');
  // Spec F5: a beat run is judged for evenness only — one word and three bars, never a number.
  if (runExercise.beat) { const e = evenness(run.strokes.slice(1).filter(x => x.correct).map(x => x.latencyMs)); $('resultMastery').textContent = `${e.word} ${e.bars}`; }
  $('result').querySelector<HTMLElement>('.score')!.hidden = guided();
  if (outcome?.firstClear && t.checkpoint) newCharm = keepsakeFor(t.grove);
  const earned = !!newCharm, k = newCharm;
  $('resultObject').innerHTML = k ? `${objectArt(k)}<span class="eyebrow">A new charm · yours to keep</span><h3>${escapeHtml(k.name)}</h3><p>${escapeHtml(k.line)}</p>` : '';
  // The charm arrives on screen a beat after the result, in its own way (UI-16).
  if (k) setTimeout(() => spawnCharm(k.id), 420);
  $('resultObject').hidden = !earned;
  $('result').classList.toggle('with-object', !!earned);
  // Spec B4: the closing prose is not built around the target; if the target slipped there, say so once and move on (D5 brings it back).
  const target = slotPick?.trail === t.id ? slotPick.pick?.target : undefined;
  if (mode.kind === 'trail' && runExercise.format === 'passage' && target && missedTarget(run.text, run.strokes, target)) copy += ` ${target[0]!.toUpperCase()} then ${target[1]!.toUpperCase()} slipped in the sentence — it will come back.`;
  $('resultTitle').textContent = title; $('resultCopy').innerHTML = renderCopy(copy);
  // PACE-01: typed far above a relaxed pace → one gentle suggestion per lesson per session; never a gate or a number.
  // PACE-02: an established fast habit (fast early Roots runs) brings the note sooner, and once per exercise, not per lesson.
  if (mode.kind === 'trail') state.pace = notePace(state.pace, t, run.strokes);
  const paceKey = state.pace.established ? `${t.id}#${runExerciseIndex}` : t.id;
  const fast = mode.kind === 'trail' && !runExercise.beat && paceNoteApplies(t, runExercise) && !paceNoted.has(paceKey) && typedFast(run.strokes, t, paceFactor(state.pace));
  if (fast) paceNoted.add(paceKey);
  $('resultPace').textContent = fast ? PACE_NOTE : ''; $('resultPace').hidden = !fast; $('practiseSlowly').hidden = !fast;
  $('resultWpm').textContent = String(m.wpm); $('resultAcc').textContent = acc + '%';
  // Spec F4: pace is shown in exactly one place — the Flow chapter's checkpoint card — as information, never a target.
  $('resultWpm').parentElement!.hidden = !(mode.kind === 'trail' && t.id === 'flow-checkpoint');
  $('resultOffer').hidden = !gate;
  $('resultOffer').textContent = gate ? `Up next: ${gate.title}. A short practice, then back here.` : '';
  $('resultEyebrow').textContent = t.id === 'flow-checkpoint' && outcome?.firstClear ? 'Course complete · Calm hands, capable fingers' : mode.kind === 'trail' ? `Passage complete · ${t.name}` : 'Practice complete';
  $('nextAction').textContent = gate ? 'Settle the tricky part' : wasReplay ? 'Back to my course' : mode.kind === 'slow' ? 'Back to my course' : mode.kind !== 'trail' ? 'Back to the passage' : courseComplete(state) && !outcome?.nextTrail ? 'Keep my hands familiar' : outcome?.passed ? `Next: ${resolveCopy(outcome.exercise.nextName ?? stepName(trail()))}` : `Retry: ${t.name}`;
  $('skipPractice').hidden = !gate;
  $('skipPractice').textContent = 'Try the passage instead';
  if (mode.kind === 'remedial') {
    $('nextAction').textContent = stopDone(state, mode.stop) ? `Next: ${stepName(trail())}` : pagePassed ? `Next: page ${stopPage()} of ${FINGER_PAGES}` : 'Try this page again';
    $('skipPractice').hidden = true;
  }
  if (mode.kind === 'explore') { $('nextAction').textContent = 'Try this key again'; $('skipPractice').hidden = false; $('skipPractice').textContent = 'Back to my lesson'; }
  devRecord({
    at: new Date().toISOString(),
    mode: mode.kind,
    lesson: { id: t.id, name: t.name, grove: t.grove, number: pathIndex(t), newKeys: t.newKeys, checkpoint: !!t.checkpoint },
    exercise: {
      index: runExerciseIndex + 1,
      total: lessonExercises(t, pickFor(t)).length,
      name: resolveCopy(runExercise.name),
      stage: runExercise.stage,
      format: runExercise.format,
      target: runExercise.target ?? null,
      beat: !!runExercise.beat,
      guided: guided(),
      instruction: resolveCopy(runExercise.instruction),
    },
    selection: slotPick?.trail === t.id ? slotPick.pick : null,
    prompt: run.text,
    promptHandLoad: devHandLoad(run.text),
    preparation: devPreparation(t.id, runExerciseIndex + 1, run.text),
    allowedChars: [...allowedChars(t)],
    result: {
      hits: run.hits, attempts: run.attempts, errors: run.errors, maxCombo: run.maxCombo,
      elapsedMs: run.elapsed(now()), wpm: m.wpm, acc: m.acc, rhythm: run.rhythm(),
      passed: outcome?.passed ?? null, firstClear: outcome?.firstClear ?? null,
    },
    strokes: run.strokes.map((s) => ({ ...s })),
  });
  // The result's chime, a beat after the passage's own burst: the keepsake sparkle outranks a lesson clear outranks a pass.
  const chime: CueName = mode.kind === 'remedial' ? (fingerPassed || pagePassed ? 'complete' : 'settle') : earned ? 'sparkle' : outcome?.firstClear ? 'clear' : outcome?.passed ? 'complete' : 'settle';
  setTimeout(() => sound.play(chime), 260);
  save(); arena().classList.add('result-mode'); document.body.classList.add('showing-result');
  $('resultTitle').focus();
  header();
}

// ---- grove map ---------------------------------------------------------------------
let mapKeys: ((e: KeyboardEvent) => void) | null = null;
type BookView = 'course' | 'keepsakes';
// Cosmetic console cheat: deliberately separate from saved/synced learning evidence.
const charmCheatKey = 'keyjam:unlock-all-charms';
let allCharmsUnlocked = false;
try { allCharmsUnlocked = localStorage.getItem(charmCheatKey) === '1'; } catch { /* Session-only if storage is unavailable. */ }
function setCharmCheat(enabled: boolean): string {
  allCharmsUnlocked = enabled;
  try {
    if (enabled) localStorage.setItem(charmCheatKey, '1');
    else localStorage.removeItem(charmCheatKey);
  } catch { /* The command still works for this session. */ }
  openMap('keepsakes');
  return enabled ? `All ${KEEPSAKES.length} charms unlocked on this browser.` : 'Cheat removed. Your earned charms are preserved.';
}
function openMap(view: BookView = 'course'): void {
  stopPulse();
  if (run.status === 'playing') resetRun();
  if (!arena().classList.contains('map-mode')) sound.play('open');
  arena().classList.remove('result-mode'); arena().classList.add('map-mode');
  document.body.classList.remove('showing-result'); document.body.classList.add('showing-book');
  mapKeys = renderMap($('groveMap'), state, { onSelect: selectLesson, onStop: selectStop, onContinue: continueCourse, onClose: closeMap, continueLabel: stepName(trail()) });
  $('keepsakeCollection').innerHTML = collectionHtml(state, allCharmsUnlocked);
  $('keepsakeCollection').querySelectorAll<HTMLButtonElement>('[data-replay]').forEach(b => b.onclick = () => selectLesson(trailById(b.dataset.replay!)));
  $('keepsakeCollection').querySelectorAll<HTMLButtonElement>('[data-summon]').forEach(b => b.onclick = () => { sound.play('sparkle'); spawnCharm(b.dataset.summon!); });
  $('bookProgress').textContent = `${MAIN_TRAILS.filter(t => isCleared(state, t.id)).length} of ${MAIN_TRAILS.length} lessons · ${STOPS.filter(st => stopDone(state, st)).length} of ${STOPS.length} finger stops · ${allCharmsUnlocked ? KEEPSAKES.length : ownedKeepsakes(state).length} of ${KEEPSAKES.length} charms`;
  showBookView(view);
}
/** The course and the keepsakes share one screen; the tabs swap what fills it. */
function showBookView(view: BookView): void {
  $('groveMap').hidden = view !== 'course'; $('collectionSection').hidden = view !== 'keepsakes';
  for (const [id, v] of [['bookTabCourse', 'course'], ['bookTabKeepsakes', 'keepsakes']] as const) $(id).setAttribute('aria-selected', String(view === v));
  if (view === 'keepsakes') $('collectionTitle').focus();
}
$('bookTabCourse').onclick = () => { showBookView('course'); $('groveMap').querySelector<HTMLElement>('[aria-current="step"],.chapter-tile.active')?.focus(); };
$('bookTabKeepsakes').onclick = () => showBookView('keepsakes');
/** Leave a replayed lesson's detour before starting anything else from the book. */
function leaveReplay(): void { if (replayReturn) { state.trail = replayReturn; replayReturn = null; } gate = null; }
function selectStop(stop: Stop): void { sound.play('select'); leaveReplay(); mode = { kind: 'remedial', pair: stop.pair, level: stop.level, stop }; closeMap(); resetRun(); }
/** Continue from the book: the next step on the path, which may be a finger stop (DEC-20). */
function continueCourse(): void { leaveReplay(); mode = { kind: 'trail' }; closeMap(); if (courseComplete(state) && state.trail === 'flow-checkpoint') showCompletion(); else resetRun(); }
function selectLesson(t: Trail): void { sound.play('select'); replayReturn = isCleared(state, t.id) ? courseFrontier().id : null; state.trail = t.id; mode = { kind: 'trail' }; gate = null; closeMap(); resetRun(); }
function closeMap(): void { sound.play('close'); arena().classList.remove('map-mode'); document.body.classList.remove('showing-book'); mapKeys = null; if (completionHome || run.status === 'complete') { arena().classList.add('result-mode'); document.body.classList.add('showing-result'); } else { render(); startPulse(); } $(completionHome || run.status === 'complete' ? 'resultTitle' : 'lessonTitle').focus(); }

function sessionCheck(): void {
  if (!state.settings.reviewOn) return;
  const d = sessionReview(keys, unlockedLetters(), Date.now());
  if (d) startCoach(d);
}
// ---- input -----------------------------------------------------------------------
function handleIdleOrResult(e: KeyboardEvent): void {
  if (e.key === 'Enter' && document.activeElement?.id === 'practiseSlowly') { e.preventDefault(); practiseSlowly(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (completionHome || run.status === 'complete') continueAfterResult(); else begin(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (run.status === 'complete') continueAfterResult(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1 || completionHome) return;
  e.preventDefault();
  // Any key moves on from a result and starts the next passage with that letter; the course-complete home alone waits for Enter.
  if (run.status === 'complete') { continueAfterResult(e.key === ' ' ? undefined : e.key); return; }
  if (run.status === 'idle') { begin(); typeKey(e.key); }
}
function trapDialog(e: KeyboardEvent, dialog: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const bs = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([hidden]), a[href]')].filter(x => x.offsetParent !== null);
  const first = bs[0], last = bs.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
}
document.addEventListener('keydown', (e) => {
  if (settingsModal().classList.contains('open')) { trapDialog(e, settingsModal()); if (e.key === 'Escape') { sound.play('close'); settingsModal().classList.remove('open'); $('settingsTopBtn').focus(); e.preventDefault(); } return; }
  if (arena().classList.contains('map-mode')) { mapKeys?.(e); return; }
  if (e.target instanceof HTMLElement && e.target.closest('button,a,input,select,textarea,summary,[contenteditable]')) return;
  if (brief) {
    // Only the explicit steps advance: a briefing is meant to be read, so stray typing never skips it.
    // A press step listens for its own keys instead.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (briefTip()?.press && e.key.length === 1) { e.preventDefault(); briefPress(e.key); }
    else if (e.key === 'Escape') { e.preventDefault(); endBrief(true); render(); }
    // Any key advances a text step, so hands never have to leave the home row to reach Enter or the mouse.
    else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key.length === 1) { e.preventDefault(); briefNext(); }
    return;
  }
  if (run.status === 'playing') {
    if (e.key === 'Escape') { e.preventDefault(); abort(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key.length === 1) { e.preventDefault(); typeKey(e.key); }
    return;
  }
  handleIdleOrResult(e);
});
$('prompt').onclick = () => { if (run.status === 'idle' && !brief) begin(); };
$('guideToggle').onclick = () => { helpVisible = !helpVisible; labels(); keymap(); nextVisual(); $('lessonTitle').focus(); };
$('exploreKeyboard').onclick = () => {
  if (mode.kind === 'explore') mode = { kind: 'trail' };
  else { if (replayReturn) { state.trail = replayReturn; replayReturn = null; } mode = { kind: 'explore', key: 'f' }; }
  resetRun();
};
$('skipGuided').onclick = () => {
  if (mode.kind !== 'trail' || !guided()) return;
  applyRun(state, keys, { hits: 0, attempts: 0, maxCombo: 0, wpm: 0, acc: 0, rhythm: 0, now: Date.now() });
  save(); resetRun();
};
$('resetRunBtn').onclick = () => { if (run.status === 'playing') abort(); else resetRun(); };
/** Each nav item opens its own view of the book, or closes the book when that view is already showing. */
const bookShowing = (view: BookView) => arena().classList.contains('map-mode') && !$(view === 'course' ? 'groveMap' : 'collectionSection').hidden;
$('lessonsNav').onclick = () => { if (bookShowing('course')) closeMap(); else openMap('course'); };
$('statsNav').onclick = () => { if (bookShowing('keepsakes')) closeMap(); else openMap('keepsakes'); };
$('closeBook').onclick = closeMap;
$('skipPractice').onclick = () => { gate = null; mode = { kind: 'trail' }; replayReturn = null; if (courseComplete(state) && state.trail === 'flow-checkpoint') showCompletion(); else resetRun(); };
$('startBtn').onclick = () => { if (arena().classList.contains('map-mode')) { closeMap(); return; } if (brief) { briefNext(); return; } if (completionHome || run.status === 'complete') continueAfterResult(); else begin(); };
function showSettings(): void { sound.play('open'); settingsModal().classList.add('open'); $('closeSettings').focus(); }
$('settingsTopBtn').onclick = showSettings;
$('closeSettings').onclick = () => { sound.play('close'); settingsModal().classList.remove('open'); };
settingsModal().onclick = (e) => { if (e.target === settingsModal()) settingsModal().classList.remove('open'); };
// ---- Method (DEC-17): Traditional by default; with more than one official method Settings cycles through them --------
function switchMethod(methodId: string): void {
  if (state.settings.method !== methodId) {
    // Only the reassigned keys need fresh evidence. Earned chapters stay earned.
    const moved = reassignedKeys(activeMethod(), METHODS.find((m) => m.id === methodId) ?? activeMethod());
    const j = keys.toJSON();
    for (const k of moved) delete j.keys[k];
    for (const pair of Object.keys(state.transitions)) if ([...pair].some(k => moved.includes(k))) delete state.transitions[pair];
    keys = KeyModel.fromJSON(j.keys, j.confusions); trans = TransitionModel.fromJSON(state.transitions); slotPick = null;
  }
  state.settings.method = methodId; state.settings.onboarded = true; setMethod(methodId); save(); syncSettingsUi();
  mode = { kind: 'trail' }; resetRun(); toast(`Method: ${activeMethod().name}`);
}
$('methodBtn').onclick = () => switchMethod(METHODS[(METHODS.findIndex((m) => m.id === activeMethod().id) + 1) % METHODS.length]!.id);

$('codeBtn').onclick = () => { state.settings.codeGrove = !state.settings.codeGrove; sound.play(state.settings.codeGrove ? 'toggle-on' : 'toggle-off'); save(); $('codeBtn').textContent = 'Code grove: ' + (state.settings.codeGrove ? 'on' : 'off'); toast(state.settings.codeGrove ? 'Code grove will appear after the Bark checkpoint.' : 'Code grove hidden.'); };
$('exportBtn').onclick = () => {
  save();
  const u = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })), a = document.createElement('a');
  a.href = u; a.download = 'keyjam-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
};
$('importBtn').onclick = () => $('importFile').click();
$<HTMLInputElement>('importFile').onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  try {
    const f = input.files?.[0]; if (!f) return;
    applyImport(JSON.parse(await f.text()));
  } catch { toast('That backup could not be read.'); }
  input.value = '';
};
function applyImport(raw: unknown): void {
  state = sanitize(raw); keys = KeyModel.fromJSON(state.keys, state.confusions); trans = TransitionModel.fromJSON(state.transitions); slotPick = null; mode = { kind: 'trail' }; gate = null; replayReturn = null; setMethod(state.settings.method); save(); syncSettingsUi(); resetRun(); settingsModal().classList.remove('open'); if (courseComplete(state) && state.trail === 'flow-checkpoint') showCompletion(); toast('Progress restored.');
}
$('resetBtn').onclick = () => {
  if (!confirm('Reset all your progress? Every lesson, charm and practice record will be gone' + (signedIn ? ' from your account too.' : '.'))) return;
  if (!confirm('Are you really, really sure? There is no undo.')) return;
  { state = fresh(); keys = new KeyModel(); trans = new TransitionModel(); mode = { kind: 'trail' }; gate = null; replayReturn = null; setMethod(state.settings.method); save(); syncSettingsUi(); resetRun(); settingsModal().classList.remove('open'); toast('Fresh grove.'); } };
function syncSettingsUi(): void {
  $('codeBtn').textContent = 'Code grove: ' + (state.settings.codeGrove ? 'on' : 'off');
  $('methodBtn').textContent = 'Method: ' + activeMethod().name;
  // One official method: nothing to choose, so neither the control nor its explanation is shown.
  $('methodBtn').hidden = METHODS.length < 2;
  $('methodNote').hidden = METHODS.length < 2;
  setMethod(state.settings.method);
}
setInterval(() => { if (run.status === 'playing') metrics(); }, 450);

// The account is optional: a guest page never loads its service. While its
// panel is open it swallows every keydown in the capture phase, so the run
// and the shortcuts above never see a password being typed.
const sync = createProgressSync({
  read: () => { const j = keys.toJSON(); state.keys = j.keys; state.confusions = j.confusions; state.transitions = trans.toJSON(); return replayReturn ? { ...state, trail: replayReturn } : state; },
  write: adopt,
});
const guestHint = $('guestHint');
const showGuestHint = (): void => { guestHint.hidden = signedIn; };
const account = createAccount({
  announce: toast,
  onSession: (session, client) => {
    signedIn = session !== null;
    if (!signedIn) clearStored();
    showGuestHint();
    sync.session(session, client);
    if (signedIn) store();
  },
});
const syncNote = (s: SyncStatus): string => {
  switch (s.kind) {
    case 'off': return 'Saved on this browser. A new account keeps this course progress and syncs it across devices. Signing into an existing account opens its own progress.';
    case 'syncing': return 'Syncing your progress…';
    case 'synced': return `Progress synced · ${s.runs} run${s.runs === 1 ? '' : 's'} on this account. Sign in anywhere to continue.`;
    case 'unavailable': return s.reason === 'not-installed' ? 'Sync is not set up on the server yet; your progress stays on this device for now.'
      : s.reason === 'offline' ? 'Offline — your progress will sync when you are back.'
      : 'Sync is not reachable right now; your progress stays on this device until it is.';
  }
};
sync.onStatus((s) => account.setNote(syncNote(s)));

// About & docs: dopedocs owns the panel, its scrollspy and its /docs/<id> URLs;
// this only mounts it on first use (most sessions never open it) and points
// the brand mark at it. While it is open the run must not hear keys.
let docsPanel: PanelHandle | null = null;
const docsOpen = $<HTMLButtonElement>('docsOpen');
const ensureDocs = (): PanelHandle => docsPanel ??= mountPanel(document.body, docs, {
  navLabel: 'On this page',
  backLabel: 'Back to typing',
  onToggle(open) { docsOpen.setAttribute('aria-expanded', String(open)); if (!open) docsOpen.focus(); },
});
docsOpen.addEventListener('click', () => ensureDocs().open());
/** The brand mark always leads back to the lesson in progress. A run mid-passage is left alone. */
$('brandHome').onclick = () => {
  if (arena().classList.contains('map-mode')) closeMap();
  if (run.status === 'playing') return;
  if (mode.kind !== 'trail' || replayReturn || completionHome || run.status === 'complete') { mode = { kind: 'trail' }; replayReturn = null; gate = null; if (courseComplete(state) && state.trail === 'flow-checkpoint') showCompletion(); else resetRun(); }
  $('lessonTitle').focus();
};
document.addEventListener('keydown', (e) => { if (docsPanel?.isOpen && e.key !== 'Escape') e.stopImmediatePropagation(); }, { capture: true });

syncSettingsUi(); resetRun(); if (courseComplete(state) && state.trail === 'flow-checkpoint') showCompletion(); else sessionCheck(); save(); showGuestHint(); void loadHands(nextVisual);
state.settings.onboarded = true;
// Interface sounds: every button taps, navigation hovers a little brighter, the primary actions warmer, Reset darker.
wireAudioToggle($('soundBtn'));
sound.wire(
  (host) => (host.id === 'soundBtn' || host.closest('.keymap') ? null : 'tap'),
  (host) => host.closest('.nav') ? 'hover-nav' : host.classList.contains('danger') ? 'hover-danger' : (host.classList.contains('primary') || host.id === 'nextAction' || host.id === 'startBtn' || host.classList.contains('course-continue')) ? 'hover-positive' : null,
);
const played: string[] = [];
sound.onPlay = (name) => { played.push(name); if (played.length > 200) played.shift(); };
/** Console and test hooks, as `keyjam` (the product) and `keygrove` (the original repository name, kept for scripts). */
const consoleApi = Object.freeze({
    snapshot: () => JSON.parse(JSON.stringify({ state, run: { text: run.text, pos: run.pos, status: run.status, hits: run.hits, attempts: run.attempts }, mode, exercise: runExercise, guided: guided(), helpVisible, outcome, decisions, gate, brief: brief ? { title: brief.briefing.title, step: brief.step, tip: brief.briefing.tips[brief.step]!.title } : null, offer: (gate ?? decisions[0]) ? { kind: (gate ?? decisions[0])!.kind } : null })),
    import: (raw: unknown) => applyImport(raw),
    /** Summon any charm onto the screen (owned or not): for trying the animations. */
    summon: (id: string) => spawnCharm(id),
    /** Unlock the collection on this browser without changing course progress. */
    unlockAllCharms: () => setCharmCheat(true),
    /** Remove the cheat, keeping charms earned through practice. */
    resetCharms: () => setCharmCheat(false),
    openMap,
    selftest: textflowSelfTest,
    prompt: () => canvasPrompt,
    method: () => activeMethod().id,
    account: () => account.session()?.user.email ?? null,
    signedIn: () => signedIn,
    sounds: () => played.slice(),
    sound,
    dev: Object.freeze({
      enabled: devTraceEnabled,
      report: devReport,
      clear: clearDevReport,
      runs: () => structuredClone(devRuns),
      /** Read-only view of the screen for scripted play-throughs (?dev=1 only). */
      current: () => (devTraceEnabled ? { status: run.status, text: run.text, briefing: !!brief } : null),
    }),
});
for (const name of ['keyjam', 'keygrove']) Object.defineProperty(window, name, { value: consoleApi });
