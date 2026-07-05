# Profile Summary Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential profile questionnaire with one editable summary form and place Profile beside Log out in one responsive account bar.

**Architecture:** Preserve onboarding's one-question flow while extracting its answer inputs for a dedicated all-questions `ProfileEditorView`. `OnboardingGate` owns keyed drafts and registers its Profile action with `AuthGate` through a small context; the Worker validates the submitted answer map in memory and writes the profile once.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Workers/D1, Drizzle ORM, Node test runner, server-rendered component tests, CSS.

---

## File Structure

- Create `src/account-actions.tsx`: register the profile callback with the authenticated account bar.
- Create `src/ProfileEditor.tsx`: render all questions in one profile form.
- Modify `src/AuthGate.tsx`: host the action provider and combined account bar.
- Modify `src/OnboardingQuestion.tsx`: export reusable answer inputs.
- Modify `src/OnboardingGate.tsx`: replace indexed profile state with keyed drafts.
- Modify `src/onboarding-api.ts`: submit one answer map and expose keyed errors.
- Modify `worker/onboarding.ts`: validate all answers before one write.
- Modify `src/styles.css`: profile-list and account-bar responsive styles.
- Modify `tests/auth-ui.test.mjs`, `tests/onboarding-ui.test.mjs`, `tests/onboarding-api.test.mjs`, and `tests/onboarding-worker.test.mjs`: focused regression coverage.

### Task 1: Combine Profile and Log out

**Files:**
- Create: `src/account-actions.tsx`
- Modify: `src/AuthGate.tsx`
- Modify: `src/OnboardingGate.tsx`
- Modify: `src/styles.css`
- Test: `tests/auth-ui.test.mjs`
- Test: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write the failing account-bar tests**

Add an `onOpenProfile` override to `renderAuthGate` and assert both controls are inside the same aside:

```js
it("renders Profile and Log out together in the account bar", () => {
  const html = renderAuthGate({
    onOpenProfile() {},
    session: { user: { email: "mia@example.test", name: "Mia" } },
  });
  const bar = html.match(
    /<aside[^>]*class="user-session-bar"[\s\S]*?<\/aside>/,
  )?.[0];
  assert.ok(bar);
  assert.match(bar, /aria-label="Edit learner profile"/);
  assert.match(bar, />退出登录</);
  assert.doesNotMatch(html, /class="profile-edit-button"/);
});
```

Change the completed onboarding view assertion to expect no standalone Edit learner profile button. Add a source assertion that `OnboardingGate.tsx` imports `useProfileAccountAction`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/onboarding-ui.test.mjs
```

Expected: FAIL because `AuthGateView` has no profile action and `OnboardingGateView` still renders `.profile-edit-button`.

- [ ] **Step 3: Create the registration context**

Create `src/account-actions.tsx`:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type ProfileAccountAction = {
  error: string;
  onOpen: () => void;
} | null;

type ProfileActionSetter = Dispatch<SetStateAction<ProfileAccountAction>>;
const AccountActionContext = createContext<ProfileActionSetter | null>(null);

export function AccountActionProvider({
  children,
  setProfileAction,
}: {
  children: ReactNode;
  setProfileAction: ProfileActionSetter;
}) {
  return (
    <AccountActionContext.Provider value={setProfileAction}>
      {children}
    </AccountActionContext.Provider>
  );
}

export function useProfileAccountAction(action: ProfileAccountAction) {
  const setProfileAction = useContext(AccountActionContext);
  useEffect(() => {
    if (!setProfileAction) return;
    setProfileAction(action);
    return () =>
      setProfileAction((current) => (current === action ? null : current));
  }, [action, setProfileAction]);
}
```

- [ ] **Step 4: Render the registered action in AuthGate**

Add `onOpenProfile: (() => void) | null` and `profileError: string` to `AuthGateViewProps`. Between the user label and Log out render:

```tsx
{onOpenProfile ? (
  <button
    aria-label="Edit learner profile"
    className="profile-account-button"
    onClick={onOpenProfile}
    type="button"
  >
    Profile
  </button>
) : null}
```

Render `profileError || formError` in `.session-error`. In `createAuthGate`, store a `ProfileAccountAction` with the injected state hook, pass its callback/error to `View`, and wrap `View` with `AccountActionProvider`.

