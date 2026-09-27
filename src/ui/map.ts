import { lessonExercises } from '../curriculum/lesson-flow';
import { GROVES, TRAILS, resolveCopy, trailsInGrove, type Grove, type Trail } from '../curriculum';
import { fingerLevels, pairCompleted, type FingerPair } from '../curriculum/finger-course';
import { fingerById } from '../curriculum/fingers';
import { STOPS, stopsAfter, type Stop } from '../curriculum/stops';
import { everythingIsOpen, groveOpen, isCleared, stopDone, trailUnlocked } from '../engine/progress';
import type { SaveV6 } from '../state/save';
import { escapeHtml as esc } from './dom';
import { keepsakeFor, owns } from '../engine/keepsakes';
import { objectArt } from './scene';
export interface MapHandlers { onSelect(trail: Trail): void; onStop(stop: Stop): void; onContinue(): void; onClose(): void;
  /** What Continue opens: the current lesson, or a finger stop woven before it. */
  continueLabel: string }

const levelOf = (stop: Stop) => fingerLevels(fingerById(stop.pair.sides[0])!)[stop.level]!;
/** A stop can run once its lesson is cleared and the pair has passed the level before it. */
export const stopOpen = (s: SaveV6, stop: Stop): boolean => everythingIsOpen() || isCleared(s, stop.after) && pairCompleted(s.fingerCourses, stop.pair) >= stop.level;
/** Four bars, pinky to index, with this pair's bar lit: which fingers a stop drills, at a glance. */
const PAIR_ORDER: readonly FingerPair['id'][] = ['pinky', 'ring', 'middle', 'index'];
const glyph = (pair: FingerPair) => `<span class="pair-glyph" aria-hidden="true">${PAIR_ORDER.map(id => `<i class="${id === pair.id ? 'on' : ''}"></i>`).join('')}</span>`;
const lessonKeys = (t: Trail) => t.checkpoint ? 'Chapter passage · keepsake' : t.shift ? 'Opposite-hand Shift' : t.newKeys ? [...t.newKeys].join(' ').toUpperCase() : 'Familiar keys at work';

/**
 * The course in one screen (UI-15): chapter tiles, the chosen chapter's lessons with their finger stops (DEC-20), and a
 * panel that previews whatever is hovered or focused. One click starts a lesson or stop; there is no separate commit step.
 */
