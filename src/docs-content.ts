/** Public course instructions, rendered in the app and as crawlable documentation pages. */
import { defineDocs, defineFacts } from 'dopedocs';
import { CHUNKS, TECHNICAL_TRANSITIONS } from './curriculum/movements';
export const PRODUCT = 'KeyJam';
export const FACTS = defineFacts({
  price: { value: 'free', reviewed: '2026-09-21' },
  storage: { value: 'this browser, or your account when signed in', reviewed: '2026-09-21' },
  account: { value: 'free and optional; it syncs progress across devices', reviewed: '2026-09-21' },
  method: { value: 'standard touch typing', reviewed: '2026-09-22' },
  lessons: { value: '36', reviewed: '2026-09-21' },
  chapters: { value: '7', reviewed: '2026-09-21' },
  checkpoint: { value: '97%', reviewed: '2026-09-21' },
});
// Section ids are public URLs (/docs/<id>/). Keep the six original ones stable; add children beneath them.
export const docs = defineDocs({
  entity: { name: PRODUCT, url: 'https://keygrove-phi.vercel.app', legalName: 'Strange Systems', notToBeConfusedWith: ['a keyboard layout', 'a keyboard remapper', 'Dvorak or Colemak'], sameAs: ['https://github.com/junovhs/keygrove'] },
  identity: { name: PRODUCT, version: '0.5.0', channel: 'Early access', maker: { name: 'Strange Systems', href: '#who-makes-this' } },
  title: 'An ordinary keyboard. A gentler approach.',
  lead: 'A complete guided course in making your hands more at home with the keyboard. Accuracy first. Time to settle. Something small to keep along the way.',
  facts: FACTS,
  sections: [
    { id: 'what-it-is', title: 'Your course', question: 'What is KeyJam?', answer: `${PRODUCT} is a free, guided course in standard touch typing on an ordinary QWERTY keyboard. Its ${FACTS.lessons.value} lessons in ${FACTS.chapters.value} chapters cover letters, capitals, punctuation, numbers and longer mixed passages, with four optional code lessons. Nothing is installed and nothing is remapped.`, keywords: ['typing course', 'touch typing', 'keyjam', 'learn to type'], blocks: [
      { kind: 'facts', title: 'At a glance', rows: [['Price', '{fact:price}'], ['Method', 'Standard touch typing ({fact:method})'], ['Course', '{fact:lessons} lessons in {fact:chapters} chapters, plus an optional Code chapter'], ['Keyboard', 'Any physical QWERTY keyboard; nothing is remapped'], ['Progress', 'Saved in {fact:storage}']] },
      { kind: 'p', text: 'You do not need to plan a practice session or understand a scoring system. Each lesson introduces a few keys, mixes them with movements you already know, then uses them in fresh text. **Continue** always takes you to what comes next.' },
      { kind: 'steps', items: [
        { title: 'Open the app on a computer', text: 'Use a physical QWERTY keyboard. A phone keyboard cannot teach finger placement.' },
        { title: 'Read the short briefing', text: 'New-key lessons open with a **Before you begin** card that lights the finger and key the step is about and names the movement the lesson builds. Press any key to move through it, or **Escape** to skip it.' },
        { title: 'Type the highlighted character', text: 'Start with F, J and Space. Begin by typing the highlighted character or pressing **Enter**. A wrong key stays highlighted until you type the right one; nothing advances on a mistake.' },
        { title: 'Press Continue', text: 'Every pass moves you one exercise forward. The last exercise of a lesson opens the next one. That is the whole loop.' },
      ] },
      { kind: 'callout', tone: 'note', text: 'Spaces count too. The small dot in a passage is a space; either thumb can press it. There is no countdown and no timer.' },
      { kind: 'keys', rows: [['Any key', 'Begin the passage, or move on from a result'], ['Enter', 'Begin the passage; the course-complete screen waits for Enter alone'], ['Escape', 'Restart the current passage, or skip a briefing'], ['Tab', 'Move through the interface controls without typing into the passage'], ['⟲ (top-right of the text box)', 'Restart the current passage']] },
    ], children: [
      { id: 'the-chapters', title: 'The chapters', question: 'What are the chapters in KeyJam?', answer: `${PRODUCT} has seven chapters on the main course — Roots, Home, Canopy, Undergrowth, Bark, Rings and Flow — plus an optional Code chapter that opens after Bark. Each chapter ends in a checkpoint passage that needs ${FACTS.checkpoint.value} accuracy.`, keywords: ['chapters', 'lessons', 'curriculum', 'course map'], blocks: [
        { kind: 'table', head: ['Chapter', 'What you meet'], rows: [
          ['1 · Roots', 'F J and Space, D K, E I, G H, V M. Six lessons. Real two-handed words from the third lesson on.'],
          ['2 · Home', 'R U, S L, A and semicolon, N T. Five lessons of everyday connections.'],
          ['3 · Canopy', 'C Y across the stagger, W O, Q P. Four lessons.'],
          ['4 · Undergrowth', 'B, the connected lower row, X and comma, Z and full stop, slash. Six lessons.'],
          ['5 · Bark', 'Opposite-hand Shift, sentences, quotes and questions, dashes, colons and parentheses. Five lessons.'],
          ['6 · Rings', 'Left numbers, right numbers, mixed numbers, common symbols. Five lessons.'],
          ['7 · Flow', 'Bigrams, common words, pangrams and quotes, endurance, the final mixed assessment. Five lessons.'],
          ['Code (optional)', 'Braces and brackets, angles and equals, arrows, snippets. Four lessons. Turn it on in Settings after Bark.'],
        ] },
        { kind: 'p', text: 'The **Course** book shows your place and lets you revisit any earlier lesson. Text generation never uses a character you have not been taught, and every lesson guarantees its new keys appear rather than leaving that to chance.' },
        { kind: 'details', summary: 'What the Code chapter is for', text: 'Four lessons of brackets, angle brackets, equals, arrows and short snippets for people who write code. Enable it from **Settings → Code grove**. It never blocks the main course, it has its own keepsake, and you can turn it off again without losing anything.' },
      ] },
    ] },
    { id: 'the-method', title: 'The method', question: 'Which typing method does KeyJam teach?', answer: `${PRODUCT} teaches standard touch typing by default: the conventional QWERTY finger assignments, with F and J as tactile landmarks and Shift on the opposite hand.`, keywords: ['finger assignment', 'touch typing', 'home row', 'landmarks', 'traditional'], blocks: [
      { kind: 'p', text: 'Every key has one preferred finger, and the map is the one taught in typing classes for a century: each finger owns a slanted column, the index fingers cover the two middle columns, and the thumbs press Space. A predictable map is what lets key selection become automatic.' },
      { kind: 'p', text: 'Find the bumps on F and J with your index fingers and use them to orient yourself. They are **landmarks, not anchors**: they tell your hands where they are, they are not places every finger must return to after each keystroke. Rest lightly near the home row and let the hand move a little toward a reach instead of holding it rigidly in place.' },
      { kind: 'checklist', items: [
        { text: 'Rest the fingers lightly near the home row; find F and J by feel.' },
        { text: 'Move the finger first, then let the hand shift a little; return toward neutral when it is easy.' },
        { text: 'Press down, not across. Light pressure is enough.' },
        { text: 'Each Shift belongs to the pinky on its side. Hold the Shift on the opposite hand from the letter: right pinky on right Shift for a left-hand letter, left pinky on left Shift for a right-hand letter. Either thumb presses Space.' },
        { text: 'Read ahead and prepare the next finger while the current one presses.' },
        { text: 'Pause when you notice tension. Slow, accurate practice counts fully.' },
      ] },
      { kind: 'callout', tone: 'note', text: 'The app draws finger assignments, but a browser cannot see which finger you actually used or whether you looked down. Use the guide deliberately and give unfamiliar reaches time. This is a teaching method, not a measured ergonomic assessment, and it makes no claim about preventing injury.' },
    ], children: [
      { id: 'finger-map', title: 'Finger map', question: 'Which finger presses which key in standard touch typing?', answer: 'Standard touch typing gives every key one finger. Left hand: pinky Q A Z; ring W S X; middle E D C; index R F V T G B. Right hand: index Y U H J N M; middle I K comma; ring O L full stop; pinky P semicolon slash.', keywords: ['finger map', 'which finger', 'key assignment'], blocks: [
        { kind: 'table', head: ['Finger', 'Keys'], rows: [
          ['Left pinky', 'Q · A · Z'],
          ['Left ring', 'W · S · X'],
          ['Left middle', 'E · D · C'],
          ['Left index', 'R · F · V · T · G · B'],
          ['Right index', 'Y · U · H · J · N · M'],
          ['Right middle', 'I · K · ,'],
          ['Right ring', 'O · L · .'],
          ['Right pinky', 'P · ; · /'],
        ] },
        { kind: 'p', text: 'Numbers follow the same columns: 1 and 2 to the left pinky and ring, 3 to the middle, 4 and 5 to the index; 6 and 7 to the right index, 8 middle, 9 ring, 0 pinky. Shifted symbols use the finger of the key underneath them, with Shift held by the pinky of the other hand.' },
        { kind: 'p', text: 'The map is deliberately stable through the whole course. A learner who keeps changing assignments in search of a marginal gain interferes with their own motor learning; learn one map first, optimise later if you ever want to.' },
      ] },
      { id: 'movements', title: 'Practising movements', question: 'How does KeyJam practise typing movements?', answer: `${PRODUCT} treats typing as movements between keys, not just keys. Each new-key lesson isolates one movement, carries it into everyday words and then into a short phrase, so the same motion has to hold in real text.`, keywords: ['movements', 'transition loop', 'steady beat', 'practice forms', 'bigrams'], blocks: [
        { kind: 'p', text: 'Knowing where a key is does not make the reach to it easy. So each new-key lesson picks one movement, such as M to U or I to S, and works on that motion in three forms.' },
        { kind: 'steps', items: [
          { title: 'Connect M and U', text: 'The transition loop: one pair typed both ways with a rest between (mu um mum). Where a same-finger pair applies it is chosen; otherwise the most common pair your new letter makes.' },
          { title: 'Keep it even', text: 'The steady beat, used only when a movement you type accurately still comes out uneven: the same loop to a quiet pulse set a little slower than your own usual pace. It ends with one word (Even, Mostly even or Uneven) and three small bars. No number, no score.' },
          { title: 'Carry it into words', text: 'The word line: everyday words concentrated on that same movement, then a short phrase that reuses them.' },
        ] },
        { kind: 'p', text: 'Ordinary prose closes the lesson. If the movement slips there, one sentence names it and it comes back in a later lesson; nothing is scored for it.' },
        { kind: 'facts', title: 'Where the movements come from', rows: [['Isolated movements', `${TECHNICAL_TRANSITIONS.length} same-finger pairs, the ones English uses most`], ['Common chunks', `${CHUNKS.length} (${CHUNKS.map((c) => c.ngram).join(' ')}), practised only inside words`], ['Chosen by', 'How often a movement occurs in real English, crossed with what the hand has to do']] },
        { kind: 'p', text: '**Continue** chooses the movement and the form from your own practice. There is no menu, setting or schedule to manage. Pace is never asked for: words per minute appears once, on the Flow checkpoint. If you race through an early drill, a note suggests trying it once slowly.' },
        { kind: 'callout', tone: 'note', text: 'The movement list is provisional: it comes from large text collections and will be revised as real practice data arrives. And the app cannot see which finger you used; it shows the intended one and leaves the checking to you.' },
      ] },
    ] },
    { id: 'progress', title: 'How you advance', question: 'How do I finish a lesson in KeyJam?', answer: `Each lesson is a short, visible sequence of exercises. Every pass at the shown accuracy target moves you forward one exercise; the last exercise completes the lesson. Chapter checkpoints require ${FACTS.checkpoint.value} accuracy. Speed is never a gate.`, keywords: ['accuracy', 'pass', 'exercise', 'checkpoint', 'wpm'], blocks: [
      { kind: 'metrics', items: [
        { value: '90%', label: 'Roots target', detail: 'Rises one or two points per chapter' },
        { value: '96%', label: 'Flow target', detail: 'The highest lesson target' },
        { value: '{fact:checkpoint}', label: 'Checkpoints', detail: 'Every chapter passage' },
        { value: '0', label: 'Speed gates', detail: 'Words per minute is shown, never required' },
      ] },
      { kind: 'p', text: 'Each lesson shows its exercise count and purpose: meet the movement, connect it with familiar ones, use it in words, then apply it in a passage. Guided introductions have no score at all; they advance when you complete them. Assessed exercises advance the moment you meet the target on screen.' },
      { kind: 'list', items: [
        'A failed attempt retries only the current exercise, never the whole lesson.',
        'There are no hidden repeat requirements. What you see is the whole sequence.',
        'Completed exercises and lessons stay saved. Absence never removes progress.',
        'Pace is shown in words per minute (five characters per word) as information, not a requirement.',
      ] },
      { kind: 'callout', tone: 'note', text: 'Speed grows from familiarity and connected movement. The course does not ask you to go faster, and it does not promise a words-per-minute figure.' },
    ], children: [
      { id: 'practice-and-warm-ups', title: 'Practice and warm-ups', question: 'Why did KeyJam give me a practice instead of the next exercise?', answer: 'Only a repeated mistake pattern triggers a short targeted practice. Continue offers it once, it returns you to the lesson afterwards, and you can choose the passage instead. After a break, a short optional warm-up covers keys that are due for review.', keywords: ['practice', 'warm-up', 'review', 'repair', 'mistakes'], blocks: [
        { kind: 'steps', items: [
          { title: 'A movement keeps getting mixed up', text: 'The course notices repeated confusion between keys, not a single slip and not slowness. Timing on its own never redirects you.' },
          { title: 'Continue offers one short practice', text: 'It is bounded in length and covers only the keys it names. It never generates further practices of its own.' },
          { title: 'You return to the lesson', text: 'The practice always hands you back to the exercise you were on. Skip it if you would rather try the passage.' },
        ] },
        { kind: 'details', summary: 'What counts as rhythm evidence', text: 'Timing is measured only on a correct press that follows another correct press inside a word. Word boundaries, retries and any pause of two seconds or more are ignored, so thinking time is never held against you. A clean sequence means consecutive correct presses in the current passage; it is not a daily streak and it does not expire.' },
        { kind: 'details', summary: 'Finger stops', text: 'Between lessons, Continue sometimes opens a **finger stop**: one level for a pair of fingers (index, middle, ring or pinky), placed just after the lesson that teaches the keys it needs. There are ten per pair. The first three are gentle reaches; the rest are deliberately hard: row jumps, words packed with those keys, same-finger runs, twisters, capitals, numbers and symbols, and a final gauntlet. Each hand needs 95% on its own keys to pass. Stops appear as small chips under their lesson in **Course**, where you can replay any you have passed.' },
      ] },
    ] },
    { id: 'keepsakes', title: 'Charms', question: 'How do charms work in KeyJam?', answer: 'KeyJam has twenty pixel-art charms: one per chapter checkpoint, and three per finger pair at its row jumps, twisters and gauntlet stops. A new charm flies onto the screen when you earn it; click it under **Charms** to let it out again. Nothing is bought, lost or left to chance.', keywords: ['keepsake', 'charm', 'reward', 'collection', 'replay'], blocks: [
      { kind: 'cards', items: [
        { title: 'Falling stars', text: 'Roots. Your first words on F, J, D, K, E, I, G, H, V and M.', label: 'Chapter 1' },
        { title: 'House cat', text: 'Home. The home row and everyday connections.', label: 'Chapter 2' },
        { title: 'Paper kite', text: 'Canopy. Reaches across the stagger to the top row.', label: 'Chapter 3' },
        { title: 'Emerald beetle', text: 'Undergrowth. The lower row and its punctuation.', label: 'Chapter 4' },
        { title: 'Sealed letter', text: 'Bark. Capitals, sentences and real punctuation.', label: 'Chapter 5' },
        { title: 'Brass watch', text: 'Rings. Numbers, dates, prices and symbols.', label: 'Chapter 6' },
        { title: 'Music box', text: 'Flow. Whole passages in unfamiliar writing.', label: 'Chapter 7' },
        { title: 'Folded fox', text: 'Code. Brackets, arrows and snippets, if you enable the optional chapter.', label: 'Optional' },
      ] },
      { kind: 'cards', items: [
        { title: 'Sparrow · paper plane · comet', text: 'Index fingers: row jumps, twisters, the gauntlet.', label: 'Index' },
        { title: 'Snail · balloon · moon', text: 'Middle fingers: row jumps, twisters, the gauntlet.', label: 'Middle' },
        { title: 'Snake · koi · crystal', text: 'Ring fingers: row jumps, twisters, the gauntlet.', label: 'Ring' },
        { title: 'Frog · butterflies · rainbow', text: 'Pinkies: row jumps, twisters, the gauntlet.', label: 'Pinky' },
      ] },
      { kind: 'p', text: 'Every charm moves its own way. The sparrow flaps across the sky, the snake slithers through a corner, the frog hops along the floor, and the rarest ones shimmer like foil. With reduced motion turned on, a charm appears still for a moment instead.' },
      { kind: 'p', text: 'Open **Charms** to let one out or to replay a chapter passage. When you finish the replay, Continue returns you to your unfinished course. Charms come from your permanent checkpoint clears and finger-stop passes, so an older save gains its charms automatically and a change of method never removes one.' },
      { kind: 'p', text: 'Finishing Flow completes the course and leaves fresh practice passages and every earlier lesson available. Take the skill into messages, notes and everyday writing; learning does not stop at the last screen.' },
    ] },
    { id: 'your-data', title: 'Your progress', question: 'Where does KeyJam save my progress?', answer: `${PRODUCT} stores progress in ${FACTS.storage.value}. An account is ${FACTS.account.value}. A guest page makes no request to the account service.`, keywords: ['save', 'backup', 'export', 'import', 'account', 'sync', 'reset'], blocks: [
      { kind: 'p', text: 'Guest progress stays in this browser after you close the tab. A new account carries your current work forward; signing into an existing account opens that account’s course. Your guest copy and your signed-in copy are stored separately, and signing out leaves the account copy on the server, not on the device.' },
      { kind: 'callout', tone: 'warn', text: 'Clearing browser storage can remove a guest save. Export a backup, or create a free account, before you clear site data or switch browsers.' },
      { kind: 'steps', items: [
        { title: 'Open Settings', text: 'The Settings button is in the course navigation.' },
        { title: 'Choose Export', text: 'A JSON file with your whole course — lessons, exercises, keepsakes and key observations — downloads to your computer.' },
        { title: 'Later, choose Import', text: 'Pick the file you exported. Import **replaces** the current course with the backup; it does not merge the two.' },
      ] },
      { kind: 'table', head: ['Setting', 'What it does'], rows: [
        ['Export', 'Downloads a JSON backup of your course.'],
        ['Import', 'Replaces your current course with a backup file.'],
        ['Code grove', 'Turns the optional Code chapter on or off. It opens after Bark.'],
        ['Reset', 'Clears your current progress. It asks twice. When signed in, the reset syncs to your account.'],
      ] },
      { kind: 'details', summary: 'What an account changes', text: 'Sign in and your progress lives with the account and syncs across devices; the account card shows the sync state. The account is shared with the other Strange Systems apps, so one login works everywhere. The optional mailing-list box is a separate question with its own tick, and an unticked box is an unsubscribe. Nothing about the account is required to finish the course.' },
    ] },
    { id: 'who-makes-this', title: 'Made with intention', question: 'Who makes KeyJam?', answer: `${PRODUCT} is made by Strange Systems, the studio behind CropASAP and No Ceremony. The course is ${FACTS.price.value}, and one optional account works across all of the studio’s apps.`, keywords: ['strange systems', 'maker', 'about'], blocks: [
      { kind: 'p', text: 'Strange Systems makes small, keyboard-first tools. This one is {fact:price}. The aim is a capable person at a comfortable keyboard, with a little pleasure in the practice.' },
      { kind: 'quote', text: 'Understand a small movement, practise it accurately at whatever pace is comfortable, then connect it to music — or words.', attribution: 'The KeyJam north star' },
      { kind: 'p', text: 'The course borrows what is useful from language apps — small purposeful steps, a clear next action, progress that lasts — and leaves out streak pressure, spendable currency and random rewards. Exploration never masquerades as mastery, and assisted input is never counted as evidence against you.' },
      { kind: 'cards', items: [
        { title: 'Source on GitHub', text: 'The course, its curriculum and the tests that hold it to these promises.', href: 'https://github.com/junovhs/keygrove', label: 'Open' },
        { title: 'Documentation engine', text: 'These pages and the in-app panel are one TypeScript source, rendered by dopedocs.', href: 'https://github.com/junovhs/dopedocs', label: 'Open' },
      ] },
    ] },
  ],
});
