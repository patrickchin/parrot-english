import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import {
  getGuardianLearnerRouteId,
  getGuardianLearnersPath,
} from "../app/app-routes";
import { FeaturePlaceholder } from "../app/FeaturePlaceholder";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { useLearnerSelection } from "./LearnerProfileContext";
import { profileDraftsFromState } from "./LearnerProfileGate";
import {
  ProfileEditorView,
  type LearnerDetailsErrorCode,
} from "./ProfileEditor";
import {
  getLearnerProfileFieldErrorCode,
  LearnerProfileApiError,
  loadProfile,
  saveLessonRecordingConsent,
  saveProfileAnswers,
  type LearnerProfileFieldErrorCode,
  type ProfileState,
} from "./learner-profile-api";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function GuardianLearnerDetails() {
  const { messages } = useGuardianLanguage();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, LearnerProfileFieldErrorCode>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadSequence, setLoadSequence] = useState(0);
  const [pageError, setPageError] =
    useState<LearnerDetailsErrorCode | null>(null);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const validLearnerId = getGuardianLearnerRouteId(pathname);

  useEffect(() => {
    if (!validLearnerId) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsLoading(true);
    setPageError(null);
    setProfileState(null);
    void loadProfile({
      learnerProfileId: validLearnerId,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        if (loaded.profile.id !== validLearnerId) {
          throw new Error("The learner profile could not be loaded.");
        }
        setProfileState(loaded);
        setDrafts(profileDraftsFromState(loaded));
        setFieldErrors({});
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setPageError("load-failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      });
    return () => controller.abort();
  }, [loadSequence, validLearnerId]);

  if (!validLearnerId) {
    return <Navigate replace to={getGuardianLearnersPath()} />;
  }

  if (isLoading) {
    return (
      <FeaturePlaceholder
        actionLabel={messages.learners.details.backToRoster}
        actionTo={getGuardianLearnersPath()}
        busy
        description={messages.learners.details.loadingDescription}
        title={messages.learners.details.loadingTitle}
      />
    );
  }

  if (!profileState) {
    return (
      <FeaturePlaceholder
        actionLabel={messages.learners.details.backToRoster}
        actionTo={getGuardianLearnersPath()}
        description={messages.learners.details.loadFailed}
        onRetry={() => setLoadSequence((current) => current + 1)}
        retryLabel={messages.common.retry}
        title={messages.learners.details.errorTitle}
      />
    );
  }

  const learnerName = profileState.profile.name?.trim()
    ? profileState.profile.name
    : messages.learners.profile.aboutFallback;

  async function save() {
    if (!profileState || isSaving || !validLearnerId) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsSaving(true);
    setFieldErrors({});
    setPageError(null);
    try {
      const saved = await saveProfileAnswers(drafts, {
        learnerProfileId: validLearnerId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (saved.profile.id !== validLearnerId) {
        throw new Error("The learner profile could not be saved.");
      }
      setProfileState(saved);
      if (activeProfileId === validLearnerId) {
        await reloadSelectedLearner(validLearnerId);
      }
      if (!controller.signal.aborted) navigate(getGuardianLearnersPath());
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      const errors =
        error instanceof LearnerProfileApiError ? error.fieldErrors : {};
      setFieldErrors(
        Object.fromEntries(
          Object.entries(errors).map(([answerKey, message]) => [
            answerKey,
            getLearnerProfileFieldErrorCode(message),
          ]),
        ),
      );
      if (Object.keys(errors).length === 0) {
        setPageError("save-failed");
      }
    } finally {
      if (!controller.signal.aborted) setIsSaving(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function changeLessonRecordingConsent(enabled: boolean) {
    if (isSaving || !validLearnerId) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsSaving(true);
    setPageError(null);
    try {
      const saved = await saveLessonRecordingConsent(enabled, {
        learnerProfileId: validLearnerId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
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
      if (activeProfileId === validLearnerId) {
        await reloadSelectedLearner(validLearnerId);
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setPageError("recording-choice-failed");
      }
    } finally {
      if (!controller.signal.aborted) setIsSaving(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <ProfileEditorView
      audience="guardian"
      drafts={drafts}
      fieldErrors={fieldErrors}
      isSaving={isSaving}
      learnerName={learnerName}
      lessonRecordingCleanupPending={
        profileState.profile.lessonRecordingCleanupPending
      }
      lessonRecordingConsent={profileState.profile.lessonRecordingConsent}
      onCancel={() => navigate(getGuardianLearnersPath())}
      onClose={() => navigate(getGuardianLearnersPath())}
      onLessonRecordingConsentChange={(enabled) =>
        void changeLessonRecordingConsent(enabled)
      }
      onRedoLearnerProfile={() => {}}
      onSave={() => void save()}
      onValueChange={(answerKey, value) => {
        setDrafts((current) => ({ ...current, [answerKey]: value }));
        setFieldErrors((current) => {
          const next = { ...current };
          delete next[answerKey];
          return next;
        });
      }}
      pageError={pageError}
      questions={profileState.questions}
      showRedoLearnerProfile={false}
    />
  );
}
