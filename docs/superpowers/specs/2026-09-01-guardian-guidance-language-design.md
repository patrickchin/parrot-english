# Guardian Guidance Language Design

**Date:** 2026-09-01

## Summary

Parrot English will support English and Simplified Chinese for Guardian-facing
guidance while preserving an English-immersive learner experience. A persistent,
always-available language control will let a Guardian choose `English` or `中文`.
The selection affects authentication, Guardian mode, adult handoffs, privacy,
consent, warnings, errors, and other adult-directed guidance. It does not change
learner curriculum or ordinary learner controls.

The setting is a local browser preference and does not appear in route URLs.
Existing paths such as `/guardian`, `/lessons`, and shared deep links remain
stable.

## Goals

- Let a Guardian operate every Guardian route in natural English or natural
  Simplified Chinese.
- Keep the language control visible on signed-out, loading, error, Guardian,
  learner, and full-screen activity views.
- Keep learner mode substantially English-only for immersion.
- Translate the few learner-side messages whose purpose is to hand the device to
  an adult or communicate an adult-only safety, privacy, or consent action.
- Use semantic message identifiers and complete locale catalogs so another
  Guardian language can be added without duplicating component markup.
- Declare document and in-page language changes correctly for assistive
  technology.
- Preserve current navigation, security boundaries, learner targets, progress,
  consent, privacy, warnings, errors, and live statuses.

## Non-goals

- Translating English lessons, stories, nursery rhymes, word-game curriculum,
  target phrases, speech, or saved audio.
- Choosing a different language to teach.
- Translating ordinary learner navigation, activity controls, progress, or
  recovery messages.
- Adding locale prefixes or query parameters to URLs.
- Adding server-side locale negotiation, translated SEO pages, or localized web
  manifests.
- Adding a third-party internationalization dependency before the built-in
  catalog approach proves insufficient.

## Audited Content Model

Every authored user-facing string belongs to one of the following groups.

| Group | Examples | Behavior |
| --- | --- | --- |
| Guardian guidance | Sign-in, Guardian dashboard, learner management, story and dubbing settings | Switch between English and Chinese |
| Privacy, consent, and destructive actions | AI/data notice, recording consent, learner deletion, account deletion | Switch between English and Chinese |
| Guardian system feedback | Guardian loading, saving, validation, errors, retry actions, live status | Switch between English and Chinese |
| Adult boundary on learner routes | Grown-up access, Guardian unlock, choose a learner, adult-required recording notices | English-first bilingual helper or fully localized adult overlay |
| Ordinary learner guidance | Home activities, Start, Back, Pause, Next, progress, ordinary audio/microphone recovery | Always English |
| English learning material | Lesson dialogue, target phrases, story text, join-in lines, rhyme lyrics, quiz prompts and vocabulary | Always English |
| Course identity | Lesson, story, scene, rhyme, and word-topic titles | Keep the English primary title |
| Pedagogical settings for adults | Story levels, personalization explanations, CEFR descriptions | Switch explanatory text; preserve standard identifiers such as CEFR |
| Proper or supplied values | Parrot English, Peppa, Dolly, learner names, account names, email addresses | Preserve exactly |
| Technical values | Provider/model names, commit IDs, deployment identifiers, timestamps | Translate labels; preserve values |

### Mixed strings

Mixed strings must keep the English learning segment separate from localized
framing. For example, Chinese Guardian guidance may translate the frame around
`Can you help me?` or `Peppa's High Ball`, but the target phrase or course title
remains English and is marked `lang="en"`.

Do not build mixed accessible names by concatenating Chinese and English into a
single `aria-label` when structured button content can express the same name.
Prefer visible or screen-reader-only child spans with the appropriate `lang`
attributes.

## Learner Immersion Policy

Learner routes keep English as both the visible interface language and the
document language. This includes:

