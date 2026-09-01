import { ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type FocusEvent } from "react";
import { BidiLearnerName } from "../app/AppHeader";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, fieldClassName } from "../shared/ui";
import type { PersonalizedStoryArtwork } from "./personalized-story-art-client";
import type {
  PersonalizedArtErrorCode,
  PersonalizedArtStatusCode,
} from "./usePersonalizedStoryArt";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
export function PersonalizedStoryArtPanel({
  consentChecked,
  disabled = false,
  error,
  featureEnabled = true,
  fileName = "",
  hasSelectedPhoto = false,
  hasStoredArt = false,
  generateDisabled,
  isGenerating,
  learnerName,
  onConsentChange,
  onFileChange,
  onGenerate,
  onRemove,
  personalizedArtwork,
  status = null,
  storyTitle,
}: {
  consentChecked: boolean;
  disabled?: boolean;
  error?: PersonalizedArtErrorCode;
  featureEnabled?: boolean;
  fileName?: string;
  hasSelectedPhoto?: boolean;
  hasStoredArt?: boolean;
  generateDisabled?: boolean;
  isGenerating: boolean;
  learnerName: string;
  onConsentChange: (checked: boolean) => void;
  onFileChange?: (file: File | null) => void;
  onGenerate: () => void;
  onRemove: () => void;
  personalizedArtwork: PersonalizedStoryArtwork | null;
  status?: PersonalizedArtStatusCode;
  storyTitle: string;
}) {
  const { messages } = useGuardianLanguage();
  const copy = messages.personalizedArt;
  const managedLearnerName = learnerName.trim() || "Learner";
  const removeActionRef = useRef<HTMLButtonElement | null>(null);
  const removeFocusHandoffRef = useRef(false);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const cleanupOnly = hasStoredArt && (!featureEnabled || !personalizedArtwork);
  const cleanupComplete = !featureEnabled && !hasStoredArt && status !== null;
  const removalComplete = status === "removed";

  useIsomorphicLayoutEffect(() => {
    if (!removalComplete || !removeFocusHandoffRef.current) return;
    removeFocusHandoffRef.current = false;
    if (document.hasFocus() && document.activeElement === document.body) {
      statusRef.current?.focus({ preventScroll: true });
    }
  }, [removalComplete]);

  function remove() {
    if (disabled || isGenerating) return;
    removeFocusHandoffRef.current =
      document.activeElement === removeActionRef.current;
    onRemove();
  }

  function preserveIntentOnBlur(event: FocusEvent<HTMLButtonElement>) {
    if (event.relatedTarget instanceof Element) {
      removeFocusHandoffRef.current = false;
    }
  }

  if (!featureEnabled && !cleanupOnly && !cleanupComplete) return null;

  if (cleanupOnly || cleanupComplete) {
    return (
      <section
        aria-label={copy.sectionLabel}
        className="rounded-[1.5rem] border-4 border-white bg-white/95 p-4 shadow-card sm:p-5"
      >
        <div className="grid gap-3">
          {cleanupOnly ? (
            <>
              <p className="m-0 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-blue">
                <ShieldCheck aria-hidden="true" className="size-4" />
                {copy.cleanupLabel}
              </p>
              <h2
                className="m-0 min-w-0 text-xl leading-tight text-brand-navy [overflow-wrap:anywhere] sm:text-2xl"
              >
                {copy.cleanupTitleBeforeName}
                <BidiLearnerName learnerName={managedLearnerName} />
                {copy.cleanupTitleAfterName}
              </h2>
              <p
                className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-700 [overflow-wrap:anywhere]"
              >
                {copy.cleanupDescriptionBeforeName}
                <BidiLearnerName learnerName={managedLearnerName} />
                {copy.cleanupDescriptionAfterName}
              </p>
              <div>
                <ActionButton
                  aria-disabled={disabled || isGenerating ? true : undefined}
                  className="gap-2 rounded-full border-4 border-white"
                  disabled={disabled}
                  onBlur={preserveIntentOnBlur}
                  onClick={disabled || isGenerating ? undefined : remove}
                  ref={removeActionRef}
                  type="button"
                  variant="surface"
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                  {isGenerating
                    ? copy.deletingStored
                    : copy.deleteStored}
                </ActionButton>
              </div>
            </>
          ) : null}
          {error ? (
            <p
              className="m-0 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-800"
              role="alert"
            >
              {copy.errors[error]}
            </p>
          ) : null}
          {status ? (
            <p
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900 focus:outline-4 focus:outline-offset-2 focus:outline-brand-ink"
              ref={statusRef}
              role="status"
              tabIndex={removalComplete ? -1 : undefined}
            >
              {copy.statuses[status]}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={copy.sectionLabel}
      className="rounded-[1.5rem] border-4 border-white bg-white/95 p-4 shadow-card sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.9fr)] sm:items-start short-wide:grid-cols-1">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-xs font-black uppercase tracking-wider text-brand-blue">
              {copy.aiPrivate}
            </p>
            <h2
              className="m-0 min-w-0 text-xl leading-tight text-brand-navy [overflow-wrap:anywhere] sm:text-2xl"
            >
              {copy.headingBeforeStory}
              <span dir="ltr" lang="en">
                {storyTitle}
              </span>
              {copy.headingAfterStory}
              <BidiLearnerName learnerName={managedLearnerName} />
            </h2>
            <p
              className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-700 [overflow-wrap:anywhere]"
            >
              {copy.descriptionBeforeName}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.descriptionAfterName}
            </p>
          </div>

          <label
            className="grid min-w-0 gap-1.5"
            htmlFor="personalized-story-photo"
          >
            <span
              className="min-w-0 text-sm font-black text-brand-navy [overflow-wrap:anywhere]"
            >
              {copy.uploadBeforeName}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.uploadAfterName}
            </span>
            <input
              accept="image/*"
              className={fieldClassName({
                className:
                  "cursor-pointer rounded-xl bg-sky-50 px-3 py-2 text-sm",
                tone: "tinted",
              })}
              id="personalized-story-photo"
              disabled={disabled}
              onChange={(event) =>
                onFileChange?.(event.currentTarget.files?.[0] ?? null)
              }
              type="file"
            />
            <span className="text-xs font-bold text-slate-600">
              {fileName
                ? copy.selectedFile(fileName)
                : hasSelectedPhoto
                  ? copy.photoSelected
                  : copy.noPhoto}
            </span>
          </label>

          <label className="flex min-w-0 items-start gap-3 rounded-2xl bg-sky-50 px-3 py-3 text-sm font-bold leading-relaxed text-slate-700">
            <input
              checked={consentChecked}
              className="mt-1 size-4 shrink-0 accent-brand-blue"
              disabled={disabled}
              onChange={(event) => onConsentChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {copy.consentBeforeName}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.consentAfterName}
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <ActionButton
              className="gap-2 rounded-full border-4 border-white"
              disabled={
                disabled ||
                (generateDisabled ?? (!consentChecked || isGenerating))
              }
              onClick={onGenerate}
              type="button"
            >
              <ImagePlus aria-hidden="true" className="size-5" />
              {isGenerating
                ? copy.creating
                : personalizedArtwork
                  ? copy.regenerate
                  : copy.generate}
            </ActionButton>
            {personalizedArtwork ? (
              <ActionButton
                aria-disabled={disabled || isGenerating ? true : undefined}
                className="gap-2 rounded-full border-4 border-white"
                disabled={disabled}
                onBlur={preserveIntentOnBlur}
                onClick={disabled || isGenerating ? undefined : remove}
                ref={removeActionRef}
                type="button"
                variant="surface"
              >
                <Trash2 aria-hidden="true" className="size-5" />
                {copy.delete}
              </ActionButton>
            ) : null}
          </div>

          {error ? (
            <p
              className="m-0 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-800"
              role="alert"
            >
              {copy.errors[error]}
            </p>
          ) : null}

          {status ? (
            <p
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900 focus:outline-4 focus:outline-offset-2 focus:outline-brand-ink"
              ref={statusRef}
              role="status"
              tabIndex={removalComplete ? -1 : undefined}
            >
              {copy.statuses[status]}
            </p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[1.4rem] border-3 border-white bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#dbeafe_45%,#fce7f3_100%)] shadow-control-surface">
          {personalizedArtwork ? (
            <img
              alt={copy.generatedAlt(managedLearnerName, storyTitle)}
              className="aspect-square h-full w-full object-cover"
              src={personalizedArtwork.src}
            />
          ) : (
            <div
              aria-label={copy.previewLabel}
              className="grid aspect-square place-items-center p-6 text-center"
              role="img"
            >
              <div className="grid gap-2">
                <span className="text-sm font-black uppercase tracking-wider text-brand-blue">
                  {copy.preview}
                </span>
                <p
                  className="m-0 min-w-0 text-base font-extrabold leading-snug text-slate-700 [overflow-wrap:anywhere]"
                >
                  {copy.previewBeforeName}
                  <BidiLearnerName learnerName={managedLearnerName} />
                  {copy.previewAfterName}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
