import { describe, expect, it } from 'vitest';
import { Run } from './run';

const play = (text: string, gaps: number[]) => { const r = new Run(text); let t = 1000; r.begin(t); [...text].forEach((c, i) => { t += gaps[i % gaps.length]!; r.type(c, t); }); return r; };

describe('Run.rhythm', () => {
  it('slow and even scores as well as fast and even', () => {
    const slow = play('fjfjfjfjfjfjfjfj', [900, 920, 880, 910]);
    const fast = play('fjfjfjfjfjfjfjfj', [180, 190, 170, 185]);
    expect(slow.rhythm()).toBeGreaterThan(0.85);
    expect(Math.abs(slow.rhythm() - fast.rhythm())).toBeLessThan(0.05);
  });
  it('bursts then pauses score low', () => {
    const bursty = play('fjfjfjfjfjfjfjfj', [120, 120, 900, 120, 120, 1100]);
    expect(bursty.rhythm()).toBeLessThan(0.5);
  });
  it('needs a few strokes; the first key never counts', () => {
    expect(play('fj', [5000, 200]).rhythm()).toBe(0);
    const r = play('fjfjfjfj', [5000, 300, 300, 300, 300, 300, 300, 300]);
    expect(r.rhythm()).toBeGreaterThan(0.5);
  });
});

it('word boundaries do not turn fluent phrasing into uneven typing', () => {
  const text = 'the rain falls the rain falls';
  const r = new Run(text); let t = 1000; r.begin(t);
  [...text].forEach((c, i) => { t += c === ' ' || text[i - 1] === ' ' ? 450 : 150; r.type(c, t); });
  expect(r.rhythm()).toBe(1);
  expect(r.metrics(t).acc).toBe(100);
});

it('missing a space is observed and must be corrected, but never lowers accuracy', () => {
  const r = new Run('f j'); r.begin(1000);
  r.type('f', 1300);
  expect(r.type('j', 1600)).toBe('miss');
  expect(r.pos).toBe(1);
  r.type(' ', 1900); r.type('j', 2200);
  expect(r.status).toBe('complete');
  expect(r.errors).toBe(1);
  expect(r.metrics(2200).acc).toBe(100);
  expect(r.strokes[1]).toMatchObject({ key: ' ', typed: 'j', correct: false });
});

it('a space pressed where a letter was wanted still counts against accuracy', () => {
  const r = new Run('f j'); r.begin(1000);
  r.type('f', 1300); r.type(' ', 1600);
  expect(r.type(' ', 1900)).toBe('miss');
  r.type('j', 2200);
  expect(r.metrics(2200).acc).toBe(67);
});
