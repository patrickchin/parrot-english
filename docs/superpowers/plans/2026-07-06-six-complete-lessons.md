# Six Complete Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six prompt-compliant, fully playable lessons for Bella with complete ElevenLabs audio while reusing the existing visual catalog.

**Architecture:** Keep story scripts as automatically discovered JSON and keep saved speech metadata in `lib/static-audio.js`. Rename the existing lesson and prefix all seven filenames to preserve the approved catalog order, remove obsolete preview cards, and extend whole-catalog tests so every non-user line must resolve to an existing MP3.

**Tech Stack:** JSON lesson content, JavaScript with `@ts-check`, TypeScript/React 19, Vite `import.meta.glob`, Node test runner, ElevenLabs `eleven_v3`

---

## File Structure

- `content/lessons/01-peppas-high-ball.json`: renamed existing lesson.
- `content/lessons/02-garden-colors.json`: red-flower color story.
- `content/lessons/03-snack-time.json`: polite apple request story.
- `content/lessons/04-playground-words.json`: taking turns story.
- `content/lessons/05-market-day.json`: buying two apples story.
- `content/lessons/06-picnic-time.json`: offering and accepting juice story.
- `content/lessons/07-bedtime-story.json`: sleepy good-night story.
- `tests/lesson-catalog.test.mjs`: seven-file order and lesson-content contract.
- `src/LessonList.tsx`: discovered playable cards only.
- `tests/lesson-list-page.test.mjs`: seven enabled cards and no previews.
- `tests/lesson-list-ui.test.mjs`: source contract rejecting obsolete previews.
- `lib/static-audio.js`: exact speaker/text cache metadata for new lines.
- `tests/static-audio.test.mjs`: whole-catalog speech and file coverage.
- `public/assets/audio/*.mp3`: generated ElevenLabs speech files.

## Canonical Lesson Content

Every scene uses `characters: ["peppa", "dolly", "user"]`. A visible speaker
uses `talking` unless the story calls for `happy`, `sad`, or `surprised`; the
other visible characters use `listening`. Narrator steps keep the characters
listening or happy, and user steps use `user: "talking"` with Peppa and Dolly
listening. The character model directly before every user step has identical
dialogue.

Use these exact metadata values and scene dialogue sequences:

### 02 Garden Colors

- Title: `The Red Flower`
- Summary: `Peppa and Dolly search the garden for a red flower to finish their basket.`
- Detailed summary: `Peppa and Dolly have a basket that needs one red flower. They look closely at the colorful flowers and identify the red one. Peppa adds it to the basket, and the friends admire the finished display.`
- Location: `The flower garden` / `A sunny garden with green grass, colorful flower beds, and a small basket beside a tall tree.`
- Background: `episode-garden`
- Goal phrases: `What color is it?` and `It is red.`
- Scene dialogue:
  1. Peppa: `Look at the flowers!`; Dolly: `So many colors!`
  2. Peppa: `What color is it?`; narrator: `Let's ask with Dolly!`; Dolly/user: `What color is it?`
  3. Dolly: `It is red.`; narrator: `Let's copy Dolly!`; Dolly/user: `It is red.`
  4. Peppa: `A red flower!`; Dolly: `We found it!`
  5. Peppa: `The basket is ready!`; Dolly: `Red looks lovely.`; narrator: `Great job, Bella! The red flower is in the basket!`

### 03 Snack Time

- Title: `Peppa's Apple Snack`
- Summary: `Peppa politely asks Dolly for an apple from the snack basket.`
- Detailed summary: `Dolly opens a snack basket filled with apples and bananas. Peppa asks for an apple, and Dolly passes one to her. Peppa thanks Dolly and happily begins her snack.`
- Location: `The sunny picnic meadow` / `A bright meadow with a checked picnic blanket, a small snack basket, and green grass under a blue sky.`
- Background: `meadow-day`
- Goal phrases: `May I have an apple?` and `Here you are!`
- Scene dialogue:
  1. Dolly: `It is snack time!`; Peppa: `What is in the basket?`
  2. Dolly: `Apples and bananas!`; Peppa: `That apple looks yummy.`
  3. Peppa: `May I have an apple?`; narrator: `Let's ask with Dolly!`; Dolly/user: `May I have an apple?`
  4. Dolly: `Here you are!`; narrator: `Let's copy Dolly!`; Dolly/user: `Here you are!`
  5. Peppa: `Thank you, Dolly!`; Dolly: `Enjoy your apple!`; narrator: `Great job, Bella! Peppa has her apple snack!`

