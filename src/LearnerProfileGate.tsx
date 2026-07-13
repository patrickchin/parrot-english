import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useProfileAccountAction } from "./account-actions";
import { selectConversationPurpose } from "../lib/conversation-purpose";
import {
  loadLearnerProfile,
  loadProfile,
  LearnerProfileApiError,
  saveLearnerProfileAnswer,
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
  LearnerProfileScreen,
  LearnerProfileStatusCard,
} from "./LearnerProfileLayout";
import {
  LearnerProfileQuestionView,
  captureLearnerProfileAnswer,
  playLearnerProfileStart,
  replayLearnerProfileQuestion,
} from "./LearnerProfileQuestion";
import { ProfileEditorView } from "./ProfileEditor";
import { recordSpeechClip } from "./speech-recorder";
import { ConversationSurface } from "./ConversationSurface";
import {
  selectLearnerProfileExperience,
  usePeppaConversation,
} from "./usePeppaConversation";
import { ActionButton, TextButton } from "./ui";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type QuestionProps = ComponentProps<typeof LearnerProfileQuestionView>;
type ProfileEditorProps = ComponentProps<typeof ProfileEditorView>;
type ConversationProps = ComponentProps<typeof ConversationSurface>;

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
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
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
  questionProps: QuestionProps | null;
  redoLearnerProfile: boolean;
  started: boolean;
};

