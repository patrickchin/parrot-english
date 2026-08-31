import { ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type FocusEvent } from "react";
import { BidiLearnerName } from "../app/AppHeader";
import { ActionButton, fieldClassName } from "../shared/ui";
import type { PersonalizedStoryArtwork } from "./personalized-story-art-client";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
const REMOVED_STATUS = "Personalized story art removed.";

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
  statusMessage = "",
  storyTitle,
}: {
  consentChecked: boolean;
  disabled?: boolean;
  error?: string;
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
  statusMessage?: string;
  storyTitle: string;
}) {
  const managedLearnerName = learnerName.trim() || "Learner";
  const removeActionRef = useRef<HTMLButtonElement | null>(null);
  const removeFocusHandoffRef = useRef(false);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const cleanupOnly = hasStoredArt && (!featureEnabled || !personalizedArtwork);
  const cleanupComplete =
    !featureEnabled && !hasStoredArt && Boolean(statusMessage);
  const removalComplete = statusMessage === REMOVED_STATUS;

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
        aria-label="Personalized story art"
        className="rounded-[1.5rem] border-4 border-white bg-white/95 p-4 shadow-card sm:p-5"
      >
        <div className="grid gap-3">
          {cleanupOnly ? (
            <>
              <p className="m-0 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-blue">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Private art cleanup
              </p>
              <h2
                className="m-0 min-w-0 text-xl leading-tight text-brand-navy [overflow-wrap:anywhere] sm:text-2xl"
                dir="ltr"
              >
                Remove <BidiLearnerName learnerName={managedLearnerName} />
                &apos;s stored story art
              </h2>
              <p
                className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-700 [overflow-wrap:anywhere]"
                dir="ltr"
              >
                New generation is unavailable, but{" "}
                <BidiLearnerName learnerName={managedLearnerName} />
                &apos;s private story art can still be deleted. If an earlier
                purge failed, this retries it.
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
                    ? "Deleting stored story art"
                    : "Delete stored story art"}
                </ActionButton>
              </div>
            </>
          ) : null}
          {error ? (
            <p
              className="m-0 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {statusMessage ? (
            <p
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900 focus:outline-4 focus:outline-offset-2 focus:outline-brand-ink"
              ref={statusRef}
              role="status"
              tabIndex={removalComplete ? -1 : undefined}
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Personalized story art"
      className="rounded-[1.5rem] border-4 border-white bg-white/95 p-4 shadow-card sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.9fr)] sm:items-start short-wide:grid-cols-1">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <h2
              className="m-0 min-w-0 text-xl leading-tight text-brand-navy [overflow-wrap:anywhere] sm:text-2xl"
              dir="ltr"
            >
              Make page one of {storyTitle} look like{" "}
              <BidiLearnerName learnerName={managedLearnerName} />
            </h2>
            <p
              className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-700 [overflow-wrap:anywhere]"
              dir="ltr"
            >
              This is optional. A cropped copy goes to Cloudflare Workers AI.
              Parrot adds only{" "}
              <BidiLearnerName learnerName={managedLearnerName} />
              &apos;s private storybook-style picture to this account, and you
              can delete it anytime.
            </p>
          </div>

          <label
            className="grid min-w-0 gap-1.5"
            htmlFor="personalized-story-photo"
          >
            <span
              className="min-w-0 text-sm font-black text-brand-navy [overflow-wrap:anywhere]"
              dir="ltr"
            >
              Upload <BidiLearnerName learnerName={managedLearnerName} />
              &apos;s photo
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
                ? `Selected: ${fileName}`
                : hasSelectedPhoto
                  ? "Photo selected."
                  : "No photo chosen yet."}
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
            <span className="min-w-0 [overflow-wrap:anywhere]" dir="ltr">
              I am 18 or older. I confirm I am{" "}
              <BidiLearnerName learnerName={managedLearnerName} />
              &apos;s guardian or have permission to use this photo, and I agree
              to send a cropped copy to Cloudflare Workers AI to make the
              illustration.
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
              {isGenerating ? "Creating story art" : "Generate story art"}
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
                Delete story art
              </ActionButton>
            ) : null}
          </div>

          {error ? (
            <p
              className="m-0 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {statusMessage ? (
            <p
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900 focus:outline-4 focus:outline-offset-2 focus:outline-brand-ink"
              ref={statusRef}
              role="status"
              tabIndex={removalComplete ? -1 : undefined}
            >
              {statusMessage}
            </p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[1.4rem] border-3 border-white bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#dbeafe_45%,#fce7f3_100%)] shadow-control-surface">
          {personalizedArtwork ? (
            <img
              alt={personalizedArtwork.alt}
              className="aspect-square h-full w-full object-cover"
              src={personalizedArtwork.src}
            />
          ) : (
            <div
              aria-label="Storybook portrait preview"
              className="grid aspect-square place-items-center p-6 text-center"
              role="img"
            >
              <div className="grid gap-2">
                <span className="text-sm font-black uppercase tracking-wider text-brand-blue">
                  Preview
                </span>
                <p
                  className="m-0 min-w-0 text-base font-extrabold leading-snug text-slate-700 [overflow-wrap:anywhere]"
                  dir="ltr"
                >
                  <BidiLearnerName learnerName={managedLearnerName} />
                  &apos;s private storybook-style portrait will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
