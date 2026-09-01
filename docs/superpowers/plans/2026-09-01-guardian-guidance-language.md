# Guardian Guidance Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-available English/Simplified-Chinese switch for Guardian guidance, persist the explicit choice in local storage without changing any URL, and keep learner experiences English-immersive except for a tightly defined adult boundary.

**Architecture:** A dependency-free, typed `src/i18n` layer owns `GuardianLanguage`, complete English and `zh-Hans` catalogs, defensive local-storage selection, and React context. `GuardianLanguageChrome` renders one global shared control and applies route-aware document language semantics above `AuthGate`. Guardian components render semantic catalog entries; stateful flows store stable error/status codes rather than rendered language. Learner components remain hardcoded in English and may request only an allowlisted Chinese adult-helper message from the same catalog.

**Tech Stack:** TypeScript 5.9, React 19, React Router 7, Tailwind CSS 4 shared controls, Node `node:test`, Happy DOM lifecycle tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-guardian-guidance-language-design.md`

## Global Constraints

- Use the BCP 47 tags `en` and `zh-Hans`; do not use `cn`, `zh`, or a display label as stored state.
- Persist only an explicit user selection under `parrot:guardian-language`. Initial browser-language inference must not write to storage.
- Never put Guardian language in the path, query string, hash, link target, redirect target, or History API state. Switching must leave both `window.location.href` and `history.length` unchanged.
- Resolve initial language in this exact order: valid stored value, `zh-Hans` when any ordered browser preference has the primary subtag `zh`, then English. Ignore invalid storage. Catch storage read and write failures.
- Do not synchronize language with the account, API, worker, database, cookie, or another browser.
- Add no internationalization dependency. Keep the catalog and provider small enough that a third locale requires one complete catalog plus metadata, not copied components.
- Guardian/auth/account/privacy/consent/destructive-action copy, accessible names, warnings, errors, and live statuses switch languages. Store semantic status/error state so an open message retranslates without repeating its operation.
- Learner navigation, learner activity controls, ordinary learner feedback, and all curriculum remain English. Chinese is limited to the global control, a bilingual grown-up gateway, an adult-required blocking helper, an adult-only overlay, or a short adult privacy helper. The global control is the only fully Chinese element allowed on an otherwise ordinary learner page.
- Leave lesson dialogue, target phrases, stories, rhyme lyrics, word-game content, generated/saved audio, and curriculum data unchanged. Do not route those values through Guardian catalogs.
- Keep proper names and supplied values unchanged. Continue isolating learner/account names with `BidiLearnerName`, `bdi`, `dir="auto"`, or Unicode bidi isolates in computed accessible labels.
- Mark English learning examples and course titles embedded in Chinese Guardian copy with `lang="en"`. Mark Chinese helpers inside English learner pages with `lang="zh-Hans"`.
- Keep `/login` and Guardian documents at the selected language; keep learner-route documents at `en`. A Guardian dialog opened over a learner route gets its own selected `lang`.
- Reuse one `isGuardianGuidanceSurface(pathname, search)` predicate for document language, authentication audience, route placeholders, and shared route-header labels: it is true only for `/login` and Guardian routes. Fully localized adult dialogs are explicit Guardian surfaces regardless of their underlying route.
- Use `SegmentedControl` and `SegmentedButton` from `src/shared/ui.tsx`; do not create page-specific switch styling or add page CSS.
- Keep `AuthGate` as owner of `AccountHeader`; keep route headers composed through `RouteHeader`, `HeaderButton`, and `HeaderLink`.
- Preserve one `h1` per route, focus restoration, modal focus trapping, pending-state idempotency, selected learner, consent values, form contents, errors, warnings, and live regions while switching language.
- Tests must assert rendered behavior and accessible output, never Tailwind class strings. Run `npm run test:browser` because the always-visible control changes responsive header geometry.
- Before implementation, create a `codex/guardian-guidance-language` branch from the current commit. Finish through a pull request; do not merge the branch directly into `main`.
- Follow red-green-refactor and commit after every green task.

---

## File Map

### New language layer

- `src/i18n/messages/en.ts`: English source catalog and inferred catalog shape.
- `src/i18n/messages/zh-Hans.ts`: complete natural Simplified-Chinese catalog checked against the English shape.
- `src/i18n/guardian-language.tsx`: language tags, resolution, defensive persistence, context, hooks, and message-frame helpers.
- `src/i18n/GuardianLanguageControl.tsx`: shared global/dialog segmented language control.
- `src/i18n/GuardianLanguageChrome.tsx`: always-visible control plus route-aware `<html lang>` management.
- `src/i18n/AdultBoundaryHelper.tsx`: the only learner-facing helper that conditionally renders catalogued Chinese below English-first adult guidance.
- `tests/guardian-language.test.mjs`: pure resolution, storage, catalog, context, rerender, and document-language tests.
- `tests/e2e/guardian-language.spec.ts`: persistence, URL invariance, focus, modal, immersion, and responsive browser tests.

### Root and shared chrome

- `src/app/App.tsx`: mount provider/chrome above `RoutedApplication` and localize Guardian route placeholders.
- `src/app/AppHeader.tsx`: reserve header space, localize Guardian account/menu content, and add the learner-mode bilingual grown-up gateway.
- `src/app/FeaturePlaceholder.tsx`: accept localized retry/action labels from Guardian callers while retaining English defaults for learner surfaces.
- `src/app/app-routes.ts`: reuse existing route predicates only; language must not alter route helpers.
- `public/manifest.webmanifest`: correct the static English manifest language.

### Authentication and adult mode boundaries

- `src/auth/auth-form.ts`: return semantic auth error codes instead of rendered English.
- `src/auth/AuthGate.tsx`: localize all signed-out/loading/error/account statuses from codes.
- `src/auth/Turnstile.tsx`: localize security-check labels, statuses, and recovery copy.
- `src/auth/guardian-access-api.ts`: retain transport errors without choosing presentation language.
- `src/auth/GuardianAccess.tsx`: expose stable Guardian-access error codes from state/actions.
- `src/auth/GuardianUnlock.tsx`: localize screen/dialog content and place a language control inside the modal focus boundary.
- `src/app/ModeRouteBoundaries.tsx`: localize Guardian-only checks and switch-back guidance while keeping ordinary learner loading English.
- `src/app/LearnerModeSwitchDialog.tsx`: localize the adult learner chooser and semantic failures; include a dialog language control.

### Guardian pages

- `src/app/GuardianDashboard.tsx`: dashboard headings, descriptions, links, and learner-switch action.
- `src/learner-profile/GuardianLearnerTarget.tsx`: target chooser, loading, empty, failure, and selected-target guidance.
- `src/learner-profile/GuardianLearnerProfiles.tsx`: roster, add/edit/delete actions, statuses, and errors.
- `src/learner-profile/LearnerDeleteDialog.tsx`: localized destructive confirmation and dialog language control.
- `src/learner-profile/GuardianLearnerDetails.tsx`: semantic loading/save/consent errors and localized placeholders.
- `src/learner-profile/ProfileEditor.tsx`: Guardian profile fields, privacy/recording consent, confirmation, save status, and mixed English questionnaire semantics.
- `src/stories/GuardianStorySettings.tsx`: Guardian story-level and personalization settings while preserving English story titles.
- `src/stories/PersonalizedStoryArtPanel.tsx`: AI/private-art guidance, controls, errors, and statuses.
- `src/stories/usePersonalizedStoryArt.ts`: expose semantic load/generate/delete failures and ready/removed success statuses.
- `src/dubbing/GuardianDubbingSettings.tsx`: Guardian voice-data review/delete UI while preserving English rhyme titles.
- `src/app/AccountPrivacyPage.tsx`: page, danger-zone, and account-delete entry point.
- `src/app/AboutDialog.tsx`: AI, data, privacy, build, provider, and deployment labels; preserve technical values.
- `src/app/AccountDeleteDialog.tsx`: localized destructive flow, semantic error state, and dialog language control.

### Learner adult-boundary exceptions and guards

- `src/learner-profile/LearnerProfileGate.tsx`: short Chinese privacy helper and adult-required learner-selection helper only.
- `src/learner-profile/LearnerProfileQuestion.tsx`: localize only Guardian-route questionnaire chrome and canonicalize dynamic Chinese prompt metadata to `zh-Hans`.
- `src/learner-profile/LearnerProfileAcknowledgment.tsx`: localize the Guardian-route Next action while preserving acknowledgment learning content.
- `src/conversation/ConversationSurface.tsx`: no production copy change; include it in the learner-immersion audit.
- `src/dubbing/NurseryRhymeList.tsx`: English recording caution plus optional Chinese adult helper.
- `src/dubbing/DubStudio.tsx`: keep operational UI English; add Chinese only to the microphone-permission error that requires a grown-up.
- `tests/english-ui.test.mjs`: replace repository-wide no-Han rule with an explicit localization boundary.
- Existing focused tests: update `tests/auth-form.test.mjs`, `tests/auth-ui.test.mjs`, `tests/turnstile-ui.test.mjs`, `tests/guardian-access-ui.test.mjs`, `tests/product-streamline.test.mjs`, `tests/learner-mode-switch.test.mjs`, `tests/guardian-learner-target.test.mjs`, `tests/guardian-learner-profiles.test.mjs`, `tests/learner-profile-ui.test.mjs`, `tests/guardian-story-settings.test.mjs`, `tests/personalized-story-art-ui.test.mjs`, `tests/guardian-dubbing-settings.test.mjs`, `tests/account-deletion.test.mjs`, and lifecycle accessibility tests.

---

### Task 1: Build the typed language domain and defensive local preference

**Files:**
- Create: `src/i18n/messages/en.ts`
- Create: `src/i18n/messages/zh-Hans.ts`
- Create: `src/i18n/guardian-language.tsx`
- Create: `tests/guardian-language.test.mjs`
- Modify: `tests/english-ui.test.mjs`

**Interfaces:**

```ts
export const GUARDIAN_LANGUAGE_STORAGE_KEY = "parrot:guardian-language";
export const GUARDIAN_LANGUAGES = ["en", "zh-Hans"] as const;
export type GuardianLanguage = (typeof GUARDIAN_LANGUAGES)[number];

