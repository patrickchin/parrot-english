import { ArrowLeft, Flag, Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect } from "react";

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

const SCREEN_CLASSES =
  "conversation-screen relative grid h-dvh w-full items-start justify-items-center overflow-y-auto [background:radial-gradient(circle_at_12%_14%,rgb(255_222_81_/_86%)_0_7%,transparent_7.3%),radial-gradient(circle_at_90%_86%,rgb(255_91_142_/_44%)_0_9%,transparent_9.3%),linear-gradient(145deg,#90dcf8,#69c8ee)] px-[clamp(16px,4vw,44px)] pb-[clamp(16px,4vw,44px)] pt-[112px] max-[720px]:pt-[92px] [@media(max-height:620px)]:px-2.5 [@media(max-height:620px)]:pb-2.5 [@media(max-height:620px)]:pt-[72px]";
const BACK_BUTTON_CLASSES =
  "conversation-back-button absolute top-[clamp(14px,2.2vh,28px)] left-[var(--lesson-edge-gap)] z-20 inline-flex min-h-[52px] cursor-pointer items-center gap-[7px] rounded-full border-4 border-white bg-[#204c7f] py-0 pr-[18px] pl-3 font-[950] text-white shadow-[0_5px_0_rgb(18_55_92_/_45%)] focus-visible:outline-5 focus-visible:outline-offset-3 focus-visible:outline-[#173c67] [&_svg]:size-[25px] max-[720px]:w-[52px] max-[720px]:min-w-[52px] max-[720px]:justify-center max-[720px]:p-0 max-[720px]:[&_span]:hidden [@media(max-height:620px)]:top-[10px] [@media(max-height:620px)]:left-[10px]";
const START_CARD_CLASSES =
  "conversation-start-card conversation-start-card--minimal grid w-[min(100%,700px)] justify-items-center gap-2.5 bg-transparent p-[clamp(8px,2vw,20px)] text-center";
const SHELL_CLASSES =
  "conversation-shell my-auto grid w-[min(100%,700px)] max-h-[calc(100dvh-32px)] justify-items-center gap-2.5 bg-transparent p-[clamp(8px,2vw,20px)] max-[560px]:max-h-none [@media(max-height:620px)]:max-h-none [@media(max-height:620px)]:gap-[9px] [@media(max-height:620px)]:p-3.5";
const CHARACTER_STAGE_CLASSES =
  "conversation-character-stage grid w-full place-items-center gap-[clamp(12px,2.5vh,22px)]";
const SPEECH_BUBBLE_CLASSES =
  "conversation-speech-bubble relative m-0 w-[min(92%,520px)] rounded-[26px] border-4 border-white bg-white p-[clamp(15px,3vw,22px)] text-center text-[clamp(1.15rem,3vw,1.55rem)] leading-[1.35] font-black text-[#173c67] shadow-[0_7px_0_rgb(31_76_126_/_16%)] after:absolute after:bottom-[-20px] after:left-1/2 after:h-0 after:w-0 after:-translate-x-1/2 after:border-x-[18px] after:border-t-[20px] after:border-x-transparent after:border-t-white after:content-[''] [@media(max-height:620px)]:px-[15px] [@media(max-height:620px)]:py-3 [@media(max-height:620px)]:text-base";
const CHARACTER_CLASSES =
  "conversation-character w-[clamp(230px,42vw,390px)] max-h-[min(48vh,420px)] object-contain drop-shadow-[0_8px_0_rgb(32_76_127_/_16%)] animate-[onboarding-float_2.8s_ease-in-out_infinite] motion-reduce:animate-none max-[560px]:w-[clamp(210px,66vw,330px)] [@media(max-height:620px)]:w-[clamp(160px,40vw,230px)] [@media(max-height:620px)]:max-h-[38vh]";
const JOINING_NOTICE_CLASSES =
  "conversation-joining-notice flex w-[min(100%,560px)] items-center justify-center gap-4 rounded-[22px] border-4 border-white bg-[#173c67] px-[22px] py-[18px] text-left text-white shadow-[0_8px_0_rgb(23_60_103_/_22%)] [&>span:last-child]:grid [&>span:last-child]:gap-[3px] [&_strong]:text-[clamp(1.2rem,4vw,1.5rem)] [&_strong]:leading-[1.15] [&_strong+span]:text-[0.95rem] [&_strong+span]:leading-[1.35] [&_strong+span]:font-bold";
