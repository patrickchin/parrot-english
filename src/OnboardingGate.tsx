import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useProfileAccountAction } from "./account-actions";
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
  type OnboardingQuestion,
  type OnboardingState,
  type ProfileState,
} from "./onboarding-api";
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

type OnboardingGateViewProps = {
  children: ReactNode;
  data: OnboardingState | null;
  isLoading: boolean;
  loadError: string;
  onRetry: () => void;
  onSkip: () => void;
  onStart: () => void;
  profileEditor: ProfileEditorProps | null;
  questionProps: QuestionProps | null;
  started: boolean;
};

export function OnboardingGateView({
  children,
  data,
  isLoading,
  loadError,
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

  if (profileEditor) {
    return <ProfileEditorView {...profileEditor} />;
  }

  if (
    data?.canBypass ||
    fullData?.profile.onboardingStatus === "completed"
  ) {
    return (
      <>{children}</>
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
          <p>Answer five quick questions so your English practice can feel more like you.</p>
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
  question: Pick<OnboardingQuestion, "answerKey" | "cardinality">
) {
  const value =
    question.answerKey === "name"
      ? profile.name
      : question.answerKey === "age"
        ? profile.age
        : profile.answers[question.answerKey];
  if (question.cardinality === "array") {
    return Array.isArray(value) ? [...value] : [];
  }
  return value ?? "";
}

export function profileDraftsFromState(profileState: ProfileState) {
  return Object.fromEntries(
    profileState.questions.map((question) => [
      question.answerKey,
      answerForQuestion(profileState.profile, question),
    ])
  );
}

export function updateProfileDraft(
  drafts: Record<string, unknown>,
  answerKey: string,
  value: unknown
) {
  return { ...drafts, [answerKey]: value };
}

export function addArrayAnswer(values: string[], pendingValue: string) {
  const next = pendingValue.trim();
  if (!next) return values;
  if (
    values.some(
      (entry) =>
        entry.toLocaleLowerCase("en") === next.toLocaleLowerCase("en")
    )
  ) {
    return values;
  }
  return [...values, next];
}

export function toggleArrayAnswer(values: string[], option: string) {
  const existing = values.findIndex(
    (entry) =>
      entry.toLocaleLowerCase("en") === option.toLocaleLowerCase("en")
  );
  return existing >= 0
    ? values.filter((_, index) => index !== existing)
    : addArrayAnswer(values, option);
}

export function submissionValue(
  question: Pick<OnboardingQuestion, "answerType">,
  value: unknown
) {
  if (
    question.answerType === "number" &&
    typeof value === "string" &&
    /^-?\d+$/.test(value.trim())
  ) {
    return Number(value);
  }
  return value;
}

export async function saveQuestionAndAdvance({
  questionKey,
  save = saveOnboardingAnswer,
  value,
}: {
  questionKey: string;
  save?: (questionKey: string, value: unknown) => Promise<OnboardingState>;
  value: unknown;
}) {
  return save(questionKey, value);
}

function readableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function arrayDraft(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState<unknown>("");
  const [pendingValue, setPendingValue] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [status, setStatus] = useState<QuestionProps["status"]>("idle");
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, unknown>>(
    {}
  );
  const [profilePendingValues, setProfilePendingValues] = useState<
    Record<string, string>
  >({});
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Record<string, string>
  >({});
  const [profileFieldStatuses, setProfileFieldStatuses] = useState<
    Record<string, QuestionStatus>
  >({});
  const [profilePageError, setProfilePageError] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState("");

  async function refresh(signal?: AbortSignal) {
    setIsLoading(true);
    setLoadError("");
    try {
      const next = await loadOnboarding({ signal });
      setData(next);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLoadError(readableError(error));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  const fullData: FullOnboardingState | null =
    data?.mode === "full" ? data : null;
  const activeQuestion = fullData?.question ?? null;
  const activeProfile = fullData?.profile ?? null;
  const activeQuestionKey = activeQuestion?.answerKey ?? "";

  useEffect(() => {
    if (!activeQuestion || !activeProfile) return;
    setDraft(answerForQuestion(activeProfile, activeQuestion));
    setPendingValue("");
    setFieldError("");
    setStatus("idle");
  }, [activeQuestionKey]);

  async function handleStart() {
    if (!fullData?.question?.audio) return;
    setStarted(true);
    setFieldError("");
    try {
      await playOnboardingStart({
        introduction: fullData.questionnaire.introductionAudio,
        questionAudio: fullData.question.audio,
      });
    } catch {
      setFieldError("Audio is unavailable. You can keep going or use Replay.");
    }
  }

  async function handleReplay() {
    if (!activeQuestion?.audio) return;
    setFieldError("");
    try {
      await replayOnboardingQuestion(activeQuestion.audio);
    } catch {
      setFieldError("Audio is unavailable. Please try Replay again.");
    }
  }

  async function handleTranscribe() {
    if (!activeQuestion) return;
    setFieldError("");
    setStatus("recording");
    try {
      const transcript = await captureOnboardingAnswer({
        record: () => recordSpeechClip(),
        transcribe: async (audio) => {
          setStatus("transcribing");
          return transcribeOnboardingAudio(audio);
        },
      });
      if (activeQuestion.cardinality === "array") {
        setPendingValue(transcript);
      } else {
        setDraft(transcript);
      }
    } catch (error) {
      setFieldError(
        `${readableError(error)} You can still type or choose an answer.`
      );
    } finally {
      setStatus("idle");
    }
  }

  function addPending() {
    setDraft((current: unknown) =>
      addArrayAnswer(arrayDraft(current), pendingValue)
    );
    setPendingValue("");
  }

  function removeValue(value: string) {
    setDraft((current: unknown) =>
      arrayDraft(current).filter(
        (entry) =>
          entry.toLocaleLowerCase("en") !== value.toLocaleLowerCase("en")
      )
    );
  }

  function toggleOption(value: string) {
    setDraft((current: unknown) =>
      toggleArrayAnswer(arrayDraft(current), value)
    );
  }

  async function handleSubmit() {
    if (!activeQuestion) return;
    setStatus("saving");
    setFieldError("");
    try {
      const next = await saveQuestionAndAdvance({
        questionKey: activeQuestion.answerKey,
        value: submissionValue(activeQuestion, draft),
      });
      setData(next);
    } catch (error) {
      setFieldError(readableError(error));
    } finally {
      setStatus("idle");
    }
  }

  async function handleSkip() {
    setLoadError("");
    setFieldError("");
    try {
      setData(await skipOnboarding());
    } catch (error) {
      const message = readableError(error);
      if (data) setFieldError(message);
      else setLoadError(message);
    }
  }

  async function handleSkipQuestion() {
    if (!activeQuestion || activeQuestion.required) return;
    setStatus("saving");
    setFieldError("");
    try {
      setData(await skipOnboardingQuestion(activeQuestion.answerKey));
    } catch (error) {
      setFieldError(readableError(error));
    } finally {
      setStatus("idle");
    }
  }

  const handleOpenProfile = useCallback(async () => {
    setProfileLoadError("");
    try {
      const profile = await loadProfile();
      setProfileState(profile);
      setProfileDrafts(profileDraftsFromState(profile));
      setProfilePendingValues({});
      setProfileFieldErrors({});
      setProfileFieldStatuses({});
      setProfilePageError("");
    } catch (error) {
      setProfileLoadError(readableError(error));
    }
  }, []);

  const closeProfileEditor = useCallback(() => {
    setProfileState(null);
    setProfileDrafts({});
    setProfilePendingValues({});
    setProfileFieldErrors({});
    setProfileFieldStatuses({});
    setProfilePageError("");
    setIsProfileSaving(false);
  }, []);

  function setProfileFieldError(answerKey: string, message: string) {
    setProfileFieldErrors((current) => ({
      ...current,
      [answerKey]: message,
    }));
  }

  function setProfileFieldStatus(
    answerKey: string,
    nextStatus: QuestionStatus
  ) {
    setProfileFieldStatuses((current) => ({
      ...current,
      [answerKey]: nextStatus,
    }));
  }

  function handleProfileValueChange(answerKey: string, value: unknown) {
    setProfileDrafts((current) =>
      updateProfileDraft(current, answerKey, value)
    );
    setProfileFieldError(answerKey, "");
  }

  function handleProfilePendingChange(answerKey: string, value: string) {
    setProfilePendingValues((current) => ({
      ...current,
      [answerKey]: value,
    }));
  }

  function handleProfileAddPending(answerKey: string) {
    handleProfileValueChange(
      answerKey,
      addArrayAnswer(
        arrayDraft(profileDrafts[answerKey]),
        profilePendingValues[answerKey] ?? ""
      )
    );
    handleProfilePendingChange(answerKey, "");
  }

  function handleProfileRemoveValue(answerKey: string, value: string) {
    handleProfileValueChange(
      answerKey,
      arrayDraft(profileDrafts[answerKey]).filter(
        (entry) =>
          entry.toLocaleLowerCase("en") !== value.toLocaleLowerCase("en")
      )
    );
  }

  function handleProfileToggleOption(answerKey: string, value: string) {
    handleProfileValueChange(
      answerKey,
      toggleArrayAnswer(arrayDraft(profileDrafts[answerKey]), value)
    );
  }

  async function handleProfileReplay(question: OnboardingQuestion) {
    if (!question.audio) return;
    setProfileFieldError(question.answerKey, "");
    try {
      await replayOnboardingQuestion(question.audio);
    } catch {
      setProfileFieldError(
        question.answerKey,
        "Audio is unavailable. Please try Replay again."
      );
    }
  }

  async function handleProfileTranscribe(question: OnboardingQuestion) {
    setProfileFieldError(question.answerKey, "");
    setProfileFieldStatus(question.answerKey, "recording");
    try {
      const transcript = await captureOnboardingAnswer({
        record: () => recordSpeechClip(),
        transcribe: async (audio) => {
          setProfileFieldStatus(question.answerKey, "transcribing");
          return transcribeOnboardingAudio(audio);
        },
      });
      if (question.cardinality === "array") {
        handleProfilePendingChange(question.answerKey, transcript);
      } else {
        handleProfileValueChange(question.answerKey, transcript);
      }
    } catch (error) {
      setProfileFieldError(
        question.answerKey,
        `${readableError(error)} You can still type or choose an answer.`
      );
    } finally {
      setProfileFieldStatus(question.answerKey, "idle");
    }
  }

  async function handleProfileSave() {
    if (!profileState) return;
    setIsProfileSaving(true);
    setProfileFieldErrors({});
    setProfilePageError("");
    let savingQuestionKey = "";
    try {
      for (const question of profileState.questions) {
        savingQuestionKey = question.answerKey;
        await saveProfileAnswer(
          question.answerKey,
          submissionValue(question, profileDrafts[question.answerKey])
        );
      }
      setData(await loadOnboarding());
      closeProfileEditor();
    } catch (error) {
      if (savingQuestionKey) {
        setProfileFieldError(savingQuestionKey, readableError(error));
      } else {
        setProfilePageError(readableError(error));
      }
    } finally {
      setIsProfileSaving(false);
    }
  }

  const canEditProfile = Boolean(
    fullData &&
      (fullData.canBypass ||
        fullData.profile.onboardingStatus === "completed")
  );
  const profileAction = useMemo(
    () =>
      canEditProfile
        ? {
            error: profileLoadError,
            onOpen: () => void handleOpenProfile(),
          }
        : null,
    [canEditProfile, handleOpenProfile, profileLoadError]
  );
  useProfileAccountAction(profileAction);

  const progress = fullData?.progress ?? { answered: 0, current: 0, total: 0 };

  const questionProps: QuestionProps | null = activeQuestion
    ? {
        fieldError,
        mode: "onboarding",
        onAddPending: addPending,
        onPendingChange: setPendingValue,
        onRemoveValue: removeValue,
        onReplay: () => void handleReplay(),
        onSkip: () => void handleSkip(),
        onSkipQuestion: () => void handleSkipQuestion(),
        onSubmit: () => void handleSubmit(),
        onToggleOption: toggleOption,
        onTranscribe: () => void handleTranscribe(),
        onValueChange: setDraft,
        pendingValue,
        progress,
        question: activeQuestion,
        status,
        value: draft,
      }
    : null;

  return (
    <OnboardingGateView
      data={data}
      isLoading={isLoading}
      loadError={loadError}
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
              onAddPending: handleProfileAddPending,
              onCancel: closeProfileEditor,
              onClose: closeProfileEditor,
              onPendingChange: handleProfilePendingChange,
              onRemoveValue: handleProfileRemoveValue,
              onReplay: (question) => void handleProfileReplay(question),
              onSave: () => void handleProfileSave(),
              onToggleOption: handleProfileToggleOption,
              onTranscribe: (question) =>
                void handleProfileTranscribe(question),
              onValueChange: handleProfileValueChange,
              pageError: profilePageError,
              pendingValues: profilePendingValues,
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
