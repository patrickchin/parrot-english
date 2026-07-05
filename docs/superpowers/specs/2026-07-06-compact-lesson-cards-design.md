# Compact Lesson Cards Design

## Goal

Make the seven-lesson chooser faster to scan by replacing the tall, two-column cards with short, full-width lesson rows. Keep the existing playful artwork and lesson metadata, and place each **Start lesson** action on the right edge of its row.

## Layout

- Render the catalog as one centered column within the existing `1120px` maximum width.
- Make each `.lesson-card` a horizontal grid: artwork on the left and content on the right.
- Make `.lesson-card-content` a second grid with the title, summary, and scene count in the flexible left column and the action button in a fixed right column.
- Reduce card padding, artwork height, border radius, and vertical gaps so seven lessons require substantially less scrolling.
- Preserve the current colors, shadows, typography, lesson numbering, and artwork.

## Responsive Behavior

- Desktop and tablet cards stay horizontal and keep the **Start lesson** button on the right.
- On narrow phones, shrink the artwork and action, hide the summary, and retain the title and scene count so the row stays readable without becoming tall.
- Keep a minimum touch target of 44px for the action.

## Components and Behavior

This is a presentation-only change in `src/styles.css`. `LessonList` keeps its current markup, accessible button labels, click handling, catalog order, and lesson data flow. No authentication, navigation, lesson playback, or error-handling behavior changes.

## Verification

- Add a focused regression test that requires a one-column catalog, horizontal card grid, and right-side action grid area.
- Run the lesson-list tests, then the project build.
- Open the chooser at desktop and phone widths to confirm cards are visibly shorter, the action remains on the right, and text does not overlap.
