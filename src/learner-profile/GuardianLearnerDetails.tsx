import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { isSafeRouteId } from "../../lib/route-id";
import {
  getGuardianLearnersPath,
} from "../app/app-routes";
import { FeaturePlaceholder } from "../app/FeaturePlaceholder";
import { useLearnerSelection } from "./LearnerProfileContext";
import { profileDraftsFromState } from "./LearnerProfileGate";
import { ProfileEditorView } from "./ProfileEditor";
import {
  LearnerProfileApiError,
  loadProfile,
  saveLessonRecordingConsent,
  saveProfileAnswers,
  type ProfileState,
} from "./learner-profile-api";

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function GuardianLearnerDetails() {
  const { learnerId } = useParams();
  const navigate = useNavigate();
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadSequence, setLoadSequence] = useState(0);
  const [pageError, setPageError] = useState("");
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const validLearnerId = isSafeRouteId(learnerId) ? learnerId : null;

  useEffect(() => {
    if (!validLearnerId) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsLoading(true);
    setPageError("");
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
          setPageError(
            readableError(error, "The learner profile could not be loaded."),
          );
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
        busy
        description="Getting this learner’s saved details ready."
        title="Loading learner details…"
      />
    );
  }

  if (!profileState) {
    return (
      <FeaturePlaceholder
        actionLabel="Back to Manage learners"
        actionTo={getGuardianLearnersPath()}
        description={pageError || "The learner profile could not be loaded."}
        onRetry={() => setLoadSequence((current) => current + 1)}
        title="Learner details are taking a break"
      />
    );
  }

  async function save() {
    if (!profileState || isSaving || !validLearnerId) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsSaving(true);
    setFieldErrors({});
    setPageError("");
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
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setPageError(
          readableError(error, "The learner profile could not be saved."),
        );
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
    setPageError("");
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
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setPageError(
          readableError(
            error,
            "The lesson recording choice could not be saved.",
          ),
        );
      }
    } finally {
      if (!controller.signal.aborted) setIsSaving(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <ProfileEditorView
      drafts={drafts}
      fieldErrors={fieldErrors}
      isSaving={isSaving}
      learnerName={profileState.profile.name ?? "Learner"}
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
        setFieldErrors((current) => ({ ...current, [answerKey]: "" }));
      }}
      pageError={pageError}
      questions={profileState.questions}
      showRedoLearnerProfile={false}
    />
  );
}
