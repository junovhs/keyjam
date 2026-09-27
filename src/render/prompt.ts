import { Effects } from './effects';
import { TextFlow, type Flow, type WidthForLine } from './textflow';

export interface PromptState { text: string; pos: number; wrong: boolean; reading?: boolean }

type Palette = { ink: string; done: string; orange: string; wrongBg: string; wrongInk: string; missPill: string; missInk: string; pill: string; pillLine: string; pillInk: string; pillDone: string; pillDoneInk: string };
const DARK: Palette = { ink: '#e8e6df', done: '#8e8d86', orange: '#ff5418', wrongBg: '#ffb49f', wrongInk: '#201814', missPill: '#000', missInk: '#ff5418', pill: '#2b2c29', pillLine: '#5c5e59', pillInk: '#c5c3bc', pillDone: '#222320', pillDoneInk: '#74766f' };
const LIGHT: Palette = { ink: '#11110f', done: '#b3afa8', orange: '#ff5418', wrongBg: '#ffb49f', wrongInk: '#201814', missPill: '#11110f', missInk: '#ff5418', pill: '#fbfaf7', pillLine: '#c9c5bd', pillInk: '#6d6a65', pillDone: '#f3f1ec', pillDoneInk: '#b3afa8' };
/** Capitals are 15% larger than lowercase and underlined (see CanvasPrompt.glyph). */
export const CAPITAL_SCALE = 1.15;
export const isCapital = (ch: string): boolean => ch.length === 1 && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
export interface PromptOptions { theme?: 'dark' | 'light'; compact?: boolean; orb?: boolean }

/**
 * Canvas prompt. Owns a <canvas> inside the host, keeps a hidden text mirror for screen readers,
 * and redraws on demand (coalesced to one rAF). Nothing in draw() reads DOM layout.
 */
export class CanvasPrompt {
  readonly canvas: HTMLCanvasElement;
  private mirror: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private flow: TextFlow;
  private state: PromptState = { text: '', pos: 0, wrong: false };
  private width = 0;
  private dpr = 1;
  private raf = 0;
  private fontPx = 32;
  private padding = 8;
  /** Extra canvas outside the host's layout box, so the glow, pop and shake never clip on the text box. */
  private readonly bleed = 72;
  /**
   * How far below the host a falling letter can still be seen: down to the nearest ancestor that clips (the text
   * panel) or else the viewport's bottom edge. The canvas stops there; a fixed 1100px drop zone was ~80% of every
   * frame's pixels and all of it clipped away (PERF-03). Measured with the host, never in the frame loop.
   */
  private bleedBottom = 1100;
  /** Optional per-line width override; null = full width (the orb sets one while present). */
  widthForLine: WidthForLine | null = null;
  private lastFlow: Flow | null = null;
  readonly effects = new Effects();
  private loop = 0;
  private lastTick = 0;
  private top = 0;
  /** Scrolled flow space: the line index the view is pinned to. Effects spawn and target in this space so a scroll never jolts them. */
  private scroll = 0;
  /**
   * Animated glyph positions, indexed by text index. Pretext relayout is cheap, so every draw asks for the
   * true layout and eases each glyph toward it: finished lines scroll up smoothly, and a resize or a
   * reading-mode toggle reflows in motion instead of snapping.
   */
  private gx = new Float32Array(0);
  private gy = new Float32Array(0);
  private gplaced = false;
  private lastDraw = 0;
  private settling = false;

