import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  useClearProfileAccountAction,
  useAccountSessionIdentity,
  useProfileAccountAction,
} from "../auth/account-actions";
import { selectConversationPurpose } from "../../lib/conversation-purpose";
import {
  createLearnerProfile as createLearnerProfileRequest,
  deleteLearnerProfile as deleteLearnerProfileRequest,
  loadLearnerProfile,
  loadLearnerProfiles,
  loadProfile,
  LearnerProfileApiError,
  LearnerProfileDeletionError,
  saveLearnerProfileAnswer,
  saveLessonRecordingConsent,
  saveProfileAnswer,
  saveProfileAnswers,
  selectLearnerProfile as selectLearnerProfileRequest,
  skipLearnerProfile,
  skipLearnerProfileQuestion,
  transcribeLearnerProfileAudio,
  type FullLearnerProfileState,
  type LearnerProfileSummary,
  type LearnerProfileAcknowledgment as Acknowledgment,
  type LearnerProfileQuestion,
  type LearnerProfileRoster,
  type LearnerProfileState,
  type ProfileState,
} from "./learner-profile-api";
import { LearnerProfileAcknowledgment } from "./LearnerProfileAcknowledgment";
import {
  LearnerProfileCard,
  LearnerProfilePeppaArt,
  LearnerProfileScreen,
  LearnerProfileStepHeading,
  LearnerProfileStatusCard,
} from "./LearnerProfileLayout";
import {
  LearnerProfileQuestionView,
  captureLearnerProfileAnswer,
  playLearnerProfileStart,
  replayLearnerProfileQuestion,
  type QuestionPendingAction,
  type QuestionStatus,
} from "./LearnerProfileQuestion";
import { ProfileEditorView } from "./ProfileEditor";
import { isAbortError } from "../media/audio-playback";
import { recordSpeechClip } from "../media/speech-recorder";
import type { ConversationSurface as ConversationSurfaceComponent } from "../conversation/ConversationSurface";
import {
  selectLearnerProfileExperience,
  usePeppaConversation,
} from "../conversation/usePeppaConversation";
import { ActionButton, TextButton } from "../shared/ui";
import {
  LearnerProfileProvider,
  LearnerSelectionProvider,
} from "./LearnerProfileContext";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
const LEARNER_SELECTION_CHANNEL_PREFIX = "parrot-learner-selection";
const LEARNER_SELECTION_CHANGED_MESSAGE = "changed";
const LEARNER_SELECTION_STORAGE_SUFFIX = ":state";
const LEARNER_SELECTION_PENDING_SEPARATOR = ":pending:";
const LEARNER_SELECTION_PUBLICATION_SEPARATOR = ":publication:";
const LEARNER_SELECTION_PUBLICATION_JOURNAL_SUFFIX = ":publication-journal";
const LEARNER_SELECTION_PUBLICATION_JOURNAL_LIMIT = 32;
const LEARNER_DELETION_LOCK_SUFFIX = ":learner-deletion";
const LEARNER_SELECTION_WINDOW_EVENT = "parrot-learner-selection-signal";
const AUTHENTIC_LEARNER_SELECTION_WINDOW_EVENTS = new WeakSet<Event>();

async function sha256Hex(value: string) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    return null;
  }
  try {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

async function learnerSelectionChannelName(identity: string) {
  const scope = await sha256Hex(identity);
  return scope === null ? null : `${LEARNER_SELECTION_CHANNEL_PREFIX}-${scope}`;
}

function learnerSelectionMarker() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // A unique fallback is sufficient for cross-tab change coalescing.
  }
  return `${Date.now()}-${Math.random()}`;
}

function learnerSelectionPendingStorageKey(scope: string, token: string) {
  return `${scope}${LEARNER_SELECTION_PENDING_SEPARATOR}${token}`;
}

function learnerSelectionPendingToken(scope: string, storageKey: string) {
  const prefix = `${scope}${LEARNER_SELECTION_PENDING_SEPARATOR}`;
  return storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : null;
}

function learnerSelectionPublicationStorageKey(scope: string, token: string) {
  return `${scope}${LEARNER_SELECTION_PUBLICATION_SEPARATOR}${token}`;
}

function learnerSelectionPublicationJournalStorageKey(scope: string) {
  return `${scope}${LEARNER_SELECTION_PUBLICATION_JOURNAL_SUFFIX}`;
}

function learnerDeletionLockName(scope: string) {
  return `${scope}${LEARNER_DELETION_LOCK_SUFFIX}`;
}

function learnerDeletionLockManager() {
  try {
    return typeof globalThis.navigator?.locks?.request === "function"
      ? globalThis.navigator.locks
      : null;
  } catch {
    return null;
  }
}

type LearnerDeletionPublication = {
  marker: string;
  previousMarker: string | null;
  status: "notified" | "prepared" | "published";
  token: string;
  version: 1;
};

type LearnerDeletionPublicationJournal = {
  entries: Array<{ marker: string; token: string }>;
  version: 1;
};

function validLearnerDeletionPublicationValue(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function storedLearnerDeletionPublicationJournal(scope: string) {
  try {
    const value = window.localStorage.getItem(
      learnerSelectionPublicationJournalStorageKey(scope),
    );
    if (value === null) return { status: "absent" as const, value: null };
    const candidate: unknown = JSON.parse(value);
    if (candidate === null || typeof candidate !== "object") {
      return { status: "invalid" as const, value: null };
    }
    const journal = candidate as Partial<LearnerDeletionPublicationJournal>;
    if (
      journal.version !== 1 ||
      !Array.isArray(journal.entries) ||
      journal.entries.length > LEARNER_SELECTION_PUBLICATION_JOURNAL_LIMIT ||
      journal.entries.some(
        (entry) =>
          entry === null ||
          typeof entry !== "object" ||
          !validLearnerDeletionPublicationValue(entry.marker) ||
          !validLearnerDeletionPublicationValue(entry.token),
      )
    ) {
      return { status: "invalid" as const, value: null };
    }
    return {
      status: "valid" as const,
      value: journal as LearnerDeletionPublicationJournal,
    };
  } catch {
    return { status: "unavailable" as const, value: null };
  }
}

function learnerDeletionPublicationJournalHas(
  scope: string,
  token: string,
  marker: string,
) {
  const journal = storedLearnerDeletionPublicationJournal(scope);
  return (
    journal.status === "valid" &&
    journal.value.entries.some(
      (entry) => entry.token === token && entry.marker === marker,
    )
  );
}

function storeLearnerDeletionPublicationJournal(
  scope: string,
  token: string,
  marker: string,
) {
  const stored = storedLearnerDeletionPublicationJournal(scope);
  if (stored.status === "invalid" || stored.status === "unavailable") {
    return false;
  }
  const entries = stored.status === "valid" ? stored.value.entries : [];
  const sameToken = entries.find((entry) => entry.token === token);
  if (sameToken && sameToken.marker !== marker) return false;
  const nextEntries = sameToken
    ? entries
    : [...entries, { marker, token }].slice(
        -LEARNER_SELECTION_PUBLICATION_JOURNAL_LIMIT,
      );
  try {
    window.localStorage.setItem(
      learnerSelectionPublicationJournalStorageKey(scope),
      JSON.stringify({ entries: nextEntries, version: 1 }),
    );
  } catch {
    return false;
  }
  const verified = storedLearnerDeletionPublicationJournal(scope);
  return (
    verified.status === "valid" &&
    verified.value.entries.length === nextEntries.length &&
    verified.value.entries.every(
      (entry, index) =>
        entry.marker === nextEntries[index]?.marker &&
        entry.token === nextEntries[index]?.token,
    )
  );
}

function learnerDeletionPublicationMarker(
  marker: string,
  previousMarker: string | null,
  status: LearnerDeletionPublication["status"],
  token: string,
) {
  return JSON.stringify({ marker, previousMarker, status, token, version: 1 });
}

function storedLearnerDeletionPublication(scope: string, token: string) {
  try {
    const value = window.localStorage.getItem(
      learnerSelectionPublicationStorageKey(scope, token),
    );
    if (value === null) return { status: "absent" as const, value: null };
    const candidate: unknown = JSON.parse(value);
    if (candidate === null || typeof candidate !== "object") {
      return { status: "invalid" as const, value: null };
    }
    const publication = candidate as Partial<LearnerDeletionPublication>;
    if (
      publication.version !== 1 ||
      publication.token !== token ||
      typeof publication.marker !== "string" ||
      publication.marker.length === 0 ||
      publication.marker.length > 128 ||
      !(
        publication.previousMarker === null ||
        (typeof publication.previousMarker === "string" &&
          publication.previousMarker.length > 0 &&
          publication.previousMarker.length <= 128)
      ) ||
      (publication.status !== "prepared" &&
        publication.status !== "published" &&
        publication.status !== "notified")
    ) {
      return { status: "invalid" as const, value: null };
    }
    return {
      status: "valid" as const,
      value: publication as LearnerDeletionPublication,
    };
  } catch {
    return { status: "unavailable" as const, value: null };
  }
}

function removeOrphanedLearnerDeletionPublications(scope: string) {
  const prefix = `${scope}${LEARNER_SELECTION_PUBLICATION_SEPARATOR}`;
  try {
    const journal = storedLearnerDeletionPublicationJournal(scope);
    if (journal.status !== "valid") return;
    const journalIsFull =
      journal.value.entries.length ===
      LEARNER_SELECTION_PUBLICATION_JOURNAL_LIMIT;
    const orphaned: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      const token = storageKey.slice(prefix.length);
      const publication = token
        ? storedLearnerDeletionPublication(scope, token)
        : null;
      if (
        token &&
        publication?.status === "valid" &&
        (journalIsFull ||
          journal.value.entries.some(
            (entry) =>
              entry.token === token &&
              entry.marker === publication.value.marker,
          )) &&
        window.localStorage.getItem(
          learnerSelectionPendingStorageKey(scope, token),
        ) === null
      ) {
        orphaned.push(storageKey);
      }
    }
    for (const storageKey of orphaned) window.localStorage.removeItem(storageKey);
  } catch {
    // A later scope initialization can retry best-effort orphan cleanup.
  }
}

function storedLearnerSelectionMarker(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function compareStoredLearnerSelectionMarker(
  storageKey: string,
  marker: string,
) {
  try {
    return window.localStorage.getItem(storageKey) === marker
      ? "match"
      : "different";
  } catch {
    return "unavailable";
  }
}

function storeLearnerSelectionMarker(storageKey: string, marker: string) {
  try {
    window.localStorage.setItem(storageKey, marker);
    return true;
  } catch {
    // Focus and visibility revalidation remain the authoritative fallback.
    return false;
  }
}

function removeLearnerSelectionMarker(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
    return window.localStorage.getItem(storageKey) === null;
  } catch {
    // The peer remains fail-closed when durable cleanup is unavailable.
    return false;
  }
}

type LearnerDeletionRecovery = {
  attemptId: string;
  changeMarker: string | null;
  operation: "delete-learner";
  profileId: string;
  token: string;
  version: 2;
};

type StoredLearnerSelectionPending = {
  recovery: LearnerDeletionRecovery | null;
  status: "pending" | "uncertain";
};

function validLearnerDeletionRecoveryProfileId(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new TextEncoder().encode(value).byteLength <= 128;
  } catch {
    return false;
  }
}

function learnerDeletionRecovery(
  profileId: string,
  token: string,
): LearnerDeletionRecovery {
  return {
    attemptId: learnerSelectionMarker(),
    changeMarker: null,
    operation: "delete-learner",
    profileId,
    token,
    version: 2,
  };
}

function learnerSelectionPendingMarker(
  status: "pending" | "uncertain",
  recovery: LearnerDeletionRecovery | null,
) {
  return recovery === null
    ? status
    : JSON.stringify({ ...recovery, status });
}

function parseLearnerSelectionPending(
  value: string | null,
  token: string,
): StoredLearnerSelectionPending {
  if (value === "pending" || value === "uncertain") {
    return { recovery: null, status: value };
  }
  try {
    const candidate: unknown = value === null ? null : JSON.parse(value);
    if (candidate === null || typeof candidate !== "object") {
      return { recovery: null, status: "uncertain" };
    }
    const marker = candidate as Partial<LearnerDeletionRecovery> & {
      status?: unknown;
    };
    if (
      marker.version !== 2 ||
      marker.operation !== "delete-learner" ||
      marker.token !== token ||
      typeof marker.attemptId !== "string" ||
      marker.attemptId.length === 0 ||
      marker.attemptId.length > 128 ||
      !validLearnerDeletionRecoveryProfileId(marker.profileId) ||
      !(
        marker.changeMarker === null ||
        (typeof marker.changeMarker === "string" &&
          marker.changeMarker.length > 0 &&
          marker.changeMarker.length <= 128)
      ) ||
      (marker.status !== "pending" && marker.status !== "uncertain")
    ) {
      return { recovery: null, status: "uncertain" };
    }
    return {
      recovery: {
        attemptId: marker.attemptId,
        changeMarker: marker.changeMarker,
        operation: "delete-learner",
        profileId: marker.profileId,
        token,
        version: 2,
      },
      status: marker.status,
    };
  } catch {
    return { recovery: null, status: "uncertain" };
  }
}

function sameLearnerDeletionAttempt(
  left: LearnerDeletionRecovery,
  right: LearnerDeletionRecovery,
) {
  return (
    left.attemptId === right.attemptId &&
    left.changeMarker === right.changeMarker &&
    left.profileId === right.profileId &&
    left.token === right.token
  );
}

function compareStoredLearnerDeletionAttempt(
  pending: LearnerSelectionPendingMutation,
) {
  if (pending.recovery === null) return "match";
  try {
    const stored = parseLearnerSelectionPending(
      window.localStorage.getItem(pending.storageKey),
      pending.token,
    ).recovery;
    return stored !== null &&
      sameLearnerDeletionAttempt(stored, pending.recovery)
      ? "match"
      : "different";
  } catch {
    return "unavailable";
  }
}

function storedLearnerSelectionPendingEntries(
  scope: string,
): Map<string, StoredLearnerSelectionPending> | null {
  const pending = new Map<string, StoredLearnerSelectionPending>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (storageKey === null) continue;
      const token = learnerSelectionPendingToken(scope, storageKey);
      if (!token) continue;
      pending.set(
        token,
        parseLearnerSelectionPending(
          window.localStorage.getItem(storageKey),
          token,
        ),
      );
    }
    return pending;
  } catch {
    return null;
  }
}

function storedLearnerSelectionPending(
  scope: string,
): Map<string, "pending" | "uncertain"> | null {
  const entries = storedLearnerSelectionPendingEntries(scope);
  return entries === null
    ? null
    : new Map(
        [...entries].map(([token, { status }]) => [token, status] as const),
      );
}

function learnerMutationOutcome(
  error: unknown,
  requestStarted: boolean,
  responseReceived: boolean,
): "committed" | "rejected" | "uncertain" | "not-started" {
  if (!requestStarted) return "not-started";
  if (responseReceived) return "committed";
  if (error instanceof LearnerProfileApiError) {
    if (error.status >= 200 && error.status < 300) return "committed";
    if (error.status >= 400 && error.status < 500) return "rejected";
  }
  return "uncertain";
}

function hasSameActiveLearner(
  current: LearnerProfileState | null,
  next: LearnerProfileState,
) {
  if (current === null) return false;
  if (current.mode === "full" || next.mode === "full") {
    return (
      current.mode === "full" &&
      next.mode === "full" &&
      current.profile.id === next.profile.id
    );
  }
  return current.mode === next.mode;
}