- home and shelf navigation;
- lesson, story, dubbing, and word-game controls;
- progress and completion feedback;
- ordinary loading, microphone, audio, storage, and retry messages;
- accessible names and live announcements for ordinary learner actions.

Chinese can appear on a learner route only in these cases:

1. The global Guardian-language control itself.
2. The adult gateway. When Chinese is selected, `Grown-up access` includes the
   short helper `家长入口` without removing the English label.
3. A blocking notice whose required next actor is a Guardian, such as asking an
   adult to choose a learner or enable recording consent. The English notice
   remains primary and a concise Chinese helper appears below it.
4. A Guardian-only overlay or dialog opened from learner mode. The overlay is
   fully localized because its audience is now the adult.
5. A short privacy or saved-data helper during learner onboarding when an adult
   action or understanding is required.

Existing `promptEn` and `promptZh` questionnaire content remains unchanged. It
is intentionally bilingual learning/onboarding content and is not controlled by
the Guardian-language catalog.

## Chinese Writing Policy

Chinese text is authored for Mainland Chinese families rather than translated
word-for-word. It uses concise, familiar product language:

- Guardian: `家长`
- Guardian mode: `家长模式`
- Learner mode: `学习模式`
- Learner, when addressing a Guardian: normally `孩子`
- Grown-up access: English primary plus `家长入口` on learner routes

Names, brands, course titles, vendor names, and technical identifiers are not
transliterated. Copy review must keep visible text, accessible names, status
announcements, and error recovery consistent.

## Language Selection and Persistence

The supported Guardian languages are the BCP 47 tags `en` and `zh-Hans`.

Initial selection follows this order:

1. A valid explicit value in `localStorage` under
   `parrot:guardian-language`.
2. `zh-Hans` when the browser's ordered language preferences contain a Chinese
   language tag.
3. `en` as the fallback.

An invalid stored value is ignored. Unavailable or blocked storage must not
prevent the application from loading or the control from working for the
current page session. The application writes the preference only after an
explicit selection.

The choice is not stored in an account profile or sent to the server. Different
browsers may therefore use different Guardian languages for the same account.

### URL policy

The Guardian language never changes `pathname`, query parameters, hashes,
return targets, or generated links. Toggling language must leave
`window.location.href` unchanged and must not add browser history entries.

This is a UI preference rather than a separately published translation of the
curriculum. If Parrot later publishes complete, shareable, or indexable site
translations, that project can introduce locale-specific URLs and server-side
language negotiation without changing this preference's meaning.

## Architecture

### Locale catalogs

Add a focused `src/i18n` module containing:

- Guardian-language metadata and selection/persistence logic;
- the React provider and hooks;
- a shared Guardian-language control;
- an English catalog;
- a Simplified Chinese catalog.

Catalogs use semantic, domain-grouped identifiers rather than English sentences
as keys. The English catalog defines the shape. Every other catalog must satisfy
the same shape at compile time, including the signatures of messages that
interpolate a learner name, count, title, or status.

Catalog interpolation must preserve supplied values without translating or
renaming them. Components continue to use `bdi` or `dir="auto"` for learner and
account names.

### Provider

`GuardianLanguageProvider` wraps `RoutedApplication` above `AuthGate`. It owns:

- the selected `GuardianLanguage`;
- defensive initialization and persistence;
- complete English and Chinese message catalogs;
- the selection action used by every language control.

Components read localized Guardian copy through a hook. The provider does not
receive lesson, quiz, or story content and has no concept of the language being
taught.

### Global control

The root renders a compact `English | 中文` control using shared primitives from
`src/shared/ui.tsx`. It remains available before authentication and does not
navigate, submit forms, steal route-heading focus, or reset activity state.

The control occupies a reserved top-left application-header slot.
`RouteHeader` is adjusted once in `src/app/AppHeader.tsx` so route controls do
not overlap it. `AccountHeader` retains its current top-right ownership.

Modal overlays reuse the same language-control component inside their focus
boundary so a Guardian can translate a password, consent, or destructive-action
dialog without violating modal keyboard containment. The underlying global
control remains behind the overlay.

