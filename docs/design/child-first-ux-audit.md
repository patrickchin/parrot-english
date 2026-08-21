# Child-First UX Audit and Implementation

Date: 2026-08-21

## Audience Decision

The default experience is for an approximately five-to-seven-year-old child
who is new to English and may not yet read English independently. Age is not a
placement score, so Parrot English keeps three different progressions:

- **Default:** listen, point, copy one short phrase, and succeed with help.
- **Growing confidence:** repeat a pattern and answer with a short sentence.
- **Older or more proficient learner:** follow a tiny connected story or an
  early-A1 adventure.

The first progression is child-facing. Level, authoring, personalization, and
chat-style decisions are secondary grown-up controls.

## Evidence Used

- [Cambridge Pre A1 Starters](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters/)
  uses picture-supported, word- and short-sentence-sized tasks. This supports
  concrete pictures, tiny instructions, and one language act at a time.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) sets a 24 CSS pixel minimum target
  criterion; this product retains a stronger 44 pixel product floor for primary
  child controls.
- [NAEYC guidance on technology for preschoolers and kindergarteners](https://www.naeyc.org/resources/topics/technology-and-media/preschoolers-and-kindergartners)
  emphasizes active, hands-on, success-building use rather than passive screen
  time. The product therefore keeps microphone turns child-controlled and
  feedback effort-positive.
- A [meta-analysis of turn-taking timing](https://pmc.ncbi.nlm.nih.gov/articles/PMC9271548/)
  reports conversation gaps around one second across development. A realtime
  system cannot always answer that quickly, but it should acknowledge the
  learner immediately and explain longer waits rather than appear frozen.

The detailed language-level and age/proficiency cautions remain in
`young-learner-storytelling.md`.

## Baseline Findings

- At 390×844, the home document was 1,472 px tall while global overflow rules
  made the final activity hard to reach.
- Home, lesson, story, and conversation entry screens asked children to read
  explanatory paragraphs or make adult-level configuration choices before
  play.
- Story page art existed only as production prompts; the easiest pages had no
  literal visual support.
- The microphone could appear unchanged while browser permission was pending.
- Conversation connection and response waits did not provide enough staged,
  child-readable feedback.
- The production entry JavaScript was about 1,010 kB minified / 279 kB gzip,
  largely because the LiveKit SDK loaded with the app shell.

## Implemented Decisions

### Reach play sooner

- Home has one internally scrollable viewport and three short choices.
- Guided lessons come first and use picture-led, fully tappable cards.
- The story shelf puts five illustrated beginner stories before its closed
  grown-up level selector.
- Talk to Peppa starts with the safe short-turn style; optional styles are in a
  grown-up disclosure.

### Make waiting visible

- Lesson and conversation microphones show an immediate opening state and
  reject duplicate taps.
- Conversation feedback moves through literal **Getting ready**, **Your turn**,
  **Thinking**, **Peppa's turn**, **Trying again**, and saving/finishing stages.
  It does not claim the child or character heard sound. A cold start offers
  retry after 12 seconds.
- Thinking, reconnecting, and saving also end in a large retry or back action;
  none of the child-facing wait states can remain an actionless spinner forever.
- Lesson praise has a minimum 1.5 second visible dwell after a short feedback
  clip.
- If lesson sound stops, the child can try the sound again or skip that sound
  without getting trapped in the scene.

### Reduce false failure

- Speech matching uses an encouragement-biased 0.65 normalized similarity
  threshold so a recognizer omission such as “Here are” for “Here you are” does
  not punish the child.
- No-input and microphone failures remain distinct from an incorrect phrase.

### Improve visual and loading behavior

- The five First words stories now have 27 literal 768×512 WebP page
  illustrations.
- Conversation poses have 384, 768, and optimized 1024 px sources. The browser
  chooses from `srcset`; the small variants are roughly 11–15 kB and the large
  variants remain below 64 kB.
- LiveKit loads only when a real voice room connects. The app shell is now
  roughly 458 kB minified / 139 kB gzip, with the roughly 469 kB / 121 kB gzip
  LiveKit chunk deferred. Lesson, story, authoring, and conversation
  presentation chunks load only for their routes.

### Preserve accessible control

- Ordinary route changes focus the new view heading; lesson scenes and story
  pages keep their specialized focus behavior.
- Dialogs contain Tab focus and restore the opener.
- The account menu supports Arrow keys, Home, End, and Escape.
- A focused, scrollable caption region keeps normal Space scrolling instead of
  unexpectedly toggling the microphone.

## Story Illustration Generation Record

The built-in image generator used each existing cover as a visual reference.
Every final request asked for a clean children's read-aloud sprite sheet,
exactly two columns by three rows so each panel is natively landscape,
consistent characters/objects/colors, no text, no logos, and no watermark.
The reviewed panels were cropped and normalized to 768×512 WebP under
`public/assets/story-pages`. An earlier three-column layout was rejected in
visual review because it forced portrait panels and blurred side fill.

The labelled review board is
[`artifacts/ux-review/first-words-story-pages.jpg`](../../artifacts/ux-review/first-words-story-pages.jpg).

- **The Red Ball:** child holds one red ball; ball rolls away; rolls back toward
  the child; child stops it; ball is safely home.
- **Which Hat?:** one red hat; one blue hat; one yellow hat; all three hats
  together; the yellow hat on the child's head.
- **Wake Up, Nori!:** Nori sleeps, wakes, jumps, claps, dances, and sleeps again.
- **Three Apples:** one apple, two apples, three counted apples, one falling,
  two remaining, and one apple for each friend.
- **Where Is Dot?:** Dot beside a box, not in the box, not on the box, a child
  looking under the box, and Dot found under it.

## Next Evidence to Collect

- Observe several children with different home languages; record where they
  hesitate without prompting them toward a control.
- Measure time to first activity, microphone permission time, child-to-Peppa
  response time, retry rate, and voluntary replay rate. Do not treat a speech
  score as a proficiency grade.
- Commission reviewed saved narration and full page art for higher story bands
  before promoting those bands into the default child path.
- Test whether a child waits for the join-in model and speaks when **Your turn**
  appears; adjust the cue timing from observation rather than guesswork.