- [ ] **Step 5: Register the action from OnboardingGate**

Use a memoized action only when the full profile is available:

```tsx
const canEditProfile = Boolean(
  fullData &&
    (fullData.canBypass ||
      fullData.profile.onboardingStatus === "completed"),
);
const profileAction = useMemo(
  () =>
    canEditProfile
      ? {
          error: profileLoadError,
          onOpen: () => void handleOpenProfile(),
        }
      : null,
  [canEditProfile, handleOpenProfile, profileLoadError],
);
useProfileAccountAction(profileAction);
```

Make `handleOpenProfile` a `useCallback`, track `profileLoadError`, and remove `onOpenProfile` plus `.profile-edit-button` from `OnboardingGateView`.

- [ ] **Step 6: Update account-bar CSS**

Delete `.profile-edit-button` rules and add:

```css
.user-session-bar {
  max-width: min(62vw, 520px);
}

.user-session-bar > span:first-child {
  min-width: 0;
}

.user-session-bar button {
  white-space: nowrap;
}

.user-session-bar .profile-account-button {
  background: #fff;
  color: #204c7f;
}

@media (max-width: 720px) {
  .user-session-bar {
    max-width: calc(100vw - 24px);
  }
}
```

- [ ] **Step 7: Verify GREEN and commit**

Run `node --test tests/auth-ui.test.mjs tests/onboarding-ui.test.mjs`; expect zero failures.

```bash
git add src/account-actions.tsx src/AuthGate.tsx src/OnboardingGate.tsx src/styles.css tests/auth-ui.test.mjs tests/onboarding-ui.test.mjs
git commit -m "fix: group profile and logout controls"
```

### Task 2: Show all editable profile answers

**Files:**
- Create: `src/ProfileEditor.tsx`
- Modify: `src/OnboardingQuestion.tsx`
- Modify: `src/OnboardingGate.tsx`
- Modify: `src/styles.css`
- Test: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write the failing profile-summary tests**

Load `ProfileEditorView`, render name and age questions together, and assert:

```js
assert.match(html, /What name would you like us to use\?/);
assert.match(html, /How old are you\?/);
assert.match(html, /value="Mia"/);
assert.match(html, /value="8"/);
assert.equal((html.match(/<form/g) ?? []).length, 1);
assert.match(html, />Save changes</);
assert.match(html, />Cancel</);
assert.doesNotMatch(html, />Next</);
assert.doesNotMatch(html, /Question 1 of/);
```

Add tests for `profileDraftsFromState` and `updateProfileDraft`, including preservation of an untouched array value.

- [ ] **Step 2: Run the UI test and verify RED**

Run `node --test tests/onboarding-ui.test.mjs`.

Expected: FAIL because `ProfileEditorView` and keyed draft helpers do not exist.

- [ ] **Step 3: Extract AnswerEditor**

In `OnboardingQuestion.tsx`, export an `AnswerEditor` that receives `inputId`, `question`, `value`, `pendingValue`, `fieldError`, `status`, `disabled`, and the existing edit/transcription callbacks. Move the current scalar input, array chips/add input, suggestion buttons, status text, and error JSX into it. Keep `OnboardingQuestionView` as one form/fieldset and render `AnswerEditor` before its existing Skip/Next action row.

The extracted input must use:

```tsx
<input
  id={inputId}
  max={question.answerType === "number" ? question.validation.max : undefined}
  maxLength={
    question.answerType === "number"
      ? undefined
      : question.validation.maxLength
  }
  min={question.answerType === "number" ? question.validation.min : undefined}
  onChange={(event) =>
    onValueChange(
      question.answerType === "number" && event.target.value !== ""
        ? Number(event.target.value)
        : event.target.value,
    )
  }
  type={question.answerType === "number" ? "number" : "text"}
  value={scalarValue(value)}
/>
```

- [ ] **Step 4: Create ProfileEditorView**

Create one `<form className="profile-editor-form">` containing all question sections. Each section has a prompt heading, optional Chinese translation, optional Replay button, and `AnswerEditor` with callbacks bound to `question.answerKey`. End with Cancel and Save changes:

```tsx
<footer className="profile-editor-actions">
  <button
    className="onboarding-skip-button"
    onClick={onCancel}
    type="button"
  >
    Cancel
  </button>
  <button
    className="onboarding-next-button"
    disabled={isSaving}
    type="submit"
  >
    {isSaving ? "Saving…" : "Save changes"}
  </button>
</footer>
```

