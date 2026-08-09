import { ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import { ActionButton, fieldClassName } from "../shared/ui";
import type { PersonalizedStoryArtwork } from "./personalized-story-art-client";

export function PersonalizedStoryArtPanel({
  consentChecked,
  error,
  featureEnabled = true,
  fileName = "",
  hasSelectedPhoto = false,
  hasStoredArt = false,
  generateDisabled,
  isGenerating,
  onConsentChange,
  onFileChange,
  onGenerate,
  onRemove,
  personalizedArtwork,
  showPreviewArtwork = true,
  statusMessage = "",
  storyTitle,
}: {
  consentChecked: boolean;
  error?: string;
  featureEnabled?: boolean;
  fileName?: string;
  hasSelectedPhoto?: boolean;
  hasStoredArt?: boolean;
  generateDisabled?: boolean;
  isGenerating: boolean;
  onConsentChange: (checked: boolean) => void;
  onFileChange?: (file: File | null) => void;
  onGenerate: () => void;
  onRemove: () => void;
  personalizedArtwork: PersonalizedStoryArtwork | null;
  showPreviewArtwork?: boolean;
  statusMessage?: string;
  storyTitle: string;
}) {
  const cleanupOnly = hasStoredArt && (!featureEnabled || !personalizedArtwork);
  if (!featureEnabled && !cleanupOnly) return null;

  if (cleanupOnly) {
    return (
      <section
        aria-label="Personalized story art"
        className="rounded-[1.5rem] border-4 border-white bg-white/95 p-4 shadow-card sm:p-5"
      >
        <div className="grid gap-3">
          <p className="m-0 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-blue">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Private art cleanup
          </p>
          <h2 className="m-0 text-xl leading-tight text-brand-navy sm:text-2xl">
            Remove stored story art
          </h2>
          <p className="m-0 text-sm font-bold leading-relaxed text-slate-700">
            New generation is unavailable, but your private derivative can still
            be deleted. If an earlier purge failed, this retries it.
          </p>
          <div>
            <ActionButton
              className="gap-2 rounded-full border-4 border-white"
              disabled={isGenerating}
              onClick={onRemove}
              type="button"
              variant="surface"
            >
              <Trash2 aria-hidden="true" className="size-5" />
              {isGenerating
                ? "Deleting stored story art"
                : "Delete stored story art"}
            </ActionButton>
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
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900"
              role="status"
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
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.9fr)] sm:items-start">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="m-0 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-blue">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Guardian consent
            </p>
            <h2 className="m-0 text-xl leading-tight text-brand-navy sm:text-2xl">
              Make page one of {storyTitle} look like your child
            </h2>
            <p className="m-0 text-sm font-bold leading-relaxed text-slate-700">
              This is optional. The original photo is not saved. Parrot keeps one
              private storybook-style picture for this page, and you can delete it
              anytime.
            </p>
          </div>

          <label className="grid gap-1.5" htmlFor="personalized-story-photo">
            <span className="text-sm font-black text-brand-navy">
              Upload learner photo
            </span>
            <input
              accept="image/*"
              className={fieldClassName({
                className: "cursor-pointer rounded-xl bg-sky-50 px-3 py-2 text-sm",
                tone: "tinted",
              })}
              id="personalized-story-photo"
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

          <label className="flex items-start gap-3 rounded-2xl bg-sky-50 px-3 py-3 text-sm font-bold leading-relaxed text-slate-700">
            <input
              checked={consentChecked}
              className="mt-1 size-4 shrink-0 accent-brand-blue"
              onChange={(event) => onConsentChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>
              I confirm I am the child&apos;s guardian or have permission to use
              this photo.
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <ActionButton
              className="gap-2 rounded-full border-4 border-white"
              disabled={
                generateDisabled ?? (!consentChecked || isGenerating)
              }
              onClick={onGenerate}
              type="button"
            >
              <ImagePlus aria-hidden="true" className="size-5" />
              {isGenerating ? "Creating story art" : "Generate story art"}
            </ActionButton>
            {personalizedArtwork ? (
              <ActionButton
                className="gap-2 rounded-full border-4 border-white"
                onClick={onRemove}
                type="button"
                variant="surface"
              >
                <Trash2 aria-hidden="true" className="size-5" />
                Delete learner photo
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
              className="m-0 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-900"
              role="status"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[1.4rem] border-3 border-white bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#dbeafe_45%,#fce7f3_100%)] shadow-control-surface">
          {personalizedArtwork && showPreviewArtwork ? (
            <img
              alt={personalizedArtwork.alt}
              className="aspect-square h-full w-full object-cover"
              src={personalizedArtwork.src}
            />
          ) : personalizedArtwork ? (
            <div
              aria-label="Story art ready preview hidden"
              className="grid aspect-square place-items-center p-6 text-center"
              role="img"
            >
              <div className="grid gap-2">
                <span className="text-sm font-black uppercase tracking-wider text-brand-blue">
                  Story art ready
                </span>
                <p className="m-0 text-base font-extrabold leading-snug text-slate-700">
                  The personalized page art is active in this story.
                </p>
              </div>
            </div>
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
                <p className="m-0 text-base font-extrabold leading-snug text-slate-700">
                  Your private storybook-style portrait will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
