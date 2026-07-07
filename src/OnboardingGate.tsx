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
import {
  loadOnboarding,
  loadProfile,
  OnboardingApiError,
  saveOnboardingAnswer,
  saveProfileAnswers,
  skipOnboarding,
  skipOnboardingQuestion,
  transcribeOnboardingAudio,
  type FullOnboardingState,
  type LearnerProfileSummary,
  type OnboardingAcknowledgment as Acknowledgment,
  type OnboardingQuestion,
  type OnboardingState,
  type ProfileState,
} from "./onboarding-api";
import { OnboardingAcknowledgment } from "./OnboardingAcknowledgment";
import {
  OnboardingQuestionView,
  captureOnboardingAnswer,
  playOnboardingStart,
  replayOnboardingQuestion,
  type QuestionStatus,
} from "./OnboardingQuestion";
import { ProfileEditorView } from "./ProfileEditor";
import { recordSpeechClip } from "./speech-recorder";
import { ConversationSurface } from "./ConversationSurface";
import {
  selectOnboardingExperience,
  useConversationOnboarding,
} from "./useConversationOnboarding";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type QuestionProps = ComponentProps<typeof OnboardingQuestionView>;
type ProfileEditorProps = ComponentProps<typeof ProfileEditorView>;
type ConversationProps = ComponentProps<typeof ConversationSurface>;

type AcknowledgmentView = {
  acknowledgment: Acknowledgment;
  operationId: number;
};

type OnboardingGateViewProps = {
  acknowledgment: AcknowledgmentView | null;
  children: ReactNode;
  completedOnboardingFallback: ReactNode;
  conversationProps: ConversationProps | null;
  data: OnboardingState | null;
  isOnboardingRoute: boolean;
  isProfileLoading: boolean;
  isProfileRoute: boolean;
  isLoading: boolean;
  loadError: string;
  onAcknowledgmentNext: () => void;
  onCloseProfileRoute: () => void;
  onRetry: () => void;
  onRetryProfile: () => void;
  onSkip: () => void;
  onStart: () => void;
  onboardingFallback: ReactNode;
  profileEditor: ProfileEditorProps | null;
  profileLoadError: string;
  questionProps: QuestionProps | null;
  started: boolean;
};

