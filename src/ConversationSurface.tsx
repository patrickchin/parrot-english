import type { FormEvent } from "react";

export type ConversationSurfaceStatus =
  | "ready"
  | "connecting"
  | "listening"
  | "speaking"
  | "reconnecting"
  | "error"
  | "summary";

export type ConversationSurfaceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ConversationSurfaceCandidate = {
  id: string;
  factKey: "name" | "age" | "interest";
  label: string;
  status: "accepted" | "edited" | "rejected";
  value: string;
};

type ConversationSurfaceProps = {
  candidates: ConversationSurfaceCandidate[];
  error: string;
  microphoneEnabled: boolean;
  onCandidateChange: (id: string, value: string) => void;
  onCandidateStatusChange: (
    id: string,
    status: ConversationSurfaceCandidate["status"],
  ) => void;
  onFinish: () => void;
  onSendText: () => void;
  onStart: () => void;
  onSubmitReview: () => void;
  onToggleMicrophone: () => void;
  onTypedValueChange: (value: string) => void;
  onUseForm: () => void;
  status: ConversationSurfaceStatus;
  turns: ConversationSurfaceTurn[];
  typedValue: string;
};

const STATUS_LABELS: Record<
  Exclude<ConversationSurfaceStatus, "ready" | "summary">,
  string
> = {
  connecting: "Joining your voice room…",
  listening: "Listening — take your time",
  speaking: "Your pig pal is talking",
  reconnecting: "Reconnecting… your answers are safe",
  error: "The voice room took a break",
};

function useFormButton(onUseForm: () => void) {
  return (
    <button
      className="conversation-link-button"
      onClick={onUseForm}
      type="button"
    >
      Use the form instead
    </button>
  );
}

export function ConversationSurface({
  candidates,
  error,
  microphoneEnabled,
  onCandidateChange,
  onCandidateStatusChange,
  onFinish,
  onSendText,
  onStart,
  onSubmitReview,
  onToggleMicrophone,
  onTypedValueChange,
  onUseForm,
  status,
  turns,
  typedValue,
}: ConversationSurfaceProps) {
  if (status === "ready") {
    return (
      <main className="conversation-screen">
        <section className="conversation-start-card">
          <img
            alt="A friendly pig host waving hello"
            className="conversation-character"
            src="/assets/characters/pig-host.webp"
          />
          <p className="conversation-eyebrow">A LITTLE GET-TO-KNOW-YOU CHAT</p>
          <h1>Meet your pig pal</h1>
          <p>
            Have a short chat in English. You can say “I don’t know”, stay quiet,
            or finish whenever you like. Only your name and age are needed.
          </p>
          <p>We save the words from this chat, not the audio.</p>
          <button
            className="conversation-primary-button"
            onClick={onStart}
            type="button"
          >
            Start talking
          </button>
          {useFormButton(onUseForm)}
        </section>
      </main>
    );
  }

  if (status === "summary") {
    return (
      <main className="conversation-screen">
        <section className="conversation-summary-card">
          <header>
            <p className="conversation-eyebrow">ONE QUICK CHECK</p>
            <h1>Here’s what I heard</h1>
            <p>Change anything that is not quite right, or leave it out.</p>
          </header>
          <div className="conversation-candidate-list">
            {candidates.length === 0 ? (
              <p role="status">No details to check — that is completely okay.</p>
            ) : (
              candidates.map((candidate) => (
                <div className="conversation-candidate" key={candidate.id}>
                  <label>
                    <span>{candidate.label}</span>
                    <input
                      aria-label={`Edit ${candidate.label}`}
                      onChange={(event) =>
                        onCandidateChange(candidate.id, event.currentTarget.value)
                      }
                      value={candidate.value}
                    />
                  </label>
                  <select
                    aria-label={`Choose whether to keep ${candidate.label}`}
                    onChange={(event) =>
                      onCandidateStatusChange(
                        candidate.id,
                        event.currentTarget.value as
                          | "accepted"
                          | "edited"
                          | "rejected",
                      )
                    }
                    value={candidate.status === "rejected" ? "rejected" : "accepted"}
                  >
                    <option value="accepted">Keep this</option>
                    <option value="rejected">Leave this out</option>
                  </select>
                </div>
              ))
            )}
          </div>
          {turns.length > 0 ? (
            <details className="conversation-summary-transcript">
              <summary>Conversation transcript</summary>
              <ol className="conversation-transcript">
                {turns.map((turn) => (
                  <li
                    className={`conversation-turn conversation-turn--${turn.role}`}
                    key={turn.id}
                  >
                    <strong>
                      {turn.role === "assistant" ? "Pig pal" : "You"}
                    </strong>
                    <span>{turn.text}</span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <button
            className="conversation-primary-button"
            onClick={onSubmitReview}
            type="button"
          >
            Save and continue
          </button>
          {useFormButton(onUseForm)}
        </section>
      </main>
    );
  }

  function submitTypedAnswer(event: FormEvent) {
    event.preventDefault();
    onSendText();
  }

  const latestTurn = turns.at(-1);
  return (
    <main className="conversation-screen">
      <section className="conversation-shell">
        <header className="conversation-header">
          <img
            alt="A friendly pig host"
            className={`conversation-character conversation-character--${status}`}
            src="/assets/characters/pig-host.webp"
          />
          <div>
            <p className="conversation-eyebrow">GETTING TO KNOW YOU</p>
            <h1>Chat with your pig pal</h1>
            <p aria-live="polite" className="conversation-state" role="status">
              {STATUS_LABELS[status]}
            </p>
          </div>
        </header>

        {latestTurn ? (
          <p aria-live="polite" className="conversation-caption">
            {latestTurn.text}
          </p>
        ) : null}

        <ol aria-label="Conversation transcript" className="conversation-transcript">
          {turns.map((turn) => (
            <li className={`conversation-turn conversation-turn--${turn.role}`} key={turn.id}>
              <strong>{turn.role === "assistant" ? "Pig pal" : "You"}</strong>
              <span>{turn.text}</span>
            </li>
          ))}
        </ol>

        {error ? <p role="alert">{error}</p> : null}

        <form className="conversation-text-form" onSubmit={submitTypedAnswer}>
          <input
            aria-label="Type your answer"
            maxLength={1_000}
            onChange={(event) => onTypedValueChange(event.currentTarget.value)}
            placeholder="Type an answer here"
            value={typedValue}
          />
          <button className="conversation-send-button" type="submit">
            Send
          </button>
        </form>

        <div className="conversation-controls">
          <button
            aria-pressed={!microphoneEnabled}
            className="conversation-secondary-button"
            onClick={onToggleMicrophone}
            type="button"
          >
            {microphoneEnabled ? "Mute microphone" : "Microphone off"}
          </button>
          <button
            className="conversation-secondary-button"
            onClick={onFinish}
            type="button"
          >
            Finish now
          </button>
          {useFormButton(onUseForm)}
        </div>
      </section>
    </main>
  );
}
