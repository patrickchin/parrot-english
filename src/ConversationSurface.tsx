import type { FormEvent } from "react";

export type ConversationSurfaceStatus =
  | "ready"
  | "connecting"
  | "listening"
  | "speaking"
  | "reconnecting"
  | "error"
  | "saving";

export type ConversationSurfaceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ConversationSurfaceCandidate = {
  id: string;
  factKey: "name" | "age" | "interest" | "summary";
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
  Exclude<ConversationSurfaceStatus, "ready">,
  string
> = {
  connecting: "Joining your voice room…",
  listening: "Listening — take your time",
  speaking: "Peppa is talking",
  reconnecting: "Reconnecting… your answers are safe",
  error: "The voice room took a break",
  saving: "Saving your profile…",
};

const PEPPA_ASSETS: Record<ConversationSurfaceStatus, string> = {
  ready: "/assets/characters/peppa/peppa-happy.webp",
  connecting: "/assets/characters/peppa/peppa-happy.webp",
  listening: "/assets/characters/peppa/peppa-listening.webp",
  speaking: "/assets/characters/peppa/peppa-talking.webp",
  reconnecting: "/assets/characters/peppa/peppa-surprised.webp",
  error: "/assets/characters/peppa/peppa-sad.webp",
  saving: "/assets/characters/peppa/peppa-happy.webp",
};

function debugTranscript(
  turns: ConversationSurfaceTurn[],
  className = "conversation-debug-transcript",
) {
  if (turns.length === 0) return null;
  return (
    <details className={className}>
      <summary>Debug transcript</summary>
      <ol className="conversation-transcript">
        {turns.map((turn) => (
          <li
            className={`conversation-turn conversation-turn--${turn.role}`}
            key={turn.id}
          >
            <strong>{turn.role === "assistant" ? "Peppa" : "You"}</strong>
            <span>{turn.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function latestAssistantSpeech(turns: ConversationSurfaceTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role === "assistant") return turns[index].text;
  }
  return null;
}

export function ConversationSurface({
  error,
  microphoneEnabled,
  onFinish,
  onSendText,
  onStart,
  onToggleMicrophone,
  onTypedValueChange,
  status,
  turns,
  typedValue,
}: ConversationSurfaceProps) {
  if (status === "ready") {
    return (
      <main className="conversation-screen">
        <section className="conversation-start-card conversation-start-card--minimal">
          <h1 className="conversation-visually-hidden">Chat with Peppa</h1>
          <div className="conversation-character-stage">
            <p className="conversation-speech-bubble">
              Getting our chat ready…
            </p>
            <img
              alt="Peppa smiling"
              className="conversation-character conversation-character--start"
              src={PEPPA_ASSETS.ready}
            />
          </div>
        </section>
      </main>
    );
  }

  function submitTypedAnswer(event: FormEvent) {
    event.preventDefault();
    onSendText();
  }

  const saving = status === "saving";
  const waitingForPeppa = status === "connecting";
  const speech = latestAssistantSpeech(turns) ??
    (status === "connecting"
      ? "Hello! Here I come…"
      : saving
        ? "Lovely chat! I'll remember that."
        : "I'm listening!");
  return (
    <main className="conversation-screen">
      <section className="conversation-shell">
        <div className="conversation-character-stage">
          <p
            aria-live="polite"
            className="conversation-speech-bubble"
          >
            {speech}
          </p>
          <img
            alt="Peppa"
            className={`conversation-character conversation-character--${status}`}
            src={PEPPA_ASSETS[status]}
          />
        </div>

        <p className="conversation-state" role="status">
          {STATUS_LABELS[status]}
        </p>

        {error ? <p role="alert">{error}</p> : null}

        {!saving ? <div className="conversation-controls">
          <button
            aria-pressed={!microphoneEnabled}
            className="conversation-secondary-button"
            disabled={waitingForPeppa}
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
          {status === "error" ? (
            <button
              className="conversation-secondary-button"
              onClick={onStart}
              type="button"
            >
              Try again
            </button>
          ) : null}
        </div> : null}

        {!saving ? <details className="conversation-type-panel">
          <summary>Type instead</summary>
          <form className="conversation-text-form" onSubmit={submitTypedAnswer}>
            <input
              aria-label="Type your answer"
              disabled={waitingForPeppa}
              maxLength={1_000}
              onChange={(event) => onTypedValueChange(event.currentTarget.value)}
              placeholder="Type an answer here"
              value={typedValue}
            />
            <button
              className="conversation-send-button"
              disabled={waitingForPeppa}
              type="submit"
            >
              Send
            </button>
          </form>
        </details> : null}

        {debugTranscript(turns)}
      </section>
    </main>
  );
}