### 04 Playground Words

- Title: `A Turn on the Swing`
- Summary: `Peppa asks for a turn on the swing and then invites Dolly to play together.`
- Detailed summary: `Dolly is using the swing when Peppa arrives at the playground. Peppa politely asks for a turn and waits until Dolly is finished. Peppa gets her turn, and the friends decide to keep playing together.`
- Location: `The meadow playground` / `A cheerful playground in a sunny meadow with a swing, a small slide, and soft green grass.`
- Background: `meadow-day`
- Goal phrases: `Can I have a turn?` and `Let's play together!`
- Scene dialogue:
  1. Peppa: `The swing is busy.`; Dolly: `I am swinging!`
  2. Peppa: `I want a turn.`; Dolly: `You can ask me.`
  3. Peppa: `Can I have a turn?`; narrator: `Let's ask with Dolly!`; Dolly/user: `Can I have a turn?`
  4. Dolly: `Yes! Your turn is next.`; Peppa: `Thank you!`
  5. Peppa: `Let's play together!`; narrator: `Let's copy Dolly!`; Dolly/user: `Let's play together!`; narrator: `Great job, Bella! Peppa and Dolly are playing together!`

### 05 Market Day

- Title: `Two Apples for Peppa`
- Summary: `Peppa visits Dolly's fruit stand and buys two red apples.`
- Detailed summary: `Dolly has a garden market stand filled with fresh fruit. Peppa asks the price and chooses two red apples. She pays two coins, and Dolly gives her the apples.`
- Location: `Dolly's garden market` / `A colorful fruit stand in the sunny garden with baskets of apples, a small counter, and a two-coin price sign.`
- Background: `episode-garden`
- Goal phrases: `How much is it?` and `I'd like two apples, please.`
- Scene dialogue:
  1. Dolly: `Welcome to my fruit stand!`; Peppa: `I see red apples.`
  2. Peppa: `How much is it?`; narrator: `Let's ask with Dolly!`; Dolly/user: `How much is it?`
  3. Dolly: `It is two coins.`; Peppa: `I have two coins.`
  4. Peppa: `I'd like two apples, please.`; narrator: `Let's copy Dolly!`; Dolly/user: `I'd like two apples, please.`
  5. Dolly: `Here are two apples.`; Peppa: `Thank you, Dolly!`; narrator: `Great job, Bella! Peppa bought two red apples!`

### 06 Picnic Time

- Title: `Juice at the Picnic`
- Summary: `Dolly offers Peppa some juice while the friends prepare their picnic.`
- Detailed summary: `Peppa and Dolly spread their picnic food across a blanket in the meadow. Dolly offers Peppa some juice, and Peppa politely accepts it. Dolly pours the juice, and the friends enjoy the picnic together.`
- Location: `The picnic meadow` / `A sunny meadow with a checked blanket, a picnic basket, cups, fruit, and a bottle of juice.`
- Background: `meadow-day`
- Goal phrases: `Would you like some juice?` and `Yes, please!`
- Scene dialogue:
  1. Peppa: `Our picnic looks lovely!`; Dolly: `The cups are ready.`
  2. Dolly: `Would you like some juice?`; narrator: `Let's copy Dolly!`; Dolly/user: `Would you like some juice?`
  3. Peppa: `Yes, please!`; narrator: `Let's copy Dolly!`; Dolly/user: `Yes, please!`
  4. Dolly: `Here is your juice.`; Peppa: `Thank you, Dolly!`
  5. Peppa: `The picnic is ready!`; Dolly: `Let's eat together!`; narrator: `Great job, Bella! Peppa has her picnic juice!`

### 07 Bedtime Story

