# Parrot English Agent Notes

## Frontend Styling

- Keep presentation in CSS, not JavaScript or TypeScript class-string constants.
- Put shared colors, type, sizes, radii, spacing, and shadows in
  `src/design-system.css`. Reuse the shared `app-button`, `app-header-account`,
  and `app-header-control` primitives before adding page-specific rules.
- The authenticated account header is global UI owned by `AuthGate`; do not
  create route-specific Profile or Log out headers.
- All top-level navigation controls must share the same header geometry and
  typography. Page CSS may control page content, but must not redefine the
  global header dimensions, font, colors, or shadows.
- Keep CSS resets in the base layer and reusable controls in the component
  layer so resets cannot override component typography.
- Tailwind remains available, but avoid long responsive utility strings in
  JSX. Prefer named semantic classes backed by the shared CSS tokens.

## UI Testing

- Test user-visible behavior, not CSS source text or exact class names.
- Do not add tests that read CSS files, regex CSS declarations, or assert that
  a component contains a particular styling class. Those tests can pass while
  the rendered layout is broken and make harmless refactors expensive.
- Use Playwright for layout claims such as visibility, alignment, wrapping,
  overlap, scrolling, computed typography, and horizontal overflow. Prefer
  accessible roles and names over CSS selectors.
- Mobile header tests must cover conversation, lesson-list, and lesson-player
  routes at 280, 320, 360, and 390 CSS pixels, including a short viewport and a
  scrolled page. Profile and Log out must remain visible on one row.
- When a visual label is hidden on mobile, preserve the control's accessible
  name with semantic markup or an explicit ARIA label.
- Run `npm run test:browser` for responsive UI changes. Pull-request CI installs
  Chromium and runs this suite in addition to `npm test`, lint, and build.

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
