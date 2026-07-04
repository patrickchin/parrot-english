# Numbered Lesson Page Routing Design

## Goal

Give every playable lesson page a stable, shareable URL while preserving the
existing lesson list and speaking flow. URLs use one-based lesson and page
numbers rather than catalog IDs.

## Route Contract

The application will use React Router in Declarative Mode with these routes:

- `/` renders the lesson list.
- `/lessons/:lessonNumber` redirects with history replacement to
  `/lessons/:lessonNumber/pages/1` when the lesson is playable.
- `/lessons/:lessonNumber/pages/:pageNumber` renders the selected lesson page.
- Any unmatched, malformed, unavailable, or out-of-range route redirects with
  history replacement to `/`.

Lesson and page numbers are one-based positions in `lib/lessons.json`. Existing
lesson and step IDs remain the stable content identifiers inside the catalog;
they are not exposed in the route path.

## Architecture

`src/main.tsx` will mount the application inside React Router's
`BrowserRouter`. `src/App.tsx` will replace its private `AppScreen` state with
declarative `Routes` and route components.

A focused route-resolution module will convert route parameter strings into a
playable lesson and valid page index. It will also build canonical numbered
paths for lesson cards and page controls. Keeping catalog lookup and numeric
validation outside the React view makes the route contract independently
testable.

The existing Vite and Cloudflare Worker architecture remains unchanged.
Cloudflare's `single-page-application` asset fallback already serves
`index.html` for direct requests to nested lesson URLs.

## Components and Responsibilities

### Lesson list route

The lesson list remains at `/`. Each playable lesson card links directly to its
first page using its one-based catalog position, for example
`/lessons/1/pages/1`. Disabled lesson cards remain non-navigable.

### Lesson redirect route

The route `/lessons/:lessonNumber` validates the lesson and redirects to page
one. The redirect replaces the current history entry so Back does not bounce
between the short and canonical forms.

### Lesson page route

The lesson page route validates both parameters, selects the corresponding
lesson and step, and renders `LessonPlayer`. It supplies the resolved page index
as the initial lesson state.

`LessonPlayer` will notify the route layer whenever its previous, next, or
successful-feedback navigation changes pages. The route layer updates the URL
and keeps the existing lesson-state transition semantics:

- Manual previous and next arrows arrive at the target page in the idle phase.
- Next from successful feedback arrives at the next page and starts its example
  as it does today.
- Browser Back and Forward select the URL's page and reset that page to idle,
  preventing stale recording, evaluation, feedback, or audio state from leaking
  across history navigation.

The lesson-list control navigates to `/` through React Router.

## Data Flow

1. React Router matches the current browser path.
2. The route resolver parses one-based parameters and looks up the catalog
   lesson and step.
3. Invalid results produce a redirect to `/`; valid results render the selected
   lesson page.
4. Lesson navigation dispatches the existing state-machine event and navigates
   to the corresponding numbered page path.
5. A browser history change updates the route parameters; `LessonPlayer` resets
   to the requested page in the idle phase.

The URL is authoritative for which lesson page is selected. The lesson state
machine remains authoritative for the speaking phase within that page.

## E2E Compatibility

The existing `parrotE2eAutostart=1` query behavior remains supported. When the
query is used at `/`, the app redirects to the default lesson's first numbered
page while preserving the query, then starts the lesson through the existing
E2E-only autostart effect.

## Error Handling

Route parameters must contain canonical positive decimal integers. Values such
as `0`, negative numbers, decimals, mixed text, unavailable lessons, lessons
without steps, and page numbers beyond the selected lesson are invalid and
redirect to `/`.

The route layer must never silently substitute the default lesson for an
invalid nested URL, because doing so would display content that disagrees with
the address bar.

## Testing

Implementation follows test-driven development:

- Unit tests cover canonical path construction and resolution of valid,
  malformed, unavailable, and out-of-range lesson/page numbers.
- App-source integration tests confirm `BrowserRouter`, route declarations,
  router links/navigation, and removal of the private screen switch.
- Existing lesson-state tests continue to cover phase transitions; new cases
  cover selecting a page from browser history without retaining active state.
- The focused tests run first, followed by the complete unit suite, lint, and
  production build.

No visual layout or audio assets change as part of this work.
