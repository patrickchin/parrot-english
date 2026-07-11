import type { FormEvent } from "react";

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
    <main className="onboarding-screen onboarding-profile-screen">
      <section
        aria-labelledby="profile-title"
        className="onboarding-profile-shell profile-basic-shell"
      >
        <header className="onboarding-profile-heading">
          <div>
            <p>Your profile</p>
            <h1 id="profile-title">Edit profile</h1>
          </div>
          <button
            aria-label="Close profile editor"
            className="onboarding-icon-button"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <p className="profile-editor-intro">
          Keep the basics up to date. You can chat with your pig pal again any
          time.
        </p>

        <form className="profile-editor-form" onSubmit={submit}>
          <fieldset className="profile-basic-fields" disabled={isSaving}>
            <label className="profile-basic-field" htmlFor="profile-name">
              <span>Name</span>
              <input
                autoComplete="name"
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
              <p className="onboarding-field-error" role="alert">
                {fieldErrors.name}
              </p>
            ) : null}

            <label className="profile-basic-field" htmlFor="profile-age">
              <span>Age</span>
              <input
                id="profile-age"
                inputMode="numeric"
                max={17}
                min={3}
                onChange={(event) =>
                  onValueChange("age", event.currentTarget.value)
                }
                type="number"
                value={drafts.age ?? ""}
              />
            </label>
            {fieldErrors.age ? (
              <p className="onboarding-field-error" role="alert">
                {fieldErrors.age}
              </p>
            ) : null}

            <section
              aria-label="Profile description"
              className="profile-description"
            >
              <h2>
                About {(drafts.name ?? "").trim() || "this learner"}
              </h2>
              <p>
                {(drafts.description ?? "").trim() ||
                  "Chat with Peppa and a little description will appear here."}
              </p>
            </section>
          </fieldset>

          <section className="profile-chat-card" aria-labelledby="profile-chat-title">
            <div>
              <h2 id="profile-chat-title">Want another little chat?</h2>
              <p>Redo the short onboarding conversation with your pig pal.</p>
            </div>
            <button
              className="profile-chat-button"
              disabled={isSaving}
              onClick={onRedoOnboarding}
              type="button"
            >
              Chat with your pig pal again
            </button>
          </section>

          {pageError ? (
            <p className="onboarding-field-error" role="alert">
              {pageError}
            </p>
          ) : null}

          <footer className="profile-editor-actions">
            <button
              className="onboarding-skip-button"
              disabled={isSaving}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="onboarding-next-button"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}