export type GuardianLanguageStorage = Pick<Storage, "getItem" | "setItem">;

export function resolveGuardianLanguage(
  storedLanguage: string | null,
  browserLanguages: readonly string[],
): GuardianLanguage;

export function isGuardianGuidanceSurface(
  pathname: string,
  search?: string,
): boolean;

export function GuardianLanguageProvider(props: PropsWithChildren<{
  initialLanguage?: GuardianLanguage;
  storage?: GuardianLanguageStorage | null;
  browserLanguages?: readonly string[];
}>): ReactElement;

export function useGuardianLanguage(): Readonly<{
  language: GuardianLanguage;
  messages: GuardianMessages;
  selectLanguage: (language: GuardianLanguage) => void;
}>;
```

The English catalog defines the contract without freezing every translated value to an English string literal:

```ts
export const englishGuardianMessages = {
  language: {
    controlLabel: "Guardian guidance language",
    englishOption: "English",
    chineseOption: "中文",
  },
  common: {
    cancel: "Cancel",
    retry: "Try again",
    back: "Back",
    save: "Save",
    saving: "Saving…",
  },
  learnerBoundary: {
    grownUpAccessHelper: "",
    guardianAccessErrorHelper: "",
    switchToLearnerHelper: "",
    chooseLearnerTitleHelper: "",
    chooseLearnerBodyHelper: "",
    savedAnswersHelper: "",
    recordingPermissionHelper: "",
    recordingCautionHelper: "",
  },
} as const;

type WidenMessages<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends string
    ? string
    : { readonly [Key in keyof T]: WidenMessages<T[Key]> };

export type GuardianMessages = WidenMessages<typeof englishGuardianMessages>;
```

`zh-Hans.ts` must use `satisfies GuardianMessages`. Its first boundary entries are exact natural copy:

```ts
learnerBoundary: {
  grownUpAccessHelper: "家长入口",
  guardianAccessErrorHelper: "请让家长重试。",
  switchToLearnerHelper: "请家长切换到学习模式后继续。",
  chooseLearnerTitleHelper: "请家长先选择一位孩子",
  chooseLearnerBodyHelper: "家长可以进入家长模式，选择正在学习的孩子后再返回。",
  savedAnswersHelper: "我们会保存你的回答，家长可以修改你的姓名和年龄。",
  recordingPermissionHelper: "请让家长开启麦克风权限，然后重试。",
  recordingCautionHelper: "录音前请先征得家长同意。",
}
```

- [ ] **Step 1: Add failing pure-resolution and catalog tests**

Use Vite SSR loading as existing component tests do. Assert the exact matrix:

```js
assert.equal(resolveGuardianLanguage("zh-Hans", ["en-US"]), "zh-Hans");
assert.equal(resolveGuardianLanguage("en", ["zh-CN"]), "en");
assert.equal(resolveGuardianLanguage("invalid", ["zh-CN", "en"]), "zh-Hans");
assert.equal(resolveGuardianLanguage(null, ["en-US", "zh-TW"]), "zh-Hans");
assert.equal(resolveGuardianLanguage(null, ["en-US"]), "en");
```

Recursively compare English and Chinese leaf paths and leaf kinds (`string` versus `function`). Assert `GUARDIAN_LANGUAGES` has only the two supported tags and the storage key is exact.

Replace the old repository-wide no-Han rule at this foundation step so every intermediate commit remains green. Permit the two exact catalog files, then assert separately that:

- `zh-Hans.ts` contains Han;
- removing the one native option literal `中文` from `en.ts` leaves no Han;
- every other shipped runtime/metadata file contains no literal Han.

- [ ] **Step 2: Add failing provider lifecycle tests**

Use `installDom`, `mountStrict`, `click`, and `flush` from `tests/helpers/react-lifecycle.mjs`. Cover:

- a valid stored selection winning over browser preferences;
- a Chinese browser preference being used when storage is empty;
- invalid storage falling through to browser preferences;
- throwing `getItem` falling back safely;
- no `setItem` call during initialization;
- one exact `setItem("parrot:guardian-language", "zh-Hans")` after a click;
- throwing `setItem` retaining the in-memory Chinese selection;
- direct component rendering outside a provider receiving the English default, preserving current SSR tests.
- `initialLanguage` acting as a test/SSR override that wins over storage and browser preferences but is never persisted;
- missing or throwing access to `navigator.languages`/`navigator.language` falling back to English.

- [ ] **Step 3: Run the focused test and verify RED**

```bash
node --test tests/guardian-language.test.mjs tests/english-ui.test.mjs
```

Expected: the new modules and exports do not exist.

- [ ] **Step 4: Implement language resolution and the provider**

Normalize browser tags case-insensitively by splitting on `-`; any preference whose primary subtag is `zh` selects `zh-Hans`. Safely obtain defaults only in the browser:

```ts
function getBrowserStorage(): GuardianLanguageStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
```

Use a lazy `useState` initializer. `selectLanguage` updates state first, then catches `setItem` failure. It must not call `location`, `navigate`, `history`, `fetch`, or an account action. The default context uses English messages and a no-op selector so direct static view tests keep working.

Guard browser preferences without assuming `navigator.languages` exists. Use `navigator.languages` when it is a readable array, otherwise a readable `navigator.language`, otherwise `[]`; catch getters that throw. Export `isGuardianGuidanceSurface` using the existing `/login` gate and `isGuardianRoute` predicates so later tasks share one audience decision.

- [ ] **Step 5: Run focused tests and the type checker and verify GREEN**

```bash
node --test tests/guardian-language.test.mjs tests/english-ui.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Commit the language foundation**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/zh-Hans.ts src/i18n/guardian-language.tsx tests/guardian-language.test.mjs tests/english-ui.test.mjs
git commit -m "feat: add guardian language foundation"
```

---

### Task 2: Mount the always-visible control without putting state in the URL

**Files:**
- Create: `src/i18n/GuardianLanguageControl.tsx`
- Create: `src/i18n/GuardianLanguageChrome.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppHeader.tsx`
- Modify: `tests/guardian-language.test.mjs`
- Create: `tests/e2e/guardian-language.spec.ts`
- Modify: `tests/e2e/header.spec.ts`

**Interfaces:**

```ts
export function GuardianLanguageControl({
  placement = "global",
}: {
  placement?: "global" | "dialog";
}): ReactElement;

