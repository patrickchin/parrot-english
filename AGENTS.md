# Parrot English Agent Notes

- Merge changes into `main` only through a pull request; never merge feature branches directly.

## Learner Names

- When authored learner content needs a personal name, reuse only Bob, Mary,
  Rose, Jack, Ben, or Sam. Do not invent unusual names or nicknames.
- Preserve names supplied by a learner or guardian. Peppa, Dolly, family roles,
  and animal or object labels are not part of the authored-name pool.
- Keep visible text, artwork descriptions, and saved audio consistent when a
  name changes. Stable internal IDs do not need to be renamed.

## Frontend UI

- Use Tailwind 4 utilities directly in React components, with shared controls
  from `src/shared/ui.tsx` and shared headers from `src/app/AppHeader.tsx`.
  Avoid large JS class constants and page-specific copies of global controls.
- Keep `src/styles.css` limited to Tailwind configuration, global browser
  behavior, and named background utilities. Keep `src/lesson.css` limited to
  runtime character-slot positioning, the speech-tail polygon, and the
  combined short-wide placement override.
- `AuthGate` owns the account header through `AccountHeader`. Routes compose
  `RouteHeader` with `HeaderButton` or `HeaderLink`; they must not redefine
  header sizing, typography, colors, or shadows.
- Give every route one `h1`; add lower headings or helper copy only for real, descending structure—not repeated brands, modes, labels, or actions.
- Preserve learner targets, progress, safety, consent, privacy, warnings, errors, and live statuses when simplifying UI.
- Build lesson-player presentation from `src/lessons/LessonPlayerUi.tsx`; its HUD,
  characters, speech, start action, controls, and errors are domain components
  that use Tailwind and the shared control primitives.

## UI Testing

- Test rendered behavior with Playwright and accessible locators; never assert
  CSS source or class names.
- Run `npm run test:browser` for responsive UI changes.

## Audio Generation

- Do not use local or browser or macOS system text-to-speech for any audio.
