import { Keyboard, Mic, MicOff, RotateCcw, Square } from "lucide-react";
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
  connecting: "Joining Peppa…",
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
  const joining = status === "connecting";
  const speech = latestAssistantSpeech(turns) ??
    (joining
      ? "Almost ready!"
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

        {joining ? (
          <div
            aria-live="assertive"
            className="conversation-joining-notice"
            role="status"
          >
            <span aria-hidden="true" className="conversation-joining-spinner" />
            <span>
              <strong>{STATUS_LABELS.connecting}</strong>
              <span>
                Please wait until Peppa says hello before you start talking.
              </span>
            </span>
          </div>
        ) : (
          <p
            className={`conversation-state conversation-state--${status}`}
            role="status"
          >
            <span aria-hidden="true" />
            {STATUS_LABELS[status]}
          </p>
        )}

        {error ? <p className="conversation-error" role="alert">{error}</p> : null}

        {!saving && !joining ? (
          <div className="conversation-actions">
            <div className="conversation-controls">
              {status === "error" ? (
                <button
                  className="conversation-retry-button"
                  onClick={onStart}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" />
                  Try again
                </button>
              ) : (
                <button
                  aria-pressed={!microphoneEnabled}
                  className="conversation-microphone-button"
                  onClick={onToggleMicrophone}
                  type="button"
                >
                  {microphoneEnabled ? (
                    <MicOff aria-hidden="true" />
                  ) : (
                    <Mic aria-hidden="true" />
                  )}
                  {microphoneEnabled ? "Mute microphone" : "Turn microphone on"}
                </button>
              )}
            </div>

            <details className="conversation-type-panel">
              <summary>
                <Keyboard aria-hidden="true" />
                <span>Type instead</span>
              </summary>
              <form className="conversation-text-form" onSubmit={submitTypedAnswer}>
                <input
                  aria-label="Type your answer"
                  maxLength={1_000}
                  onChange={(event) => onTypedValueChange(event.currentTarget.value)}
                  placeholder="Type an answer here"
                  value={typedValue}
                />
                <button
                  className="conversation-send-button"
                  type="submit"
                >
                  Send
                </button>
              </form>
            </details>

            <button
              className="conversation-finish-button"
              onClick={onFinish}
              type="button"
            >
              <Square aria-hidden="true" />
              Finish conversation
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