The page heading is `Edit profile`, the intro is `Review and edit all your answers in one place.`, and the close control keeps `aria-label="Close profile editor"`.

- [ ] **Step 5: Replace profileIndex with keyed state**

Export:

```ts
export function profileDraftsFromState(profileState: ProfileState) {
  return Object.fromEntries(
    profileState.questions.map((question) => [
      question.answerKey,
      answerForQuestion(profileState.profile, question),
    ]),
  );
}

export function updateProfileDraft(
  drafts: Record<string, unknown>,
  answerKey: string,
  value: unknown,
) {
  return { ...drafts, [answerKey]: value };
}
```

Remove `profileIndex`. Add `profileDrafts`, `profilePendingValues`, `profileFieldErrors`, `profileFieldStatuses`, `profilePageError`, and `isProfileSaving`. Opening initializes all drafts. Keyed scalar, array add/remove/toggle, Replay, and transcription callbacks change only their target key. Cancel and close clear all profile editor state. Pass the complete question list to `ProfileEditorView`.

- [ ] **Step 6: Add profile summary styles**

```css
.onboarding-profile-screen {
  align-items: start;
}

.onboarding-profile-shell {
  width: min(100%, 860px);
  margin-block: auto;
}

.profile-editor-intro {
  color: #46617d;
  font-weight: 750;
}

.profile-editor-form > fieldset {
  display: grid;
  gap: 18px;
  min-width: 0;
  margin: 24px 0 0;
  border: 0;
  padding: 0;
}

.profile-question-section {
  display: grid;
  gap: 14px;
  border: 3px solid #d4eaf3;
  border-radius: 22px;
  padding: clamp(16px, 3vw, 24px);
}

.profile-question-heading,
.profile-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.profile-question-heading h2,
.profile-question-heading p {
  margin: 0;
}

.profile-editor-actions {
  position: sticky;
  bottom: -1px;
  margin-top: 22px;
  background: rgb(255 255 255 / 96%);
  padding-block: 14px 4px;
}
```

- [ ] **Step 7: Verify GREEN and commit**

Run `node --test tests/onboarding-ui.test.mjs tests/auth-ui.test.mjs`; expect zero failures.

```bash
git add src/ProfileEditor.tsx src/OnboardingQuestion.tsx src/OnboardingGate.tsx src/styles.css tests/onboarding-ui.test.mjs
git commit -m "feat: show all profile answers together"
```

### Task 3: Send one answer map and preserve keyed errors

**Files:**
- Modify: `src/onboarding-api.ts`
- Modify: `src/OnboardingGate.tsx`
- Test: `tests/onboarding-api.test.mjs`
- Test: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write failing client tests**

Call `saveProfileAnswers` with a fetch stub and assert:

```js
assert.equal(calls[0].path, "/api/profile");
assert.equal(calls[0].init.method, "PUT");
assert.deepEqual(JSON.parse(calls[0].init.body), {
  answers: {
    name: "Mia",
    age: 8,
    favoriteCartoons: ["Bluey"],
  },
});
```

For a 400 payload containing `fieldErrors: { age: "Please enter a number from 3 to 17." }`, assert the thrown `OnboardingApiError.fieldErrors` matches.

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/onboarding-api.test.mjs`.

Expected: FAIL because the bulk function and keyed error property do not exist.

- [ ] **Step 3: Implement the client contract**

Add `fieldErrors: Record<string, string>` to `OnboardingApiError`, sanitizing the response object's `fieldErrors` to string values. Replace `saveProfileAnswer` with:

```ts
export function saveProfileAnswers(
  answers: Record<string, unknown>,
  options?: OnboardingRequestOptions,
) {
  return requestJson<ProfileState>(
    "/api/profile",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    options,
  );
}
```

- [ ] **Step 4: Wire Save changes**

Normalize every loaded question with `submissionValue`, call `saveProfileAnswers` once, refresh onboarding, then close only after success:

```ts
const answers = Object.fromEntries(
  profileState.questions.map((question) => [
    question.answerKey,
    submissionValue(question, profileDrafts[question.answerKey]),
  ]),
);
const saved = await saveProfileAnswers(answers);
setProfileState(saved);
setData(await loadOnboarding());
closeProfileEditor();
```

On `OnboardingApiError`, retain drafts and copy `fieldErrors`; show `readableError(error)` as the page error only when the keyed map is empty.

- [ ] **Step 5: Verify GREEN and commit**

Run `node --test tests/onboarding-api.test.mjs tests/onboarding-ui.test.mjs`; expect zero failures.

```bash
git add src/onboarding-api.ts src/OnboardingGate.tsx tests/onboarding-api.test.mjs tests/onboarding-ui.test.mjs
git commit -m "feat: save profile answers together"
```

### Task 4: Validate and persist the profile atomically

**Files:**
- Modify: `worker/onboarding.ts`
- Test: `tests/onboarding-worker.test.mjs`

- [ ] **Step 1: Write failing Worker tests**

Add a success case that sends name, age, and one JSON answer in one PUT and verifies all three. Add an atomic failure:

```js
const before = state.sqlite
  .prepare(
    "SELECT name, age, answers_json FROM learner_profile WHERE auth_user_id = ?",
  )
  .get("user-1");
