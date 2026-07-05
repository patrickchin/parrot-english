# App Home and URL Routing Design

**Date:** 2026-07-06

## Goal

Replace the lesson catalog as the default post-login destination with a
child-friendly home menu. Give every durable area of Parrot English a stable
URL so users can use browser Back and Forward, refresh safely, and link to a
specific screen or lesson scene.

## Scope

This release includes:

- a four-card authenticated home menu;
- URL-backed login, onboarding, profile, lesson catalog, lesson creation,
  progress, storytelling, lesson, and scene screens;
- a combined lesson catalog with distinct Parrot Lessons and My Lessons
  sections;
- separate URL namespaces for Parrot-authored and user-generated lessons;
- skeleton screens for lesson creation, progress, and storytelling;
- route-aware authentication and onboarding guards;
- canonical redirects for short, invalid, and unauthorized URLs; and
- browser-history synchronization for lesson scene navigation.

This release does not include:

- personalized lesson generation or persistence;
- a database migration for user-generated lessons;
- progress calculation or persistence;
- a storytelling authoring or playback experience;
- a URL for each onboarding question, profile field, script line, playback
  phase, recording phase, evaluation, or feedback state; or
- changes to the existing lesson content schema.

## Chosen Approach

Use React Router and give each durable screen a declarative route. The URL is
the authority for the current application area, lesson, and lesson scene.
Short-lived interaction state remains inside the owning component.

This is preferred over extending the current reducer-only navigation because
in-memory navigation cannot support deep links, refreshes, or browser history.
Encoding every lesson and onboarding substate in the URL was also rejected:
Back and Forward should move between meaningful screens and scenes, not replay
audio, recording, and form microstates.

## Route Contract

### Public and account routes

- `/login` renders the existing sign-in and registration experience.
- `/onboarding` renders the entire onboarding questionnaire on one URL.
- `/profile` renders the entire profile editor on one URL.

Sign-in and registration modes remain local state on `/login`. Individual
onboarding questions and profile fields remain local state on their respective
routes.

### Authenticated home and feature routes

- `/` renders the authenticated home menu.
- `/lessons` renders the combined lesson catalog.
- `/lessons/my/create` renders the personalized lesson creation skeleton.
- `/progress` renders the learning progress skeleton.
- `/stories` renders the storytelling skeleton.

### Lesson routes

- `/lessons/parrot/:lessonId` redirects to the first scene of a built-in
  lesson.
- `/lessons/parrot/:lessonId/scenes/:sceneNumber` renders a built-in lesson
  scene.
- `/lessons/my/:lessonId` redirects to the first scene of a user-generated
  lesson.
- `/lessons/my/:lessonId/scenes/:sceneNumber` renders a user-generated lesson
  scene.

Lesson IDs are stable identifiers rather than catalog positions. Scene numbers
are one-based. The `parrot` and `my` namespaces make ownership explicit and
prevent collisions even if both sources contain the same lesson ID.

## Redirect and Guard Behavior

Authentication and onboarding are route-aware guards around protected
content:

- A logged-out visitor requesting a protected URL is redirected to
  `/login?returnTo=<path>`.
- After successful sign-in, a valid same-origin `returnTo` path is restored.
- A visitor who opens `/login` directly proceeds to `/` after signing in.
- An authenticated learner with incomplete onboarding is redirected to
  `/onboarding` before other protected content is shown.
- Completing or skipping onboarding returns the learner to a valid requested
  destination, or `/` when none exists.
- An authenticated learner with completed onboarding who visits `/login` or
  `/onboarding` is redirected to `/`.
- Invalid or external `returnTo` values are ignored to prevent open redirects.

An unknown application path redirects to `/`. An unknown lesson ID redirects
to `/lessons`. A missing, non-numeric, zero, negative, or out-of-range scene
number redirects with history replacement to that lesson's first scene.

## Home Menu Experience

The home screen uses four equal, child-friendly cards rather than grouping
parent-oriented and learner-oriented tools:

1. **Lessons** links to `/lessons`.
2. **Create a Lesson** links to `/lessons/my/create`.
3. **Progress** links to `/progress`.
4. **Storytelling** links to `/stories`.

The cards follow the app's existing playful colors, rounded shapes, large tap
targets, and responsive typography. Each has an icon, short title, and one-line
description. The current account, Profile, and Sign Out controls remain
available.

Every authenticated destination outside the home menu provides a clear route
back to `/`. The lesson player retains its Back to lessons action and also
provides access to the main menu, so learners can choose between returning one
level or leaving the lesson area.

## Lesson Catalog Experience

`/lessons` is one discovery page with two visually distinct sections:

- **Parrot Lessons** contains the current version-controlled lesson catalog.
- **My Lessons** will contain lessons generated for the authenticated learner.

Parrot lesson cards link into the `parrot` namespace. The My Lessons section
initially renders a friendly empty state with a link to `/lessons/my/create`.
The catalog has a clear Back to main menu action.

