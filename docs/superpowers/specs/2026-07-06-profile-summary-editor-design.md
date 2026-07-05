# Profile Summary Editor Design

## Summary

Replace the current one-question-at-a-time profile editor with a single
scrollable form that shows every applicable questionnaire prompt and its saved
answer. Every answer is editable in place and the user saves the complete set
with one action.

Move the Profile action into the authenticated account bar beside the learner
name and Log out. The controls must share one responsive container so their
placement cannot overlap.

## Goals

- Show all applicable profile questions and current answers on one page.
- Allow every displayed answer to be edited without stepping through the
  onboarding questionnaire again.
- Save the edited profile in one explicit action.
- Keep Profile and Log out together in a responsive account control.
- Preserve the existing one-question onboarding experience.
- Preserve question-specific input types, suggestions, voice transcription,
  replay audio, validation rules, and accessibility.

## Non-goals

- Changing the onboarding question order or content.
- Adding profile photos, account credentials, or account deletion.
- Autosaving profile fields.
- Reopening onboarding or changing a completed learner's assigned
  questionnaire version.
- Adding an administrative questionnaire editor.

## User Experience

### Account controls

For an authenticated user who can access lessons, the existing account pill
contains, in order:

1. the learner/account label;
2. a Profile button; and
3. a Log out button.

The bar is one fixed responsive container. It may reduce the visible name on a
narrow viewport, but Profile and Log out remain distinct, usable controls and
must never overlap. Profile is omitted when the onboarding state is degraded
and no profile can be loaded, matching the existing behavior.

### Profile page

Profile opens a full-height profile screen over the lesson. Its card contains:

- an `Edit profile` heading and close control;
- a short explanation that all answers can be reviewed together;
- one section for every applicable profile question, in questionnaire order;
- a Cancel action; and
- one Save changes action.

Each question section shows the English prompt, the Chinese translation when
present, and the saved answer in the correct editable control. Array answers
remain removable chips with an add field and configured suggestions. Scalar
answers remain text, number, or choice inputs. Each question keeps its Replay
and microphone controls when audio and transcription are available.

The profile page does not replay Peppa's introduction, display onboarding
progress, show Next, or show any onboarding Skip action. Closing or cancelling
discards unsaved drafts. Save changes is disabled while saving and reports a
clear saving state.

## Component Design

### Shared answer controls

Extract the answer-control portion of `OnboardingQuestionView` into a reusable
component. It owns only the presentation of a single editable answer: scalar or
array inputs, suggestions, microphone state, and field feedback. The existing
onboarding question card continues to wrap that control with Peppa, progress,
Replay, Next, and Skip actions.

The profile editor maps the loaded questions to the same answer control with a
draft and error keyed by `answerKey`. This keeps input behavior and validation
constraints consistent without making the profile page render multiple nested
onboarding forms.

### Profile editor state

`OnboardingGate` continues to own profile loading and the open/closed state. On
open it converts the returned profile and question list into a draft map:

```text
answerKey -> current editable value
```

It also tracks pending array text, per-field transcription state, per-field
errors, the overall save state, and a page-level error. Editing one question
must not replace another question's draft.

A focused `ProfileEditorView` renders all questions from this state. The
existing one-question `profileIndex` and save-and-advance behavior are removed.

### Account action registration

`AuthGate` remains responsible for the authenticated account bar and signing
out. It exposes a small internal account-action context beneath the authenticated
gate. `OnboardingGate` registers its open-profile callback only while profile
editing is available. `AuthGate` renders that registered action inside the same
bar as Log out and removes it when unavailable.

This keeps authentication and profile loading in their existing owners while
giving the two controls one semantic and visual container.

## API and Persistence

`GET /api/profile` remains the source for the assigned profile and all
applicable questions.

Change the profile update request to submit the displayed draft map in one
payload:

```json
{
  "answers": {
    "name": "Mia",
    "age": 8,
    "favoriteCartoons": ["Bluey", "Paw Patrol"]
  }
}
```

The Worker loads the authenticated user's assigned questionnaire, rejects
unknown keys, and validates every supplied value against its server-owned
question definition. It applies all valid values to an in-memory profile copy
and performs one profile-row update only after the complete payload validates.
This prevents a failed multi-answer save from persisting a partial edit.

The response remains `ProfileState`, containing the saved profile and the
applicable question list. The client replaces its local profile state with that
response and closes the editor after success. The onboarding summary is then
refreshed so a later open reflects the same saved data.

The endpoint remains authenticated and derives the profile owner from the
session. Payload-size limits and server-side answer-key mapping remain in
force.

## Validation and Error Handling

- Browser constraints provide immediate number and length checks where
  available.
- The server is authoritative for question keys, types, cardinality, choices,
  bounds, and lengths.
- A rejected multi-answer request returns errors keyed by `answerKey`; the
  profile page displays each error beside its field.
- Request, network, or unexpected server failures appear once near the Save
  changes action.
- Failed saves keep all drafts visible and editable.
- Failed Replay or transcription affects only that question and leaves typing
  and configured choices available.
- Profile-load failure leaves the lesson visible and reports the failure from
  the account control area rather than opening an empty editor.

## Responsive and Accessibility Requirements

- The profile screen scrolls vertically and supports narrow and short
  viewports.
- Question sections use one column on phones and may use a wider layout only
  when labels and controls remain readable.
- The account bar uses one flex container and never relies on independent fixed
  offsets for Profile and Log out.
- Every prompt labels its answer control with a unique ID derived from
  `answerKey`.
- Replay, microphone, close, Profile, Cancel, and Save changes have clear
  accessible names and visible focus styles.
- Saving and transcription states use appropriate live status text; validation
  failures use alert semantics.
- Keyboard users can edit every answer and reach the page actions in a logical
  order.

## Testing

Focused automated tests will cover:

- the profile editor renders every question and every prefilled answer at the
  same time;
- scalar, array, suggestion, Replay, and microphone controls remain available;
- editing one draft preserves all other drafts;
- Save changes sends one answer map and closes only after success;
- server validation rejects unknown or invalid answers without writing any
  profile changes;
- field errors are associated with the correct question;
- Cancel and close discard drafts;
- onboarding remains one question at a time;
- the authenticated account bar contains Profile and Log out together;
- narrow-screen styles keep the account controls non-overlapping; and
- the focused UI/API tests, typecheck, lint, and production build pass.

## Implementation Scope

Expected changes are limited to the authenticated account controls, onboarding
and profile UI components, profile API client and Worker handler, relevant
styles, and focused tests. No migration or questionnaire content change is
required.
