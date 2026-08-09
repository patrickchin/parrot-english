import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generatePersonalizedStoryArt,
  getPersonalizedStoryArtOverride,
  loadPersonalizedStoryArt,
  PERSONALIZED_STORY_ID,
  PERSONALIZED_STORY_PAGE_ID,
  PERSONALIZED_STORY_TITLE,
  type PersonalizedStoryArtMetadata,
  PersonalizedStoryArtApiError,
  removePersonalizedStoryArt,
} from "./personalized-story-art-client";

function emptyMetadata(): PersonalizedStoryArtMetadata {
  return { stories: {} };
}

function getErrorMessage(caughtError: unknown) {
  if (caughtError instanceof PersonalizedStoryArtApiError) {
    return caughtError.message;
  }
  return caughtError instanceof Error
    ? caughtError.message
    : "The portrait could not be updated right now.";
}

export function usePersonalizedStoryArt({ enabled = true } = {}) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(enabled);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [metadata, setMetadata] = useState<PersonalizedStoryArtMetadata>(
    emptyMetadata,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFeatureEnabled(false);
      setMetadata(emptyMetadata());
      return;
    }
    try {
      const result = await loadPersonalizedStoryArt(PERSONALIZED_STORY_ID);
      setFeatureEnabled(result.enabled !== false);
      setMetadata(result);
      setError("");
    } catch (caughtError) {
      if (
        caughtError instanceof PersonalizedStoryArtApiError &&
        caughtError.status === 404
      ) {
        setFeatureEnabled(false);
        setMetadata(emptyMetadata());
        setError("");
        return;
      }
      setFeatureEnabled(true);
      setError(getErrorMessage(caughtError));
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const personalizedArtwork = useMemo(
    () =>
      getPersonalizedStoryArtOverride(
        metadata,
        PERSONALIZED_STORY_ID,
        PERSONALIZED_STORY_PAGE_ID,
      ),
    [metadata],
  );

  const generate = useCallback(async () => {
    if (!selectedFile || !consentChecked) return;
    setIsGenerating(true);
    try {
      const nextMetadata = await generatePersonalizedStoryArt({
        guardianConsentVersion:
          metadata.guardianConsentVersion ?? "storybook-consent-v1",
        photo: selectedFile,
        storyId: PERSONALIZED_STORY_ID,
      });
      setMetadata(nextMetadata);
      setSelectedFile(null);
      setError("");
      setStatusMessage("Story art ready");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsGenerating(false);
    }
  }, [consentChecked, metadata.guardianConsentVersion, selectedFile]);

  const remove = useCallback(async () => {
    setIsGenerating(true);
    try {
      await removePersonalizedStoryArt({
        storyId: PERSONALIZED_STORY_ID,
      });
      setMetadata((current) => {
        const stories = { ...current.stories };
        const story = stories[PERSONALIZED_STORY_ID];
        if (story) {
          const pages = { ...story.pages };
          delete pages[PERSONALIZED_STORY_PAGE_ID];
          if (Object.keys(pages).length > 0) {
            stories[PERSONALIZED_STORY_ID] = { pages };
          } else {
            delete stories[PERSONALIZED_STORY_ID];
          }
        }
        return {
          ...current,
          hasStoredArt: false,
          stories,
          updatedAt: new Date().toISOString(),
        };
      });
      setError("");
      setStatusMessage("Personalized story art removed.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const chooseFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setStatusMessage("");
  }, []);

  const chooseConsent = useCallback((checked: boolean) => {
    setConsentChecked(checked);
    setStatusMessage("");
  }, []);

  return {
    consentChecked,
    error,
    featureEnabled,
    generate,
    generateDisabled: !consentChecked || !selectedFile || isGenerating,
    isGenerating,
    metadata,
    personalizedArtwork,
    personalizedOverrides: metadata.stories,
    remove,
    hasStoredArt: metadata.hasStoredArt === true || personalizedArtwork !== null,
    hasSelectedPhoto: selectedFile !== null,
    selectedFileName: selectedFile?.name ?? "",
    setConsentChecked: chooseConsent,
    setSelectedFile: chooseFile,
    statusMessage,
    storyId: PERSONALIZED_STORY_ID,
    storyPageId: PERSONALIZED_STORY_PAGE_ID,
    storyTitle: PERSONALIZED_STORY_TITLE,
  } as const;
}
