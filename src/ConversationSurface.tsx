import { ArrowLeft, Flag, Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export type ConversationSurfaceStatus =
  | "ready"
  | "connecting"
  | "listening"
  | "thinking"
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
  onBack: () => void;
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
  thinking: "Peppa is thinking…",
  speaking: "Peppa is talking",
  reconnecting: "Reconnecting… your answers are safe",
  error: "The voice room took a break",
  saving: "Saving your profile…",
};

const PEPPA_ASSETS: Record<ConversationSurfaceStatus, string> = {
  ready: "/assets/characters/peppa/peppa-happy.webp",
  connecting: "/assets/characters/peppa/peppa-happy.webp",
  listening: "/assets/characters/peppa/peppa-listening.webp",
  thinking: "/assets/characters/peppa/peppa-listening.webp",
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

function isInteractiveSpaceTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest(
      "button, input, textarea, select, [contenteditable='true'], [role='button']",
    ),
  );
}

function ConversationBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      aria-label="Back"
      className="conversation-back-button app-header-control"
      onClick={onBack}
      type="button"
    >
      <ArrowLeft aria-hidden="true" />
      <span>Back</span>
    </button>
  );
}

export function ConversationSurface({
  error,
  microphoneEnabled,
  onBack,
  onFinish,
  onStart,
  onToggleMicrophone,
  status,
  turns,
}: ConversationSurfaceProps) {
  const saving = status === "saving";
  const joining = status === "connecting";
  const thinking = status === "thinking";
  const turnControlAvailable =
    !saving && !joining && !thinking && status !== "error";

  useEffect(() => {
    if (!turnControlAvailable) return;

    function toggleTurnWithSpace(event: KeyboardEvent) {
      if (
        event.repeat ||
        (event.code !== "Space" && event.key !== " ") ||
        isInteractiveSpaceTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      onToggleMicrophone();
    }

    window.addEventListener("keydown", toggleTurnWithSpace);
    return () => window.removeEventListener("keydown", toggleTurnWithSpace);
  }, [onToggleMicrophone, turnControlAvailable]);

  if (status === "ready") {
    return (
      <main className="conversation-screen">
        <ConversationBackButton onBack={onBack} />
        <section className="conversation-start-card">
          <h1 className="conversation-visually-hidden">
            Chat with Peppa
          </h1>
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

  const speech = latestAssistantSpeech(turns) ??
    (joining
      ? "Almost ready!"
      : saving
        ? "Lovely chat! I'll remember that."
        : "I'm listening!");
  return (
    <main className="conversation-screen">
      <ConversationBackButton onBack={onBack} />
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
            <span
              aria-hidden="true"
              className="conversation-joining-spinner"
            />
            <span>
              <strong>{STATUS_LABELS.connecting}</strong>
              <span>
                Please wait until Peppa says hello before you start talking.
              </span>
            </span>
          </div>
        ) : thinking ? (
          <div
            aria-live="polite"
            className="conversation-response-notice"
            role="status"
          >
            <span
              aria-hidden="true"
              className="conversation-response-spinner"
            />
            <span>
              <strong>{STATUS_LABELS.thinking}</strong>
              <span>Getting her reply ready.</span>
            </span>
          </div>
        ) : (
          <p
            aria-live="polite"
            className="conversation-visually-hidden"
            role="status"
          >
            {STATUS_LABELS[status]}
          </p>
        )}

        {error ? (
          <p
            className="conversation-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!saving && !joining ? (
          <div className="conversation-actions">
            {status === "error" ? (
              <button
                className="conversation-retry-button app-button app-button--large app-button--brand"
                onClick={onStart}
                type="button"
              >
                <RotateCcw aria-hidden="true" />
                Try again
              </button>
            ) : thinking ? null : (
              <button
                aria-keyshortcuts="Space"
                aria-pressed={microphoneEnabled}
                className={`conversation-turn-button app-button app-button--large ${
                  microphoneEnabled
                    ? "is-active app-button--brand"
                    : "app-button--success"
                }`}
                onClick={onToggleMicrophone}
                type="button"
              >
                {microphoneEnabled ? (
                  <MicOff aria-hidden="true" />
                ) : (
                  <Mic aria-hidden="true" />
                )}
                <span className="conversation-turn-button-copy">
                  <strong>
                    {microphoneEnabled ? "End my turn" : "Start my turn"}
                  </strong>
                  <small>
                    Click or press Space
                  </small>
                </span>
              </button>
            )}

            <button
              className="conversation-finish-button app-button app-button--large app-button--surface"
              onClick={onFinish}
              type="button"
            >
              <Flag aria-hidden="true" />
              Finish conversation
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
