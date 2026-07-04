# Centered Front Page Design

## Goal

Center the lesson-list content horizontally while keeping its current top-to-bottom reading flow, and remove the transparent gradient treatment so the meadow background appears at full opacity.

## Design

- Center `.lesson-list-content` within `.lesson-list-shell` without vertically centering the page. This preserves the existing fixed-height layout and the independently scrolling lesson list.
- Center the lesson-list header text and its kicker within the content column.
- Center the lesson-card grid within the content column while retaining its existing maximum card width.
- Show `.lesson-list-background` at full opacity.
- Remove the `.lesson-list-shell::before` overlay, including the narrower-screen translucent override. Keep the shell's solid blue background only as a fallback while the background image loads.
- Preserve the current card styling, characters, responsive breakpoints, scrolling behavior, and lesson interactions.

## Implementation Scope

The change is limited to `src/styles.css` and its focused CSS regression tests. No React component, lesson data, audio, or application-state changes are required.

## Verification

- Add a regression test that fails unless the main content and header are horizontally centered.
- Add a regression test that fails if the background image is translucent or if the lesson-list overlay remains.
- Run the focused lesson-list UI tests, then the project build and lint checks.
- Inspect the front page at desktop and mobile widths to confirm centering, full-opacity artwork, preserved scrolling, and legibility.