  private colors: Palette;
  private compact: boolean;
  private orbEnabled: boolean;
  constructor(private host: HTMLElement, opts: PromptOptions = {}) {
    this.colors = opts.theme === 'light' ? LIGHT : DARK;
    this.compact = !!opts.compact;
    this.orbEnabled = opts.orb !== false;
    host.innerHTML = '';
    host.classList.add('prompt-canvas');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.mirror = document.createElement('div');
    this.mirror.className = 'sr-only';
    this.mirror.setAttribute('aria-live', 'polite');
    host.append(this.canvas, this.mirror);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.flow = new TextFlow(this.font(), this.lineHeight(), this.letterSpacing(), 'center', 3);
    const ro = new ResizeObserver(() => this.measureHost());
    ro.observe(host);
    this.measureHost();
    host.addEventListener('pointermove', (e) => this.pointer(e));
    const leave = () => { this.effects.clearOrb(); this.widthForLine = null; this.lastFlow = null; this.requestDraw(); };
    host.addEventListener('pointerleave', leave);
    host.addEventListener('pointercancel', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  }

  /** Pointer → orb in flow coordinates. Reads one rect per event, never inside the frame loop. */
  private pointer(e: PointerEvent): void {
    if (!this.effects.enabled || !this.orbEnabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.bleed - this.padding, y = e.clientY - rect.top - this.bleed - this.top;
    this.effects.setOrb(x, y, Math.round(this.fontPx * 1.6));
    this.widthForLine = (i, ly) => this.effects.band(this.width, this.flow.lineHeight, i, ly);
    this.ensureLoop();
  }

  /** Feed a key result so effects can react. `index` is the glyph that settled (ok) or the one still waited on (miss). */
  onKey(kind: 'ok' | 'miss', index: number, strong = false): void {
    const found = this.lastFlow?.glyphs.find((x) => x.index === index);
    const lh = this.flow.lineHeight;
    // Hand effects the glyph where it is drawn right now (animated, scrolled), not where the layout says it will be.
    const g = found ? { ...found, x: this.gplaced ? this.gx[found.index]! : found.x, y: (this.gplaced ? this.gy[found.index]! : found.y) - this.scroll * lh } : undefined;
    const now = performance.now();
    if (g && kind === 'ok') {
      if (g.ch === ' ') { const p = this.spacePill(g); this.effects.hit({ ...g, x: p.x, w: p.w }, now, strong, p.h); }
      else this.effects.hit(g, now, strong);
    }
    if (g && kind === 'miss') this.effects.miss(g, now);
    this.ensureLoop();
  }
  /** The passage is done: lift the visible lines and throw a little light. */
  onComplete(): void {
    const flow = this.lastFlow;
    if (!flow) return;
    const last = flow.lines.length - 1;
    this.effects.burst(flow, Math.max(0, last - 2), last);
    this.ensureLoop();
  }

  private ensureLoop(): void {
    if (this.loop) return;
    this.lastTick = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - this.lastTick) / 1000); this.lastTick = t;
      this.effects.tick(dt);
      this.draw();
      if (this.settling || this.effects.active(t)) this.loop = requestAnimationFrame(step); else { this.loop = 0; this.requestDraw(); }
    };
    this.loop = requestAnimationFrame(step);
  }

  private font(): string { return `600 ${this.fontPx}px ${getComputedStyle(this.host).getPropertyValue('--mono') || 'ui-monospace, monospace'}`; }
  private lineHeight(): number { return Math.round(this.fontPx * (this.compact ? 1.9 : 1.75)); }
  /** Gap between glyphs. Must exceed 2× the current-box padding so the box never touches a neighbour. */
  private letterSpacing(): number { return this.state.reading ? Math.round(this.fontPx * 0.3) : Math.round(this.fontPx * (this.compact ? 0.5 : 0.32)); }
  private boxPad(): number { return Math.round(this.fontPx * 0.2); }
  /** A Space pill inside its widened slot, inset so a neighbour's cursor box (pad past the letter) always leaves a gap. */
  private spacePill(g: { x: number; w: number }): { x: number; w: number; h: number } {
    const gap = Math.round(this.fontPx * 0.18), inset = Math.max(gap, this.boxPad() + gap - this.letterSpacing());
    return { x: g.x + inset, w: Math.max(1, g.w - inset * 2), h: Math.round(this.fontPx * 1.05) };
  }

  /**
   * One letter at its slot. A capital is drawn CAPITAL_SCALE larger and underlined, so a Shift press is visible before
   * it is due; `s` is the cursor's pop, applied on top. Scaling is about the slot's centre, so spacing never changes.
   */
  private glyph(ch: string, x: number, cy: number, w: number, s: number, ink?: string): void {
    const ctx = this.ctx, cap = isCapital(ch), k = s * (cap ? CAPITAL_SCALE : 1);
    if (k === 1) ctx.fillText(ch, x, cy + 1);
    else { ctx.save(); ctx.translate(x + w / 2, cy + 1); ctx.scale(k, k); ctx.fillText(ch, -w / 2, 0); ctx.restore(); }
    if (!cap) return;
    // The underline sits just below the cursor box (1.4em tall about the glyph), so it stays outside the orange while typing
    // and never moves as the cursor arrives. It keeps the plain ink, not the white of a glyph inside the box.
    const uw = w * CAPITAL_SCALE, t = Math.max(2, Math.round(this.fontPx * 0.06)), uy = cy + 1 + Math.round(this.fontPx * 0.78);
    ctx.save(); if (ink) ctx.fillStyle = ink; ctx.fillRect(x + w / 2 - uw / 2, uy, uw, t); ctx.restore();
  }

  /** Reads host size once per resize (outside the frame loop) and re-lays out. */
  private measureHost(): void {
    const rect = this.host.getBoundingClientRect();
    this.bleedBottom = this.dropDepth(rect);
    const fontPx = this.state.reading ? Math.max(20, Math.min(28, Math.round(rect.width * 0.033))) : this.compact ? Math.max(24, Math.min(33, Math.round(rect.width * 0.03))) : Math.max(22, Math.min(34, Math.round(rect.width * 0.024)));
    const width = Math.max(1, Math.floor(rect.width) - this.padding * 2);
    // Opening a briefing/result can temporarily measure a hidden prompt at width 0.
    // Do not animate a column of offscreen letters into the new readable passage.
    if (width !== this.width) { this.gplaced = false; this.effects.reset(); }
    this.width = width;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    if (fontPx !== this.fontPx) { this.fontPx = fontPx; this.flow.setFont(this.font(), this.lineHeight(), this.letterSpacing()); }
    this.lastFlow = null;
    this.requestDraw();
  }

  /** Distance from the host's bottom to where falling letters stop being visible (see bleedBottom). */
  private dropDepth(rect: DOMRect): number {
    let bottom = innerHeight;
    for (let el = this.host.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { bottom = el.getBoundingClientRect().bottom; break; }
    }
    return Math.max(this.bleed, Math.ceil(bottom - rect.bottom) + 8);
  }

  set(s: PromptState): void {
    const readingChanged = !!s.reading !== !!this.state.reading;
    const textChanged = s.text !== this.state.text;
    this.state = { ...s };
    if (readingChanged) {
      this.flow = new TextFlow(this.font(), this.lineHeight(), this.letterSpacing(), s.reading ? 'left' : 'center', 3);
      this.measureHost();
    }
    if (textChanged || readingChanged) { this.flow.setText(s.text); this.lastFlow = null; this.mirror.textContent = s.text; this.effects.reset(); this.gplaced = false; }
    this.requestDraw();
  }

  /** Current layout (recomputed only when text/width changed or a width callback is active). */
  layout(): Flow {
    if (this.widthForLine) { this.lastFlow = this.flow.layout(this.widthForLine, this.width); return this.lastFlow; }
    if (!this.lastFlow) this.lastFlow = this.flow.layout(this.width);
    return this.lastFlow;
  }

  requestDraw(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private sizeCanvas(cssH: number): void {
    const b = this.bleed;
    const cssW = this.width + this.padding * 2 + b * 2, fullH = cssH + b + this.bleedBottom;
    const w = Math.round(cssW * this.dpr), h = Math.round(fullH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = cssW + 'px'; this.canvas.style.height = fullH + 'px';
      // Negative margins keep the host's layout box at the text's own size; the bleed hangs outside it.
      this.canvas.style.margin = `-${b}px -${b}px -${this.bleedBottom}px`;
    }
  }

  draw(): void {
    const flow = this.layout();
    const lh = this.flow.lineHeight;
    // Keep the current line and its neighbours in view, even for the final long passage.
    const currentLine = flow.glyphs.find(g => g.index === this.state.pos)?.line ?? Math.max(0, flow.lines.length - 1);
    const firstLine = Math.max(0, Math.min(currentLine - 1, flow.lines.length - 3));
    const visibleHeight = Math.min(flow.height, lh * 3);
    const cssH = Math.max(lh * (this.compact ? 1 : 2), visibleHeight) + this.padding * 2;
    this.sizeCanvas(cssH);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width + this.padding * 2 + this.bleed * 2, cssH + this.bleed + this.bleedBottom);
    ctx.translate(this.bleed, this.bleed);
    ctx.font = this.flow.font;
    ctx.textBaseline = 'middle';
    // `top` is the origin of scrolled flow space: glyph y minus the pinned line. Scrolling is animated per glyph below.
    const top = this.padding + Math.max(0, (cssH - this.padding * 2 - visibleHeight) / 2);
    this.top = top; this.scroll = firstLine;
    const { pos, wrong } = this.state;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastDraw) / 1000); this.lastDraw = now;
    const fx = this.effects, colors = this.colors;
    const pad = this.boxPad();
    // Ease every glyph toward its Pretext position (in scrolled space). Snap on a new passage or with motion off.
    const n = this.state.text.length;
    if (this.gx.length < n) { this.gx = new Float32Array(n); this.gy = new Float32Array(n); this.gplaced = false; }
    const ease = this.gplaced && fx.enabled ? 1 - Math.exp(-dt * 16) : 1;
    let moving = false;
    for (const g of flow.glyphs) {
      const tx = g.x, ty = g.y - firstLine * lh;
      const ax = this.gx[g.index]! + (tx - this.gx[g.index]!) * ease, ay = this.gy[g.index]! + (ty - this.gy[g.index]!) * ease;
      this.gx[g.index] = ax; this.gy[g.index] = ay;
      if (Math.abs(ax - tx) > 0.3 || Math.abs(ay - ty) > 0.3) moving = true;
    }
    this.gplaced = true; this.settling = moving;
    // Aim the sprung cursor at the current glyph (scrolled flow px). A brand-new passage snaps it.
    const cur0 = flow.glyphs.find((g) => g.index === pos);
    const cur = cur0 ? { ...cur0, y: cur0.y - firstLine * lh } : undefined;
    if (cur) {
      if (cur.ch === ' ') { const p = this.spacePill(cur); fx.target({ ...cur, x: p.x }, p.w, p.h, now); }
      else fx.target({ ...cur, x: cur.x - pad }, cur.w + pad * 2, Math.round(this.fontPx * 1.4), now);
    }
    const c = fx.cursor;
    const bad = !!cur && (fx.enabled ? fx.missing(now) : wrong);
    const shake = fx.shake(now);
    const scale = fx.cursorScale(now);
    const arrived = cur ? Math.abs(c.x - c.tx) < c.tw * 0.45 : false;
    fx.drawHeat(ctx, this.padding, top, lh);
    // The cursor box, drawn once at its animated position before any glyph.
    if (cur && c.placed) {
      const bx = this.padding + c.x + shake.x, by = top + c.y + lh / 2 + shake.y, bw = c.w * scale, bh = c.h * scale;
      const cx = bx + c.w / 2, r = 6;
      ctx.fillStyle = bad ? colors.missPill : colors.orange;
      if (!bad && fx.heat > 0.02) { ctx.shadowColor = `rgba(255,84,24,${0.25 + fx.heat * 0.5})`; ctx.shadowBlur = 6 + fx.heat * 18; }
      ctx.beginPath(); ctx.roundRect(cx - bw / 2, by - bh / 2, bw, bh, r); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    }
    for (const g of flow.glyphs) {
      const current = g.index === pos, done = g.index < pos;
      if (done) continue;
      const ay = this.gy[g.index]!;
      // Lines above the pinned one fade out as they slide up; anything further off is skipped.
      if (ay < -lh || ay >= lh * 3) continue;
      ctx.globalAlpha = ay < 0 ? Math.max(0, 1 + ay / lh) : 1;
      const x = this.padding + this.gx[g.index]! + (current ? shake.x : 0), cy = top + ay + lh / 2 + (current ? shake.y : 0);
      // Ink for the current glyph follows the box: white (or orange on a miss) once it has arrived, plain ink while it is still travelling.
      const currentInk = bad ? colors.missInk : arrived ? '#fff' : colors.ink;
      // Every space is a SPACE pill, reading passages included: a dot there reads as the '.' key.
      if (g.ch === ' ') {
        const p = this.spacePill({ x, w: g.w }), h = p.h, w = p.w;
        if (!current) {
          ctx.fillStyle = colors.pill;
          ctx.strokeStyle = colors.pillLine; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(p.x, cy - h / 2, w, h, 5); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = current ? currentInk : colors.pillInk;
        ctx.font = `600 ${Math.round(this.fontPx * 0.3)}px ${this.flow.font.split('px ')[1]}`;
        ctx.textAlign = 'center';
        // The label rides inside the sprung pill while current, so it never lags behind the box.
        const lx = current && c.placed ? this.padding + c.x + c.w / 2 + shake.x : p.x + w / 2;
        ctx.fillText('SPACE', lx, cy + 1); ctx.textAlign = 'left';
        ctx.font = this.flow.font;
        continue;
      }
      ctx.fillStyle = current ? currentInk : colors.ink;
      this.glyph(g.ch, x, cy, g.w, current ? scale : 1, current ? colors.ink : undefined);
    }
    ctx.globalAlpha = 1;
    // A letter that has fallen past the canvas's bottom edge is gone; freeing it lets the loop stop sooner.
    fx.floor = cssH + this.bleedBottom - top + lh;
    this.effects.draw(ctx, this.padding, top, lh, this.flow.font, flow, colors.ink);
    if (!this.loop && (this.settling || this.effects.active(now))) this.ensureLoop();
  }
}