export function GuardianLanguageChrome({
  children,
}: PropsWithChildren): ReactElement;

export function RouteHeader({
  ariaLabel = "Page navigation",
  children,
}: {
  ariaLabel?: string;
  children: ReactNode;
}): ReactElement;
```

- [ ] **Step 1: Add failing rendered-control tests**

Render the control under `GuardianLanguageProvider initialLanguage="en"`. Assert a group named `Guardian guidance language` with `lang="en"`, visible options whose stable self-names are `English` and `中文`, option-level `lang="en"` and `lang="zh-Hans"`, and one selected state. Click 中文 and assert the group name switches to the Chinese catalog, the group gets `lang="zh-Hans"`, the two native option names stay unchanged, and focus remains on the clicked option.

Render `GuardianLanguageChrome` in a memory router and assert:

| Route | Selected preference | `<html lang>` |
| --- | --- | --- |
| `/login` | `zh-Hans` | `zh-Hans` |
| `/guardian` | `zh-Hans` | `zh-Hans` |
| `/guardian/learners/a` | `zh-Hans` | `zh-Hans` |
| `/` | `zh-Hans` | `en` |
| `/lessons` | `zh-Hans` | `en` |
| `/profile` | `zh-Hans` | `en` |

Unmount after each case and assert the prior test document language is not leaked.

- [ ] **Step 2: Add failing browser persistence and URL-invariance tests**

In `tests/e2e/guardian-language.spec.ts`:

1. Open a signed-out `/login`, wait for redirects and route normalization to settle, capture `location.href` and `history.length` immediately before the language click, switch to 中文, and assert both values are unchanged.
2. Reload and assert Chinese remains selected and the document language is `zh-Hans`.
3. Open `/guardian?parrotE2eGuardian=guardian`, learner home, a lesson, and a session-error stub; assert the control is visible at each state.
4. On a learner route with a saved Chinese preference, assert `document.documentElement.lang === "en"` while the language-control group itself has `lang="zh-Hans"` and the 中文 option remains selected.
5. Clear the key, emulate `navigator.languages` beginning with `zh-CN`, reload, and assert Chinese is inferred but `localStorage.getItem("parrot:guardian-language") === null`.
6. Toggle on `/guardian` and assert `<html lang>` changes immediately from `en` to `zh-Hans`; toggle on `/lessons` and assert it remains `en`. In both cases the URL/history snapshot is unchanged and the 中文 option retains `lang="zh-Hans"`.

Use accessible roles and names. Do not inspect Tailwind classes.

- [ ] **Step 3: Add failing responsive header tests**

Extend `tests/e2e/header.spec.ts` at 280×568, 320×568, 360×640, and 390×844. Measure the language group, route-header control, account button, and viewport. Assert every box is inside the viewport, no pair overlaps, no horizontal overflow appears, and all remain keyboard reachable. Cover both English and Chinese selection, plus the 280 px Guardian sign-out-recovery state.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
node --test tests/guardian-language.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/header.spec.ts
```

Expected: control/chrome are missing and header geometry has no reserved language slot.

- [ ] **Step 5: Implement the shared control**

Render a two-column `SegmentedControl` and two `SegmentedButton` children. Set the group/root accessible label from the active catalog and set `lang={language}` on that group. Keep each option's visible and accessible native self-name stable (`English` with `lang="en"`, `中文` with `lang="zh-Hans"`); `aria-pressed` communicates the current selection without a translated action-label override. Set `type="button"` and call only `selectLanguage`.

The global placement is fixed in the shared top-left header slot at `z-40`, uses a fixed narrow width of `8.5rem`, and overrides only the segmented buttons' horizontal padding so `English | 中文` fits without truncation. The dialog placement is in normal flow and full width. Do not make either a link or form submit control.

- [ ] **Step 6: Implement route-aware language chrome**

Use `useLocation` and the shared `isGuardianGuidanceSurface` predicate. Define a browser-safe layout effect (`typeof document === "undefined" ? useEffect : useLayoutEffect`) so SSR does not warn. Use it to avoid announcing a browser frame with stale language, and restore only a value this chrome still owns:

```ts
const guardianDocument = isGuardianGuidanceSurface(
  location.pathname,
  location.search,
);
const documentLanguage = guardianDocument ? language : "en";

useBrowserLayoutEffect(() => {
  const previousLanguage = document.documentElement.lang;
  document.documentElement.lang = documentLanguage;
  return () => {
    if (document.documentElement.lang === documentLanguage) {
      document.documentElement.lang = previousLanguage;
    }
  };
}, [documentLanguage]);
```

In `App`, wrap `RoutedApplication` exactly once:

```tsx
<GuardianLanguageProvider>
  <GuardianLanguageChrome>
    <RoutedApplication />
  </GuardianLanguageChrome>
</GuardianLanguageProvider>
```

This remains inside the existing `BrowserRouter` from `main.tsx` and above `AuthGate` in `RoutedApplication`.

- [ ] **Step 7: Reserve shared header space**

Give the fixed language group the 8.5 rem slot, move `RouteHeader` to a 9.5 rem narrow left inset while retaining icon-only route controls, and keep `AccountHeader` fixed top-right. In the sign-out-recovery state, position `Sign out again` below the account button on narrow viewports and return it to the current inline row at `wide`; do not reserve the existing 12.25 rem top-row width on a 280 px screen. This creates three non-overlapping top-row regions and leaves recovery in a second row. Implement this only in shared chrome utilities; do not patch individual pages or add CSS.

- [ ] **Step 8: Run focused tests and verify GREEN**

```bash
node --test tests/guardian-language.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/header.spec.ts
```

- [ ] **Step 9: Commit the persistent global control**

```bash
git add src/i18n/GuardianLanguageControl.tsx src/i18n/GuardianLanguageChrome.tsx src/app/App.tsx src/app/AppHeader.tsx tests/guardian-language.test.mjs tests/e2e/guardian-language.spec.ts tests/e2e/header.spec.ts
git commit -m "feat: persist guardian language locally"
```

---

### Task 3: Localize authentication, Guardian access, and account chrome from semantic errors

