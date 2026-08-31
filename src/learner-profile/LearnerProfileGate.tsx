import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
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
import type { GuardianMode } from "../auth/GuardianAccess";
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
  type GuardianLearnerProfileSummary,
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
  LearnerModeSelectionPage,
  LearnerModeSwitchDialog,
} from "../app/LearnerModeSwitchDialog";
import {
  LearnerProfileProvider,
  LearnerSelectionProvider,
} from "./LearnerProfileContext";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
const LEARNER_SELECTION_CHANNEL_PREFIX = "parrot-learner-selection";
const LEARNER_SELECTION_CHANGED_MESSAGE = "changed";

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
  const sessionSeparator = identity.lastIndexOf("|session:");
  const accountIdentity =
    sessionSeparator > 0 ? identity.slice(0, sessionSeparator) : identity;
  const scope = await sha256Hex(accountIdentity);
  return scope === null ? null : `${LEARNER_SELECTION_CHANNEL_PREFIX}-${scope}`;
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
type LearnerSelectionSyncStatus = "pending" | "ready" | "unavailable";

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

type GuardianSelectionRosterPhase =
  | "idle"
  | "loading"
  | "available"
  | "empty"
  | "error";

type LearnerProfileGateViewProps = {
  acknowledgment: AcknowledgmentView | null;
  children: ReactNode;
  completedLearnerProfileFallback: ReactNode;
  conversationProps: ConversationProps | null;
  data: LearnerProfileState | null;
  guardianAccessMode?: GuardianMode;
  guardianDashboardRoute?: boolean;
  guardianRoute?: boolean;
  guardianSelectionFallback?: ReactNode;
  guardianSelectionRosterPhase?: GuardianSelectionRosterPhase;
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  learnerManagerRoute?: boolean;
  learnerSelectionFallback?: ReactNode;
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
  guardianAccessMode = "learner",
  guardianDashboardRoute = false,
  guardianRoute = false,
  guardianSelectionFallback,
  guardianSelectionRosterPhase = "idle",
  isConversationRoute,
  isLearnerProfileRoute,
  learnerManagerRoute = false,
  learnerSelectionFallback,
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
  const canAccessCurrentRoute = Boolean(
    canAccessProtectedRoutes ||
    (fullData && !isLearnerProfileRoute && !isProfileRoute),
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
      if (guardianAccessMode === "guardian" && !isLearnerProfileRoute) {
        if (
          guardianSelectionRosterPhase === "available" ||
          guardianSelectionRosterPhase === "error"
        ) {
          return <>{children}</>;
        }
        if (
          guardianSelectionRosterPhase === "idle" ||
          guardianSelectionRosterPhase === "loading"
        ) {
          return (
            <LearnerProfileScreen>
              <LearnerProfileStatusCard aria-busy="true" role="status">
                <p className="m-0 font-bold leading-relaxed text-slate-600">
                  Loading learner profiles…
                </p>
              </LearnerProfileStatusCard>
            </LearnerProfileScreen>
          );
        }
        return <>{guardianSelectionFallback ?? learnerProfileFallback}</>;
      }
      return <>{learnerSelectionFallback ?? learnerProfileFallback}</>;
    }
    if (guardianDashboardRoute) {
      if (
        guardianSelectionRosterPhase === "available" ||
        guardianSelectionRosterPhase === "error"
      ) {
        return <>{children}</>;
      }
      if (
        guardianSelectionRosterPhase === "idle" ||
        guardianSelectionRosterPhase === "loading"
      ) {
        return (
          <LearnerProfileScreen>
            <LearnerProfileStatusCard aria-busy="true" role="status">
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Loading learner profiles…
              </p>
            </LearnerProfileStatusCard>
          </LearnerProfileScreen>
        );
      }
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

  if (data && !canAccessCurrentRoute && !isLearnerProfileRoute) {
    return <>{learnerProfileFallback}</>;
  }

  if (
    canAccessCurrentRoute &&
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
    canAccessCurrentRoute &&
    isConversationRoute &&
    conversationProps
  ) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (fullData && redoLearnerProfile && conversationProps) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (canAccessCurrentRoute) {
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
  guardianAccessMode?: GuardianMode;
  guardianDashboardRoute?: boolean;
  guardianRoute?: boolean;
  guardianSelectionFallback?: ReactNode;
  guardianUnlockDestination?: string;
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  isProfileRoute: boolean;
  learnerManagerRoute?: boolean;
  learnerSelectionDestination: string;
  learnerProfileFallback: ReactNode;
  onCloseGuardianRoute?: () => void;
  onCloseProfileRoute: () => void;
  onConversationCompleted: () => void;
  onBeforeLearnerSelectionNavigate?: () => void;
  onOpenLessons: () => void;
  onOpenProfileRoute: () => void;
  onRedoCompleted: () => void;
  onRedoLearnerProfileRoute: () => void;
  redoLearnerProfile: boolean;
};

export function LearnerProfileGate({
  children,
  completedLearnerProfileFallback,
  guardianAccessMode = "learner",
  guardianDashboardRoute = false,
  guardianRoute = false,
  guardianSelectionFallback,
  guardianUnlockDestination,
  isConversationRoute,
  isLearnerProfileRoute,
  isProfileRoute,
  learnerManagerRoute = false,
  learnerSelectionDestination,
  learnerProfileFallback,
  onCloseGuardianRoute,
  onCloseProfileRoute,
  onConversationCompleted,
  onBeforeLearnerSelectionNavigate,
  onOpenLessons,
  onOpenProfileRoute,
  onRedoCompleted,
  onRedoLearnerProfileRoute,
  redoLearnerProfile,
}: LearnerProfileGateProps) {
  const clearProfileAccountAction = useClearProfileAccountAction();
  const sessionIdentity = useAccountSessionIdentity();
  const learnerSelectionChannel = useMemo(
    () =>
      sessionIdentity === null
        ? Promise.resolve<string | null>(null)
        : learnerSelectionChannelName(sessionIdentity),
    [sessionIdentity],
  );
  const [data, setData] = useState<LearnerProfileState | null>(null);
  const [guardianSelectionRosterPhase, setGuardianSelectionRosterPhase] =
    useState<GuardianSelectionRosterPhase>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [learnerSwitcherOwner, setLearnerSwitcherOwner] = useState<{
    profileId: string;
    sessionIdentity: string | null;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [learnerIdentityCheck, setLearnerIdentityCheck] =
    useState<LearnerIdentityCheck>(
      sessionIdentity === null ? "confirmed" : "checking",
    );
  const [learnerSelectionSyncStatus, setLearnerSelectionSyncStatus] =
    useState<LearnerSelectionSyncStatus>(
      sessionIdentity === null ? "unavailable" : "pending",
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
  const learnerSelectionChannelRef = useRef<BroadcastChannel | null>(null);
  const learnerMutationControllerRef = useRef<AbortController | null>(null);
  const learnerMutationTailRef = useRef<Promise<void>>(Promise.resolve());
  const learnerAccountEpochRef = useRef(0);
  const learnerAccountIdentityRef = useRef(sessionIdentity);
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
  const currentLearnerSelectionSyncStatus =
    learnerAccountIdentityRef.current === sessionIdentity
      ? learnerSelectionSyncStatus
      : sessionIdentity === null
        ? "unavailable"
        : "pending";

  const updateLearnerIdentityCheck = useCallback(
    (next: LearnerIdentityCheck) => {
      learnerIdentityCheckRef.current = next;
      setLearnerIdentityCheck(next);
    },
    [],
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
          const next = await loadLearnerProfile({ signal: controller.signal });
          if (controller.signal.aborted || !isCurrentOperation(operation)) {
            return null;
          }
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
    [isCurrentOperation, nextOperation],
  );

  const refresh = useCallback(async () => {
    try {
      await startActiveLearnerLoad().promise;
    } catch {
      // The load helper publishes the safe error state for the gate.
    }
  }, [startActiveLearnerLoad]);

  useEffect(() => {
    if (
      currentLearnerSelectionSyncStatus === "pending" ||
      learnerRevalidationRef.current !== null
    ) {
      return;
    }
    const accountEpoch = learnerAccountEpochRef.current;
    const request = startActiveLearnerLoad();
    void request.promise
      .catch(() => {
        // The load helper publishes the safe error state for the gate.
      })
      .finally(() => {
        if (
          gateMountedRef.current &&
          learnerAccountEpochRef.current === accountEpoch &&
          !request.controller.signal.aborted &&
          learnerRevalidationRef.current === null
        ) {
          updateLearnerIdentityCheck("confirmed");
        }
      });
    return () => {
      learnerLoadControllerRef.current?.abort();
      learnerLoadControllerRef.current = null;
    };
  }, [
    currentLearnerSelectionSyncStatus,
    sessionIdentity,
    startActiveLearnerLoad,
    updateLearnerIdentityCheck,
  ]);

  useEffect(() => {
    if (
      data?.mode !== "selection-required" ||
      guardianAccessMode !== "guardian" ||
      isLearnerProfileRoute ||
      (guardianRoute && !guardianDashboardRoute)
    ) {
      setGuardianSelectionRosterPhase((current) =>
        current === "idle" ? current : "idle",
      );
      return;
    }

    const controller = new AbortController();
    setGuardianSelectionRosterPhase("loading");
    void loadLearnerProfiles({ signal: controller.signal }).then(
      (roster) => {
        if (!controller.signal.aborted) {
          setGuardianSelectionRosterPhase(
            roster.profiles.length > 0 ? "available" : "empty",
          );
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setGuardianSelectionRosterPhase("error");
        }
      },
    );
    return () => controller.abort();
  }, [
    data?.mode,
    guardianAccessMode,
    guardianDashboardRoute,
    guardianRoute,
    isLearnerProfileRoute,
  ]);

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
    setLearnerSwitcherOwner(null);
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

  useIsomorphicLayoutEffect(() => {
    if (learnerAccountIdentityRef.current === sessionIdentity) return;
    learnerAccountIdentityRef.current = sessionIdentity;
    learnerAccountEpochRef.current += 1;
    setLearnerSelectionSyncStatus(
      sessionIdentity === null ? "unavailable" : "pending",
    );
    learnerMutationControllerRef.current?.abort();
    learnerMutationControllerRef.current = null;
    resetLearnerSelection();
    if (sessionIdentity !== null) updateLearnerIdentityCheck("checking");
  }, [resetLearnerSelection, sessionIdentity, updateLearnerIdentityCheck]);

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

  const publishAuthoritativeRosterChange = useCallback(() => {
    setRosterRevision((current) => current + 1);
    const channel = learnerSelectionChannelRef.current;
    if (!channel) return;
    try {
      channel.postMessage(LEARNER_SELECTION_CHANGED_MESSAGE);
    } catch {
      // Focus and visibility revalidation cover unavailable channels.
    }
  }, []);

  const revalidateActiveLearner = useCallback(
    (restartPending = false) => {
      if (!gateMountedRef.current) return;
      if (learnerMutationControllerRef.current !== null) {
        learnerRevalidationQueuedRef.current = true;
        return;
      }
      if (learnerRevalidationRef.current !== null) {
        if (!restartPending) return;
        learnerRevalidationControllerRef.current?.abort();
      }
      learnerRevalidationQueuedRef.current = false;
      learnerLoadControllerRef.current?.abort();
      learnerLoadControllerRef.current = null;
      beginLearnerIdentityCheck();
      const controller = new AbortController();
      const accountEpoch = learnerAccountEpochRef.current;
      learnerRevalidationControllerRef.current = controller;
      const request = (async () => {
        try {
          let next: LearnerProfileState;
          if (guardianAccessMode === "guardian") {
            const roster = await loadLearnerProfiles({
              signal: controller.signal,
            });
            if (
              controller.signal.aborted ||
              !gateMountedRef.current ||
              learnerAccountEpochRef.current !== accountEpoch ||
              learnerRevalidationControllerRef.current !== controller
            ) {
              return;
            }
            setRosterRevision((current) => current + 1);
            if (roster.activeProfileId === null) {
              next = { mode: "selection-required" };
            } else {
              next = await loadLearnerProfile({ signal: controller.signal });
              if (
                next.mode !== "full" ||
                next.profile.id !== roster.activeProfileId
              ) {
                throw new Error("The selected learner could not be loaded.");
              }
            }
          } else {
            next = await loadLearnerProfile({ signal: controller.signal });
          }
          if (
            controller.signal.aborted ||
            !gateMountedRef.current ||
            learnerAccountEpochRef.current !== accountEpoch ||
            learnerRevalidationControllerRef.current !== controller
          ) {
            return;
          }
          if (!hasSameActiveLearner(dataRef.current, next)) {
            learnerRevalidationControllerRef.current = null;
            resetLearnerSelection();
            if (
              !gateMountedRef.current ||
              learnerAccountEpochRef.current !== accountEpoch
            ) {
              return;
            }
          }
          dataRef.current = next;
          setData(next);
          setIsLoading(false);
          setLoadError("");
          updateLearnerIdentityCheck("confirmed");
        } catch (error) {
          if (
            !controller.signal.aborted &&
            gateMountedRef.current &&
            learnerAccountEpochRef.current === accountEpoch &&
            !isAbortError(error)
          ) {
            updateLearnerIdentityCheck("failed");
          }
        }
      })();
      const pending = request.finally(() => {
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
      beginLearnerIdentityCheck,
      guardianAccessMode,
      resetLearnerSelection,
      updateLearnerIdentityCheck,
    ],
  );

  const revalidateAnnouncedLearnerChange = useEffectEvent(() => {
    revalidateActiveLearner(true);
  });

  useEffect(() => {
    const needsLifecycleRecovery = () =>
      currentLearnerSelectionSyncStatus === "unavailable" ||
      learnerIdentityCheckRef.current === "failed";
    const revalidateWhenVisible = () => {
      if (
        document.visibilityState === "visible" &&
        needsLifecycleRecovery()
      ) {
        revalidateActiveLearner(false);
      }
    };
    const revalidateOnFocus = () => {
      if (needsLifecycleRecovery()) {
        revalidateActiveLearner(false);
      }
    };
    const revalidateRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) revalidateActiveLearner(true);
    };
    window.addEventListener("focus", revalidateOnFocus);
    window.addEventListener("pageshow", revalidateRestoredPage);
    document.addEventListener("visibilitychange", revalidateWhenVisible);
    return () => {
      window.removeEventListener("focus", revalidateOnFocus);
      window.removeEventListener("pageshow", revalidateRestoredPage);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, [currentLearnerSelectionSyncStatus, revalidateActiveLearner]);

  useEffect(() => {
    if (sessionIdentity === null) {
      setLearnerSelectionSyncStatus("unavailable");
      return;
    }
    setLearnerSelectionSyncStatus("pending");
    let channel: BroadcastChannel | null = null;
    let disposed = false;
    void learnerSelectionChannel.then((name) => {
      if (disposed) return;
      if (
        name === null ||
        typeof globalThis.BroadcastChannel === "undefined"
      ) {
        setLearnerSelectionSyncStatus("unavailable");
        return;
      }
      try {
        channel = new globalThis.BroadcastChannel(name);
        channel.onmessage = (event) => {
          if (event.data === LEARNER_SELECTION_CHANGED_MESSAGE) {
            revalidateAnnouncedLearnerChange();
          }
        };
        learnerSelectionChannelRef.current = channel;
        setLearnerSelectionSyncStatus("ready");
      } catch {
        setLearnerSelectionSyncStatus("unavailable");
      }
    }, () => {
      if (!disposed) setLearnerSelectionSyncStatus("unavailable");
    });
    return () => {
      disposed = true;
      if (learnerSelectionChannelRef.current === channel) {
        learnerSelectionChannelRef.current = null;
      }
      if (channel) channel.onmessage = null;
      channel?.close();
    };
  }, [learnerSelectionChannel, sessionIdentity]);

  const reloadSelectedLearner = useCallback(
    async (expectedProfileId: string, allowMutationOwner = false) => {
      if (!expectedProfileId.trim()) {
        throw new Error("The selected learner could not be loaded.");
      }
      if (
        learnerIdentityCheckRef.current !== "confirmed" &&
        expectedLearnerReloadControllerRef.current === null &&
        !allowMutationOwner
      ) {
        throw new DOMException(
          "The learner change was cancelled.",
          "AbortError",
        );
      }
      if (
        dataRef.current?.mode !== "full" ||
        dataRef.current.profile.id !== expectedProfileId
      ) {
        beginLearnerIdentityCheck();
      }
      const operation = nextOperation();
      const accountEpoch = learnerAccountEpochRef.current;
      learnerLoadControllerRef.current?.abort();
      const controller = new AbortController();
      learnerLoadControllerRef.current = controller;
      expectedLearnerReloadControllerRef.current = controller;
      setLoadError("");
      try {
        const next = await loadLearnerProfile({ signal: controller.signal });
        if (
          controller.signal.aborted ||
          !gateMountedRef.current ||
          learnerAccountEpochRef.current !== accountEpoch ||
          !isCurrentOperation(operation)
        ) {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
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
          if (
            !gateMountedRef.current ||
            learnerAccountEpochRef.current !== accountEpoch
          ) {
            throw new DOMException(
              "The learner change was cancelled.",
              "AbortError",
            );
          }
        }
        dataRef.current = next;
        setData(next);
        setIsLoading(false);
        setLoadError("");
        updateLearnerIdentityCheck("confirmed");
        if (!matchesExpected) {
          throw new Error("The selected learner could not be loaded.");
        }
        return next.profile;
      } catch (error) {
        if (
          !controller.signal.aborted &&
          learnerAccountEpochRef.current === accountEpoch &&
          !isAbortError(error) &&
          learnerIdentityCheckRef.current === "checking"
        ) {
          updateLearnerIdentityCheck("failed");
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
      beginLearnerIdentityCheck,
      isCurrentOperation,
      nextOperation,
      resetLearnerSelection,
      updateLearnerIdentityCheck,
    ],
  );

  const installAuthoritativeRoster = useCallback(
    async (
      roster: LearnerProfileRoster,
      signal: AbortSignal,
      reloadActive: boolean,
    ) => {
      throwIfLearnerMutationAborted(signal);
      if (roster.activeProfileId === null) {
        resetLearnerSelection();
        const next = { mode: "selection-required" } as const;
        dataRef.current = next;
        setData(next);
        setIsLoading(false);
        setLoadError("");
        return;
      }
      if (
        reloadActive ||
        dataRef.current?.mode !== "full" ||
        dataRef.current.profile.id !== roster.activeProfileId
      ) {
        await reloadSelectedLearner(roster.activeProfileId, true);
      }
      throwIfLearnerMutationAborted(signal);
    },
    [reloadSelectedLearner, resetLearnerSelection],
  );

  const reconcileLearnerAfterMutation = useCallback(
    async (signal: AbortSignal) => {
      try {
        throwIfLearnerMutationAborted(signal);
        const roster = await loadLearnerProfiles({ signal });
        await installAuthoritativeRoster(roster, signal, true);
        throwIfLearnerMutationAborted(signal);
        return roster;
      } catch (error) {
        if (!signal.aborted && gateMountedRef.current) {
          updateLearnerIdentityCheck("failed");
        }
        throw error;
      }
    },
    [installAuthoritativeRoster, updateLearnerIdentityCheck],
  );

  const runLearnerMutation = useCallback(
    <Result,>(operation: (signal: AbortSignal) => Promise<Result>) => {
      const requestedEpoch = gateMountEpochRef.current;
      const requestedAccountEpoch = learnerAccountEpochRef.current;
      const queued = learnerMutationTailRef.current.then(async () => {
        if (learnerIdentityCheckRef.current !== "confirmed") {
          throw new DOMException(
            "The learner change was cancelled.",
            "AbortError",
          );
        }
        if (
          !gateMountedRef.current ||
          gateMountEpochRef.current !== requestedEpoch ||
          learnerAccountEpochRef.current !== requestedAccountEpoch
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
            gateMountEpochRef.current !== requestedEpoch ||
            learnerAccountEpochRef.current !== requestedAccountEpoch
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
        let roster: LearnerProfileRoster;
        let mutationError: unknown = null;
        let reconciled = false;
        try {
          roster = await selectLearnerProfileRequest(profileId, { signal });
          throwIfLearnerMutationAborted(signal);
          requireRosterActiveProfile(roster, profileId);
        } catch (error) {
          if (isAbortError(error)) throw error;
          mutationError = error;
          roster = await reconcileLearnerAfterMutation(signal);
          reconciled = true;
        }
        publishAuthoritativeRosterChange();
        if (reconciled) {
          if (roster.activeProfileId !== profileId) throw mutationError;
        } else {
          await reloadSelectedLearner(profileId, true);
        }
        return roster;
      }),
    [
      publishAuthoritativeRosterChange,
      reconcileLearnerAfterMutation,
      reloadSelectedLearner,
      runLearnerMutation,
    ],
  );

  const deleteLearner = useCallback(
    (profileId: string) =>
      runLearnerMutation(async (signal) => {
        if (!profileId.trim()) {
          throw new Error("The learner could not be deleted.");
        }
        const uncertainError = () =>
          new LearnerProfileDeletionError(
            "learner_deletion_uncertain",
            "We couldn't confirm whether this learner was deleted. Refresh learner profiles before trying again.",
          );
        let mutationError: unknown = new LearnerProfileApiError(
          200,
          "invalid_roster",
          "The learner deletion response could not be verified.",
        );
        let roster: LearnerProfileRoster;
        let reconciled = false;
        try {
          roster = await deleteLearnerProfileRequest(profileId, { signal });
          throwIfLearnerMutationAborted(signal);
          const target = roster.profiles.find(({ id }) => id === profileId);
          if (target && !target.deletionPending) {
            throw mutationError;
          }
        } catch (error) {
          if (isAbortError(error)) throw error;
          mutationError = error;
          try {
            roster = await reconcileLearnerAfterMutation(signal);
            reconciled = true;
          } catch (reconciliationError) {
            if (isAbortError(reconciliationError)) throw reconciliationError;
            throw uncertainError();
          }
        }

        publishAuthoritativeRosterChange();
        if (!reconciled) {
          await installAuthoritativeRoster(roster, signal, false);
        }
        const target = roster.profiles.find(({ id }) => id === profileId);
        if (!target) return roster;
        if (target.deletionPending) {
          throw new LearnerProfileDeletionError(
            "learner_deletion_pending",
            "Learner cleanup is still in progress. Try again.",
            roster,
          );
        }
        throw mutationError;
      }),
    [
      installAuthoritativeRoster,
      publishAuthoritativeRosterChange,
      reconcileLearnerAfterMutation,
      runLearnerMutation,
    ],
  );

  const retryLearnerIdentity = useCallback(
    () => revalidateActiveLearner(true),
    [revalidateActiveLearner],
  );

  const createAndSelectLearner = useCallback(
    (name: string, existingProfileIds: readonly string[]) =>
      runLearnerMutation(async (signal) => {
        const normalizedName = name.normalize("NFKC").trim();
        let roster: LearnerProfileRoster;
        let mutationError: unknown = null;
        let reconciled = false;
        try {
          const result = await createLearnerProfileRequest(normalizedName, {
            signal,
          });
          throwIfLearnerMutationAborted(signal);
          roster = result;
          if (result.createdProfileId !== result.activeProfileId) {
            throw new Error("The newly added learner could not be loaded.");
          }
          const directCreatedProfile = requireRosterActiveProfile(
            result,
            result.createdProfileId,
          );
          if (
            existingProfileIds.includes(directCreatedProfile.id) ||
            directCreatedProfile.name !== normalizedName
          ) {
            throw new Error("The newly added learner could not be loaded.");
          }
        } catch (error) {
          if (isAbortError(error)) throw error;
          mutationError = error;
          roster = await reconcileLearnerAfterMutation(signal);
          reconciled = true;
          publishAuthoritativeRosterChange();
        }
        let createdProfile: GuardianLearnerProfileSummary;
        try {
          createdProfile = requireRosterActiveProfile(roster);
        } catch (error) {
          if (mutationError !== null) throw mutationError;
          throw error;
        }
        if (
          existingProfileIds.includes(createdProfile.id) ||
          createdProfile.name !== normalizedName
        ) {
          if (mutationError !== null) throw mutationError;
          throw new Error("The newly added learner could not be loaded.");
        }
        if (!reconciled) {
          publishAuthoritativeRosterChange();
          await reloadSelectedLearner(createdProfile.id, true);
        }
        return roster;
      }),
    [
      publishAuthoritativeRosterChange,
      reconcileLearnerAfterMutation,
      reloadSelectedLearner,
      runLearnerMutation,
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
  const learnerSwitcherProfileId =
    guardianAccessMode === "learner" &&
    learnerIdentityCheck === "confirmed" &&
    data?.mode === "full"
      ? data.profile.id
      : null;
  const isLearnerSwitcherOpen = Boolean(
    learnerSwitcherProfileId !== null &&
      learnerSwitcherOwner !== null &&
      learnerSwitcherOwner.profileId === learnerSwitcherProfileId &&
      learnerSwitcherOwner.sessionIdentity === sessionIdentity,
  );
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

  const openLearnerSwitcher = useCallback(
    () => {
      if (learnerSwitcherProfileId === null) return;
      setLearnerSwitcherOwner({
        profileId: learnerSwitcherProfileId,
        sessionIdentity,
      });
    },
    [learnerSwitcherProfileId, sessionIdentity],
  );
  const closeLearnerSwitcher = useCallback(
    () => setLearnerSwitcherOwner(null),
    [],
  );
  useIsomorphicLayoutEffect(() => {
    setLearnerSwitcherOwner(null);
  }, [
    guardianAccessMode,
    learnerIdentityCheck,
    learnerSwitcherProfileId,
    sessionIdentity,
  ]);
  const handleLearnerSwitcherNavigate = useCallback(() => {
    closeLearnerSwitcher();
    onBeforeLearnerSelectionNavigate?.();
  }, [closeLearnerSwitcher, onBeforeLearnerSelectionNavigate]);

  const profileAction = useMemo(() => {
    if (learnerIdentityCheck !== "confirmed") return null;
    if (data?.mode === "selection-required") {
      return {
        error: "",
        guardianUnlockDestination: guardianUnlockDestination ?? null,
        hasActiveLearner: false,
        learnerName: null,
        onOpenLearnerSwitcher: null,
        onOpenProfile: null,
      };
    }
    return hasActiveLearner
      ? {
          error: "",
          hasActiveLearner: true,
          learnerName: activeLearnerName,
          onOpenLearnerSwitcher: openLearnerSwitcher,
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
    openLearnerSwitcher,
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
        key={
          guardianAccessMode === "guardian"
            ? "guardian-learner-selection"
            : data.profile.id
        }
        profile={data.profile}
        replaceProfile={replaceProfile}
      >
        {children}
      </LearnerProfileProvider>
    ) : (
      children
    );

  const learnerIdentityBlocked =
    learnerIdentityCheck !== "confirmed" ||
    currentLearnerSelectionSyncStatus === "pending";
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
          guardianAccessMode={guardianAccessMode}
          guardianDashboardRoute={guardianDashboardRoute}
          guardianRoute={guardianRoute}
          guardianSelectionFallback={guardianSelectionFallback}
          guardianSelectionRosterPhase={guardianSelectionRosterPhase}
          isConversationRoute={isConversationRoute}
          isLearnerProfileRoute={isLearnerProfileRoute}
          learnerManagerRoute={learnerManagerRoute}
          learnerSelectionFallback={
            <LearnerModeSelectionPage
              destination={learnerSelectionDestination}
              onBeforeNavigate={onBeforeLearnerSelectionNavigate}
            />
          }
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
      {isLearnerSwitcherOpen ? (
        <LearnerModeSwitchDialog
          destination="/"
          onBeforeNavigate={handleLearnerSwitcherNavigate}
          onClose={closeLearnerSwitcher}
        />
      ) : null}
    </LearnerSelectionProvider>
  );
}