The visible option names are written in their own language and script. Each
button has a localized accessible name and a clear selected state. Switching
updates text immediately while retaining focus on the chosen language option.

## Document Language Semantics

- `/login` and Guardian routes set `document.documentElement.lang` to the
  selected Guardian language.
- Learner routes set the document language to `en`, even when the stored
  Guardian language is Chinese.
- Chinese adult helpers inside learner pages use `lang="zh-Hans"`.
- English course examples embedded in a Chinese Guardian view use `lang="en"`.
- A Guardian-only modal on an English learner route sets its dialog container's
  `lang` to the selected Guardian language.
- Proper names and technical terms do not receive a language override unless
  their surrounding pronunciation would otherwise be incorrect.

The static web manifest currently declares `zh-CN` while its name and
description are English. Set its static language to `en`; runtime Guardian
preference does not mutate a web manifest.

## Errors, Warnings, and Live Status

All authored Guardian validation, warning, error, retry, saving, and live-status
copy uses catalog entries. Known API and domain failures are mapped to stable
presentation states before rendering. An unknown failure receives a localized,
actionable fallback rather than exposing an untranslated server sentence as if
it were product copy.

The language switch must not clear an active error, dismiss a warning, change a
consent value, repeat an operation, or restart authentication. Only its rendered
message changes.

Learner-route operational errors remain English under the immersion policy.
Adult-required learner notices follow the English-first bilingual exception.

## Testing

Tests assert rendered behavior and accessible output, never CSS source or class
names.

### Unit and lifecycle coverage

- valid stored selection overrides browser preferences;
- a Chinese browser preference selects Chinese when no explicit value exists;
- invalid or unavailable storage falls back safely;
- explicit selection persists without changing the URL;
- English and Chinese catalogs have the same typed shape;
- switching language preserves active component and error state;
- Guardian views render their selected locale;
- ordinary learner views remain English under both Guardian-language settings;
- approved learner adult-boundary helpers render bilingual text only when
  Chinese is selected;
- document and nested `lang` attributes follow the route and content rules.

Replace the repository-wide “no Han characters” test with a boundary test that
allows Han text only in approved Chinese catalogs, intentional bilingual content,
and narrowly identified adult-helper components. English curriculum, lesson
data, word-game curriculum, rhyme lyrics, story scripts, and audio contracts
remain protected from accidental Chinese replacement.

### Playwright coverage

Add accessible-locator coverage proving that:

- the language control is visible on sign-in, session error, Guardian dashboard,
  learner home, lesson, and modal states;
- Guardian Chinese survives reload;
- toggling does not change the current URL or create navigation history;
- Guardian pages, dialogs, errors, warnings, and live statuses switch language;
- learner navigation and activity controls remain English;
- adult-required learner notices show only the approved Chinese helper;
- English target phrases remain visible and carry English language semantics;
- keyboard focus remains predictable through toggle, menu, and modal use;
- the control and existing headers do not overlap or create horizontal overflow
  from 280 px upward.

Run `npm run test`, `npm run build`, `npm run lint`, and
`npm run test:browser` before completion.

## Acceptance Criteria

- A Chinese-speaking Guardian can sign in, enter Guardian mode, manage learners,
  configure stories and recordings, understand privacy/AI use, recover from
  errors, and confirm deletion entirely in Chinese.
- A learner receives an English-immersive interface regardless of the saved
  Guardian language.
- Chinese appears on learner routes only for the documented adult boundary,
  adult-required notices, adult overlays, or existing intentional bilingual
  questionnaire content.
- English curriculum and saved/generated English audio remain unchanged.
- The language control is consistently available and accessible across route and
  authentication states.
- Language selection persists locally without appearing in URLs or affecting
  route history.
- Adding another Guardian language requires a new complete catalog and locale
  metadata, not duplicated page components or route changes.