**Files:**
- Modify: `src/i18n/messages/en.ts`
- Modify: `src/i18n/messages/zh-Hans.ts`
- Modify: `src/auth/auth-form.ts`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/auth/Turnstile.tsx`
- Modify: `src/auth/guardian-access-api.ts`
- Modify: `src/auth/GuardianAccess.tsx`
- Modify: `src/auth/GuardianUnlock.tsx`
- Modify: `src/app/AppHeader.tsx`
- Create: `src/i18n/AdultBoundaryHelper.tsx`
- Modify: `tests/auth-form.test.mjs`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `tests/turnstile-ui.test.mjs`
- Modify: `tests/guardian-access-ui.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`
- Modify: `tests/e2e/guardian-language.spec.ts`

**Semantic error contracts:**

```ts
export type AuthErrorCode =
  | "name-required"
  | "invalid-email"
  | "password-too-short"
  | "email-registered"
  | "invalid-credentials"
  | "security-check-required"
  | "security-check-rejected"
  | "sign-in-failed"
  | "sign-out-failed";

export type GuardianAccessErrorCode =
  | "check-failed"
  | "lock-failed"
  | "access-changed";

export function AdultBoundaryHelper({
  message,
  placement = "block",
}: {
  message: keyof GuardianMessages["learnerBoundary"];
  placement?: "block" | "compact";
}): ReactElement | null;
```

`validateAuthForm`, `getAuthErrorCode`, `submitAuthForm`, `signInGuestSession`, and `signOutSession` return codes or `null`; no helper returns final user-facing English. Account deletion keeps its existing string contract until Task 6 changes the action, context, and dialog together. `GuardianAccessContextValue.error`, `lock()`, and `unlock()` expose a `GuardianAccessErrorCode | null`. Transport-layer exception messages remain diagnostic and are never rendered directly.

- [ ] **Step 1: Change auth tests to expect semantic codes and verify RED**

Update form/action assertions, for example:

```js
assert.equal(validateAuthForm("sign-up", emptyName), "name-required");
assert.equal(getAuthErrorCode({ code: "INVALID_EMAIL_OR_PASSWORD" }), "invalid-credentials");
assert.equal(getAuthErrorCode({ code: "UNRECOGNIZED" }), "sign-in-failed");
```

Assert server-supplied `error.message` text is not returned.

- [ ] **Step 2: Add failing English/Chinese auth rendering tests**

Keep existing direct English `AuthGateView` tests working through the default context. Add provider-wrapped Chinese cases for:

- checking session: `正在检查登录状态…`;
- session error heading: `暂时无法登录`, body, and `重试`;
- sign in: `欢迎回来`, `登录`, `电子邮箱`, `密码`;
- sign up: `创建账户`, `账户姓名`, `至少 8 个字符`;
- guest/security-check statuses;
- every `AuthErrorCode` mapping;
- an already-visible invalid-credentials error switching languages without changing fields or submitting again.
- `/login` auth loading/error using Chinese, while the same session loading/error presentation on `/`, `/lessons`, or another learner path remains English under a Chinese preference.

The Chinese auth catalog must use this wording:

| English meaning | Simplified Chinese |
| --- | --- |
| Create your account | 创建账户 |
| Welcome back | 欢迎回来 |
| Sign in / Sign up | 登录 / 注册 |
| Account name | 账户姓名 |
| Email | 电子邮箱 |
| Password | 密码 |
| At least 8 characters | 至少 8 个字符 |
| Continue as guest | 以访客身份继续 |
| Security check | 安全验证 |
| Try again / Cancel | 重试 / 取消 |

- [ ] **Step 3: Add failing account-header and Guardian-unlock tests**

Assert Guardian mode localizes `Account`, profile aria-label, `Guardian`, menu label, Guardian dashboard, Manage learners, Account & privacy, Sign out, retry, pending status, and alerts. In learner mode under `zh-Hans`, assert ordinary `Account`, `Learner`, and `Switch modes` stay English while `Grown-up access` gains a child `<span lang="zh-Hans">家长入口</span>`. Exercise a failed direct Grown-up access attempt: keep the English access failure first, add `<span lang="zh-Hans">请让家长重试。</span>`, and retranslate/remove only that helper when the preference changes. Ordinary learner account/profile and session failures remain English-only.

For the existing exported `GuardianUnlockDialog`, assert the dialog itself has `lang="zh-Hans"`, all adult content is Chinese, and a dialog-placement language control is inside the element with `role="dialog"`. Toggle to English and assert the same open dialog, pending/error state, and focus trap remain intact. This is a component test only: production currently uses direct mode transition plus `GuardianUnlockScreen`, and this language task must not introduce a new unlock modal flow.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
node --test tests/auth-form.test.mjs tests/auth-ui.test.mjs tests/turnstile-ui.test.mjs tests/guardian-access-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

- [ ] **Step 5: Implement codes and catalog-driven authentication**

Map Better Auth/Turnstile codes to `AuthErrorCode`; map unknowns to an actionable generic code. Add `guardianAudience?: boolean` to the AuthGate view/container contract. The production `AuthGate` computes it with `isGuardianGuidanceSurface(location.pathname, location.search)`; direct auth-view tests default it to `true`. Resolve codes through `messages.auth.errors[code]` during render. Do not store catalog output in state.

Localize every authored visible string, `aria-label`, `title`, alert, and live status in `AuthGate.tsx` and `Turnstile.tsx` only when `guardianAudience` is true. On learner routes, session/auth loading and recovery remain English unless a separately allowlisted adult handoff is shown. Preserve the `Parrot English` identity and Turnstile vendor behavior. Language switching must not remount the widget; only its surrounding status text changes.

- [ ] **Step 6: Implement semantic Guardian-access failures**

Normalize all provider outcomes to the three stable codes. Preserve the existing race protection, cross-tab lock marker, expiry, compensation, and definitive-password-failure behavior. `guardian-access-api.ts` may keep diagnostic exception messages for logs/tests, but `GuardianAccess.tsx` must not expose them as presentation copy.

Localize `GuardianUnlockForm`, `GuardianUnlockDialog`, and `GuardianUnlockScreen`. Put `GuardianLanguageControl placement="dialog"` inside the dialog section and outside its disabled fieldset so it stays operable during pending work. Keep the existing submit-button initial focus and focus restoration; the language options enter the normal trapped Tab order. Do not mount the unused dialog in production as part of this task.

- [ ] **Step 7: Implement audience-aware `AccountHeader` copy**

Select full Guardian catalog copy only when `activeMode === "guardian"`. Retain English learner account chrome. Create `AdultBoundaryHelper` and use its compact placement for `家长入口` and for the Guardian-access failure helper only. It returns `null` in English and emits `lang="zh-Hans"` in Chinese.

Do not flatten `access.error`, the direct-switch failure, and ordinary account/profile errors into `access.error || switchError || error` before deciding their audience. Retain a stable error source/code: Guardian-mode access failures render fully from the selected catalog; learner-mode access failures render the English message plus `guardianAccessErrorHelper`; unrelated learner failures stay English-only. Preserve menu keyboard navigation, `aria-describedby`, sign-out retry, live regions, supplied names, and email values.

- [ ] **Step 8: Run focused and browser tests and verify GREEN**

```bash
node --test tests/auth-form.test.mjs tests/auth-ui.test.mjs tests/turnstile-ui.test.mjs tests/guardian-access-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/lifecycle/app-lifecycle.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/account-sign-out-feedback.spec.ts
```

- [ ] **Step 9: Commit localized authentication and access**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/zh-Hans.ts src/i18n/AdultBoundaryHelper.tsx src/auth/auth-form.ts src/auth/AuthGate.tsx src/auth/Turnstile.tsx src/auth/guardian-access-api.ts src/auth/GuardianAccess.tsx src/auth/GuardianUnlock.tsx src/app/AppHeader.tsx tests/auth-form.test.mjs tests/auth-ui.test.mjs tests/turnstile-ui.test.mjs tests/guardian-access-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/lifecycle/app-lifecycle.test.mjs tests/e2e/guardian-language.spec.ts
git commit -m "feat: localize guardian authentication"
```

