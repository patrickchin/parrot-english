import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  act,
  createElement,
  Fragment,
  useState,
  useSyncExternalStore,
} from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  flush,
  input,
  installDom,
  mountStrict,
  waitFor,
} from "../helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let ApplicationRoutes;
let AuthenticatedApplication;
let AccountActionProvider;
let ConversationSurface;
let LearnerProfileAcknowledgment;
let LearnerProfileGate;
let LearnerProfileProvider;
let useLearnerProfile;
let useLearnerSelection;
let usePeppaConversation;
let createAuthGate;
let createGuardianAccessProvider;
let useGuardianAccess;
let GuardianDashboard;
let GuardianModeBoundary;
let LearnerModeBoundary;
let RouteFocusManager;
let useAccountExperience;
let useClearProfileAccountAction;
let useProfileAccountAction;
let firstLesson;
let firstLessonId;

before(async () => {
  ({ ConversationSurface } = await vite.ssrLoadModule(
    "/src/conversation/ConversationSurface.tsx",
  ));
  ({ createAuthGate } = await vite.ssrLoadModule("/src/auth/AuthGate.tsx"));
  ({
    AccountActionProvider,
    useAccountExperience,
    useClearProfileAccountAction,
    useProfileAccountAction,
  } = await vite.ssrLoadModule("/src/auth/account-actions.tsx"));
  ({ createGuardianAccessProvider, useGuardianAccess } =
    await vite.ssrLoadModule("/src/auth/GuardianAccess.tsx"));
  ({ LearnerProfileAcknowledgment } = await vite.ssrLoadModule(
    "/src/learner-profile/LearnerProfileAcknowledgment.tsx",
  ));
  ({ LearnerProfileGate } = await vite.ssrLoadModule(
    "/src/learner-profile/LearnerProfileGate.tsx",
  ));
  ({ LearnerProfileProvider, useLearnerProfile, useLearnerSelection } =
    await vite
      .ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx")
      .catch(() => ({})));
  ({ usePeppaConversation } = await vite.ssrLoadModule(
    "/src/conversation/usePeppaConversation.ts",
  ));
  ({ ApplicationRoutes, AuthenticatedApplication } =
    await vite.ssrLoadModule("/src/app/App.tsx"));
  ({ RouteFocusManager } = await vite.ssrLoadModule(
    "/src/app/RouteFocusManager.tsx",
  ));
  ({ GuardianModeBoundary, LearnerModeBoundary } = await vite
    .ssrLoadModule("/src/app/ModeRouteBoundaries.tsx")
    .catch(() => ({})));
  ({ GuardianDashboard } = await vite
    .ssrLoadModule("/src/app/GuardianDashboard.tsx")
    .catch(() => ({})));
  const catalog = await vite.ssrLoadModule("/src/lessons/lesson-catalog.ts");
  firstLesson = catalog.LESSONS[0].lesson;
  firstLessonId = catalog.LESSONS[0].id;
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  window.localStorage.clear();
  globalThis.fetch = originalFetch;
  globalThis.Audio = originalAudio;
  globalThis.MediaRecorder = originalMediaRecorder;
  window.Audio = originalAudio;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
  window.history.replaceState(null, "", "/");
});

after(async () => {
  await vite.close();
  restoreDom();
});

function emptyAnswers(responses = {}) {
  return {
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses,
    legacyAnswers: null,
  };
}

function question(overrides = {}) {
  return {
    answerKey: "name",
    position: 1,
    promptEn: "Hi! I'm Peppa. What's your name?",
    promptZh: "你好！我是佩奇。你叫什么名字？",
    required: true,
    maxLength: 120,
    audio: null,
    ...overrides,
  };
}

function fullLearnerProfileState(overrides = {}) {
  const base = {
    mode: "full",
    profile: {
      id: "learner-1",
      name: null,
      age: null,
      storyLevel: "first-words",
      description: null,
      answers: emptyAnswers(),
      questionnaireVersion: 2,
      currentQuestionKey: "name",
      profileStatus: "not_started",
      completedAt: null,
    },
    questionnaire: { version: 2 },
    question: question(),
    progress: { answered: 0, current: 1, total: 1 },
    canBypass: false,
  };

  return { ...base, ...overrides };
}

function completedLearnerProfileState() {
  return fullLearnerProfileState({
    canBypass: true,
    profile: {
      ...fullLearnerProfileState().profile,
      name: "Mia",
      currentQuestionKey: null,
      profileStatus: "completed",
      completedAt: "2026-07-06T08:00:00.000Z",
    },
    question: null,
    progress: { answered: 1, current: 1, total: 1 },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, { status });
}

function guardianAccessBoundary() {
  return createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
    },
    schedule: () => () => {},
  });
}

function conversationStartResponse(id) {
  return json({
    conversation: { id },
    livekit: {
      participantToken: "participant-token",
      url: "wss://livekit.example.test",
    },
    scenario: {
      key: "small-chat",
      maxOptionalExchanges: 3,
      requiredDetails: [],
      summaryMode: "none",
      version: 1,
    },
  });
}

function installConversationFetch(id) {
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/conversations" && init.method === "POST") {
      return conversationStartResponse(id);
    }
    if (path === `/api/conversations/${id}/finish` && init.method === "POST") {
      return json({ conversation: {} });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
}

function abortError() {
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

function button(name) {
  const match = [...document.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent.trim() === name,
  );
  assert.ok(match, `Expected a button named ${name}.`);
  return match;
}

function link(name) {
  const match = [...document.querySelectorAll("a")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent.trim() === name,
  );
  assert.ok(match, `Expected a link named ${name}.`);
  return match;
}

function output(name) {
  const match = document.querySelector(`output[aria-label="${name}"]`);
  assert.ok(match, `Expected an output named ${name}.`);
  return match;
}

function learnerProfileRouteProps(completedLearnerProfileFallback) {
  return {
    completedLearnerProfileFallback,
    isLearnerProfileRoute: true,
    isProfileRoute: false,
    learnerProfileFallback: createElement("p", null, "LEARNER_PROFILE ROUTE"),
    onCloseProfileRoute() {},
    onOpenLessons() {},
    onOpenProfileRoute() {},
  };
}

function ConversationHookHarness({
  createTransport,
  now,
  onBack = () => {},
  onChooseLesson = () => {},
  onCompleted = async () => {},
  purpose = "onboarding",
}) {
  const conversation = usePeppaConversation({
    active: true,
    createTransport,
    now,
    onBack,
    onChooseLesson,
    onCompleted,
    purpose,
  });
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Conversation status" },
      conversation.status,
    ),
    createElement(
      "output",
      { "aria-label": "Learner turn ready" },
      String(conversation.turnReady),
    ),
    createElement(
      "output",
      { "aria-label": "Microphone busy" },
      String(conversation.microphoneBusy),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback blocked" },
      String(conversation.audioPlaybackBlocked),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback busy" },
      String(conversation.audioPlaybackBusy),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback error" },
      conversation.audioPlaybackError,
    ),
    createElement(
      "output",
      { "aria-label": "Peppa response latency" },
      conversation.responseLatencyMs ?? "",
    ),
    createElement(
      "output",
      { "aria-label": "Live transcript" },
      conversation.liveTranscript ?? "",
    ),
    createElement(
      "output",
      { "aria-label": "Wait cycle" },
      String(conversation.waitCycle),
    ),
    createElement(
      "output",
      { "aria-label": "Conversation error" },
      conversation.error,
    ),
    createElement(
      "output",
      { "aria-label": "Conversation recovery phase" },
      conversation.recoveryPhase ?? "",
    ),
    createElement(
      "output",
      { "aria-label": "Voice retry used" },
      String(conversation.voiceRetryUsed),
    ),
    createElement(
      "button",
      { onClick: conversation.onStart, type: "button" },
      "Start voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onRetryVoice, type: "button" },
      "Retry voice",
    ),
    createElement(
      "button",
      {
        disabled: conversation.audioPlaybackBusy,
        onClick: conversation.onStartAudio,
        type: "button",
      },
      "Start sound",
    ),
    createElement(
      "button",
      { onClick: conversation.onToggleMicrophone, type: "button" },
      conversation.microphoneEnabled ? "End my turn" : "Start my turn",
    ),
    createElement(
      "button",
      { onClick: conversation.onRepeatAudio, type: "button" },
      "Repeat voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onFinish, type: "button" },
      "Finish voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onBack, type: "button" },
      "Back voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onChooseLesson, type: "button" },
      "Choose lesson",
    ),
  );
}

function RemountingConversationHookHarness({ createTransport }) {
  const [generation, setGeneration] = useState(0);
  return createElement(
    "section",
    null,
    createElement(
      "button",
      {
        onClick: () => setGeneration((current) => current + 1),
        type: "button",
      },
      "Remount voice",
    ),
    createElement(ConversationHookHarness, {
      createTransport,
      key: generation,
      purpose: "small-chat",
    }),
  );
}

function conversationSurfaceProps(overrides = {}) {
  return {
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: false,
    onBack() {},
    onChooseLesson() {},
    onFinish() {},
    onRepeatAudio() {},
    onRetryVoice() {},
    onStart() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    recoveryPhase: null,
    responseLatencyMs: null,
    status: "listening",
    turnReady: true,
    turns: [],
    voiceRetryUsed: false,
    waitCycle: 0,
    ...overrides,
  };
}

function ProfileRouteHarness({
  children,
  initialRoute = "/guardian",
  showOpenProfileAction = false,
}) {
  const [route, setRoute] = useState(initialRoute);
  const isProfileRoute = route === "/guardian/profile";

  return createElement(
    Fragment,
    null,
    showOpenProfileAction && !isProfileRoute
      ? createElement(
          "button",
          {
            onClick: () => setRoute("/guardian/profile"),
            type: "button",
          },
          "Open learner details",
        )
      : null,
    createElement(
      LearnerProfileGate,
      {
        completedLearnerProfileFallback: children,
        guardianRoute: route.startsWith("/guardian"),
        isLearnerProfileRoute: false,
        isProfileRoute,
        learnerProfileFallback: createElement(
          "p",
          null,
          "LEARNER_PROFILE ROUTE",
        ),
        onCloseProfileRoute: () => setRoute("/guardian"),
        onOpenLessons() {},
        onOpenProfileRoute: () => setRoute("/guardian/profile"),
      },
      children,
    ),
  );
}

function LoadedProfileHarness() {
  assert.equal(
    typeof useLearnerProfile,
    "function",
    "Expected protected descendants to read the loaded learner profile",
  );
  const { profile } = useLearnerProfile();
  return createElement(
    "output",
    { "aria-label": "Loaded profile story level" },
    profile.storyLevel,
  );
}

function LoadedProfileIdentityHarness() {
  const { profile } = useLearnerProfile();
  return createElement(
    "output",
    { "aria-label": "Loaded profile identity" },
    `${profile.id}:${profile.name}`,
  );
}

function SelectionContextHarness() {
  assert.equal(
    typeof useLearnerSelection,
    "function",
    "Expected learner selection to be available without a loaded profile",
  );
  const { activeProfileId } = useLearnerSelection();
  return createElement(
    "output",
    { "aria-label": "Active learner selection" },
    activeProfileId ?? "none",
  );
}

function SelectionReloadHarness() {
  assert.equal(
    typeof useLearnerSelection,
    "function",
    "Expected learner selection reloads to be available to the roster manager",
  );
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const reload = (id) => {
    void reloadSelectedLearner(id).catch(() => {});
  };
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Reloaded learner selection" },
      activeProfileId ?? "none",
    ),
    createElement(
      "button",
      {
        onClick: () => {
          reload("learner-a");
          reload("learner-b");
        },
        type: "button",
      },
      "Reload learners A then B",
    ),
  );
}

function SelectionActionHarness({
  action = "select",
  label,
  newLearnerName = "Ava",
  profileId = "learner-noah",
  showDraft = false,
}) {
  const [localDraft, setLocalDraft] = useState("");
  const { activeProfileId, createAndSelectLearner, selectLearner } =
    useLearnerSelection();
  const mutateLearner =
    action === "create"
      ? () => createAndSelectLearner(newLearnerName, ["learner-mia"])
      : () => selectLearner(profileId);
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": `${label} active learner` },
      activeProfileId ?? "none",
    ),
    createElement(
      "button",
      {
        onClick: () => void mutateLearner().catch(() => {}),
        type: "button",
      },
      label,
    ),
    showDraft
      ? createElement("input", {
          "aria-label": `${label} draft`,
          onChange: (event) => setLocalDraft(event.currentTarget.value),
          value: localDraft,
        })
      : null,
  );
}

function LearnerSelectionSessionHarness({
  action = "select",
  label,
  newLearnerName = "Ava",
  profileId = "learner-noah",
  sessionIdentity,
  showDraft = false,
}) {
  return createElement(
    AccountActionProvider,
    {
      profileAction: null,
      sessionIdentity,
      setProfileAction() {},
    },
    createElement(
      LearnerProfileGate,
      {
        completedLearnerProfileFallback: createElement("p", null, "HOME"),
        guardianRoute: true,
        isConversationRoute: false,
        isLearnerProfileRoute: false,
        isProfileRoute: false,
        learnerManagerRoute: true,
        learnerProfileFallback: createElement("p", null, "SETUP"),
        onCloseProfileRoute() {},
        onConversationCompleted() {},
        onOpenLessons() {},
        onOpenProfileRoute() {},
        onRedoCompleted() {},
        onRedoLearnerProfileRoute() {},
        redoLearnerProfile: false,
      },
      createElement(SelectionActionHarness, {
        action,
        label,
        newLearnerName,
        profileId,
        showDraft,
      }),
    ),
  );
}

function UnmountingLearnerSelectionSessionsHarness({
  action,
  sourceLabel,
  targetName,
  targetProfileId,
}) {
  const [sourceMounted, setSourceMounted] = useState(true);
  return createElement(
    Fragment,
    null,
    sourceMounted
      ? createElement(LearnerSelectionSessionHarness, {
          action,
          key: "source",
          label: sourceLabel,
          newLearnerName: targetName,
          profileId: targetProfileId,
          sessionIdentity: "user-1|session-a",
        })
      : null,
    createElement(LearnerSelectionSessionHarness, {
      key: "sibling",
      label: `${sourceLabel} sibling`,
      sessionIdentity: "user-1|session-a",
    }),
    createElement(LearnerSelectionSessionHarness, {
      key: "different-session",
      label: `${sourceLabel} different session`,
      sessionIdentity: "user-1|session-b",
    }),
    createElement(
      "button",
      {
        onClick: () => setSourceMounted(false),
        type: "button",
      },
      `Unmount ${sourceLabel}`,
    ),
  );
}

function installSharedBroadcastChannels() {
  const channels = new Map();
  let messagesPosted = 0;
  class SharedBroadcastChannel {
    static names() {
      return [...channels.keys()];
    }

    static peerCount() {
      return [...channels.values()].reduce(
        (total, peers) => total + peers.size,
        0,
      );
    }

    static messagesPosted() {
      return messagesPosted;
    }

    static deliverToPeer(index, data) {
      const peer = [...channels.values()].flatMap((peers) => [...peers])[index];
      if (!peer) return false;
      peer.onmessage?.({ data });
      return true;
    }

    constructor(name) {
      this.name = name;
      this.onmessage = null;
      const peers = channels.get(name) ?? new Set();
      peers.add(this);
      channels.set(name, peers);
    }

    close() {
      const peers = channels.get(this.name);
      peers?.delete(this);
      if (peers?.size === 0) channels.delete(this.name);
    }

    postMessage(data) {
      messagesPosted += 1;
      for (const peer of channels.get(this.name) ?? []) {
        if (peer === this) continue;
        void Promise.resolve().then(() => peer.onmessage?.({ data }));
      }
    }
  }
  return SharedBroadcastChannel;
}

function HeldSelectionReloadHarness() {
  assert.equal(
    typeof useLearnerSelection,
    "function",
    "Expected learner selection reloads to be available to the roster manager",
  );
  const { reloadSelectedLearner } = useLearnerSelection();
  return createElement(
    "button",
    {
      onClick: () => {
        void reloadSelectedLearner("learner-b").catch(() => {});
      },
      type: "button",
    },
    "Reload learner B",
  );
}

function ExpectedSelectionReloadHarness({ onLeaveManager }) {
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const [error, setError] = useState("");
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Expected reload active learner" },
      activeProfileId ?? "none",
    ),
    createElement("output", { "aria-label": "Expected reload error" }, error),
    createElement(
      "button",
      {
        onClick: () => {
          void reloadSelectedLearner("learner-b").catch((caughtError) => {
            setError(caughtError.message);
          });
        },
        type: "button",
      },
      "Reload expected learner B",
    ),
    createElement(
      "button",
      { onClick: onLeaveManager, type: "button" },
      "Leave learner manager",
    ),
  );
}

function ExpectedSelectionGateHarness() {
  const [learnerManagerRoute, setLearnerManagerRoute] = useState(true);
  return createElement(
    LearnerProfileGate,
    {
      completedLearnerProfileFallback: createElement("p", null, "HOME"),
      guardianRoute: true,
      guardianSelectionFallback: createElement(
        "p",
        null,
        "SELECTION REQUIRED FALLBACK",
      ),
      isConversationRoute: false,
      isLearnerProfileRoute: false,
      isProfileRoute: false,
      learnerManagerRoute,
      learnerProfileFallback: createElement("p", null, "SETUP"),
      onCloseProfileRoute() {},
      onConversationCompleted() {},
      onOpenLessons() {},
      onOpenProfileRoute() {},
      onRedoCompleted() {},
      onRedoLearnerProfileRoute() {},
      redoLearnerProfile: false,
    },
    createElement(ExpectedSelectionReloadHarness, {
      onLeaveManager: () => setLearnerManagerRoute(false),
    }),
  );
}

function InvalidSelectionReloadHarness() {
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const [error, setError] = useState("");
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Invalid selection active learner" },
      activeProfileId ?? "none",
    ),
    createElement("output", { "aria-label": "Invalid selection error" }, error),
    createElement(
      "button",
      {
        onClick: () =>
          void reloadSelectedLearner("").catch((caughtError) =>
            setError(caughtError.message),
          ),
        type: "button",
      },
      "Reload an empty learner ID",
    ),
  );
}

function StandaloneConversationRouteHarness() {
  const [route, setRoute] = useState("/talk-to-peppa");
  const isConversationRoute = route === "/talk-to-peppa";

  return createElement(
    LearnerProfileGate,
    {
      completedLearnerProfileFallback: createElement("p", null, "MAIN MENU"),
      isConversationRoute,
      isLearnerProfileRoute: false,
      isProfileRoute: false,
      learnerProfileFallback: createElement("p", null, "LEARNER PROFILE ROUTE"),
      onCloseProfileRoute() {},
      onConversationCompleted: () => setRoute("/"),
      onOpenLessons: () => setRoute("/lessons"),
      onOpenProfileRoute() {},
      onRedoCompleted() {},
      onRedoLearnerProfileRoute() {},
      redoLearnerProfile: false,
    },
    isConversationRoute
      ? createElement("p", null, "VOICE CHAT UNAVAILABLE")
      : createElement(
          "main",
          null,
          createElement("p", null, "MAIN MENU"),
          createElement(
            "button",
            { onClick: () => setRoute("/talk-to-peppa"), type: "button" },
            "Talk to Peppa",
          ),
        ),
  );
}

function RouterHistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();

  return createElement(
    "aside",
    { "aria-label": "Router test controls" },
    createElement(
      "output",
      {
        "aria-label": "Current route",
        "data-location-key": location.key,
      },
      `${location.pathname}${location.search}${location.hash}`,
    ),
    createElement(
      "button",
      { onClick: () => navigate(-1), type: "button" },
      "History back",
    ),
    createElement(
      "button",
      { onClick: () => navigate(lessonScenePath(2)), type: "button" },
      "Open scene 2",
    ),
    createElement(
      "button",
      {
        onClick: () =>
          navigate("/guardian/profile/setup?redo=1&returnTo=%2Fguardian"),
        type: "button",
      },
      "Open guardian redo",
    ),
  );
}