- Title: `Good Night, Peppa`
- Summary: `Peppa feels sleepy after Dolly finishes a quiet bedtime story.`
- Detailed summary: `Dolly reads a gentle story while Peppa rests in the quiet evening meadow. Peppa notices that she is sleepy and gets ready to close her eyes. The friends say good night, and Peppa settles down to sleep.`
- Location: `The evening story spot` / `A peaceful evening meadow with a soft blanket, a storybook, warm lantern light, and stars appearing overhead.`
- Background: `meadow-evening`
- Goal phrases: `I'm sleepy.` and `Good night!`
- Scene dialogue:
  1. Dolly: `The story is finished.`; Peppa: `I liked the story.`
  2. Dolly: `The moon is high.`; Peppa: `It is very quiet.`
  3. Peppa: `I'm sleepy.`; narrator: `Let's copy Dolly!`; Dolly/user: `I'm sleepy.`
  4. Peppa: `My blanket is ready.`; Dolly: `Close your eyes.`
  5. Peppa: `Good night!`; narrator: `Let's copy Dolly!`; Dolly/user: `Good night!`; narrator: `Great job, Bella! Peppa is ready to sleep!`

### Task 1: Lock the Seven-Lesson Catalog Contract

**Files:**
- Modify: `tests/lesson-catalog.test.mjs`

- [ ] **Step 1: Add the failing catalog assertions**

Replace the one-ID expectation with:

```js
const expectedLessons = [
  ["01-peppas-high-ball", "Peppa's High Ball", ["Can you help me, please?", "Thank you!"]],
  ["02-garden-colors", "The Red Flower", ["What color is it?", "It is red."]],
  ["03-snack-time", "Peppa's Apple Snack", ["May I have an apple?", "Here you are!"]],
  ["04-playground-words", "A Turn on the Swing", ["Can I have a turn?", "Let's play together!"]],
  ["05-market-day", "Two Apples for Peppa", ["How much is it?", "I'd like two apples, please."]],
  ["06-picnic-time", "Juice at the Picnic", ["Would you like some juice?", "Yes, please!"]],
  ["07-bedtime-story", "Good Night, Peppa", ["I'm sleepy.", "Good night!"]],
];

assert.deepEqual(entries.map(({ id }) => id), expectedLessons.map(([id]) => id));
entries.forEach(({ lesson }, index) => {
  const [, title, goalPhrases] = expectedLessons[index];
  assert.equal(lesson.title, title);
  assert.equal(lesson.childName, "Bella");
  assert.deepEqual(lesson.goalPhrases, goalPhrases);
  assert.match(lesson.scenes.at(-1).steps.at(-1).dialogue, /Bella/);
});
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run: `node --test tests/lesson-catalog.test.mjs`

Expected: FAIL because only `peppas-high-ball` exists.

- [ ] **Step 3: Commit the failing contract**

```bash
git add tests/lesson-catalog.test.mjs
git commit -m "test: define seven lesson catalog"
```

### Task 2: Add the Six Lesson Scripts

**Files:**
- Rename: `content/lessons/peppas-high-ball.json` to `content/lessons/01-peppas-high-ball.json`
- Create: `content/lessons/02-garden-colors.json`
- Create: `content/lessons/03-snack-time.json`
- Create: `content/lessons/04-playground-words.json`
- Create: `content/lessons/05-market-day.json`
- Create: `content/lessons/06-picnic-time.json`
- Create: `content/lessons/07-bedtime-story.json`

- [ ] **Step 1: Rename the existing file without changing its JSON**

Use `apply_patch` to add `content/lessons/01-peppas-high-ball.json` with the
exact content of `content/lessons/peppas-high-ball.json`, then delete the old
path in the same patch.

Expected: the existing lesson content is preserved under its ordered ID.

- [ ] **Step 2: Create all six JSON files from Canonical Lesson Content**

For every listed scene, encode each line as one step using the exact runtime
shape below. Repeat the full `emotes` map on every step and use the approved
background for every scene in that lesson.

```json
{
  "speaker": "dolly",
  "dialogue": "What color is it?",
  "emotes": {
    "peppa": "listening",
    "dolly": "talking",
    "user": "listening"
  }
}
```

Every user target immediately follows its Dolly model:

```json
{
  "speaker": "user",
  "dialogue": "What color is it?",
  "emotes": {
    "peppa": "listening",
    "dolly": "listening",
    "user": "talking"
  }
}
```

- [ ] **Step 3: Run the catalog test and verify GREEN**

Run: `node --test tests/lesson-catalog.test.mjs`

Expected: PASS with all seven lessons validated in numeric order.

- [ ] **Step 4: Commit the lesson content**

```bash
git add content/lessons tests/lesson-catalog.test.mjs
git commit -m "feat: add six scene-script lessons"
```

### Task 3: Replace Preview Cards with Playable Lessons

**Files:**
- Modify: `tests/lesson-list-page.test.mjs`
- Modify: `tests/lesson-list-ui.test.mjs`
- Modify: `src/LessonList.tsx`

- [ ] **Step 1: Write failing list assertions**

Change the server-render test to:

```js
assert.equal((html.match(/<article/g) ?? []).length, 7);
assert.equal((html.match(/disabled=""/g) ?? []).length, 0);
assert.equal((html.match(/Start lesson/g) ?? []).length, 7);
assert.doesNotMatch(html, /Coming soon/);
```

Add this source assertion:

```js
const list = readProjectFile("src/LessonList.tsx");
assert.doesNotMatch(list, /UPCOMING_LESSONS|Coming soon|LockKeyhole/);
```

- [ ] **Step 2: Run the list tests and verify RED**

Run: `node --test tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs`

Expected: FAIL because three disabled preview cards still render.

- [ ] **Step 3: Simplify `LessonList` to discovered entries**

Remove `LockKeyhole`, `UPCOMING_LESSONS`, and all unavailable branches. Use:

```tsx
const cards = LESSONS.map(createAvailableLessonCard);