---

### Task 4: Localize the Guardian dashboard and adult mode handoffs

**Files:**
- Modify: `src/i18n/messages/en.ts`
- Modify: `src/i18n/messages/zh-Hans.ts`
- Modify: `src/app/GuardianDashboard.tsx`
- Modify: `src/app/FeaturePlaceholder.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ModeRouteBoundaries.tsx`
- Modify: `src/app/LearnerModeSwitchDialog.tsx`
- Modify: `src/learner-profile/GuardianLearnerTarget.tsx`
- Modify: `tests/product-streamline.test.mjs`
- Modify: `tests/learner-mode-switch.test.mjs`
- Modify: `tests/guardian-learner-target.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `tests/e2e/guardian-language.spec.ts`
- Modify: `tests/e2e/guardian-mode.spec.ts`

**Stable state contracts:**

```ts
type LearnerRosterFailure = "load-failed" | null;
type LearnerSwitchFailure = "select-failed" | "lock-failed" | null;
type GuardianLearnerTargetFailure = "load-failed" | null;
```

Keep profile names as values; render button/status labels through catalog interpolation such as `startAs(name)` and `starting(name)` with Unicode bidi isolates for accessible strings.

- [ ] **Step 1: Add failing Chinese dashboard tests**

Provider-wrap `GuardianDashboardView` with `initialLanguage="zh-Hans"`. Assert the single route `h1`, section headings, descriptions, button names, link names, and switch action are Chinese. Required primary terms:

| English | Simplified Chinese |
| --- | --- |
| Guardian dashboard | 家长中心 |
| Switch to learner | 切换到学习模式 |
| Learner profiles | 孩子资料 |
| Manage learners | 管理孩子 |
| Learning & content | 学习与内容 |
| Story settings | 故事设置 |
| Voice dubbing | 配音管理 |
| Account & privacy | 账户与隐私 |

- [ ] **Step 2: Add failing adult-dialog and boundary tests**

Assert the learner chooser renders in Chinese, includes its own dialog language control, keeps names unchanged, and re-renders loading, empty, retry, switching, and failure states without a reload. Switch it back to English while an error is visible and assert the alert changes language without another API call.

For `ModeRouteBoundaries`:

- Guardian-route access checks and Guardian unlock screens use selected Guardian language.
- A Guardian currently blocking a learner route keeps the existing English `Switch to learner mode` title, explanation, and action, followed by `<span lang="zh-Hans">请家长切换到学习模式后继续。</span>` when Chinese is selected.
- An ordinary learner-route access-loading placeholder stays English, even when the saved Guardian language is Chinese.

For `GuardianLearnerTarget`, cover loading, no learners, retry, chooser label, managed learner context, and selected target in both languages.

For every Guardian route in this task, assert `RouteHeader` has the localized accessible label (`Page navigation` / `页面导航`) while the same shared header on learner routes stays English. Assert Guardian `FeaturePlaceholder` retry/action labels are localized through props and the component's defaults remain English. Also open the learner chooser over a learner-path document: the document stays `lang="en"`, while the dialog is fully Chinese with `lang="zh-Hans"`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test tests/product-streamline.test.mjs tests/learner-mode-switch.test.mjs tests/guardian-learner-target.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

- [ ] **Step 4: Implement dashboard and adult handoff catalogs**

Move all authored dashboard copy into `messages.guardianDashboard`. Add `messages.modeBoundary`, `messages.learnerSwitch`, and `messages.learnerTarget` groups in both catalogs in the same commit.

Add `retryLabel = "Try again"` to `FeaturePlaceholder` and retain its current English `actionLabel` default. Guardian callers pass `messages.common.retry` and their localized action label explicitly. Every Guardian `RouteHeader` passes `ariaLabel={messages.common.pageNavigation}`; learner callers rely on the English default.

In `ApplicationRoutes`, use `isGuardianGuidanceSurface(location.pathname, location.search)` to select localized Guardian Suspense/wildcard placeholders or the existing English learner placeholders. This is presentation-only and must not change `wildcardTarget`, redirects, or route matching.

Replace `errorMessage(error)` rendering in `LearnerModeSwitchDialog` with stable failure state. A returned `GuardianAccessErrorCode` maps to `lock-failed`; thrown roster/select errors map to their local fallback and never expose a server sentence. Add `lang={language}` and the dialog-placement control to the existing trapped section.

Make `AccessCheck` accept an explicit audience:

```tsx
function AccessCheck({ guardianAudience }: { guardianAudience: boolean }) {
  const { messages } = useGuardianLanguage();
  return (
    <FeaturePlaceholder
      busy
      description={
        guardianAudience
          ? messages.modeBoundary.checkingDescription
          : "Confirming which profile can use this screen."
      }
      title={
        guardianAudience
          ? messages.modeBoundary.checkingTitle
          : "Checking guardian access…"
      }
    />
  );
}
```

Pass `guardianAudience={true}` from `GuardianModeBoundary` and `guardianAudience={false}` from `LearnerModeBoundary`; update both existing call sites in the same step. Keep the learner boundary's title/body/action English and append `AdultBoundaryHelper message="switchToLearnerHelper"` beneath its blocking explanation.

`GuardianLearnerTargetState` carries `GuardianLearnerTargetFailure`, not a rendered string. Map all caught or server-supplied failures to `load-failed` and retain raw messages only as diagnostics.

- [ ] **Step 5: Run focused and browser tests and verify GREEN**

```bash
node --test tests/product-streamline.test.mjs tests/learner-mode-switch.test.mjs tests/guardian-learner-target.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/guardian-mode.spec.ts
```

- [ ] **Step 6: Commit Guardian navigation and handoffs**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/zh-Hans.ts src/app/App.tsx src/app/GuardianDashboard.tsx src/app/FeaturePlaceholder.tsx src/app/ModeRouteBoundaries.tsx src/app/LearnerModeSwitchDialog.tsx src/learner-profile/GuardianLearnerTarget.tsx tests/product-streamline.test.mjs tests/learner-mode-switch.test.mjs tests/guardian-learner-target.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/e2e/guardian-language.spec.ts tests/e2e/guardian-mode.spec.ts
git commit -m "feat: localize guardian navigation"
```

---

### Task 5: Localize learner management, profile editing, consent, and deletion

**Files:**
- Modify: `src/i18n/messages/en.ts`
- Modify: `src/i18n/messages/zh-Hans.ts`
- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `src/learner-profile/GuardianLearnerProfiles.tsx`
- Modify: `src/learner-profile/LearnerDeleteDialog.tsx`
- Modify: `src/learner-profile/GuardianLearnerDetails.tsx`
- Modify: `src/learner-profile/ProfileEditor.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `src/learner-profile/LearnerProfileQuestion.tsx`
- Modify: `src/learner-profile/LearnerProfileAcknowledgment.tsx`
- Modify: `src/app/AppHeader.tsx`
- Modify: `tests/guardian-learner-profiles.test.mjs`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/learner-deletion.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `tests/e2e/multiple-learners.spec.ts`
- Modify: `tests/e2e/guardian-language.spec.ts`

**Presentation-state contracts:**

```ts
type LearnerRosterErrorCode =
  | "load-failed"
  | "add-failed"
  | "last-learner"
  | "learner-busy"
  | "cleanup-pending"
  | "deletion-uncertain"
  | "delete-failed";

type LearnerRosterStatus =
  | { kind: "deleted"; learnerName: string }
  | null;

type LearnerDetailsErrorCode =
  | "load-failed"
  | "save-failed"
  | "recording-choice-failed";

