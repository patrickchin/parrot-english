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
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
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
let LearnerSelectionProvider;
let useLearnerProfile;
let useLearnerSelection;
let usePeppaConversation;
let createAuthGate;
let createGuardianAccessProvider;
let useGuardianAccess;
let GuardianDashboard;
let GuardianLearnerProfiles;
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
  ({
    LearnerProfileProvider,
    LearnerSelectionProvider,
    useLearnerProfile,
    useLearnerSelection,
  } =
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
  ({ GuardianLearnerProfiles } = await vite.ssrLoadModule(
    "/src/learner-profile/GuardianLearnerProfiles.tsx",
  ));
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
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage");
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
  if (originalSessionStorage === undefined) {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  } else {
    globalThis.sessionStorage = originalSessionStorage;
  }
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

function learnerRosterProfile(overrides = {}) {
  return {
    age: 8,
    createdAt: "2026-08-01T08:00:00.000Z",
    deletionPending: false,
    id: "learner-mia",
    name: "Mia",
    profileStatus: "completed",
    ...overrides,
  };
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
        guardianAccessMode: "guardian",
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

function SameLearnerRefreshHarness() {
  const { profile } = useLearnerProfile();
  const { reloadSelectedLearner } = useLearnerSelection();
  const [instance] = useState(() => globalThis.crypto.randomUUID());
  return createElement(
    "section",
    null,
    createElement(
      "output",
      {
        "aria-label": "Same learner refreshed profile",
        "data-instance": instance,
      },
      `${profile.id}:${profile.name}:${profile.storyLevel}`,
    ),
    createElement(
      "button",
      {
        onClick: () => void reloadSelectedLearner(profile.id),
        type: "button",
      },
      "Refresh the same learner",
    ),
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
  const [mutationResult, setMutationResult] = useState("idle");
  const {
    activeProfileId,
    createAndSelectLearner,
    deleteLearner,
    selectLearner,
  } =
    useLearnerSelection();
  const mutateLearner =
    action === "create"
      ? () => createAndSelectLearner(newLearnerName, ["learner-mia"])
      : action === "delete"
        ? () =>
            typeof deleteLearner === "function"
              ? deleteLearner(profileId)
              : Promise.reject(new Error("Learner deletion is unavailable."))
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
        onClick: () => {
          setMutationResult("pending");
          void mutateLearner().then(
            () => setMutationResult("resolved"),
            (error) => setMutationResult(`rejected:${error.message}`),
          );
        },
        type: "button",
      },
      label,
    ),
    createElement(
      "output",
      { "aria-label": `${label} mutation result` },
      mutationResult,
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

function QueuedSelectionDeletionHarness() {
  const { activeProfileId, deleteLearner, selectLearner } =
    useLearnerSelection();
  const [result, setResult] = useState("idle");
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Queued learner active learner" },
      activeProfileId ?? "none",
    ),
    createElement(
      "output",
      { "aria-label": "Queued learner mutation result" },
      result,
    ),
    createElement(
      "button",
      {
        onClick: () => {
          setResult("pending");
          const selected = selectLearner("learner-noah");
          const deleted =
            typeof deleteLearner === "function"
              ? deleteLearner("learner-noah")
              : Promise.reject(new Error("Learner deletion is unavailable."));
          void Promise.all([selected, deleted]).then(
            () => setResult("resolved"),
            (error) => setResult(`rejected:${error.message}`),
          );
        },
        type: "button",
      },
      "Select then delete queued learner",
    ),
  );
}

function LearnerSelectionSessionHarness({
  action = "select",
  children,
  guardianAccessMode = "guardian",
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
        guardianAccessMode,
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
      children ??
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

function LearnerManagerSessionHarness({ label, sessionIdentity }) {
  return createElement(
    LearnerSelectionSessionHarness,
    { sessionIdentity },
    createElement(
      "section",
      { "aria-label": label },
      createElement(GuardianLearnerProfiles),
    ),
  );
}

function AccountTransitionLearnerSelectionHarness({
  action = "select",
  label = "Select Bob before account transition",
  newLearnerName = "Rose",
  onSwitchAccount,
  profileId = "learner-bob",
  showManager = false,
}) {
  const [sessionIdentity, setSessionIdentity] = useState("account-a|session");
  return createElement(
    Fragment,
    null,
    createElement(LearnerSelectionSessionHarness, {
      action,
      children: showManager
        ? createElement(
            Fragment,
            null,
            createElement(SelectionActionHarness, {
              action,
              label,
              newLearnerName,
              profileId,
            }),
            createElement(GuardianLearnerProfiles),
          )
        : undefined,
      label,
      newLearnerName,
      profileId,
      sessionIdentity,
    }),
    createElement(
      "button",
      {
        onClick: () => {
          onSwitchAccount();
          setSessionIdentity("account-b|session");
        },
        type: "button",
      },
      "Switch learner account",
    ),
  );
}

function installSharedBroadcastChannels({ beforeDelivery, deliver = true } = {}) {
  const channels = new Map();
  const messages = [];
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

    static messages() {
      return [...messages];
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
      messages.push(data);
      beforeDelivery?.(data);
      if (!deliver) return;
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
  const profiles = [
    {
      age: 6,
      createdAt: "2026-08-29T08:00:00.000Z",
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    },
  ];

  return createElement(
    Provider,
    { sessionIdentity: "user-1" },
    createElement(
      LearnerSelectionProvider,
      {
        activeProfileId: "learner-mia",
        async createAndSelectLearner() {
          throw new Error("Not used by the mode route harness.");
        },
        async reloadSelectedLearner() {
          throw new Error("Not used by the mode route harness.");
        },
        async selectLearner(profileId) {
          return { activeProfileId: profileId, profiles };
        },
      },
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
          createElement(Route, {
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
    ),
  );
}

function installModeSwitchRosterFetch() {
  globalThis.fetch = async (path, init = {}) => {
    assert.equal(path, "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return json({
      activeProfileId: "learner-mia",
      profiles: [
        {
          age: 6,
          createdAt: "2026-08-29T08:00:00.000Z",
          deletionPending: false,
          id: "learner-mia",
          name: "Mia",
          profileStatus: "completed",
        },
      ],
    });
  };
}

async function confirmModeSwitch() {
  const learnerButton = await waitFor(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const candidate = [...dialog.querySelectorAll("button")].find(
      (button) =>
        button.getAttribute("aria-label") === "Start learner mode as Mia",
    );
    assert.ok(candidate, "Expected a direct learner-mode button for Mia.");
    return candidate;
  });
  await click(learnerButton);
}

function authenticatedApplicationInMemory({
  api,
  initialEntry,
  onExitLessonRoute = () => {},
}) {
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
          onExitLessonRoute,
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

function LearnerGateAccountExperienceHarness({
  guardianDashboardRoute = true,
  guardianRoute = true,
  onBeforeLearnerSelectionNavigate = () => {},
} = {}) {
  const [experience, setExperience] = useState(null);
  const [Provider] = useState(() =>
    createGuardianAccessProvider({
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
      schedule: () => () => {},
    }),
  );

  function ReadExperience() {
    const accountExperience = useAccountExperience();
    return createElement(
      Fragment,
      null,
      createElement(
        "output",
        {
          "aria-label": "Gate account experience",
          "data-has-active-learner": String(
            accountExperience?.hasActiveLearner ?? false,
          ),
        },
        accountExperience?.learnerName ?? "Learner",
      ),
      createElement(
        "button",
        {
          disabled: !accountExperience?.onOpenLearnerSwitcher,
          onClick: accountExperience?.onOpenLearnerSwitcher,
          type: "button",
        },
        "Open learner switcher",
      ),
    );
  }

  return createElement(
    AccountActionProvider,
    { profileAction: experience, setProfileAction: setExperience },
    createElement(
      Provider,
      { sessionIdentity: "user-1" },
      createElement(
        MemoryRouter,
        null,
        createElement(
          LearnerProfileGate,
          {
            completedLearnerProfileFallback: createElement("p", null, "HOME"),
            guardianDashboardRoute,
            guardianRoute,
            isConversationRoute: false,
            isLearnerProfileRoute: false,
            isProfileRoute: false,
            learnerProfileFallback: createElement("p", null, "SETUP"),
            onBeforeLearnerSelectionNavigate,
            onCloseProfileRoute() {},
            onConversationCompleted() {},
            onOpenLessons() {},
            onOpenProfileRoute() {},
          },
          createElement("p", null, "GUARDIAN DASHBOARD"),
        ),
      ),
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
  it("redirects an authenticated login alias to learner home before profile loading", async () => {
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

    await waitFor(() => assert.equal(currentRoute().path, "/"));
    await waitFor(() => assert.ok(learnerProfileRequestRoutes.length > 0));
    assert.equal(
      learnerProfileRequestRoutes.some((route) => route.startsWith("/login")),
      false,
      "The login alias must redirect before learner-profile requests begin.",
    );
    learnerProfile.resolve();
    await waitFor(() => text(/Switch to learner mode/));
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

  it("registers the actual name and switcher for an incomplete active learner", async () => {
    const operations = [];
    const roster = {
      activeProfileId: "learner-bob",
      profiles: [
        {
          createdAt: "2026-09-01T08:00:00.000Z",
          deletionPending: false,
          id: "learner-bob",
          name: "Bob",
          profileStatus: "in_progress",
        },
      ],
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(
          fullLearnerProfileState({
            profile: {
              ...fullLearnerProfileState().profile,
              id: "learner-bob",
              name: "Bob",
            },
          }),
        );
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json(roster);
      }
      if (
        path === "/api/learner-profiles/learner-bob/active" &&
        init.method === "PUT"
      ) {
        operations.push("select:learner-bob");
        return json(roster);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerGateAccountExperienceHarness, {
        onBeforeLearnerSelectionNavigate() {
          operations.push("before-navigate");
        },
      }),
    );
    await waitFor(() => {
      const experience = output("Gate account experience");
      assert.equal(experience.textContent, "Bob");
      assert.equal(experience.getAttribute("data-has-active-learner"), "true");
      text(/GUARDIAN DASHBOARD/);
    });
    const opener = button("Open learner switcher");
    assert.equal(opener.disabled, false);
    await click(opener);
    await waitFor(() => text(/Who is learning now\?/));
    assert.ok(document.querySelector('[role="dialog"]'));
    await click(button("Cancel"));
    assert.equal(document.querySelector('[role="dialog"]'), null);

    await click(opener);
    await waitFor(() => button("Start learner mode as Bob"));
    await click(button("Start learner mode as Bob"));
    await waitFor(() => {
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.deepEqual(operations, [
        "select:learner-bob",
        "before-navigate",
      ]);
    });
  });

  it("closes an old learner switcher when revalidation requires learner selection", async () => {
    let selectionRequired = false;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        if (selectionRequired) return json({ mode: "selection-required" });
        return json(
          fullLearnerProfileState({
            profile: {
              ...fullLearnerProfileState().profile,
              id: "learner-bob",
              name: "Bob",
            },
          }),
        );
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        if (selectionRequired) {
          return json({ activeProfileId: null, profiles: [] });
        }
        return json({
          activeProfileId: "learner-bob",
          profiles: [
            {
              createdAt: "2026-09-01T08:00:00.000Z",
              deletionPending: false,
              id: "learner-bob",
              name: "Bob",
              profileStatus: "completed",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerGateAccountExperienceHarness, {
        guardianDashboardRoute: false,
        guardianRoute: false,
      }),
    );
    await waitFor(() =>
      assert.equal(output("Gate account experience").textContent, "Bob"),
    );
    await click(button("Open learner switcher"));
    await waitFor(() => button("Start learner mode as Bob"));

    selectionRequired = true;
    await act(async () => window.dispatchEvent(new window.Event("focus")));

    assert.equal(document.querySelector('[role="dialog"]'), null);
    noText(/Start learner mode as Bob/);
    await waitFor(() => text(/Who is learning now\?/));
    text(/Add a learner before switching to learner mode/);
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

  it("locked guardian routes render only the mode-switch screen", async () => {
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

    await waitFor(() => text(/Switch to guardian mode/));
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
    noText(/Save changes|Redo setup questions|Switch to guardian mode/);
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
        assert.equal(password, "");
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
    };
    await mountStrict(modeRoutesInMemory({ api, initialEntry: "/profile" }));
    await waitFor(() => text(/Switch to guardian mode/));
    assert.equal(document.querySelector('input[name="password"]'), null);
    await click(button("Switch to guardian mode"));
    await waitFor(() => text(/Save changes/));
    assert.equal(currentRoute().path, "/profile");

    await cleanupMountedRoots();
    document.body.replaceChildren();
    await mountStrict(modeRoutesInMemory({ api, initialEntry: "/profile" }));
    await waitFor(() => text(/Switch to guardian mode/));
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
    await waitFor(() => text(/Switch to guardian mode/));
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
    installModeSwitchRosterFetch();
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
    await confirmModeSwitch();
    assert.equal(currentRoute().path, "/lessons");
    assert.deepEqual(exitRoutes, []);

    await act(async () => lock.resolve({ mode: "learner" }));
    await waitFor(() => assert.deepEqual(exitRoutes, ["/lessons"]));
    assert.equal(currentRoute().path, "/lessons");
  });

  it("dashboard awaits lock and exits route work before switching profiles", async () => {
    const lock = deferred();
    const exitRoutes = [];
    installModeSwitchRosterFetch();
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
    await confirmModeSwitch();
    assert.equal(currentRoute().path, "/guardian");
    assert.deepEqual(exitRoutes, []);

    await act(async () => lock.resolve({ mode: "learner" }));
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

  it("reconciliation installs one authoritative roster after an invalid learner selection response", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let activeProfileId = "learner-mary";
    let rosterReads = 0;
    const profiles = [
      learnerRosterProfile({ id: "learner-mary", name: "Mary" }),
      learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
    ];
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: activeProfileId,
        name: activeProfileId === "learner-bob" ? "Bob" : "Mary",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (
        path === "/api/learner-profiles/learner-bob/active" &&
        init.method === "PUT"
      ) {
        activeProfileId = "learner-bob";
        return json({
          activeProfileId,
          profiles: [profiles[0]],
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId, profiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Select Bob after reconciliation",
          profileId: "learner-bob",
          sessionIdentity: "user-1|authoritative-roster",
        }),
      );
      await waitFor(() => {
        button("Select Bob after reconciliation");
        assert.equal(SharedBroadcastChannel.peerCount(), 1);
      });

      await click(button("Select Bob after reconciliation"));

      await waitFor(() =>
        assert.equal(
          output("Select Bob after reconciliation mutation result").textContent,
          "resolved",
        ),
      );
      assert.equal(rosterReads, 1);
      assert.equal(
        output("Select Bob after reconciliation active learner").textContent,
        "learner-bob",
      );
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("focus revalidation reloads one authoritative roster before installing its active learner", async () => {
    const revalidation = deferred();
    let selectedProfileId = "learner-mary";
    let profileRequests = 0;
    let rosterReads = 0;
    const stateForSelection = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: selectedProfileId,
        name: selectedProfileId === "learner-bob" ? "Bob" : "Mary",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return selectedProfileId === "learner-bob"
          ? revalidation.promise
          : json(stateForSelection());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            learnerRosterProfile({ id: "learner-mary", name: "Mary" }),
            learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          guardianAccessMode: "guardian",
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
        "learner-mary:Mary",
      ),
    );
    const originalProfileNode = output("Loaded profile identity");
    const initialProfileRequests = profileRequests;
    selectedProfileId = "learner-bob";
    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
      window.dispatchEvent(new window.Event("focus"));
    });

    await waitFor(() =>
      assert.equal(profileRequests, initialProfileRequests + 1),
    );
    assert.equal(rosterReads, 1);
    assert.strictEqual(
      output("Loaded profile identity"),
      originalProfileNode,
      "The routed learner stays mounted until the server identifies a change.",
    );

    revalidation.resolve(json(stateForSelection()));
    await waitFor(() =>
      assert.equal(
        output("Loaded profile identity").textContent,
        "learner-bob:Bob",
      ),
    );
  });

  it("learner-mode focus revalidates the active worker profile without reading the guardian roster", async () => {
    let selectedProfileId = "learner-mary";
    let profileRequests = 0;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-bob" ? "Bob" : "Mary",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ error: "guardian_required" }, 403);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        {
          completedLearnerProfileFallback: createElement("p", null, "HOME"),
          guardianAccessMode: "learner",
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
        "learner-mary:Mary",
      ),
    );
    const initialProfileRequests = profileRequests;
    selectedProfileId = "learner-bob";
    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
    });

    await waitFor(() =>
      assert.equal(
        output("Loaded profile identity").textContent,
        "learner-bob:Bob",
      ),
    );
    assert.equal(profileRequests, initialProfileRequests + 1);
    assert.equal(rosterReads, 0);
  });

  it("changed broadcast and persisted page restore reload the authoritative roster", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let activeProfileId = "learner-mary";
    let rosterReads = 0;
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: activeProfileId,
        name: activeProfileId === "learner-bob" ? "Bob" : "Mary",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({
          activeProfileId,
          profiles: [
            learnerRosterProfile({ id: "learner-mary", name: "Mary" }),
            learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          label: "Changed broadcast receiver",
          sessionIdentity: "user-1|changed-broadcast",
        }),
      );
      await waitFor(() => {
        button("Changed broadcast receiver");
        assert.equal(SharedBroadcastChannel.peerCount(), 1);
      });

      activeProfileId = "learner-bob";
      await act(async () => {
        assert.equal(SharedBroadcastChannel.deliverToPeer(0, "changed"), true);
      });

      await waitFor(() => assert.equal(rosterReads, 1));
      await waitFor(() =>
        assert.equal(
          output("Changed broadcast receiver active learner").textContent,
          "learner-bob",
        ),
      );

      activeProfileId = "learner-mary";
      const restoredPage = new window.Event("pageshow");
      Object.defineProperty(restoredPage, "persisted", { value: true });
      await act(async () => window.dispatchEvent(restoredPage));
      await waitFor(() => assert.equal(rosterReads, 2));
      await waitFor(() =>
        assert.equal(
          output("Changed broadcast receiver active learner").textContent,
          "learner-mary",
        ),
      );
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("failed mutation and failed reconciliation keep a retryable learner error", async () => {
    let mutationRequests = 0;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mary",
            name: "Mary",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-bob/active" &&
        init.method === "PUT"
      ) {
        mutationRequests += 1;
        throw new TypeError("The learner selection response was lost.");
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ message: "Learner profiles are unavailable." }, 503);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        label: "Select Bob during failed reconciliation",
        profileId: "learner-bob",
        sessionIdentity: null,
      }),
    );
    await waitFor(() => button("Select Bob during failed reconciliation"));
    await click(button("Select Bob during failed reconciliation"));

    await waitFor(() => text(/couldn't verify the current learner/i));
    button("Try again");
    await flush();
    assert.equal(mutationRequests, 1);
    assert.equal(rosterReads, 1);
    assert.equal(window.localStorage.length, 0);
  });

  it("account transition aborts an old mutation and ignores its late roster", async (t) => {
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });
    t.after(() => {
      if (originalCryptoDescriptor) {
        Object.defineProperty(
          globalThis,
          "crypto",
          originalCryptoDescriptor,
        );
      } else {
        delete globalThis.crypto;
      }
    });
    const heldSelection = deferred();
    let currentAccount = "account-a";
    let mutationSignal = null;
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: currentAccount === "account-a" ? "learner-mary" : "learner-sam",
        name: currentAccount === "account-a" ? "Mary" : "Sam",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (
        path === "/api/learner-profiles/learner-bob/active" &&
        init.method === "PUT"
      ) {
        mutationSignal = init.signal;
        return heldSelection.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(AccountTransitionLearnerSelectionHarness, {
        onSwitchAccount() {
          currentAccount = "account-b";
        },
      }),
    );
    await waitFor(() =>
      assert.equal(
        button("Select Bob before account transition").closest("[inert]"),
        null,
      ),
    );
    await click(button("Select Bob before account transition"));
    await waitFor(() => assert.ok(mutationSignal));
    assert.equal(mutationSignal.aborted, false);

    await click(button("Switch learner account"));

    await waitFor(() => assert.equal(mutationSignal.aborted, true));
    await waitFor(() =>
      assert.equal(
        output("Select Bob before account transition active learner")
          .textContent,
        "learner-sam",
      ),
    );

    heldSelection.resolve(
      json({
        activeProfileId: "learner-bob",
        profiles: [
          learnerRosterProfile({ id: "learner-mary", name: "Mary" }),
          learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
        ],
      }),
    );
    await flush();
    assert.equal(
      output("Select Bob before account transition active learner").textContent,
      "learner-sam",
    );
  });

  it("keeps replacement-account actions blocked until learner sync is subscribed", async (t) => {
    const replacementDigest = deferred();
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        subtle: {
          digest: async (_algorithm, value) =>
            new globalThis.TextDecoder().decode(value) === "account-b|session"
              ? replacementDigest.promise
              : new Uint8Array(32).buffer,
        },
      },
    });
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    t.after(() => {
      if (originalCryptoDescriptor) {
        Object.defineProperty(
          globalThis,
          "crypto",
          originalCryptoDescriptor,
        );
      } else {
        delete globalThis.crypto;
      }
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    let currentAccount = "account-a";
    let profileRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        const replacementAccount = currentAccount === "account-b";
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: replacementAccount ? "learner-sam" : "learner-mary",
            name: replacementAccount ? "Sam" : "Mary",
          },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(AccountTransitionLearnerSelectionHarness, {
        onSwitchAccount() {
          currentAccount = "account-b";
        },
      }),
    );
    await waitFor(() => {
      const action = button("Select Bob before account transition");
      assert.equal(action.closest("[inert]"), null);
      assert.equal(SharedBroadcastChannel.peerCount(), 1);
    });
    const initialProfileRequests = profileRequests;

    act(() => button("Switch learner account").click());
    const pendingAction = button("Select Bob before account transition");
    assert.notEqual(pendingAction.closest("[hidden]"), null);
    assert.notEqual(pendingAction.closest("[inert]"), null);
    text(/Checking the current learner/);
    assert.equal(SharedBroadcastChannel.peerCount(), 0);
    assert.equal(profileRequests, initialProfileRequests);

    await act(async () => {
      replacementDigest.resolve(new Uint8Array(32).buffer);
    });
    await waitFor(() => {
      const action = button("Select Bob before account transition");
      assert.equal(action.closest("[inert]"), null);
      assert.equal(SharedBroadcastChannel.peerCount(), 1);
      assert.equal(
        output("Select Bob before account transition active learner")
          .textContent,
        "learner-sam",
      );
    });
    assert.equal(profileRequests, initialProfileRequests + 1);
  });

  for (const lateMutation of [
    {
      action: "select",
      label: "Select Bob before switching accounts",
      method: "PUT",
      path: "/api/learner-profiles/learner-bob/active",
      response: {
        activeProfileId: "learner-bob",
        profiles: [
          learnerRosterProfile({ id: "learner-mia", name: "Mary" }),
          learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
        ],
      },
    },
    {
      action: "create",
      label: "Create Rose before switching accounts",
      method: "POST",
      path: "/api/learner-profiles",
      response: {
        activeProfileId: "learner-rose",
        createdProfileId: "learner-rose",
        profiles: [
          learnerRosterProfile({ id: "learner-mia", name: "Mary" }),
          learnerRosterProfile({
            age: null,
            id: "learner-rose",
            name: "Rose",
            profileStatus: "not_started",
          }),
        ],
      },
    },
    {
      action: "delete",
      label: "Delete Bob before switching accounts",
      method: "DELETE",
      path: "/api/learner-profiles/learner-bob",
      response: {
        activeProfileId: "learner-mia",
        profiles: [
          learnerRosterProfile({ id: "learner-mia", name: "Mary" }),
        ],
      },
    },
  ]) {
    it(`account transition prevents a late ${lateMutation.action} response from publishing or refreshing learner state`, async () => {
      const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
      const originalWindowBroadcastChannel = window.BroadcastChannel;
      const SharedBroadcastChannel = installSharedBroadcastChannels();
      globalThis.BroadcastChannel = SharedBroadcastChannel;
      window.BroadcastChannel = SharedBroadcastChannel;
      const heldMutation = deferred();
      let currentAccount = "account-a";
      let mutationSignal = null;
      let rosterReads = 0;
      const fullProfileIds = [];
      const rosterForCurrentAccount = () =>
        currentAccount === "account-a"
          ? {
              activeProfileId: "learner-mia",
              profiles: [
                learnerRosterProfile({ id: "learner-mia", name: "Mary" }),
                learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
              ],
            }
          : {
              activeProfileId: "learner-sam",
              profiles: [
                learnerRosterProfile({ id: "learner-sam", name: "Sam" }),
                learnerRosterProfile({ id: "learner-jack", name: "Jack" }),
              ],
            };
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          const active = rosterForCurrentAccount().profiles[0];
          fullProfileIds.push(active.id);
          return json({
            ...completedLearnerProfileState(),
            profile: {
              ...completedLearnerProfileState().profile,
              id: active.id,
              name: active.name,
            },
          });
        }
        if (path === lateMutation.path && init.method === lateMutation.method) {
          mutationSignal = init.signal;
          return heldMutation.promise;
        }
        if (path === "/api/learner-profiles" && init.method === "GET") {
          rosterReads += 1;
          return json(rosterForCurrentAccount());
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      try {
        await mountStrict(
          createElement(
            MemoryRouter,
            null,
            createElement(AccountTransitionLearnerSelectionHarness, {
              action: lateMutation.action,
              label: lateMutation.label,
              newLearnerName: "Rose",
              onSwitchAccount() {
                currentAccount = "account-b";
              },
              profileId: "learner-bob",
              showManager: true,
            }),
          ),
        );
        await waitFor(() => {
          button(lateMutation.label);
          assert.ok(rosterReads > 0);
          assert.equal(SharedBroadcastChannel.peerCount(), 1);
        });
        await click(button(lateMutation.label));
        await waitFor(() => assert.ok(mutationSignal));
        assert.equal(mutationSignal.aborted, false);

        await click(button("Switch learner account"));
        await waitFor(() => assert.equal(mutationSignal.aborted, true));
        await waitFor(() =>
          assert.equal(
            output(`${lateMutation.label} active learner`).textContent,
            "learner-sam",
          ),
        );
        await waitFor(() =>
          assert.equal(SharedBroadcastChannel.peerCount(), 1),
        );
        await flush();
        const rosterReadsAfterSwitch = rosterReads;
        const fullProfileReadsAfterSwitch = fullProfileIds.length;
        assert.equal(SharedBroadcastChannel.messagesPosted(), 0);

        heldMutation.resolve(json(lateMutation.response));
        await waitFor(() =>
          assert.match(
            output(`${lateMutation.label} mutation result`).textContent,
            /^rejected:/,
          ),
        );
        await flush();

        assert.equal(SharedBroadcastChannel.messagesPosted(), 0);
        assert.equal(rosterReads, rosterReadsAfterSwitch);
        assert.equal(fullProfileIds.length, fullProfileReadsAfterSwitch);
        assert.equal(
          output(`${lateMutation.label} active learner`).textContent,
          "learner-sam",
        );
      } finally {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    });
  }

  it("server-reported deletionPending remains unavailable until an authoritative roster clears it", async () => {
    let deleteRequests = 0;
    let rosterReads = 0;
    const mary = learnerRosterProfile({ id: "learner-mary", name: "Mary" });
    const pendingBob = learnerRosterProfile({
      deletionPending: true,
      id: "learner-bob",
      name: "Bob",
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: mary.id,
            name: mary.name,
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-bob" &&
        init.method === "DELETE"
      ) {
        deleteRequests += 1;
        return json({
          activeProfileId: mary.id,
          profiles: deleteRequests === 1 ? [mary, pendingBob] : [mary],
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: mary.id, profiles: [mary, pendingBob] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Delete Bob with worker cleanup",
        profileId: "learner-bob",
        sessionIdentity: null,
      }),
    );
    await waitFor(() => button("Delete Bob with worker cleanup"));
    await click(button("Delete Bob with worker cleanup"));
    await waitFor(() =>
      assert.match(
        output("Delete Bob with worker cleanup mutation result").textContent,
        /rejected:.*cleanup is still in progress/i,
      ),
    );
    assert.equal(rosterReads, 0);

    await click(button("Delete Bob with worker cleanup"));
    await waitFor(() =>
      assert.equal(
        output("Delete Bob with worker cleanup mutation result").textContent,
        "resolved",
      ),
    );
    assert.equal(deleteRequests, 2);
    assert.equal(rosterReads, 0);
    assert.equal(
      output("Delete Bob with worker cleanup active learner").textContent,
      "learner-mary",
    );
  });

  const creationMary = learnerRosterProfile({
    id: "learner-mia",
    name: "Mary",
  });
  const creationRose = learnerRosterProfile({
    age: null,
    id: "learner-rose",
    name: "Rose",
    profileStatus: "not_started",
  });
  const confirmedCreationRoster = {
    activeProfileId: creationRose.id,
    profiles: [creationMary, creationRose],
  };

  for (const creationCase of [
    {
      authoritativeRoster: confirmedCreationRoster,
      directRoster: {
        activeProfileId: "learner-jack",
        createdProfileId: "learner-rose",
        profiles: [
          creationMary,
          creationRose,
          { ...creationRose, id: "learner-jack" },
        ],
      },
      label: "Create Rose when two new learners are reported",
      resolves: true,
      title:
        "reconciles creation when the worker reports different created and active learners",
    },
    {
      authoritativeRoster: confirmedCreationRoster,
      directRoster: {
        activeProfileId: "learner-mia",
        createdProfileId: "learner-mia",
        profiles: [creationMary, creationRose],
      },
      label: "Create Rose when an existing learner is reported active",
      resolves: true,
      title:
        "reconciles creation instead of accepting a pre-existing active learner",
    },
    {
      authoritativeRoster: confirmedCreationRoster,
      directRoster: {
        activeProfileId: "learner-rose",
        createdProfileId: "learner-rose",
        profiles: [creationMary, { ...creationRose, name: "Jack" }],
      },
      label: "Create Rose when the new learner has the wrong name",
      resolves: true,
      title:
        "reconciles creation instead of accepting a newly active learner with the wrong name",
    },
    {
      authoritativeRoster: {
        activeProfileId: null,
        profiles: [creationMary, creationRose],
      },
      directRoster: {
        activeProfileId: null,
        createdProfileId: "learner-rose",
        profiles: [creationMary, creationRose],
      },
      label: "Create Rose when no learner is reported active",
      resolves: false,
      title:
        "reconciles creation with no active learner and preserves a retryable failure",
    },
  ]) {
    it(creationCase.title, async () => {
      const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
      const originalWindowBroadcastChannel = window.BroadcastChannel;
      const SharedBroadcastChannel = installSharedBroadcastChannels();
      globalThis.BroadcastChannel = SharedBroadcastChannel;
      window.BroadcastChannel = SharedBroadcastChannel;
      let workerActiveProfileId = "learner-mia";
      let rosterReads = 0;
      const fullProfileIds = [];
      const learnerNames = {
        "learner-jack": "Rose",
        "learner-mia": "Mary",
        "learner-rose": "Rose",
      };
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          if (workerActiveProfileId === null) {
            return json({ message: "Select a learner profile." }, 409);
          }
          fullProfileIds.push(workerActiveProfileId);
          return json({
            ...completedLearnerProfileState(),
            profile: {
              ...completedLearnerProfileState().profile,
              id: workerActiveProfileId,
              name: learnerNames[workerActiveProfileId],
            },
          });
        }
        if (path === "/api/learner-profiles" && init.method === "POST") {
          workerActiveProfileId = creationCase.directRoster.activeProfileId;
          return json(creationCase.directRoster);
        }
        if (path === "/api/learner-profiles" && init.method === "GET") {
          rosterReads += 1;
          workerActiveProfileId =
            creationCase.authoritativeRoster.activeProfileId;
          return json(creationCase.authoritativeRoster);
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      try {
        await mountStrict(
          createElement(LearnerSelectionSessionHarness, {
            action: "create",
            label: creationCase.label,
            newLearnerName: "Rose",
            sessionIdentity: `account-1|${creationCase.label}`,
          }),
        );
        await waitFor(() => {
          button(creationCase.label);
          assert.equal(SharedBroadcastChannel.peerCount(), 1);
        });
        const initialFullProfileReads = fullProfileIds.length;
        await click(button(creationCase.label));

        if (creationCase.resolves) {
          await waitFor(() =>
            assert.equal(
              output(`${creationCase.label} mutation result`).textContent,
              "resolved",
            ),
          );
          assert.equal(
            output(`${creationCase.label} active learner`).textContent,
            "learner-rose",
          );
          assert.deepEqual(fullProfileIds.slice(initialFullProfileReads), [
            "learner-rose",
          ]);
        } else {
          await waitFor(() =>
            assert.match(
              output(`${creationCase.label} mutation result`).textContent,
              /^rejected:/,
            ),
          );
          assert.equal(
            output(`${creationCase.label} active learner`).textContent,
            "none",
          );
          assert.deepEqual(
            fullProfileIds.slice(initialFullProfileReads),
            [],
          );
          assert.equal(button(creationCase.label).disabled, false);
        }
        assert.equal(rosterReads, 1);
        assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      } finally {
        globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
        window.BroadcastChannel = originalWindowBroadcastChannel;
      }
    });
  }

  it("creation reconciliation installs the new authoritative learner and reloads its full profile", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let activeProfileId = "learner-mia";
    let rosterReads = 0;
    const profiles = [
      learnerRosterProfile({ id: "learner-mia", name: "Mary" }),
      learnerRosterProfile({
        age: null,
        id: "learner-rose",
        name: "Rose",
        profileStatus: "not_started",
      }),
    ];
    const learnerState = () => ({
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: activeProfileId,
        name: activeProfileId === "learner-rose" ? "Rose" : "Mary",
      },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(learnerState());
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        activeProfileId = "learner-rose";
        return json({
          activeProfileId,
          createdProfileId: "learner-rose",
          profiles: [profiles[0]],
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId, profiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          action: "create",
          label: "Create Rose after reconciliation",
          newLearnerName: "Rose",
          sessionIdentity: "user-1|creation-reconciliation",
        }),
      );
      await waitFor(() => {
        button("Create Rose after reconciliation");
        assert.equal(SharedBroadcastChannel.peerCount(), 1);
      });
      await click(button("Create Rose after reconciliation"));

      await waitFor(() =>
        assert.equal(
          output("Create Rose after reconciliation mutation result").textContent,
          "resolved",
        ),
      );
      assert.equal(rosterReads, 1);
      assert.equal(
        output("Create Rose after reconciliation active learner").textContent,
        "learner-rose",
      );
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("creation reconciliation preserves selection-required worker state and the server error", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mary",
            name: "Mary",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "POST") {
        return json(
          {
            error: "create_failed",
            message: "The learner could not be added.",
          },
          503,
        );
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: null, profiles: [] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          action: "create",
          label: "Create Rose before selection clears",
          newLearnerName: "Rose",
          sessionIdentity: "account-1|session-a",
        }),
      );
      await waitFor(() => button("Create Rose before selection clears"));
      await click(button("Create Rose before selection clears"));

      await waitFor(() =>
        assert.equal(
          output("Create Rose before selection clears mutation result")
            .textContent,
          "rejected:The learner could not be added.",
        ),
      );
      assert.equal(
        output("Create Rose before selection clears active learner")
          .textContent,
        "none",
      );
      assert.equal(rosterReads, 1);
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("does not recheck or interrupt routed learner drafts on routine tab return when cross-tab sync is available", async (t) => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    t.after(() => {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    let profileRequests = 0;
    let rosterRequests = 0;
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
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json(learnerState);
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterRequests += 1;
        return json({ error: "guardian_required" }, 403);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        AccountActionProvider,
        {
          profileAction: null,
          sessionIdentity: "user-1|routine-tab-return",
          setProfileAction() {},
        },
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
      ),
    );
    const topic = await waitFor(() => {
      const candidate = document.querySelector(
        'textarea[aria-label="Lesson topic draft"]',
      );
      assert.ok(candidate);
      assert.equal(SharedBroadcastChannel.peerCount(), 1);
      return candidate;
    });
    await input(topic, "Unsaved garden lesson");
    const originalMount = topic.dataset.mount;
    const initialProfileRequests = profileRequests;
    const initialRosterRequests = rosterRequests;

    await act(async () => {
      window.dispatchEvent(new window.Event("focus"));
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await flush();
    assert.equal(profileRequests, initialProfileRequests);
    noText(/Checking the current learner/);
    const currentTopic = document.querySelector(
      'textarea[aria-label="Lesson topic draft"]',
    );
    assert.equal(
      currentTopic?.closest("[hidden]"),
      null,
      "The routed page stays visible after returning to the tab.",
    );
    assert.equal(
      currentTopic?.closest("[inert]"),
      null,
      "The routed page stays interactive after returning to the tab.",
    );
    await input(currentTopic, "Unsaved garden lesson continued");
    assert.equal(
      document.querySelector('textarea[aria-label="Lesson topic draft"]')
        ?.value,
      "Unsaved garden lesson continued",
    );
    assert.equal(currentTopic?.dataset.mount, originalMount);
    assert.equal(rosterRequests, initialRosterRequests);
  });

  it("subscribes to learner changes before loading and enabling learner actions", async (t) => {
    const channelDigest = deferred();
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        subtle: {
          digest: () => channelDigest.promise,
        },
      },
    });
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    t.after(() => {
      if (originalCryptoDescriptor) {
        Object.defineProperty(
          globalThis,
          "crypto",
          originalCryptoDescriptor,
        );
      } else {
        delete globalThis.crypto;
      }
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    let activeProfileId = "learner-mary";
    let profileRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: activeProfileId,
            name: activeProfileId === "learner-bob" ? "Bob" : "Mary",
          },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        label: "Select Bob after learner sync",
        profileId: "learner-bob",
        sessionIdentity: "user-1|delayed-learner-sync",
      }),
    );
    assert.equal(profileRequests, 0);
    const pendingAction = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Select Bob after learner sync",
    );
    assert.ok(pendingAction);
    assert.notEqual(pendingAction.closest("[hidden]"), null);
    assert.notEqual(pendingAction.closest("[inert]"), null);

    activeProfileId = "learner-bob";
    channelDigest.resolve(new Uint8Array(32).buffer);
    await waitFor(() => {
      button("Select Bob after learner sync");
      assert.equal(SharedBroadcastChannel.peerCount(), 1);
      assert.equal(
        output("Select Bob after learner sync active learner").textContent,
        "learner-bob",
      );
    });
    assert.ok(profileRequests > 0);
  });

  it("lets a changed signal supersede an initial learner load", async (t) => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    t.after(() => {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    const initialProfile = deferred();
    let initialProfileSignal = null;
    let profileRequests = 0;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        if (profileRequests === 1) {
          initialProfileSignal = init.signal;
          return initialProfile.promise;
        }
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-bob",
            name: "Bob",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({
          activeProfileId: "learner-bob",
          profiles: [
            learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
          ],
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        label: "Observe startup learner sync",
        sessionIdentity: "user-1|startup-sync",
      }),
    );
    await waitFor(() => {
      assert.ok(initialProfileSignal);
      assert.equal(SharedBroadcastChannel.peerCount(), 1);
    });

    await act(async () => {
      assert.equal(SharedBroadcastChannel.deliverToPeer(0, "changed"), true);
    });
    await waitFor(() => assert.equal(initialProfileSignal.aborted, true));
    await waitFor(() =>
      assert.equal(
        output("Observe startup learner sync active learner").textContent,
        "learner-bob",
      ),
    );

    initialProfile.resolve(
      json({
        ...completedLearnerProfileState(),
        profile: {
          ...completedLearnerProfileState().profile,
          id: "learner-mary",
          name: "Mary",
        },
      }),
    );
    await flush();
    assert.equal(
      output("Observe startup learner sync active learner").textContent,
      "learner-bob",
    );
    assert.equal(profileRequests, 2);
    assert.equal(rosterReads, 1);
  });

  it("uses an immediate changed signal as the authoritative startup load", async (t) => {
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const heldRoster = deferred();
    let announced = false;
    class ImmediateChangeBroadcastChannel {
      #onmessage = null;

      constructor() {}

      get onmessage() {
        return this.#onmessage;
      }

      set onmessage(next) {
        this.#onmessage = next;
        if (!announced && typeof next === "function") {
          announced = true;
          next({ data: "changed" });
        }
      }

      close() {}

      postMessage() {}
    }
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        subtle: {
          digest: async () => new Uint8Array(32).buffer,
        },
      },
    });
    globalThis.BroadcastChannel = ImmediateChangeBroadcastChannel;
    window.BroadcastChannel = ImmediateChangeBroadcastChannel;
    t.after(() => {
      if (originalCryptoDescriptor) {
        Object.defineProperty(
          globalThis,
          "crypto",
          originalCryptoDescriptor,
        );
      } else {
        delete globalThis.crypto;
      }
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    let profileRequests = 0;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-bob",
            name: "Bob",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return heldRoster.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        label: "Observe immediate learner sync",
        sessionIdentity: "user-1|immediate-startup-sync",
      }),
    );
    const profileRequestsBeforeRoster = profileRequests;
    heldRoster.resolve(
      json({
        activeProfileId: "learner-bob",
        profiles: [
          learnerRosterProfile({ id: "learner-bob", name: "Bob" }),
        ],
      }),
    );
    await waitFor(() =>
      assert.equal(
        output("Observe immediate learner sync active learner").textContent,
        "learner-bob",
      ),
    );
    assert.equal(profileRequestsBeforeRoster, 0);
    assert.equal(profileRequests, 1);
    assert.equal(rosterReads, 1);
  });

  it("preserves unsaved Guardian profile fields when visibility confirms the same learner", async () => {
    const revalidation = deferred();
    let holdRevalidation = false;
    let learnerProfileRequests = 0;
    let profileEditorRequests = 0;
    let rosterRequests = 0;
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
        return json(learnerState);
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterRequests += 1;
        return holdRevalidation
          ? revalidation.promise
          : json({
              activeProfileId: "learner-mia",
              profiles: [learnerRosterProfile()],
            });
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
    const initialRosterRequests = rosterRequests;
    holdRevalidation = true;

    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await waitFor(() =>
      assert.equal(rosterRequests, initialRosterRequests + 1),
    );
    assert.equal(
      document.querySelector("#profile-name")?.value,
      "Unsaved Mia name",
    );

    revalidation.resolve(
      json({
        activeProfileId: "learner-mia",
        profiles: [learnerRosterProfile()],
      }),
    );
    await flush();
    assert.equal(
      document.querySelector("#profile-name")?.value,
      "Unsaved Mia name",
    );
    assert.equal(
      learnerProfileRequests,
      initialLearnerProfileRequests + 1,
    );
    assert.equal(profileEditorRequests, initialProfileEditorRequests);
  });

  it("blocks stale Guardian profile writes after learner revalidation fails and switches safely on retry", async () => {
    const failedRevalidation = deferred();
    let selectedProfileId = "learner-mia";
    let failNextRosterLoad = false;
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
        return json(learnerState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        if (failNextRosterLoad) {
          failNextRosterLoad = false;
          return failedRevalidation.promise;
        }
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            learnerRosterProfile({
              age: selectedProfileId === "learner-noah" ? 10 : 8,
              id: selectedProfileId,
              name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
            }),
          ],
        });
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
    failNextRosterLoad = true;
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

    act(() => button("Try again").click());
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            learnerRosterProfile({
              id: selectedProfileId,
              name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
              profileStatus: "incomplete",
            }),
          ],
        });
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({
          activeProfileId: selectedProfileId,
          profiles: [
            learnerRosterProfile({
              age: selectedProfileId === "learner-noah" ? 10 : 8,
              id: selectedProfileId,
              name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
            }),
          ],
        });
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

  it("deletes an inactive learner without reloading or remounting the active learner", async () => {
    let profileRequests = 0;
    let deleteRequests = 0;
    const activeState = {
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: "learner-mia",
        name: "Mia",
      },
    };
    const miaSummary = {
      age: 8,
      createdAt: "2026-08-01T08:00:00.000Z",
      deletionPending: false,
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        profileRequests += 1;
        return json(activeState);
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        deleteRequests += 1;
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);
        return json({ activeProfileId: miaSummary.id, profiles: [miaSummary] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Delete inactive Noah",
        profileId: "learner-noah",
        sessionIdentity: null,
        showDraft: true,
      }),
    );
    await waitFor(() => button("Delete inactive Noah"));
    const initialProfileRequests = profileRequests;
    const draft = document.querySelector(
      'input[aria-label="Delete inactive Noah draft"]',
    );
    await input(draft, "Keep this manager draft");
    await click(button("Delete inactive Noah"));

    await waitFor(() =>
      assert.equal(
        output("Delete inactive Noah mutation result").textContent,
        "resolved",
      ),
    );
    assert.equal(deleteRequests, 1);
    assert.equal(profileRequests, initialProfileRequests);
    assert.equal(
      output("Delete inactive Noah active learner").textContent,
      "learner-mia",
    );
    assert.equal(draft.value, "Keep this manager draft");
  });

  it("keeps a held local deletion mounted and resolves it after focus revalidation", async () => {
    const heldDelete = deferred();
    const activeState = {
      ...completedLearnerProfileState(),
      profile: {
        ...completedLearnerProfileState().profile,
        id: "learner-mia",
        name: "Mia",
      },
    };
    const miaSummary = {
      age: 8,
      createdAt: "2026-08-01T08:00:00.000Z",
      deletionPending: false,
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    };
    let deleteRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(activeState);
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        deleteRequests += 1;
        return heldDelete.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Delete Noah through focus",
        profileId: "learner-noah",
        sessionIdentity: "user-1|focus-delete",
        showDraft: true,
      }),
    );
    await waitFor(() => button("Delete Noah through focus"));
    const draft = document.querySelector(
      'input[aria-label="Delete Noah through focus draft"]',
    );
    await input(draft, "Keep this local draft");
    await click(button("Delete Noah through focus"));
    await waitFor(() => assert.equal(deleteRequests, 1));

    await act(async () => window.dispatchEvent(new window.Event("focus")));
    await flush();
    assert.equal(
      output("Delete Noah through focus active learner").closest("[hidden]"),
      null,
    );
    assert.equal(draft.value, "Keep this local draft");

    heldDelete.resolve(
      json({ activeProfileId: miaSummary.id, profiles: [miaSummary] }),
    );
    await waitFor(() =>
      assert.equal(
        output("Delete Noah through focus mutation result").textContent,
        "resolved",
      ),
    );
    assert.equal(draft.value, "Keep this local draft");
  });

  it("clears and reloads selection-required state after deleting the queued active learner", async () => {
    let selectedProfileId = "learner-mia";
    const operations = [];
    const profileState = () => {
      if (selectedProfileId === null) {
        return json({ error: "learner_selection_required" }, 409);
      }
      return json({
        ...completedLearnerProfileState(),
        profile: {
          ...completedLearnerProfileState().profile,
          id: selectedProfileId,
          name: selectedProfileId === "learner-noah" ? "Noah" : "Mia",
        },
      });
    };
    const summaries = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return profileState();
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        operations.push("select");
        selectedProfileId = "learner-noah";
        return json({ activeProfileId: selectedProfileId, profiles: summaries });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        operations.push("delete");
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);
        selectedProfileId = null;
        return json({ activeProfileId: null, profiles: [summaries[0]] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerSelectionSessionHarness,
        { sessionIdentity: null },
        createElement(QueuedSelectionDeletionHarness),
      ),
    );
    await waitFor(() => button("Select then delete queued learner"));
    await click(button("Select then delete queued learner"));

    await waitFor(() => {
      assert.equal(
        output("Queued learner mutation result").textContent,
        "resolved",
      );
      assert.equal(
        output("Queued learner active learner").textContent,
        "none",
      );
    });
    assert.deepEqual(operations, ["select", "delete"]);
  });

  it("reconciles a malformed learner deletion success with one roster read", async () => {
    let rosterReads = 0;
    const profiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        return json({ activeProfileId: "learner-mia", profiles });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: "learner-mia", profiles: [profiles[0]] });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Delete after malformed success",
        profileId: "learner-noah",
        sessionIdentity: null,
      }),
    );
    await waitFor(() => button("Delete after malformed success"));
    await click(button("Delete after malformed success"));
    await waitFor(() =>
      assert.equal(
        output("Delete after malformed success mutation result").textContent,
        "resolved",
      ),
    );
    assert.equal(rosterReads, 1);
    assert.equal(
      output("Delete after malformed success active learner").textContent,
      "learner-mia",
    );
  });

  for (const { activeProfileId, label } of [
    {
      activeProfileId: "learner-mia",
      label: "Delete stale inactive Noah",
    },
    {
      activeProfileId: "learner-noah",
      label: "Delete stale active Noah",
    },
  ]) {
    it(`reconciles a not_found response for ${label.toLowerCase()} with one roster read`, async () => {
      let currentActiveProfileId = activeProfileId;
      let profileReads = 0;
      let rosterReads = 0;
      const miaSummary = {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      };
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/learner-profile" && init.method === "GET") {
          profileReads += 1;
          if (currentActiveProfileId === null) {
            return json({ error: "learner_selection_required" }, 409);
          }
          return json({
            ...completedLearnerProfileState(),
            profile: {
              ...completedLearnerProfileState().profile,
              id: currentActiveProfileId,
              name:
                currentActiveProfileId === "learner-noah" ? "Noah" : "Mia",
            },
          });
        }
        if (
          path === "/api/learner-profiles/learner-noah" &&
          init.method === "DELETE"
        ) {
          if (activeProfileId === "learner-noah") currentActiveProfileId = null;
          return json({ error: "not_found" }, 404);
        }
        if (path === "/api/learner-profiles" && init.method === "GET") {
          rosterReads += 1;
          return json({
            activeProfileId: currentActiveProfileId,
            profiles: [miaSummary],
          });
        }
        throw new Error(`Unexpected request: ${init.method} ${path}`);
      };

      await mountStrict(
        createElement(LearnerSelectionSessionHarness, {
          action: "delete",
          label,
          profileId: "learner-noah",
          sessionIdentity: null,
        }),
      );
      await waitFor(() => button(label));
      const initialProfileReads = profileReads;
      await click(button(label));

      await waitFor(() =>
        assert.equal(
          output(`${label} mutation result`).textContent,
          "resolved",
        ),
      );
      assert.equal(rosterReads, 1);
      assert.equal(
        output(`${label} active learner`).textContent,
        activeProfileId === "learner-noah" ? "none" : "learner-mia",
      );
      assert.equal(
        profileReads,
        initialProfileReads + (activeProfileId === "learner-noah" ? 0 : 1),
      );
    });
  }

  it("settles a not_found deletion unchanged when the roster still contains the learner", async () => {
    let rosterReads = 0;
    const profiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        return json({ error: "not_found" }, 404);
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: "learner-mia", profiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Reject stale Noah deletion",
        profileId: "learner-noah",
        sessionIdentity: "user-1|not-found-normal",
      }),
    );
    await waitFor(() => button("Reject stale Noah deletion"));
    await click(button("Reject stale Noah deletion"));

    await waitFor(() =>
      assert.match(
        output("Reject stale Noah deletion mutation result").textContent,
        /^rejected:/,
      ),
    );
    assert.equal(rosterReads, 1);
    assert.equal(window.localStorage.length, 0);
  });

  it("settles and publishes a roster-confirmed pending deletion without blocking the manager", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    const profiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: true,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        throw new TypeError("The destructive response was lost.");
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: "learner-mia", profiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            action: "delete",
            label: "Finish pending Noah deletion",
            profileId: "learner-noah",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Pending deletion sibling",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        button("Finish pending Noah deletion");
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
      });
      await click(button("Finish pending Noah deletion"));

      await waitFor(() =>
        assert.match(
          output("Finish pending Noah deletion mutation result").textContent,
          /rejected:.*cleanup is still in progress/i,
        ),
      );
      assert.equal(
        output("Finish pending Noah deletion active learner").closest(
          "[hidden]",
        ),
        null,
      );
      await waitFor(() =>
        assert.equal(
          output("Pending deletion sibling active learner").closest(
            "[hidden]",
          ),
          null,
        ),
      );
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("reloads a mounted same-session learner manager after a peer deletion settles", async () => {
    const heldDelete = deferred();
    const miaSummary = {
      age: 8,
      createdAt: "2026-08-01T08:00:00.000Z",
      deletionPending: false,
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    };
    const noahSummary = {
      age: 10,
      createdAt: "2026-08-02T08:00:00.000Z",
      deletionPending: false,
      id: "learner-noah",
      name: "Noah",
      profileStatus: "completed",
    };
    let rosterProfiles = [miaSummary, noahSummary];
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
            name: "Mia",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: "learner-mia", profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        return heldDelete.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        MemoryRouter,
        null,
        createElement(
          Fragment,
          null,
          createElement(LearnerManagerSessionHarness, {
            label: "Source learner manager",
            sessionIdentity: "user-1|shared-manager",
          }),
          createElement(LearnerManagerSessionHarness, {
            label: "Peer learner manager",
            sessionIdentity: "user-1|shared-manager",
          }),
        ),
      ),
    );
    const source = document.querySelector(
      'section[aria-label="Source learner manager"]',
    );
    const peer = document.querySelector(
      'section[aria-label="Peer learner manager"]',
    );
    assert.ok(source);
    assert.ok(peer);
    await waitFor(() => {
      assert.ok(source.querySelector('button[aria-label="Delete Noah"]'));
      assert.ok(peer.querySelector('button[aria-label="Delete Noah"]'));
    });
    const initialRosterReads = rosterReads;

    await click(source.querySelector('button[aria-label="Delete Noah"]'));
    const dialog = source.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const confirm = [...dialog.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Delete Noah",
    );
    assert.ok(confirm);
    act(() => confirm.click());
    assert.equal(peer.closest("[hidden]"), null);

    rosterProfiles = [miaSummary];
    await act(async () => {
      heldDelete.resolve(
        json({ activeProfileId: "learner-mia", profiles: rosterProfiles }),
      );
    });
    await waitFor(() => assert.equal(peer.closest("[hidden]"), null));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const peerRefreshed =
      peer.querySelector('button[aria-label="Delete Noah"]') === null;
    const settlementRosterReads = rosterReads - initialRosterReads;
    await cleanupMountedRoots();
    assert.equal(peerRefreshed, true);
    assert.equal(settlementRosterReads, 3);
  });

  it("reloads a mounted peer manager with roster-confirmed pending cleanup", async () => {
    const heldDelete = deferred();
    const miaSummary = {
      age: 8,
      createdAt: "2026-08-01T08:00:00.000Z",
      deletionPending: false,
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    };
    const noahSummary = {
      age: 10,
      createdAt: "2026-08-02T08:00:00.000Z",
      deletionPending: false,
      id: "learner-noah",
      name: "Noah",
      profileStatus: "completed",
    };
    let rosterProfiles = [miaSummary, noahSummary];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
            name: "Mia",
          },
        });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId: "learner-mia", profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        return heldDelete.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        MemoryRouter,
        null,
        createElement(
          Fragment,
          null,
          createElement(LearnerManagerSessionHarness, {
            label: "Pending cleanup source manager",
            sessionIdentity: "user-1|shared-pending-manager",
          }),
          createElement(LearnerManagerSessionHarness, {
            label: "Pending cleanup peer manager",
            sessionIdentity: "user-1|shared-pending-manager",
          }),
        ),
      ),
    );
    const source = document.querySelector(
      'section[aria-label="Pending cleanup source manager"]',
    );
    const peer = document.querySelector(
      'section[aria-label="Pending cleanup peer manager"]',
    );
    assert.ok(source);
    assert.ok(peer);
    await waitFor(() =>
      assert.ok(source.querySelector('button[aria-label="Delete Noah"]')),
    );
    await click(source.querySelector('button[aria-label="Delete Noah"]'));
    const dialog = source.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const confirm = [...dialog.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Delete Noah",
    );
    assert.ok(confirm);
    act(() => confirm.click());
    assert.equal(peer.closest("[hidden]"), null);

    rosterProfiles = [miaSummary, { ...noahSummary, deletionPending: true }];
    await act(async () => {
      heldDelete.reject(new TypeError("The destructive response was lost."));
    });
    await waitFor(() => {
      assert.equal(peer.closest("[hidden]"), null);
      assert.ok(
        peer.querySelector('button[aria-label="Finish deleting Noah"]'),
      );
      assert.equal(source.querySelector('[role="dialog"]'), dialog);
    });
  });

  it("fails closed when both the delete response and roster reconciliation are unknown", async (t) => {
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        subtle: {
          digest: async () => new Uint8Array(32).buffer,
        },
      },
    });
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    t.after(() => {
      if (originalCryptoDescriptor) {
        Object.defineProperty(
          globalThis,
          "crypto",
          originalCryptoDescriptor,
        );
      } else {
        delete globalThis.crypto;
      }
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    });
    let deleteRequests = 0;
    let rosterAvailable = false;
    let rosterReads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: "learner-mia",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-noah" &&
        init.method === "DELETE"
      ) {
        deleteRequests += 1;
        throw new TypeError("The destructive response was lost.");
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return rosterAvailable
          ? json({
              activeProfileId: "learner-mia",
              profiles: [
                learnerRosterProfile(),
                learnerRosterProfile({
                  age: 10,
                  createdAt: "2026-08-02T08:00:00.000Z",
                  id: "learner-noah",
                  name: "Noah",
                }),
              ],
            })
          : json({ error: "roster_unavailable" }, 503);
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(LearnerSelectionSessionHarness, {
        action: "delete",
        label: "Delete with no authoritative response",
        profileId: "learner-noah",
        sessionIdentity: "user-1|shared-session",
      }),
    );
    await waitFor(() => {
      const deleteButton = button("Delete with no authoritative response");
      assert.equal(deleteButton.closest("[inert]"), null);
      assert.equal(
        output(
          "Delete with no authoritative response active learner",
        ).textContent,
        "learner-mia",
      );
    });
    await click(button("Delete with no authoritative response"));

    await waitFor(() => text(/couldn't verify the current learner/i));
    assert.match(
      output("Delete with no authoritative response mutation result")
        .textContent,
      /^rejected:/,
    );
    assert.equal(deleteRequests, 1);
    assert.equal(rosterReads, 1);
    assert.equal(window.localStorage.length, 0);

    rosterAvailable = true;
    await act(async () => window.dispatchEvent(new window.Event("focus")));
    await waitFor(() => button("Delete with no authoritative response"));
    assert.equal(deleteRequests, 1, "focus must never retry the mutation");
    assert.equal(rosterReads, 2);
  });

  it("unavailable peer invalidation keeps mutations usable and focus catches peers up", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    class ThrowingBroadcastChannel {
      constructor() {
        throw new Error("BroadcastChannel is unavailable.");
      }
    }
    globalThis.BroadcastChannel = ThrowingBroadcastChannel;
    window.BroadcastChannel = ThrowingBroadcastChannel;
    let rosterReads = 0;
    let selectedProfileId = "learner-mary";
    const profiles = [
      learnerRosterProfile({ id: "learner-mary", name: "Mary" }),
      learnerRosterProfile({
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-bob",
        name: "Bob",
      }),
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          profile: {
            ...completedLearnerProfileState().profile,
            id: selectedProfileId,
            name: selectedProfileId === "learner-bob" ? "Bob" : "Mary",
          },
        });
      }
      if (
        path === "/api/learner-profiles/learner-bob/active" &&
        init.method === "PUT"
      ) {
        selectedProfileId = "learner-bob";
        return json({ activeProfileId: selectedProfileId, profiles });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({ activeProfileId: selectedProfileId, profiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    try {
      await mountStrict(
        createElement(
          Fragment,
          null,
          createElement(LearnerSelectionSessionHarness, {
            label: "Select Bob without a channel",
            profileId: "learner-bob",
            sessionIdentity: "user-1|shared-session",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Channel-free sibling",
            profileId: "learner-bob",
            sessionIdentity: "user-1|shared-session",
          }),
        ),
      );
      await waitFor(() => {
        const action = button("Select Bob without a channel");
        assert.equal(action.closest("[inert]"), null);
        assert.equal(
          output("Select Bob without a channel active learner").textContent,
          "learner-mary",
        );
      });
      await click(button("Select Bob without a channel"));
      await waitFor(() =>
        assert.equal(
          output("Select Bob without a channel active learner").textContent,
          "learner-bob",
        ),
      );
      assert.equal(
        output("Channel-free sibling active learner").textContent,
        "learner-mary",
      );
      assert.equal(window.localStorage.length, 0);

      await act(async () => window.dispatchEvent(new window.Event("focus")));
      await waitFor(() =>
        assert.equal(
          output("Channel-free sibling active learner").textContent,
          "learner-bob",
        ),
      );
      assert.equal(rosterReads, 2);
      assert.equal(window.localStorage.length, 0);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("signals a learner switch across one account without exposing account or session identifiers", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let rosterReads = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
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
            sessionIdentity: "id:user-1|session:session-a",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Same-account sibling tab",
            sessionIdentity: "id:user-1|session:session-b",
          }),
          createElement(LearnerSelectionSessionHarness, {
            label: "Different-account tab",
            sessionIdentity: "id:user-2|session:session-a",
          }),
        ),
      );
      await waitFor(() => {
        button("Select from source tab");
        button("Same-account sibling tab");
        button("Different-account tab");
        assert.equal(profileRequests, 3);
        assert.equal(SharedBroadcastChannel.names().length, 2);
      });
      assert.equal(
        SharedBroadcastChannel.names().some((name) =>
          /user-1|user-2|session-a|session-b/.test(name),
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
        "The source and same-account sibling reload; the other account does not.",
      );
      assert.equal(rosterReads, 1);
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(
        output("Different-account tab active learner").textContent,
        "learner-mia",
      );
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("successful selection reconciliation reloads a same-session peer", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let rosterReads = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      learnerRosterProfile(),
      learnerRosterProfile({
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
      }),
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
        return json({ activeProfileId: selectedProfileId, profiles: null });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
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
        assert.equal(profileRequests, 2);
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
      assert.equal(rosterReads, 2);
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
    } finally {
      globalThis.BroadcastChannel = originalGlobalBroadcastChannel;
      window.BroadcastChannel = originalWindowBroadcastChannel;
    }
  });

  it("worker-confirmed selection emits one literal changed invalidation", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let rosterReads = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
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
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.equal(rosterReads, 1);
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
        assert.equal(profileRequests, 2);
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

  it("rejected learner creation reconciles once before reporting the server error", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    let profileRequests = 0;
    let rosterReads = 0;
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({
          activeProfileId: "learner-1",
          profiles: [
            learnerRosterProfile({ id: "learner-1", name: "Mia" }),
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
            action: "create",
            label: "Reject a learner name",
            newLearnerName: "Rose",
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
        assert.equal(profileRequests, 2);
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
      assert.equal(rosterReads, 2);
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
      assert.match(
        output("Reject a learner name mutation result").textContent,
        /^rejected:Please use a different learner name\./,
      );
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

  it("does not lose a focus revalidation while a learner switch is in flight", async () => {
    const heldSelection = deferred();
    let profileRequests = 0;
    let rosterReads = 0;
    let selectedProfileId = "learner-mia";
    let selectionRequested = false;
    const rosterProfiles = [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        return json({
          activeProfileId: selectedProfileId,
          profiles: rosterProfiles,
        });
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
    assert.equal(rosterReads, 1);
  });

  it("changed signal aborts an older roster reload before installing the current learner", async () => {
    const originalGlobalBroadcastChannel = globalThis.BroadcastChannel;
    const originalWindowBroadcastChannel = window.BroadcastChannel;
    const SharedBroadcastChannel = installSharedBroadcastChannels();
    globalThis.BroadcastChannel = SharedBroadcastChannel;
    window.BroadcastChannel = SharedBroadcastChannel;
    const heldRoster = deferred();
    let heldRosterSignal = null;
    let holdNextRoster = false;
    let profileRequests = 0;
    let rosterReads = 0;
    let selectedProfileId = "learner-mia";
    const rosterProfiles = [
      learnerRosterProfile(),
      learnerRosterProfile({
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
      }),
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
      if (path === "/api/learner-profiles" && init.method === "GET") {
        rosterReads += 1;
        if (holdNextRoster) {
          holdNextRoster = false;
          heldRosterSignal = init.signal;
          return heldRoster.promise;
        }
        return json({
          activeProfileId: selectedProfileId,
          profiles: rosterProfiles,
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
        assert.equal(SharedBroadcastChannel.peerCount(), 2);
        assert.equal(profileRequests, 2);
      });
      const initialProfileRequests = profileRequests;
      holdNextRoster = true;

      await act(async () => {
        assert.equal(SharedBroadcastChannel.deliverToPeer(1, "changed"), true);
      });
      await waitFor(() => assert.ok(heldRosterSignal));
      assert.equal(heldRosterSignal.aborted, false);

      await click(button("Select while sibling reloads"));
      await waitFor(() => assert.equal(heldRosterSignal.aborted, true));
      await waitFor(() =>
        assert.equal(
          output("Reloading sibling active learner").textContent,
          "learner-noah",
        ),
      );
      assert.equal(rosterReads, 2);
      assert.equal(profileRequests, initialProfileRequests + 2);
      assert.deepEqual(SharedBroadcastChannel.messages(), ["changed"]);
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

  it("requires learner selection and resumes the validated learner target without locking learner mode", async () => {
    const operations = [];
    let activeProfileId = null;
    const rosterProfiles = [
      {
        age: 7,
        createdAt: "2026-08-29T08:01:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Mary",
        profileStatus: "completed",
      },
    ];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return activeProfileId === null
          ? json({ error: "learner_selection_required" }, 409)
          : json({
              ...completedLearnerProfileState(),
              profile: {
                ...completedLearnerProfileState().profile,
                id: activeProfileId,
                name: "Mary",
              },
            });
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({ activeProfileId, profiles: rosterProfiles });
      }
      if (
        path === "/api/learner-profiles/learner-noah/active" &&
        init.method === "PUT"
      ) {
        operations.push("select:learner-noah");
        activeProfileId = "learner-noah";
        return json({ activeProfileId, profiles: rosterProfiles });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return { mode: "learner" };
          },
          async lockGuardianAccess() {
            operations.push("lock");
            return { mode: "learner" };
          },
          async unlockGuardianAccess() {
            return { mode: "guardian" };
          },
        },
        initialEntry: "/lessons?from=picker#resume",
        onExitLessonRoute() {
          operations.push("before-navigate");
        },
      }),
    );

    await waitFor(() => button("Start learner mode as Mary"));
    assert.equal(document.querySelectorAll("h1").length, 1);
    text(/Who is learning now\?/);
    noText(/Ask a grown-up|Cancel/);

    await click(button("Start learner mode as Mary"));

    await waitFor(() => {
      assert.equal(currentRoute().path, "/lessons?from=picker#resume");
      assert.deepEqual(operations, [
        "select:learner-noah",
        "before-navigate",
      ]);
    });
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

  it("turns an authoritative targeted dubbing 403 into a same-URL unlock boundary", async () => {
    let guardianMode = "guardian";
    let targetedLoads = 0;
    const deepLink =
      "/guardian/dubbing?learnerProfileId=learner-noah&from=deep-link";
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/learner-profiles" && init.method === "GET") {
        return json({
          activeProfileId: "learner-1",
          profiles: [
            {
              age: 6,
              createdAt: "2026-08-25T08:00:00.000Z",
              deletionPending: false,
              id: "learner-1",
              name: "Mia",
              profileStatus: "completed",
            },
            {
              age: 10,
              createdAt: "2026-08-26T08:00:00.000Z",
              deletionPending: false,
              id: "learner-noah",
              name: "Noah",
              profileStatus: "completed",
            },
          ],
        });
      }
      if (
        path ===
          "/api/dubs/five-little-ducks-v2?learnerProfileId=learner-noah" &&
        (init.method ?? "GET") === "GET"
      ) {
        targetedLoads += 1;
        if (targetedLoads === 1) {
          guardianMode = "learner";
          return json({ error: "guardian_required" }, 403);
        }
        return json({
          complete: false,
          consentState: "not_granted",
          dubId: "five-little-ducks-v2",
          guardianConsentVersion: "guardian-voice-r2-v2",
          lines: [],
          recordingEnabled: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      authenticatedApplicationInMemory({
        api: {
          async loadGuardianAccess() {
            return guardianMode === "guardian"
              ? {
                  expiresAt: "2099-01-01T00:00:00.000Z",
                  mode: "guardian",
                }
              : { mode: "learner" };
          },
          async lockGuardianAccess() {
            guardianMode = "learner";
            return { mode: "learner" };
          },
          async unlockGuardianAccess(password) {
            assert.equal(password, "");
            guardianMode = "guardian";
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
        },
        initialEntry: deepLink,
      }),
    );

    await waitFor(() => text(/Switch to guardian mode/));
    assert.equal(currentRoute().path, deepLink);
    noText(/Your saved dub could not be loaded/);
    const loadsBeforeUnlock = targetedLoads;

    assert.equal(document.querySelector('input[name="password"]'), null);
    await click(button("Switch to guardian mode"));
    await waitFor(() => text(/Editing settings for Noah/));
    assert.equal(currentRoute().path, deepLink);
    assert.ok(targetedLoads > loadsBeforeUnlock);
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
              deletionPending: false,
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

  it("reconciles a lost managed-creation response without changing learner mode", async () => {
    let selectedId = "learner-mia";
    let rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        deletionPending: false,
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
            deletionPending: false,
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
    button("Edit Mia's profile");
    button("Edit Ava's profile");
    assert.equal(currentRoute().path, "/guardian/learners");
  });

  it("rejects learner creation when the success roster did not add a learner", async () => {
    let profileLoads = 0;
    const rosterProfiles = [
      {
        age: 6,
        createdAt: "2026-08-25T08:00:00.000Z",
        deletionPending: false,
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
          createdProfileId: "learner-mia",
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
    button("Edit Mia's profile");
    assert.equal(
      document.querySelector('button[aria-label="Edit Ava\'s profile"]'),
      null,
    );
  });

  it("replaces fresh same-learner data without remounting learner-mode consumers", async () => {
    const refreshedProfile = deferred();
    let holdRefresh = false;
    let refreshRequests = 0;
    let currentProfile = {
      ...completedLearnerProfileState().profile,
      id: "learner-mia",
      name: "Mia",
      storyLevel: "first-words",
    };
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      assert.equal(init.method, "GET");
      if (holdRefresh) {
        refreshRequests += 1;
        return refreshedProfile.promise;
      }
      return json({
        ...completedLearnerProfileState(),
        profile: currentProfile,
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
        createElement(SameLearnerRefreshHarness),
      ),
    );

    const initial = await waitFor(() => {
      const profile = output("Same learner refreshed profile");
      assert.equal(profile.textContent, "learner-mia:Mia:first-words");
      return profile.dataset.instance;
    });
    currentProfile = {
      ...currentProfile,
      name: "Mia Updated",
      storyLevel: "tiny-stories",
    };
    const refreshButton = button("Refresh the same learner");
    holdRefresh = true;
    await click(refreshButton);
    await waitFor(() => assert.equal(refreshRequests, 1));

    try {
      const heldProfile = output("Same learner refreshed profile");
      assert.strictEqual(heldProfile.dataset.instance, initial);
      assert.equal(
        heldProfile.closest("[hidden]") === null,
        true,
        "The loaded learner consumer stays visible during its refresh.",
      );
      assert.equal(
        refreshButton.closest("[inert]") === null,
        true,
        "The loaded learner consumer stays interactive during its refresh.",
      );
      noText(/Checking the current learner/i);
    } finally {
      refreshedProfile.resolve(
        json({
          ...completedLearnerProfileState(),
          profile: currentProfile,
        }),
      );
    }

    await waitFor(() => {
      const profile = output("Same learner refreshed profile");
      assert.equal(profile.textContent, "learner-mia:Mia Updated:tiny-stories");
      assert.equal(profile.dataset.instance, initial);
    });
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
    await waitFor(() => assert.ok(loadCalls > initialLoadCalls));

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
    text(/Pick a lesson/);
    noText(/Listen\. Then speak\./);
    await click(document.querySelector('a[aria-label^="Start lesson:"]'));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.ok(
      document.querySelector('[aria-label="Parrot English speaking lesson"]'),
    );
    await click(button("Back to lesson list"));
    await waitFor(() => assert.equal(currentRoute().path, "/lessons"));
    text(/Pick a lesson/);
    noText(/Listen\. Then speak\./);

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

  it("mirrors Guardian-protected learner deletion and pending retry in the browser mock", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-delete",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-delete-contract",
    );
    const learners = window.__parrotE2eLearners;
    assert.equal(typeof learners?.failNextLearnerDelete, "function");

    let response = await window.fetch("/api/learner-profiles");
    let currentRoster = await response.json();
    assert.deepEqual(
      currentRoster.profiles.map(({ deletionPending, id }) => ({
        deletionPending,
        id,
      })),
      [
        { deletionPending: false, id: "learner-mia" },
        { deletionPending: false, id: "learner-noah" },
      ],
    );

    await window.fetch("/api/guardian-access", { method: "DELETE" });
    response = await window.fetch("/api/learner-profiles/learner-noah", {
      method: "DELETE",
    });
    assert.equal(response.status, 403);
    await window.fetch("/api/guardian-access", {
      body: JSON.stringify({ password: "e2e-guardian-password" }),
      method: "POST",
    });

    learners.failNextLearnerDelete();
    response = await window.fetch("/api/learner-profiles/learner-noah", {
      method: "DELETE",
    });
    assert.equal(response.status, 503);
    currentRoster = await (
      await window.fetch("/api/learner-profiles")
    ).json();
    assert.equal(
      currentRoster.profiles.find(({ id }) => id === "learner-noah")
        ?.deletionPending,
      true,
    );
    response = await window.fetch(
      "/api/learner-profiles/learner-noah/active",
      { method: "PUT" },
    );
    assert.equal(response.status, 404);

    response = await window.fetch("/api/learner-profiles/learner-noah", {
      method: "DELETE",
    });
    assert.equal(response.status, 200);
    currentRoster = await response.json();
    assert.equal(currentRoster.activeProfileId, "learner-mia");
    assert.deepEqual(
      currentRoster.profiles.map(({ id }) => id),
      ["learner-mia"],
    );

    response = await window.fetch("/api/learner-profiles", {
      body: JSON.stringify({ activate: false, name: "Bob" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    assert.equal(response.status, 200);
    const addedRoster = await response.json();
    const bob = addedRoster.profiles.find(({ name }) => name === "Bob");
    assert.ok(bob);

    response = await window.fetch("/api/learner-profiles/learner-mia", {
      method: "DELETE",
    });
    currentRoster = await response.json();
    assert.equal(currentRoster.activeProfileId, null);
    assert.deepEqual(
      currentRoster.profiles.map(({ id }) => id),
      [bob.id],
    );

    response = await window.fetch(
      `/api/learner-profiles/${encodeURIComponent(bob.id)}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "last_learner" });
    assert.equal(learners.snapshot().activeProfileId, null);
  });

  it("shares the browser mock learner roster while keeping two session selections independent", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-account-session-split",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-account-session-split-contract",
    );
    const learners = window.__parrotE2eLearners;
    assert.equal(typeof learners?.openSession, "function");
    const miaSession = learners.openSession("task5-mia-session");
    const noahSession = learners.openSession("task5-noah-session");

    let response = await noahSession.fetch(
      "/api/learner-profiles/learner-noah/active",
      { method: "PUT" },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).activeProfileId, "learner-noah");
    assert.equal(
      (await (await miaSession.fetch("/api/learner-profiles")).json())
        .activeProfileId,
      "learner-mia",
    );

    miaSession.failNextLearnerDelete();
    response = await miaSession.fetch(
      "/api/learner-profiles/learner-noah",
      { method: "DELETE" },
    );
    assert.equal(response.status, 503);
    const pendingForMia = await (
      await miaSession.fetch("/api/learner-profiles")
    ).json();
    const pendingForNoah = await (
      await noahSession.fetch("/api/learner-profiles")
    ).json();
    assert.equal(pendingForMia.activeProfileId, "learner-mia");
    assert.equal(pendingForNoah.activeProfileId, null);
    assert.equal(
      pendingForNoah.profiles.find(({ id }) => id === "learner-noah")
        ?.deletionPending,
      true,
    );
    response = await noahSession.fetch(
      "/api/learner-profiles/learner-noah/active",
      { method: "PUT" },
    );
    assert.equal(response.status, 404);

    response = await miaSession.fetch(
      "/api/learner-profiles/learner-noah",
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).profiles.map(({ id }) => id),
      ["learner-mia"],
    );
    assert.equal(noahSession.snapshot().activeProfileId, null);
    assert.equal(miaSession.snapshot().activeProfileId, "learner-mia");

    response = await noahSession.fetch(
      "/api/learner-profiles/learner-noah",
      { method: "DELETE" },
    );
    assert.equal(response.status, 404);
    response = await miaSession.fetch(
      "/api/learner-profiles/learner-mia",
      { method: "DELETE" },
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "last_learner" });
  });

  it("keeps Guardian access isolated between browser-mock sessions", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=learner&parrotE2eSession=task5-guardian-page&parrotE2eAccount=task5-guardian-session-account",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-guardian-session-contract",
    );
    const learners = window.__parrotE2eLearners;
    const sessionA = learners.openSession("task5-guardian-a");
    const sessionB = learners.openSession("task5-guardian-b");

    assert.equal(
      (
        await window.fetch("/api/guardian-access", {
          method: "DELETE",
        })
      ).status,
      200,
    );
    const unlockA = await sessionA.fetch("/api/guardian-access", {
      body: JSON.stringify({ password: "e2e-guardian-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const afterUnlock = {
      a: (await sessionA.fetch("/api/profile")).status,
      b: (await sessionB.fetch("/api/profile")).status,
      page: (await window.fetch("/api/profile")).status,
    };
    const lockB = await sessionB.fetch("/api/guardian-access", {
      method: "DELETE",
    });
    const afterBLock = {
      a: (await sessionA.fetch("/api/profile")).status,
      b: (await sessionB.fetch("/api/profile")).status,
      page: (await window.fetch("/api/profile")).status,
    };

    assert.deepEqual(
      {
        afterBLock,
        afterUnlock,
        lockB: lockB.status,
        unlockA: unlockA.status,
      },
      {
        afterBLock: { a: 200, b: 403, page: 403 },
        afterUnlock: { a: 200, b: 403, page: 403 },
        lockB: 200,
        unlockA: 200,
      },
    );
  });

  it("does not let a delayed targeted mock write resurrect a deleted learner", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-stale-target&parrotE2eAccount=task5-stale-target-account",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-stale-target-contract",
    );
    const learners = window.__parrotE2eLearners;
    const staleSession = learners.openSession("task5-stale-writer");
    const deletingSession = learners.openSession("task5-concurrent-deleter");
    const bodyStarted = deferred();
    const releaseBody = deferred();
    const request = new Request(
      new URL(
        "/api/profile?learnerProfileId=learner-noah",
        window.location.href,
      ),
      {
        body: JSON.stringify({ answers: { name: "Noah changed" } }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    Object.defineProperty(request, "clone", {
      configurable: true,
      value: () => ({
        json: async () => {
          bodyStarted.resolve();
          return releaseBody.promise;
        },
      }),
    });

    const staleWrite = staleSession.fetch(request);
    await bodyStarted.promise;
    let response = await deletingSession.fetch(
      "/api/learner-profiles/learner-noah",
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).profiles.map(({ id }) => id),
      ["learner-mia"],
    );

    releaseBody.resolve({ answers: { name: "Noah changed" } });
    response = await staleWrite;
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    const finalRoster = await (
      await deletingSession.fetch("/api/learner-profiles")
    ).json();
    assert.deepEqual(
      finalRoster.profiles.map(({ id, name }) => ({ id, name })),
      [{ id: "learner-mia", name: "Mia" }],
    );
    assert.equal(staleSession.snapshot("learner-noah").profiles.length, 1);
  });

  function deleteStoredMockLearnerDuringHandleRefresh(profileId) {
    const storage = window.localStorage;
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "localStorage",
    );
    const accountKey = Array.from(
      { length: storage.length },
      (_, index) => storage.key(index),
    ).find((key) => {
      if (!key?.startsWith("parrot-e2e-learners:account:")) return false;
      try {
        return Array.isArray(JSON.parse(storage.getItem(key))?.learners);
      } catch {
        return false;
      }
    });
    assert.ok(accountKey);
    let accountReadsBeforeDeletion = 2;
    const interceptingStorage = new Proxy(storage, {
      get(target, property) {
        if (property === "getItem") {
          return (key) => {
            const value = target.getItem(key);
            if (key === accountKey && value !== null) {
              accountReadsBeforeDeletion -= 1;
            }
            if (accountReadsBeforeDeletion === 0 && value !== null) {
              accountReadsBeforeDeletion = -1;
              const account = JSON.parse(value);
              account.learners = account.learners.filter(
                ([id]) => id !== profileId,
              );
              target.setItem(key, JSON.stringify(account));
            }
            return value;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: interceptingStorage,
    });
    globalThis.localStorage = interceptingStorage;
    return () => {
      globalThis.localStorage = storage;
      if (localStorageDescriptor) {
        Object.defineProperty(window, "localStorage", localStorageDescriptor);
      }
    };
  }

  it("does not let a delayed mock art mutation resurrect a deleted learner", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-stale-art&parrotE2eAccount=task5-stale-art-account",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-stale-art-contract",
    );
    const session = window.__parrotE2eLearners.openSession(
      "task5-stale-art-writer",
    );
    const restoreStorage = deleteStoredMockLearnerDuringHandleRefresh(
      "learner-noah",
    );

    try {
      const response = await session.fetch(
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah",
        { method: "POST" },
      );
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      const roster = await (
        await session.fetch("/api/learner-profiles")
      ).json();
      assert.deepEqual(
        roster.profiles.map(({ id }) => id),
        ["learner-mia"],
      );
    } finally {
      restoreStorage();
    }
  });

  it("does not let a delayed mock consent read resurrect a deleted learner", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-stale-consent&parrotE2eAccount=task5-stale-consent-account",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-stale-consent-contract",
    );
    const session = window.__parrotE2eLearners.openSession(
      "task5-stale-consent-reader",
    );
    const restoreStorage = deleteStoredMockLearnerDuringHandleRefresh(
      "learner-noah",
    );

    try {
      const response = await session.fetch(
        "/api/lesson-recordings/consent?learnerProfileId=learner-noah",
      );
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      const roster = await (
        await session.fetch("/api/learner-profiles")
      ).json();
      assert.deepEqual(
        roster.profiles.map(({ id }) => id),
        ["learner-mia"],
      );
    } finally {
      restoreStorage();
    }
  });

  it("does not let a stale lesson-upload mismatch resurrect a deleted learner", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-stale-upload-mismatch&parrotE2eAccount=task5-stale-upload-mismatch-account",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-stale-upload-mismatch-contract",
    );
    const session = window.__parrotE2eLearners.openSession(
      "task5-stale-upload-mismatch-writer",
    );
    const restoreStorage = deleteStoredMockLearnerDuringHandleRefresh(
      "learner-noah",
    );

    try {
      const response = await session.fetch(
        "/api/lesson-recordings/parrot/lesson-one/scenes/0/steps/0?learnerProfileId=learner-noah",
        {
          body: new Blob(["stale mismatch audio"], { type: "audio/webm" }),
          headers: {
            "Content-Type": "audio/webm",
            "X-Parrot-Expected-Learner-Profile": "learner-mia",
          },
          method: "PUT",
        },
      );
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      const roster = await (
        await session.fetch("/api/learner-profiles")
      ).json();
      assert.deepEqual(
        roster.profiles.map(({ id }) => id),
        ["learner-mia"],
      );
    } finally {
      restoreStorage();
    }
  });

  it("does not let held mock upload settlement resurrect a deleted learner", async () => {
    window.history.replaceState(
      null,
      "",
      "/?parrotE2eLearners=multiple&parrotE2eGuardian=guardian&parrotE2eSession=task5-held-upload&parrotE2eAccount=task5-held-upload-account&parrotE2eLesson=upload-held",
    );
    globalThis.localStorage = window.localStorage;
    globalThis.sessionStorage = window.sessionStorage;
    await vite.ssrLoadModule(
      "/src/testing/e2e-browser-mocks.ts?task5-held-upload-contract",
    );
    const learners = window.__parrotE2eLearners;
    let response = await window.fetch(
      "/api/profile/lesson-recording-consent?learnerProfileId=learner-noah",
      {
        body: JSON.stringify({ enabled: true }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    assert.equal(response.status, 200);
    const heldUpload = window.fetch(
      "/api/lesson-recordings/parrot/lesson-one/scenes/0/steps/0?learnerProfileId=learner-noah",
      {
        body: new Blob(["held audio"], { type: "audio/webm" }),
        headers: {
          "Content-Type": "audio/webm",
          "X-Parrot-Expected-Learner-Profile": "learner-noah",
        },
        method: "PUT",
      },
    );
    await waitFor(() =>
      assert.equal(
        learners.snapshot("learner-noah").lessonRecording.pendingUploads,
        1,
      ),
    );
    const deletingSession = learners.openSession(
      "task5-held-upload-deleter",
    );
    response = await deletingSession.fetch(
      "/api/learner-profiles/learner-noah",
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal(window.__parrotE2eLessonMedia.resolveNextUpload(), true);
    response = await heldUpload;
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    const roster = await (
      await deletingSession.fetch("/api/learner-profiles")
    ).json();
    assert.deepEqual(
      roster.profiles.map(({ id }) => id),
      ["learner-mia"],
    );

    response = await window.fetch("/api/learner-profiles", {
      body: JSON.stringify({ activate: false, name: "Bob" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const bob = (await response.json()).profiles.find(
      ({ name }) => name === "Bob",
    );
    assert.ok(bob);
    response = await window.fetch(
      `/api/profile/lesson-recording-consent?learnerProfileId=${encodeURIComponent(bob.id)}`,
      {
        body: JSON.stringify({ enabled: true }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    assert.equal(response.status, 200);
    const rejectedUpload = window.fetch(
      `/api/lesson-recordings/parrot/lesson-two/scenes/0/steps/0?learnerProfileId=${encodeURIComponent(bob.id)}`,
      {
        body: new Blob(["held audio"], { type: "audio/webm" }),
        headers: {
          "Content-Type": "audio/webm",
          "X-Parrot-Expected-Learner-Profile": bob.id,
        },
        method: "PUT",
      },
    );
    await waitFor(() =>
      assert.equal(
        learners.snapshot(bob.id).lessonRecording.pendingUploads,
        1,
      ),
    );
    response = await deletingSession.fetch(
      `/api/learner-profiles/${encodeURIComponent(bob.id)}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal(window.__parrotE2eLessonMedia.rejectNextUpload(), true);
    response = await rejectedUpload;
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    const finalRoster = await (
      await deletingSession.fetch("/api/learner-profiles")
    ).json();
    assert.deepEqual(
      finalRoster.profiles.map(({ id }) => id),
      ["learner-mia"],
    );
  });
});
