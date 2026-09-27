# KeyJam

*The repository keeps its original name, `keygrove`; the package is `keyjam`.*

A short-lesson typing course: Duolingo's structure with classical-guitar practice. Each lesson finds its new keys, isolates one research-chosen movement, carries it into real words, then uses those words in a phrase. It teaches standard touch typing.

36 lessons across seven chapters cover letters, capitals, punctuation, numbers and longer mixed text. Four optional code lessons follow Bark. One Continue action leads through the course. Seven illustrated keepsakes mark the main chapters, and Code has an eighth. Speed and absence never gate progress.

## Development

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

TypeScript 7 native compiler, Vite, vanilla DOM/SVG UI, and a canvas typing prompt laid out with Pretext. `?dom=1` enables the diagnostic DOM prompt. `?dev` opens a dev sandbox: every chapter, lesson and finger stop is open from its start, all charms show, a dev bar jumps or passes exercises, and progress is kept in that tab only (the real save, account and sync are untouched). It also keeps a session trace of every run (`keyjam.dev.report()` in the console), including how much of each exercise the lesson warmed up. The About panel and static `/docs/` pages share `src/docs-content.ts` through dopedocs.

Guest learning persists locally in a separate save. The optional account uses Supabase; see [account setup](docs/accounts.md). Never put privileged credentials in the browser build.

## Product contracts

- [North star](docs/north-star.md): what the product is and is not.
- [Course progression](docs/progression.md): chapters, lesson anatomy, evidence, balance and compatibility.
- [Movement research](research/typing-movements/): corpus analysis behind the movement vocabulary. `make download analyze export` regenerates `src/curriculum/movements.ts`.
- Ishoo ADRs DEC-10, DEC-11 and DEC-13 to DEC-17 govern the method, curriculum, evidence and product surface. Work is tracked in Ishoo (plans *Movement vocabulary* and *Lesson coherence*).

The app observes characters and timing, not finger choice or posture. Completing the course shows performance on its passages; it does not promise a particular real-world typing speed.

## Verification

Tests cover every trail and stage across deterministic seeds, allowed-key and checkpoint coverage, the 43 core-bigram coverage check, hand and finger balance, each lesson's drill → words → phrase contract, both methods through all 40 lessons, timing and accuracy, guest/account isolation, save migration and permanent keepsakes. Browser checks drive the real app with key events in headless Chrome.