function applicationRoutesInMemory({ initialEntries, initialIndex }) {
  return createElement(
    MemoryRouter,
    { initialEntries, initialIndex },
    createElement(
      "div",
      null,
      createElement(
        LearnerProfileProvider,
        {
          profile: completedLearnerProfileState().profile,
          replaceProfile() {},
        },
        createElement(ApplicationRoutes, { loginTarget: "/" }),
      ),
      createElement(RouterHistoryControls),
    ),
  );
}

function modeRoutesInMemory({
  api,
  initialEntry,
  learnerName = "Mia",
  now,
  onBeforeNavigate = () => {},
  schedule = () => () => {},
}) {
  assert.equal(
    typeof GuardianModeBoundary,
    "function",
    "Expected a mounted guardian route boundary",
  );
  assert.equal(
    typeof LearnerModeBoundary,
    "function",
    "Expected a mounted learner route boundary",
  );
  assert.equal(
    typeof GuardianDashboard,
    "function",
    "Expected a mounted guardian dashboard",
  );
  const Provider = createGuardianAccessProvider({ api, now, schedule });

  return createElement(
    Provider,
    { sessionIdentity: "user-1" },
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          element: createElement(
            "main",
            null,
            createElement("h1", null, "Learner home"),
          ),
          path: "/",
        }),
        createElement(
          Route,
          {
            element: createElement(GuardianModeBoundary, {
              onBeforeNavigate,
            }),
          },
          createElement(Route, {
            element: createElement(
              "main",
              null,
              createElement("h1", null, "Learner profile"),
              createElement("p", null, "Save changes"),
              createElement("p", null, "Redo setup questions"),
            ),
            path: "/profile",
          }),
          createElement(Route, {
            element: createElement(
              Fragment,
              null,
              createElement(RouteFocusManager),
              createElement(GuardianDashboard, {
                learnerName,
                onBeforeNavigate,
              }),
            ),
            path: "/guardian",
          }),
        ),
        createElement(
          Route,
          {
            element: createElement(LearnerModeBoundary, {
              onBeforeNavigate,
            }),
          },
          createElement(Route, {
            element: createElement(
              "main",
              null,
              createElement("h1", null, "Pick a lesson"),
            ),
            path: "/lessons",
          }),
        ),
      ),
      createElement(RouterHistoryControls),
    ),
  );
}

function authenticatedApplicationInMemory({ api, initialEntry }) {
  const Provider = createGuardianAccessProvider({
    api,
    schedule: () => () => {},
  });

  return createElement(
    AccountActionProvider,
    {
      profileAction: registeredLearnerExperience,
      setProfileAction() {},
    },
    createElement(
      Provider,
      { sessionIdentity: "user-1" },
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(AuthenticatedApplication, {
          onExitLessonRoute() {},
        }),
        createElement(RouterHistoryControls),
      ),
    ),
  );
}

const registeredLearnerExperience = {
  error: "",
  learnerName: "Mia",
  onOpenProfile() {},
};

function RegisteredLearnerNameHarness() {
  const [experience, setExperience] = useState(null);

  function RegisterLearner() {
    useProfileAccountAction(registeredLearnerExperience);
    return null;
  }

  function ReadLearner() {
    const accountExperience = useAccountExperience();
    return createElement(
      "output",
      { "aria-label": "Registered learner name" },
      accountExperience?.learnerName ?? "Learner",
    );
  }

  return createElement(
    AccountActionProvider,
    { profileAction: experience, setProfileAction: setExperience },
    createElement(RegisterLearner),
    createElement(ReadLearner),
  );
}

function LearnerGateAccountExperienceHarness() {
  const [experience, setExperience] = useState(null);

  function ReadExperience() {
    const accountExperience = useAccountExperience();
    return createElement(
      "output",
      {
        "aria-label": "Gate account experience",
        "data-has-active-learner": String(
          accountExperience?.hasActiveLearner ?? false,
        ),
      },
      accountExperience?.learnerName ?? "Learner",
    );
  }

  return createElement(
    AccountActionProvider,
    { profileAction: experience, setProfileAction: setExperience },
    createElement(
      LearnerProfileGate,
      {
        completedLearnerProfileFallback: createElement("p", null, "HOME"),
        guardianDashboardRoute: true,
        guardianRoute: true,
        isConversationRoute: false,
        isLearnerProfileRoute: false,
        isProfileRoute: false,
        learnerProfileFallback: createElement("p", null, "SETUP"),
        onCloseProfileRoute() {},
        onConversationCompleted() {},
        onOpenLessons() {},
        onOpenProfileRoute() {},
      },
      createElement("p", null, "GUARDIAN DASHBOARD"),
    ),
    createElement(ReadExperience),
  );
}

function currentRoute() {
  const route = document.querySelector('output[aria-label="Current route"]');
  assert.ok(route, "Expected the router controls to expose the current route.");
  return {
    key: route.getAttribute("data-location-key"),
    path: route.textContent,
  };
}

function lessonScenePath(sceneNumber) {
  return `/lessons/parrot/${encodeURIComponent(firstLessonId)}/scenes/${sceneNumber}`;
}

function installControlledAudio() {
  class ControlledAudio {
    static instances = [];

    constructor(source) {
      this.source = source;
      this.onended = null;
      this.onerror = null;
      this.paused = false;
      ControlledAudio.instances.push(this);
    }

    pause() {
      this.paused = true;
    }

    play() {
      return Promise.resolve();
    }

    finish() {
      this.onended?.(new window.Event("ended"));
    }

    fail() {
      this.onerror?.(new window.Event("error"));
    }
  }

  globalThis.Audio = ControlledAudio;
  window.Audio = ControlledAudio;
  return ControlledAudio;
}

async function finishLessonArtworkLoading() {
  const artwork = document.querySelector('[aria-label="Lesson artwork"] img');
  assert.ok(artwork, "Expected the mounted lesson artwork image.");
  Object.defineProperties(artwork, {
    complete: { configurable: true, value: true },
    decode: { configurable: true, value: () => Promise.resolve() },
    naturalHeight: { configurable: true, value: 9 },
    naturalWidth: { configurable: true, value: 16 },
  });

  await act(async () => {
    artwork.dispatchEvent(new window.Event("load"));
    await artwork.decode();
  });
  await waitFor(() =>
    assert.equal(
      document.querySelector('[aria-label="Lesson artwork"] [role="status"]'),
      null,
    ),
  );
}

async function advanceToJoinInBeat(ControlledAudio) {
  await finishLessonArtworkLoading();
  await click(button("Let's go"));
  for (let index = 0; index < 2; index += 1) {
    await waitFor(() =>
      assert.equal(ControlledAudio.instances.length, index + 1),
    );
    await act(async () => ControlledAudio.instances[index].finish());
  }
  await waitFor(() => {
    text(/Join in/);
    assert.equal(
      document.querySelector('[aria-label="Speaking controls"]'),
      null,
    );
    assert.equal(
      document.querySelector('[aria-label="Speaking feedback"]'),
      null,
    );
  });
}

function text(value) {
  assert.match(document.body.textContent, value);
}

function noText(value) {
  assert.doesNotMatch(document.body.textContent, value);
}

function createSessionClient(initialState) {
  function withTestSession(nextState) {
    if (!nextState.data || nextState.data.session) return nextState;
    const userKey =
      nextState.data.user.id ?? nextState.data.user.email.toLowerCase();
    return {
      ...nextState,
      data: {
        session: { id: `test-session:${userKey}` },
        ...nextState.data,
      },
    };
  }

  let state = withTestSession(initialState);
  const listeners = new Set();
  const retry = deferred();
  const signInCalls = [];

  function publish(nextState) {
    state = withTestSession(nextState);
    for (const listener of listeners) listener();
  }

  const client = {
    publish,
    retry,
    signInCalls,
    signIn: {
      async email(fields) {
        signInCalls.push(fields);
        publish({
          data: { user: { email: fields.email, name: "Mia" } },
          error: null,
          isPending: false,
        });
        return { error: null };
      },
    },
    async signOut() {
      publish({ data: null, error: null, isPending: false });
      return { error: null };
    },
    signUp: {
      async email(fields) {
        publish({
          data: { user: { email: fields.email, name: fields.name } },
          error: null,
          isPending: false,
        });
        return { error: null };
      },
    },
    useSession() {
      const snapshot = useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state,
        () => state,
      );
      return {
        ...snapshot,
        async refetch() {
          if (!snapshot.error) return;
          await retry.promise;
          publish({ data: null, error: null, isPending: false });
        },
      };
    },
  };

  return client;
}

