import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isAbortError } from "../media/audio-playback";
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

export type PersonalizedArtErrorCode =
  | "load-failed"
  | "generate-failed"
  | "delete-failed"
  | null;
export type PersonalizedArtStatusCode = "ready" | "removed" | null;

type StoryArtOperation = {
  controller: AbortController;
  epoch: number;
};

export function usePersonalizedStoryArt(
  {
    enabled = true,
    learnerProfileId,
  }: { enabled?: boolean; learnerProfileId?: string } = {},
) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(enabled);
  const [error, setError] = useState<PersonalizedArtErrorCode>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [metadata, setMetadata] = useState<PersonalizedStoryArtMetadata>(
    emptyMetadata,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PersonalizedArtStatusCode>(null);
  const mountedRef = useRef(false);
  const operationEpochRef = useRef(0);
  const operationRef = useRef<StoryArtOperation | null>(null);

  const beginOperation = useCallback(() => {
    operationRef.current?.controller.abort();
    const operation = {
      controller: new AbortController(),
      epoch: operationEpochRef.current + 1,
    };
    operationEpochRef.current = operation.epoch;
    operationRef.current = operation;
    return operation;
  }, []);

  const isCurrentOperation = useCallback(
    (operation: StoryArtOperation) =>
      mountedRef.current &&
      !operation.controller.signal.aborted &&
      operation.epoch === operationEpochRef.current &&
      operationRef.current === operation,
    [],
  );

  const finishOperation = useCallback((operation: StoryArtOperation) => {
    if (operationRef.current === operation) operationRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    const operation = beginOperation();
    if (!enabled) {
      if (isCurrentOperation(operation)) {
        setFeatureEnabled(false);
        setMetadata(emptyMetadata());
        setIsGenerating(false);
      }
      finishOperation(operation);
      return;
    }
    try {
      const result = await loadPersonalizedStoryArt(PERSONALIZED_STORY_ID, {
        learnerProfileId,
        signal: operation.controller.signal,
      });
      if (!isCurrentOperation(operation)) return;
      setFeatureEnabled(result.enabled !== false);
      setMetadata(result);
      setError(null);
    } catch (caughtError) {
      if (!isCurrentOperation(operation) || isAbortError(caughtError)) return;
      if (
        caughtError instanceof PersonalizedStoryArtApiError &&
        caughtError.status === 404
      ) {
        setFeatureEnabled(false);
        setMetadata(emptyMetadata());
        setError(null);
        return;
      }
      setFeatureEnabled(true);
      setError("load-failed");
    } finally {
      finishOperation(operation);
    }
  }, [
    beginOperation,
    enabled,
    finishOperation,
    isCurrentOperation,
    learnerProfileId,
  ]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    operationEpochRef.current += 1;
    operationRef.current?.controller.abort();
    operationRef.current = null;
    setConsentChecked(false);
    setFeatureEnabled(enabled);
    setError(null);
    setIsGenerating(false);
    setMetadata(emptyMetadata());
    setSelectedFile(null);
    setStatus(null);
    void refresh();
    return () => {
      mountedRef.current = false;
      operationEpochRef.current += 1;
      operationRef.current?.controller.abort();
      operationRef.current = null;
    };
  }, [enabled, refresh]);

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
    const operation = beginOperation();
    setIsGenerating(true);
    try {
      const nextMetadata = await generatePersonalizedStoryArt(
        {
          guardianConsentVersion:
            metadata.guardianConsentVersion ?? "storybook-consent-v1",
          photo: selectedFile,
          storyId: PERSONALIZED_STORY_ID,
        },
        { learnerProfileId, signal: operation.controller.signal },
      );
      if (!isCurrentOperation(operation)) return;
      setMetadata(nextMetadata);
      setSelectedFile(null);
      setError(null);
      setStatus("ready");
    } catch (caughtError) {
      if (!isCurrentOperation(operation) || isAbortError(caughtError)) return;
      setError("generate-failed");
    } finally {
      if (isCurrentOperation(operation)) setIsGenerating(false);
      finishOperation(operation);
    }
  }, [
    beginOperation,
    consentChecked,
    finishOperation,
    isCurrentOperation,
    learnerProfileId,
    metadata.guardianConsentVersion,
    selectedFile,
  ]);

  const remove = useCallback(async () => {
    const operation = beginOperation();
    setIsGenerating(true);
    try {
      await removePersonalizedStoryArt(
        { storyId: PERSONALIZED_STORY_ID },
        { learnerProfileId, signal: operation.controller.signal },
      );
      if (!isCurrentOperation(operation)) return;
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
      setError(null);
      setStatus("removed");
    } catch (caughtError) {
      if (!isCurrentOperation(operation) || isAbortError(caughtError)) return;
      setError("delete-failed");
    } finally {
      if (isCurrentOperation(operation)) setIsGenerating(false);
      finishOperation(operation);
    }
  }, [
    beginOperation,
    finishOperation,
    isCurrentOperation,
    learnerProfileId,
  ]);

  const chooseFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setStatus(null);
  }, []);

  const chooseConsent = useCallback((checked: boolean) => {
    setConsentChecked(checked);
    setStatus(null);
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
    status,
    storyId: PERSONALIZED_STORY_ID,
    storyPageId: PERSONALIZED_STORY_PAGE_ID,
    storyTitle: PERSONALIZED_STORY_TITLE,
  } as const;
}
