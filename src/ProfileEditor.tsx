import type { FormEvent } from "react";
import { OnboardingCard, OnboardingScreen } from "./OnboardingLayout";
import {
  ActionButton,
  fieldClassName,
  IconButton,
  TextButton,
} from "./ui";

type ProfileEditorViewProps = {
  drafts: Record<string, string>;
  fieldErrors: Record<string, string>;
  isSaving: boolean;
  onCancel: () => void;
  onClose: () => void;
  onRedoOnboarding: () => void;
  onSave: () => void;
  onValueChange: (answerKey: string, value: string) => void;
  pageError: string;
};

export function ProfileEditorView({
  drafts,
  fieldErrors,
  isSaving,
  onCancel,
  onClose,
  onRedoOnboarding,
  onSave,
  onValueChange,
  pageError,
}: ProfileEditorViewProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  return (
    <OnboardingScreen profile>
      <OnboardingCard
        aria-labelledby="profile-title"
        className="p-5 sm:p-8"
        width="narrow"
      >
        <header className="flex items-center justify-between gap-4">
          <h1
            className="m-0 text-3xl leading-none text-brand-ink sm:text-5xl"
            id="profile-title"
          >
            Edit profile
          </h1>
          <IconButton
            aria-label="Close profile editor"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ×
          </IconButton>
        </header>

        <form className="mt-6" onSubmit={submit}>
          <fieldset
            className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
            disabled={isSaving}
          >
            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-name"
            >
              <span>Name</span>
              <input
                autoComplete="name"
                className={fieldClassName()}
                id="profile-name"
                maxLength={120}
                onChange={(event) =>
                  onValueChange("name", event.currentTarget.value)
                }
                type="text"
                value={drafts.name ?? ""}
              />
            </label>
            {fieldErrors.name ? (
              <p className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900" role="alert">
                {fieldErrors.name}
              </p>
            ) : null}

            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-age"
            >
              <span>Age</span>
              <input
                id="profile-age"
                className={fieldClassName()}
                onChange={(event) =>
                  onValueChange("age", event.currentTarget.value)
                }
                type="text"
                value={drafts.age ?? ""}
              />
            </label>
            {fieldErrors.age ? (
              <p className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900" role="alert">
                {fieldErrors.age}
              </p>
            ) : null}

            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-description"
            >
              <span>
                About {(drafts.name ?? "").trim() || "this learner"}
              </span>
              <textarea
                className={fieldClassName(
                  "min-h-28 resize-y leading-relaxed",
                )}
                id="profile-description"
                maxLength={2_000}
                onChange={(event) =>
                  onValueChange("description", event.currentTarget.value)
                }
                placeholder="Add a short description"
                rows={4}
                value={drafts.description ?? ""}
              />
            </label>
            {fieldErrors.description ? (
              <p className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900" role="alert">
                {fieldErrors.description}
              </p>
            ) : null}
          </fieldset>

          <div className="mt-5 flex items-center gap-4">
            <img
              alt="Peppa smiling"
              className="size-20 shrink-0 object-contain"
              src="/assets/characters/peppa/peppa-happy.webp"
            />
            <ActionButton
              className="w-full min-w-0"
              disabled={isSaving}
              onClick={onRedoOnboarding}
              type="button"
            >
              Chat with Peppa again
            </ActionButton>
          </div>

          {pageError ? (
            <p className="mt-4 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900" role="alert">
              {pageError}
            </p>
          ) : null}

          <footer className="mt-6 flex items-center justify-between gap-4 border-t-3 border-sky-100 bg-white/95 pb-1 pt-4 max-sm:flex-col-reverse max-sm:items-stretch">
            <TextButton
              disabled={isSaving}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </TextButton>
            <ActionButton
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </ActionButton>
          </footer>
        </form>
      </OnboardingCard>
    </OnboardingScreen>
  );
}