const LazyConversationSurface = import.meta.env.SSR
  ? (await import("../conversation/ConversationSurface")).ConversationSurface
  : lazy(() =>
      import("../conversation/ConversationSurface").then(
        ({ ConversationSurface }) => ({ default: ConversationSurface }),
      ),
    );

type QuestionProps = ComponentProps<typeof LearnerProfileQuestionView>;
type ProfileEditorProps = ComponentProps<typeof ProfileEditorView>;
type ConversationProps = ComponentProps<typeof ConversationSurfaceComponent>;

type ActiveQuestionOperation = {
  controller: AbortController;
  operation: number;
  owner: Exclude<QuestionPendingAction, null>;
};

type ActiveQuestionPlayback = {
  controller: AbortController;
  operation: number;
};

type QuestionPresentation = {
  pendingAction: QuestionPendingAction;
  status: QuestionStatus;
};

type LearnerIdentityCheck = "checking" | "confirmed" | "failed";

type LearnerSelectionPendingMutation = {
  recovery: LearnerDeletionRecovery | null;
  scope: string;
  storageKey: string;
  token: string;
};

type LearnerSelectionReadSnapshot = {
  marker: string | null;
  scope: string | null;
};

class LearnerSelectionReadChangedError extends Error {}

const IDLE_QUESTION_PRESENTATION: QuestionPresentation = {
  pendingAction: null,
  status: "idle",
};

function ConversationSurface(props: ConversationProps) {
  return (
    <Suspense
      fallback={
        <LearnerProfileScreen>
          <LearnerProfileStatusCard aria-busy="true" role="status">
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Loading voice chat…
            </p>
          </LearnerProfileStatusCard>
        </LearnerProfileScreen>
      }
    >
      <LazyConversationSurface {...props} />
    </Suspense>
  );
}

type AcknowledgmentView = {
  acknowledgment: Acknowledgment;
  operationId: number;
};

type LearnerProfileGateViewProps = {
  acknowledgment: AcknowledgmentView | null;
  children: ReactNode;
  completedLearnerProfileFallback: ReactNode;
  conversationProps: ConversationProps | null;
  data: LearnerProfileState | null;
  guardianDashboardRoute?: boolean;
  guardianRoute?: boolean;
  guardianSelectionFallback?: ReactNode;
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  learnerManagerRoute?: boolean;
  isProfileFormRedo: boolean;
  isProfileLoading: boolean;
  isProfileRoute: boolean;
  isLoading: boolean;
  loadError: string;
  onAcknowledgmentNext: () => void;
  onCloseConversationRoute: () => void;
  onCloseGuardianRoute?: () => void;
  onCloseProfileRoute: () => void;
  onRetry: () => void;
  onRetryProfile: () => void;
  onSkip: () => void;
  onStart: () => void;
  learnerProfileFallback: ReactNode;
  profileEditor: ProfileEditorProps | null;
  profileLoadError: string;
  profileQuestionProps: QuestionProps | null;
  questionProps: QuestionProps | null;
  redoLearnerProfile: boolean;
  started: boolean;
};

function LearnerProfileSetupView({
  answeredQuestionCount,
  onSkip,
  onStart,
  questionCount,
}: {
  answeredQuestionCount: number;
  onSkip: () => void;
  onStart: () => void;
  questionCount: number;
}) {
  const isResuming = answeredQuestionCount > 0;
  const visibleQuestionCount = isResuming
    ? questionCount - answeredQuestionCount
    : questionCount;

  return (
    <LearnerProfileCard className="grid justify-items-center gap-4 p-7 text-center short:gap-2 short:p-4 short-wide:grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.25fr)] short-wide:grid-rows-[auto_auto_auto] short-wide:items-center short-wide:gap-x-5 short-wide:px-6 short-wide:py-4 short-wide:text-left sm:p-12">
      <LearnerProfilePeppaArt
        alt="Peppa waving hello"
        className="aspect-square max-h-56 w-36 animate-float object-contain drop-shadow-lg motion-reduce:animate-none short:w-20 short-wide:col-start-1 short-wide:row-span-3 short-wide:row-start-1 short-wide:w-full short-wide:max-w-44 sm:w-52"
        sizes="(min-width: 640px) 13rem, 9rem"
      />
      <LearnerProfileStepHeading
        className="m-0 text-3xl leading-none text-brand-ink short-wide:col-start-2 short-wide:row-start-1 short-wide:max-w-[17rem] short-wide:justify-self-start sm:text-5xl short:text-3xl"
        stepKey="setup"
      >
        Answer {visibleQuestionCount}
        {isResuming ? " more" : ""}{" "}
        {visibleQuestionCount === 1 ? "question" : "questions"}
      </LearnerProfileStepHeading>
      <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600 short-wide:col-start-2 short-wide:row-start-2">
        We save your answers.{" "}
        <span className="whitespace-nowrap">A grown-up</span> can change your{" "}
        <span className="whitespace-nowrap">name and age.</span>
      </p>
      <div className="grid justify-items-center gap-1 short-wide:col-start-2 short-wide:row-start-3 short-wide:flex short-wide:items-center short-wide:justify-self-start short-wide:gap-4">
        <ActionButton onClick={onStart} type="button">
          {isResuming ? "Continue questions" : "Start questions"}
        </ActionButton>
        <TextButton onClick={onSkip} type="button">
          Skip for now
        </TextButton>
      </div>
    </LearnerProfileCard>
  );
}

export function LearnerProfileGateView({
  acknowledgment,
  children,
  completedLearnerProfileFallback,
  conversationProps,
  data,
  guardianDashboardRoute = false,
  guardianRoute = false,
  guardianSelectionFallback,
  isConversationRoute,
  isLearnerProfileRoute,
  learnerManagerRoute = false,
  isProfileFormRedo,
  isProfileLoading,
  isProfileRoute,
  isLoading,
  loadError,
  onAcknowledgmentNext,
  onCloseConversationRoute,
  onCloseGuardianRoute,
  onCloseProfileRoute,
  onRetry,
  onRetryProfile,
  onSkip,
  onStart,
  learnerProfileFallback,
  profileEditor,
  profileLoadError,
  profileQuestionProps,
  questionProps,
  redoLearnerProfile,
  started,
}: LearnerProfileGateViewProps) {
  const fullData = data?.mode === "full" ? data : null;
  const learnerProfileComplete = Boolean(
    fullData &&
    (fullData.canBypass || fullData.profile.profileStatus === "completed"),
  );
  const canAccessProtectedRoutes = Boolean(
    guardianRoute || data?.mode === "bypass-only" || learnerProfileComplete,
  );
  const canEditProfile = Boolean(fullData && guardianRoute);

  if (guardianRoute && isLearnerProfileRoute && !redoLearnerProfile) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if (guardianRoute && learnerManagerRoute) {
    return <>{children}</>;
  }

  if (
    guardianRoute &&
    isLearnerProfileRoute &&
    redoLearnerProfile &&
    data?.mode === "bypass-only"
  ) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if (guardianRoute && data?.mode === "bypass-only") {
    return <>{guardianSelectionFallback ?? completedLearnerProfileFallback}</>;
  }

  if (isLoading) {
    return (
      <LearnerProfileScreen>
        <LearnerProfileStatusCard aria-busy="true" role="status">
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            {isConversationRoute
              ? "Getting Peppa ready…"
              : "Loading your questions…"}
          </p>
        </LearnerProfileStatusCard>
      </LearnerProfileScreen>
    );
  }

  if (loadError) {
    if (guardianRoute && guardianDashboardRoute) return <>{children}</>;
    return (
      <LearnerProfileScreen>
        <LearnerProfileStatusCard role="alert">
          <h1 className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl">
            {isConversationRoute
              ? "Peppa is taking a break"
              : "Questions are taking a break"}
          </h1>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            {loadError}
          </p>
          <div className="mt-2 flex items-center justify-end gap-4 max-sm:w-full max-sm:justify-between">
            {redoLearnerProfile || guardianRoute ? (
              <TextButton
                onClick={
                  guardianRoute && !redoLearnerProfile
                    ? (onCloseGuardianRoute ?? onCloseProfileRoute)
                    : onCloseProfileRoute
                }
                type="button"
              >
                Back
              </TextButton>
            ) : isConversationRoute ? (
              <TextButton onClick={onCloseConversationRoute} type="button">
                Back to home
              </TextButton>
            ) : (
              <TextButton onClick={onSkip} type="button">
                Skip for now
              </TextButton>
            )}
            <ActionButton onClick={onRetry} type="button">
              Retry
            </ActionButton>
          </div>
        </LearnerProfileStatusCard>
      </LearnerProfileScreen>
    );
  }

  if (data?.mode === "selection-required") {
    if (!guardianRoute) {
      return (
        <LearnerProfileScreen>
          <LearnerProfileStatusCard role="status">
            <h1 className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl">
              Ask a grown-up to choose a learner
            </h1>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              A grown-up can use the account menu to choose a learner for this
              device.
            </p>
          </LearnerProfileStatusCard>
        </LearnerProfileScreen>
      );
    }
    if (learnerManagerRoute) return <>{children}</>;
    return <>{guardianSelectionFallback ?? learnerProfileFallback}</>;
  }

  if (acknowledgment) {
    return (
      <LearnerProfileScreen>
        <LearnerProfileAcknowledgment
          acknowledgment={acknowledgment.acknowledgment}
          onNext={onAcknowledgmentNext}
          operationId={acknowledgment.operationId}
        />
      </LearnerProfileScreen>
    );
  }

  if (data && !canAccessProtectedRoutes && !isLearnerProfileRoute) {
    return <>{learnerProfileFallback}</>;
  }

  if (
    canAccessProtectedRoutes &&
    isLearnerProfileRoute &&
    !redoLearnerProfile
  ) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if (canAccessProtectedRoutes && isProfileRoute && !canEditProfile) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if ((isProfileRoute || isProfileFormRedo) && canEditProfile) {
    if (isProfileLoading) {
      return (
        <LearnerProfileScreen>
          <LearnerProfileStatusCard aria-busy="true" role="status">
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Loading your profile…
            </p>
          </LearnerProfileStatusCard>
        </LearnerProfileScreen>
      );
    }

    if (profileLoadError) {
      return (
        <LearnerProfileScreen>
          <LearnerProfileStatusCard role="alert">
            <h1 className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl">
              Profile is taking a break
            </h1>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              {profileLoadError}
            </p>
            <div className="mt-2 flex items-center justify-end gap-4 max-sm:w-full max-sm:justify-between">
              <TextButton onClick={onCloseProfileRoute} type="button">
                Back
              </TextButton>
              <ActionButton onClick={onRetryProfile} type="button">
                Retry
              </ActionButton>
            </div>
          </LearnerProfileStatusCard>
        </LearnerProfileScreen>
      );
    }

    if (isProfileFormRedo && profileQuestionProps) {
      return (
        <LearnerProfileScreen>
          <LearnerProfileQuestionView {...profileQuestionProps} />
        </LearnerProfileScreen>
      );
    }

    if (profileEditor) return <ProfileEditorView {...profileEditor} />;

    return (
      <LearnerProfileScreen>
        <LearnerProfileStatusCard aria-busy="true" role="status">
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Loading your profile…
          </p>
        </LearnerProfileStatusCard>
      </LearnerProfileScreen>
    );
  }

  if (
    fullData &&
    canAccessProtectedRoutes &&
    isConversationRoute &&
    conversationProps
  ) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (fullData && redoLearnerProfile && conversationProps) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (canAccessProtectedRoutes) {
    return <>{children}</>;
  }

  if (fullData && conversationProps) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (fullData && !started) {
    return (
      <LearnerProfileScreen>
        <LearnerProfileSetupView
          answeredQuestionCount={fullData.progress.answered}
          onSkip={onSkip}
          onStart={onStart}
          questionCount={fullData.progress.total}
        />
      </LearnerProfileScreen>
    );
  }

  if (questionProps) {
    return (
      <LearnerProfileScreen>
        <LearnerProfileQuestionView {...questionProps} />
      </LearnerProfileScreen>
    );
  }

  return (
    <LearnerProfileScreen>
      <LearnerProfileStatusCard aria-busy="true" role="status">
        <p className="m-0 font-bold leading-relaxed text-slate-600">
          Finishing your profile…
        </p>
      </LearnerProfileStatusCard>
    </LearnerProfileScreen>
  );
}

type ProfileWithAnswers = Pick<
  LearnerProfileSummary,
  "age" | "answers" | "name"
>;

export function answerForQuestion(
  profile: ProfileWithAnswers,
  question: Pick<LearnerProfileQuestion, "answerKey">,
) {
  const saved = profile.answers.responses[question.answerKey]?.rawAnswer;
  if (saved) return saved;
  if (question.answerKey === "name") return profile.name ?? "";
  if (question.answerKey === "age") return profile.age?.toString() ?? "";
  return "";
}

export function shouldSyncActiveQuestion(
  profile: ProfileWithAnswers | null,
  question: Pick<LearnerProfileQuestion, "answerKey"> | null,
) {
  return Boolean(profile && question);
}

export function profileDraftsFromState(profileState: ProfileState) {
  return {
    name: profileState.profile.name ?? "",
    age: profileState.profile.age?.toString() ?? "",
    description: profileState.profile.description ?? "",
    ...Object.fromEntries(
      profileState.questions
        .filter(
          ({ answerKey }) =>
            !["name", "age", "description"].includes(answerKey),
        )
        .map(({ answerKey }) => [
          answerKey,
          profileState.profile.answers.responses[answerKey]?.rawAnswer ?? "",
        ]),
    ),
  };
}

export function updateProfileDraft(
  drafts: Record<string, string>,
  answerKey: string,
  value: string,
) {
  return { ...drafts, [answerKey]: value };
}

export function nextProfileAcknowledgment(
  acknowledgments: Acknowledgment[],
  currentIndex: number,
) {
  const index = currentIndex + 1;
  return index < acknowledgments.length
    ? { acknowledgment: acknowledgments[index], index }
    : null;
}

export async function saveQuestionAndAdvance({
  questionKey,
  rawAnswer,
  save = saveLearnerProfileAnswer,
  signal,
}: {
  questionKey: string;
  rawAnswer: string;
  save?: typeof saveLearnerProfileAnswer;
  signal?: AbortSignal;
}) {
  return save(questionKey, rawAnswer, signal ? { signal } : undefined);
}

function readableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function requireRosterActiveProfile(
  roster: LearnerProfileRoster,
  expectedProfileId?: string,
) {
  const activeProfileId = roster.activeProfileId;
  if (
    activeProfileId === null ||
    (expectedProfileId !== undefined && activeProfileId !== expectedProfileId)
  ) {
    throw new Error("The selected learner could not be loaded.");
  }
  const profile = roster.profiles.find(({ id }) => id === activeProfileId);
  if (!profile) {
    throw new Error("The selected learner could not be loaded.");
  }
  return profile;
}

function throwIfLearnerMutationAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("The learner change was cancelled.", "AbortError");
  }
}

type PendingAcknowledgment =
  | {
      kind: "learner-profile";
      operationId: number;
      acknowledgment: Acknowledgment;
      next: LearnerProfileState;
    }
  | {
      kind: "profile";
      controller: AbortController;
      operationId: number;
      acknowledgments: Acknowledgment[];
      index: number;
      next: ProfileState;
    };

