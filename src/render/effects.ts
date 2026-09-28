import type { Band, Flow, Glyph } from './textflow';

/** How long a letter typed too quickly for the fall takes to fade out, in seconds. */
export const PLAIN_FADE_S = 0.013;
/** A typed glyph that has been cut loose: it tumbles down the page under gravity. Pooled; `life` ≤ 0 means free. */
interface Ragdoll { ch: string; x: number; y: number; w: number; h: number; vx: number; vy: number; rot: number; vr: number; life: number; ttl: number; plain: boolean }
/** A hot fleck thrown off a miss. Drawn as a short streak along its velocity. */
interface Spark { x: number; y: number; vx: number; vy: number; life: number; ttl: number; size: number }

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const MISS_MS = 420;
const POP_MS = 140;

/**
 * Per-frame effects over the canvas prompt. Everything here is positioned from the Pretext
 * glyph layout, so nothing reads the DOM: a sprung cursor box that glides to the next glyph,
 * the typed glyph itself cut loose to ragdoll down the page under gravity, a combo glow that warms up
 * under the cursor, and the miss — a black pill, an orange letter, a violent shake and a spray of sparks before the
 * box returns to waiting. Pools are fixed; tick() allocates nothing.
 */
export class Effects {
  readonly ragdolls: Ragdoll[] = Array.from({ length: 160 }, () => ({ ch: '', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, ttl: 1, plain: false }));
  readonly sparks: Spark[] = Array.from({ length: 160 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 1, size: 1 }));
  private liveRagdolls = 0;
  private liveSparks = 0;

  /** Cursor box in flow px: animated position/size and the target it is springing to. */
  readonly cursor = { x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, vw: 0, tx: 0, ty: 0, tw: 0, th: 0, movedAt: -Infinity, placed: false };
  /** Miss window: when it started (−∞ = not missing). */
  missAt = -Infinity;
  /** 0..1 combo warmth under the cursor. Rises with correct keys, collapses on a miss. */
  heat = 0;
  /** Orb in flow px, or null when the pointer is away. */
  orb: { x: number; y: number; r: number } | null = null;
  enabled = !reducedMotion();
  /** Flow-px y below which a falling letter can no longer be seen (the prompt's canvas edge); it is freed there. */
  floor = Infinity;
  private seed = 1;
  private rnd(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** Anything animating right now? Drives whether the prompt keeps a rAF loop alive. */
  active(now: number): boolean {
    if (!this.enabled) return false;
    const c = this.cursor;
    const springing = Math.abs(c.x - c.tx) > 0.2 || Math.abs(c.y - c.ty) > 0.2 || Math.abs(c.w - c.tw) > 0.2 || Math.abs(c.vx) > 1 || Math.abs(c.vy) > 1;
    return this.liveRagdolls > 0 || this.liveSparks > 0 || springing || now < this.missAt + MISS_MS
      || now < c.movedAt + POP_MS || this.heat > 0.01 || this.orb !== null;
  }

  /** Aim the cursor at a glyph. Snaps when nothing has been placed yet (new text) or motion is off. */
  target(g: Glyph, w: number, h: number, now: number, snap = false): void {
    const c = this.cursor;
    const moved = c.tx !== g.x || c.ty !== g.y;
    c.tx = g.x; c.ty = g.y; c.tw = w; c.th = h;
    if (snap || !c.placed || !this.enabled) { c.x = g.x; c.y = g.y; c.w = w; c.h = h; c.vx = c.vy = c.vw = 0; c.placed = true; return; }
    if (moved) c.movedAt = now;
  }
  /** Forget the cursor so the next target snaps (new passage). */
  reset(): void { this.cursor.placed = false; this.missAt = -Infinity; this.heat = 0; }

  /**
   * A correct key on glyph `g`: cut it loose. It gets a small kick (up and to the side, away from the
   * cursor's direction of travel), starts tumbling, and falls under gravity until it leaves the page.
   * `h` is the drawn height of a Space pill; letters ignore it. `plain` (typed faster than the perfect pace, PACE-01):
   * no fall, no kick, no heat — the glyph just fades out in PLAIN_FADE_S. The fall is the reward for going slowly.
   */
  hit(g: Glyph, now: number, strong = false, h = 0, plain = false): void {
    void now;
    if (!this.enabled) return;
    const r = this.ragdolls.find((x) => x.life <= 0);
    if (!r) return;
    r.ch = g.ch; r.x = g.x + g.w / 2; r.y = g.y; r.w = g.w; r.h = h;
    r.plain = plain; r.rot = 0;
    if (plain) { r.vx = r.vy = r.vr = 0; r.ttl = PLAIN_FADE_S; r.life = r.ttl; this.liveRagdolls++; return; }
    r.vx = (this.rnd() - 0.5) * 220 - 40; r.vy = -(140 + this.rnd() * 160);
    r.vr = (this.rnd() - 0.5) * 16 + (r.vx < 0 ? -3 : 3);
    r.ttl = 1.5; r.life = r.ttl;
    this.liveRagdolls++;
    this.heat = Math.min(1, this.heat + (strong ? 0.12 : 0.07));
  }
  /** A wrong key on the current glyph: the pill, the shake and the sparks. */
  miss(g: Glyph, now: number): void {
    if (!this.enabled) return;
    this.missAt = now;
    this.heat = 0;
    this.spawnSparks(g.x + g.w / 2, g.y, 22);
  }
  /** Passage finished: the last line throws sparks. Its glyphs have already fallen. */
  burst(flow: Flow, firstLine: number, lastLine: number): void {
    void firstLine;
    if (!this.enabled) return;
    const line = flow.lines[Math.min(lastLine, flow.lines.length - 1)];
    if (line) for (let i = 0; i < 6; i++) this.spawnSparks(line.x + (line.width * (i + 0.5)) / 6, line.y, 6);
    this.heat = 1;
  }
  /** Inside the miss window? */
  missing(now: number): boolean { return now < this.missAt + MISS_MS; }
  /** Shake offset for the current glyph, px. Violent at first, dying to nothing over the window. */
  shake(now: number): { x: number; y: number } {
    if (!this.missing(now)) return { x: 0, y: 0 };
    const t = (now - this.missAt) / MISS_MS, env = (1 - t) * (1 - t);
    const w = now * 0.28; // ~45 Hz
    return { x: Math.sin(w) * 11 * env, y: Math.cos(w * 0.63) * 4 * env };
  }
  /** Scale pop for the cursor box after it lands, and for the miss pill. */
  cursorScale(now: number): number {
    const pop = Math.max(0, 1 - (now - this.cursor.movedAt) / POP_MS);
    const miss = this.missing(now) ? (1 - (now - this.missAt) / MISS_MS) : 0;
    return 1 + 0.14 * pop * pop + 0.22 * miss * miss;
  }

  private spawnSparks(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const s = this.sparks.find((p) => p.life <= 0);
      if (!s) return;
      const a = -Math.PI / 2 + (this.rnd() - 0.5) * Math.PI * 1.5; // mostly upward, some sideways
      const v = 160 + this.rnd() * 320;
      s.x = x + (this.rnd() - 0.5) * 8; s.y = y + (this.rnd() - 0.5) * 8;
      s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
      s.ttl = 0.3 + this.rnd() * 0.35; s.life = s.ttl; s.size = 1.8 + this.rnd() * 2.2;
      this.liveSparks++;
    }
  }
  setOrb(x: number, y: number, r: number): void { if (!this.enabled) return; if (!this.orb) this.orb = { x, y, r }; else { this.orb.x = x; this.orb.y = y; this.orb.r = r; } }
  clearOrb(): void { this.orb = null; }

  /** Band for a line so it avoids the orb: text goes to whichever side has more room. */
  band(width: number, lineHeight: number, i: number, y: number): number | Band {
    const o = this.orb;
    if (!o) return width;
    const cy = y + lineHeight / 2;
    const dy = Math.abs(cy - o.y);
    if (dy >= o.r + lineHeight * 0.45) return width;
    const half = Math.sqrt(Math.max(0, o.r * o.r - dy * dy)) + lineHeight * 0.4;
    const left = o.x - half, right = o.x + half;
    if (left >= width - left && left > 0) return { x: 0, width: Math.max(1, left) };
    return { x: Math.min(width - 1, Math.max(0, right)), width: Math.max(1, width - right) };
  }

  tick(dt: number): void {
    // Cursor spring: a touch under-damped so the box lands with a little life.
    const c = this.cursor;
    if (c.placed) {
      const k = 900, d = 2 * Math.sqrt(k) * 0.82;
      c.vx += ((c.tx - c.x) * k - c.vx * d) * dt; c.x += c.vx * dt;
      c.vy += ((c.ty - c.y) * k - c.vy * d) * dt; c.y += c.vy * dt;
      c.vw += ((c.tw - c.w) * k - c.vw * d) * dt; c.w += c.vw * dt;
      c.h = c.th;
    }
    this.heat = Math.max(0, this.heat - dt * 0.28);
    // Real gravity for the ragdolls: ~2000 px/s², so a letter clears the viewport in about a second.
    if (this.liveRagdolls > 0) for (const r of this.ragdolls) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { this.liveRagdolls--; continue; }
      r.vy += 2000 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
      if (r.y > this.floor) { r.life = 0; this.liveRagdolls--; }
    }
    if (this.liveSparks > 0) for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { this.liveSparks--; continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 1100 * dt; s.vx *= 1 - 1.6 * dt;
    }
  }

  /** The glow that sits under the cursor. Drawn before the glyphs. */
  drawHeat(ctx: CanvasRenderingContext2D, ox: number, oy: number, lineHeight: number): void {
    if (this.heat <= 0.01) return;
    const c = this.cursor, cx = ox + c.x + c.w / 2, cy = oy + c.y + lineHeight / 2;
    const r = lineHeight * (0.9 + this.heat * 1.1), a = 0.08 + this.heat * 0.3;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,120,60,${a})`); g.addColorStop(0.5, `rgba(255,84,24,${a * 0.35})`); g.addColorStop(1, 'rgba(255,84,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  /** Draw sparks, ragdolls and the orb over the glyphs. `ox/oy` = flow origin on the canvas. */
  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, lineHeight: number, font: string, flow: Flow, ink: string): void {
    void flow;
    const o = this.orb;
    if (o) {
      const g = ctx.createRadialGradient(ox + o.x, oy + o.y, 0, ox + o.x, oy + o.y, o.r);
      g.addColorStop(0, 'rgba(255,84,24,.55)'); g.addColorStop(0.55, 'rgba(255,84,24,.18)'); g.addColorStop(1, 'rgba(255,84,24,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + o.x, oy + o.y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8b61'; ctx.beginPath(); ctx.arc(ox + o.x, oy + o.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (this.liveSparks > 0) {
      ctx.lineCap = 'round';
      for (const s of this.sparks) {
        if (s.life <= 0) continue;
        const a = s.life / s.ttl;
        const x = ox + s.x, y = oy + s.y + lineHeight / 2;
        ctx.strokeStyle = a > 0.5 ? `rgba(255,200,120,${a})` : `rgba(255,84,24,${a * 1.6})`;
        ctx.lineWidth = s.size * a + 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx * 0.028, y - s.vy * 0.028); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    if (this.liveRagdolls > 0) {
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const small = `600 ${Math.round(lineHeight * 0.19)}px ${font.split('px ')[1]}`;
      for (const r of this.ragdolls) {
        if (r.life <= 0) continue;
        const t = r.life / r.ttl;
        ctx.save();
        ctx.globalAlpha = r.plain ? t : Math.min(1, t * 4); // a plain fade is linear; a fall stays solid until the very end
        ctx.translate(ox + r.x, oy + r.y + lineHeight / 2);
        ctx.rotate(r.rot);
        if (r.ch === ' ') {
          ctx.fillStyle = '#fbfaf7'; ctx.strokeStyle = '#c9c5bd'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 5); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#6d6a65'; ctx.font = small; ctx.fillText('SPACE', 0, 1); ctx.font = font;
        } else { ctx.fillStyle = ink; ctx.fillText(r.ch, 0, 0); }
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }
  }
}
