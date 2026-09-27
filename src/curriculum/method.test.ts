import { describe, expect, it } from 'vitest';
import { METHODS, SHIFT_FINGER, TRADITIONAL, shiftSideFor, fingerOf, homeOf, keysOf, mirrorOf, reassignedKeys, setMethod, activeMethod, DEFAULT_METHOD_ID, type TypingMethod } from './method';
import { fingerForKey } from './fingers';

const KEYS = "abcdefghijklmnopqrstuvwxyz0123456789;,./-=[]'\\` ";

describe('typing methods (DEC-17)', () => {
  it('every method covers every key exactly once, with eight fingers plus thumb', () => {
    for (const m of METHODS) {
      for (const k of KEYS) expect(m.assignments[k], `${m.id} ${JSON.stringify(k)}`).toBeTruthy();
      const ids = new Set(Object.values(m.assignments));
      expect([...ids].sort()).toEqual(['li', 'lm', 'lp', 'lr', 'ri', 'rm', 'rp', 'rr', 'thumb']);
    }
  });
  it('traditional touch typing is the one official method and the default', () => {
    expect(METHODS.map((m) => m.id)).toEqual([TRADITIONAL.id]);
    expect(DEFAULT_METHOD_ID).toBe(TRADITIONAL.id);
    expect(keysOf('lp', TRADITIONAL).sort()).toEqual(['1', '`', 'a', 'q', 'z']);
    expect(keysOf('lm', TRADITIONAL).sort()).toEqual(['3', 'c', 'd', 'e']);
    expect(keysOf('li', TRADITIONAL).sort()).toEqual(['4', '5', 'b', 'f', 'g', 'r', 't', 'v']);
    setMethod('nope');
    expect(activeMethod().id).toBe(TRADITIONAL.id);
    expect(fingerForKey('c')?.id).toBe('lm'); expect(fingerForKey('z')?.id).toBe('lp'); expect(fingerForKey('b')?.id).toBe('li');
  });
  it('shifted symbols inherit the base key; landmarks and mirrors come from the finger', () => {
    setMethod(DEFAULT_METHOD_ID);
    expect(fingerOf('!')).toBe('lp'); expect(fingerOf('(')).toBe('rr'); expect(fingerOf('C')).toBe('lm'); expect(fingerOf('?')).toBe('rp');
    expect(homeOf('c')).toBe('d'); expect(homeOf('b')).toBe('f'); expect(homeOf('z')).toBe('a');
    expect(mirrorOf('f')).toBe('j'); expect(mirrorOf('a')).toBe(';');
  });
  it('the framework still supports another official method: fingers are explicit and the reset set is derived', () => {
    // A hypothetical second method, local to this test: METHODS is where a real one would be added.
    const other: TypingMethod = { ...TRADITIONAL, id: 'example@1.0', name: 'Example', assignments: { ...TRADITIONAL.assignments, z: 'lr', b: 'ri' } };
    expect(fingerOf('z', other)).toBe('lr'); expect(fingerOf('z', TRADITIONAL)).toBe('lp');
    expect(reassignedKeys(other, TRADITIONAL).sort()).toEqual(['b', 'z']);
    expect(reassignedKeys(TRADITIONAL, TRADITIONAL)).toEqual([]);
  });
  it('lesson titles never name a finger the active method contradicts', async () => {
    const { TRAILS } = await import('./index');
    const WORDS: Record<string, string> = { index: 'i', middle: 'm', ring: 'r', pinky: 'p' };
    for (const method of METHODS) {
      setMethod(method.id);
      for (const t of TRAILS) {
        const named = Object.keys(WORDS).filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(t.name)); // "Bearings" is not "ring"
        if (!named.length || !t.newKeys) continue;
        // A title that names a finger claims every key it introduces for that finger.
        const claimed = new Set(named.map((w) => WORDS[w]));
        for (const k of t.newKeys) expect(claimed.has(fingerOf(k)!.slice(1)), `${method.id}: "${t.name}" teaches ${k} with the ${fingerOf(k)}`).toBe(true);
      }
    }
    setMethod(DEFAULT_METHOD_ID);
  });
});

describe('method-aware lesson copy', () => {
  it('resolves finger placeholders against the active method', async () => {
    const { resolveCopy, trailById } = await import('./index');
    setMethod(TRADITIONAL.id);
    expect(resolveCopy(trailById('index-stretch-up').blurb)).toContain('C is your left middle');
    expect(resolveCopy(trailById('index-down').blurb)).toContain('B belongs to your left index');
    expect(resolveCopy(trailById('ring-down').blurb)).toBe('Z is the LEFT PINKY. Period is the right ring.');
    setMethod(DEFAULT_METHOD_ID);
  });
});

describe('Shift ownership', () => {
  it('each Shift belongs to its own pinky and a shifted key takes the opposite-hand Shift', () => {
    expect(SHIFT_FINGER).toEqual({ left: 'lp', right: 'rp' });
    expect(shiftSideFor('Q')).toBe('right');
    expect(shiftSideFor('F')).toBe('right');
    expect(shiftSideFor('J')).toBe('left');
    expect(shiftSideFor('P')).toBe('left');
    expect(shiftSideFor('!')).toBe('right');
    expect(shiftSideFor('?')).toBe('left');
    expect(shiftSideFor('q')).toBeNull();
    expect(shiftSideFor(' ')).toBeNull();
  });
});