export function OnboardingGateView({
  acknowledgment,
  children,
  completedOnboardingFallback,
  conversationProps,
  data,
  isOnboardingRoute,
  isProfileLoading,
  isProfileRoute,
  isLoading,
  loadError,
  onAcknowledgmentNext,
  onCloseProfileRoute,
  onRetry,
  onRetryProfile,
  onSkip,
  onStart,
  onboardingFallback,
  profileEditor,
  profileLoadError,
  questionProps,
  started,
}: OnboardingGateViewProps) {
  const fullData = data?.mode === "full" ? data : null;
  const onboardingComplete = Boolean(
    fullData &&
      (fullData.canBypass ||
        fullData.profile.onboardingStatus === "completed"),
  );
  const canAccessProtectedRoutes = Boolean(data?.canBypass || onboardingComplete);
  const canEditProfile = onboardingComplete;

  if (isLoading) {
    return (
      <main className="onboarding-screen">
        <section aria-busy="true" className="onboarding-status-card" role="status">
          <p>Loading your questions…</p>
        </section>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="onboarding-screen">
        <section className="onboarding-status-card" role="alert">
          <h1>Questions are taking a break</h1>
          <p>{loadError}</p>
          <div className="onboarding-form-actions">
            <button className="onboarding-skip-button" onClick={onSkip} type="button">
              Skip for now
            </button>
            <button className="onboarding-next-button" onClick={onRetry} type="button">
              Retry
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (acknowledgment) {
    return (
      <main className="onboarding-screen">
        <OnboardingAcknowledgment
          acknowledgment={acknowledgment.acknowledgment}
          onNext={onAcknowledgmentNext}
          operationId={acknowledgment.operationId}
        />
      </main>
    );
  }

  if (data && !canAccessProtectedRoutes && !isOnboardingRoute) {
    return <>{onboardingFallback}</>;
  }

  if (canAccessProtectedRoutes && isOnboardingRoute) {
    return <>{completedOnboardingFallback}</>;
  }

  if (canAccessProtectedRoutes && isProfileRoute && !canEditProfile) {
    return <>{completedOnboardingFallback}</>;
  }

  if (isProfileRoute && canEditProfile) {
    if (isProfileLoading) {
      return (
        <main className="onboarding-screen">
          <section
            aria-busy="true"
            className="onboarding-status-card"
            role="status"
          >
            <p>Loading your profile…</p>
          </section>
        </main>
      );
    }

    if (profileLoadError) {
      return (
        <main className="onboarding-screen">
          <section className="onboarding-status-card" role="alert">
            <h1>Profile is taking a break</h1>
            <p>{profileLoadError}</p>
            <div className="onboarding-form-actions">
              <button
                className="onboarding-skip-button"
                onClick={onCloseProfileRoute}
                type="button"
              >
                Back to main menu
              </button>
              <button
                className="onboarding-next-button"
                onClick={onRetryProfile}
                type="button"
              >
                Retry
              </button>
            </div>
          </section>
        </main>
      );
    }

    if (profileEditor) return <ProfileEditorView {...profileEditor} />;

    return (
      <main className="onboarding-screen">
        <section aria-busy="true" className="onboarding-status-card" role="status">
          <p>Loading your profile…</p>
        </section>
      </main>
    );
  }

  if (canAccessProtectedRoutes) {
    return <>{children}</>;
  }

  if (fullData && conversationProps) {
    return <ConversationSurface {...conversationProps} />;
  }

  if (fullData && !started) {
    return (
      <main className="onboarding-screen">
        <section className="onboarding-start-card">
          <img
            alt="Peppa waving hello"
            className="onboarding-start-peppa"
            src="/assets/characters/peppa/peppa-happy.webp"
          />
          <p className="onboarding-eyebrow">PARROT ENGLISH</p>
          <h1>Meet Peppa</h1>
          <p>
            Answer six quick questions so your English practice can feel more like
            you.
          </p>
          <button className="onboarding-start-button" onClick={onStart} type="button">
            Start
          </button>
          <button className="onboarding-skip-button" onClick={onSkip} type="button">
            Skip for now
          </button>
        </section>
      </main>
    );
  }

  if (questionProps) {
    return (
      <main className="onboarding-screen">
        <OnboardingQuestionView {...questionProps} />
      </main>
    );
  }

  return (
    <main className="onboarding-screen">
      <section aria-busy="true" className="onboarding-status-card" role="status">
        <p>Finishing your profile…</p>
      </section>
    </main>
  );
}

type ProfileWithAnswers = Pick<LearnerProfileSummary, "age" | "answers" | "name">;

export function answerForQuestion(
  profile: ProfileWithAnswers,
  question: Pick<OnboardingQuestion, "answerKey">,
) {
  const saved = profile.answers.responses[question.answerKey]?.rawAnswer;
  if (saved) return saved;
  if (question.answerKey === "name") return profile.name ?? "";
  if (question.answerKey === "age") return profile.age?.toString() ?? "";
  return "";
}

export function shouldSyncActiveQuestion(
  profile: ProfileWithAnswers | null,
  question: Pick<OnboardingQuestion, "answerKey"> | null,
) {
  return Boolean(profile && question);
}

export function profileDraftsFromState(profileState: ProfileState) {
  return Object.fromEntries(
    profileState.questions.map((question) => [
      question.answerKey,
      answerForQuestion(profileState.profile, question),
    ]),
  );
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
  save = saveOnboardingAnswer,
}: {
  questionKey: string;
  rawAnswer: string;
  save?: (questionKey: string, rawAnswer: string) => Promise<OnboardingState>;
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
      kind: "onboarding";
      operationId: number;
      acknowledgment: Acknowledgment;
      next: OnboardingState;
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

type OnboardingGateProps = {
  children: ReactNode;
  completedOnboardingFallback: ReactNode;
  isOnboardingRoute: boolean;
  isProfileRoute: boolean;
  onboardingFallback: ReactNode;
  onCloseProfileRoute: () => void;
  onOpenProfileRoute: () => void;
};

export function OnboardingGate({
  children,
  completedOnboardingFallback,
  isOnboardingRoute,
  isProfileRoute,
  onboardingFallback,
  onCloseProfileRoute,
  onOpenProfileRoute,
}: OnboardingGateProps) {
  const [data, setData] = useState<OnboardingState | null>(null);
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
  const [profileFieldStatuses, setProfileFieldStatuses] = useState<
    Record<string, QuestionStatus>
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
        const next = await loadOnboarding({ signal });
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

  const fullData: FullOnboardingState | null =
    data?.mode === "full" ? data : null;
  const selectedExperience = fullData
    ? selectOnboardingExperience(fullData.experienceMode, useFormFallback)
    : "form";
  const handleUseFormFallback = useCallback(() => {
    setUseFormFallback(true);
    setStarted(false);
  }, []);
  const handleConversationCompleted = useCallback(async () => {
    await refresh();
  }, [refresh]);
  const conversationProps = useConversationOnboarding({
    active: Boolean(
      isOnboardingRoute &&
        selectedExperience === "realtime" &&
        fullData &&
        !fullData.canBypass &&
        fullData.profile.onboardingStatus !== "completed",
    ),
    onCompleted: handleConversationCompleted,
    onUseForm: handleUseFormFallback,
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
      await playOnboardingStart({ questionAudio: fullData.question.audio });
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
      await replayOnboardingQuestion(activeQuestion.audio);
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
      const transcript = await captureOnboardingAnswer({
        record: () => recordSpeechClip(),
        transcribe: async (audio) => {
          if (isCurrentOperation(operation)) setStatus("transcribing");
          return transcribeOnboardingAudio(audio);
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
        kind: "onboarding",
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
      const next = await skipOnboarding();
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
      const next = await skipOnboardingQuestion(activeQuestion.answerKey);
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
    setProfileFieldStatuses({});
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
      setProfileFieldStatuses({});
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

  function setProfileFieldStatus(answerKey: string, nextStatus: QuestionStatus) {
    setProfileFieldStatuses((current) => ({
      ...current,
      [answerKey]: nextStatus,
    }));
  }

  function handleProfileValueChange(answerKey: string, value: string) {
    setProfileDrafts((current) => updateProfileDraft(current, answerKey, value));
    setProfileFieldError(answerKey, "");
  }

  async function handleProfileReplay(question: OnboardingQuestion) {
    if (!question.audio || !isActiveProfileRoute()) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller } = profileOperation;
    setProfileFieldStatuses({});
    setProfileFieldError(question.answerKey, "");
    try {
      await replayOnboardingQuestion(question.audio, {
        signal: controller.signal,
      });
      if (!isCurrentProfileOperation(profileOperation)) return;
    } catch {
      if (isCurrentProfileOperation(profileOperation)) {
        setProfileFieldError(
          question.answerKey,
          "Audio is unavailable. Please try Replay again.",
        );
      }
    } finally {
      boundary.finish(controller);
    }
  }

  async function handleProfileTranscribe(question: OnboardingQuestion) {
    if (!isActiveProfileRoute()) return;
    const boundary = profileOperationBoundaryRef.current;
    if (!boundary) return;
    const profileOperation = boundary.begin();
    const { controller } = profileOperation;
    setProfileFieldError(question.answerKey, "");
    setProfileFieldStatuses({ [question.answerKey]: "recording" });
    try {
      const transcript = await captureOnboardingAnswer({
        record: (options) => recordSpeechClip(options),
        signal: controller.signal,
        transcribe: async (audio, options) => {
          if (isCurrentProfileOperation(profileOperation)) {
            setProfileFieldStatus(question.answerKey, "transcribing");
          }
          return transcribeOnboardingAudio(audio, options);
        },
      });
      if (isCurrentProfileOperation(profileOperation)) {
        handleProfileValueChange(question.answerKey, transcript);
      }
    } catch (error) {
      if (!isCurrentProfileOperation(profileOperation)) return;
      if (error instanceof Error && error.name === "AbortError") return;
      setProfileFieldError(
        question.answerKey,
        `${readableError(error)} You can still type your answer.`,
      );
    } finally {
      const isCurrent = isCurrentProfileOperation(profileOperation);
      boundary.finish(controller);
      if (isCurrent) {
        setProfileFieldStatus(question.answerKey, "idle");
      }
    }
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
    setProfileFieldStatuses({});
    setProfilePageError("");
    try {
      const answers = Object.fromEntries(
        profileState.questions.map((question) => [
          question.answerKey,
          profileDrafts[question.answerKey] ?? "",
        ]),
      );
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
      const errors = error instanceof OnboardingApiError ? error.fieldErrors : {};
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
    if (pending.kind === "onboarding") {
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
      (fullData.canBypass || fullData.profile.onboardingStatus === "completed"),
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
        mode: "onboarding",
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
  if (pendingAcknowledgment?.kind === "onboarding" && isOnboardingRoute) {
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
    <OnboardingGateView
      acknowledgment={acknowledgment}
      completedOnboardingFallback={completedOnboardingFallback}
      conversationProps={
        selectedExperience === "realtime" ? conversationProps : null
      }
      data={data}
      isOnboardingRoute={isOnboardingRoute}
      isProfileLoading={isProfileLoading}
      isProfileRoute={isProfileRoute}
      isLoading={isLoading}
      loadError={loadError}
      onAcknowledgmentNext={handleAcknowledgmentNext}
      onCloseProfileRoute={closeProfileEditor}
      onRetry={() => void refresh()}
      onRetryProfile={() => void handleOpenProfile()}
      onSkip={() => void handleSkip()}
      onStart={() => void handleStart()}
      onboardingFallback={onboardingFallback}
      profileEditor={
        isProfileRoute && profileState
          ? {
              drafts: profileDrafts,
              fieldErrors: profileFieldErrors,
              fieldStatuses: profileFieldStatuses,
              isSaving: isProfileSaving,
              onCancel: closeProfileEditor,
              onClose: closeProfileEditor,
              onReplay: (question) => void handleProfileReplay(question),
              onSave: () => void handleProfileSave(),
              onTranscribe: (question) =>
                void handleProfileTranscribe(question),
              onValueChange: handleProfileValueChange,
              pageError: profilePageError,
              questions: profileState.questions,
            }
          : null
      }
      profileLoadError={profileLoadError}
      questionProps={isProfileRoute && profileState ? null : questionProps}
      started={started}
    >
      {children}
    </OnboardingGateView>
  );
}
