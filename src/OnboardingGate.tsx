import {
  useCallback,
  useEffect,
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

type QuestionProps = ComponentProps<typeof OnboardingQuestionView>;
type ProfileEditorProps = ComponentProps<typeof ProfileEditorView>;

type AcknowledgmentView = {
  acknowledgment: Acknowledgment;
  operationId: number;
};

type OnboardingGateViewProps = {
  acknowledgment: AcknowledgmentView | null;
  children: ReactNode;
  data: OnboardingState | null;
  isLoading: boolean;
  loadError: string;
  onAcknowledgmentNext: () => void;
  onRetry: () => void;
  onSkip: () => void;
  onStart: () => void;
  profileEditor: ProfileEditorProps | null;
  questionProps: QuestionProps | null;
  started: boolean;
};

export function OnboardingGateView({
  acknowledgment,
  children,
  data,
  isLoading,
  loadError,
  onAcknowledgmentNext,
  onRetry,
  onSkip,
  onStart,
  profileEditor,
  questionProps,
  started,
}: OnboardingGateViewProps) {
  const fullData = data?.mode === "full" ? data : null;

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

  if (profileEditor) return <ProfileEditorView {...profileEditor} />;

  if (data?.canBypass || fullData?.profile.onboardingStatus === "completed") {
    return <>{children}</>;
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
      operationId: number;
      acknowledgments: Acknowledgment[];
      index: number;
      next: ProfileState;
    };

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [started, setStarted] = useState(false);
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
  const [profileLoadError, setProfileLoadError] = useState("");
  const [pendingAcknowledgment, setPendingAcknowledgment] =
    useState<PendingAcknowledgment | null>(null);
  const operationRef = useRef(0);
  const profileCaptureRef = useRef<AbortController | null>(null);

  const cancelProfileCapture = useCallback(() => {
    profileCaptureRef.current?.abort();
    profileCaptureRef.current = null;
  }, []);

  const nextOperation = useCallback(() => {
    operationRef.current += 1;
    return operationRef.current;
  }, []);

  const isCurrentOperation = useCallback(
    (operation: number) => operationRef.current === operation,
    [],
  );

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
      nextOperation();
      controller.abort();
      cancelProfileCapture();
    };
  }, [cancelProfileCapture, nextOperation, refresh]);

  const fullData: FullOnboardingState | null =
    data?.mode === "full" ? data : null;
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
    setProfileState(null);
    setProfileDrafts({});
    setProfileFieldErrors({});
    setProfileFieldStatuses({});
    setProfilePageError("");
    setIsProfileSaving(false);
  }, []);

  const closeProfileEditor = useCallback(() => {
    cancelProfileCapture();
    nextOperation();
    setPendingAcknowledgment(null);
    clearProfileEditor();
  }, [cancelProfileCapture, clearProfileEditor, nextOperation]);

  const handleOpenProfile = useCallback(async () => {
    const operation = nextOperation();
    setProfileLoadError("");
    try {
      const profile = await loadProfile();
      if (!isCurrentOperation(operation)) return;
      setProfileState(profile);
      setProfileDrafts(profileDraftsFromState(profile));
      setProfileFieldErrors({});
      setProfileFieldStatuses({});
      setProfilePageError("");
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setProfileLoadError(readableError(error));
      }
    }
  }, [isCurrentOperation, nextOperation]);

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
    if (!question.audio) return;
    const operation = nextOperation();
    setProfileFieldStatuses({});
    setProfileFieldError(question.answerKey, "");
    try {
      await replayOnboardingQuestion(question.audio);
    } catch {
      if (isCurrentOperation(operation)) {
        setProfileFieldError(
          question.answerKey,
          "Audio is unavailable. Please try Replay again.",
        );
      }
    }
  }

  async function handleProfileTranscribe(question: OnboardingQuestion) {
    cancelProfileCapture();
    const controller = new AbortController();
    profileCaptureRef.current = controller;
    const operation = nextOperation();
    const isCurrentCapture = () =>
      isCurrentOperation(operation) &&
      profileCaptureRef.current === controller &&
      !controller.signal.aborted;
    setProfileFieldError(question.answerKey, "");
    setProfileFieldStatuses({ [question.answerKey]: "recording" });
    try {
      const transcript = await captureOnboardingAnswer({
        record: (options) => recordSpeechClip(options),
        signal: controller.signal,
        transcribe: async (audio, options) => {
          if (isCurrentCapture()) {
            setProfileFieldStatus(question.answerKey, "transcribing");
          }
          return transcribeOnboardingAudio(audio, options);
        },
      });
      if (isCurrentCapture()) {
        handleProfileValueChange(question.answerKey, transcript);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (isCurrentCapture()) {
        setProfileFieldError(
          question.answerKey,
          `${readableError(error)} You can still type your answer.`,
        );
      }
    } finally {
      if (profileCaptureRef.current === controller) {
        profileCaptureRef.current = null;
        setProfileFieldStatus(question.answerKey, "idle");
      }
    }
  }

  async function handleProfileSave() {
    if (!profileState) return;
    const operation = nextOperation();
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
      const saved = await saveProfileAnswers(answers);
      if (!isCurrentOperation(operation)) return;
      setProfileState(saved);
      if (saved.acknowledgments?.length) {
        setPendingAcknowledgment({
          kind: "profile",
          operationId: operation,
          acknowledgments: saved.acknowledgments,
          index: 0,
          next: saved,
        });
      } else {
        clearProfileEditor();
        void refresh();
      }
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      const errors = error instanceof OnboardingApiError ? error.fieldErrors : {};
      setProfileFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setProfilePageError(readableError(error));
      }
    } finally {
      if (isCurrentOperation(operation)) setIsProfileSaving(false);
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

    nextOperation();
    setPendingAcknowledgment(null);
    clearProfileEditor();
    void refresh();
  }

  const canEditProfile = Boolean(
    fullData &&
      (fullData.canBypass || fullData.profile.onboardingStatus === "completed"),
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

  const acknowledgment = pendingAcknowledgment
    ? {
        acknowledgment:
          pendingAcknowledgment.kind === "onboarding"
            ? pendingAcknowledgment.acknowledgment
            : pendingAcknowledgment.acknowledgments[
                pendingAcknowledgment.index
              ],
        operationId: pendingAcknowledgment.operationId,
      }
    : null;

  return (
    <OnboardingGateView
      acknowledgment={acknowledgment}
      data={data}
      isLoading={isLoading}
      loadError={loadError}
      onAcknowledgmentNext={handleAcknowledgmentNext}
      onRetry={() => void refresh()}
      onSkip={() => void handleSkip()}
      onStart={() => void handleStart()}
      profileEditor={
        profileState
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
      questionProps={profileState ? null : questionProps}
      started={started}
    >
      {children}
    </OnboardingGateView>
  );
}