The two sources are deliberately separated in presentation, storage, and
individual lesson URLs while remaining discoverable from one catalog page.

## Skeleton Screens

Lesson creation, progress, and storytelling use a shared skeleton-page pattern
with feature-specific iconography and copy. Each page includes:

- a Parrot English heading treatment;
- the feature name and concise coming-soon description;
- a visible Back to main menu action; and
- the global account controls supplied by the authenticated shell.

The lesson creation skeleton may also link back to `/lessons`. It does not show
a fake form or imply that generated content will be saved in this release.

## Lesson Scene and Browser-History Behavior

The route identifies the lesson source, stable lesson ID, and current scene.
The lesson player derives its initial scene from the URL and treats later route
changes as authoritative.

- Opening a lesson's short URL replaces it with the canonical first-scene URL.
- Previous, Next, and automatic scene progression update the URL.
- Browser Back and Forward select the addressed scene.
- Navigating to another lesson remounts lesson-owned state.
- Back to lessons navigates to `/lessons`, while Main menu navigates to `/`.
- A URL-driven scene change cancels or invalidates stale audio playback,
  microphone capture, transcription, and evaluation work before the new scene
  can accept completions.
- Script line, play/pause, recording, evaluation, and feedback transitions do
  not add browser-history entries.

The existing lesson-state reducer remains responsible for transient lesson
behavior. A small route-resolution boundary validates source, ID, and scene
number before the lesson player receives them.

## Data Boundaries

Parrot Lessons remain version-controlled JSON content. Future My Lessons will
be stored in database records scoped to the authenticated user. Both sources
must conform to the same validated lesson schema so the lesson player can
consume either without source-specific rendering logic.

This release only establishes the route and UI boundary for My Lessons. It
does not create placeholder database tables. When persistence is implemented,
the server must authorize ownership of every `my` lesson before returning its
content.

Progress records will eventually need both the lesson source and lesson ID.
That future schema is outside this release.

## Component Boundaries

- The application entry mounts `BrowserRouter` once.
- The top-level route tree owns public routes, protected routes, and fallback
  redirects.
- Authentication and onboarding guards decide access but do not silently
  replace the browser's current URL with unrelated inline content.
- The authenticated shell owns global account actions.
- The home menu owns only the four feature links.
- The lesson catalog owns source grouping and lesson links.
- The shared skeleton page owns the common placeholder layout.
- The lesson route adapter resolves URL parameters and passes the selected
  lesson and scene to the existing lesson player.

These boundaries keep route policy out of the lesson renderer and keep feature
screens independent of authentication implementation details.

## Accessibility and Responsive Behavior

Navigation uses real links so standard browser actions and assistive
technology can discover destinations. The current page has a single clear
`h1`, feature groups use semantic headings, and icons are decorative unless
they convey information not present in text. Focus indicators match or exceed
the existing controls.

The four-card home grid collapses without horizontal scrolling on narrow
screens. Back actions and account controls remain reachable without covering
lesson controls or skeleton-page content.

## Error Handling

- Session lookup failures retain the existing retryable authentication error
  experience on `/login`.
- Onboarding load failures remain retryable on `/onboarding`.
- Invalid route parameters redirect to a safe canonical location rather than
  crashing or rendering a blank page.
- A future My Lesson request that is missing or not owned by the current user
  is handled as an unknown lesson and returns to `/lessons`; the UI does not
  disclose whether another user's lesson exists.
- Skeleton routes do not call unavailable generation, progress, or story APIs.

## Verification Strategy

Implementation follows test-first development around the new behavior:

- pure route-resolution tests cover stable lesson IDs, source namespaces,
  scene-number validation, canonical targets, and invalid paths;
- redirect-policy tests cover logged-out, onboarding-incomplete, and fully
  onboarded sessions, including safe `returnTo` handling;
- UI contract tests cover the four equal home links, the two lesson catalog
  sections, source-specific lesson links, skeleton copy, and Back to main menu
  actions;
- lesson navigation tests cover scene controls, automatic progression,
  browser Back and Forward, and cancellation of stale asynchronous work; and
- existing authentication, onboarding, lesson, audio, and speech tests remain
  green.

Final verification runs the full unit suite, lint, and production build. A
browser acceptance pass then checks direct protected links while logged out,
post-login return behavior, ordinary login to `/`, onboarding redirects,
refreshing every skeleton route, Parrot lesson deep links, invalid URLs, and
Back/Forward across screens and lesson scenes.

## Accepted Limitations and Risks

- My Lessons, lesson creation, progress, and storytelling are intentionally
  non-functional skeletons in this release.
- The current app was not originally structured around route-aware guards, so
  authentication and onboarding integration require careful regression tests.
- Scene navigation has active audio and microphone side effects; URL changes
  must use the existing cancellation/generation protections to prevent stale
  completions from mutating the new scene.
- Static hosting must continue to send unknown non-API paths to the Vite entry
  document so direct deep links can boot React Router.