export function LearnerProfileGateView({
  acknowledgment,
  children,
  completedLearnerProfileFallback,
  conversationProps,
  data,
  isConversationRoute,
  isLearnerProfileRoute,
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
  questionProps,
  redoLearnerProfile,
  started,
}: LearnerProfileGateViewProps) {
  const fullData = data?.mode === "full" ? data : null;
  const learnerProfileComplete = Boolean(
    fullData &&
      (fullData.canBypass ||
        fullData.profile.profileStatus === "completed"),
  );
  const canAccessProtectedRoutes = Boolean(data?.canBypass || learnerProfileComplete);
  const canEditProfile = learnerProfileComplete;

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
            {isConversationRoute ? (
              <TextButton
                onClick={onCloseConversationRoute}
                type="button"
              >
                Back to main menu
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

  if (canAccessProtectedRoutes && isLearnerProfileRoute && !redoLearnerProfile) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if (canAccessProtectedRoutes && isProfileRoute && !canEditProfile) {
    return <>{completedLearnerProfileFallback}</>;
  }

  if (isProfileRoute && canEditProfile) {
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
              <TextButton
                onClick={onCloseProfileRoute}
                type="button"
              >
                Back to main menu
              </TextButton>
              <ActionButton onClick={onRetryProfile} type="button">
                Retry
              </ActionButton>
            </div>
          </LearnerProfileStatusCard>
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
        <LearnerProfileCard className="grid justify-items-center gap-4 p-7 text-center sm:p-12">
          <img
            alt="Peppa waving hello"
            className="max-h-56 w-36 animate-float object-contain drop-shadow-lg motion-reduce:animate-none sm:w-52"
            src="/assets/characters/peppa/peppa-happy.webp"
          />
          <h1 className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl">
            Meet Peppa
          </h1>
          <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600">
            Answer six quick questions so your English practice can feel more like
            you.
          </p>
          <ActionButton className="mt-2 text-lg" onClick={onStart} type="button">
            Start
          </ActionButton>
          <TextButton onClick={onSkip} type="button">
            Skip for now
          </TextButton>
        </LearnerProfileCard>
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

type ProfileWithAnswers = Pick<LearnerProfileSummary, "age" | "answers" | "name">;

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
}: {
  questionKey: string;
  rawAnswer: string;
  save?: (questionKey: string, rawAnswer: string) => Promise<LearnerProfileState>;
}) {
  return save(questionKey, rawAnswer);
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

export function createProfileOperationBoundary(
  nextOperation: () => number,
) {
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
  isConversationRoute: boolean;
  isLearnerProfileRoute: boolean;
  isProfileRoute: boolean;
  learnerProfileFallback: ReactNode;
  onCloseProfileRoute: () => void;
  onConversationCompleted: () => void;
  onOpenProfileRoute: () => void;
  onRedoCompleted: () => void;
  onRedoLearnerProfileRoute: () => void;
  redoLearnerProfile: boolean;
};

export function LearnerProfileGate({
  children,
  completedLearnerProfileFallback,
  isConversationRoute,
  isLearnerProfileRoute,
  isProfileRoute,
  learnerProfileFallback,
  onCloseProfileRoute,
  onConversationCompleted,
  onOpenProfileRoute,
  onRedoCompleted,
  onRedoLearnerProfileRoute,
  redoLearnerProfile,
}: LearnerProfileGateProps) {
  const [data, setData] = useState<LearnerProfileState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [started, setStarted] = useState(false);
  const [useFormFallback, setUseFormFallback] = useState(false);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [status, setStatus] = useState<QuestionProps["status"]>("idle");
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, string>>({});
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

  const nextOperation = useCallback(() => {
    operationRef.current += 1;
    return operationRef.current;
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
  profileOperationOwnershipRef.current.setProfileRoute(isProfileRoute);

  const teardownProfileResources = useCallback(() => {
    teardownProfileOperationResources({
      boundary: profileOperationBoundaryRef.current,
      invalidateOperation: nextOperation,
      resetLoadOperation: () => {
        profileLoadOperationRef.current = null;
      },
    });
  }, [nextOperation]);

  const isCurrentOperation = useCallback(
    (operation: number) => operationRef.current === operation,
    [],
  );

  const isCurrentProfileOperation = useCallback(
    (profileOperation: ProfileOperation) =>
      profileOperationOwnershipRef.current?.isCurrent(profileOperation) ?? false,
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
      teardownProfileResources();
    };
  }, [teardownProfileResources]);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const operation = nextOperation();
      setIsLoading(true);
      setLoadError("");
      try {
        const next = await loadLearnerProfile({ signal });
        if (isCurrentOperation(operation)) setData(next);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (isCurrentOperation(operation)) setLoadError(readableError(error));
      } finally {
        if (isCurrentOperation(operation) && !signal?.aborted) setIsLoading(false);
      }
    },
    [isCurrentOperation, nextOperation],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
    };
  }, [refresh]);

  const fullData: FullLearnerProfileState | null =
    data?.mode === "full" ? data : null;
  const selectedExperience = fullData
    ? selectLearnerProfileExperience(fullData.experienceMode, useFormFallback)
    : "form";
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
      (fullData.canBypass ||
        fullData.profile.profileStatus === "completed"),
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
    onCompleted: handleConversationCompleted,
    purpose: conversationPurpose,
  });
  const activeQuestion = fullData?.question ?? null;
  const activeProfile = fullData?.profile ?? null;
  const activeQuestionKey = activeQuestion?.answerKey ?? "";

  useEffect(() => {
    if (!shouldSyncActiveQuestion(activeProfile, activeQuestion)) return;
    nextOperation();
    setDraft(answerForQuestion(activeProfile!, activeQuestion!));
    setFieldError("");
    setStatus("idle");
  }, [activeProfile, activeQuestion, activeQuestionKey, nextOperation]);

  async function handleStart() {
    if (!fullData?.question) return;
    const operation = nextOperation();
    setStarted(true);
    setFieldError("");
    if (!fullData.question.audio) return;
    try {
      await playLearnerProfileStart({ questionAudio: fullData.question.audio });
    } catch {
      if (isCurrentOperation(operation)) {
        setFieldError("Audio is unavailable. You can keep going or use Replay.");
      }
    }
  }

  async function handleReplay() {
    if (!activeQuestion?.audio) return;
    const operation = nextOperation();
    setFieldError("");
    try {
      await replayLearnerProfileQuestion(activeQuestion.audio);
    } catch {
      if (isCurrentOperation(operation)) {
        setFieldError("Audio is unavailable. Please try Replay again.");
      }
    }
  }

  async function handleTranscribe() {
    if (!activeQuestion) return;
    const operation = nextOperation();
    setFieldError("");
    setStatus("recording");
    try {
      const transcript = await captureLearnerProfileAnswer({
        record: () => recordSpeechClip(),
        transcribe: async (audio) => {
          if (isCurrentOperation(operation)) setStatus("transcribing");
          return transcribeLearnerProfileAudio(audio);
        },
      });
      if (isCurrentOperation(operation)) setDraft(transcript);
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setFieldError(`${readableError(error)} You can still type your answer.`);
      }
    } finally {
      if (isCurrentOperation(operation)) setStatus("idle");
    }
  }

  async function handleSubmit() {
    if (!activeQuestion) return;
    const operation = nextOperation();
    setStatus("saving");
    setFieldError("");
    try {
      const next = await saveQuestionAndAdvance({
        questionKey: activeQuestion.answerKey,
        rawAnswer: draft,
      });
      if (!isCurrentOperation(operation)) return;
      if (next.mode !== "full" || !next.acknowledgment) {
        throw new Error("Peppa could not answer just now.");
      }
      setPendingAcknowledgment({
        kind: "learner-profile",
        operationId: operation,
        acknowledgment: next.acknowledgment,
        next,
      });
    } catch (error) {
      if (isCurrentOperation(operation)) setFieldError(readableError(error));
    } finally {
      if (isCurrentOperation(operation)) setStatus("idle");
    }
  }

  async function handleSkip() {
    const operation = nextOperation();
    setLoadError("");
    setFieldError("");
    try {
      const next = await skipLearnerProfile();
      if (isCurrentOperation(operation)) setData(next);
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      const message = readableError(error);
      if (data) setFieldError(message);
      else setLoadError(message);
    }
  }

  async function handleSkipQuestion() {
    if (!activeQuestion || activeQuestion.required) return;
    const operation = nextOperation();
    setStatus("saving");
    setFieldError("");
    try {
      const next = await skipLearnerProfileQuestion(activeQuestion.answerKey);
      if (isCurrentOperation(operation)) setData(next);
    } catch (error) {
      if (isCurrentOperation(operation)) setFieldError(readableError(error));
    } finally {
      if (isCurrentOperation(operation)) setStatus("idle");
    }
  }

  const clearProfileEditor = useCallback(() => {
    teardownProfileResources();
    setProfileState(null);
    setProfileDrafts({});
    setProfileFieldErrors({});
    setProfilePageError("");
    setIsProfileSaving(false);
    setIsProfileLoading(false);
    setProfileLoadError("");
  }, [teardownProfileResources]);

  const handleProfileRouteExit = useCallback(() => {
    setPendingAcknowledgment((current) =>
      current?.kind === "profile" ? null : current,
    );
    clearProfileEditor();
  }, [clearProfileEditor]);

  if (!profileRouteLifecycleRef.current) {
    profileRouteLifecycleRef.current = createProfileRouteLifecycle(
      isProfileRoute,
      { onExit: handleProfileRouteExit },
    );
  }

  useEffect(() => {
    profileRouteLifecycleRef.current?.update(isProfileRoute);
  }, [isProfileRoute]);

  const closeProfileEditor = useCallback(() => {
    if (!isActiveProfileRoute()) return;
    setPendingAcknowledgment(null);
    clearProfileEditor();
    profileRouteLifecycleRef.current?.markExitHandled();
    onCloseProfileRoute();
  }, [clearProfileEditor, isActiveProfileRoute, onCloseProfileRoute]);

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
    if (
      !isActiveProfileRoute() ||
      profileLoadOperationRef.current !== null
    ) {
      return;
    }
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
      setProfileState(profile);
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
  }, [isActiveProfileRoute, isCurrentProfileOperation]);

  function setProfileFieldError(answerKey: string, message: string) {
    setProfileFieldErrors((current) => ({ ...current, [answerKey]: message }));
  }

  function handleProfileValueChange(answerKey: string, value: string) {
    setProfileDrafts((current) => updateProfileDraft(current, answerKey, value));
    setProfileFieldError(answerKey, "");
  }

  async function handleProfileSave() {
    if (!profileState || !isActiveProfileRoute()) return;
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
      const errors = error instanceof LearnerProfileApiError ? error.fieldErrors : {};
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
      (fullData.canBypass || fullData.profile.profileStatus === "completed"),
  );
  useEffect(() => {
    if (
      !isProfileRoute ||
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
    isProfileRoute,
    profileLoadError,
    profileState,
  ]);

  const profileAction = useMemo(
    () =>
      canEditProfile
        ? {
            error: "",
            onOpen: onOpenProfileRoute,
          }
        : null,
    [canEditProfile, onOpenProfileRoute],
  );
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
        onValueChange: setDraft,
        progress,
        question: activeQuestion,
        status,
        value: draft,
      }
    : null;

  let acknowledgment: AcknowledgmentView | null = null;
  if (pendingAcknowledgment?.kind === "learner-profile" && isLearnerProfileRoute) {
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

  return (
    <LearnerProfileGateView
      acknowledgment={acknowledgment}
      completedLearnerProfileFallback={completedLearnerProfileFallback}
      conversationProps={
        selectedExperience === "realtime" ? conversationProps : null
      }
      data={data}
      isConversationRoute={isConversationRoute}
      isLearnerProfileRoute={isLearnerProfileRoute}
      isProfileLoading={isProfileLoading}
      isProfileRoute={isProfileRoute}
      isLoading={isLoading}
      loadError={loadError}
      onAcknowledgmentNext={handleAcknowledgmentNext}
      onCloseConversationRoute={onConversationCompleted}
      onCloseProfileRoute={closeProfileEditor}
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
      questionProps={isProfileRoute && profileState ? null : questionProps}
      redoLearnerProfile={redoLearnerProfile}
      started={started}
    >
      {children}
    </LearnerProfileGateView>
  );
}