<article className="lesson-card is-available" key={lesson.id}>
  {/* existing artwork, number, title, summary, and scene count */}
  <button
    aria-label={`Start ${lesson.title}`}
    className="lesson-card-action"
    onClick={() => onOpenLesson(lesson.id)}
    type="button"
  >
    <Play aria-hidden="true" /> Start lesson
  </button>
</article>
```

- [ ] **Step 4: Run the list tests and verify GREEN**

Run: `node --test tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs`

Expected: PASS with seven enabled cards and no preview copy.

- [ ] **Step 5: Commit the catalog UI**

```bash
git add src/LessonList.tsx tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs
git commit -m "feat: make all seven lessons playable"
```

### Task 4: Require Whole-Catalog Audio Coverage

**Files:**
- Modify: `tests/static-audio.test.mjs`

- [ ] **Step 1: Replace the single-lesson fixture with all JSON files**

```js
import { existsSync, readFileSync, readdirSync } from "node:fs";

const lessonDirectory = new URL("../content/lessons/", import.meta.url);
const lessons = readdirSync(lessonDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right))
  .map((filename) =>
    JSON.parse(readFileSync(new URL(filename, lessonDirectory), "utf8"))
  );
```

Flatten the scripted speech with:

```js
const scriptedLines = lessons.flatMap((lesson) =>
  lesson.scenes.flatMap((scene) =>
    scene.steps
      .filter((step) => step.speaker !== "user")
      .map((step) => [step.speaker, step.dialogue])
  )
);
```

- [ ] **Step 2: Run the audio test and verify RED**

Run: `node --test tests/static-audio.test.mjs`

Expected: FAIL on the first uncached new lesson line.

- [ ] **Step 3: Commit the failing audio contract**

```bash
git add tests/static-audio.test.mjs
git commit -m "test: require audio for every lesson"
```

### Task 5: Register and Generate ElevenLabs Audio

**Files:**
- Modify: `lib/static-audio.js`
- Create: new MP3 files under `public/assets/audio/`

- [ ] **Step 1: Register each unique missing speaker/text pair**

Use one entry per exact pair. Character entries have this complete shape:

```js
"garden-peppa-look-at-flowers": {
  speaker: "peppa",
  lang: "en-US",
  src: `${STATIC_AUDIO_BASE_PATH}/garden-peppa-look-at-flowers.mp3`,
  text: "Look at the flowers!",
  style: "character",
},
```

Narrator entries omit `style`:

```js
"garden-narrator-finished-bella": {
  speaker: "narrator",
  lang: "en-US",
  src: `${STATIC_AUDIO_BASE_PATH}/garden-narrator-finished-bella.mp3`,
  text: "Great job, Bella! The red flower is in the basket!",
},
```

Do not add another entry when the exact speaker/text pair already exists.
`narrator-copy-dolly`, `narrator-ask-with-dolly`, `dolly-here-you-are`, and
other exact matches continue using their existing IDs.

- [ ] **Step 2: List the new IDs and generate only those files**

Run this command containing every newly registered ID:

```bash
npm run generate:audio:elevenlabs -- \
  --only=garden-peppa-look-at-flowers \
  --only=garden-dolly-so-many-colors \
  --only=garden-peppa-what-color \
  --only=garden-dolly-what-color \
  --only=garden-dolly-it-is-red \
  --only=garden-peppa-red-flower \
  --only=garden-dolly-found-it \
  --only=garden-peppa-basket-ready \
  --only=garden-dolly-red-looks-lovely \
  --only=garden-narrator-finished-bella \
  --only=snack-dolly-time \
  --only=snack-peppa-basket-question \
  --only=snack-dolly-fruit-list \
  --only=snack-peppa-apple-yummy \
  --only=snack-peppa-may-i-have-apple \
  --only=snack-dolly-may-i-have-apple \
  --only=snack-peppa-thank-you-dolly \
  --only=snack-dolly-enjoy-apple \
  --only=snack-narrator-finished-bella \
  --only=playground-peppa-swing-busy \
  --only=playground-dolly-swinging \
  --only=playground-peppa-want-turn \
  --only=playground-dolly-you-can-ask \
  --only=playground-peppa-can-i-turn \
  --only=playground-dolly-can-i-turn \
  --only=playground-dolly-turn-next \
  --only=playground-peppa-play-together \
  --only=playground-dolly-play-together \
  --only=playground-narrator-finished-bella \
  --only=market-dolly-welcome \
  --only=market-peppa-see-apples \
  --only=market-peppa-how-much \
  --only=market-dolly-how-much \
  --only=market-dolly-two-coins \
  --only=market-peppa-two-coins \
  --only=market-peppa-two-apples \
  --only=market-dolly-two-apples \
  --only=market-dolly-here-two-apples \
  --only=market-narrator-finished-bella \
  --only=picnic-peppa-looks-lovely \
  --only=picnic-dolly-cups-ready \
  --only=picnic-dolly-would-you-like-juice \
  --only=picnic-peppa-yes-please \
  --only=picnic-dolly-yes-please \
  --only=picnic-dolly-here-juice \
  --only=picnic-peppa-ready \
  --only=picnic-dolly-eat-together \
  --only=picnic-narrator-finished-bella \
  --only=bedtime-dolly-story-finished \
  --only=bedtime-peppa-liked-story \
  --only=bedtime-dolly-moon-high \
  --only=bedtime-peppa-quiet \
  --only=bedtime-peppa-sleepy \
  --only=bedtime-dolly-sleepy \
  --only=bedtime-peppa-blanket-ready \
  --only=bedtime-dolly-close-eyes \
  --only=bedtime-peppa-good-night \
  --only=bedtime-dolly-good-night \
  --only=bedtime-narrator-finished-bella