export function createProfileOperationBoundary(nextOperation: () => number) {
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      return { controller, operation: nextOperation() };
    },
    cancel() {
      activeController?.abort();
      activeController = null;
    },
    finish(controller: AbortController) {
      if (activeController === controller) activeController = null;
    },
  };
}

type ProfileOperation = {
  controller: AbortController;
  operation: number;
};

export function createProfileOperationOwnership({
  getCurrentOperation,
  initialIsProfileRoute,
}: {
  getCurrentOperation: () => number;
  initialIsProfileRoute: boolean;
}) {
  let isMounted = true;
  let isProfileRoute = initialIsProfileRoute;

  return {
    isActive() {
      return isMounted && isProfileRoute;
    },
    isCurrent({ controller, operation }: ProfileOperation) {
      return (
        isMounted &&
        isProfileRoute &&
        !controller.signal.aborted &&
        getCurrentOperation() === operation
      );
    },
    mount() {
      isMounted = true;
    },
    setProfileRoute(nextIsProfileRoute: boolean) {
      isProfileRoute = nextIsProfileRoute;
    },
    unmount() {
      isMounted = false;
    },
  };
}

export function teardownProfileOperationResources({
  boundary,
  invalidateOperation,
  resetLoadOperation,
}: {
  boundary: ReturnType<typeof createProfileOperationBoundary> | null;
  invalidateOperation: () => void;
  resetLoadOperation: () => void;
}) {
  invalidateOperation();
  boundary?.cancel();
  resetLoadOperation();
}

export function createProfileRouteLifecycle(
  initialIsProfileRoute: boolean,
  { onExit }: { onExit: () => void },
) {
  let isProfileRoute = initialIsProfileRoute;
  let exitHandled = false;

  return {
    markExitHandled() {
      exitHandled = true;
    },
    update(nextIsProfileRoute: boolean): "entered" | "exited" | null {
      if (nextIsProfileRoute === isProfileRoute) return null;

      const exited = isProfileRoute;
      isProfileRoute = nextIsProfileRoute;
      if (exited) {
        if (exitHandled) exitHandled = false;
        else onExit();
        return "exited";
      }
      return "entered";
    },
  };
}

type LearnerProfileGateProps = {
  children: ReactNode;
  completedLearnerProfileFallback: ReactNode;
  guardianDashboardRoute?: boolean;
  guardianRoute?: boolean;
  guardianSelectionFallback?: ReactNode;
  guardianUnlockDestination?: string;
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  isProfileRoute: boolean;
  learnerManagerRoute?: boolean;
  learnerProfileFallback: ReactNode;
  onCloseGuardianRoute?: () => void;
  onCloseProfileRoute: () => void;
  onConversationCompleted: () => void;
  onOpenLessons: () => void;
  onOpenProfileRoute: () => void;
  onRedoCompleted: () => void;
  onRedoLearnerProfileRoute: () => void;
  redoLearnerProfile: boolean;
};

