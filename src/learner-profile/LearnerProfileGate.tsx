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
} from "react";
import {
  useClearProfileAccountAction,
  useProfileAccountAction,
} from "../auth/account-actions";
import { selectConversationPurpose } from "../../lib/conversation-purpose";
import {
  loadLearnerProfile,
  loadProfile,
  LearnerProfileApiError,
  saveLearnerProfileAnswer,
  saveProfileAnswer,
  saveProfileAnswers,
  skipLearnerProfile,
  skipLearnerProfileQuestion,
  transcribeLearnerProfileAudio,
  type FullLearnerProfileState,
  type LearnerProfileSummary,
  type LearnerProfileAcknowledgment as Acknowledgment,
  type LearnerProfileQuestion,
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
  const canEditProfile = Boolean(fullData && (guardianRoute || learnerProfileComplete));

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
            {redoLearnerProfile ? (
              <TextButton onClick={onCloseProfileRoute} type="button">
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
                {isProfileFormRedo ? "Back" : "Back to home"}
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
  guardianRoute?: boolean;
  guardianSelectionFallback?: ReactNode;
  guardianUnlockDestination?: string;
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  isProfileRoute: boolean;
  learnerManagerRoute?: boolean;
  learnerProfileFallback: ReactNode;
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
  guardianRoute = false,
  guardianSelectionFallback,
  guardianUnlockDestination,
  isConversationRoute,
  isLearnerProfileRoute,
  isProfileRoute,
  learnerManagerRoute = false,
  learnerProfileFallback,
  onCloseProfileRoute,
  onConversationCompleted,
  onOpenLessons,
  onOpenProfileRoute,
  onRedoCompleted,
  onRedoLearnerProfileRoute,
  redoLearnerProfile,
}: LearnerProfileGateProps) {
  const clearProfileAccountAction = useClearProfileAccountAction();
  const [data, setData] = useState<LearnerProfileState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [started, setStarted] = useState(false);
  const [useFormFallback, setUseFormFallback] = useState(false);
  const [redoQuestionIndex, setRedoQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
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
  const learnerLoadControllerRef = useRef<AbortController | null>(null);
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
      current?.profile.id === profile.id ? { ...current, profile } : current,
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
    const playback = questionPlaybackRef.current;
    questionPlaybackRef.current = null;
    playback?.controller.abort();
    const operation = questionOperationRef.current;
    questionOperationRef.current = null;
    operation?.controller.abort();
    setRedoQuestionIndex(0);
    setDraft("");
    setFieldError("");
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
      if (questionOperationRef.current) return null;
      abortQuestionPlayback();
      const active: ActiveQuestionOperation = {
        controller: new AbortController(),
        operation: nextOperation(),
        owner,
      };
      questionOperationRef.current = active;
      setFieldError("");
      setQuestionPresentation({ pendingAction: owner, status });
      return active;
    },
    [abortQuestionPlayback, nextOperation],
  );

  const beginQuestionPlayback = useCallback(() => {
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
    ownership?.mount();
    return () => {
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
            setData(next);
            if (expectedProfileId) {
              throw new Error("The selected learner could not be loaded.");
            }
            return null;
          }
          if (
            expectedProfileId &&
            (next.mode !== "full" || next.profile.id !== expectedProfileId)
          ) {
            throw new Error("The selected learner could not be loaded.");
          }
          setIsLoading(false);
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
    const request = startActiveLearnerLoad();
    void request.promise.catch(() => {});
    return () => {
      request.controller.abort();
      if (learnerLoadControllerRef.current === request.controller) {
        learnerLoadControllerRef.current = null;
      }
    };
  }, [startActiveLearnerLoad]);

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
    nextOperation();
    clearProfileAccountAction();
    conversationProps.resetConversation();
    learnerLoadControllerRef.current?.abort();
    learnerLoadControllerRef.current = null;
    abortQuestionPlayback();
    abortQuestionOperation();
    clearProfileEditor();
    setData(null);
    setIsLoading(false);
    setLoadError("");
    setStarted(false);
    setUseFormFallback(false);
    setDraft("");
    setFieldError("");
    setQuestionPresentation(IDLE_QUESTION_PRESENTATION);
    setQuestionPlaybackPending(false);
    setPendingAcknowledgment(null);
  }, [
    abortQuestionOperation,
    abortQuestionPlayback,
    clearProfileEditor,
    clearProfileAccountAction,
    conversationProps,
    nextOperation,
  ]);

  const reloadSelectedLearner = useCallback(
    async (expectedProfileId: string) => {
      resetLearnerSelection();
      const profile = await startActiveLearnerLoad(expectedProfileId).promise;
      if (!profile) {
        throw new Error("The selected learner could not be loaded.");
      }
      return profile;
    },
    [resetLearnerSelection, startActiveLearnerLoad],
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
            onRecordingStart: () => updateQuestionOperation(active, "recording"),
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
        savedQuestionIndex >= 0 ? savedQuestionIndex + 1 : redoQuestionIndex + 1;
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
    } catch (error) {
      if (isCurrentQuestionOperation(active) && !isAbortError(error)) {
        setFieldError(readableError(error));
      }
    } finally {
      finishQuestionOperation(active);
    }
  }

  async function handleSkip() {
    if (questionOperationRef.current) return;
    const active =
      started && activeQuestion && isLearnerProfileRoute
        ? beginQuestionOperation("skip", "saving")
        : null;
    const operation = active?.operation ?? nextOperation();
    setLoadError("");
    setFieldError("");
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
      if (data) setFieldError(message);
      else setLoadError(message);
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
    if (!redoLearnerProfile && !isActiveProfileRoute()) return;
    setPendingAcknowledgment(null);
    clearProfileEditor();
    profileRouteLifecycleRef.current?.markExitHandled();
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
    setProfileDrafts((current) =>
      updateProfileDraft(current, answerKey, value),
    );
    setProfileFieldError(answerKey, "");
  }

  async function handleProfileSave() {
    const expectedProfileId = fullData?.profile.id;
    if (!profileState || !expectedProfileId || !isActiveProfileRoute()) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller, operation } = profileOperation;
    let acknowledgmentOwnsOperation = false;
    setIsProfileSaving(true);
    setProfileFieldErrors({});
    setProfilePageError("");
    try {
      const answers = {
        name: profileDrafts.name ?? "",
        age: profileDrafts.age ?? "",
        description: profileDrafts.description ?? "",
      };
      const saved = await saveProfileAnswers(answers, {
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
      if (isCurrent) setIsProfileSaving(false);
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

  const canEditProfile = Boolean(
    fullData &&
      (guardianRoute ||
        fullData.canBypass ||
        fullData.profile.profileStatus === "completed"),
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
    if (data?.mode === "selection-required") {
      return {
        error: "",
        guardianUnlockDestination: guardianUnlockDestination ?? null,
        learnerName: null,
        onOpenProfile: null,
      };
    }
    return fullData && fullData.profile.profileStatus === "completed"
      ? {
          error: "",
          learnerName: fullData.profile.name,
          onOpenProfile:
            canEditProfile && !isProfileRoute ? onOpenProfileRoute : null,
        }
      : null;
  }, [
    canEditProfile,
    data?.mode,
    fullData,
    guardianUnlockDestination,
    isProfileRoute,
    onOpenProfileRoute,
  ]);
  useProfileAccountAction(profileAction);

  const progress = fullData?.progress ?? { answered: 0, current: 0, total: 0 };
  const questionProps: QuestionProps | null = activeQuestion
    ? {
        fieldError,
        mode: "learner-profile",
        onReplay: () => void handleReplay(),
        onSkip: () => void handleSkip(),
        onSkipQuestion: () => void handleSkipQuestion(),
        onSubmit: () => void handleSubmit(),
        onTranscribe: () => void handleTranscribe(),
        onValueChange: (value) => {
          setDraft(value);
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
        mode: "profile",
        onBack: closeRedoProfileQuestions,
        onReplay: () => void handleRedoReplay(),
        onSkip() {},
        onSkipQuestion() {},
        onSubmit: () => void handleRedoQuestionSubmit(),
        onTranscribe: () => void handleRedoTranscribe(),
        onValueChange: (value) => {
          setDraft(value);
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
    data?.mode === "full" ? (
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

  return (
    <LearnerSelectionProvider
      activeProfileId={data?.mode === "full" ? data.profile.id : null}
      reloadSelectedLearner={reloadSelectedLearner}
    >
      <LearnerProfileGateView
      acknowledgment={acknowledgment}
      completedLearnerProfileFallback={completedLearnerProfileFallback}
      conversationProps={
        selectedExperience === "realtime" ? conversationProps : null
      }
        data={data}
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
              onCancel: closeProfileEditor,
              onClose: closeProfileEditor,
              onRedoLearnerProfile: handleRedoLearnerProfile,
              onSave: () => void handleProfileSave(),
              onValueChange: handleProfileValueChange,
              pageError: profilePageError,
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
    </LearnerSelectionProvider>
  );
}