export type LearnerProfileFieldErrorCode =
  | "answer-required"
  | "question-unavailable"
  | "description-required"
  | "too-long"
  | "private-details"
  | "preferred-name"
  | "age-whole-number"
  | "check-answer";

type ProfileEditorAudience = "guardian" | "learner";
```

Add a pure `getLearnerProfileFieldErrorCode(message)` at the client boundary. Map every currently emitted worker validation message and map an unknown message to `check-answer`; do not render arbitrary server text in Guardian UI.

The exact mapping is:

```ts
const FIELD_ERROR_CODES = new Map<string, LearnerProfileFieldErrorCode>([
  ["This question is no longer available.", "question-unavailable"],
  ["Please enter a description.", "description-required"],
  ["Please enter an answer.", "answer-required"],
  ["Please answer this question.", "answer-required"],
  ["Do not share your school, home address, phone, email, or password.", "private-details"],
  ["Please use only your first name or nickname.", "preferred-name"],
  ["Please tell me the name you would like us to use.", "preferred-name"],
  ["Please tell me your age using a whole number.", "age-whole-number"],
  ["Please check this answer and try again.", "check-answer"],
]);
```

Any `Please use N characters or fewer.` value maps to `too-long`; everything else maps to `check-answer`.

- [ ] **Step 1: Add failing roster and deletion localization tests**

Test English defaults plus Chinese for:

- `管理孩子`, loading and retry;
- setup complete/in progress/not started;
- age framing and missing age;
- edit/delete/finish deleting accessible names with Bob unchanged;
- add learner, preferred name, pending add;
- last learner warning;
- each deletion error code and deletion status;
- the delete dialog warning, description, Cancel/Delete/pending controls, and alert;
- a dialog-placement language control inside the trapped delete dialog.

Toggle with the delete dialog open and an error visible; assert the same profile remains selected, no deletion repeats, focus stays within the dialog, and the alert retranslates.

Assert the successful `{name} was deleted.` live status retranslates from its stored `{ kind: "deleted", learnerName }` descriptor. Assert the delete dialog's `role="dialog"` element has `lang={language}`, and keep its language control outside the disabled fieldset and in the trapped Tab order.

- [ ] **Step 2: Add failing profile editor and field-error tests**

Cover load/error placeholders, localized Page navigation, the `Managing {name}` context, page heading, Name/Age/About fields, placeholder, interest questions, lesson recording consent and cleanup, redo setup, Cancel/Save/pending, window-confirm text, Peppa artwork alt, every accessible name/live region, and page/field failures in Chinese.

Preserve `question.promptEn` as English with `lang="en"` when the surrounding Guardian document is Chinese. Preserve existing `question.promptZh` content unchanged, but canonicalize its markup from `lang="zh-CN"` to `lang="zh-Hans"`; do not derive or overwrite questionnaire content from the Guardian catalog.

Exercise both `ProfileEditorAudience` values with a Chinese preference. `guardian` localizes the whole editor. `learner` keeps its ordinary form chrome/errors English and receives only the approved adult privacy helper. The native recording-deletion confirmation follows the same audience rule.

Cover `/guardian/profile/setup` explicitly. On that Guardian route, localize setup headings/instructions/actions, question progress/microphone/status/action chrome, and the acknowledgment Next action. Keep `question.promptEn`, the learner's answer, and acknowledgment learning text in English with `lang="en"`; keep optional `promptZh` as intentional bilingual content. On learner `/profile`, keep the same operational chrome English apart from the narrow saved-answers helper.

Assert every worker validation sentence normalizes to a stable field code, including required, retired question, maximum length, private details, preferred name, integer age, enrichment fallback, and unknown fallback.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test tests/guardian-learner-profiles.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-ui.test.mjs tests/learner-deletion.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

- [ ] **Step 4: Implement semantic roster state and localized rendering**

Replace `error: string` and `statusMessage: string` view props with the unions above. Change the delete callback to `Promise<LearnerRosterErrorCode | null>` so `LearnerDeleteDialog` stores a stable code instead of catching a rendered message; `null` closes the dialog. Normalize deletion API codes exactly once. Preserve authoritative roster reconciliation, abort guards, active learner selection, final-learner protection, deletion-pending recovery, and supplied names.

Add `messages.learners` with headings, statuses, actions, errors, aria labels, Page navigation, Guardian learner context, and named interpolation. Use `BidiLearnerName` for visible names. For computed accessible names, wrap interpolated values with `\u2068` and `\u2069` before passing them to catalog functions.

- [ ] **Step 5: Implement localized profile editing and consent**

Store `LearnerDetailsErrorCode`, never localized output, in `GuardianLearnerDetails`. Add `audience: ProfileEditorAudience` to `ProfileEditorView`; `GuardianLearnerDetails` passes `guardian`, while `LearnerProfileGate` passes `guardian` only for a Guardian route and `learner` otherwise. Resolve field error codes against the catalog selected for that audience during render. Move the native recording-deletion confirmation into a catalog entry selected at click time so the current language/audience is used.

Pass the same explicit audience through `LearnerProfileSetupView`, `LearnerProfileQuestionView`, and `LearnerProfileAcknowledgment`. This prevents Guardian-route localization from leaking into learner onboarding. Update both dynamic `promptZh` renderers to `lang="zh-Hans"`.

Keep the learner answers, learner name, saved description, question text, consent boolean, cleanup status, and route navigation unchanged. Switching language may only change presentation strings and `lang` metadata.

- [ ] **Step 6: Run focused and browser tests and verify GREEN**

```bash
node --test tests/guardian-learner-profiles.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-ui.test.mjs tests/learner-deletion.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
npx playwright test tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-language.spec.ts
```

- [ ] **Step 7: Commit localized learner management**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/zh-Hans.ts src/app/AppHeader.tsx src/learner-profile/learner-profile-api.ts src/learner-profile/GuardianLearnerProfiles.tsx src/learner-profile/LearnerDeleteDialog.tsx src/learner-profile/GuardianLearnerDetails.tsx src/learner-profile/ProfileEditor.tsx src/learner-profile/LearnerProfileGate.tsx src/learner-profile/LearnerProfileQuestion.tsx src/learner-profile/LearnerProfileAcknowledgment.tsx tests/guardian-learner-profiles.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-ui.test.mjs tests/learner-deletion.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-language.spec.ts
git commit -m "feat: localize guardian learner management"
```

---

### Task 6: Localize Guardian story, voice, privacy, AI, and account-deletion settings

**Files:**
- Modify: `src/i18n/messages/en.ts`
- Modify: `src/i18n/messages/zh-Hans.ts`
- Modify: `src/stories/GuardianStorySettings.tsx`
- Modify: `src/stories/PersonalizedStoryArtPanel.tsx`
- Modify: `src/stories/usePersonalizedStoryArt.ts`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: `src/app/AccountPrivacyPage.tsx`
- Modify: `src/app/AboutDialog.tsx`
- Modify: `src/app/AccountDeleteDialog.tsx`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/auth/account-actions.tsx`
- Modify: `tests/guardian-story-settings.test.mjs`
- Modify: `tests/personalized-story-art-ui.test.mjs`
- Modify: `tests/personalized-story-art-hook.test.mjs`
- Modify: `tests/guardian-dubbing-settings.test.mjs`
- Modify: `tests/account-deletion.test.mjs`
- Create: `tests/account-privacy-ui.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `tests/e2e/personalized-story-art.spec.ts`
- Modify: `tests/e2e/dubbing.spec.ts`
- Modify: `tests/e2e/guardian-language.spec.ts`

**Presentation-state contracts:**