const response = await callOnboarding(
  state.database,
  "/api/profile",
  "PUT",
  { answers: { name: "Changed", age: 99 } },
);
assert.equal(response.status, 400);
assert.deepEqual(await response.json(), {
  error: "invalid_profile",
  fieldErrors: { age: "Please enter a number from 3 to 17." },
});
const after = state.sqlite
  .prepare(
    "SELECT name, age, answers_json FROM learner_profile WHERE auth_user_id = ?",
  )
  .get("user-1");
assert.deepEqual(after, before);
```

Add an unknown answer key case with a keyed `This question is no longer available.` error and no write.

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/onboarding-worker.test.mjs`.

Expected: FAIL because the handler still requires `{ questionKey, value }`.

- [ ] **Step 3: Validate all submitted entries before writing**

Allow `answers?: unknown` in `readJsonBody`. Require a non-null, non-array object. Collect validated values and keyed errors:

```ts
const validatedAnswers: Array<{
  entry: QuestionRow | typeof PROFILE_NAME_QUESTION;
  value: unknown;
}> = [];
const fieldErrors: Record<string, string> = {};

for (const [answerKey, value] of Object.entries(body.answers)) {
  const entry =
    answerKey === "name"
      ? PROFILE_NAME_QUESTION
      : state.questions.find(
          (question) => question.answerKey === answerKey,
        );
  if (!entry) {
    fieldErrors[answerKey] = "This question is no longer available.";
    continue;
  }
  const validation = validateAnswer(entry, value);
  if ("error" in validation) {
    fieldErrors[answerKey] = validation.error;
    continue;
  }
  validatedAnswers.push({ entry, value: validation.value });
}

if (Object.keys(fieldErrors).length > 0) {
  throw new ApiError(400, "invalid_profile", undefined, { fieldErrors });
}
```

- [ ] **Step 4: Apply in memory and write once**

```ts
const updated = validatedAnswers.reduce(
  (profile, { entry, value }) =>
    writeProfileAnswer(profile, entry.answerKey, value),
  state.profile,
);
await repository.saveAnswer(state.profile.id, {
  age: updated.age,
  answersJson: updated.answersJson,
  name: updated.name,
  skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
});
```

Reload and return the existing `ProfileState` response with newly applicable questions.

- [ ] **Step 5: Verify GREEN and commit**

Run `node --test tests/onboarding-worker.test.mjs tests/onboarding-api.test.mjs`; expect zero failures.

```bash
git add worker/onboarding.ts tests/onboarding-worker.test.mjs
git commit -m "feat: persist profile updates atomically"
```

### Task 5: Complete verification

**Files:**
- Modify only if a verification command exposes a defect in the files above.

- [ ] **Step 1: Run all focused tests**

```bash
node --test tests/auth-ui.test.mjs tests/onboarding-ui.test.mjs tests/onboarding-api.test.mjs tests/onboarding-worker.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run the full suite**

Run `npm test`; expected: PASS with zero failures.

- [ ] **Step 3: Run static verification**

Run `npm run lint` and `npm run build`; expected: both exit 0 with no ESLint or TypeScript errors.

- [ ] **Step 4: Inspect the final state**

```bash
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted source/test changes, and the design plus focused implementation commits are present.
