# Parrot English Agent Notes

## Frontend UI

- Use Tailwind 4 utilities directly in React components, with shared controls
  from `src/ui.tsx` and shared headers from `src/AppHeader.tsx`. Avoid large JS
  class constants and page-specific copies of global controls.
- Keep `src/styles.css` limited to Tailwind configuration, global browser
  behavior, and named background utilities. Keep `src/lesson.css` limited to
  runtime character-slot positioning, the speech-tail polygon, and the
  combined short-wide placement override.
- `AuthGate` owns the account header through `AccountHeader`. Routes compose
  `RouteHeader` with `HeaderButton` or `HeaderLink`; they must not redefine
  header sizing, typography, colors, or shadows.
- Build lesson-player presentation from `src/LessonPlayerUi.tsx`; its HUD,
  characters, speech, start action, controls, and errors are domain components
  that use Tailwind and the shared control primitives.

## UI Testing

- Test rendered behavior with Playwright and accessible locators; never assert
  CSS source or class names.
- Responsive header tests cover key routes at 280–390px, including short and
  scrolled viewports, and check visibility, alignment, wrapping, overlap, and
  overflow. Preserve accessible names when labels are hidden.
- Lesson-player tests cover HUD, speech, start-action, and control containment
  at ultra-narrow, short-landscape, and desktop sizes.
- Run `npm run test:browser` for responsive UI changes.

## Audio Generation

- Do not use local or macOS system text-to-speech for Chinese lesson audio.
- Regenerate Chinese saved audio with ElevenLabs TTS.
- Use character-directed voices, not exact protected-character clones.
- Current ElevenLabs defaults for regenerated assets:
  - Pig example audio: `Summer - British, Confident & Posh` (`Oqy85UMasXzUjUxF0ta5`).
  - Parrot coach/Chinese audio: `Chen - Friendly Narration Mandarin` (`4NQthjVhIGGVfL3Si000`).
  - Preferred model: `eleven_v3`.
- Chinese parrot lines should use `voiceStyle: "energetic-character"` and `ttsText` performance tags while keeping visible `text` clean.
- Source audio assets live in `public/assets/audio`; `dist/assets/audio` is build output.