```ts
type GuardianStoryErrorCode = "load-failed" | "save-level-failed" | null;
type PersonalizedArtErrorCode =
  | "load-failed"
  | "generate-failed"
  | "delete-failed"
  | null;
type PersonalizedArtStatusCode = "ready" | "removed" | null;
type GuardianDubbingErrorCode = "load-failed" | "change-failed" | null;
type GuardianDubbingPhase =
  | "loading"
  | "available"
  | "cleanup-required";
type BuildInfoState =
  | { phase: "loading" }
  | { phase: "failed" }
  | { info: BuildInfo; phase: "ready" };
type AccountDeleteErrorCode =
  | "account-delete-failed"
  | null;
```

At this task boundary, `deleteAccountSession`, `DeleteAccountAction`, and `AccountDeleteDialog` change together from rendered strings to `AccountDeleteErrorCode`. Every successful status with a story/rhyme/learner name stores the value separately from its message kind.

- [ ] **Step 1: Add failing Guardian story-settings tests**

Assert Chinese route navigation, single `h1`, target chooser, save/live status, level chooser, descriptions, personalization section, private-data guidance, and recovery. Map story-level IDs to Guardian catalog labels/descriptions without changing IDs or `story-catalog.ts`.

Keep story titles such as `The Red Ball` in English and mark them `lang="en"` in a Chinese document. Keep `CEFR` and the level IDs unchanged. Assert a visible save error retranslates without a second save request.

- [ ] **Step 2: Add failing personalized-art and dubbing-settings tests**

For personalized art, cover AI/private label, description, input label, generate/regenerate/delete, pending states, confirmation, ready/removed status, and load/generate/delete failures in Chinese. Keep the supplied learner name and English story title unchanged. Assert browser decode/canvas errors and API messages normalize to codes rather than appearing in UI.

For Guardian dubbing settings, cover route/title/target, consent and private-storage guidance, counts, empty state, loading, the existing delete-all action, pending state, cleanup-required recovery after `DubResetInProgressError`, status announcements, load failure, mutation failure, and retry that preserves a visible operation failure until authoritative refresh succeeds. Do not add per-line deletion. Keep rhyme titles and lyrics in English with `lang="en"` where embedded in Chinese framing. Do not translate learner-facing `DubStudio`, playback controls, or generated audio.

- [ ] **Step 3: Add failing account/privacy/deletion tests**

Cover `账户与隐私`, every AI/data/privacy section heading and paragraph, route/header accessible names, danger-zone copy, delete-account entry, password form, destructive warning, Cancel/Delete/pending, alert, and dialog language control. Assert the dialog has `lang="zh-Hans"`. Assert technical provider/model names, raw build version, commit SHA, deployment ID, and raw timestamp data remain unchanged while labels are Chinese; retain the existing browser `toLocaleString()` display policy for valid timestamps. For an absent/null timestamp, assert the catalogued `Not available` fallback switches to Chinese; preserve a nonempty invalid timestamp verbatim as technical data.

Exercise `BuildInfoState` loading, failed, and ready branches; comparable matching and mismatching commits; uncomparable commits; missing conversation-agent reporting; every technical field label; and the failure message. Assert the web-app card never shows a commit match/mismatch status in either language. Store only phase/data/booleans, so every status retranslates without another request.

Toggle with the account-delete failure visible and assert password input, dialog open state, error identity, and focus are preserved while copy retranslates.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
node --test tests/guardian-story-settings.test.mjs tests/personalized-story-art-ui.test.mjs tests/personalized-story-art-hook.test.mjs tests/guardian-dubbing-settings.test.mjs tests/account-deletion.test.mjs tests/account-privacy-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

- [ ] **Step 5: Implement catalog-driven settings and semantic statuses**

Add complete `storySettings`, `personalizedArt`, `dubbingSettings`, and `accountPrivacy` catalog groups in English and Chinese. Include every visible string, RouteHeader/chooser/summary accessible name, image alt, alert, retry control, and live status. Resolve copy during render. Replace displayed thrown messages with the stable fallbacks above; preserve current retry and recovery mechanics.

Change `usePersonalizedStoryArt` to expose `PersonalizedArtErrorCode` and `PersonalizedArtStatusCode`, keeping operation epoch/abort behavior and metadata intact. In `GuardianDubbingSettings`, retain `cleanupRequired` as the `cleanup-required` phase and replace raw `messageFor` output with the two stable failure codes. In `AccountPrivacySections` (despite the historical `AboutDialog.tsx` filename), store `BuildInfoState` and derive match/mismatch text from booleans during render.

Give `BuildCard` a stable non-display discriminator such as `kind: "web" | "backend" | "agent"` (or an equivalent `showBuildMatch` boolean), and use it—not the translated `title`—to suppress match/mismatch output for the web card. Add a catalog entry for the missing-value fallback used by `displayDate`; return that localized fallback only for null/empty timestamps, while continuing to return nonempty invalid values unchanged.

For destructive confirmations, change the account action/context/dialog return type to `AccountDeleteErrorCode` in the same step. Add `GuardianLanguageControl placement="dialog"` inside `AccountDeleteDialog`'s trapped section, outside the disabled fieldset; keep the existing password/control initial focus. Set `lang={language}` on the `role="dialog"` element. Use localized confirmation text selected at action time for any native confirm still retained. Do not alter API payloads, consent versions, learner target query parameters, private-art metadata, recording keys, or deletion semantics.

- [ ] **Step 6: Run focused and browser tests and verify GREEN**

```bash
node --test tests/guardian-story-settings.test.mjs tests/personalized-story-art-ui.test.mjs tests/personalized-story-art-hook.test.mjs tests/guardian-dubbing-settings.test.mjs tests/account-deletion.test.mjs tests/account-privacy-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
npx playwright test tests/e2e/personalized-story-art.spec.ts tests/e2e/dubbing.spec.ts tests/e2e/guardian-language.spec.ts
```

