/**
 * How prepared an exercise's movements are, for the ?dev trace and curriculum tests (dev-only, never shown).
 *
 *   warmedNow    — the bigram already appeared earlier in this lesson attempt
 *   knownAlready — not warmed now, but the learner has prior evidence for it
 *   novel        — neither
 *
 * Counts are over within-word letter bigram occurrences; spaces and punctuation end a word.
 * No threshold is implied (handoff 2026-09-22 step 8: a hypothesis until measured).
 */
export function wordBigrams(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).flatMap((w) => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(i, i + 2)));
}

/** One exercise's bigram occurrences split three ways, with rounded shares and the distinct novel bigrams. */
export interface Preparation {
  bigramOccurrences: number;
  warmedNow: number;
  knownAlready: number;
  novel: number;
  warmedShare: number;
  knownShare: number;
  novelShare: number;
  novelBigrams: string[];
}

const share = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 1000 : 0);

/** Classify each within-word bigram of `text`: warmed (in `warmed`) before known (in `known`) before novel. */
export function classifyPreparation(text: string, warmed: ReadonlySet<string>, known: ReadonlySet<string>): Preparation {
  const grams = wordBigrams(text);
  let warmedNow = 0, knownAlready = 0;
  const novel: string[] = [];
  for (const g of grams) {
    if (warmed.has(g)) warmedNow++;
    else if (known.has(g)) knownAlready++;
    else novel.push(g);
  }
  return {
    bigramOccurrences: grams.length, warmedNow, knownAlready, novel: novel.length,
    warmedShare: share(warmedNow, grams.length), knownShare: share(knownAlready, grams.length), novelShare: share(novel.length, grams.length),
    novelBigrams: [...new Set(novel)],
  };
}

/** The shape of a trace record this module needs. */
export interface TracedRun { mode?: string; lesson?: { id?: string }; exercise?: { index?: number }; prompt?: string }

/**
 * Prompts typed earlier in the current attempt at `lessonId`, before exercise `index` (1-based). Walks back from the newest
 * record and stops at anything from another lesson or mode, or at a later exercise — which marks an earlier attempt, so
 * replaying a lesson never counts the previous pass as warm-up. Retries of the current exercise are skipped, not counted.
 */
export function attemptPrompts(runs: readonly TracedRun[], lessonId: string, index: number): string[] {
  const out: string[] = [];
  let next = index;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!;
    const at = r.exercise?.index ?? 0;
    if (r.mode !== 'trail' || r.lesson?.id !== lessonId || at > next) break;
    if (at < next) { out.unshift(String(r.prompt ?? '')); next = at; }
  }
  return out;
}