export function LearnerProfileGate({
  children,
  completedLearnerProfileFallback,
  guardianDashboardRoute = false,
  guardianRoute = false,
  guardianSelectionFallback,
  guardianUnlockDestination,
  isConversationRoute,
  isLearnerProfileRoute,
  isProfileRoute,
  learnerManagerRoute = false,
  learnerProfileFallback,
  onCloseGuardianRoute,
  onCloseProfileRoute,
  onConversationCompleted,
  onOpenLessons,
  onOpenProfileRoute,
  onRedoCompleted,
  onRedoLearnerProfileRoute,
  redoLearnerProfile,
}: LearnerProfileGateProps) {
  const clearProfileAccountAction = useClearProfileAccountAction();
  const sessionIdentity = useAccountSessionIdentity();
  const learnerSelectionSignal = useMemo(
    () => ({
      scope:
        sessionIdentity === null
          ? Promise.resolve<string | null>(null)
          : learnerSelectionChannelName(sessionIdentity),
    }),
    [sessionIdentity],
  );
  const [data, setData] = useState<LearnerProfileState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [learnerIdentityCheck, setLearnerIdentityCheck] =
    useState<LearnerIdentityCheck>(
      sessionIdentity === null ? "confirmed" : "checking",
    );
  const [rosterRevision, setRosterRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const [useFormFallback, setUseFormFallback] = useState(false);
  const [redoQuestionIndex, setRedoQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [fieldErrorIsAnswer, setFieldErrorIsAnswer] = useState(false);
  const [questionPresentation, setQuestionPresentation] =
    useState<QuestionPresentation>(IDLE_QUESTION_PRESENTATION);
  const [questionPlaybackPending, setQuestionPlaybackPending] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, string>>(
    {},
  );
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Record<string, string>
  >({});
  const [profilePageError, setProfilePageError] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [pendingAcknowledgment, setPendingAcknowledgment] =
    useState<PendingAcknowledgment | null>(null);
  const operationRef = useRef(0);
  const dataRef = useRef<LearnerProfileState | null>(data);
  const learnerIdentityCheckRef =
    useRef<LearnerIdentityCheck>(learnerIdentityCheck);
  const profileMutationPendingRef = useRef(false);
  const learnerLoadControllerRef = useRef<AbortController | null>(null);
  const expectedLearnerReloadControllerRef = useRef<AbortController | null>(
    null,
  );
  const learnerRevalidationControllerRef = useRef<AbortController | null>(null);
  const learnerRevalidationQueuedRef = useRef(false);
  const learnerRevalidationRef = useRef<Promise<void> | null>(null);
  const learnerSelectionChannelRef = useRef<{
    channel: BroadcastChannel;
    scope: string;
  } | null>(null);
  const learnerSelectionScopeRef = useRef<string | null>(null);
  const learnerSelectionScopeReadyRef = useRef(sessionIdentity === null);
  const initialLearnerLoadSettledRef = useRef(false);
  const learnerSelectionMarkerRef = useRef<string | null>(null);
  const learnerSelectionAcceptedMarkersRef = useRef<Set<string>>(new Set());
  const learnerSelectionWindowSenderRef = useRef(learnerSelectionMarker());
  const learnerSelectionPendingRef = useRef<
    Map<string, "pending" | "uncertain">
  >(new Map());
  const learnerSelectionLocallyNonblockingRef = useRef<
    Map<string, string | null>
  >(new Map());
  const learnerMutationControllerRef = useRef<AbortController | null>(null);
  const learnerMutationTailRef = useRef<Promise<void>>(Promise.resolve());
  const learnerDeletionRecoveryRef = useRef<Promise<void> | null>(null);
  const gateMountedRef = useRef(false);
  const gateMountEpochRef = useRef(0);
  const questionOperationRef = useRef<ActiveQuestionOperation | null>(null);
  const questionPlaybackRef = useRef<ActiveQuestionPlayback | null>(null);
  const profileLoadOperationRef = useRef<number | null>(null);
  const profileOperationBoundaryRef = useRef<ReturnType<
    typeof createProfileOperationBoundary
  > | null>(null);
  const profileOperationOwnershipRef = useRef<ReturnType<
    typeof createProfileOperationOwnership
  > | null>(null);
  const profileRouteLifecycleRef = useRef<ReturnType<
    typeof createProfileRouteLifecycle
  > | null>(null);
  dataRef.current = data;
  learnerIdentityCheckRef.current = learnerIdentityCheck;

  const acceptLearnerSelectionMarker = useCallback(
    (scope: string, marker: string) => {
      if (learnerSelectionAcceptedMarkersRef.current.has(marker)) return false;
      learnerSelectionAcceptedMarkersRef.current.add(marker);
      learnerSelectionMarkerRef.current = marker;
      if (
        gateMountedRef.current &&
        learnerSelectionScopeRef.current === scope
      ) {
        setRosterRevision((current) => current + 1);
      }
      return true;
    },
    [],
  );

  const excludeLocallyNonblockingLearnerMutations = useCallback(
    (pending: Map<string, "pending" | "uncertain">) => {
      for (const [token, attemptId] of
        learnerSelectionLocallyNonblockingRef.current) {
        try {
          const stored = parseLearnerSelectionPending(
            window.localStorage.getItem(
              learnerSelectionPendingStorageKey(
                learnerSelectionScopeRef.current ?? "",
                token,
              ),
            ),
            token,
          ).recovery;
          if (
            (attemptId === null && stored === null) ||
            stored?.attemptId === attemptId
          ) {
            pending.delete(token);
          } else {
            learnerSelectionLocallyNonblockingRef.current.delete(token);
          }
        } catch {
          learnerSelectionLocallyNonblockingRef.current.delete(token);
        }
      }
      return pending;
    },
    [],
  );

  const updateLearnerIdentityCheck = useCallback(
    (next: LearnerIdentityCheck) => {
      learnerIdentityCheckRef.current = next;
      setLearnerIdentityCheck(next);
    },
    [],
  );

  const captureLearnerSelectionRead =
    useCallback((): LearnerSelectionReadSnapshot => {
      const scope = learnerSelectionScopeRef.current;
      return {
        marker:
          scope === null
            ? null
            : storedLearnerSelectionMarker(
                `${scope}${LEARNER_SELECTION_STORAGE_SUFFIX}`,
              ),
        scope,
      };
    }, []);

  const learnerSelectionReadStatus = useCallback(
    (
      snapshot: LearnerSelectionReadSnapshot,
    ): "changed" | "current" | "pending" => {
      const scope = learnerSelectionScopeRef.current;
      if (scope !== snapshot.scope) return "changed";
      if (scope === null) return "current";
      const pending = storedLearnerSelectionPending(scope);
      if (pending === null) return "changed";
      for (const [token] of pending) {
        if (learnerSelectionPendingRef.current.get(token) === "uncertain") {
          pending.set(token, "uncertain");
        }
      }
      learnerSelectionPendingRef.current =
        excludeLocallyNonblockingLearnerMutations(pending);
      if (pending.size > 0) return "pending";
      return storedLearnerSelectionMarker(
        `${scope}${LEARNER_SELECTION_STORAGE_SUFFIX}`,
      ) === snapshot.marker
        ? "current"
        : "changed";
    },
    [excludeLocallyNonblockingLearnerMutations],
  );

  const loadStableLearnerProfile = useCallback(
    async (signal: AbortSignal) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const snapshot = captureLearnerSelectionRead();
        const next = await loadLearnerProfile({ signal });
        if (signal.aborted) {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
        const status = learnerSelectionReadStatus(snapshot);
        if (status === "current") return { next, snapshot };
        if (status === "pending" || attempt === 1) {
          throw new LearnerSelectionReadChangedError(
            "The current learner changed while it was loading. Try again.",
          );
        }
      }
      throw new LearnerSelectionReadChangedError(
        "The current learner changed while it was loading. Try again.",
      );
    },
    [captureLearnerSelectionRead, learnerSelectionReadStatus],
  );

  const assertLearnerSelectionReadCurrent = useCallback(
    (snapshot: LearnerSelectionReadSnapshot) => {
      if (learnerSelectionReadStatus(snapshot) !== "current") {
        throw new LearnerSelectionReadChangedError(
          "The current learner changed while it was loading. Try again.",
        );
      }
    },
    [learnerSelectionReadStatus],
  );

  const fullData: FullLearnerProfileState | null =
    data?.mode === "full" ? data : null;
  const selectedExperience = fullData
    ? selectLearnerProfileExperience(fullData.experienceMode, useFormFallback)
    : "form";
  const isFormRedoRoute = Boolean(
    redoLearnerProfile &&
    isLearnerProfileRoute &&
    fullData &&
    selectedExperience === "form",
  );
  const profileRouteActive = isProfileRoute || isFormRedoRoute;

  const nextOperation = useCallback(() => {
    operationRef.current += 1;
    return operationRef.current;
  }, []);

  const replaceProfile = useCallback((profile: LearnerProfileSummary) => {
    setData((current) =>
      current?.mode === "full" && current.profile.id === profile.id
        ? { ...current, profile }
        : current,
    );
    setProfileState((current) =>
      current?.profile.id === profile.id
        ? {
            ...current,
            profile: {
              ...profile,
              lessonRecordingCleanupPending:
                current.profile.lessonRecordingCleanupPending,
              lessonRecordingConsent: current.profile.lessonRecordingConsent,
            },
          }
        : current,
    );
  }, []);

  if (!profileOperationBoundaryRef.current) {
    profileOperationBoundaryRef.current =
      createProfileOperationBoundary(nextOperation);
  }

  if (!profileOperationOwnershipRef.current) {
    profileOperationOwnershipRef.current = createProfileOperationOwnership({
      getCurrentOperation: () => operationRef.current,
      initialIsProfileRoute: isProfileRoute,
    });
  }
  profileOperationOwnershipRef.current.setProfileRoute(profileRouteActive);

  const teardownProfileResources = useCallback(() => {
    teardownProfileOperationResources({
      boundary: profileOperationBoundaryRef.current,
      invalidateOperation: nextOperation,
      resetLoadOperation: () => {
        profileLoadOperationRef.current = null;
      },
    });
  }, [nextOperation]);

  const clearProfileEditor = useCallback(() => {
    teardownProfileResources();
    profileMutationPendingRef.current = false;
    const playback = questionPlaybackRef.current;
    questionPlaybackRef.current = null;
    playback?.controller.abort();
    const operation = questionOperationRef.current;
    questionOperationRef.current = null;
    operation?.controller.abort();
    setRedoQuestionIndex(0);
    setDraft("");
    setFieldError("");
    setFieldErrorIsAnswer(false);
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
    setQuestionPlaybackPending(false);
    setProfileState(null);
    setProfileDrafts({});
    setProfileFieldErrors({});
    setProfilePageError("");
    setIsProfileSaving(false);
    setIsProfileLoading(false);
    setProfileLoadError("");
  }, [teardownProfileResources]);

  const isCurrentOperation = useCallback(
    (operation: number) => operationRef.current === operation,
    [],
  );

  const abortQuestionPlayback = useCallback(
    (resetPresentation = true) => {
      const active = questionPlaybackRef.current;
      if (!active) return;
      questionPlaybackRef.current = null;
      active.controller.abort();
      if (isCurrentOperation(active.operation)) nextOperation();
      if (resetPresentation) setQuestionPlaybackPending(false);
    },
    [isCurrentOperation, nextOperation],
  );

  const abortQuestionOperation = useCallback(
    (resetPresentation = true) => {
      const active = questionOperationRef.current;
      if (!active) return;
      questionOperationRef.current = null;
      active.controller.abort();
      if (isCurrentOperation(active.operation)) nextOperation();
      if (resetPresentation) {
        setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
      }
    },
    [isCurrentOperation, nextOperation],
  );

  const beginQuestionOperation = useCallback(
    (
      owner: Exclude<QuestionPendingAction, null>,
      status: Exclude<QuestionStatus, "idle" | "ready">,
    ) => {
      if (learnerIdentityCheckRef.current !== "confirmed") return null;
      if (questionOperationRef.current) return null;
      abortQuestionPlayback();
      const active: ActiveQuestionOperation = {
        controller: new AbortController(),
        operation: nextOperation(),
        owner,
      };
      questionOperationRef.current = active;
      setFieldError("");
      setFieldErrorIsAnswer(false);
      setQuestionPresentation({ pendingAction: owner, status });
      return active;
    },
    [abortQuestionPlayback, nextOperation],
  );

  const beginQuestionPlayback = useCallback(() => {
    if (learnerIdentityCheckRef.current !== "confirmed") return null;
    if (questionOperationRef.current || questionPlaybackRef.current) {
      return null;
    }
    const active: ActiveQuestionPlayback = {
      controller: new AbortController(),
      operation: nextOperation(),
    };
    questionPlaybackRef.current = active;
    setQuestionPlaybackPending(true);
    return active;
  }, [nextOperation]);

  const isCurrentQuestionPlayback = useCallback(
    (active: ActiveQuestionPlayback) =>
      questionPlaybackRef.current === active &&
      !active.controller.signal.aborted &&
      isCurrentOperation(active.operation),
    [isCurrentOperation],
  );

  const finishQuestionPlayback = useCallback(
    (active: ActiveQuestionPlayback) => {
      if (questionPlaybackRef.current !== active) return false;
      questionPlaybackRef.current = null;
      setQuestionPlaybackPending(false);
      return (
        !active.controller.signal.aborted &&
        isCurrentOperation(active.operation)
      );
    },
    [isCurrentOperation],
  );

  const isCurrentQuestionOperation = useCallback(
    (active: ActiveQuestionOperation) =>
      questionOperationRef.current === active &&
      !active.controller.signal.aborted &&
      isCurrentOperation(active.operation),
    [isCurrentOperation],
  );

  const updateQuestionOperation = useCallback(
    (
      active: ActiveQuestionOperation,
      status: Exclude<QuestionStatus, "idle" | "ready">,
    ) => {
      if (!isCurrentQuestionOperation(active)) return;
      setQuestionPresentation({ pendingAction: active.owner, status });
    },
    [isCurrentQuestionOperation],
  );

  const finishQuestionOperation = useCallback(
    (active: ActiveQuestionOperation, status: "idle" | "ready" = "idle") => {
      if (questionOperationRef.current !== active) return false;
      questionOperationRef.current = null;
      if (
        active.controller.signal.aborted ||
        !isCurrentOperation(active.operation)
      ) {
        return false;
      }
      setQuestionPresentation({ pendingAction: null, status });
      return true;
    },
    [isCurrentOperation],
  );

  const isCurrentProfileOperation = useCallback(
    (profileOperation: ProfileOperation) =>
      profileOperationOwnershipRef.current?.isCurrent(profileOperation) ??
      false,
    [],
  );

  const isActiveProfileRoute = useCallback(
    () => profileOperationOwnershipRef.current?.isActive() ?? false,
    [],
  );

  useIsomorphicLayoutEffect(() => {
    const ownership = profileOperationOwnershipRef.current;
    gateMountedRef.current = true;
    gateMountEpochRef.current += 1;
    ownership?.mount();
    return () => {
      gateMountedRef.current = false;
      gateMountEpochRef.current += 1;
      learnerMutationControllerRef.current?.abort();
      learnerMutationControllerRef.current = null;
      learnerRevalidationControllerRef.current?.abort();
      learnerRevalidationControllerRef.current = null;
      learnerRevalidationRef.current = null;
      learnerRevalidationQueuedRef.current = false;
      learnerSelectionPendingRef.current.clear();
      learnerSelectionLocallyNonblockingRef.current.clear();
      expectedLearnerReloadControllerRef.current = null;
      ownership?.unmount();
      abortQuestionPlayback(false);
      abortQuestionOperation(false);
      teardownProfileResources();
    };
  }, [abortQuestionOperation, abortQuestionPlayback, teardownProfileResources]);

  useIsomorphicLayoutEffect(() => {
    if (!isLearnerProfileRoute) {
      abortQuestionPlayback();
      abortQuestionOperation();
      setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
    }
  }, [abortQuestionOperation, abortQuestionPlayback, isLearnerProfileRoute]);

  const startActiveLearnerLoad = useCallback(
    (expectedProfileId?: string) => {
      const requiresExpectedProfile = expectedProfileId !== undefined;
      const operation = nextOperation();
      learnerLoadControllerRef.current?.abort();
      const controller = new AbortController();
      learnerLoadControllerRef.current = controller;
      setIsLoading(true);
      setLoadError("");
      const promise = (async () => {
        try {
          const { next, snapshot } = await loadStableLearnerProfile(
            controller.signal,
          );
          if (controller.signal.aborted || !isCurrentOperation(operation)) {
            return null;
          }
          assertLearnerSelectionReadCurrent(snapshot);
          if (next.mode === "selection-required") {
            setIsLoading(false);
            if (requiresExpectedProfile) {
              throw new Error("The selected learner could not be loaded.");
            }
            dataRef.current = next;
            setData(next);
            return null;
          }
          if (
            requiresExpectedProfile &&
            (next.mode !== "full" || next.profile.id !== expectedProfileId)
          ) {
            throw new Error("The selected learner could not be loaded.");
          }
          setIsLoading(false);
          dataRef.current = next;
          setData(next);
          return next.mode === "full" ? next.profile : null;
        } catch (error) {
          if (controller.signal.aborted || !isCurrentOperation(operation)) {
            return null;
          }
          if (isAbortError(error)) return null;
          setLoadError(readableError(error));
          setIsLoading(false);
          throw error;
        } finally {
          if (learnerLoadControllerRef.current === controller) {
            learnerLoadControllerRef.current = null;
          }
        }
      })();
      return { controller, promise };
    },
    [
      assertLearnerSelectionReadCurrent,
      isCurrentOperation,
      loadStableLearnerProfile,
      nextOperation,
    ],
  );

  const refresh = useCallback(async () => {
    try {
      await startActiveLearnerLoad().promise;
    } catch {
      // The load helper publishes the safe error state for the gate.
    }
  }, [startActiveLearnerLoad]);

  useEffect(() => {
    initialLearnerLoadSettledRef.current = false;
    const request = startActiveLearnerLoad();
    let identityReadWasStable = true;
    void request.promise
      .catch((error) => {
        if (error instanceof LearnerSelectionReadChangedError) {
          identityReadWasStable = false;
          updateLearnerIdentityCheck("failed");
        }
      })
      .finally(() => {
        initialLearnerLoadSettledRef.current = true;
        if (
          identityReadWasStable &&
          gateMountedRef.current &&
          learnerSelectionScopeReadyRef.current &&
          learnerSelectionPendingRef.current.size === 0 &&
          learnerRevalidationRef.current === null
        ) {
          updateLearnerIdentityCheck("confirmed");
        }
      });
    return () => {
      learnerLoadControllerRef.current?.abort();
      learnerLoadControllerRef.current = null;
    };
  }, [startActiveLearnerLoad, updateLearnerIdentityCheck]);

  const handleConversationBack = useCallback(() => {
    if (isConversationRoute) {
      onConversationCompleted();
      return;
    }
    if (redoLearnerProfile) {
      onRedoCompleted();
      return;
    }
    setUseFormFallback(true);
    setStarted(false);
  }, [
    isConversationRoute,
    onConversationCompleted,
    onRedoCompleted,
    redoLearnerProfile,
  ]);
  const handleConversationCompleted = useCallback(async () => {
    await refresh();
    if (isConversationRoute) {
      onConversationCompleted();
      return;
    }
    if (redoLearnerProfile) onRedoCompleted();
  }, [
    isConversationRoute,
    onConversationCompleted,
    onRedoCompleted,
    redoLearnerProfile,
    refresh,
  ]);
  const conversationRouteAvailable = Boolean(
    isConversationRoute &&
    fullData &&
    (fullData.canBypass || fullData.profile.profileStatus === "completed"),
  );
  const conversationPurpose = selectConversationPurpose({
    isProfileEdit: redoLearnerProfile,
    isSmallChatRoute: isConversationRoute,
  });
  const conversationProps = usePeppaConversation({
    active: Boolean(
      selectedExperience === "realtime" &&
      fullData &&
      (conversationRouteAvailable ||
        (isLearnerProfileRoute &&
          (redoLearnerProfile ||
            (!fullData.canBypass &&
              fullData.profile.profileStatus !== "completed")))),
    ),
    onBack: handleConversationBack,
    onChooseLesson: onOpenLessons,
    onCompleted: handleConversationCompleted,
    purpose: conversationPurpose,
  });

  const resetLearnerSelection = useCallback(() => {
    updateLearnerIdentityCheck("confirmed");
    nextOperation();
    clearProfileAccountAction();
    conversationProps.resetConversation();
    learnerLoadControllerRef.current?.abort();
    learnerLoadControllerRef.current = null;
    learnerRevalidationControllerRef.current?.abort();
    learnerRevalidationControllerRef.current = null;
    learnerRevalidationRef.current = null;
    abortQuestionPlayback();
    abortQuestionOperation();
    clearProfileEditor();
    dataRef.current = null;
    setData(null);
    setIsLoading(false);
    setLoadError("");
    setStarted(false);
    setUseFormFallback(false);
    setDraft("");
    setFieldError("");
    setFieldErrorIsAnswer(false);
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
    setQuestionPlaybackPending(false);
    setPendingAcknowledgment(null);
  }, [
    abortQuestionOperation,
    abortQuestionPlayback,
    clearProfileEditor,
    clearProfileAccountAction,
    conversationProps.resetConversation,
    nextOperation,
    updateLearnerIdentityCheck,
  ]);

  const beginLearnerIdentityCheck = useCallback(() => {
    updateLearnerIdentityCheck("checking");
    clearProfileAccountAction();
    abortQuestionPlayback(false);
    abortQuestionOperation(false);
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
    setQuestionPlaybackPending(false);
    if (profileMutationPendingRef.current) {
      profileMutationPendingRef.current = false;
      teardownProfileResources();
      setIsProfileSaving(false);
    }
  }, [
    abortQuestionOperation,
    abortQuestionPlayback,
    clearProfileAccountAction,
    teardownProfileResources,
    updateLearnerIdentityCheck,
  ]);

  const postLearnerSelectionSignal = useCallback(
    (scope: string, message: object) => {
      try {
        const event = new CustomEvent(LEARNER_SELECTION_WINDOW_EVENT, {
          detail: {
            message,
            scope,
            sender: learnerSelectionWindowSenderRef.current,
          },
        });
        AUTHENTIC_LEARNER_SELECTION_WINDOW_EVENTS.add(event);
        try {
          window.dispatchEvent(event);
        } finally {
          AUTHENTIC_LEARNER_SELECTION_WINDOW_EVENTS.delete(event);
        }
      } catch {
        // Durable storage and the peer channel remain available.
      }
      const activeChannel = learnerSelectionChannelRef.current;
      if (activeChannel?.scope !== scope) return;
      try {
        activeChannel.channel.postMessage(message);
      } catch {
        // Durable storage and lifecycle checks remain available.
      }
    },
    [],
  );

  const learnerSelectionPendingStatus =
    useCallback((): LearnerIdentityCheck => {
      for (const status of learnerSelectionPendingRef.current.values()) {
        if (status === "uncertain") return "failed";
      }
      return "checking";
    }, []);

  const refreshStoredLearnerSelectionPending = useCallback(() => {
    const scope = learnerSelectionScopeRef.current;
    if (scope === null) return learnerSelectionPendingRef.current;
    const stored = storedLearnerSelectionPending(scope);
    if (stored !== null) {
      for (const [token, status] of stored) {
        if (learnerSelectionPendingRef.current.get(token) === "uncertain") {
          stored.set(token, "uncertain");
        } else {
          stored.set(token, status);
        }
      }
      learnerSelectionPendingRef.current =
        excludeLocallyNonblockingLearnerMutations(stored);
    }
    return learnerSelectionPendingRef.current;
  }, [excludeLocallyNonblockingLearnerMutations]);

  const blockForPendingLearnerSelection = useCallback(
    (abortLearnerMutation: boolean) => {
      if (abortLearnerMutation) {
        learnerMutationControllerRef.current?.abort();
      }
      learnerLoadControllerRef.current?.abort();
      learnerLoadControllerRef.current = null;
      learnerRevalidationControllerRef.current?.abort();
      beginLearnerIdentityCheck();
      updateLearnerIdentityCheck(learnerSelectionPendingStatus());
    },
    [
      beginLearnerIdentityCheck,
      learnerSelectionPendingStatus,
      updateLearnerIdentityCheck,
    ],
  );

  const beginLearnerSelectionMutation = useCallback(
    async (
      signal: AbortSignal,
      blockLocal = true,
      deletionProfileId?: string,
    ) => {
      const scope = await learnerSelectionSignal.scope;
      throwIfLearnerMutationAborted(signal);
      if (scope === null) {
        if (sessionIdentity !== null) {
          throw new Error("The learner change could not be started safely.");
        }
        return null;
      }
      if (deletionProfileId !== undefined) {
        const locks = learnerDeletionLockManager();
        if (locks === null) {
          throw new Error("The learner change could not be started safely.");
        }
        try {
          await locks.request(
            learnerDeletionLockName(scope),
            { mode: "exclusive" },
            () => undefined,
          );
        } catch {
          throw new Error("The learner change could not be started safely.");
        }
        throwIfLearnerMutationAborted(signal);
      }
      const token = learnerSelectionMarker();
      const storageKey = learnerSelectionPendingStorageKey(scope, token);
      const recovery =
        deletionProfileId === undefined
          ? null
          : learnerDeletionRecovery(deletionProfileId, token);
      if (
        !storeLearnerSelectionMarker(
          storageKey,
          learnerSelectionPendingMarker("pending", recovery),
        )
      ) {
        throw new Error("The learner change could not be started safely.");
      }
      if (!blockLocal) {
        learnerSelectionLocallyNonblockingRef.current.set(
          token,
          recovery?.attemptId ?? null,
        );
      }
      if (learnerSelectionScopeRef.current === scope && blockLocal) {
        learnerSelectionPendingRef.current.set(token, "pending");
        beginLearnerIdentityCheck();
      }
      postLearnerSelectionSignal(scope, {
        ...(recovery === null ? {} : { attemptId: recovery.attemptId }),
        status: "pending",
        token,
        type: "pending",
      });
      return { recovery, scope, storageKey, token };
    },
    [
      beginLearnerIdentityCheck,
      learnerSelectionSignal,
      postLearnerSelectionSignal,
      sessionIdentity,
    ],
  );

  const markLearnerSelectionMutationUncertainUnlocked = useCallback(
    (pending: LearnerSelectionPendingMutation | null) => {
      if (pending === null) return;
      const failClosedLocally = () => {
        learnerSelectionLocallyNonblockingRef.current.delete(pending.token);
        if (learnerSelectionScopeRef.current !== pending.scope) return;
        learnerSelectionPendingRef.current.set(pending.token, "uncertain");
        blockForPendingLearnerSelection(false);
      };
      if (
        pending.recovery !== null &&
        compareStoredLearnerDeletionAttempt(pending) !== "match"
      ) {
        failClosedLocally();
        return;
      }
      if (
        !storeLearnerSelectionMarker(
          pending.storageKey,
          learnerSelectionPendingMarker("uncertain", pending.recovery),
        ) ||
        (pending.recovery !== null &&
          compareStoredLearnerDeletionAttempt(pending) !== "match")
      ) {
        failClosedLocally();
        return;
      }
      learnerSelectionLocallyNonblockingRef.current.delete(pending.token);
      if (learnerSelectionScopeRef.current === pending.scope) {
        learnerSelectionPendingRef.current.set(pending.token, "uncertain");
        blockForPendingLearnerSelection(false);
      }
      postLearnerSelectionSignal(pending.scope, {
        ...(pending.recovery === null
          ? {}
          : { attemptId: pending.recovery.attemptId }),
        status: "uncertain",
        token: pending.token,
        type: "pending",
      });
    },
    [blockForPendingLearnerSelection, postLearnerSelectionSignal],
  );

  const settleLearnerSelectionMutationUnlocked = useCallback(
    (pending: LearnerSelectionPendingMutation | null, changed: boolean) => {
      if (pending === null) return true;
      let publicationStorageKey: string | null = null;
      let publicationPreviousMarker: string | null = null;
      if (
        pending.recovery !== null &&
        compareStoredLearnerDeletionAttempt(pending) !== "match"
      ) {
        return false;
      }
      if (changed) {
        const stateStorageKey = `${pending.scope}${LEARNER_SELECTION_STORAGE_SUFFIX}`;
        let marker = learnerSelectionMarker();
        let notifyChanged = true;
        let markPublicationNotified = false;
        if (pending.recovery !== null) {
          if (pending.recovery.changeMarker === null) {
            const recovery = { ...pending.recovery, changeMarker: marker };
            if (!storeLearnerSelectionMarker(
              pending.storageKey,
              learnerSelectionPendingMarker("pending", recovery),
            )) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            pending.recovery = recovery;
            if (compareStoredLearnerDeletionAttempt(pending) !== "match") {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
          } else {
            marker = pending.recovery.changeMarker;
          }
          publicationStorageKey = learnerSelectionPublicationStorageKey(
            pending.scope,
            pending.token,
          );
          let publication = storedLearnerDeletionPublication(
            pending.scope,
            pending.token,
          );
          if (
            publication.status === "unavailable" ||
            publication.status === "invalid" ||
            (publication.status === "valid" &&
              publication.value.marker !== marker)
          ) {
            markLearnerSelectionMutationUncertainUnlocked(pending);
            return false;
          }
          if (publication.status === "absent") {
            let previousMarker: string | null;
            try {
              previousMarker = window.localStorage.getItem(stateStorageKey);
            } catch {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            if (
              compareStoredLearnerDeletionAttempt(pending) !== "match" ||
              !storeLearnerSelectionMarker(
                publicationStorageKey,
                learnerDeletionPublicationMarker(
                  marker,
                  previousMarker,
                  "prepared",
                  pending.token,
                ),
              )
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            publication = storedLearnerDeletionPublication(
              pending.scope,
              pending.token,
            );
            if (
              publication.status !== "valid" ||
              publication.value.marker !== marker ||
              publication.value.previousMarker !== previousMarker ||
              publication.value.status !== "prepared"
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
          }
          if (
            publication.status === "valid" &&
            publication.value.status === "prepared"
          ) {
            let currentMarker: string | null;
            try {
              currentMarker = window.localStorage.getItem(stateStorageKey);
            } catch {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            if (
              currentMarker !== marker &&
              currentMarker === publication.value.previousMarker &&
              (!storeLearnerSelectionMarker(stateStorageKey, marker) ||
                compareStoredLearnerSelectionMarker(
                  stateStorageKey,
                  marker,
                ) !== "match")
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            if (
              compareStoredLearnerDeletionAttempt(pending) !== "match" ||
              !storeLearnerSelectionMarker(
                publicationStorageKey,
                learnerDeletionPublicationMarker(
                  marker,
                  publication.value.previousMarker,
                  "published",
                  pending.token,
                ),
              )
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
            publication = storedLearnerDeletionPublication(
              pending.scope,
              pending.token,
            );
            if (
              publication.status !== "valid" ||
              publication.value.marker !== marker ||
              publication.value.status !== "published"
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
          }
          if (publication.status === "valid") {
            publicationPreviousMarker = publication.value.previousMarker;
          }
          notifyChanged =
            publication.value?.status === "published" ||
            publication.value?.status === "notified";
          markPublicationNotified =
            publication.value?.status === "published";
        } else if (
          !storeLearnerSelectionMarker(stateStorageKey, marker) ||
          compareStoredLearnerSelectionMarker(stateStorageKey, marker) !==
            "match"
        ) {
          markLearnerSelectionMutationUncertainUnlocked(pending);
          return false;
        }
        if (notifyChanged) {
          if (
            pending.recovery !== null &&
            compareStoredLearnerDeletionAttempt(pending) !== "match"
          ) {
            return false;
          }
          acceptLearnerSelectionMarker(pending.scope, marker);
          postLearnerSelectionSignal(pending.scope, {
            marker,
            ...(pending.recovery === null ? {} : { token: pending.token }),
            type: LEARNER_SELECTION_CHANGED_MESSAGE,
          });
          if (
            publicationStorageKey !== null &&
            markPublicationNotified &&
            (compareStoredLearnerDeletionAttempt(pending) !== "match" ||
              !storeLearnerSelectionMarker(
                publicationStorageKey,
                learnerDeletionPublicationMarker(
                  marker,
                  publicationPreviousMarker,
                  "notified",
                  pending.token,
                ),
              ))
          ) {
            markLearnerSelectionMutationUncertainUnlocked(pending);
            return false;
          }
          if (publicationStorageKey !== null && markPublicationNotified) {
            const notified = storedLearnerDeletionPublication(
              pending.scope,
              pending.token,
            );
            if (
              notified.status !== "valid" ||
              notified.value.marker !== marker ||
              notified.value.previousMarker !== publicationPreviousMarker ||
              notified.value.status !== "notified"
            ) {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              return false;
            }
          }
        }
        if (
          publicationStorageKey !== null &&
          !storeLearnerDeletionPublicationJournal(
            pending.scope,
            pending.token,
            marker,
          )
        ) {
          markLearnerSelectionMutationUncertainUnlocked(pending);
          return false;
        }
      }
      if (
        pending.recovery !== null &&
        compareStoredLearnerDeletionAttempt(pending) !== "match"
      ) {
        return false;
      }
      if (!removeLearnerSelectionMarker(pending.storageKey)) {
        markLearnerSelectionMutationUncertainUnlocked(pending);
        return false;
      }
      learnerSelectionLocallyNonblockingRef.current.delete(pending.token);
      if (learnerSelectionScopeRef.current === pending.scope) {
        learnerSelectionPendingRef.current.delete(pending.token);
        refreshStoredLearnerSelectionPending();
        if (learnerSelectionPendingRef.current.size === 0) {
          if (learnerMutationControllerRef.current?.signal.aborted) {
            learnerRevalidationQueuedRef.current = true;
          }
        } else {
          blockForPendingLearnerSelection(false);
        }
      }
      postLearnerSelectionSignal(pending.scope, {
        token: pending.token,
        type: "settled",
      });
      if (publicationStorageKey !== null) {
        removeLearnerSelectionMarker(publicationStorageKey);
      }
      return true;
    },
    [
      acceptLearnerSelectionMarker,
      blockForPendingLearnerSelection,
      markLearnerSelectionMutationUncertainUnlocked,
      postLearnerSelectionSignal,
      refreshStoredLearnerSelectionPending,
    ],
  );

  const failLearnerDeletionClosedLocally = useCallback(
    (pending: LearnerSelectionPendingMutation | null) => {
      if (pending === null) return;
      learnerSelectionLocallyNonblockingRef.current.delete(pending.token);
      if (learnerSelectionScopeRef.current !== pending.scope) return;
      learnerSelectionPendingRef.current.set(pending.token, "uncertain");
      blockForPendingLearnerSelection(false);
    },
    [blockForPendingLearnerSelection],
  );

  const runWithLearnerDeletionLock = useCallback(
    async (
      pending: LearnerSelectionPendingMutation | null,
      operation: () => boolean,
    ) => {
      if (pending?.recovery === null || pending === null) return operation();
      const locks = learnerDeletionLockManager();
      if (locks === null) {
        failLearnerDeletionClosedLocally(pending);
        return false;
      }
      try {
        return await locks.request(
          learnerDeletionLockName(pending.scope),
          { mode: "exclusive" },
          operation,
        );
      } catch {
        failLearnerDeletionClosedLocally(pending);
        return false;
      }
    },
    [failLearnerDeletionClosedLocally],
  );

  const markLearnerSelectionMutationUncertain = useCallback(
    async (pending: LearnerSelectionPendingMutation | null) =>
      runWithLearnerDeletionLock(pending, () => {
        markLearnerSelectionMutationUncertainUnlocked(pending);
        return true;
      }),
    [
      markLearnerSelectionMutationUncertainUnlocked,
      runWithLearnerDeletionLock,
    ],
  );

  const settleLearnerSelectionMutation = useCallback(
    async (
      pending: LearnerSelectionPendingMutation | null,
      changed: boolean,
    ) =>
      runWithLearnerDeletionLock(pending, () =>
        settleLearnerSelectionMutationUnlocked(pending, changed),
      ),
    [runWithLearnerDeletionLock, settleLearnerSelectionMutationUnlocked],
  );

  const revalidateActiveLearner = useCallback(
    (restartPending = false) => {
      if (!gateMountedRef.current) return;
      if (refreshStoredLearnerSelectionPending().size > 0) {
        blockForPendingLearnerSelection(true);
        return;
      }
      if (learnerMutationControllerRef.current !== null) {
        learnerRevalidationQueuedRef.current = true;
        return;
      }
      if (learnerRevalidationRef.current !== null) {
        if (!restartPending) return;
        learnerRevalidationControllerRef.current?.abort();
      }
      learnerRevalidationQueuedRef.current = false;

      let controller: AbortController;
      let requestPromise: Promise<void>;
      if (dataRef.current === null) {
        beginLearnerIdentityCheck();
        const request = startActiveLearnerLoad();
        controller = request.controller;
        requestPromise = request.promise
          .then(() => {
            if (
              !controller.signal.aborted &&
              gateMountedRef.current &&
              learnerRevalidationControllerRef.current === controller &&
              refreshStoredLearnerSelectionPending().size === 0
            ) {
              updateLearnerIdentityCheck("confirmed");
            } else if (learnerSelectionPendingRef.current.size > 0) {
              blockForPendingLearnerSelection(false);
            }
          })
          .catch((error) => {
            if (!controller.signal.aborted && !isAbortError(error)) {
              updateLearnerIdentityCheck("failed");
            }
          });
      } else {
        beginLearnerIdentityCheck();
        controller = new AbortController();
        requestPromise = (async () => {
          try {
            const { next, snapshot } = await loadStableLearnerProfile(
              controller.signal,
            );
            if (
              controller.signal.aborted ||
              !gateMountedRef.current ||
              learnerRevalidationControllerRef.current !== controller
            ) {
              return;
            }
            assertLearnerSelectionReadCurrent(snapshot);
            if (refreshStoredLearnerSelectionPending().size > 0) {
              blockForPendingLearnerSelection(false);
              return;
            }
            if (hasSameActiveLearner(dataRef.current, next)) {
              updateLearnerIdentityCheck("confirmed");
              return;
            }
            resetLearnerSelection();
            if (!gateMountedRef.current) return;
            dataRef.current = next;
            setData(next);
            setIsLoading(false);
            setLoadError("");
          } catch (error) {
            if (!controller.signal.aborted && !isAbortError(error)) {
              updateLearnerIdentityCheck("failed");
            }
          }
        })();
      }
      learnerRevalidationControllerRef.current = controller;
      const pending = requestPromise
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          if (learnerRevalidationControllerRef.current === controller) {
            learnerRevalidationControllerRef.current = null;
          }
          if (learnerRevalidationRef.current === pending) {
            learnerRevalidationRef.current = null;
          }
        });
      learnerRevalidationRef.current = pending;
    },
    [
      assertLearnerSelectionReadCurrent,
      beginLearnerIdentityCheck,
      blockForPendingLearnerSelection,
      refreshStoredLearnerSelectionPending,
      resetLearnerSelection,
      loadStableLearnerProfile,
      startActiveLearnerLoad,
      updateLearnerIdentityCheck,
    ],
  );

  useEffect(() => {
    const revalidateWhenVisible = () => {
      if (document.visibilityState === "visible")
        revalidateActiveLearner(false);
    };
    const revalidateOnFocus = () => revalidateActiveLearner(false);
    window.addEventListener("focus", revalidateOnFocus);
    document.addEventListener("visibilitychange", revalidateWhenVisible);
    return () => {
      window.removeEventListener("focus", revalidateOnFocus);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, [revalidateActiveLearner]);

  useEffect(() => {
    learnerSelectionScopeReadyRef.current = sessionIdentity === null;
    learnerSelectionScopeRef.current = null;
    learnerSelectionPendingRef.current.clear();
    learnerSelectionLocallyNonblockingRef.current.clear();
    learnerSelectionMarkerRef.current = null;
    learnerSelectionAcceptedMarkersRef.current.clear();
    if (sessionIdentity === null) {
      if (initialLearnerLoadSettledRef.current) {
        updateLearnerIdentityCheck("confirmed");
      }
      return;
    }
    beginLearnerIdentityCheck();
    let channel: BroadcastChannel | null = null;
    let receiveWindow: ((event: Event) => void) | null = null;
    let receiveStorage: ((event: StorageEvent) => void) | null = null;
    let activeScope: string | null = null;
    let disposed = false;
    void learnerSelectionSignal.scope.then((name) => {
      if (disposed) return;
      learnerSelectionScopeReadyRef.current = true;
      if (name === null) {
        if (initialLearnerLoadSettledRef.current) {
          updateLearnerIdentityCheck("confirmed");
        }
        return;
      }
      activeScope = name;
      learnerSelectionScopeRef.current = name;
      removeOrphanedLearnerDeletionPublications(name);
      const storageKey = `${name}${LEARNER_SELECTION_STORAGE_SUFFIX}`;
      const acceptMarker = (marker: string | null) => {
        if (
          disposed ||
          marker === null ||
          !acceptLearnerSelectionMarker(name, marker)
        )
          return;
        if (refreshStoredLearnerSelectionPending().size === 0) {
          void Promise.resolve().then(() => {
            if (!disposed) revalidateActiveLearner(true);
          });
        } else {
          blockForPendingLearnerSelection(true);
        }
      };
      const acceptPendingChange = (
        token: string,
        status: "pending" | "uncertain" | null,
      ) => {
        const previouslyPending = learnerSelectionPendingRef.current.size > 0;
        const stored = storedLearnerSelectionPending(name);
        if (stored !== null) {
          for (const token of stored.keys()) {
            if (learnerSelectionPendingRef.current.get(token) === "uncertain") {
              stored.set(token, "uncertain");
            }
          }
          learnerSelectionPendingRef.current =
            excludeLocallyNonblockingLearnerMutations(stored);
        } else if (status === null) {
          learnerSelectionPendingRef.current.delete(token);
        } else {
          learnerSelectionPendingRef.current.set(token, status);
        }
        if (learnerSelectionPendingRef.current.size > 0) {
          blockForPendingLearnerSelection(true);
        } else if (previouslyPending) {
          void Promise.resolve().then(() => {
            if (!disposed) revalidateActiveLearner(true);
          });
        }
      };
      receiveStorage = (event) => {
        if (
          event.key === storageKey &&
          event.newValue !== null &&
          storedLearnerSelectionMarker(storageKey) === event.newValue
        ) {
          acceptMarker(event.newValue);
          return;
        }
        if (event.key !== null) {
          const token = learnerSelectionPendingToken(name, event.key);
          if (token !== null) {
            const status =
              event.newValue === null
                ? null
                : parseLearnerSelectionPending(event.newValue, token).status;
            acceptPendingChange(token, status);
          }
        }
      };
      const acceptSignal = (message: unknown) => {
        if (message === LEARNER_SELECTION_CHANGED_MESSAGE) {
          acceptMarker(storedLearnerSelectionMarker(storageKey));
          return;
        }
        if (message === null || typeof message !== "object") return;
        const signal = message as {
          marker?: unknown;
          attemptId?: unknown;
          status?: unknown;
          token?: unknown;
          type?: unknown;
        };
        if (
          signal.type === LEARNER_SELECTION_CHANGED_MESSAGE &&
          typeof signal.marker === "string"
        ) {
          const durableMarker =
            typeof signal.token === "string"
              ? storedLearnerDeletionPublication(name, signal.token)
              : null;
          if (
            compareStoredLearnerSelectionMarker(
              storageKey,
              signal.marker,
            ) !== "match" &&
            !(
              durableMarker?.status === "valid" &&
              durableMarker.value.marker === signal.marker &&
              durableMarker.value.status !== "prepared"
            ) &&
            !(
              typeof signal.token === "string" &&
              learnerDeletionPublicationJournalHas(
                name,
                signal.token,
                signal.marker,
              )
            )
          ) {
            return;
          }
          acceptMarker(signal.marker);
          return;
        }
        if (
          signal.type === "pending" &&
          typeof signal.token === "string" &&
          (signal.status === "pending" || signal.status === "uncertain")
        ) {
          let stored: StoredLearnerSelectionPending;
          try {
            const storedValue = window.localStorage.getItem(
              learnerSelectionPendingStorageKey(name, signal.token),
            );
            if (storedValue === null) return;
            stored = parseLearnerSelectionPending(
              storedValue,
              signal.token,
            );
          } catch {
            return;
          }
          if (
            stored.status !== signal.status ||
            (signal.attemptId !== undefined &&
              (typeof signal.attemptId !== "string" ||
                stored.recovery?.attemptId !== signal.attemptId))
          ) {
            return;
          }
          acceptPendingChange(signal.token, signal.status);
          return;
        }
        if (signal.type === "settled" && typeof signal.token === "string") {
          try {
            if (
              window.localStorage.getItem(
                learnerSelectionPendingStorageKey(name, signal.token),
              ) !== null
            ) {
              return;
            }
          } catch {
            return;
          }
          acceptPendingChange(signal.token, null);
        }
      };
      receiveWindow = (event) => {
        const detail = (event as CustomEvent<unknown>).detail;
        if (detail === null || typeof detail !== "object") return;
        const signal = detail as {
          message?: unknown;
          scope?: unknown;
          sender?: unknown;
        };
        if (
          AUTHENTIC_LEARNER_SELECTION_WINDOW_EVENTS.has(event) &&
          signal.scope === name &&
          typeof signal.sender === "string" &&
          signal.sender !== learnerSelectionWindowSenderRef.current
        ) {
          acceptSignal(signal.message);
        }
      };
      window.addEventListener("storage", receiveStorage);
      window.addEventListener(LEARNER_SELECTION_WINDOW_EVENT, receiveWindow);
      if (typeof globalThis.BroadcastChannel !== "undefined") {
        try {
          channel = new globalThis.BroadcastChannel(name);
          channel.onmessage = (event) => acceptSignal(event.data);
          learnerSelectionChannelRef.current = { channel, scope: name };
        } catch {
          // The durable storage signal remains available.
        }
      }
      const pending = storedLearnerSelectionPending(name);
      if (pending !== null) {
        learnerSelectionPendingRef.current =
          excludeLocallyNonblockingLearnerMutations(
            new Map<string, "uncertain">(
              [...pending.keys()].map((token) => [token, "uncertain"]),
            ),
          );
      }
      if (learnerSelectionPendingRef.current.size > 0) {
        blockForPendingLearnerSelection(true);
        return;
      }
      const storedMarker = storedLearnerSelectionMarker(storageKey);
      if (storedMarker !== null) {
        acceptMarker(storedMarker);
      } else if (initialLearnerLoadSettledRef.current) {
        updateLearnerIdentityCheck("confirmed");
      }
    });
    return () => {
      disposed = true;
      learnerSelectionMarkerRef.current = null;
      learnerSelectionAcceptedMarkersRef.current.clear();
      learnerSelectionScopeReadyRef.current = false;
      if (learnerSelectionScopeRef.current === activeScope) {
        learnerSelectionScopeRef.current = null;
      }
      learnerSelectionPendingRef.current.clear();
      learnerSelectionLocallyNonblockingRef.current.clear();
      if (receiveStorage !== null) {
        window.removeEventListener("storage", receiveStorage);
      }
      if (receiveWindow !== null) {
        window.removeEventListener(
          LEARNER_SELECTION_WINDOW_EVENT,
          receiveWindow,
        );
      }
      if (learnerSelectionChannelRef.current?.channel === channel) {
        learnerSelectionChannelRef.current = null;
      }
      channel?.close();
    };
  }, [
    acceptLearnerSelectionMarker,
    beginLearnerIdentityCheck,
    blockForPendingLearnerSelection,
    excludeLocallyNonblockingLearnerMutations,
    learnerSelectionSignal,
    refreshStoredLearnerSelectionPending,
    revalidateActiveLearner,
    sessionIdentity,
    updateLearnerIdentityCheck,
  ]);

  const reloadSelectedLearner = useCallback(
    async (expectedProfileId: string, allowPendingOwner = false) => {
      if (!expectedProfileId.trim()) {
        throw new Error("The selected learner could not be loaded.");
      }
      if (
        (learnerIdentityCheckRef.current !== "confirmed" &&
          expectedLearnerReloadControllerRef.current === null &&
          !allowPendingOwner) ||
        refreshStoredLearnerSelectionPending().size > 0
      ) {
        throw new DOMException(
          "The learner change was cancelled.",
          "AbortError",
        );
      }
      beginLearnerIdentityCheck();
      const operation = nextOperation();
      learnerLoadControllerRef.current?.abort();
      const controller = new AbortController();
      learnerLoadControllerRef.current = controller;
      expectedLearnerReloadControllerRef.current = controller;
      setLoadError("");
      try {
        const { next, snapshot } = await loadStableLearnerProfile(
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          !gateMountedRef.current ||
          !isCurrentOperation(operation)
        ) {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
        assertLearnerSelectionReadCurrent(snapshot);
        const matchesExpected =
          next.mode === "full" && next.profile.id === expectedProfileId;
        const hasSameLearner = hasSameActiveLearner(dataRef.current, next);
        if (!matchesExpected && hasSameLearner) {
          updateLearnerIdentityCheck("confirmed");
          throw new Error("The selected learner could not be loaded.");
        }
        if (!hasSameLearner) {
          if (learnerLoadControllerRef.current === controller) {
            learnerLoadControllerRef.current = null;
          }
          resetLearnerSelection();
          if (!gateMountedRef.current) {
            throw new DOMException(
              "The learner change was cancelled.",
              "AbortError",
            );
          }
          dataRef.current = next;
          setData(next);
          setIsLoading(false);
          setLoadError("");
        } else {
          dataRef.current = next;
          setData(next);
          setIsLoading(false);
          setLoadError("");
          updateLearnerIdentityCheck("confirmed");
        }
        if (!matchesExpected) {
          throw new Error("The selected learner could not be loaded.");
        }
        return next.profile;
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          if (learnerIdentityCheckRef.current === "checking") {
            updateLearnerIdentityCheck("failed");
          }
        }
        throw error;
      } finally {
        if (learnerLoadControllerRef.current === controller) {
          learnerLoadControllerRef.current = null;
        }
        if (expectedLearnerReloadControllerRef.current === controller) {
          expectedLearnerReloadControllerRef.current = null;
        }
      }
    },
    [
      assertLearnerSelectionReadCurrent,
      beginLearnerIdentityCheck,
      isCurrentOperation,
      loadStableLearnerProfile,
      nextOperation,
      refreshStoredLearnerSelectionPending,
      resetLearnerSelection,
      updateLearnerIdentityCheck,
    ],
  );

  const reconcileLearnerAfterMutation = useCallback(
    async (signal: AbortSignal) => {
      throwIfLearnerMutationAborted(signal);
      resetLearnerSelection();
      try {
        await startActiveLearnerLoad().promise;
      } catch {
        // The active learner stays cleared when reconciliation cannot load it.
      }
      throwIfLearnerMutationAborted(signal);
    },
    [resetLearnerSelection, startActiveLearnerLoad],
  );

  const runLearnerMutation = useCallback(
    <Result,>(operation: (signal: AbortSignal) => Promise<Result>) => {
      const requestedEpoch = gateMountEpochRef.current;
      const queued = learnerMutationTailRef.current.then(async () => {
        if (learnerIdentityCheckRef.current !== "confirmed") {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
        if (
          !gateMountedRef.current ||
          gateMountEpochRef.current !== requestedEpoch
        ) {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
        const controller = new AbortController();
        learnerMutationControllerRef.current = controller;
        try {
          const result = await operation(controller.signal);
          if (
            controller.signal.aborted ||
            !gateMountedRef.current ||
            gateMountEpochRef.current !== requestedEpoch
          ) {
            throw new DOMException(
              "The learner change was cancelled.",
              "AbortError",
            );
          }
          return result;
        } finally {
          if (learnerMutationControllerRef.current === controller) {
            learnerMutationControllerRef.current = null;
            if (learnerRevalidationQueuedRef.current) {
              learnerRevalidationQueuedRef.current = false;
              revalidateActiveLearner(true);
            }
          }
        }
      });
      learnerMutationTailRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [revalidateActiveLearner],
  );

  const selectLearner = useCallback(
    (profileId: string) =>
      runLearnerMutation(async (signal) => {
        if (!profileId.trim()) {
          throw new Error("The selected learner could not be loaded.");
        }
        let pending: LearnerSelectionPendingMutation | null = null;
        let requestStarted = false;
        let responseReceived = false;
        let pendingSettled = false;
        let reconcileWithoutScope = false;
        let revalidateAfterSettlement = false;
        try {
          pending = await beginLearnerSelectionMutation(signal);
          throwIfLearnerMutationAborted(signal);
          requestStarted = true;
          const roster = await selectLearnerProfileRequest(profileId);
          responseReceived = true;
          const selectedProfile = requireRosterActiveProfile(roster, profileId);
          pendingSettled = settleLearnerSelectionMutationUnlocked(
            pending,
            true,
          );
          throwIfLearnerMutationAborted(signal);
          if (!pendingSettled) {
            throw new Error("The learner change could not be verified safely.");
          }
          await reloadSelectedLearner(selectedProfile.id, true);
          return roster;
        } catch (error) {
          if (!pendingSettled) {
            const outcome = learnerMutationOutcome(
              error,
              requestStarted,
              responseReceived,
            );
            if (outcome === "committed") {
              pendingSettled = settleLearnerSelectionMutationUnlocked(
                pending,
                true,
              );
              revalidateAfterSettlement = true;
            } else if (outcome === "rejected") {
              pendingSettled = settleLearnerSelectionMutationUnlocked(
                pending,
                false,
              );
              revalidateAfterSettlement = true;
            } else if (outcome === "uncertain") {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              reconcileWithoutScope = pending === null;
            } else if (pending !== null) {
              settleLearnerSelectionMutationUnlocked(pending, false);
            }
          }
          if (
            !signal.aborted &&
            pendingSettled &&
            revalidateAfterSettlement &&
            refreshStoredLearnerSelectionPending().size === 0
          ) {
            learnerRevalidationQueuedRef.current = true;
          } else if (!signal.aborted && reconcileWithoutScope) {
            await reconcileLearnerAfterMutation(signal);
          }
          throw error;
        }
      }),
    [
      beginLearnerSelectionMutation,
      markLearnerSelectionMutationUncertainUnlocked,
      reconcileLearnerAfterMutation,
      refreshStoredLearnerSelectionPending,
      reloadSelectedLearner,
      runLearnerMutation,
      settleLearnerSelectionMutationUnlocked,
    ],
  );

  const performLearnerDeletion = useCallback(
    async (
      profileId: string,
      pending: LearnerSelectionPendingMutation | null,
      activeProfileIdAtStart: string | null,
      signal: AbortSignal | null,
    ) => {
      const uncertainError = () =>
        new LearnerProfileDeletionError(
          "learner_deletion_uncertain",
          "We couldn't confirm whether this learner was deleted. Refresh learner profiles before trying again.",
        );
      const settle = async (changed: boolean) => {
        if (!(await settleLearnerSelectionMutation(pending, changed))) {
          failLearnerDeletionClosedLocally(pending);
          throw uncertainError();
        }
      };
      const reconcileActiveDeletion = async () => {
        if (
          activeProfileIdAtStart !== profileId ||
          signal?.aborted ||
          !gateMountedRef.current
        ) {
          return;
        }
        resetLearnerSelection();
        try {
          await startActiveLearnerLoad().promise;
        } catch {
          // A deleted active learner stays cleared when its safe state cannot reload.
        }
      };

      let deleteRoster: LearnerProfileRoster | null = null;
      let deleteError: unknown = null;
      try {
        deleteRoster = await deleteLearnerProfileRequest(profileId);
      } catch (error) {
        if (
          error instanceof LearnerProfileApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          !(error.status === 404 && error.code === "not_found")
        ) {
          await settle(false);
          throw error;
        }
        deleteError = error;
      }

      if (
        deleteRoster !== null &&
        !deleteRoster.profiles.some(({ id }) => id === profileId)
      ) {
        await settle(true);
        await reconcileActiveDeletion();
        return deleteRoster;
      }
      if (deleteError === null) {
        deleteError = new LearnerProfileApiError(
          200,
          "invalid_roster",
          "The learner deletion response could not be verified.",
        );
      }

      let roster: LearnerProfileRoster;
      try {
        roster = await loadLearnerProfiles();
      } catch {
        await markLearnerSelectionMutationUncertain(pending);
        throw uncertainError();
      }

      const target = roster.profiles.find(({ id }) => id === profileId);
      if (!target) {
        await settle(true);
        await reconcileActiveDeletion();
        return roster;
      }
      if (target.deletionPending) {
        await settle(true);
        await reconcileActiveDeletion();
        throw new LearnerProfileDeletionError(
          "learner_deletion_pending",
          "Learner cleanup is still in progress. Try again.",
          roster,
        );
      }

      await settle(false);
      throw deleteError;
    },
    [
      failLearnerDeletionClosedLocally,
      markLearnerSelectionMutationUncertain,
      resetLearnerSelection,
      settleLearnerSelectionMutation,
      startActiveLearnerLoad,
    ],
  );

  const deleteLearner = useCallback(
    (profileId: string) =>
      runLearnerMutation(async (signal) => {
        if (!profileId.trim()) {
          throw new Error("The learner could not be deleted.");
        }
        const activeProfileIdAtStart =
          dataRef.current?.mode === "full"
            ? dataRef.current.profile.id
            : null;
        const pending = await beginLearnerSelectionMutation(
          signal,
          false,
          profileId,
        );
        throwIfLearnerMutationAborted(signal);
        return performLearnerDeletion(
          profileId,
          pending,
          activeProfileIdAtStart,
          signal,
        );
      }),
    [
      beginLearnerSelectionMutation,
      performLearnerDeletion,
      runLearnerMutation,
    ],
  );

  const retryLearnerDeletionRecovery = useCallback(() => {
    if (learnerDeletionRecoveryRef.current !== null) return true;
    const scope = learnerSelectionScopeRef.current;
    if (scope === null) return false;
    const locks = learnerDeletionLockManager();
    if (locks === null) {
      blockForPendingLearnerSelection(false);
      return true;
    }
    const request = (async () => {
      let pending: LearnerSelectionPendingMutation | null = null;
      try {
        pending = await locks.request(
          learnerDeletionLockName(scope),
          { mode: "exclusive" },
          () => {
            const entries = storedLearnerSelectionPendingEntries(scope);
            if (entries === null) {
              throw new Error("Learner deletion recovery is unavailable.");
            }
            const selected = [...entries]
              .filter((entry) => entry[1].recovery !== null)
              .sort(([left], [right]) => left.localeCompare(right))[0];
            if (selected === undefined) return null;
            const [token, entry] = selected;
            if (entry.recovery === null) return null;
            const claimedRecovery = {
              ...entry.recovery,
              attemptId: learnerSelectionMarker(),
            };
            const storageKey = learnerSelectionPendingStorageKey(scope, token);
            if (
              !storeLearnerSelectionMarker(
                storageKey,
                learnerSelectionPendingMarker("pending", claimedRecovery),
              )
            ) {
              throw new Error("Learner deletion recovery is unavailable.");
            }
            const claimed: LearnerSelectionPendingMutation = {
              recovery: claimedRecovery,
              scope,
              storageKey,
              token,
            };
            if (compareStoredLearnerDeletionAttempt(claimed) !== "match") {
              throw new Error("Learner deletion recovery is unavailable.");
            }
            return claimed;
          },
        );
      } catch {
        blockForPendingLearnerSelection(false);
        return;
      }
      if (pending === null) return;
      learnerSelectionPendingRef.current.set(pending.token, "pending");
      postLearnerSelectionSignal(scope, {
        attemptId: pending.recovery?.attemptId,
        status: "pending",
        token: pending.token,
        type: "pending",
      });
      const activeProfileIdAtStart =
        dataRef.current?.mode === "full" ? dataRef.current.profile.id : null;
      beginLearnerIdentityCheck();
      await performLearnerDeletion(
        pending.recovery!.profileId,
        pending,
        activeProfileIdAtStart,
        null,
      ).then(
        () => undefined,
        () => undefined,
      );
    })();
    const recovery = request.finally(() => {
      if (learnerDeletionRecoveryRef.current === recovery) {
        learnerDeletionRecoveryRef.current = null;
      }
      if (!gateMountedRef.current) return;
      if (refreshStoredLearnerSelectionPending().size > 0) {
        blockForPendingLearnerSelection(false);
      } else {
        revalidateActiveLearner(true);
      }
    });
    learnerDeletionRecoveryRef.current = recovery;
    return true;
  }, [
    beginLearnerIdentityCheck,
    blockForPendingLearnerSelection,
    performLearnerDeletion,
    postLearnerSelectionSignal,
    refreshStoredLearnerSelectionPending,
    revalidateActiveLearner,
  ]);

  const retryLearnerIdentity = useCallback(() => {
    if (!retryLearnerDeletionRecovery()) revalidateActiveLearner(true);
  }, [retryLearnerDeletionRecovery, revalidateActiveLearner]);

  const createAndSelectLearner = useCallback(
    (name: string, existingProfileIds: readonly string[]) =>
      runLearnerMutation(async (signal) => {
        const normalizedName = name.normalize("NFKC").trim();
        let pending: LearnerSelectionPendingMutation | null = null;
        let requestStarted = false;
        let responseReceived = false;
        let pendingSettled = false;
        let reconcileWithoutScope = false;
        let revalidateAfterSettlement = false;
        try {
          pending = await beginLearnerSelectionMutation(signal);
          throwIfLearnerMutationAborted(signal);
          requestStarted = true;
          const roster = await createLearnerProfileRequest(normalizedName);
          responseReceived = true;
          const createdProfile = requireRosterActiveProfile(roster);
          if (
            existingProfileIds.includes(createdProfile.id) ||
            createdProfile.name !== normalizedName
          ) {
            throw new Error("The newly added learner could not be loaded.");
          }
          pendingSettled = settleLearnerSelectionMutationUnlocked(
            pending,
            true,
          );
          throwIfLearnerMutationAborted(signal);
          if (!pendingSettled) {
            throw new Error("The learner change could not be verified safely.");
          }
          await reloadSelectedLearner(createdProfile.id, true);
          return roster;
        } catch (error) {
          if (!pendingSettled) {
            const outcome = learnerMutationOutcome(
              error,
              requestStarted,
              responseReceived,
            );
            if (outcome === "committed") {
              pendingSettled = settleLearnerSelectionMutationUnlocked(
                pending,
                true,
              );
              revalidateAfterSettlement = true;
            } else if (outcome === "rejected") {
              pendingSettled = settleLearnerSelectionMutationUnlocked(
                pending,
                false,
              );
              revalidateAfterSettlement = true;
            } else if (outcome === "uncertain") {
              markLearnerSelectionMutationUncertainUnlocked(pending);
              reconcileWithoutScope = pending === null;
            } else if (pending !== null) {
              settleLearnerSelectionMutationUnlocked(pending, false);
            }
          }
          if (
            !signal.aborted &&
            pendingSettled &&
            revalidateAfterSettlement &&
            refreshStoredLearnerSelectionPending().size === 0
          ) {
            learnerRevalidationQueuedRef.current = true;
          } else if (!signal.aborted && reconcileWithoutScope) {
            await reconcileLearnerAfterMutation(signal);
          }
          throw error;
        }
      }),
    [
      beginLearnerSelectionMutation,
      markLearnerSelectionMutationUncertainUnlocked,
      reconcileLearnerAfterMutation,
      refreshStoredLearnerSelectionPending,
      reloadSelectedLearner,
      runLearnerMutation,
      settleLearnerSelectionMutationUnlocked,
    ],
  );
  const activeQuestion = fullData?.question ?? null;
  const activeProfile = fullData?.profile ?? null;
  const activeQuestionKey = activeQuestion?.answerKey ?? "";
  const redoQuestion = isFormRedoRoute
    ? (profileState?.questions[redoQuestionIndex] ?? null)
    : null;
  const redoQuestionKey = redoQuestion?.answerKey ?? "";

  useEffect(() => {
    if (!shouldSyncActiveQuestion(activeProfile, activeQuestion)) return;
    abortQuestionPlayback();
    abortQuestionOperation(false);
    nextOperation();
    setDraft(answerForQuestion(activeProfile!, activeQuestion!));
    setFieldError("");
    setFieldErrorIsAnswer(false);
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
  }, [
    abortQuestionOperation,
    abortQuestionPlayback,
    activeProfile,
    activeQuestion,
    activeQuestionKey,
    nextOperation,
  ]);

  useEffect(() => {
    if (!isFormRedoRoute || !profileState || !redoQuestion) return;
    abortQuestionPlayback();
    abortQuestionOperation(false);
    nextOperation();
    setDraft(answerForQuestion(profileState.profile, redoQuestion));
    setFieldError("");
    setFieldErrorIsAnswer(false);
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
  }, [
    abortQuestionOperation,
    abortQuestionPlayback,
    isFormRedoRoute,
    nextOperation,
    profileState,
    redoQuestion,
    redoQuestionKey,
  ]);

  async function handleStart() {
    if (!fullData?.question) return;
    const active = beginQuestionPlayback();
    if (!active) return;
    setStarted(true);
    setFieldError("");
    setFieldErrorIsAnswer(false);
    if (!fullData.question.audio) {
      finishQuestionPlayback(active);
      return;
    }
    try {
      await playLearnerProfileStart({
        questionAudio: fullData.question.audio,
        signal: active.controller.signal,
      });
    } catch (error) {
      if (isCurrentQuestionPlayback(active) && !isAbortError(error)) {
        setFieldError(
          "Sound did not play. You can keep going or tap the speaker button.",
        );
      }
    } finally {
      finishQuestionPlayback(active);
    }
  }

  async function handleReplay() {
    if (questionOperationRef.current || !activeQuestion?.audio) return;
    const active = beginQuestionPlayback();
    if (!active) return;
    setFieldError("");
    setFieldErrorIsAnswer(false);
    try {
      await replayLearnerProfileQuestion(activeQuestion.audio, {
        signal: active.controller.signal,
      });
    } catch (error) {
      if (isCurrentQuestionPlayback(active) && !isAbortError(error)) {
        setFieldError("Sound did not play. Tap the speaker button again.");
      }
    } finally {
      finishQuestionPlayback(active);
    }
  }

  async function handleRedoReplay() {
    if (questionOperationRef.current || !redoQuestion?.audio) return;
    const active = beginQuestionPlayback();
    if (!active) return;
    setFieldError("");
    setFieldErrorIsAnswer(false);
    try {
      await replayLearnerProfileQuestion(redoQuestion.audio, {
        signal: active.controller.signal,
      });
    } catch (error) {
      if (isCurrentQuestionPlayback(active) && !isAbortError(error)) {
        setFieldError("Sound did not play. Tap the speaker button again.");
      }
    } finally {
      finishQuestionPlayback(active);
    }
  }

  async function handleTranscribe() {
    if (!activeQuestion) return;
    const active = beginQuestionOperation("microphone", "opening");
    if (!active) return;
    let settledStatus: "idle" | "ready" = "idle";
    try {
      const transcript = await captureLearnerProfileAnswer({
        record: ({ signal } = {}) =>
          recordSpeechClip({
            onRecordingStart: () =>
              updateQuestionOperation(active, "recording"),
            signal,
          }),
        signal: active.controller.signal,
        transcribe: async (audio, options) => {
          updateQuestionOperation(active, "transcribing");
          return transcribeLearnerProfileAudio(audio, options);
        },
      });
      if (isCurrentQuestionOperation(active)) {
        setDraft(transcript);
        settledStatus = "ready";
      }
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(
          `${readableError(error)} You can still type your answer.`,
        );
      }
    } finally {
      finishQuestionOperation(active, settledStatus);
    }
  }

  async function handleRedoTranscribe() {
    if (!redoQuestion) return;
    const active = beginQuestionOperation("microphone", "opening");
    if (!active) return;
    let settledStatus: "idle" | "ready" = "idle";
    try {
      const transcript = await captureLearnerProfileAnswer({
        record: ({ signal } = {}) =>
          recordSpeechClip({
            onRecordingStart: () =>
              updateQuestionOperation(active, "recording"),
            signal,
          }),
        signal: active.controller.signal,
        transcribe: async (audio, options) => {
          updateQuestionOperation(active, "transcribing");
          return transcribeLearnerProfileAudio(audio, options);
        },
      });
      if (isCurrentQuestionOperation(active)) {
        setDraft(transcript);
        settledStatus = "ready";
      }
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(
          `${readableError(error)} You can still type your answer.`,
        );
      }
    } finally {
      finishQuestionOperation(active, settledStatus);
    }
  }

  async function handleSubmit() {
    if (!activeQuestion) return;
    const active = beginQuestionOperation("submit", "saving");
    if (!active) return;
    try {
      const next = await saveQuestionAndAdvance({
        questionKey: activeQuestion.answerKey,
        rawAnswer: draft,
        signal: active.controller.signal,
      });
      if (!isCurrentQuestionOperation(active)) return;
      if (next.mode !== "full" || !next.acknowledgment) {
        throw new Error("Peppa could not answer just now.");
      }
      setPendingAcknowledgment({
        kind: "learner-profile",
        operationId: active.operation,
        acknowledgment: next.acknowledgment,
        next,
      });
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(readableError(error));
        setFieldErrorIsAnswer(
          error instanceof LearnerProfileApiError && error.isFieldError,
        );
      }
    } finally {
      finishQuestionOperation(active);
    }
  }

  async function handleRedoQuestionSubmit() {
    if (!redoQuestion || !profileState || !fullData) return;
    const expectedProfileId = fullData.profile.id;
    const active = beginQuestionOperation("submit", "saving");
    if (!active) return;
    try {
      const saved = await saveProfileAnswer(redoQuestion.answerKey, draft, {
        signal: active.controller.signal,
      });
      if (!isCurrentQuestionOperation(active)) return;
      if (saved.profile.id !== expectedProfileId) {
        throw new Error("The selected learner profile could not be saved.");
      }
      const savedQuestionIndex = saved.questions.findIndex(
        (question) => question.answerKey === redoQuestion.answerKey,
      );
      const nextIndex =
        savedQuestionIndex >= 0
          ? savedQuestionIndex + 1
          : redoQuestionIndex + 1;
      if (nextIndex >= saved.questions.length) {
        clearProfileEditor();
        void refresh();
        profileRouteLifecycleRef.current?.markExitHandled();
        onRedoCompleted();
        return;
      }
      setProfileState(saved);
      setRedoQuestionIndex(nextIndex);
      setFieldError("");
      setFieldErrorIsAnswer(false);
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(readableError(error));
        setFieldErrorIsAnswer(
          error instanceof LearnerProfileApiError && error.isFieldError,
        );
      }
    } finally {
      finishQuestionOperation(active);
    }
  }

  async function handleSkip() {
    if (learnerIdentityCheckRef.current !== "confirmed") return;
    if (questionOperationRef.current) return;
    const active =
      started && activeQuestion && isLearnerProfileRoute
        ? beginQuestionOperation("skip", "saving")
        : null;
    const operation = active?.operation ?? nextOperation();
    setLoadError("");
    setFieldError("");
    setFieldErrorIsAnswer(false);
    try {
      const next = await skipLearnerProfile(
        active ? { signal: active.controller.signal } : undefined,
      );
      if (
        active
          ? isCurrentQuestionOperation(active)
          : isCurrentOperation(operation)
      ) {
        setData(next);
      }
    } catch (error) {
      if (active && isAbortError(error)) return;
      if (
        active
          ? !isCurrentQuestionOperation(active)
          : !isCurrentOperation(operation)
      ) {
        return;
      }
      const message = readableError(error);
      if (data) {
        setFieldError(message);
        setFieldErrorIsAnswer(false);
      } else setLoadError(message);
    } finally {
      if (active) finishQuestionOperation(active);
    }
  }

  async function handleSkipQuestion() {
    if (!activeQuestion || activeQuestion.required) return;
    const active = beginQuestionOperation("skip-question", "saving");
    if (!active) return;
    try {
      const next = await skipLearnerProfileQuestion(activeQuestion.answerKey, {
        signal: active.controller.signal,
      });
      if (isCurrentQuestionOperation(active)) setData(next);
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(readableError(error));
        setFieldErrorIsAnswer(false);
      }
    } finally {
      finishQuestionOperation(active);
    }
  }

  const handleProfileRouteExit = useCallback(() => {
    setPendingAcknowledgment((current) =>
      current?.kind === "profile" ? null : current,
    );
    clearProfileEditor();
  }, [clearProfileEditor]);

  if (!profileRouteLifecycleRef.current) {
    profileRouteLifecycleRef.current = createProfileRouteLifecycle(
      profileRouteActive,
      { onExit: handleProfileRouteExit },
    );
  }

  useEffect(() => {
    profileRouteLifecycleRef.current?.update(profileRouteActive);
  }, [profileRouteActive]);

  const closeProfileEditor = useCallback(() => {
    if (!isActiveProfileRoute()) return;
    setPendingAcknowledgment(null);
    clearProfileEditor();
    profileRouteLifecycleRef.current?.markExitHandled();
    onCloseProfileRoute();
  }, [clearProfileEditor, isActiveProfileRoute, onCloseProfileRoute]);

  const closeRedoProfileQuestions = useCallback(() => {
    const profileWasActive = isActiveProfileRoute();
    if (!redoLearnerProfile && !profileWasActive) return;
    setPendingAcknowledgment(null);
    clearProfileEditor();
    if (profileWasActive) {
      profileRouteLifecycleRef.current?.markExitHandled();
    }
    onRedoCompleted();
  }, [
    clearProfileEditor,
    isActiveProfileRoute,
    onRedoCompleted,
    redoLearnerProfile,
  ]);

  const handleRedoLearnerProfile = useCallback(() => {
    if (!isActiveProfileRoute()) return;
    setPendingAcknowledgment(null);
    clearProfileEditor();
    setUseFormFallback(false);
    setStarted(false);
    profileRouteLifecycleRef.current?.markExitHandled();
    onRedoLearnerProfileRoute();
  }, [clearProfileEditor, isActiveProfileRoute, onRedoLearnerProfileRoute]);

  const handleOpenProfile = useCallback(async () => {
    if (!isActiveProfileRoute() || profileLoadOperationRef.current !== null) {
      return;
    }
    const expectedProfileId = fullData?.profile.id;
    if (!expectedProfileId) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller, operation } = profileOperation;
    profileLoadOperationRef.current = operation;
    setIsProfileLoading(true);
    setProfileLoadError("");
    try {
      const profile = await loadProfile({ signal: controller.signal });
      if (!isCurrentProfileOperation(profileOperation)) return;
      if (profile.profile.id !== expectedProfileId) {
        throw new Error("The selected learner profile could not be loaded.");
      }
      setProfileState(profile);
      setRedoQuestionIndex(0);
      setProfileDrafts(profileDraftsFromState(profile));
      setProfileFieldErrors({});
      setProfilePageError("");
    } catch (error) {
      if (isCurrentProfileOperation(profileOperation)) {
        setProfileLoadError(readableError(error));
      }
    } finally {
      const isCurrent = isCurrentProfileOperation(profileOperation);
      boundary.finish(controller);
      if (profileLoadOperationRef.current === operation) {
        profileLoadOperationRef.current = null;
      }
      if (isCurrent) setIsProfileLoading(false);
    }
  }, [fullData?.profile.id, isActiveProfileRoute, isCurrentProfileOperation]);

  function setProfileFieldError(answerKey: string, message: string) {
    setProfileFieldErrors((current) => ({ ...current, [answerKey]: message }));
  }

  function handleProfileValueChange(answerKey: string, value: string) {
    if (learnerIdentityCheckRef.current !== "confirmed") return;
    setProfileDrafts((current) =>
      updateProfileDraft(current, answerKey, value),
    );
    setProfileFieldError(answerKey, "");
  }

  async function handleProfileSave() {
    if (learnerIdentityCheckRef.current !== "confirmed") return;
    const expectedProfileId = fullData?.profile.id;
    if (!profileState || !expectedProfileId || !isActiveProfileRoute()) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller, operation } = profileOperation;
    let acknowledgmentOwnsOperation = false;
    profileMutationPendingRef.current = true;
    setIsProfileSaving(true);
    setProfileFieldErrors({});
    setProfilePageError("");
    try {
      const saved = await saveProfileAnswers(profileDrafts, {
        signal: controller.signal,
      });
      if (!isCurrentProfileOperation(profileOperation)) return;
      if (saved.profile.id !== expectedProfileId) {
        throw new Error("The selected learner profile could not be saved.");
      }
      setProfileState(saved);
      if (saved.acknowledgments?.length) {
        acknowledgmentOwnsOperation = true;
        setPendingAcknowledgment({
          kind: "profile",
          controller,
          operationId: operation,
          acknowledgments: saved.acknowledgments,
          index: 0,
          next: saved,
        });
      } else {
        clearProfileEditor();
        void refresh();
        profileRouteLifecycleRef.current?.markExitHandled();
        onCloseProfileRoute();
      }
    } catch (error) {
      if (!isCurrentProfileOperation(profileOperation)) return;
      const errors =
        error instanceof LearnerProfileApiError ? error.fieldErrors : {};
      setProfileFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setProfilePageError(readableError(error));
      }
    } finally {
      const isCurrent = isCurrentProfileOperation(profileOperation);
      if (!acknowledgmentOwnsOperation) boundary.finish(controller);
      if (isCurrent) {
        profileMutationPendingRef.current = false;
        setIsProfileSaving(false);
      }
    }
  }

  async function handleLessonRecordingConsentChange(enabled: boolean) {
    if (learnerIdentityCheckRef.current !== "confirmed") return;
    if (!profileState || !isActiveProfileRoute()) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller } = profileOperation;
    profileMutationPendingRef.current = true;
    setIsProfileSaving(true);
    setProfilePageError("");
    try {
      const saved = await saveLessonRecordingConsent(enabled, {
        signal: controller.signal,
      });
      if (!isCurrentProfileOperation(profileOperation)) return;
      setProfileState((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                lessonRecordingCleanupPending: saved.cleanupPending,
                lessonRecordingConsent: saved.enabled,
              },
            }
          : current,
      );
    } catch (error) {
      if (isCurrentProfileOperation(profileOperation) && !isAbortError(error)) {
        setProfilePageError(readableError(error));
      }
    } finally {
      const isCurrent = isCurrentProfileOperation(profileOperation);
      boundary.finish(controller);
      if (isCurrent) {
        profileMutationPendingRef.current = false;
        setIsProfileSaving(false);
      }
    }
  }

  function handleAcknowledgmentNext() {
    const pending = pendingAcknowledgment;
    if (!pending) return;
    if (pending.kind === "learner-profile") {
      nextOperation();
      setPendingAcknowledgment(null);
      setData(pending.next);
      return;
    }

    const profileOperation = {
      controller: pending.controller,
      operation: pending.operationId,
    };
    if (!isCurrentProfileOperation(profileOperation)) return;

    const next = nextProfileAcknowledgment(
      pending.acknowledgments,
      pending.index,
    );
    if (next) {
      setPendingAcknowledgment({
        ...pending,
        operationId: nextOperation(),
        index: next.index,
      });
      return;
    }

    setPendingAcknowledgment(null);
    clearProfileEditor();
    void refresh();
    profileRouteLifecycleRef.current?.markExitHandled();
    onCloseProfileRoute();
  }

  const canEditProfile = Boolean(fullData && guardianRoute);
  const hasActiveLearner = fullData !== null;
  const activeLearnerName = fullData?.profile.name ?? null;
  const onOpenProfileRouteRef = useRef(onOpenProfileRoute);
  onOpenProfileRouteRef.current = onOpenProfileRoute;
  const openProfileFromAccount = useCallback(
    () => onOpenProfileRouteRef.current(),
    [],
  );
  useEffect(() => {
    if (
      !profileRouteActive ||
      !canEditProfile ||
      profileState ||
      profileLoadError ||
      profileLoadOperationRef.current !== null
    ) {
      return;
    }
    void handleOpenProfile();
  }, [
    canEditProfile,
    handleOpenProfile,
    profileRouteActive,
    profileLoadError,
    profileState,
  ]);

  const profileAction = useMemo(() => {
    if (learnerIdentityCheck !== "confirmed") return null;
    if (data?.mode === "selection-required") {
      return {
        error: "",
        guardianUnlockDestination: guardianUnlockDestination ?? null,
        hasActiveLearner: false,
        learnerName: null,
        onOpenProfile: null,
      };
    }
    return hasActiveLearner
      ? {
          error: "",
          hasActiveLearner: true,
          learnerName: activeLearnerName,
          onOpenProfile:
            canEditProfile && !isProfileRoute ? openProfileFromAccount : null,
        }
      : null;
  }, [
    activeLearnerName,
    canEditProfile,
    data?.mode,
    guardianUnlockDestination,
    hasActiveLearner,
    isProfileRoute,
    learnerIdentityCheck,
    openProfileFromAccount,
  ]);
  useProfileAccountAction(profileAction);

  const progress = fullData?.progress ?? { answered: 0, current: 0, total: 0 };
  const questionProps: QuestionProps | null = activeQuestion
    ? {
        fieldError,
        fieldErrorIsAnswer,
        mode: "learner-profile",
        onReplay: () => void handleReplay(),
        onSkip: () => void handleSkip(),
        onSkipQuestion: () => void handleSkipQuestion(),
        onSubmit: () => void handleSubmit(),
        onTranscribe: () => void handleTranscribe(),
        onValueChange: (value) => {
          if (learnerIdentityCheckRef.current !== "confirmed") return;
          setDraft(value);
          if (fieldErrorIsAnswer) {
            setFieldError("");
            setFieldErrorIsAnswer(false);
          }
          setQuestionPresentation((current) =>
            current.status === "ready" ? IDLE_QUESTION_PRESENTATION : current,
          );
        },
        pendingAction: questionPresentation.pendingAction,
        playbackPending: questionPlaybackPending,
        progress,
        question: activeQuestion,
        status: questionPresentation.status,
        value: draft,
      }
    : null;

  const profileQuestionProps: QuestionProps | null = redoQuestion
    ? {
        fieldError,
        fieldErrorIsAnswer,
        mode: "profile",
        onBack: closeRedoProfileQuestions,
        onReplay: () => void handleRedoReplay(),
        onSkip() {},
        onSkipQuestion() {},
        onSubmit: () => void handleRedoQuestionSubmit(),
        onTranscribe: () => void handleRedoTranscribe(),
        onValueChange: (value) => {
          if (learnerIdentityCheckRef.current !== "confirmed") return;
          setDraft(value);
          if (fieldErrorIsAnswer) {
            setFieldError("");
            setFieldErrorIsAnswer(false);
          }
          setQuestionPresentation((current) =>
            current.status === "ready" ? IDLE_QUESTION_PRESENTATION : current,
          );
        },
        pendingAction: questionPresentation.pendingAction,
        playbackPending: questionPlaybackPending,
        progress: {
          answered: redoQuestionIndex,
          current: redoQuestionIndex + 1,
          total: profileState?.questions.length ?? 0,
        },
        question: redoQuestion,
        status: questionPresentation.status,
        value: draft,
      }
    : null;

  let acknowledgment: AcknowledgmentView | null = null;
  if (
    pendingAcknowledgment?.kind === "learner-profile" &&
    isLearnerProfileRoute
  ) {
    acknowledgment = {
      acknowledgment: pendingAcknowledgment.acknowledgment,
      operationId: pendingAcknowledgment.operationId,
    };
  } else if (pendingAcknowledgment?.kind === "profile" && isProfileRoute) {
    acknowledgment = {
      acknowledgment:
        pendingAcknowledgment.acknowledgments[pendingAcknowledgment.index],
      operationId: pendingAcknowledgment.operationId,
    };
  }

  const protectedChildren =
    data?.mode === "full" && !learnerManagerRoute ? (
      <LearnerProfileProvider
        key={data.profile.id}
        profile={data.profile}
        replaceProfile={replaceProfile}
      >
        {children}
      </LearnerProfileProvider>
    ) : (
      children
    );

  const learnerIdentityBlocked = learnerIdentityCheck !== "confirmed";
  const blockLearnerInteraction = (event: SyntheticEvent) => {
    if (learnerIdentityCheckRef.current === "confirmed") return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <LearnerSelectionProvider
      activeProfileId={data?.mode === "full" ? data.profile.id : null}
      createAndSelectLearner={createAndSelectLearner}
      deleteLearner={deleteLearner}
      reloadSelectedLearner={reloadSelectedLearner}
      rosterRevision={rosterRevision}
      selectLearner={selectLearner}
    >
      {learnerIdentityBlocked ? (
        <LearnerProfileScreen>
          <LearnerProfileStatusCard
            aria-busy={learnerIdentityCheck === "checking" || undefined}
            role={learnerIdentityCheck === "failed" ? "alert" : "status"}
          >
            <h1 className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl">
              {learnerIdentityCheck === "checking"
                ? "Checking the current learner"
                : "We couldn't verify the current learner"}
            </h1>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              {learnerIdentityCheck === "checking"
                ? "Please wait before making changes."
                : "Try again before continuing so changes are saved for the right learner."}
            </p>
            {learnerIdentityCheck === "failed" ? (
              <div className="mt-2 flex justify-end">
                <ActionButton
                  onClick={retryLearnerIdentity}
                  type="button"
                >
                  Try again
                </ActionButton>
              </div>
            ) : null}
          </LearnerProfileStatusCard>
        </LearnerProfileScreen>
      ) : null}
      <div
        aria-hidden={learnerIdentityBlocked || undefined}
        className="contents"
        hidden={learnerIdentityBlocked}
        inert={learnerIdentityBlocked || undefined}
        onBeforeInputCapture={blockLearnerInteraction}
        onChangeCapture={blockLearnerInteraction}
        onClickCapture={blockLearnerInteraction}
        onInputCapture={blockLearnerInteraction}
        onKeyDownCapture={blockLearnerInteraction}
        onPointerDownCapture={blockLearnerInteraction}
        onSubmitCapture={blockLearnerInteraction}
      >
        <LearnerProfileGateView
          acknowledgment={acknowledgment}
          completedLearnerProfileFallback={completedLearnerProfileFallback}
          conversationProps={
            selectedExperience === "realtime" ? conversationProps : null
          }
          data={data}
          guardianDashboardRoute={guardianDashboardRoute}
          guardianRoute={guardianRoute}
          guardianSelectionFallback={guardianSelectionFallback}
          isConversationRoute={isConversationRoute}
          isLearnerProfileRoute={isLearnerProfileRoute}
          learnerManagerRoute={learnerManagerRoute}
          isProfileFormRedo={isFormRedoRoute}
          isProfileLoading={isProfileLoading}
          isProfileRoute={isProfileRoute}
          isLoading={isLoading}
          loadError={loadError}
          onAcknowledgmentNext={handleAcknowledgmentNext}
          onCloseConversationRoute={onConversationCompleted}
          onCloseGuardianRoute={onCloseGuardianRoute}
          onCloseProfileRoute={
            redoLearnerProfile ? closeRedoProfileQuestions : closeProfileEditor
          }
          onRetry={() => void refresh()}
          onRetryProfile={() => void handleOpenProfile()}
          onSkip={() => void handleSkip()}
          onStart={() => void handleStart()}
          learnerProfileFallback={learnerProfileFallback}
          profileEditor={
            isProfileRoute && profileState
              ? {
                  drafts: profileDrafts,
                  fieldErrors: profileFieldErrors,
                  isSaving: isProfileSaving,
                  learnerName: fullData?.profile.name ?? "Learner",
                  lessonRecordingCleanupPending:
                    profileState.profile.lessonRecordingCleanupPending,
                  lessonRecordingConsent:
                    profileState.profile.lessonRecordingConsent,
                  onCancel: closeProfileEditor,
                  onClose: closeProfileEditor,
                  onLessonRecordingConsentChange: (enabled) =>
                    void handleLessonRecordingConsentChange(enabled),
                  onRedoLearnerProfile: handleRedoLearnerProfile,
                  onSave: () => void handleProfileSave(),
                  onValueChange: handleProfileValueChange,
                  pageError: profilePageError,
                  questions: profileState.questions,
                }
              : null
          }
          profileLoadError={profileLoadError}
          profileQuestionProps={profileQuestionProps}
          questionProps={
            (isProfileRoute || isFormRedoRoute) && profileState
              ? null
              : questionProps
          }
          redoLearnerProfile={redoLearnerProfile}
          started={started}
        >
          {protectedChildren}
        </LearnerProfileGateView>
      </div>
    </LearnerSelectionProvider>
  );
}