- [ ] **Step 7: Commit localized Guardian settings and privacy**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/zh-Hans.ts src/stories/GuardianStorySettings.tsx src/stories/PersonalizedStoryArtPanel.tsx src/stories/usePersonalizedStoryArt.ts src/dubbing/GuardianDubbingSettings.tsx src/app/AccountPrivacyPage.tsx src/app/AboutDialog.tsx src/app/AccountDeleteDialog.tsx src/auth/AuthGate.tsx src/auth/account-actions.tsx tests/guardian-story-settings.test.mjs tests/personalized-story-art-ui.test.mjs tests/personalized-story-art-hook.test.mjs tests/guardian-dubbing-settings.test.mjs tests/account-deletion.test.mjs tests/account-privacy-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/e2e/personalized-story-art.spec.ts tests/e2e/dubbing.spec.ts tests/e2e/guardian-language.spec.ts
git commit -m "feat: localize guardian settings and privacy"
```

---

### Task 7: Enforce English immersion and add only the approved learner-side adult helpers

**Files:**
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `src/dubbing/NurseryRhymeList.tsx`
- Modify: `src/dubbing/DubStudio.tsx`
- Modify: `tests/english-ui.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/dub-ui.test.mjs`
- Modify: `tests/product-streamline.test.mjs`
- Modify: `tests/conversation-ui.test.mjs`
- Modify: `tests/e2e/guardian-language.spec.ts`
- Modify: `tests/e2e/conversation-states.spec.ts`
- Modify: `public/manifest.webmanifest`

- [ ] **Step 1: Extend the foundation's no-Han test with the full failing boundary audit**

Keep recursive scanning of shipped runtime source and metadata, with these catalog/content policies:

```js
const hanCatalogFiles = new Set([
  "src/i18n/messages/en.ts",
  "src/i18n/messages/zh-Hans.ts",
]);
```

Assert every other scanned file has no Han literals. Strip the exact `中文` native option value from the English source before asserting that it has no other Han; allow the Chinese catalog to contain the translations. Add explicit curriculum protection for `src/lessons`, `src/stories/story-catalog.ts`, `src/stories/story-script-candidates.ts`, `src/stories/long-stories.ts`, `src/games`, `src/dubbing/generated-rhyme-catalog.ts`, `src/dubbing/rhyme-catalog.ts`, `lib/lesson-data.js`, and all static-audio contracts.

Also scan `content` and the JSON files under `public/assets/nursery-rhymes`. The only additional Han allowance is `content/learner-profile/questionnaire-v1.json` and `questionnaire-v2.json`, and only inside each question's `promptZh` value. Parse those JSON files and assert every Han-bearing leaf path ends in `.promptZh`; all lesson, catalog, media, rhyme, and other questionnaire fields remain Han-free.

Assert the English catalog has no Han except the native visible option label `中文`; assert the Chinese catalog contains Han. Assert the manifest language is `en`.

- [ ] **Step 2: Add failing learner-immersion rendering tests**

Under `GuardianLanguageProvider initialLanguage="zh-Hans"`, render representative learner home, lesson list/player, story shelf/reader, word-game list/player, nursery-rhyme list, DubStudio, learner questionnaire, acknowledgment, and `ConversationSurface`/Talk to Peppa states. Assert ordinary headings, controls, transcript labels, statuses, reconnect/retry paths, errors, and accessible names remain the same English expected by existing tests.

Then assert only these exceptions:

- learner account menu: `Grown-up access` plus `家长入口`;
- selection-required screen: English title/body plus Chinese title/body helpers;
- profile setup privacy sentence: English plus the short saved-answers helper;
- nursery-rhyme recording caution: English plus `录音前请先征得家长同意。`;
- microphone-permission failure: English plus `请让家长开启麦克风权限，然后重试。`;
- Guardian overlay over a learner route: fully localized dialog with `lang="zh-Hans"`.

Assert a Chinese helper is present only when a Guardian must act now, or for the two approved onboarding/recording privacy notices. If the learner can recover, retry, skip, or continue without the Guardian, the status remains English-only. Explicitly cover generic unsupported-browser, lesson audio/microphone help where the lesson continues, lesson completion save failure, story/game retry, dub audio/save/playback/progress, and conversation reconnect failures with no Chinese helper.

- [ ] **Step 3: Add failing end-to-end immersion and history tests**

With Chinese saved, navigate through learner home → lesson → story → word game → nursery rhyme → Talk to Peppa. Use accessible locators to assert English learner controls, live statuses, errors, and target copy. `Grown-up access` retains the current direct mode transition; assert it reaches the Chinese Guardian surface without introducing a new modal. Separately open `LearnerModeSwitchDialog` over a learner-path document, switch its language, close it, and verify focus returns while the underlying document stays `lang="en"` and the dialog is `lang="zh-Hans"`.

During the entire flow, capture the initial path/query/hash contract and use browser back/forward to prove language changes created no history entry. Assert no `lang` query key or locale path segment appears in any generated link.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
node --test tests/english-ui.test.mjs tests/learner-profile-ui.test.mjs tests/dub-ui.test.mjs tests/product-streamline.test.mjs tests/conversation-ui.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/conversation-states.spec.ts
```

- [ ] **Step 5: Implement the narrow helper**

Use the `AdultBoundaryHelper` created in Task 3. It reads the current language and catalog entry, returns `null` for English or an empty message, and otherwise renders the Chinese text with `lang="zh-Hans"`. Components retain their current English copy and place the helper immediately after it. Do not import `useGuardianLanguage` directly into lesson, story-reader, word-game, rhyme-catalog, conversation, or curriculum modules.

In `DubStudio`, distinguish the existing `MicrophoneAccessError` branch from other operational errors. Only that branch renders `recordingPermissionHelper`; all other error text remains English.

- [ ] **Step 6: Correct static metadata**

Change only the manifest's static `"lang"` from `"zh-CN"` to `"en"`. Do not mutate the manifest at runtime or add localized manifest files.

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
node --test tests/english-ui.test.mjs tests/learner-profile-ui.test.mjs tests/dub-ui.test.mjs tests/product-streamline.test.mjs tests/conversation-ui.test.mjs
npx playwright test tests/e2e/guardian-language.spec.ts tests/e2e/conversation-states.spec.ts
```

- [ ] **Step 8: Commit the immersion boundary**

```bash
git add src/learner-profile/LearnerProfileGate.tsx src/dubbing/NurseryRhymeList.tsx src/dubbing/DubStudio.tsx tests/english-ui.test.mjs tests/learner-profile-ui.test.mjs tests/dub-ui.test.mjs tests/product-streamline.test.mjs tests/conversation-ui.test.mjs tests/e2e/guardian-language.spec.ts tests/e2e/conversation-states.spec.ts public/manifest.webmanifest
git commit -m "test: enforce guardian language boundary"
```

---

### Task 8: Verify the complete product boundary and prepare the pull request

**Files:**
- Modify only if verification exposes a scoped defect in files already listed above.

- [ ] **Step 1: Run the complete unit and lifecycle suite**

```bash
npm run test
```

Expected: all Node and lifecycle tests pass, including the new catalog parity and immersion boundary.

- [ ] **Step 2: Run the production build and lint**

```bash
npm run build
npm run lint
```

Expected: typed catalog parity, React hooks, generated assets, and all lint rules pass.

- [ ] **Step 3: Run the complete browser suite**

```bash
npm run test:browser
```

Expected: all responsive, focus, route, account, lesson, story, game, dubbing, and Guardian flows pass.

- [ ] **Step 4: Perform the final literal and URL audit**

```bash
rg -n '\p{Script=Han}' src lib worker content index.html public/manifest.webmanifest public/assets/nursery-rhymes
rg -n 'guardian-language|lang=' src/app src/auth src/i18n src/learner-profile src/stories src/dubbing
git diff --check
git status --short
```

Expected:

- literal Han is confined to `src/i18n/messages/zh-Hans.ts`, the `中文` native option name in the English catalog, and the existing `promptZh` leaves in `content/learner-profile/questionnaire-v1.json` and `questionnaire-v2.json`; the JSON-path test proves those questionnaire files have no Han outside `.promptZh`;
- `parrot:guardian-language` appears only in the language preference module/tests;
- no route builder, `navigate`, `Link`, `URLSearchParams`, or History API call carries language;
- the worktree has no unintended generated or unrelated changes.

- [ ] **Step 5: Review the acceptance matrix manually in the browser**

At minimum inspect `/login`, `/guardian`, `/guardian/learners`, one learner detail, `/guardian/stories`, `/guardian/dubbing`, `/guardian/account`, `/`, `/lessons`, one lesson player, `/stories`, `/word-games`, `/dubs`, and each modal at 280×568 and desktop width. Confirm one route `h1`, no overlap, no horizontal scroll, correct document/dialog `lang`, unchanged names/English course titles, and immediate copy switching.

- [ ] **Step 6: Use the required verification and review skills**

Invoke `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Address findings with focused red-green commits and rerun the affected command plus the full command that covers it.

- [ ] **Step 7: Prepare the pull request without merging it**

Push `codex/guardian-guidance-language` and open a pull request into `main`. The PR description must state:

- Guardian language is local browser state under `parrot:guardian-language`;
- URLs and history are unchanged;
- learner UI/curriculum remain English except for the audited adult boundary;
- full `test`, `build`, `lint`, and `test:browser` results.

Do not merge the feature branch directly into `main`.