export function renderMap(root: HTMLElement, state: SaveV6, h: MapHandlers, groveId?: string): (e: KeyboardEvent) => void {
  const visible = GROVES.filter(g => !g.optional || state.settings.codeGrove);
  const current = TRAILS.find(t => t.id === state.trail)!;
  let chosen: Grove = visible.find(g => g.id === (groveId ?? current.grove)) ?? visible[0]!;

  const tile = (g: Grove) => {
    const ts = trailsInGrove(g.id), open = groveOpen(state, g.id), cleared = ts.filter(t => isCleared(state, t.id)).length;
    const earned = owns(state, keepsakeFor(g.id));
    return `<button type="button" class="chapter-tile ${g.id === chosen.id ? 'active' : ''} ${open ? '' : 'locked'} ${earned ? 'earned' : ''}" data-grove="${g.id}" aria-pressed="${g.id === chosen.id}">
      <span class="tile-art">${earned ? objectArt(keepsakeFor(g.id), true) : String(g.n).padStart(2, '0')}</span>
      <span class="tile-body"><strong>${esc(g.name)}</strong><small>${earned ? 'Complete' : open ? `${cleared} / ${ts.length}` : 'Up ahead'}</small></span>
      <i class="tile-bar"><span style="width:${Math.round(cleared / ts.length * 100)}%"></span></i></button>`;
  };
  const chip = (stop: Stop) => {
    const done = stopDone(state, stop), open = stopOpen(state, stop);
    return `<button type="button" class="stop-chip ${done ? 'done' : open ? 'next' : 'locked'}" data-stop="${stop.id}" ${open ? '' : 'disabled'}>${glyph(stop.pair)}<span>${esc(stop.pair.name.replace(' fingers', ''))} · ${esc(levelOf(stop).name)}</span>${done ? '<b aria-label="done">✓</b>' : ''}</button>`;
  };
  const card = (t: Trail) => {
    const done = isCleared(state, t.id), unlocked = trailUnlocked(state, t), cur = t.id === state.trail, stops = stopsAfter(t.id);
    const steps = lessonExercises(t).length, at = state.lessonSteps[t.id] ?? 0;
    return `<article class="lesson-card ${cur ? 'current' : ''} ${done ? 'done' : ''} ${unlocked || done ? '' : 'locked'} ${t.checkpoint ? 'cp' : ''}">
      <button type="button" class="lesson-main" data-trail="${t.id}" ${unlocked || done ? '' : 'disabled'} ${cur ? 'aria-current="step"' : ''}>
        <span class="lesson-n">${done ? '✓' : String(t.n).padStart(2, '0')}</span>
        <span class="lesson-body"><strong>${esc(t.name)}</strong><small>${esc(lessonKeys(t))}</small></span>
        <span class="lesson-go">${done ? 'Revisit' : cur ? 'Continue' : unlocked ? 'Begin' : ''}</span>
        ${!done && (cur || at) ? `<i class="lesson-steps">${Array.from({ length: steps }, (_, i) => `<i class="${i < at ? 'on' : ''}"></i>`).join('')}</i>` : ''}
      </button>
      ${stops.length ? `<div class="stop-row" aria-label="Finger stops after ${esc(t.name)}">${stops.map(chip).join('')}</div>` : ''}
    </article>`;
  };
  const preview = (el: HTMLElement | null) => {
    const box = root.querySelector<HTMLElement>('#coursePreview');
    if (!box) return;
    const t = el?.dataset.trail ? TRAILS.find(x => x.id === el.dataset.trail) : undefined;
    const stop = STOPS.find(s => s.id === el?.dataset.stop);
    if (stop) {
      const l = levelOf(stop);
      box.innerHTML = `<span class="eyebrow">Finger stop · level ${stop.level + 1} of 10</span><h4>${esc(stop.pair.name)} · ${esc(l.name)}</h4><p>${esc(resolveCopy(l.instruction))}</p><small>${stopDone(state, stop) ? 'Passed · click to replay' : stopOpen(state, stop) ? `${state.stopPages[stop.id] ? `${state.stopPages[stop.id]} of 3 pages saved · ` : ''}95% for each hand · click to start` : 'Opens after its lesson'}</small>`;
    } else if (t) {
      box.innerHTML = `<span class="eyebrow">${t.checkpoint ? 'Checkpoint' : `Lesson ${t.n}`}</span><h4>${esc(t.name)}</h4><p>${esc(resolveCopy(t.blurb ?? ''))}</p><small>${isCleared(state, t.id) ? 'Complete · click to revisit' : trailUnlocked(state, t) ? `${state.lessonSteps[t.id] ?? 0} of ${lessonExercises(t).length} exercises · click to start` : 'Locked · finish what comes before it'}</small>`;
    } else box.innerHTML = `<span class="eyebrow">Chapter ${chosen.n}</span><p>${esc(resolveCopy(chosen.blurb))}</p><small>Hover a lesson or finger stop to see what it practises. One click starts it.</small>`;
  };
  const paint = () => {
    const ts = trailsInGrove(chosen.id), stops = ts.flatMap(t => stopsAfter(t.id));
    const cleared = ts.filter(t => isCleared(state, t.id)).length, passed = stops.filter(s => stopDone(state, s)).length;
    const total = ts.length + stops.length;
    root.innerHTML = `<div class="chapter-picker" role="group" aria-label="Chapters">${visible.map(tile).join('')}</div>
      <div class="course-layout">
        <aside class="chapter-overview" aria-labelledby="chapterName">
          <span class="eyebrow">${chosen.optional ? 'Optional chapter' : 'Chapter ' + chosen.n}</span>
          <h3 id="chapterName">${esc(chosen.name)}</h3>
          <div class="chapter-progress"><span style="width:${Math.round((cleared + passed) / total * 100)}%"></span></div>
          <div class="chapter-progress-label">${cleared} of ${ts.length} lessons${stops.length ? ` · ${passed} of ${stops.length} finger stops` : ''}</div>
          <div class="course-preview" id="coursePreview" aria-live="polite"></div>
          <button type="button" class="course-continue" id="courseContinue"><span>Continue</span><small>${esc(h.continueLabel)}</small><b aria-hidden="true">→</b></button>
        </aside>
        <section class="lesson-grid" aria-label="${esc(chosen.name)} lessons">${ts.map(card).join('')}</section>
      </div>`;
    preview(null);
    root.querySelectorAll<HTMLButtonElement>('[data-grove]').forEach(b => b.onclick = () => { chosen = visible.find(g => g.id === b.dataset.grove)!; paint(); root.querySelector<HTMLElement>(`[data-grove="${chosen.id}"]`)?.focus(); });
    root.querySelectorAll<HTMLButtonElement>('[data-trail]').forEach(b => b.onclick = () => { const t = TRAILS.find(x => x.id === b.dataset.trail); if (t) h.onSelect(t); });
    root.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach(b => b.onclick = () => { const s = STOPS.find(x => x.id === b.dataset.stop); if (s) h.onStop(s); });
    root.querySelectorAll<HTMLElement>('[data-trail],[data-stop]').forEach(b => { b.onmouseenter = () => preview(b); b.onfocus = () => preview(b); });
    root.querySelector<HTMLElement>('.lesson-grid')!.onmouseleave = () => preview(null);
    root.querySelector<HTMLButtonElement>('#courseContinue')!.onclick = h.onContinue;
  };
  paint();
  // On a narrow screen the chapter strip scrolls sideways; keep the chosen chapter in view.
  root.querySelector<HTMLElement>('.chapter-tile.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  root.querySelector<HTMLElement>('[aria-current="step"]')?.focus({ preventScroll: true });
  return e => {
    if (e.key === 'Escape') { e.preventDefault(); h.onClose(); return; }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const choices = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')].filter(b => b.offsetParent !== null);
    const i = choices.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault(); choices[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length]?.focus();
  };
}
