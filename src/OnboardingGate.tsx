import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  loadOnboarding,
  loadProfile,
  saveOnboardingAnswer,
  saveProfileAnswer,
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
import {
  OnboardingQuestionView,
  captureOnboardingAnswer,
  playOnboardingStart,
  replayOnboardingQuestion,
} from "./OnboardingQuestion";
import { OnboardingAcknowledgment } from "./OnboardingAcknowledgment";
import { recordSpeechClip } from "./speech-recorder";

type QuestionProps = ComponentProps<typeof OnboardingQuestionView>;

type ProfileEditorView = {
  current: number;
  questionProps: QuestionProps;
  total: number;
};

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
  onCloseProfile: () => void;
  onOpenProfile: () => void;
  onRetry: () => void;
  onSkip: () => void;
  onStart: () => void;
  profileEditor: ProfileEditorView | null;
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
  onCloseProfile,
  onOpenProfile,
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

  if (profileEditor) {
    return (
      <main className="onboarding-screen onboarding-profile-screen">
        <section className="onboarding-profile-shell">
          <header className="onboarding-profile-heading">
            <div>
              <p>
                Question {profileEditor.current} of {profileEditor.total}
              </p>
              <h1>Edit profile</h1>
            </div>
            <button
              aria-label="Close profile editor"
              className="onboarding-icon-button"
              onClick={onCloseProfile}
              type="button"
            >
              ×
            </button>
          </header>
          <OnboardingQuestionView {...profileEditor.questionProps} />
        </section>
      </main>
    );
  }

  if (data?.canBypass || fullData?.profile.onboardingStatus === "completed") {
    return (
      <>
        {children}
        {fullData ? (
          <button
            aria-label="Edit learner profile"
            className="profile-edit-button"
            onClick={onOpenProfile}
            type="button"
          >
            Profile
          </button>
        ) : null}
      </>
    );
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
      acknowledgment: Acknowledgment;
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
  const [profileIndex, setProfileIndex] = useState(0);
  const [pendingAcknowledgment, setPendingAcknowledgment] =
    useState<PendingAcknowledgment | null>(null);
  const operationRef = useRef(0);

  function nextOperation() {
    operationRef.current += 1;
    return operationRef.current;
  }

  function isCurrentOperation(operation: number) {
    return operationRef.current === operation;
  }

  async function refresh(signal?: AbortSignal) {
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
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      nextOperation();
      controller.abort();
    };
  }, []);

  const profileQuestion = profileState?.questions[profileIndex] ?? null;
  const fullData: FullOnboardingState | null =
    data?.mode === "full" ? data : null;
  const activeQuestion = profileQuestion ?? fullData?.question ?? null;
  const activeProfile = profileState?.profile ?? fullData?.profile ?? null;
  const activeQuestionKey = activeQuestion?.answerKey ?? "";

  useEffect(() => {
    nextOperation();
    if (!activeQuestion || !activeProfile) return;
    setDraft(answerForQuestion(activeProfile, activeQuestion));
    setFieldError("");
    setStatus("idle");
  }, [activeQuestionKey, profileIndex, Boolean(profileState)]);

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
      if (profileState) {
        const next = await saveProfileAnswer(activeQuestion.answerKey, draft);
        if (!isCurrentOperation(operation)) return;
        if (!next.acknowledgment) throw new Error("Peppa could not answer just now.");
        setPendingAcknowledgment({
          kind: "profile",
          operationId: operation,
          acknowledgment: next.acknowledgment,
          next,
        });
      } else {
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
      }
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

  async function handleOpenProfile() {
    const operation = nextOperation();
    setFieldError("");
    try {
      const profile = await loadProfile();
      if (!isCurrentOperation(operation)) return;
      setProfileIndex(0);
      setProfileState(profile);
    } catch (error) {
      if (isCurrentOperation(operation)) setFieldError(readableError(error));
    }
  }

  function handleAcknowledgmentNext() {
    const pending = pendingAcknowledgment;
    if (!pending) return;
    nextOperation();
    setPendingAcknowledgment(null);
    if (pending.kind === "onboarding") {
      setData(pending.next);
      return;
    }

    if (profileIndex < pending.next.questions.length - 1) {
      setProfileState(pending.next);
      setProfileIndex((current) => current + 1);
    } else {
      setProfileState(null);
      setProfileIndex(0);
      void refresh();
    }
  }

  const progress = profileState
    ? {
        answered: profileIndex,
        current: profileIndex + 1,
        total: profileState.questions.length,
      }
    : fullData?.progress ?? { answered: 0, current: 0, total: 0 };

  const questionProps: QuestionProps | null = activeQuestion
    ? {
        fieldError,
        mode: profileState ? "profile" : "onboarding",
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

  return (
    <OnboardingGateView
      acknowledgment={
        pendingAcknowledgment
          ? {
              acknowledgment: pendingAcknowledgment.acknowledgment,
              operationId: pendingAcknowledgment.operationId,
            }
          : null
      }
      data={data}
      isLoading={isLoading}
      loadError={loadError}
      onAcknowledgmentNext={handleAcknowledgmentNext}
      onCloseProfile={() => {
        nextOperation();
        setProfileState(null);
        setProfileIndex(0);
      }}
      onOpenProfile={() => void handleOpenProfile()}
      onRetry={() => void refresh()}
      onSkip={() => void handleSkip()}
      onStart={() => void handleStart()}
      profileEditor={
        profileState && questionProps
          ? {
              current: profileIndex + 1,
              questionProps,
              total: profileState.questions.length,
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