const ACTION_BUTTON_FOCUS_CLASSES =
  "focus-visible:outline-5 focus-visible:outline-offset-3 focus-visible:outline-[#173c67]";

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
      className={BACK_BUTTON_CLASSES}
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
  const turnControlAvailable = !saving && !joining && status !== "error";

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
      <main className={SCREEN_CLASSES}>
        <ConversationBackButton onBack={onBack} />
        <section className={START_CARD_CLASSES}>
          <h1 className="conversation-visually-hidden sr-only">
            Chat with Peppa
          </h1>
          <div className={CHARACTER_STAGE_CLASSES}>
            <p className={SPEECH_BUBBLE_CLASSES}>
              Getting our chat ready…
            </p>
            <img
              alt="Peppa smiling"
              className={`${CHARACTER_CLASSES} conversation-character--start`}
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
    <main className={SCREEN_CLASSES}>
      <ConversationBackButton onBack={onBack} />
      <section className={SHELL_CLASSES}>
        <div className={CHARACTER_STAGE_CLASSES}>
          <p
            aria-live="polite"
            className={SPEECH_BUBBLE_CLASSES}
          >
            {speech}
          </p>
          <img
            alt="Peppa"
            className={`${CHARACTER_CLASSES} conversation-character--${status} ${
              status === "speaking" ? "[animation-duration:1.1s]" : ""
            }`}
            src={PEPPA_ASSETS[status]}
          />
        </div>

        {joining ? (
          <div
            aria-live="assertive"
            className={JOINING_NOTICE_CLASSES}
            role="status"
          >
            <span
              aria-hidden="true"
              className="conversation-joining-spinner aspect-square size-[38px] shrink-0 animate-spin rounded-full border-[5px] border-white/35 border-t-[#ffcf40] motion-reduce:animate-none"
            />
            <span>
              <strong>{STATUS_LABELS.connecting}</strong>
              <span>
                Please wait until Peppa says hello before you start talking.
              </span>
            </span>
          </div>
        ) : (
          <p
            aria-live="polite"
            className="conversation-visually-hidden sr-only"
            role="status"
          >
            {STATUS_LABELS[status]}
          </p>
        )}

        {error ? (
          <p
            className="conversation-error m-0 w-[min(100%,560px)] rounded-[14px] bg-[#ffe2eb] px-3.5 py-2.5 text-center font-[850] text-[#8c1845]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!saving && !joining ? (
          <div className="conversation-actions grid w-[min(100%,560px)] justify-items-center gap-3">
            {status === "error" ? (
              <button
                className={`conversation-retry-button inline-flex min-h-16 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[17px] border-0 bg-[#ff467b] px-6 py-0 text-[1.05rem] font-[950] text-white shadow-[0_6px_0_#b92259] [&_svg]:size-[22px] ${ACTION_BUTTON_FOCUS_CLASSES}`}
                onClick={onStart}
                type="button"
              >
                <RotateCcw aria-hidden="true" />
                Try again
              </button>
            ) : (
              <button
                aria-keyshortcuts="Space"
                aria-pressed={microphoneEnabled}
                className={`conversation-turn-button inline-flex min-h-16 w-full touch-manipulation cursor-pointer items-center justify-center gap-3 rounded-[17px] border-0 px-6 py-2 text-[1.05rem] font-[950] text-white [&_svg]:size-[22px] ${ACTION_BUTTON_FOCUS_CLASSES} ${
                  microphoneEnabled
                    ? "is-active bg-[#d62f70] shadow-[0_6px_0_#941c4d]"
                    : "bg-[#087451] shadow-[0_6px_0_#045b3e]"
                }`}
                onClick={onToggleMicrophone}
                type="button"
              >
                {microphoneEnabled ? (
                  <MicOff aria-hidden="true" />
                ) : (
                  <Mic aria-hidden="true" />
                )}
                <span className="conversation-turn-button-copy grid justify-items-start leading-[1.1]">
                  <strong>
                    {microphoneEnabled ? "End my turn" : "Start my turn"}
                  </strong>
                  <small className="mt-[3px] text-[0.73rem] font-bold opacity-[0.86]">
                    Click or press Space
                  </small>
                </span>
              </button>
            )}

            <button
              className={`conversation-finish-button inline-flex min-h-16 w-full cursor-pointer items-center justify-center gap-[7px] rounded-[17px] border-0 bg-white/88 px-6 py-0 text-[1.05rem] font-[950] text-[#315f89] no-underline shadow-[0_6px_0_rgb(31_76_126_/_22%)] [&_svg]:size-[22px] ${ACTION_BUTTON_FOCUS_CLASSES}`}
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