describe("mounted React lifecycle boundaries", { concurrency: false }, () => {
  it("redirects an authenticated login alias before learner-profile loading", async () => {
    const learnerProfile = deferred();
    const learnerProfileRequestRoutes = [];
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        learnerProfileRequestRoutes.push(currentRoute().path);
        return learnerProfile.promise.then(() =>
          json(completedLearnerProfileState()),
        );
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry:
          "/login?returnTo=%2Fguardian%2Fstories%3Fsection%3Dart%23cover",
      }),
    );

    await waitFor(() =>
      assert.equal(currentRoute().path, "/guardian/stories?section=art#cover"),
    );
    await waitFor(() => assert.ok(learnerProfileRequestRoutes.length > 0));
    assert.equal(
      learnerProfileRequestRoutes.some((route) => route.startsWith("/login")),
      false,
      "The login alias must redirect before learner-profile requests begin.",
    );
    learnerProfile.resolve();
    await waitFor(() => text(/Story settings/));
  });

  it("returns unknown Guardian URLs to the Guardian dashboard", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "learner" };
      },
    };

    for (const [initialEntry, expectedRoute] of [
      ["/guardianish", "/guardian"],
      ["/guardian/lessons/extra", "/guardian"],
      ["/unknown", "/guardian"],
    ]) {
      await mountStrict(
        authenticatedApplicationInMemory({ api, initialEntry }),
      );
      await waitFor(() => assert.equal(currentRoute().path, expectedRoute));
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("returns unknown learner URLs home while preserving locked Guardian routes", async () => {
    const api = {
      async loadGuardianAccess() {
        return { mode: "learner" };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "learner" };
      },
    };

    for (const [initialEntry, expectedRoute] of [
      ["/guardianish", "/"],
      ["/guardian/lessons/extra", "/guardian"],
      ["/unknown", "/"],
    ]) {
      await mountStrict(
        authenticatedApplicationInMemory({ api, initialEntry }),
      );
      await waitFor(() => assert.equal(currentRoute().path, expectedRoute));
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("waits for the live Guardian mode before redirecting an unknown URL", async () => {
    const access = deferred();
    const api = {
      async loadGuardianAccess() {
        return access.promise;
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "learner" };
      },
    };

    await mountStrict(
      authenticatedApplicationInMemory({ api, initialEntry: "/unknown" }),
    );
    assert.equal(currentRoute().path, "/unknown");

    access.resolve({
      expiresAt: "2099-01-01T00:00:00.000Z",
      mode: "guardian",
    });
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
  });

  it("returns explicit learner details Back, Cancel, and Save to Manage learners", async () => {
    const profile = {
      profile: {
        ...completedLearnerProfileState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [question()],
    };
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };

    for (const action of ["Back", "Cancel", "Save changes"]) {
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          return json(completedLearnerProfileState());
        }
        if (
          path === "/api/profile?learnerProfileId=learner-1" &&
          init.method === "GET"
        ) {
          return json(profile);
        }
        if (
          path === "/api/profile?learnerProfileId=learner-1" &&
          init.method === "PUT"
        ) {
          return json(profile);
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(
        authenticatedApplicationInMemory({
          api,
          initialEntry: "/guardian/learners/learner-1",
        }),
      );
      await waitFor(() => button(action));
      await click(button(action));
      await waitFor(() =>
        assert.equal(currentRoute().path, "/guardian/learners"),
      );
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("returns an explicit learner-details load failure to Manage learners", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (
        path === "/api/profile?learnerProfileId=learner-1" &&
        init.method === "GET"
      ) {
        return json({ message: "Profile service is unavailable." }, 503);
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: "learner-1", profiles: [] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/learners/learner-1",
      }),
    );

    await waitFor(() => text(/Learner details are taking a break/));
    await click(link("Back to Manage learners"));
    await waitFor(() =>
      assert.equal(currentRoute().path, "/guardian/learners"),
    );
    await waitFor(() => text(/Manage learners/));
  });

  it("runs Guardian form-mode redo through profile questions and returns safely on completion", async () => {
    const firstQuestion = question({
      answerKey: "favoriteAnimals",
      promptEn: "What animals do you like?",
    });
    const secondQuestion = question({
      answerKey: "favoriteCartoons",
      position: 2,
      promptEn: "What cartoons do you like?",
    });
    const profile = {
      profile: {
        ...completedLearnerProfileState().profile,
        answers: emptyAnswers(),
      },
      questions: [firstQuestion, secondQuestion],
    };
    const savedAnswers = [];
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET")
        return json(profile);
      if (path === "/api/profile" && init.method === "PUT") {
        savedAnswers.push(JSON.parse(init.body));
        return json(profile);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/What animals do you like/));
    noText(/Skip for now|Skip question/);
    await input(
      document.querySelector("#learner-profile-answer-favoriteAnimals"),
      "I like dinosaurs",
    );
    await click(button("Save"));
    await waitFor(() => text(/What cartoons do you like/));
    await input(
      document.querySelector("#learner-profile-answer-favoriteCartoons"),
      "I like Bluey",
    );
    await click(button("Save"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
    assert.deepEqual(savedAnswers, [
      { questionKey: "favoriteAnimals", rawAnswer: "I like dinosaurs" },
      { questionKey: "favoriteCartoons", rawAnswer: "I like Bluey" },
    ]);
  });

  it("focuses and describes the answer after Guardian form-redo validation fails", async () => {
    const firstQuestion = question({
      answerKey: "age",
      promptEn: "How old are you?",
    });
    const profile = {
      profile: completedLearnerProfileState().profile,
      questions: [firstQuestion],
    };
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET")
        return json(profile);
      if (path === "/api/profile" && init.method === "PUT") {
        return json(
          {
            error: "invalid_answer",
            fieldError: "Please tell me your age using a whole number.",
          },
          400,
        );
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    const answer = await waitFor(() => {
      const match = document.querySelector("#learner-profile-answer-age");
      assert.ok(match);
      return match;
    });
    await input(answer, "very old");
    await click(button("Save"));
    await waitFor(() => {
      const alert = document.querySelector('[role="alert"]');
      assert.ok(alert);
      assert.equal(answer.getAttribute("aria-invalid"), "true");
      assert.equal(answer.getAttribute("aria-describedby"), alert.id);
      assert.equal(document.activeElement, answer);
    });

    await input(answer, "8");
    assert.equal(answer.getAttribute("aria-invalid"), null);
    assert.equal(answer.getAttribute("aria-describedby"), null);
  });

  it("aborts a held Guardian form-redo save before Back and fences its late result", async () => {
    const firstQuestion = question({
      answerKey: "favoriteAnimals",
      promptEn: "What animals do you like?",
    });
    const profile = {
      profile: {
        ...completedLearnerProfileState().profile,
        answers: emptyAnswers(),
      },
      questions: [firstQuestion],
    };
    const save = deferred();
    let saveSignal;
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET")
        return json(profile);
      if (path === "/api/profile" && init.method === "PUT") {
        saveSignal = init.signal;
        return save.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/What animals do you like/));
    await input(
      document.querySelector("#learner-profile-answer-favoriteAnimals"),
      "I like dinosaurs",
    );
    await click(button("Save"));
    await waitFor(() => assert.ok(saveSignal));
    await click(button("Back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
    assert.equal(saveSignal.aborted, true);

    await act(async () => {
      save.resolve(json(profile));
      await flush();
    });
    assert.equal(currentRoute().path, "/guardian");
    noText(/What animals do you like/);
  });

  it("aborts Guardian form-redo replay when Back closes the profile questions", async () => {
    const ControlledAudio = installControlledAudio();
    const firstQuestion = question({
      answerKey: "favoriteAnimals",
      audio: {
        id: "favorite-animals",
        src: "/assets/audio/favorite-animals.mp3",
        text: "What animals do you like?",
      },
      promptEn: "What animals do you like?",
    });
    const profile = {
      profile: {
        ...completedLearnerProfileState().profile,
        answers: emptyAnswers(),
      },
      questions: [firstQuestion],
    };
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET")
        return json(profile);
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/What animals do you like/));
    await click(button("Replay question"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));
    const playback = ControlledAudio.instances[0];
    const staleCompletion = playback.onended;
    await click(button("Back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
    assert.equal(playback.paused, true);

    await act(async () => {
      staleCompletion?.(new window.Event("ended"));
      await flush();
    });
    assert.equal(currentRoute().path, "/guardian");
    noText(/What animals do you like/);
  });

  it("keeps Guardian form-mode redo recovery to Retry and Back without learner skips", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json({ message: "Profile questions are unavailable." }, 503);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/Profile is taking a break/));
    button("Retry");
    noText(/Skip for now|Skip question/);
    await click(button("Back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
  });

  it("rejects a Guardian form-redo profile response for a different learner", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "form",
        });
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json({
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-other",
          },
          questions: [question()],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/Profile is taking a break/));
    text(/selected learner profile could not be loaded/i);
    noText(/Hi! I'm Peppa/);
    button("Retry");
    button("Back");
  });

  it("keeps an initial Guardian form-redo load failure to Retry and Back without learner skips", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({ message: "Learner questions are unavailable." }, 503);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/Questions are taking a break/));
    button("Retry");
    noText(/Skip for now|Skip question/);
    await click(button("Back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
  });

  it("does not let an inactive redo Back suppress cleanup after profile re-entry", async () => {
    const heldProfile = deferred();
    let learnerLoads = 0;
    let heldProfileSignal;
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        learnerLoads += 1;
        return learnerLoads <= 2
          ? json({ message: "Learner questions are unavailable." }, 503)
          : json({
              ...completedLearnerProfileState(),
              experienceMode: "form",
            });
      }
      if (path === "/api/profile" && init.method === "GET") {
        heldProfileSignal = init.signal;
        return heldProfile.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian",
      }),
    );

    await waitFor(() => text(/Questions are taking a break/));
    await click(button("Back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
    await click(button("Open guardian redo"));
    await waitFor(() => text(/Questions are taking a break/));
    await click(button("Retry"));
    await waitFor(() => assert.ok(heldProfileSignal));

    await click(button("History back"));
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
    assert.equal(heldProfileSignal.aborted, true);
    heldProfile.resolve(
      json({
        profile: completedLearnerProfileState().profile,
        questions: [question()],
      }),
    );
    await flush();
  });

  it("returns a non-profile Guardian load error to the usable dashboard", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({ message: "Learner questions are unavailable." }, 503);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/stories",
      }),
    );

    await waitFor(() => text(/Questions are taking a break/));
    noText(/Skip for now|Skip question/);
    await click(button("Back"));
    await waitFor(() => {
      assert.equal(currentRoute().path, "/guardian");
      text(/Guardian dashboard/);
    });
  });

  it("exposes the registered learner name to guardian routes", async () => {
    assert.equal(
      typeof useAccountExperience,
      "function",
      "Expected guardian routes to consume the registered account experience",
    );
    await mountStrict(createElement(RegisteredLearnerNameHarness));
    await waitFor(() =>
      assert.equal(output("Registered learner name").textContent, "Mia"),
    );
  });

  it("registers the actual name for an incomplete active learner", async () => {
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      return json(
        fullLearnerProfileState({
          profile: {
            ...fullLearnerProfileState().profile,
            id: "learner-ava",
            name: "Ava",
          },
        }),
      );
    };

    await mountStrict(createElement(LearnerGateAccountExperienceHarness));
    await waitFor(() => {
      const experience = output("Gate account experience");
      assert.equal(experience.textContent, "Ava");
      assert.equal(experience.getAttribute("data-has-active-learner"), "true");
      text(/GUARDIAN DASHBOARD/);
    });
  });

  it("redirects bypass-only Guardian pages to learner selection without rendering profile consumers", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({ mode: "bypass-only", canBypass: true });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: null, profiles: [] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/stories",
      }),
    );
    await waitFor(() => {
      assert.equal(currentRoute().path, "/guardian/learners");
      text(/Manage learners/);
    });
    noText(/Story settings/);
  });

  it("locked guardian routes render only the unlock screen", async () => {
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return { mode: "learner" };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
        },
        initialEntry: "/profile",
      }),
    );

    await waitFor(() => text(/Unlock guardian mode/));
    noText(/Save changes|Redo setup questions/);
    assert.equal(currentRoute().path, "/profile");
  });

  it("guardian mode does not render learner activities", async () => {
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
        },
        initialEntry: "/lessons",
      }),
    );

    await waitFor(() => text(/Switch to learner mode/));
    noText(/Pick a lesson/);
    const dashboard = link("Back to Guardian dashboard");
    assert.equal(dashboard.getAttribute("href"), "/guardian");
    await click(dashboard);
    await waitFor(() => assert.equal(currentRoute().path, "/guardian"));
  });

  it("shows a neutral access check without flashing protected children", async () => {
    const access = deferred();
    await mountStrict(
      modeRoutesInMemory({
        api: {
          loadGuardianAccess() {
            return access.promise;
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "learner" };
          },
        },
        initialEntry: "/profile",
      }),
    );

    text(/Checking guardian access…/);
    noText(/Save changes|Redo setup questions|Unlock guardian mode/);
  });

  it("resumes a locked guardian deep link at the same URL and cancels home", async () => {
    const api = {
      async loadGuardianAccess() {
        return { mode: "learner" };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        assert.equal(password, "correct-password");
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
    };
    await mountStrict(modeRoutesInMemory({ api, initialEntry: "/profile" }));
    await waitFor(() => text(/Unlock guardian mode/));
    await input(
      document.querySelector('input[name="password"]'),
      "correct-password",
    );
    await click(button("Unlock guardian mode"));
    await waitFor(() => text(/Save changes/));
    assert.equal(currentRoute().path, "/profile");

    await cleanupMountedRoots();
    document.body.replaceChildren();
    await mountStrict(modeRoutesInMemory({ api, initialEntry: "/profile" }));
    await waitFor(() => text(/Unlock guardian mode/));
    await click(button("Cancel"));
    await waitFor(() => assert.equal(currentRoute().path, "/"));
  });

  it("replaces expired guardian content with the same-URL unlock screen", async () => {
    let expire = () => assert.fail("Expected guardian expiry to be scheduled.");
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2026-08-25T08:15:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "learner" };
          },
        },
        initialEntry: "/profile",
        now: () => Date.parse("2026-08-25T08:00:00.000Z"),
        schedule(callback) {
          expire = callback;
          return () => {};
        },
      }),
    );
    await waitFor(() => text(/Save changes/));
    await act(async () => expire());
    await waitFor(() => text(/Unlock guardian mode/));
    noText(/Save changes|Redo setup questions/);
    assert.equal(currentRoute().path, "/profile");
  });

  it("focuses the guardian dashboard heading after access resolves", async () => {
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "learner" };
          },
        },
        initialEntry: "/guardian",
      }),
    );

    await waitFor(() => text(/Guardian dashboard/));
    await waitFor(() =>
      assert.equal(document.activeElement, document.querySelector("main h1")),
    );
  });

  it("awaits lock and exits lesson work before mode navigation", async () => {
    const lock = deferred();
    const exitRoutes = [];
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          lockGuardianAccess() {
            return lock.promise;
          },
          async unlockGuardianAccess() {
            return { mode: "learner" };
          },
        },
        initialEntry: "/lessons",
        onBeforeNavigate() {
          exitRoutes.push(currentRoute().path);
        },
      }),
    );
    await waitFor(() => text(/Switch to learner mode/));
    await click(button("Switch to learner mode"));
    assert.equal(currentRoute().path, "/lessons");
    assert.deepEqual(exitRoutes, []);

    lock.resolve({ mode: "learner" });
    await waitFor(() => assert.equal(currentRoute().path, "/"));
    assert.deepEqual(exitRoutes, ["/lessons"]);
  });

  it("dashboard awaits lock and exits route work before switching profiles", async () => {
    const lock = deferred();
    const exitRoutes = [];
    await mountStrict(
      modeRoutesInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          lockGuardianAccess() {
            return lock.promise;
          },
          async unlockGuardianAccess() {
            return { mode: "learner" };
          },
        },
        initialEntry: "/guardian",
        onBeforeNavigate() {
          exitRoutes.push(currentRoute().path);
        },
      }),
    );
    await waitFor(() => text(/Guardian dashboard/));
    await click(button("Switch to learner"));
    assert.equal(currentRoute().path, "/guardian");
    assert.deepEqual(exitRoutes, []);

    lock.resolve({ mode: "learner" });
    await waitFor(() => assert.equal(currentRoute().path, "/"));
    assert.deepEqual(exitRoutes, ["/guardian"]);
  });

  it("keeps loading visible until the StrictMode onboarding request resolves", async () => {
    const response = deferred();
    let requests = 0;
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      requests += 1;
      if (requests === 1) {
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(abortError()), {
            once: true,
          });
        });
      }
      return response.promise;
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "LESSON CATALOG")),
        createElement("p", null, "LESSON CATALOG"),
      ),
    );

    await waitFor(() => assert.equal(requests, 2));
    text(/Loading your questions…/);
    noText(/Answer 1 question/);

    response.resolve(json(fullLearnerProfileState()));
    await waitFor(() => text(/Answer 1 question/));
    noText(/Loading your questions…/);
  });

  it("provides the already-loaded learner profile to protected descendants without another request", async () => {
    let profileRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      profileRequests += 1;
      return json({
        ...completedLearnerProfileState(),
        profile: {
          ...completedLearnerProfileState().profile,
          storyLevel: "tiny-stories",
        },
      });
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(LoadedProfileHarness),
      ),
    );

    await waitFor(() =>
      assert.equal(
        output("Loaded profile story level").textContent,
        "tiny-stories",
      ),
    );
    assert.equal(
      profileRequests,
      2,
      "StrictMode performs only the gate load cycle",
    );
  });

  it("revalidates the authoritative learner once when a mounted tab regains focus", async () => {
    const revalidation = deferred();
    let selectedProfileId = "learner-mia";
    let profileRequests = 0;
    const stateForSelection = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      profileRequests += 1;
      return selectedProfileId === "learner-noah"
        ? revalidation.promise
        : json(stateForSelection());
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(LoadedProfileIdentityHarness),
      ),
    );

    await waitFor(() =>
      assert.equal(
        output("Loaded profile identity").textContent,
        "learner-mia:Mia",
      ),
    );
    const originalProfileNode = output("Loaded profile identity");
    const initialProfileRequests = profileRequests;
    selectedProfileId = "learner-noah";
    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
      window.dispatchEvent(new window.Event("focus"));
    });

    await waitFor(() =>
      assert.equal(profileRequests, initialProfileRequests + 1),
    );
    assert.strictEqual(
      output("Loaded profile identity"),
      originalProfileNode,
      "The routed learner stays mounted until the server identifies a change.",
    );

    revalidation.resolve(json(stateForSelection()));
    await waitFor(() =>
      assert.equal(
        output("Loaded profile identity").textContent,
        "learner-noah:Noah",
      ),
    );
    assert.notStrictEqual(
      output("Loaded profile identity"),
      originalProfileNode,
      "A changed learner identity remounts the learner-scoped subtree.",
    );
  });

  it("rejects a held learner snapshot after a silent pending generation completes", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    const staleRead = deferred();
    const authoritativeRead = deferred();
    let holdRevalidation = false;
    let heldRequests = 0;
    let profileRequests = 0;
    const learnerState = (id, name) => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id,
        name,
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path !== "/api/learner-profile" || init.method !== "GET") {
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      }
      profileRequests += 1;
      if (!holdRevalidation) return json(learnerState("learner-mia", "Mia"));
      heldRequests += 1;
      return heldRequests === 1 ? staleRead.promise : authoritativeRead.promise;
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Silent generation receiver",
          sessionIdentity: "user-1|shared-session",
        }),
      );
      await waitFor(() => {
        button("Silent generation receiver");
        assert.equal(profileRequests, 2);
        assert.equal(SharedBroadcastChannel.peerCount(), 1);
      });
      const initialProfileRequests = profileRequests;
      const scope = SharedBroadcastChannel.names()[0];
      assert.ok(scope);
      holdRevalidation = true;

      await act(async () => window.dispatchEvent(new window.Event("focus")));
      await waitFor(() => assert.equal(heldRequests, 1));

      const peerPendingKey = `${scope}:pending:silent-peer-operation`;
      window.localStorage.setItem(peerPendingKey, "pending");
      window.localStorage.setItem(`${scope}:state`, "silent-cara-change");
      window.localStorage.removeItem(peerPendingKey);
      staleRead.resolve(json(learnerState("learner-mia", "Mia")));
      await flush();

      assert.ok(
        output("Silent generation receiver active learner").closest("[hidden]"),
        "The stale Mia snapshot must remain fenced after a silent ABA cycle.",
      );
      await waitFor(() => assert.equal(heldRequests, 2));
      authoritativeRead.resolve(json(learnerState("learner-cara", "Cara")));
      await waitFor(() =>
        assert.equal(
          output("Silent generation receiver active learner").textContent,
          "learner-cara",
        ),
      );
      assert.equal(profileRequests, initialProfileRequests + 2);
      assert.equal(
        output("Silent generation receiver active learner").closest("[hidden]"),
        null,
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("preserves routed learner drafts across same-learner focus and visibility checks", async () => {
    const revalidation = deferred();
    let holdRevalidation = false;
    let profileRequests = 0;
    let routeMounts = 0;
    const learnerState = {
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: "learner-mia",
        name: "Mia",
      },
    };
    function RoutedLearnerDraft() {
      const { profile } = useLearnerProfile();
      const [draftValue, setDraftValue] = useState("");
      const [mount] = useState(() => {
        routeMounts += 1;
        return routeMounts;
      });
      return createElement(
        "section",
        null,
        createElement("textarea", {
          "aria-label": "Lesson topic draft",
          "data-learner-id": profile.id,
          "data-mount": String(mount),
          onChange: (event) => setDraftValue(event.currentTarget.value),
          value: draftValue,
        }),
      );
    }
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      profileRequests += 1;
      return holdRevalidation ? revalidation.promise : json(learnerState);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(RoutedLearnerDraft),
      ),
    );
    const topic = await waitFor(() => {
      const candidate = document.querySelector(
        'textarea[aria-label="Lesson topic draft"]',
      );
      assert.ok(candidate);
      return candidate;
    });
    await input(topic, "Unsaved garden lesson");
    const originalMount = topic.dataset.mount;
    const initialProfileRequests = profileRequests;
    holdRevalidation = true;

    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await waitFor(() =>
      assert.equal(profileRequests, initialProfileRequests + 1),
    );
    text(/Checking the current learner/);
    assert.equal(
      document.querySelector('textarea[aria-label="Lesson topic draft"]')
        ?.value,
      "Unsaved garden lesson",
    );

    revalidation.resolve(json(learnerState));
    await waitFor(() => {
      const current = document.querySelector(
        'textarea[aria-label="Lesson topic draft"]',
      );
      assert.equal(current?.value, "Unsaved garden lesson");
      assert.equal(current?.dataset.mount, originalMount);
    });
    assert.equal(profileRequests, initialProfileRequests + 1);
  });

  it("preserves unsaved Guardian profile fields when visibility confirms the same learner", async () => {
    const revalidation = deferred();
    let holdRevalidation = false;
    let learnerProfileRequests = 0;
    let profileEditorRequests = 0;
    const learnerState = {
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: "learner-mia",
        name: "Mia",
      },
    };
    const profileState = {
      profile: {
        ...learnerState.profile,
        age: 8,
        description: "Mia likes dinosaurs.",
        lessonRecordingCleanupPending: false,
        lessonRecordingConsent: false,
      },
      questions: [question()],
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        learnerProfileRequests += 1;
        return holdRevalidation ? revalidation.promise : json(learnerState);
      }
      if (path === "/api/profile" && init.method === "GET") {
        profileEditorRequests += 1;
        return json(profileState);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        ProfileRouteHarness,
        { initialRoute: "/guardian/profile" },
        createElement("p", null, "PROFILE LESSONS"),
      ),
    );
    await waitFor(() => text(/Managing Mia/));
    await input(document.querySelector("#profile-name"), "Unsaved Mia name");
    const initialLearnerProfileRequests = learnerProfileRequests;
    const initialProfileEditorRequests = profileEditorRequests;
    holdRevalidation = true;

    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await waitFor(() =>
      assert.equal(learnerProfileRequests, initialLearnerProfileRequests + 1),
    );
    assert.equal(
      document.querySelector("#profile-name")?.value,
      "Unsaved Mia name",
    );

    revalidation.resolve(json(learnerState));
    await flush();
    assert.equal(
      document.querySelector("#profile-name")?.value,
      "Unsaved Mia name",
    );
    assert.equal(profileEditorRequests, initialProfileEditorRequests);
  });

  it("blocks stale Guardian profile writes after learner revalidation fails and switches safely on retry", async () => {
    const failedRevalidation = deferred();
    let selectedProfileId = "learner-mia";
    let failNextLearnerProfileLoad = false;
    let profileWrites = 0;
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        age: selectedProfileId === "learner-noah" ? 10 : 8,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    const profileState = () => ({
      profile: {
        ...learnerState().profile,
        description:
          selectedProfileId === "learner-noah"
            ? "Noah likes space."
            : "Mia likes dinosaurs.",
        lessonRecordingCleanupPending: false,
        lessonRecordingConsent: false,
      },
      questions: [question()],
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        if (failNextLearnerProfileLoad) {
          failNextLearnerProfileLoad = false;
          return failedRevalidation.promise;
        }
        return json(learnerState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(profileState());
      }
      if (path === "/api/profile" && init.method === "PUT") {
        profileWrites += 1;
        return json(profileState());
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        ProfileRouteHarness,
        { initialRoute: "/guardian/profile" },
        createElement("p", null, "PROFILE LESSONS"),
      ),
    );
    await waitFor(() => text(/Managing Mia/));
    await input(document.querySelector("#profile-name"), "Stale Mia name");

    selectedProfileId = "learner-noah";
    failNextLearnerProfileLoad = true;
    await act(async () => window.dispatchEvent(new window.Event("focus")));
    await waitFor(() => text(/Checking the current learner/i));

    await click(button("Save changes"));
    assert.equal(
      profileWrites,
      0,
      "A programmatic submit must be fenced while identity is uncertain.",
    );

    failedRevalidation.resolve(
      json({ message: "The learner could not be checked." }, 503),
    );
    await waitFor(() => text(/couldn't verify the current learner/i));

    await click(button("Save changes"));
    assert.equal(
      profileWrites,
      0,
      "A programmatic stale submit must be fenced before it reaches the server.",
    );

    await click(button("Try again"));
    await waitFor(() => text(/Managing Noah/));
    assert.equal(document.querySelector("#profile-name")?.value, "Noah");
    assert.equal(profileWrites, 0);
  });

  it("aborts an in-flight learner mutation before a focus revalidation replaces its learner", async () => {
    const heldAnswer = deferred();
    let answerSignal = null;
    let selectedProfileId = "learner-mia";
    const stateForSelection = () => ({
      ...fullLearnerProfileState(),
      profile: {
        ...fullLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(stateForSelection());
      }
      if (path === "/api/learner-profile/answer" && init.method === "PUT") {
        answerSignal = init.signal;
        return heldAnswer.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "HOME")),
        createElement("p", null, "HOME"),
      ),
    );
    await waitFor(() => button("Start questions"));
    await click(button("Start questions"));
    await input(document.querySelector("#learner-profile-answer-name"), "Mia");
    await click(button("Next"));
    await waitFor(() => assert.ok(answerSignal));
    assert.equal(answerSignal.aborted, false);

    selectedProfileId = "learner-noah";
    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
    });

    await waitFor(() => assert.equal(answerSignal.aborted, true));
    await waitFor(() => button("Start questions"));
    await click(button("Start questions"));
    assert.equal(
      document.querySelector("#learner-profile-answer-name").value,
      "Noah",
    );
  });

  it("aborts and clears a Guardian profile save before reloading another learner", async () => {
    const heldSave = deferred();
    let saveSignal = null;
    let selectedProfileId = "learner-mia";
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    const profileState = () => ({
      profile: {
        ...learnerState().profile,
        age: selectedProfileId === "learner-noah" ? 10 : 8,
        description:
          selectedProfileId === "learner-noah"
            ? "Noah likes rockets."
            : "Mia likes dinosaurs.",
        lessonRecordingCleanupPending: false,
        lessonRecordingConsent: false,
      },
      questions: [question()],
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(profileState());
      }
      if (path === "/api/profile" && init.method === "PUT") {
        saveSignal = init.signal;
        return heldSave.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        ProfileRouteHarness,
        { initialRoute: "/guardian/profile" },
        createElement("p", null, "PROFILE LESSONS"),
      ),
    );
    await waitFor(() => text(/Managing Mia/));
    await input(document.querySelector("#profile-description"), "Unsaved Mia");
    await click(button("Save changes"));
    await waitFor(() => assert.ok(saveSignal));
    assert.equal(saveSignal.aborted, false);

    selectedProfileId = "learner-noah";
    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
    });

    await waitFor(() => assert.equal(saveSignal.aborted, true));
    await waitFor(() => text(/Managing Noah/));
    assert.equal(document.querySelector("#profile-name").value, "Noah");
    assert.equal(
      document.querySelector("#profile-description").value,
      "Noah likes rockets.",
    );
    noText(/Unsaved Mia/);
  });

  it("delivers a committed learner switch after its exact-session digest finishes", async () => {
    const originalCrypto = globalThis.crypto;
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const sourceDigest = deferred();
    const siblingDigest = deferred();
    let activeDigest = sourceDigest;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () => "queued-learner-change",
        subtle: { digest: () => activeDigest.promise },
      },
      writable: true,
    });
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let mutationRequests = 0;
    let selectedProfileId = "learner-mia";
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        mutationRequests += 1;
        selectedProfileId = "learner-noah";
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            {
              age: 8,
              createdAt: "2026-08-01T08:00:00.000Z",
              id: "learner-mia",
              name: "Mia",
              profileStatus: "completed",
            },
            {
              age: 10,
              createdAt: "2026-08-02T08:00:00.000Z",
              id: "learner-noah",
              name: "Noah",
              profileStatus: "completed",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Select before learner scope",
          sessionIdentity: "user-1|shared-session",
        }),
      );
      activeDigest = siblingDigest;
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Digest-delayed sibling",
          sessionIdentity: "user-1|shared-session",
        }),
      );
      await waitFor(() => button("Select before learner scope"));
      assert.equal(SharedBroadcastChannel.peerCount(), 0);

      sourceDigest.resolve(new Uint8Array(32).buffer);
      await waitFor(() => assert.equal(SharedBroadcastChannel.peerCount(), 1));
      await click(button("Select before learner scope"));
      await waitFor(() =>
        assert.equal(
          output("Select before learner scope active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(
        output("Digest-delayed sibling active learner").textContent,
        "learner-mia",
      );
      assert.equal(mutationRequests, 1);
      await waitFor(() => assert.equal(window.localStorage.length, 1));
      assert.equal(
        output("Digest-delayed sibling active learner").textContent,
        "learner-mia",
        "BroadcastChannel does not buffer the source's already-posted protocol events.",
      );

      siblingDigest.resolve(new Uint8Array(32).buffer);
      await waitFor(() =>
        assert.equal(
          output("Digest-delayed sibling active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(SharedBroadcastChannel.messagesPosted(), 3);
      assert.equal(SharedBroadcastChannel.peerCount(), 2);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
        writable: true,
      });
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("uses an opaque storage signal when BroadcastChannel construction fails", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    class ThrowingBroadcastChannel {
      constructor() {
        throw new Error("BroadcastChannel is unavailable.");
      }
    }
    globalThis.BroadcastChannel = ThrowingBroadcastChannel;
    window.BroadcastChannel = ThrowingBroadcastChannel;
    let selectedProfileId = "learner-mia";
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-noah";
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            {
              age: 8,
              createdAt: "2026-08-01T08:00:00.000Z",
              id: "learner-mia",
              name: "Mia",
              profileStatus: "completed",
            },
            {
              age: 10,
              createdAt: "2026-08-02T08:00:00.000Z",
              id: "learner-noah",
              name: "Noah",
              profileStatus: "completed",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Storage source tab",
            sessionIdentity: "user-1|session-a",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Storage sibling tab",
            sessionIdentity: "user-1|session-a",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Storage different session",
            sessionIdentity: "user-1|session-b",
          }),
        ),
      );
      await waitFor(() => button("Storage source tab"));

      await click(button("Storage source tab"));
      await waitFor(() => assert.equal(window.localStorage.length, 1));
      const storageKey = window.localStorage.key(0);
      assert.ok(storageKey);
      assert.equal(/user-1|session-a|session-b/.test(storageKey), false);
      const marker = window.localStorage.getItem(storageKey);
      assert.ok(marker);
      const storageEvent = new window.Event("storage");
      Object.defineProperties(storageEvent, {
        key: { value: storageKey },
        newValue: { value: marker },
      });
      await act(async () => window.dispatchEvent(storageEvent));

      await waitFor(() =>
        assert.equal(
          output("Storage sibling tab active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(
        output("Storage different session active learner").textContent,
        "learner-mia",
      );
    } finally {
      if (originalGlobalBroadcastChannel === undefined) {
        Reflect.deleteProperty(globalThis, "BroadcastChannel");
      } else {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      }
      if (originalWindowBroadcastChannel === undefined) {
        Reflect.deleteProperty(window, "BroadcastChannel");
      } else {
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    }
  });

  for (const mutation of [
    {
      action: "select",
      label: "Select before source unmount",
      method: "PUT",
      path: "/api/learner-profiles/learner-noah/active",
      targetName: "Noah",
      targetProfileId: "learner-noah",
    },
    {
      action: "create",
      label: "Create before source unmount",
      method: "POST",
      path: "/api/learner-profiles",
      targetName: "Ava",
      targetProfileId: "learner-ava",
    },
  ]) {
    it(`keeps ${mutation.action} transport alive after source unmount and settles its exact session`, async () => {
      const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
      const originalWindowBroadcastChannel = window.BroadcastChannel;
      const SharedBroadcastChannel = installSharedBroadcastChannels();
      globalThis.BroadcastChannel = SharedBroadcastChannel;
      window.BroadcastChannel = SharedBroadcastChannel;
      const heldMutation = deferred();
      let mutationInit = null;
      let pendingAtDispatch = null;
      let selectedProfileId = "learner-mia";
      const learnerState = () => ({
        ...completedLearnerProfileState(),
        profile: {
          ...completedLearnerProfileState().profile,
          id: selectedProfileId,
          name:
            selectedProfileId === mutation.targetProfileId
              ? mutation.targetName
              : "Mia",
        },
      });
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          return json(learnerState());
        }
        if (path === mutation.path && init.method === mutation.method) {
          pendingAtDispatch = [...Array(window.localStorage.length).keys()]
            .map((index) => window.localStorage.key(index))
            .find((key) => key?.includes(":pending:"));
          mutationInit = init;
          return heldMutation.promise;
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      try {
        await mountStrict(
          createElement(UnmountingLearnerSelectionSessionsHarness, {
            action: mutation.action,
            sourceLabel: mutation.label,
            targetName: mutation.targetName,
            targetProfileId: mutation.targetProfileId,
          }),
        );
        await waitFor(() => button(mutation.label));

        await click(button(mutation.label));
        await waitFor(() => {
          assert.ok(mutationInit);
          assert.equal(mutationInit.signal, undefined);
          assert.ok(pendingAtDispatch);
          assert.equal(
            /user-1|session-a|session-b/.test(pendingAtDispatch),
            false,
          );
          assert.equal(selectedProfileId, "learner-mia");
        });
        const pendingKey = [...Array(window.localStorage.length).keys()]
          .map((index) => window.localStorage.key(index))
          .find((key) => key?.includes(":pending:"));
        assert.ok(pendingKey);
        await waitFor(() =>
          assert.ok(
            output(`${mutation.label} sibling active learner`).closest(
              "[hidden]",
            ),
          ),
        );
        await click(button(`Unmount ${mutation.label}`));
        assert.equal(mutationInit.signal, undefined);

        selectedProfileId = mutation.targetProfileId;
        heldMutation.resolve(
          json({
            activeProfileId: mutation.targetProfileId,
            profiles: [
              {
                age: 8,
                createdAt: "2026-08-01T08:00:00.000Z",
                id: "learner-mia",
                name: "Mia",
                profileStatus: "completed",
              },
              {
                age: mutation.action === "select" ? 10 : null,
                createdAt: "2026-08-02T08:00:00.000Z",
                id: mutation.targetProfileId,
                name: mutation.targetName,
                profileStatus: "completed",
              },
            ],
          }),
        );
        await waitFor(() =>
          assert.equal(window.localStorage.getItem(pendingKey), null),
        );
        const stateKey = [...Array(window.localStorage.length).keys()]
          .map((index) => window.localStorage.key(index))
          .find((key) => key?.endsWith(":state"));
        assert.ok(stateKey);
        const changedEvent = new window.Event("storage");
        Object.defineProperties(changedEvent, {
          key: { value: stateKey },
          newValue: { value: window.localStorage.getItem(stateKey) },
        });
        const settledEvent = new window.Event("storage");
        Object.defineProperties(settledEvent, {
          key: { value: pendingKey },
          newValue: { value: null },
        });
        await act(async () => {
          window.dispatchEvent(changedEvent);
          window.dispatchEvent(settledEvent);
        });

        await waitFor(() =>
          assert.equal(
            output(`${mutation.label} sibling active learner`).textContent,
            mutation.targetProfileId,
          ),
        );
        assert.equal(
          output(`${mutation.label} different session active learner`)
            .textContent,
          "learner-mia",
        );
      } finally {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    });
  }

  it("keeps an initial sibling fail-closed until a persisted pending switch settles", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    class ThrowingBroadcastChannel {
      constructor() {
        throw new Error("BroadcastChannel is unavailable.");
      }
    }
    globalThis.BroadcastChannel = ThrowingBroadcastChannel;
    window.BroadcastChannel = ThrowingBroadcastChannel;
    const heldMutation = deferred();
    let mutationInit = null;
    let selectedProfileId = "learner-mia";
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        mutationInit = init;
        return heldMutation.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    function InitialLoadOverlapHarness() {
      const [siblingMounted, setSiblingMounted] = useState(false);
      return createElement(
        Fragment,
        null,
        createElement(LearnerSelectionSessionHarness, {
          label: "Select before initial sibling",
          sessionIdentity: "user-1|shared-session",
        }),
        siblingMounted
          ? createElement(LearnerSelectionSessionHarness, {
              label: "Initially loading sibling",
              sessionIdentity: "user-1|shared-session",
            })
          : null,
        createElement(
          "button",
          { onClick: () => setSiblingMounted(true), type: "button" },
          "Mount initial sibling",
        ),
      );
    }

    try {
      await mountStrict(createElement(InitialLoadOverlapHarness));
      await waitFor(() => button("Select before initial sibling"));
      await click(button("Select before initial sibling"));
      await waitFor(() => {
        assert.ok(mutationInit);
        assert.equal(mutationInit.signal, undefined);
      });
      const pendingKey = [...Array(window.localStorage.length).keys()]
        .map((index) => window.localStorage.key(index))
        .find((key) => key?.includes(":pending:"));
      assert.ok(pendingKey);

      await click(button("Mount initial sibling"));
      await waitFor(() => {
        assert.ok(
          output("Initially loading sibling active learner").closest(
            "[hidden]",
          ),
        );
        text(/couldn't verify the current learner/i);
      });
      selectedProfileId = "learner-noah";
      heldMutation.resolve(
        json({
          activeProfileId: "learner-noah",
          profiles: [
            {
              age: 8,
              createdAt: "2026-08-01T08:00:00.000Z",
              id: "learner-mia",
              name: "Mia",
              profileStatus: "completed",
            },
            {
              age: 10,
              createdAt: "2026-08-02T08:00:00.000Z",
              id: "learner-noah",
              name: "Noah",
              profileStatus: "completed",
            },
          ],
        }),
      );
      await waitFor(() =>
        assert.equal(window.localStorage.getItem(pendingKey), null),
      );
      const stateKey = [...Array(window.localStorage.length).keys()]
        .map((index) => window.localStorage.key(index))
        .find((key) => key?.endsWith(":state"));
      assert.ok(stateKey);
      const changedEvent = new window.Event("storage");
      Object.defineProperties(changedEvent, {
        key: { value: stateKey },
        newValue: { value: window.localStorage.getItem(stateKey) },
      });
      const settledEvent = new window.Event("storage");
      Object.defineProperties(settledEvent, {
        key: { value: pendingKey },
        newValue: { value: null },
      });
      await act(async () => {
        window.dispatchEvent(changedEvent);
        window.dispatchEvent(settledEvent);
      });
      await waitFor(() =>
        assert.equal(
          output("Initially loading sibling active learner").textContent,
          "learner-noah",
        ),
      );
      noText(/couldn't verify the current learner/i);
      assert.equal(
        output("Initially loading sibling active learner").closest("[hidden]"),
        null,
      );
    } finally {
      if (originalGlobalBroadcastChannel === undefined) {
        Reflect.deleteProperty(globalThis, "BroadcastChannel");
      } else {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      }
      if (originalWindowBroadcastChannel === undefined) {
        Reflect.deleteProperty(window, "BroadcastChannel");
      } else {
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    }
  });

  it("keeps concurrent pending operations blocked until each exact token settles", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    let channelName = null;
    class CapturingThrowingBroadcastChannel {
      constructor(name) {
        channelName = name;
        throw new Error("BroadcastChannel is unavailable.");
      }
    }
    globalThis.BroadcastChannel = CapturingThrowingBroadcastChannel;
    window.BroadcastChannel = CapturingThrowingBroadcastChannel;
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json(learnerState());
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Concurrent marker receiver",
          sessionIdentity: "user-1|shared-session",
        }),
      );
      await waitFor(() => {
        button("Concurrent marker receiver");
        assert.ok(channelName);
      });
      const initialProfileRequests = profileRequests;
      const dispatchPending = async (storageKey, newValue) => {
        const event = new window.Event("storage");
        Object.defineProperties(event, {
          key: { value: storageKey },
          newValue: { value: newValue },
        });
        await act(async () => window.dispatchEvent(event));
      };
      const settlePair = async ({ first, second, targetProfileId }) => {
        const firstKey = `${channelName}:pending:${first}`;
        const secondKey = `${channelName}:pending:${second}`;
        window.localStorage.setItem(firstKey, "pending");
        window.localStorage.setItem(secondKey, "pending");
        await dispatchPending(firstKey, "pending");
        await dispatchPending(secondKey, "pending");
        assert.ok(
          output("Concurrent marker receiver active learner").closest(
            "[hidden]",
          ),
        );

        window.localStorage.removeItem(firstKey);
        await dispatchPending(firstKey, null);
        await flush();
        assert.equal(window.localStorage.getItem(secondKey), "pending");
        assert.equal(profileRequests, initialProfileRequests);
        assert.ok(
          output("Concurrent marker receiver active learner").closest(
            "[hidden]",
          ),
        );

        selectedProfileId = targetProfileId;
        window.localStorage.removeItem(secondKey);
        await dispatchPending(secondKey, null);
        await waitFor(() =>
          assert.equal(
            output("Concurrent marker receiver active learner").textContent,
            targetProfileId,
          ),
        );
      };

      await settlePair({
        first: "operation-a",
        second: "operation-b",
        targetProfileId: "learner-noah",
      });
      assert.equal(profileRequests, initialProfileRequests + 1);

      const reverseStart = profileRequests;
      const firstKey = `${channelName}:pending:operation-c`;
      const secondKey = `${channelName}:pending:operation-d`;
      window.localStorage.setItem(firstKey, "pending");
      window.localStorage.setItem(secondKey, "pending");
      await dispatchPending(firstKey, "pending");
      await dispatchPending(secondKey, "pending");
      window.localStorage.removeItem(secondKey);
      await dispatchPending(secondKey, null);
      assert.equal(profileRequests, reverseStart);
      assert.equal(window.localStorage.getItem(firstKey), "pending");
      selectedProfileId = "learner-mia";
      window.localStorage.removeItem(firstKey);
      await dispatchPending(firstKey, null);
      await waitFor(() =>
        assert.equal(
          output("Concurrent marker receiver active learner").textContent,
          "learner-mia",
        ),
      );
      assert.equal(profileRequests, reverseStart + 1);

      const ambiguousStart = profileRequests;
      const ambiguousKey = `${channelName}:pending:ambiguous-operation`;
      const successfulKey = `${channelName}:pending:successful-operation`;
      window.localStorage.setItem(ambiguousKey, "uncertain");
      window.localStorage.setItem(successfulKey, "pending");
      await dispatchPending(ambiguousKey, "uncertain");
      await dispatchPending(successfulKey, "pending");
      const stateKey = `${channelName}:state`;
      window.localStorage.setItem(stateKey, "successful-change");
      await dispatchPending(stateKey, "successful-change");
      window.localStorage.removeItem(successfulKey);
      await dispatchPending(successfulKey, null);
      await flush();
      text(/couldn't verify the current learner/i);
      assert.equal(profileRequests, ambiguousStart);
      assert.equal(window.localStorage.getItem(ambiguousKey), "uncertain");
      assert.ok(
        output("Concurrent marker receiver active learner").closest("[hidden]"),
      );
      await click(button("Try again"));
      await flush();
      assert.equal(profileRequests, ambiguousStart);
    } finally {
      if (originalGlobalBroadcastChannel === undefined) {
        Reflect.deleteProperty(globalThis, "BroadcastChannel");
      } else {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      }
      if (originalWindowBroadcastChannel === undefined) {
        Reflect.deleteProperty(window, "BroadcastChannel");
      } else {
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    }
  });

  it("signals a learner switch only to mounted tabs with the same authenticated session", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-noah";
        return json({
          activeProfileId: selectedProfileId,
          profiles: rosterProfiles,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Select from source tab",
            sessionIdentity: "user-1|session-a",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Same-session sibling tab",
            sessionIdentity: "user-1|session-a",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Different-session tab",
            sessionIdentity: "user-1|session-b",
          }),
        ),
      );
      await waitFor(() => {
        button("Select from source tab");
        button("Same-session sibling tab");
        button("Different-session tab");
        assert.equal(profileRequests, 6);
        assert.equal(SharedBroadcastChannel.names().length, 2);
      });
      assert.equal(
        SharedBroadcastChannel.names().some((name) =>
          /user-1|session-a|session-b/.test(name),
        ),
        false,
        "Browser channel names must not expose account or session identifiers.",
      );
      const initialProfileRequests = profileRequests;

      await click(button("Select from source tab"));
      await waitFor(() =>
        assert.equal(profileRequests, initialProfileRequests + 2),
      );
      await flush();
      assert.equal(
        profileRequests,
        initialProfileRequests + 2,
        "The source and same-session sibling reload; the other session does not.",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("invalidates same-session tabs when a committed learner switch response is malformed", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-noah";
        return json({ activeProfileId: selectedProfileId, profiles: null });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Switch with a malformed response",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Switch response sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Switch with a malformed response");
        assert.equal(profileRequests, 4);
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });
      const initialProfileRequests = profileRequests;

      await click(button("Switch with a malformed response"));
      await waitFor(() =>
        assert.equal(
          output("Switch with a malformed response active learner").textContent,
          "learner-noah",
        ),
      );
      await waitFor(() =>
        assert.equal(
          output("Switch response sibling active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(profileRequests, initialProfileRequests + 2);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("keeps same-session tabs fail-closed when a learner response is lost", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-ava" ? "Ava" : "Mia",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        selectedProfileId = "learner-ava";
        throw new TypeError("The response was lost.");
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            action: "create",
            label: "Create with a lost response",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Create response sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Create with a lost response");
        assert.equal(profileRequests, 4);
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });
      const initialProfileRequests = profileRequests;

      await click(button("Create with a lost response"));
      await waitFor(() => text(/couldn't verify the current learner/i));
      assert.ok(
        output("Create with a lost response active learner").closest(
          "[hidden]",
        ),
      );
      assert.ok(
        output("Create response sibling active learner").closest("[hidden]"),
      );
      assert.equal(profileRequests, initialProfileRequests);
      const pendingKey = [...Array(window.localStorage.length).keys()]
        .map((index) => window.localStorage.key(index))
        .find((key) => key?.includes(":pending:"));
      assert.ok(pendingKey);
      assert.equal(window.localStorage.getItem(pendingKey), "uncertain");
      await click(button("Try again"));
      await flush();
      assert.equal(profileRequests, initialProfileRequests);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("emits one pending/change/settled protocol for a committed switch", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let failNextProfileRequest = false;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        if (failNextProfileRequest) {
          failNextProfileRequest = false;
          return json({ error: "Temporary profile failure." }, 503);
        }
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-noah";
        failNextProfileRequest = true;
        return json({
          activeProfileId: selectedProfileId,
          profiles: rosterProfiles,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Switch before a failed reload",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Failed reload sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Switch before a failed reload");
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });

      await click(button("Switch before a failed reload"));
      await waitFor(() =>
        assert.equal(
          output("Failed reload sibling active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(
        SharedBroadcastChannel.messagesPosted(),
        3,
        "A committed mutation emits one pending, changed, and settled event.",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("does not invalidate peers for a learner switch rejected before its request", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json(completedLearnerProfileState());
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Reject an empty learner",
            profileId: " ",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Local rejection sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Reject an empty learner");
        assert.equal(profileRequests, 4);
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });
      const initialProfileRequests = profileRequests;

      await click(button("Reject an empty learner"));
      await flush();
      assert.equal(SharedBroadcastChannel.messagesPosted(), 0);
      assert.equal(profileRequests, initialProfileRequests);
      assert.equal(window.localStorage.length, 0);
      assert.equal(
        output("Local rejection sibling active learner").textContent,
        "learner-1",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("does not invalidate peers for a learner creation rejected with a 4xx response", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json(completedLearnerProfileState());
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        return json(
          {
            error: "invalid_learner_name",
            fieldError: "Please use a different learner name.",
          },
          422,
        );
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            action: "create",
            label: "Reject a learner name",
            newLearnerName: "Private name",
            sessionIdentity: "user-1|shared-session",
            showDraft: true,
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Server rejection sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Reject a learner name");
        assert.equal(profileRequests, 4);
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });
      const initialProfileRequests = profileRequests;
      const sourceDraft = document.querySelector(
        'input[aria-label="Reject a learner name draft"]',
      );
      await input(sourceDraft, "Keep this draft");

      await click(button("Reject a learner name"));
      await waitFor(() =>
        assert.equal(profileRequests, initialProfileRequests + 2),
      );
      assert.equal(SharedBroadcastChannel.messagesPosted(), 2);
      assert.equal(
        output("Reject a learner name active learner").closest("[hidden]"),
        null,
      );
      assert.equal(sourceDraft.value, "Keep this draft");
      assert.equal(
        output("Server rejection sibling active learner").textContent,
        "learner-1",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("revalidates after a rejected selection settles behind a silent peer commit", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    const rejectedCreate = deferred();
    const authoritativeRead = deferred();
    let holdAuthoritativeRead = false;
    let authoritativeReads = 0;
    let profileRequests = 0;
    const learnerState = (id, name) => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id,
        name,
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        if (!holdAuthoritativeRead) {
          return json(learnerState("learner-mia", "Mia"));
        }
        authoritativeReads += 1;
        return authoritativeRead.promise;
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        return rejectedCreate.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          action: "create",
          label: "Reject after silent peer commit",
          sessionIdentity: "user-1|shared-session",
        }),
      );
      await waitFor(() => {
        button("Reject after silent peer commit");
        assert.equal(profileRequests, 2);
        assert.equal(SharedBroadcastChannel.peerCount(), 1);
      });

      await click(button("Reject after silent peer commit"));
      const sourcePendingKey = await waitFor(() => {
        const key = [...Array(window.localStorage.length).keys()]
          .map((index) => window.localStorage.key(index))
          .find((candidate) => candidate?.includes(":pending:"));
        assert.ok(key);
        return key;
      });
      const scope = sourcePendingKey.slice(
        0,
        sourcePendingKey.indexOf(":pending:"),
      );
      const silentPeerKey = `${scope}:pending:silent-cara-selection`;
      window.localStorage.setItem(silentPeerKey, "pending");
      window.localStorage.setItem(`${scope}:state`, "silent-cara-change");
      window.localStorage.removeItem(silentPeerKey);
      holdAuthoritativeRead = true;

      rejectedCreate.resolve(
        json(
          {
            error: "invalid_learner_name",
            fieldError: "Please use a different learner name.",
          },
          422,
        ),
      );
      await waitFor(() => assert.equal(authoritativeReads, 1));
      assert.ok(
        output("Reject after silent peer commit active learner").closest(
          "[hidden]",
        ),
      );

      authoritativeRead.resolve(json(learnerState("learner-cara", "Cara")));
      await waitFor(() =>
        assert.equal(
          output("Reject after silent peer commit active learner").textContent,
          "learner-cara",
        ),
      );
      assert.equal(
        output("Reject after silent peer commit active learner").closest(
          "[hidden]",
        ),
        null,
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("does not lose a focus revalidation while a learner switch is in flight", async () => {
    const heldSelection = deferred();
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    let selectionRequested = false;
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectionRequested = true;
        return heldSelection.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        label: "Select a held learner",
        sessionIdentity: null,
      }),
    );
    await waitFor(() => button("Select a held learner"));
    const initialProfileRequests = profileRequests;
    await click(button("Select a held learner"));
    await waitFor(() => assert.equal(selectionRequested, true));

    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
    });
    selectedProfileId = "learner-noah";
    heldSelection.resolve(
      json({ activeProfileId: selectedProfileId, profiles: rosterProfiles }),
    );

    await waitFor(() =>
      assert.equal(profileRequests, initialProfileRequests + 2),
    );
  });

  it("restarts an older learner reload when a same-session selection signal arrives", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    const heldLoads = [];
    let holdLoads = false;
    let profileRequests = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        if (holdLoads) {
          return new Promise((resolve) => {
            heldLoads.push({ resolve, signal: init.signal });
          });
        }
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-noah";
        holdLoads = false;
        return json({
          activeProfileId: selectedProfileId,
          profiles: rosterProfiles,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Select while sibling reloads",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Reloading sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Select while sibling reloads");
        assert.equal(SharedBroadcastChannel.names().length, 1);
        assert.equal(profileRequests, 4);
      });
      const initialProfileRequests = profileRequests;
      holdLoads = true;
      await act(async () => {
        assert.equal(SharedBroadcastChannel.deliverToPeer(1, "changed"), true);
      });
      await waitFor(() => assert.equal(heldLoads.length, 1));

      await click(button("Select while sibling reloads"));
      await waitFor(() =>
        assert.equal(profileRequests, initialProfileRequests + 3),
      );
      assert.deepEqual(
        heldLoads.map(({ signal }) => signal.aborted),
        [true],
        "The sibling's stale snapshot is aborted before it can repaint Mia.",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("maps learner-selection-required to an always-available empty selection context", async () => {
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      return json({ error: "learner_selection_required" }, 409);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          guardianRoute: true,
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerManagerRoute: true,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(SelectionContextHarness),
      ),
    );

    await waitFor(() =>
      assert.equal(output("Active learner selection").textContent, "none"),
    );
    noText(/Questions are taking a break|Mia/);
  });

  it("aborts and fences an older roster reload before committing the newer learner", async () => {
    const pendingLoads = [];
    let initialLoads = true;
    const stateFor = (id) => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id,
        name: id === "learner-b" ? "Bea" : "Ari",
      },
    });
    globalThis.fetch = (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      if (initialLoads) return Promise.resolve(json(stateFor("learner-0")));
      return new Promise((resolve) => {
        const pending = { resolve, signal: init.signal };
        pendingLoads.push(pending);
      });
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(SelectionReloadHarness),
      ),
    );

    await waitFor(() =>
      assert.equal(
        output("Reloaded learner selection").textContent,
        "learner-0",
      ),
    );
    initialLoads = false;
    await click(button("Reload learners A then B"));
    await waitFor(() => assert.equal(pendingLoads.length, 2));
    assert.equal(pendingLoads[0].signal.aborted, true);

    pendingLoads[1].resolve(json(stateFor("learner-b")));
    await waitFor(() =>
      assert.equal(
        output("Reloaded learner selection").textContent,
        "learner-b",
      ),
    );
    assert.equal(pendingLoads[1].signal.aborted, false);

    pendingLoads[0].resolve(json(stateFor("learner-a")));
    await flush();
    assert.equal(
      output("Reloaded learner selection").textContent,
      "learner-b",
      "A transport that resolves after abort must not commit the stale learner.",
    );
  });

  it("aborts a post-initial learner reload when the gate unmounts", async () => {
    let heldReloadSignal = null;
    let holdReload = false;
    globalThis.fetch = (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      if (!holdReload) {
        return Promise.resolve(json(completedLearnerProfileState()));
      }
      heldReloadSignal = init.signal;
      return new Promise(() => {});
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerManagerRoute: true,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(HeldSelectionReloadHarness),
      ),
    );

    await waitFor(() => button("Reload learner B"));
    holdReload = true;
    await click(button("Reload learner B"));
    await waitFor(() => assert.ok(heldReloadSignal));
    assert.equal(heldReloadSignal.aborted, false);

    await cleanupMountedRoots();

    assert.equal(heldReloadSignal.aborted, true);
  });

  it("adopts the authoritative learner when an expected reload returns another selection", async () => {
    const stateFor = (id, name) => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id,
        name,
      },
    });
    const unexpectedResponses = [
      {
        activeProfileId: "learner-c",
        response: json(stateFor("learner-c", "Cara")),
      },
      {
        activeProfileId: "none",
        response: json({ error: "learner_selection_required" }, 409),
      },
    ];

    for (const { activeProfileId, response } of unexpectedResponses) {
      let reloadRequested = false;
      globalThis.fetch = async (path, init = {}) => {
        assert.equal(path, "/api/learner-profile");
        assert.equal(init.method, "GET");
        return reloadRequested
          ? response.clone()
          : json(stateFor("learner-a", "Ari"));
      };

      await mountStrict(createElement(ExpectedSelectionGateHarness));
      await waitFor(() =>
        assert.equal(
          output("Expected reload active learner").textContent,
          "learner-a",
        ),
      );

      reloadRequested = true;
      await click(button("Reload expected learner B"));
      await waitFor(() =>
        assert.match(
          output("Expected reload error").textContent,
          /selected learner could not be loaded/i,
        ),
      );
      assert.equal(
        output("Expected reload active learner").textContent,
        activeProfileId,
      );
      if (response.status === 409) {
        await click(button("Leave learner manager"));
        await waitFor(() => text(/SELECTION REQUIRED FALLBACK/));
      }

      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("rejects an empty expected learner ID without clearing or reloading the active learner", async () => {
    let loadCalls = 0;
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      loadCalls += 1;
      return json(completedLearnerProfileState());
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerManagerRoute: true,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(InvalidSelectionReloadHarness),
      ),
    );

    await waitFor(() =>
      assert.equal(
        output("Invalid selection active learner").textContent,
        "learner-1",
      ),
    );
    const initialLoadCalls = loadCalls;
    await click(button("Reload an empty learner ID"));
    await waitFor(() =>
      assert.match(
        output("Invalid selection error").textContent,
        /selected learner could not be loaded/i,
      ),
    );
    assert.equal(loadCalls, initialLoadCalls);
    assert.equal(
      output("Invalid selection active learner").textContent,
      "learner-1",
    );
  });

  it("keeps the Guardian learner manager mounted through an authoritative selection reload", async () => {
    let selectedId = "learner-mia";
    const rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: null,
        createdAt: "2026-08-26T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "not_started",
      },
    ];
    const stateForSelection = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedId,
        name: selectedId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(stateForSelection());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: selectedId, profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedId = "learner-noah";
        return json({ activeProfileId: selectedId, profiles: rosterProfiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api,
        initialEntry: "/guardian/learners",
      }),
    );

    const preferredName = await waitFor(() => {
      const match = document.querySelector("#preferred-name");
      assert.ok(match);
      button("Use Noah in learner mode");
      return match;
    });
    await input(preferredName, "Ava");
    await click(button("Use Noah in learner mode"));

    await waitFor(() => {
      text(/Now managing Noah/);
      assert.equal(preferredName.value, "Ava");
      const context = [...document.querySelectorAll("h2")].find(
        (heading) => heading.textContent === "Managing Noah",
      );
      assert.ok(context);
      assert.equal(document.activeElement, context);
    });
    assert.equal(currentRoute().path, "/guardian/learners");
  });

  it("opens an explicit Guardian learner details route without an active learner selection", async () => {
    const requests = [];
    globalThis.fetch = async (path, init = {}) => {
      requests.push(`${init.method} ${path}`);
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({ mode: "selection-required" });
      }
      if (
        path === "/api/profile?learnerProfileId=learner-noah" &&
        init.method === "GET"
      ) {
        return json({
          profile: {
            ...completedLearnerProfileState().profile,
            age: 10,
            id: "learner-noah",
            name: "Noah",
            description: "Noah likes rockets.",
            lessonRecordingCleanupPending: false,
            lessonRecordingConsent: false,
          },
          questions: [
            question({ answerKey: "name" }),
            question({ answerKey: "age", promptEn: "How old are you?" }),
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/learners/learner-noah",
      }),
    );

    await waitFor(() => text(/Learner details/));
    assert.equal(document.querySelector("#profile-name")?.value, "Noah");
    assert.equal(currentRoute().path, "/guardian/learners/learner-noah");
    assert.equal(requests.some((request) => request.includes("/active")), false);
  });

  it("returns structurally matched invalid learner details to Manage learners before the learner-mode boundary", async () => {
    const api = {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian" };
      },
    };

    for (const initialEntry of [
      "/guardian/learners/%20",
      "/guardian/learners/%E0%A4%A",
    ]) {
      let targetedProfileLoads = 0;
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          return json({ mode: "selection-required" });
        }
        if (path === "/api/learner-profiles" && init.method === "GET") {
          return json({ activeProfileId: null, profiles: [] });
        }
        if (String(path).startsWith("/api/profile?")) {
          targetedProfileLoads += 1;
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(
        authenticatedApplicationInMemory({ api, initialEntry }),
      );

      await waitFor(() => {
        assert.equal(currentRoute().path, "/guardian/learners");
        text(/Manage learners/);
        noText(/Switch to learner mode/);
      });
      assert.equal(targetedProfileLoads, 0);
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("redirects the legacy Guardian profile route to Manage learners without opening the gate editor", async () => {
    let profileEditorLoads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({
          activeProfileId: "learner-1",
          profiles: [
            {
              age: 8,
              createdAt: "2026-08-26T08:00:00.000Z",
              id: "learner-1",
              name: "Mia",
              profileStatus: "completed",
            },
          ],
        });
      }
      if (path === "/api/profile" && init.method === "GET") {
        profileEditorLoads += 1;
        return json({
          profile: completedLearnerProfileState().profile,
          questions: [],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/profile",
      }),
    );

    await waitFor(() => text(/Manage learners/));
    assert.equal(currentRoute().path, "/guardian/learners");
    assert.equal(profileEditorLoads, 0);
  });

  it("finishes the authoritative learner reload after leaving the Guardian manager", async () => {
    let selectedId = "learner-mia";
    let selectionRequested = false;
    const heldSelection = deferred();
    const loadedProfileIds = [];
    const rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 7,
        createdAt: "2026-08-26T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    const profileState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedId,
        name: selectedId === "learner-noah" ? "Noah" : "Mia",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        loadedProfileIds.push(selectedId);
        return json(profileState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: selectedId, profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectionRequested = true;
        return heldSelection.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/learners",
      }),
    );

    await waitFor(() => button("Use Noah in learner mode"));
    await click(button("Use Noah in learner mode"));
    await waitFor(() => assert.equal(selectionRequested, true));
    await click(link("Back to guardian dashboard"));
    await waitFor(() => {
      assert.equal(currentRoute().path, "/guardian");
      text(/Managing Mia/);
    });
    await click(link("Manage learners"));
    await waitFor(() => {
      assert.equal(currentRoute().path, "/guardian/learners");
      text(/Managing Mia/);
      button("Use Noah in learner mode");
    });

    selectedId = "learner-noah";
    heldSelection.resolve(
      json({ activeProfileId: "learner-noah", profiles: rosterProfiles }),
    );
    await waitFor(() => assert.equal(loadedProfileIds.at(-1), "learner-noah"));
    await waitFor(() => text(/Managing Noah/));
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (candidate) =>
          candidate.getAttribute("aria-label") ===
          "Use Noah in learner mode",
      ),
      false,
    );
  });

  it("reconciles a learner switch whose committed response is malformed", async () => {
    let selectedId = "learner-mia";
    const loadedProfileIds = [];
    const rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 7,
        createdAt: "2026-08-26T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        loadedProfileIds.push(selectedId);
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedId,
            name: selectedId === "learner-noah" ? "Noah" : "Mia",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: selectedId, profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        selectedId = "learner-noah";
        return json({ activeProfileId: selectedId, profiles: null });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/learners",
      }),
    );

    await waitFor(() => button("Use Noah in learner mode"));
    await click(button("Use Noah in learner mode"));
    await waitFor(() => text(/Learner profiles could not be loaded/i));
    await waitFor(() => {
      assert.equal(loadedProfileIds.at(-1), "learner-noah");
      text(/Managing Noah/);
    });
    assert.equal(currentRoute().path, "/guardian/learners");
  });

  it("reconciles a lost managed-creation response without changing learner mode", async () => {
    let selectedId = "learner-mia";
    let rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
    ];
    const loadedProfileIds = [];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        loadedProfileIds.push(selectedId);
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedId,
            name: selectedId === "learner-ava" ? "Ava" : "Mia",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: selectedId, profiles: rosterProfiles });
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        assert.deepEqual(JSON.parse(init.body), {
          activate: false,
          name: "Ava",
        });
        rosterProfiles = [
          ...rosterProfiles,
          {
            age: null,
            createdAt: "2026-08-27T08:00:00.000Z",
            id: "learner-ava",
            name: "Ava",
            profileStatus: "not_started",
          },
        ];
        throw new TypeError("The response was lost.");
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/learners",
      }),
    );

    await waitFor(() => button("Add learner"));
    const initialProfileLoads = loadedProfileIds.length;
    await input(document.querySelector("#preferred-name"), "Ava");
    await click(button("Add learner"));
    await waitFor(() => text(/The response was lost/i));
    await waitFor(() => text(/Ava/));
    assert.equal(loadedProfileIds.length, initialProfileLoads);
    assert.equal(selectedId, "learner-mia");
    text(/Managing Mia/);
    assert.equal(currentRoute().path, "/guardian/learners");
  });

  it("rejects learner creation when the success roster did not add a learner", async () => {
    let profileLoads = 0;
    const rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileLoads += 1;
        return json(completedLearnerProfileState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({
          activeProfileId: "learner-mia",
          profiles: rosterProfiles,
        });
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        return json({
          activeProfileId: "learner-mia",
          profiles: rosterProfiles,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
          async lockGuardianAccess() {
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/guardian/learners",
      }),
    );

    await waitFor(() => button("Add learner"));
    const initialProfileLoads = profileLoads;
    await input(document.querySelector("#preferred-name"), "Ava");
    await click(button("Add learner"));
    await waitFor(() => text(/The newly added learner could not be loaded/i));
    assert.equal(profileLoads, initialProfileLoads);
    assert.equal(currentRoute().path, "/guardian/learners");
    text(/Managing Mia/);
    noText(/Managing Ava/);
  });

  it("remounts the full learner subtree when the active profile ID changes", async () => {
    let nextProfileId = "learner-a";
    let instanceCount = 0;
    const stateFor = (id) => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id,
        name: id === "learner-b" ? "Bea" : "Ari",
      },
    });
    function KeyedLearnerProbe() {
      const { profile } = useLearnerProfile();
      const { reloadSelectedLearner } = useLearnerSelection();
      const [instance] = useState(() => {
        instanceCount += 1;
        return instanceCount;
      });
      return createElement(
        "section",
        null,
        createElement(
          "output",
          {
            "aria-label": "Keyed learner instance",
            "data-instance": String(instance),
            "data-profile-id": profile.id,
          },
          profile.name,
        ),
        createElement(
          "button",
          {
            onClick: () => void reloadSelectedLearner("learner-b"),
            type: "button",
          },
          "Select learner B",
        ),
      );
    }
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      return json(stateFor(nextProfileId));
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          isConversationRoute: false,
          isLearnerProfileRoute: false,
          isProfileRoute: false,
          learnerProfileFallback: createElement("p", null, "SETUP"),
          onCloseProfileRoute() {},
          onConversationCompleted() {},
          onOpenLessons() {},
          onOpenProfileRoute() {},
          onRedoCompleted() {},
          onRedoLearnerProfileRoute() {},
          redoLearnerProfile: false,
        },
        createElement(KeyedLearnerProbe),
      ),
    );

    const firstInstance = await waitFor(() => {
      const probe = output("Keyed learner instance");
      assert.equal(probe.dataset.profileId, "learner-a");
      return probe.dataset.instance;
    });
    nextProfileId = "learner-b";
    await click(button("Select learner B"));
    await waitFor(() => {
      const probe = output("Keyed learner instance");
      assert.equal(probe.dataset.profileId, "learner-b");
      assert.notEqual(probe.dataset.instance, firstInstance);
    });
  });

  it("opens the learner's turn only after Peppa finishes her opening", async () => {
    let disconnectCalls = 0;
    let listener = () => {};
    const microphoneCalls = [];
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/conversations");
      assert.equal(init.method, "POST");
      return json({
        conversation: { id: "conversation-1" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "connecting",
      ),
    );

    assert.deepEqual(microphoneCalls, [false]);
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
    await click(button("Start my turn"));
    assert.deepEqual(microphoneCalls, [false]);

    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hi Mia! Lovely to see you again!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "listening",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "true",
    );
    await click(button("Start my turn"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false, true]));
    assert.equal(disconnectCalls, 0);
  });

  it("keeps the learner turn closed until blocked sound is recovered and replayed", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-blocked");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({
        type: "transcription",
        id: "private-opening-id",
        text: "Hi Mia, this is a private opening.",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });

    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");
    await click(button("Start my turn"));
    assert.deepEqual(microphoneCalls, [false]);
    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(button("Start sound").disabled, true);

    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(repeatCalls, 1);

    startAudioRequest.resolve();
    await flush();
    assert.equal(repeatCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 1);
  });

  it("restores the sound action with fixed copy when playback recovery fails", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {
        startAudioCalls += 1;
        throw new Error("NotAllowedError for Mia and secret-room-token");
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-rejected");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });

    await click(button("Start sound"));
    await waitFor(() => {
      assert.equal(output("Audio playback blocked").textContent, "true");
      assert.equal(output("Audio playback busy").textContent, "false");
      assert.equal(
        output("Audio playback error").textContent,
        "Sound did not start. Tap again.",
      );
    });
    assert.equal(button("Start sound").disabled, false);
    assert.equal(output("Conversation error").textContent, "");
    assert.doesNotMatch(
      document.body.textContent,
      /NotAllowedError|Mia|secret-room-token/,
    );

    await click(button("Start sound"));
    await waitFor(() => assert.equal(startAudioCalls, 2));
    assert.equal(button("Start sound").disabled, false);
    assert.equal(
      output("Audio playback error").textContent,
      "Sound did not start. Tap again.",
    );
  });

  it("does not restore a sound block when native playback wins a late rejection", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-late-rejection");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");

    startAudioRequest.reject(
      new Error("NotAllowedError with private-room-token"),
    );
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(repeatCalls, 0);
    assert.doesNotMatch(document.body.textContent, /private-room-token/);
  });

  it("keeps a newer sound recovery pending when an older request rejects", async () => {
    const firstStartAudio = deferred();
    const secondStartAudio = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioCalls === 1
          ? firstStartAudio.promise
          : secondStartAudio.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-recovery-epochs");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");

    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "false");

    await click(button("Start sound"));
    assert.equal(startAudioCalls, 2);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Audio playback error").textContent, "");

    firstStartAudio.reject(
      new Error("NotAllowedError from stale private-room-token"),
    );
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(button("Start sound").disabled, true);
    assert.doesNotMatch(document.body.textContent, /private-room-token/);

    secondStartAudio.resolve();
    await waitFor(() =>
      assert.equal(output("Audio playback busy").textContent, "false"),
    );
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(startAudioCalls, 2);
  });

  it("coalesces rapid sound taps while playback recovery is pending", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-rapid-taps");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });

    const sound = button("Start sound");
    await act(async () => {
      sound.click();
      sound.click();
      await flush();
    });
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(button("Start sound").disabled, true);

    startAudioRequest.resolve();
    await waitFor(() =>
      assert.equal(output("Audio playback busy").textContent, "false"),
    );
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
  });

  it("recovers an established track from ready and a fulfilled sound request", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-established-track");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "established-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "true");

    startAudioRequest.resolve();
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 0);
  });

  it("does not infer a missed opening from a delayed native playback signal", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-delayed");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      listener({ type: "speech-started", role: "assistant" });
      listener({
        type: "transcription",
        id: "opening-before-native-playing",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(repeatCalls, 0);
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(repeatCalls, 0);
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 0);
  });

  it("replays once when playback stops during speech and a replacement starts", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-replacement-track");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "opening-before-replacement",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "audio-playback", state: "stopped" });
      await flush();
    });
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(output("Conversation status").textContent, "connecting");
    assert.equal(repeatCalls, 0);

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() => assert.equal(repeatCalls, 1));
    assert.equal(output("Conversation status").textContent, "speaking");
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 1);
  });

  it("ignores the repeat callback while playback is blocked", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-repeat-blocked");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "opening-before-repeat-block",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Repeat voice"));
    assert.equal(repeatCalls, 0);
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Conversation error").textContent, "");
    assert.equal(output("Learner turn ready").textContent, "false");
  });

  it("ignores a stale sound-start completion after Back", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let backCalls = 0;
    let disconnectCalls = 0;
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-back");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        onBack: () => {
          backCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(output("Audio playback busy").textContent, "true");

    await click(button("Back voice"));
    assert.equal(backCalls, 1);
    assert.equal(disconnectCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");

    startAudioRequest.resolve();
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(output("Learner turn ready").textContent, "false");
  });

  it("disconnects immediately on Finish and ignores a stale replay completion", async () => {
    const finishRequest = deferred();
    const repeatRequest = deferred();
    const microphoneCalls = [];
    let completedCalls = 0;
    let disconnectCalls = 0;
    let finishCalls = 0;
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      repeatLastAudio() {
        repeatCalls += 1;
        return repeatRequest.promise;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-finish");
      }
      if (
        path === "/api/conversations/conversation-audio-finish/finish" &&
        init.method === "POST"
      ) {
        const { reason } = JSON.parse(init.body);
        if (reason === "finished_by_learner") {
          finishCalls += 1;
          return finishRequest.promise;
        }
        return json({ conversation: {} });
      }
      if (
        path === "/api/conversations/conversation-audio-finish" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/conversation-audio-finish/review" &&
        init.method === "PUT"
      ) {
        return json({
          bypassed: false,
          conversationId: "conversation-audio-finish",
          profileCompleted: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        onCompleted: async () => {
          completedCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "audio-playback", state: "blocked" });
      listener({
        type: "transcription",
        id: "opening-before-finish",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start sound"));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    await waitFor(() => assert.equal(repeatCalls, 1));
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Finish voice"));
    assert.equal(finishCalls, 1);
    assert.equal(disconnectCalls, 1);
    assert.equal(completedCalls, 0);
    assert.equal(output("Conversation status").textContent, "saving");
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");

    repeatRequest.resolve();
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(repeatCalls, 1);
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(output("Conversation status").textContent, "saving");

    finishRequest.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(completedCalls, 1));
    assert.equal(disconnectCalls, 1);
  });

  it("acknowledges Start before the conversation request finishes", async () => {
    const response = deferred();
    globalThis.fetch = async () => response.promise;

    await mountStrict(
      createElement(ConversationHookHarness, { purpose: "small-chat" }),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "ready",
    );

    await act(async () => {
      button("Start voice").click();
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "connecting",
    );

    response.resolve(json({}, 500));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "error",
      ),
    );
  });

  it("allows one voice retry and coalesces another rapid activation", async () => {
    let starts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return json({}, 500);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, { purpose: "small-chat" }),
    );
    await click(button("Start voice"));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "error"),
    );
    assert.equal(output("Conversation recovery phase").textContent, "restart");
    assert.equal(output("Voice retry used").textContent, "false");

    await act(async () => {
      button("Retry voice").click();
      button("Retry voice").click();
      await flush();
    });
    await waitFor(() => assert.equal(starts, 2));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "error"),
    );
    assert.equal(output("Conversation recovery phase").textContent, "restart");
    assert.equal(output("Voice retry used").textContent, "true");
  });

  for (const purpose of ["onboarding", "profile-edit"]) {
    it(`keeps ${purpose} voice recovery reusable after repeated failures`, async () => {
      let starts = 0;
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/conversations" && init.method === "POST") {
          starts += 1;
          return json({}, 500);
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(createElement(ConversationHookHarness, { purpose }));
      await waitFor(() => assert.equal(starts, 1));
      await waitFor(() =>
        assert.equal(output("Conversation status").textContent, "error"),
      );

      await click(button("Retry voice"));
      await waitFor(() => assert.equal(starts, 2));
      await waitFor(() =>
        assert.equal(output("Conversation status").textContent, "error"),
      );

      await click(button("Retry voice"));
      await waitFor(() => assert.equal(starts, 3));
      await waitFor(() =>
        assert.equal(output("Conversation status").textContent, "error"),
      );
      assert.equal(output("Voice retry used").textContent, "false");
    });
  }

  it("keeps finish recovery separate from voice restart recovery", async () => {
    let completedCalls = 0;
    let finishAttempts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("finish-error-conversation");
      }
      if (
        path === "/api/conversations/finish-error-conversation/finish" &&
        init.method === "POST"
      ) {
        finishAttempts += 1;
        return finishAttempts === 1
          ? json({}, 503)
          : json({ conversation: {} });
      }
      if (
        path === "/api/conversations/finish-error-conversation" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/finish-error-conversation/review" &&
        init.method === "PUT"
      ) {
        return json({
          bypassed: false,
          conversationId: "finish-error-conversation",
          profileCompleted: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => ({
          async connect() {},
          async disconnect() {},
          async setMicrophoneEnabled() {},
          subscribe() {
            return () => {};
          },
        }),
        onCompleted: async () => {
          completedCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await click(button("Finish voice"));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "error"),
    );
    assert.equal(output("Conversation recovery phase").textContent, "finish");
    assert.equal(output("Voice retry used").textContent, "false");
    assert.match(output("Conversation error").textContent, /Finish chat again/);

    await click(button("Finish voice"));
    await waitFor(() => assert.equal(completedCalls, 1));
    assert.equal(finishAttempts, 2);
    assert.equal(output("Conversation recovery phase").textContent, "");
  });

  it("keeps the retry used through the opening and resets it on Peppa's reply", async () => {
    let listener = () => {};
    let starts = 0;
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? json({}, 500)
          : conversationStartResponse("recovered-conversation");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "error"),
    );
    await click(button("Retry voice"));
    await waitFor(() => assert.equal(starts, 2));

    await act(async () => {
      listener({
        type: "transcription",
        id: "opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "listening"),
    );
    assert.equal(output("Voice retry used").textContent, "true");

    await click(button("Start my turn"));
    await click(button("End my turn"));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "thinking"),
    );
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(output("Voice retry used").textContent, "false");
  });

  it("leaves for lessons with the same one-shot conversation cleanup as Back", async () => {
    const finished = [];
    let lessonChoices = 0;
    let disconnects = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("lesson-fallback-conversation");
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => ({
          async connect() {},
          async disconnect() {
            disconnects += 1;
          },
          async setMicrophoneEnabled() {},
          subscribe() {
            return () => {};
          },
        }),
        onChooseLesson: () => {
          lessonChoices += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await click(button("Choose lesson"));

    assert.equal(lessonChoices, 1);
    assert.equal(disconnects, 1);
    assert.equal(output("Voice retry used").textContent, "false");
    await waitFor(() =>
      assert.deepEqual(finished, [
        {
          id: "lesson-fallback-conversation",
          reason: "left_conversation",
        },
      ]),
    );
  });

  it("detaches a hung retry and retires its stale predecessor before choosing lessons", async () => {
    const firstStart = deferred();
    const secondStart = deferred();
    const finished = [];
    let lessonChoices = 0;
    let starts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1 ? firstStart.promise : secondStart.promise;
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          throw new Error("A detached Start must not create a transport.");
        },
        onChooseLesson: () => {
          lessonChoices += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await click(button("Retry voice"));
    assert.equal(starts, 2);
    assert.equal(output("Voice retry used").textContent, "true");

    firstStart.resolve(conversationStartResponse("stale-conversation"));
    await act(async () => {
      await flush();
    });
    assert.deepEqual(finished, []);

    await click(button("Choose lesson"));
    assert.equal(lessonChoices, 1);
    assert.equal(output("Voice retry used").textContent, "false");
    await waitFor(() =>
      assert.deepEqual(finished, [
        { id: "stale-conversation", reason: "superseded_start" },
      ]),
    );
  });

  it("closes a late start response after a newer retry supersedes it", async () => {
    const firstStart = deferred();
    const secondStart = deferred();
    const finished = [];
    let starts = 0;
    let transports = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async setMicrophoneEnabled() {},
      subscribe() {
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1 ? firstStart.promise : secondStart.promise;
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return transport;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    assert.equal(output("Wait cycle").textContent, "1");
    await click(button("Start voice"));
    assert.equal(output("Wait cycle").textContent, "2");
    assert.equal(starts, 2);

    secondStart.resolve(conversationStartResponse("current-conversation"));
    await waitFor(() => assert.equal(transports, 1));
    firstStart.resolve(conversationStartResponse("stale-conversation"));
    await waitFor(() =>
      assert.deepEqual(finished, [
        { id: "stale-conversation", reason: "superseded_start" },
      ]),
    );
  });

  it("lets later retries progress when a superseded Start never settles", async () => {
    const firstStart = deferred();
    const finished = [];
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        if (starts === 1) return firstStart.promise;
        return conversationStartResponse(
          starts === 2 ? "current-conversation" : "replacement-conversation",
        );
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return {
            async connect() {},
            async disconnect() {},
            async setMicrophoneEnabled() {},
            subscribe() {
              return () => {};
            },
          };
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    assert.equal(starts, 1);

    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));
    assert.equal(starts, 2);

    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 2));
    assert.equal(starts, 3);
    assert.deepEqual(finished, [
      { id: "current-conversation", reason: "restarted_after_error" },
    ]);
  });

  for (const responseOrder of ["current-first", "stale-first"]) {
    it(`keeps a reused current conversation open when the ${responseOrder} response arrives first`, async () => {
      const firstStart = deferred();
      const secondStart = deferred();
      const finished = [];
      let starts = 0;
      let transports = 0;
      const transport = {
        async connect() {},
        async disconnect() {},
        async setMicrophoneEnabled() {},
        subscribe() {
          return () => {};
        },
      };
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/conversations" && init.method === "POST") {
          starts += 1;
          return starts === 1 ? firstStart.promise : secondStart.promise;
        }
        const finishMatch = String(path).match(
          /^\/api\/conversations\/([^/]+)\/finish$/,
        );
        if (finishMatch && init.method === "POST") {
          finished.push({
            id: decodeURIComponent(finishMatch[1]),
            reason: JSON.parse(init.body).reason,
          });
          return json({ conversation: {} });
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(
        createElement(ConversationHookHarness, {
          createTransport: () => {
            transports += 1;
            return transport;
          },
          purpose: "small-chat",
        }),
      );
      await click(button("Start voice"));
      await click(button("Start voice"));
      assert.equal(starts, 2);

      const responses =
        responseOrder === "current-first"
          ? [secondStart, firstStart]
          : [firstStart, secondStart];
      responses[0].resolve(conversationStartResponse("shared-conversation"));
      await act(async () => {
        await flush();
      });
      if (responseOrder === "current-first") {
        await waitFor(() => assert.equal(transports, 1));
      } else {
        assert.equal(transports, 0);
      }
      assert.deepEqual(
        finished.filter(({ reason }) => reason === "superseded_start"),
        [],
      );

      responses[1].resolve(conversationStartResponse("shared-conversation"));
      await waitFor(() => assert.equal(transports, 1));
      await act(async () => {
        await flush();
      });
      assert.deepEqual(
        finished.filter(({ reason }) => reason === "superseded_start"),
        [],
      );
    });
  }

  for (const responseOrder of ["current-first", "stale-first"]) {
    it(`keeps a reused conversation open across remount when the ${responseOrder} response arrives first`, async () => {
      const firstStart = deferred();
      const secondStart = deferred();
      const finished = [];
      let starts = 0;
      let transports = 0;
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/conversations" && init.method === "POST") {
          starts += 1;
          return starts === 1 ? firstStart.promise : secondStart.promise;
        }
        const finishMatch = String(path).match(
          /^\/api\/conversations\/([^/]+)\/finish$/,
        );
        if (finishMatch && init.method === "POST") {
          finished.push({
            id: decodeURIComponent(finishMatch[1]),
            reason: JSON.parse(init.body).reason,
          });
          return json({ conversation: {} });
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(
        createElement(RemountingConversationHookHarness, {
          createTransport: () => {
            transports += 1;
            return {
              async connect() {},
              async disconnect() {},
              async setMicrophoneEnabled() {},
              subscribe() {
                return () => {};
              },
            };
          },
        }),
      );
      await click(button("Start voice"));
      await click(button("Remount voice"));
      await click(button("Start voice"));
      assert.equal(starts, 2);

      const responses =
        responseOrder === "current-first"
          ? [secondStart, firstStart]
          : [firstStart, secondStart];
      responses[0].resolve(conversationStartResponse("shared-conversation"));
      await act(async () => {
        await flush();
      });
      if (responseOrder === "current-first") {
        await waitFor(() => assert.equal(transports, 1));
      } else {
        assert.equal(transports, 0);
      }
      assert.deepEqual(
        finished.filter(({ reason }) => reason === "superseded_start"),
        [],
      );

      responses[1].resolve(conversationStartResponse("shared-conversation"));
      await waitFor(() => assert.equal(transports, 1));
      await act(async () => {
        await flush();
      });
      assert.deepEqual(
        finished.filter(({ reason }) => reason === "superseded_start"),
        [],
      );
    });
  }

  it("retires a distinct stale response only after a remounted Start settles", async () => {
    const firstStart = deferred();
    const secondStart = deferred();
    const finished = [];
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1 ? firstStart.promise : secondStart.promise;
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(RemountingConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return {
            async connect() {},
            async disconnect() {},
            async setMicrophoneEnabled() {},
            subscribe() {
              return () => {};
            },
          };
        },
      }),
    );
    await click(button("Start voice"));
    await click(button("Remount voice"));
    await click(button("Start voice"));

    firstStart.resolve(conversationStartResponse("stale-conversation"));
    await act(async () => {
      await flush();
    });
    assert.deepEqual(finished, []);

    secondStart.resolve(conversationStartResponse("current-conversation"));
    await waitFor(() => assert.equal(transports, 1));
    await waitFor(() =>
      assert.deepEqual(finished, [
        { id: "stale-conversation", reason: "superseded_start" },
      ]),
    );
  });

  it("retires a distinct stale Start when Back detaches a hung newer request", async () => {
    const firstStart = deferred();
    const secondStart = deferred();
    const finished = [];
    let starts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1 ? firstStart.promise : secondStart.promise;
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        finished.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          throw new Error("A detached Start must not create a transport.");
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await click(button("Start voice"));
    assert.equal(starts, 2);

    firstStart.resolve(conversationStartResponse("stale-conversation"));
    await act(async () => {
      await flush();
    });
    assert.deepEqual(finished, []);

    await click(button("Back voice"));
    await waitFor(() =>
      assert.deepEqual(finished, [
        { id: "stale-conversation", reason: "superseded_start" },
      ]),
    );
  });

  it("waits for an unmounted conversation to retire before remount start", async () => {
    const retirement = deferred();
    const secondStart = deferred();
    const finished = [];
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? conversationStartResponse("unmounted-conversation")
          : secondStart.promise;
      }
      if (
        path === "/api/conversations/unmounted-conversation/finish" &&
        init.method === "POST"
      ) {
        finished.push(JSON.parse(init.body).reason);
        return retirement.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(RemountingConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return {
            async connect() {},
            async disconnect() {},
            async setMicrophoneEnabled() {},
            subscribe() {
              return () => {};
            },
          };
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));
    await click(button("Remount voice"));
    await waitFor(() => assert.deepEqual(finished, ["component_unmounted"]));

    await click(button("Start voice"));
    assert.equal(starts, 1);
    retirement.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(starts, 2));
    secondStart.resolve(conversationStartResponse("remounted-conversation"));
    await waitFor(() => assert.equal(transports, 2));
  });

  it("retires the previous conversation before requesting its replacement", async () => {
    const retirement = deferred();
    const secondStart = deferred();
    const finished = [];
    let starts = 0;
    let transports = 0;
    const createTransport = () => {
      transports += 1;
      return {
        async connect() {},
        async disconnect() {},
        async setMicrophoneEnabled() {},
        subscribe() {
          return () => {};
        },
      };
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? conversationStartResponse("previous-conversation")
          : secondStart.promise;
      }
      if (
        path === "/api/conversations/previous-conversation/finish" &&
        init.method === "POST"
      ) {
        finished.push(JSON.parse(init.body).reason);
        return retirement.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));

    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(finished, ["restarted_after_error"]));
    assert.equal(starts, 1);

    retirement.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(starts, 2));
    secondStart.resolve(conversationStartResponse("replacement-conversation"));
    await waitFor(() => assert.equal(transports, 2));
  });

  it("retries a failed retirement before requesting a replacement", async () => {
    const successfulRetirement = deferred();
    const replacementStart = deferred();
    let retirementCalls = 0;
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? conversationStartResponse("retirement-failure-conversation")
          : replacementStart.promise;
      }
      if (
        path === "/api/conversations/retirement-failure-conversation/finish" &&
        init.method === "POST"
      ) {
        retirementCalls += 1;
        assert.equal(JSON.parse(init.body).reason, "restarted_after_error");
        return retirementCalls === 1
          ? json({ error: "finish_failed" }, 503)
          : successfulRetirement.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return {
            async connect() {},
            async disconnect() {},
            async setMicrophoneEnabled() {},
            subscribe() {
              return () => {};
            },
          };
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));

    await click(button("Start voice"));
    await waitFor(() =>
      assert.equal(output("Conversation status").textContent, "error"),
    );
    assert.equal(retirementCalls, 1);
    assert.equal(starts, 1);

    await click(button("Start voice"));
    await waitFor(() => assert.equal(retirementCalls, 2));
    assert.equal(starts, 1);
    successfulRetirement.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(starts, 2));
    replacementStart.resolve(
      conversationStartResponse("replacement-after-retirement-retry"),
    );
    await waitFor(() => assert.equal(transports, 2));
  });

  it("waits for Back cleanup before reopening the same chat", async () => {
    const retirement = deferred();
    const secondStart = deferred();
    const finished = [];
    let backCalls = 0;
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? conversationStartResponse("left-conversation")
          : secondStart.promise;
      }
      if (
        path === "/api/conversations/left-conversation/finish" &&
        init.method === "POST"
      ) {
        finished.push(JSON.parse(init.body).reason);
        return retirement.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => {
          transports += 1;
          return {
            async connect() {},
            async disconnect() {},
            async setMicrophoneEnabled() {},
            subscribe() {
              return () => {};
            },
          };
        },
        onBack: () => {
          backCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));

    await click(button("Back voice"));
    assert.equal(backCalls, 1);
    await waitFor(() => assert.deepEqual(finished, ["left_conversation"]));
    await click(button("Start voice"));
    assert.equal(starts, 1);

    retirement.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(starts, 2));
    secondStart.resolve(conversationStartResponse("reopened-conversation"));
    await waitFor(() => assert.equal(transports, 2));
  });

  it("shows a recoverable startup error when the initial mute control fails", async () => {
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {
        throw new Error("Initial microphone setup failed");
      },
      subscribe() {
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-microphone-startup-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "error",
      ),
    );
    assert.equal(
      output("Conversation error").textContent,
      "Peppa cannot talk now. Tap Try again.",
    );
  });

  it("does not revive startup when the room disconnects during initial mute", async () => {
    const initialMute = deferred();
    let listener = () => {};
    let muteStarted = false;
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {
        muteStarted = true;
        return initialMute.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-disconnected-during-mute" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(muteStarted, true));
    await act(async () => {
      listener({ type: "disconnected", reason: "SERVER_SHUTDOWN" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );

    initialMute.resolve();
    await act(async () => flush());
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );
  });

  it("quarantines a stale Finish after the learner leaves and reopens chat", async () => {
    const finishRequest = deferred();
    let listener = () => {};
    const microphoneCalls = [];
    let conversationStarts = 0;
    let transportStarts = 0;
    const disconnectCalls = [0, 0];
    const transports = disconnectCalls.map((_, index) => ({
      async connect() {},
      async disconnect() {
        disconnectCalls[index] += 1;
      },
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    }));
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        conversationStarts += 1;
        return json({
          conversation: {
            id:
              conversationStarts === 1
                ? "conversation-finished-during-opening"
                : "conversation-reopened",
          },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (
        path ===
          "/api/conversations/conversation-finished-during-opening/finish" &&
        init.method === "POST"
      ) {
        const { reason } = JSON.parse(init.body);
        return reason === "finished_by_learner"
          ? finishRequest.promise
          : json({ conversation: {} });
      }
      if (
        path === "/api/conversations/conversation-reopened/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transports[transportStarts++],
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await click(button("Finish voice"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "late-opening",
        text: "Hello after Finish",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
    await click(button("Back voice"));
    await click(button("Start voice"));
    await waitFor(() => {
      assert.equal(conversationStarts, 2);
      assert.equal(transportStarts, 2);
      assert.deepEqual(microphoneCalls, [false, false]);
    });
    finishRequest.resolve(json({ conversation: {} }));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.deepEqual(disconnectCalls, [1, 0]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "connecting",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
  });

  it("returns a standalone conversation to the main menu and allows reopening it", async () => {
    let conversationStarts = 0;
    const conversationLifecycle = [];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "realtime",
        });
      }
      if (path === "/api/conversations" && init.method === "POST") {
        conversationStarts += 1;
        conversationLifecycle.push(`start-${conversationStarts}`);
        assert.deepEqual(JSON.parse(init.body), {
          promptStyle: "tiny-turns",
          purpose: "small-chat",
        });
        return json({
          conversation: { id: `conversation-route-${conversationStarts}` },
          livekit: {
            participantToken: "parrot-e2e-participant-token",
            url: "wss://parrot-e2e.invalid",
          },
          scenario: {
            key: "onboarding",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (
        path === "/api/conversations/conversation-route-1/finish" &&
        init.method === "POST"
      ) {
        conversationLifecycle.push(`finish-1:${JSON.parse(init.body).reason}`);
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(createElement(StandaloneConversationRouteHarness));
    await waitFor(() => text(/Talk to Peppa/));
    await click(button("Start chat"));
    await waitFor(() => text(/Tap, then talk/));

    await click(button("Back"));

    await waitFor(() => text(/MAIN MENU/));
    noText(/VOICE CHAT UNAVAILABLE/);

    await click(button("Talk to Peppa"));
    await waitFor(() => text(/Talk to Peppa/));
    await click(button("Start chat"));
    await waitFor(() => text(/Tap, then talk/));
    assert.equal(conversationStarts, 2);
    assert.deepEqual(conversationLifecycle, [
      "start-1",
      "finish-1:left_conversation",
      "start-2",
    ]);
  });

  it("updates and preserves the latest learner transcript after a microphone turn", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/conversations");
      assert.equal(init.method, "POST");
      return json({
        conversation: { id: "conversation-live-transcript" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "onboarding",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello! What's your name?",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await click(button("Start my turn"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "learner-answer",
        text: "My name",
        final: false,
        language: "en",
        role: "user",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name",
    );

    await act(async () => {
      listener({
        type: "transcription",
        id: "learner-answer",
        text: "My name is Mia",
        final: false,
        language: "en",
        role: "user",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name is Mia",
    );

    await click(button("End my turn"));
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name is Mia",
    );
  });

  it("shows a response-loading state from the end of the learner turn until Peppa replies", async () => {
    const finishRequest = deferred();
    let listener = () => {};
    let now = 1_000;
    let reviewCalls = 0;
    let turnCommits = 0;
    const microphoneCalls = [];
    const transport = {
      async commitUserTurn() {
        turnCommits += 1;
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return json({
          conversation: { id: "conversation-response-loading" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (
        path === "/api/conversations/conversation-response-loading/finish" &&
        init.method === "POST"
      ) {
        return finishRequest.promise;
      }
      if (
        path === "/api/conversations/conversation-response-loading" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/conversation-response-loading/review" &&
        init.method === "PUT"
      ) {
        reviewCalls += 1;
        return json({
          bypassed: false,
          conversationId: "conversation-response-loading",
          profileCompleted: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        now: () => now,
      }),
    );
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello! What do you like to do?",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await click(button("Start my turn"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false, true]));
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 1));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "thinking",
      ),
    );

    now = 2_254;
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    assert.equal(
      document.querySelector('output[aria-label="Peppa response latency"]')
        .textContent,
      "1254",
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-reply",
        text: "Drawing",
        final: false,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );

    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-reply",
        text: "Drawing is brilliant!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );

    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(microphoneCalls, [false, true, false, true]),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 2));
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(microphoneCalls, [
        false,
        true,
        false,
        true,
        false,
        true,
      ]),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 3));

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(microphoneCalls, [
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
      ]),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 4));
    await click(button("Finish voice"));
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );

    finishRequest.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(reviewCalls, 1));
  });

  it("does not send after a microphone-stop failure and reports a later send failure", async () => {
    let listener = () => {};
    let disableCalls = 0;
    let commitCalls = 0;
    const transport = {
      async commitUserTurn() {
        commitCalls += 1;
        throw new Error("Turn commit failed");
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        if (!enabled) {
          disableCalls += 1;
          if (disableCalls === 2) {
            throw new Error("Microphone stop failed");
          }
        }
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-turn-failures" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(disableCalls, 1));
    await act(async () => {
      listener({
        type: "transcription",
        id: "opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Start my turn"));
    await click(button("End my turn"));
    await waitFor(() => {
      assert.equal(disableCalls, 2);
      assert.equal(commitCalls, 0);
      assert.equal(
        output("Conversation error").textContent,
        "The microphone did not stop. Tap “I’m done” again.",
      );
    });

    await click(button("End my turn"));
    await waitFor(() => {
      assert.equal(disableCalls, 3);
      assert.equal(commitCalls, 1);
      assert.equal(
        output("Conversation error").textContent,
        "Your words did not send. Please try again.",
      );
    });
  });

  it("coalesces rapid microphone taps while an async change is pending", async () => {
    let listener = () => {};
    let turnCommits = 0;
    let disabledCalls = 0;
    const startChange = deferred();
    const endChange = deferred();
    const microphoneCalls = [];
    const transport = {
      async commitUserTurn() {
        turnCommits += 1;
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
        if (enabled) return startChange.promise;
        disabledCalls += 1;
        if (disabledCalls > 1) return endChange.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-rapid-taps" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await act(async () => {
      button("Start my turn").click();
      button("Start my turn").click();
      await flush();
    });
    assert.deepEqual(microphoneCalls, [false, true]);
    assert.equal(
      document.querySelector('output[aria-label="Microphone busy"]')
        .textContent,
      "true",
    );

    startChange.resolve();
    await waitFor(() =>
      assert.equal(button("End my turn").textContent, "End my turn"),
    );
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Microphone busy"]')
          .textContent,
        "false",
      ),
    );

    await act(async () => {
      button("End my turn").click();
      button("End my turn").click();
      await flush();
    });
    assert.deepEqual(microphoneCalls, [false, true, false]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "thinking",
    );

    endChange.resolve();
    await waitFor(() => assert.equal(turnCommits, 1));
    assert.deepEqual(microphoneCalls, [false, true, false]);
  });

  it("recovers the learner turn with simple copy when microphone access fails", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        if (enabled) throw new Error("Permission denied by browser");
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-microphone-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Start my turn"));

    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation error"]')
          .textContent,
        "Ask a grown-up to turn on the microphone.",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "true",
    );
    assert.equal(button("Start my turn").textContent, "Start my turn");
  });

  it("hides transport detail when repeating Peppa's voice fails", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        throw new Error("LiveKit data packet send failed");
      },
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-repeat-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: [],
          summaryMode: "none",
          version: 2,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Repeat voice"));

    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation error"]')
          .textContent,
        "Peppa could not say that again. Keep talking.",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );
  });

  it("toggles the learner turn with Space without hijacking focused controls", async () => {
    const toggles = [];
    const backs = [];
    await mountStrict(
      createElement(
        ConversationSurface,
        conversationSurfaceProps({
          onBack() {
            backs.push("back");
          },
          onToggleMicrophone() {
            toggles.push("toggle");
          },
        }),
      ),
    );

    const space = new window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
    });
    await act(async () => window.dispatchEvent(space));
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(space.defaultPrevented, true);

    await act(async () => {
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          code: "Space",
          key: " ",
          repeat: true,
        }),
      );
    });
    assert.deepEqual(toggles, ["toggle"]);

    const finish = button("Back");
    await act(async () => {
      finish.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          code: "Space",
          key: " ",
        }),
      );
    });
    assert.deepEqual(toggles, ["toggle"]);

    await click(button("Back"));
    assert.deepEqual(backs, ["back"]);
    assert.deepEqual(toggles, ["toggle"]);
  });

  it("repeats Peppa's latest line from the speech box", async () => {
    const repeats = [];
    await mountStrict(
      createElement(
        ConversationSurface,
        conversationSurfaceProps({
          onRepeatAudio() {
            repeats.push("repeat");
          },
          turns: [
            {
              id: "peppa-latest",
              role: "assistant",
              text: "What animals do you like?",
            },
          ],
        }),
      ),
    );

    await click(button("Repeat Peppa's audio"));
    assert.deepEqual(repeats, ["repeat"]);
  });

  it("accepts the prose profile automatically when the room ends", async () => {
    let listener = () => {};
    let completions = 0;
    const reviews = [];
    const summaryResponse = deferred();
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations") {
        return json({
          conversation: { id: "conversation-2" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "onboarding",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (path === "/api/conversations/conversation-2") {
        return summaryResponse.promise;
      }
      if (path === "/api/conversations/conversation-2/review") {
        reviews.push(JSON.parse(init.body));
        return json({
          bypassed: false,
          conversationId: "conversation-2",
          profileCompleted: true,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        async onCompleted() {
          completions += 1;
        },
        purpose: "onboarding",
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello again, Mia!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "listening",
      ),
    );

    await act(async () => {
      listener({ type: "disconnected", reason: "task_complete" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );

    summaryResponse.resolve(
      json({
        conversation: {
          controllerState: {
            profileSummary: "Mia is eight and loves red racing cars.",
          },
          turns: [],
        },
      }),
    );
    await waitFor(() => assert.equal(completions, 1));

    assert.deepEqual(reviews, [{}]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
  });

  it("does not present an unexpected room drop as a completed chat", async () => {
    let listener = () => {};
    let summaryLoads = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations") {
        assert.equal(init.method, "POST");
        return json({
          conversation: { id: "conversation-disconnected" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "none",
            version: 1,
          },
        });
      }
      if (path === "/api/conversations/conversation-disconnected") {
        summaryLoads += 1;
        return json({ conversation: { turns: [] } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({ type: "disconnected", reason: "SERVER_SHUTDOWN" });
      await flush();
    });

    assert.equal(summaryLoads, 0);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );
    assert.match(
      document.querySelector('output[aria-label="Conversation error"]')
        .textContent,
      /chat stopped\. Tap Try again/i,
    );
  });

  it("moves authentication through retry, sign-in, child content, and sign-out", async () => {
    const client = createSessionClient({
      data: null,
      error: new Error("session unavailable"),
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
    });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );

    text(/Sign-in is temporarily unavailable/);
    await click(button("Try again"));
    text(/Checking your session…/);
    client.retry.resolve();
    await waitFor(() => text(/Welcome back/));

    await input(document.querySelector("#auth-email"), "mia@example.com");
    await input(document.querySelector("#auth-password"), "correct-horse");
    await click(button("Sign in and start"));
    await waitFor(() => text(/AUTHENTICATED APP/));
    assert.deepEqual(client.signInCalls, [
      { email: "mia@example.com", password: "correct-horse" },
    ]);

    await click(await waitFor(() => button("Profile for Mia, guardian mode")));
    await click(button("Sign out"));
    await waitFor(() => text(/Welcome back/));
    noText(/AUTHENTICATED APP/);
  });

  it("remounts guardian state before rendering a changed account identity", async () => {
    const boundaryRenders = [];
    const Provider = guardianAccessBoundary();
    function GuardianBoundary({ children, sessionIdentity }) {
      const [owner] = useState(sessionIdentity);
      boundaryRenders.push({ owner, sessionIdentity });
      return createElement(
        Provider,
        { sessionIdentity },
        createElement(
          "output",
          {
            "aria-label": "Guardian boundary owner",
            "data-owner": owner ?? "signed-out",
          },
          children,
        ),
      );
    }
    const client = createSessionClient({
      data: { user: { email: "mia@example.com", id: "user-1", name: "Mia" } },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: GuardianBoundary,
    });

    await mountStrict(createElement(TestAuthGate, null, "AUTHENTICATED APP"));
    assert.equal(
      document.querySelector('[aria-label="Guardian boundary owner"]').dataset
        .owner,
      "id:user-1|session:test-session:user-1",
    );

    await act(async () => {
      client.publish({
        data: {
          user: { email: "maya@example.com", id: "user-2", name: "Maya" },
        },
        error: null,
        isPending: false,
      });
    });
    assert.equal(
      document.querySelector('[aria-label="Guardian boundary owner"]').dataset
        .owner,
      "id:user-2|session:test-session:user-2",
    );
    assert.equal(
      boundaryRenders.at(-1).owner,
      boundaryRenders.at(-1).sessionIdentity,
    );
  });

  it("fails closed when the same user receives a different Better Auth session", async () => {
    const secondLoad = deferred();
    let loadCalls = 0;
    let replacementSession = false;
    const Provider = createGuardianAccessProvider({
      api: {
        async loadGuardianAccess() {
          loadCalls += 1;
          if (!replacementSession) {
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          }
          return secondLoad.promise;
        },
        async lockGuardianAccess() {
          return { mode: "learner" };
        },
        async unlockGuardianAccess() {
          return { mode: "learner" };
        },
      },
      schedule: () => () => {},
    });
    function AccessProbe() {
      const access = useGuardianAccess();
      return createElement(
        "output",
        { "aria-label": "Guardian access mode" },
        access.mode,
      );
    }
    function GuardianBoundary({ children, sessionIdentity }) {
      const [owner] = useState(sessionIdentity);
      return createElement(
        Provider,
        { sessionIdentity },
        createElement(
          "section",
          { "data-owner": owner },
          createElement(AccessProbe),
          children,
        ),
      );
    }
    const user = { email: "mia@example.com", id: "user-1", name: "Mia" };
    const client = createSessionClient({
      data: { session: { id: "session-a" }, user },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: GuardianBoundary,
    });

    await mountStrict(createElement(TestAuthGate, null, "AUTHENTICATED APP"));
    await waitFor(() =>
      assert.equal(
        document.querySelector('[aria-label="Guardian access mode"]')
          .textContent,
        "guardian",
      ),
    );
    const initialLoadCalls = loadCalls;

    await act(async () => {
      replacementSession = true;
      client.publish({
        data: { session: { id: "session-b" }, user },
        error: null,
        isPending: false,
      });
    });

    const boundary = document.querySelector("section[data-owner]");
    assert.equal(boundary.dataset.owner, "id:user-1|session:session-b");
    assert.equal(
      document.querySelector('[aria-label="Guardian access mode"]').textContent,
      "loading",
    );
    assert.ok(loadCalls > initialLoadCalls);

    secondLoad.resolve({ mode: "learner" });
    await waitFor(() =>
      assert.equal(
        document.querySelector('[aria-label="Guardian access mode"]')
          .textContent,
        "learner",
      ),
    );
  });

  it("does not flash a previous session's account action into a replacement session", async () => {
    const snapshots = [];
    const user = { email: "mia@example.com", id: "user-1", name: "Mia" };
    const client = createSessionClient({
      data: { session: { id: "session-a" }, user },
      error: null,
      isPending: false,
    });
    const profileAction = {
      error: "",
      learnerName: "Ari",
      onOpenProfile() {},
    };
    function CaptureView({ children, learnerName, session }) {
      snapshots.push({
        learnerName,
        sessionId: session?.session.id ?? null,
      });
      return createElement(
        "section",
        null,
        createElement(
          "output",
          { "aria-label": "Session account action" },
          `${session?.session.id ?? "none"}:${learnerName ?? "none"}`,
        ),
        children,
      );
    }
    function RegisterProfileAction() {
      useProfileAccountAction(profileAction);
      return null;
    }
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: ({ children }) => children,
      View: CaptureView,
    });

    await mountStrict(
      createElement(TestAuthGate, null, createElement(RegisterProfileAction)),
    );
    await waitFor(() =>
      assert.equal(
        output("Session account action").textContent,
        "session-a:Ari",
      ),
    );
    const priorSnapshotCount = snapshots.length;

    await act(async () => {
      client.publish({
        data: { session: { id: "session-b" }, user },
        error: null,
        isPending: false,
      });
      await flush();
    });

    assert.ok(
      snapshots
        .slice(priorSnapshotCount)
        .some(
          (snapshot) =>
            snapshot.sessionId === "session-b" && snapshot.learnerName === null,
        ),
      "Expected the replacement session to render without the prior session action before its own registration.",
    );
    await waitFor(() =>
      assert.equal(
        output("Session account action").textContent,
        "session-b:Ari",
      ),
    );
  });

  it("ignores a retained profile-action callback from a replaced browser session", async () => {
    const user = { email: "mia@example.com", id: "user-1", name: "Mia" };
    const client = createSessionClient({
      data: { session: { id: "session-a" }, user },
      error: null,
      isPending: false,
    });
    const profileAction = {
      error: "",
      learnerName: "Ari",
      onOpenProfile() {},
    };
    let staleClear = null;
    function CaptureView({ children, learnerName, session }) {
      return createElement(
        "section",
        null,
        createElement(
          "output",
          { "aria-label": "Owned session account action" },
          `${session?.session.id ?? "none"}:${learnerName ?? "none"}`,
        ),
        children,
      );
    }
    function RegisterAndCaptureClear() {
      const clear = useClearProfileAccountAction();
      useProfileAccountAction(profileAction);
      if (!staleClear) staleClear = clear;
      return null;
    }
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: ({ children }) => children,
      View: CaptureView,
    });

    await mountStrict(
      createElement(TestAuthGate, null, createElement(RegisterAndCaptureClear)),
    );
    await waitFor(() =>
      assert.equal(
        output("Owned session account action").textContent,
        "session-a:Ari",
      ),
    );

    await act(async () => {
      client.publish({
        data: { session: { id: "session-b" }, user },
        error: null,
        isPending: false,
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(
        output("Owned session account action").textContent,
        "session-b:Ari",
      ),
    );

    await act(async () => staleClear());
    assert.equal(
      output("Owned session account action").textContent,
      "session-b:Ari",
    );
  });

  it("keeps Account available and retries sign out from one persistent alert", async () => {
    const failure = deferred();
    const secondFailure = deferred();
    let signOutCalls = 0;
    const client = createSessionClient({
      data: { user: { email: "mia@example.com", name: "Mia" } },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
      signOutAction() {
        signOutCalls += 1;
        return signOutCalls === 1 ? failure.promise : secondFailure.promise;
      },
    });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );

    const account = await waitFor(() =>
      button("Profile for Mia, guardian mode"),
    );
    const status = document.querySelector('[role="status"]');
    const alert = document.querySelector('[role="alert"]');
    assert.ok(status, "Expected the sign-out status to be pre-mounted.");
    assert.ok(alert, "Expected the sign-out alert to be pre-mounted.");
    assert.equal(status.textContent.trim(), "");
    assert.equal(alert.textContent.trim(), "");
    assert.equal(alert.getAttribute("aria-atomic"), "true");
    assert.equal(status.closest('[aria-busy="true"]'), null);

    account.focus();
    await click(account);
    const signOut = button("Sign out");
    await act(async () => {
      signOut.click();
      signOut.click();
      await flush();
    });

    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, account);
    assert.equal(account.getAttribute("aria-disabled"), "true");
    assert.equal(document.querySelector('[role="status"]'), status);
    assert.equal(status.textContent.trim(), "Signing out…");
    assert.equal(status.closest('[aria-busy="true"]'), null);
    assert.equal(signOutCalls, 1);

    await click(account);
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(signOutCalls, 1);

    failure.resolve("Sign out did not finish.");
    await waitFor(() => {
      assert.equal(account.getAttribute("aria-disabled"), null);
      assert.equal(status.textContent.trim(), "");
      assert.equal(alert.textContent.trim(), "Sign out did not finish.");
    });
    assert.equal(document.activeElement, account);
    assert.equal(document.querySelector('[role="alert"]'), alert);
    const retry = button("Sign out again");
    assert.ok(alert.id, "Expected the persistent alert to have an ID.");
    assert.equal(retry.getAttribute("aria-describedby"), alert.id);
    const documentPositionFollowing =
      account.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING;
    assert.equal(
      account.compareDocumentPosition(retry) & documentPositionFollowing,
      documentPositionFollowing,
    );

    await click(account);
    assert.ok(document.querySelector('[role="menu"]'));
    assert.equal(document.querySelector('[role="alert"]'), alert);

    await act(async () => {
      retry.click();
      retry.click();
      await flush();
    });
    assert.equal(signOutCalls, 2);
    assert.equal(document.activeElement, account);
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(account.getAttribute("aria-expanded"), "false");
    assert.equal(account.getAttribute("aria-disabled"), "true");
    assert.equal(status.textContent.trim(), "Signing out…");
    assert.equal(alert.textContent.trim(), "");
    assert.equal(document.querySelector('[role="alert"]'), alert);
    noText(/Sign out again/);

    secondFailure.resolve("Sign out did not finish.");
    await waitFor(() => {
      assert.equal(account.getAttribute("aria-disabled"), null);
      assert.equal(status.textContent.trim(), "");
      assert.equal(alert.textContent.trim(), "Sign out did not finish.");
    });
    assert.equal(document.querySelector('[role="alert"]'), alert);
    assert.equal(document.activeElement, account);
    button("Sign out again");
  });

  it("ignores a stale sign-out result after session re-entry", async () => {
    const firstAttempt = deferred();
    const secondAttempt = deferred();
    let signOutCalls = 0;
    const client = createSessionClient({
      data: { user: { email: "mia@example.com", name: "Mia" } },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
      signOutAction() {
        signOutCalls += 1;
        if (signOutCalls === 1) return firstAttempt.promise;
        if (signOutCalls === 2) return secondAttempt.promise;
        return Promise.resolve(null);
      },
    });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );

    await click(await waitFor(() => button("Profile for Mia, guardian mode")));
    await click(button("Sign out"));
    assert.equal(signOutCalls, 1);

    await act(async () => {
      client.publish({ data: null, error: null, isPending: false });
    });
    await waitFor(() => text(/Welcome back/));

    await act(async () => {
      client.publish({
        data: { user: { email: "mia@example.com", name: "Mia" } },
        error: null,
        isPending: false,
      });
    });
    await waitFor(() => text(/AUTHENTICATED APP/));
    const account = await waitFor(() =>
      button("Profile for Mia, guardian mode"),
    );
    assert.equal(account.getAttribute("aria-disabled"), null);

    await click(account);
    await click(button("Sign out"));
    assert.equal(signOutCalls, 2);
    assert.equal(account.getAttribute("aria-disabled"), "true");

    firstAttempt.resolve("Sign out did not finish.");
    await flush();
    assert.equal(account.getAttribute("aria-disabled"), "true");
    assert.equal(
      document.querySelector('[role="status"]').textContent.trim(),
      "Signing out…",
    );
    noText(/Sign out did not finish/);

    secondAttempt.reject(new Error("offline"));
    await waitFor(() => {
      assert.equal(account.getAttribute("aria-disabled"), null);
      assert.equal(
        document.querySelector('[role="status"]').textContent.trim(),
        "",
      );
    });
    text(/Sign out did not finish/);

    await click(button("Sign out again"));
    assert.equal(signOutCalls, 3);
    assert.equal(account.getAttribute("aria-disabled"), "true");
  });

  it("isolates pending sign out when the authenticated identity changes directly", async () => {
    const firstAttempt = deferred();
    const secondAttempt = deferred();
    let signOutCalls = 0;
    const client = createSessionClient({
      data: {
        user: { email: "mia@example.com", id: "user-mia", name: "Mia" },
      },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
      signOutAction() {
        signOutCalls += 1;
        return signOutCalls === 1
          ? firstAttempt.promise
          : secondAttempt.promise;
      },
    });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );
    await click(await waitFor(() => button("Profile for Mia, guardian mode")));
    await click(button("Sign out"));
    assert.equal(
      button("Signing out… Profile for Mia, guardian mode").getAttribute(
        "aria-disabled",
      ),
      "true",
    );

    await act(async () => {
      client.publish({
        data: {
          user: { email: "noah@example.com", id: "user-noah", name: "Noah" },
        },
        error: null,
        isPending: false,
      });
    });
    const noahAccount = await waitFor(() =>
      button("Profile for Noah, guardian mode"),
    );
    assert.equal(noahAccount.getAttribute("aria-disabled"), null);
    noText(/Signing out|Sign out did not finish|Sign out again/);

    await click(noahAccount);
    await click(button("Sign out"));
    assert.equal(signOutCalls, 2);
    assert.equal(noahAccount.getAttribute("aria-disabled"), "true");

    firstAttempt.resolve("Sign out did not finish.");
    await flush();
    assert.equal(noahAccount.getAttribute("aria-disabled"), "true");
    noText(/Sign out did not finish|Sign out again/);

    secondAttempt.resolve("Sign out did not finish.");
    await waitFor(() => {
      assert.equal(noahAccount.getAttribute("aria-disabled"), null);
      text(/Sign out did not finish/);
      button("Sign out again");
    });
  });

  it("clears failed sign out when the authenticated identity changes directly", async () => {
    const client = createSessionClient({
      data: {
        user: { email: "mia@example.com", id: "user-mia", name: "Mia" },
      },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
      signOutAction: async () => "Sign out did not finish.",
    });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );
    await click(await waitFor(() => button("Profile for Mia, guardian mode")));
    await click(button("Sign out"));
    await waitFor(() => button("Sign out again"));

    await act(async () => {
      client.publish({
        data: {
          user: { email: "noah@example.com", id: "user-noah", name: "Noah" },
        },
        error: null,
        isPending: false,
      });
    });
    const noahAccount = await waitFor(() =>
      button("Profile for Noah, guardian mode"),
    );
    assert.equal(noahAccount.getAttribute("aria-disabled"), null);
    noText(/Sign out did not finish|Sign out again/);
  });

  it("keeps a mounted acknowledgment until Next and focuses each new message once", async () => {
    const firstAcknowledgment = {
      text: "Dinosaurs are very stompy!",
      audio: null,
    };
    const secondAcknowledgment = {
      text: "Drawing dragons sounds fun!",
      audio: null,
    };
    let advanceCalls = 0;
    let rerenderSameAcknowledgment;

    function AcknowledgmentHarness() {
      const [view, setView] = useState({
        acknowledgment: firstAcknowledgment,
        operationId: 11,
        revision: 0,
      });
      rerenderSameAcknowledgment = () =>
        setView((current) => ({
          ...current,
          revision: current.revision + 1,
        }));
      return createElement(LearnerProfileAcknowledgment, {
        acknowledgment: view.acknowledgment,
        onNext() {
          advanceCalls += 1;
          if (view.operationId === 11) {
            setView({
              acknowledgment: secondAcknowledgment,
              operationId: 12,
              revision: 0,
            });
          }
        },
        operationId: view.operationId,
      });
    }

    const headingFocuses = [];
    const originalFocus = window.HTMLElement.prototype.focus;
    window.HTMLElement.prototype.focus = function focus(options) {
      if (this.tagName === "H1") headingFocuses.push(this.textContent);
      return originalFocus.call(this, options);
    };

    try {
      await mountStrict(createElement(AcknowledgmentHarness));
      const firstHeading = document.querySelector("h1");
      assert.ok(firstHeading);
      assert.equal(firstHeading.tabIndex, -1);
      await waitFor(() => assert.equal(document.activeElement, firstHeading));
      assert.deepEqual(headingFocuses, ["Dinosaurs are very stompy!"]);

      const next = button("Next");
      assert.equal(next.tabIndex, 0);
      next.focus();
      await act(async () => rerenderSameAcknowledgment());
      assert.equal(document.activeElement, next);
      assert.deepEqual(headingFocuses, ["Dinosaurs are very stompy!"]);
      assert.equal(advanceCalls, 0);
      text(/Dinosaurs are very stompy!/);

      await click(next);
      const secondHeading = document.querySelector("h1");
      assert.ok(secondHeading);
      await waitFor(() => assert.equal(document.activeElement, secondHeading));
      assert.deepEqual(headingFocuses, [
        "Dinosaurs are very stompy!",
        "Drawing dragons sounds fun!",
      ]);
      assert.equal(advanceCalls, 1);
    } finally {
      window.HTMLElement.prototype.focus = originalFocus;
    }
  });

  it("moves onboarding through retry, bypass, and final-answer completion", async () => {
    let loadAttempts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        loadAttempts += 1;
        return loadAttempts <= 2
          ? json({ message: "Questions are unavailable." }, 503)
          : json(fullLearnerProfileState());
      }
      if (path === "/api/learner-profile/skip" && init.method === "POST") {
        return json({ mode: "bypass-only", canBypass: true });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "BYPASSED LESSONS")),
        createElement("p", null, "BYPASSED LESSONS"),
      ),
    );
    await waitFor(() => text(/Questions are taking a break/));
    await click(button("Retry"));
    await waitFor(() => text(/Answer 1 question/));
    await click(button("Skip for now"));
    await waitFor(() => text(/BYPASSED LESSONS/));

    await cleanupMountedRoots();
    document.body.replaceChildren();
    const completed = completedLearnerProfileState();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(fullLearnerProfileState());
      }
      if (path === "/api/learner-profile/answer" && init.method === "PUT") {
        return json({
          ...completed,
          acknowledgment: {
            text: "Thank you!",
            audio: {
              id: "peppa-thank-you",
              src: "/assets/audio/peppa-thank-you.mp3",
              text: "Thank you!",
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "COMPLETED LESSONS")),
        createElement("p", null, "COMPLETED LESSONS"),
      ),
    );
    await waitFor(() => text(/Answer 1 question/));
    await click(button("Start questions"));
    await waitFor(() => text(/What's your name/));
    await input(document.querySelector("#learner-profile-answer-name"), "Mia");
    await click(button("Next"));
    await waitFor(() => text(/Thank you!/));
    await click(button("Next"));
    await waitFor(() => text(/COMPLETED LESSONS/));
  });

  it("saves mounted profile edits opened from an explicit route action", async () => {
    const client = createSessionClient({
      data: { user: { email: "mia@example.com", name: "Mia" } },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: guardianAccessBoundary(),
    });
    const profileQuestion = question();
    const profileState = {
      profile: {
        ...completedLearnerProfileState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [profileQuestion],
    };
    const savedBodies = [];

    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(profileState);
      }
      if (path === "/api/profile" && init.method === "PUT") {
        savedBodies.push(JSON.parse(init.body));
        return json({
          ...profileState,
          profile: { ...profileState.profile, name: "Maya" },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement(
          ProfileRouteHarness,
          { showOpenProfileAction: true },
          createElement("p", null, "PROFILE LESSONS"),
        ),
      ),
    );

    await waitFor(() => text(/PROFILE LESSONS/));
    await click(button("Open learner details"));
    await waitFor(() => text(/Learner details/));
    await input(document.querySelector("#profile-name"), "Maya");
    await input(document.querySelector("#profile-age"), "almost nine");
    await input(
      document.querySelector("#profile-description"),
      "Maya is eight and loves drawing dragons.",
    );
    await click(button("Save changes"));
    await waitFor(() => text(/PROFILE LESSONS/));
    assert.deepEqual(savedBodies, [
      {
        answers: {
          name: "Maya",
          age: "almost nine",
          description: "Maya is eight and loves drawing dragons.",
        },
      },
    ]);
  });

  it("rejects a late profile save response for a different learner", async () => {
    const activeProfile = {
      profile: {
        ...completedLearnerProfileState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [question()],
    };
    const save = deferred();

    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(activeProfile);
      }
      if (path === "/api/profile" && init.method === "PUT") {
        return save.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        ProfileRouteHarness,
        { initialRoute: "/guardian/profile" },
        createElement("p", null, "PROFILE LESSONS"),
      ),
    );

    await waitFor(() => text(/Learner details/));
    await click(button("Save changes"));
    await act(async () => {
      save.resolve(
        json({
          ...activeProfile,
          acknowledgments: [{ text: "Leo's saved response" }],
          profile: { ...activeProfile.profile, id: "learner-b", name: "Leo" },
        }),
      );
      await flush();
    });

    await waitFor(() =>
      text(/The selected learner profile could not be saved/),
    );
    text(/Learner details/);
    noText(/Leo's saved response/);
  });

  it("paces saved profile acknowledgments one Next action at a time", async () => {
    const profileState = {
      profile: {
        ...completedLearnerProfileState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [question()],
    };
    let saveCalls = 0;

    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(profileState);
      }
      if (path === "/api/profile" && init.method === "PUT") {
        saveCalls += 1;
        return json({
          ...profileState,
          acknowledgments: [
            {
              text: "Thank you!",
              audio: {
                id: "peppa-thank-you",
                src: "/assets/audio/peppa-thank-you.mp3",
                text: "Thank you!",
              },
            },
            {
              text: "Thank you!",
              audio: {
                id: "peppa-thank-you",
                src: "/assets/audio/peppa-thank-you.mp3",
                text: "Thank you!",
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        ProfileRouteHarness,
        { initialRoute: "/guardian/profile" },
        createElement("p", null, "PROFILE LESSONS"),
      ),
    );
    await waitFor(() => text(/Learner details/));
    await click(button("Save changes"));

    await waitFor(() => text(/Thank you!/));
    noText(/PROFILE LESSONS/);
    await waitFor(() =>
      assert.equal(document.activeElement, document.querySelector("h1")),
    );

    const firstNext = button("Next");
    let renewedHeadingFocuses = 0;
    const countHeadingFocus = (event) => {
      if (event.target?.tagName === "H1") renewedHeadingFocuses += 1;
    };
    document.addEventListener("focusin", countHeadingFocus);
    firstNext.focus();
    assert.equal(document.activeElement, firstNext);
    await click(firstNext);
    await waitFor(() => assert.equal(renewedHeadingFocuses, 1));
    text(/Thank you!/);
    noText(/PROFILE LESSONS/);
    await waitFor(() =>
      assert.equal(document.activeElement, document.querySelector("h1")),
    );
    document.removeEventListener("focusin", countHeadingFocus);
    assert.equal(saveCalls, 1);

    await click(button("Next"));
    await waitFor(() => text(/PROFILE LESSONS/));
    assert.equal(saveCalls, 1);
  });

  it("navigates production lesson routes and isolates stale playback", async () => {
    const ControlledAudio = installControlledAudio();

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: ["/lessons"] }),
    );
    text(/Listen\. Then speak\./);
    await click(document.querySelector('a[aria-label^="Start lesson:"]'));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.ok(
      document.querySelector('[aria-label="Parrot English speaking lesson"]'),
    );
    await click(button("Back to lesson list"));
    await waitFor(() => assert.equal(currentRoute().path, "/lessons"));
    text(/Listen\. Then speak\./);

    await click(document.querySelector('a[aria-label^="Start lesson:"]'));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    const popDestination = currentRoute();
    await finishLessonArtworkLoading();
    await click(button("Let's go"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));
    const firstPlayback = ControlledAudio.instances[0];
    const staleFirstCompletion = firstPlayback.onended;
    assert.equal(typeof staleFirstCompletion, "function");

    await click(button("Open scene 2"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(2)));
    await finishLessonArtworkLoading();
    await waitFor(() =>
      assert.equal(document.activeElement, button("Let's go")),
    );
    noText(new RegExp(firstLesson.scenes[1].title));
    assert.equal(firstPlayback.paused, true);
    await act(async () => staleFirstCompletion(new window.Event("ended")));
    noText(new RegExp(firstLesson.scenes[1].title));
    assert.equal(currentRoute().path, lessonScenePath(2));

    await click(button("Let's go"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 2));
    await waitFor(() => text(new RegExp(firstLesson.scenes[1].title)));
    const secondPlayback = ControlledAudio.instances[1];
    const staleSecondCompletion = secondPlayback.onended;
    assert.equal(typeof staleSecondCompletion, "function");
    await act(async () => {
      window.dispatchEvent(
        new window.PopStateEvent("popstate", {
          state: { key: popDestination.key },
        }),
      );
    });
    await click(button("History back"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.equal(currentRoute().key, popDestination.key);
    await waitFor(() =>
      assert.equal(document.activeElement, button("Let's go")),
    );
    noText(new RegExp(firstLesson.scenes[0].title));
    assert.equal(secondPlayback.paused, true);
    await act(async () => staleSecondCompletion(new window.Event("ended")));
    noText(new RegExp(firstLesson.scenes[0].title));
    assert.equal(currentRoute().path, lessonScenePath(1));
    await waitFor(() =>
      assert.equal(document.activeElement, button("Let's go")),
    );
  });

  it("offers retry and skip when lesson sound stops", async () => {
    const ControlledAudio = installControlledAudio();

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: [lessonScenePath(1)] }),
    );
    await finishLessonArtworkLoading();
    await click(button("Let's go"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));

    await act(async () => ControlledAudio.instances[0].fail());
    await waitFor(() => text(/The sound stopped/));
    assert.ok(button("Try sound"));
    assert.ok(button("Skip sound"));

    await click(button("Try sound"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 2));
    noText(/The sound stopped/);

    await act(async () => ControlledAudio.instances[1].fail());
    await waitFor(() => text(/The sound stopped/));
    await click(button("Skip sound"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 3));
    noText(/The sound stopped/);
  });

  it("enters a mounted learner turn as a join-in beat without correction controls", async () => {
    const ControlledAudio = installControlledAudio();

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: [lessonScenePath(1)] }),
    );
    assert.equal(currentRoute().path, lessonScenePath(1));
    await advanceToJoinInBeat(ControlledAudio);
    noText(/Tap to talk|Checking your words|Great job!/);
  });

  it("leaves a join-in beat without pending correction work when browser history changes the lesson route", async () => {
    const ControlledAudio = installControlledAudio();

    const destinationKey = "join-in-pop-destination";
    await mountStrict(
      applicationRoutesInMemory({
        initialEntries: [
          { key: destinationKey, pathname: lessonScenePath(2) },
          { key: "evaluation-source", pathname: lessonScenePath(1) },
        ],
        initialIndex: 1,
      }),
    );
    assert.equal(currentRoute().path, lessonScenePath(1));
    await advanceToJoinInBeat(ControlledAudio);

    await act(async () => {
      window.dispatchEvent(
        new window.PopStateEvent("popstate", {
          state: { key: destinationKey },
        }),
      );
    });
    await click(button("History back"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(2)));
    assert.equal(currentRoute().key, destinationKey);
    await finishLessonArtworkLoading();
    await waitFor(() =>
      assert.equal(document.activeElement, button("Let's go")),
    );

    await flush();

    assert.equal(currentRoute().path, lessonScenePath(2));
    noText(new RegExp(firstLesson.scenes[1].title));
    noText(
      /Tap to talk|Checking your words|Great job!|Speech check failed|Audio unavailable/,
    );
    assert.equal(document.activeElement, button("Let's go"));
  });
});