```

Expected: one `generated: <id> (elevenlabs)` line per new cache entry. The
generator uses `eleven_v3` unless `ELEVENLABS_MODEL_ID` explicitly overrides it.

- [ ] **Step 3: Run audio tests and verify GREEN**

Run: `node --test tests/static-audio.test.mjs tests/lesson-audio.test.mjs tests/generate-static-audio.test.mjs`

Expected: PASS; every scripted line resolves and every referenced MP3 exists.

- [ ] **Step 4: Commit metadata and generated audio**

```bash
git add lib/static-audio.js public/assets/audio tests/static-audio.test.mjs
git commit -m "feat: add audio for six lessons"
```

### Task 6: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run lesson-focused tests**

Run:

```bash
node --test \
  tests/lesson-catalog.test.mjs \
  tests/lesson-data.test.mjs \
  tests/lesson-list-page.test.mjs \
  tests/lesson-list-ui.test.mjs \
  tests/lesson-audio.test.mjs \
  tests/lesson-scene.test.mjs \
  tests/lesson-state.test.mjs \
  tests/static-audio.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the full suite**

Run: `npm test`

Expected: all Node tests pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: ESLint exits successfully with no errors.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 5: Audit the final diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors; only the approved lesson, test, list, audio,
specification, and plan files are changed.
