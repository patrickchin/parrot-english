import {
  ArrowLeft,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { ConversationPurpose } from "../../lib/conversation-purpose";
import { HeaderButton, RouteHeader } from "../app/AppHeader";
import { ActionButton, cx, IconButton, TextButton } from "../shared/ui";

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

type ConversationSurfaceProps = {
  error: string;
  liveTranscript: string;
  microphoneEnabled: boolean;
  onBack: () => void;
  onFinish: () => void;
  onRepeatAudio: () => void;
  onStart: () => void;
  onToggleMicrophone: () => void;
  purpose: ConversationPurpose;
  responseLatencyMs: number | null;
  status: ConversationSurfaceStatus;
  turnReady: boolean;
  turns: ConversationSurfaceTurn[];
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

const PURPOSE_COPY: Record<
  ConversationPurpose,
  { finishLabel: string | null; title: string }
> = {
  "small-chat": {
    finishLabel: null,
    title: "Chat with Peppa",
  },
  onboarding: {
    finishLabel: "Save and finish",
    title: "Help Peppa know you",
  },
  "profile-edit": {
    finishLabel: "Save changes",
    title: "Update my profile",
  },
};

function latestAssistantSpeech(turns: ConversationSurfaceTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role === "assistant" && turns[index].text.trim()) {
      return turns[index].text;
    }
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

function ConversationHeader({ onBack }: { onBack: () => void }) {
  return (
    <RouteHeader>
      <HeaderButton
        aria-label="Back"
        icon={<ArrowLeft />}
        onClick={onBack}
        type="button"
      >
        Back
      </HeaderButton>
    </RouteHeader>
  );
}

function ConversationScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative h-dvh min-h-0 w-full overflow-hidden bg-conversation px-3 pb-3 pt-20 short:px-2 short:pb-2 short:pt-16 md:px-8 md:pb-6 md:pt-24">
      {children}
    </main>
  );
}

function statusLabel(
  status: ConversationSurfaceStatus,
  microphoneEnabled: boolean,
) {
  if (status === "ready" || status === "connecting") {
    return "Peppa is getting ready";
  }
  if (status === "listening") {
    return microphoneEnabled ? "Listening to you" : "Your turn";
  }
  if (status === "thinking") return "Peppa is thinking";
  if (status === "speaking") return "Peppa is talking";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "error") return "Chat paused";
  return "Conversation ended";
}

function ConversationStatus({
  className,
  microphoneEnabled,
  status,
}: {
  className?: string;
  microphoneEnabled: boolean;
  status: ConversationSurfaceStatus;
}) {
  const busy = [
    "ready",
    "connecting",
    "thinking",
    "reconnecting",
    "saving",
  ].includes(status);

  return (
    <p
      aria-live="polite"
      className={cx(
        "m-0 inline-flex min-h-7 items-center gap-2 rounded-full bg-brand-ink/90 px-3 py-1 text-center text-sm font-black leading-tight text-white shadow-sm short:min-h-6 short:text-xs sm:text-base",
        className,
      )}
      role="status"
    >
      {busy ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cx(
            "size-2.5 shrink-0 rounded-full",
            status === "error"
              ? "bg-rose-300"
              : microphoneEnabled
                ? "animate-pulse bg-brand-yellow motion-reduce:animate-none"
                : "bg-white",
          )}
        />
      )}
      {statusLabel(status, microphoneEnabled)}
    </p>
  );
}

type Caption = {
  label: string;
  liveTranscript: boolean;
  role: "alert" | undefined;
  text: string;
};

function selectCaption({
  assistantSpeech,
  error,
  liveTranscript,
  microphoneEnabled,
  purpose,
  status,
}: {
  assistantSpeech: string | null;
  error: string;
  liveTranscript: string;
  microphoneEnabled: boolean;
  purpose: ConversationPurpose;
  status: ConversationSurfaceStatus;
}): Caption {
  if (status === "error") {
    return {
      label: "Something went wrong",
      liveTranscript: false,
      role: "alert",
      text: error || "The voice room took a break. Try again.",
    };
  }
  if (status === "ready") {
    return {
      label: "Peppa",
      liveTranscript: false,
      role: undefined,
      text: "Getting our chat ready…",
    };
  }
  if (status === "connecting") {
    return {
      label: "Almost there",
      liveTranscript: false,
      role: undefined,
      text: "Peppa is getting ready. This can take about 25 seconds.",
    };
  }
  if (status === "reconnecting") {
    return {
      label: "Connection update",
      liveTranscript: false,
      role: undefined,
      text: "The connection wobbled. Your answers are safe.",
    };
  }
  if (status === "saving") {
    return {
      label: "All done",
      liveTranscript: false,
      role: undefined,
      text:
        purpose === "small-chat"
          ? "That was fun! See you next time."
          : "Lovely chat! I'll remember that.",
    };
  }
  if (microphoneEnabled) {
    return {
      label: "You’re saying",
      liveTranscript: true,
      role: undefined,
      text: liveTranscript || "Listening for your words…",
    };
  }
  if (status === "thinking" && liveTranscript) {
    return {
      label: "You said",
      liveTranscript: true,
      role: undefined,
      text: liveTranscript,
    };
  }
  if (assistantSpeech) {
    return {
      label: "Peppa",
      liveTranscript: false,
      role: undefined,
      text: assistantSpeech,
    };
  }
  return {
    label: "Peppa",
    liveTranscript: false,
    role: undefined,
    text:
      status === "thinking"
        ? "I'm getting my reply ready…"
        : status === "speaking"
          ? "I'm talking…"
          : "I'm listening!",
  };
}

function ConversationCaptions({
  caption,
  className,
  onRepeatAudio,
  showRepeat,
}: {
  caption: Caption;
  className?: string;
  onRepeatAudio: () => void;
  showRepeat: boolean;
}) {
  return (
    <div
      className={cx(
        "relative h-24 w-full max-w-xl short:h-18",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2.5 left-1/2 z-0 size-6 -translate-x-1/2 rotate-45 border-l-4 border-t-4 border-white bg-white short-wide:-left-2.5 short-wide:top-1/2 short-wide:-translate-y-1/2 short-wide:translate-x-0 short-wide:border-b-4 short-wide:border-l-4 short-wide:border-t-0"
      />
      <div
        aria-label="Conversation captions"
        className="relative z-10 h-full w-full overflow-y-auto overscroll-contain rounded-3xl border-4 border-white bg-white/95 px-4 py-3 text-center text-brand-ink shadow-control-surface short:rounded-2xl short:px-3 short:py-2 sm:px-5 sm:py-4"
        role="region"
        tabIndex={0}
      >
        <div
          aria-label={
            caption.liveTranscript ? "Live transcript" : "Peppa's message"
          }
          className={cx(
            "relative grid min-h-full items-center",
            showRepeat && "grid-cols-[minmax(0,1fr)_auto] gap-x-2",
          )}
          role={caption.liveTranscript ? undefined : "group"}
        >
          <div
            aria-label={
              caption.label === "Peppa" ? "Peppa's speech" : undefined
            }
            className="min-w-0"
            role={caption.label === "Peppa" ? "blockquote" : undefined}
          >
            <span className="text-xs font-black uppercase tracking-wide opacity-65 short:text-[0.65rem] sm:text-sm">
              {caption.label}
            </span>
            <p
              aria-live="polite"
              className="m-0 mt-1 text-base font-black leading-snug sm:text-xl"
              role={caption.role}
            >
              {caption.text}
            </p>
          </div>
          {showRepeat ? (
            <IconButton
              aria-label="Repeat Peppa's audio"
              className="sticky -bottom-2 col-start-2 row-start-1 size-10 translate-y-2 self-end shadow-none short:size-9"
              onClick={onRepeatAudio}
              type="button"
              variant="brand"
            >
              <Volume2 aria-hidden="true" className="size-5" />
            </IconButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WaitingTurnControl({ status }: { status: ConversationSurfaceStatus }) {
  return (
    <ActionButton
      aria-label="Waiting for Peppa"
      className="min-h-14 short:min-h-12 short:px-3"
      disabled
      size="large"
      type="button"
      variant="surface"
    >
      <LoaderCircle
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-none"
      />
      {status === "reconnecting"
        ? "Reconnecting"
        : status === "speaking"
          ? "Peppa is talking"
          : "Peppa is thinking"}
    </ActionButton>
  );
}

export function ConversationSurface({
  error,
  liveTranscript,
  microphoneEnabled,
  onBack,
  onFinish,
  onRepeatAudio,
  onStart,
  onToggleMicrophone,
  purpose,
  status,
  turnReady,
  turns,
}: ConversationSurfaceProps) {
  const turnInteractive =
    turnReady && (status === "listening" || status === "speaking");
  const assistantSpeech = latestAssistantSpeech(turns);
  const caption = selectCaption({
    assistantSpeech,
    error,
    liveTranscript,
    microphoneEnabled,
    purpose,
    status,
  });
  const showRepeat = Boolean(
    assistantSpeech &&
      status === "listening" &&
      turnReady &&
      !microphoneEnabled,
  );
  const expandLandscapeCaption = caption.text.length > 100;
  const { finishLabel, title } = PURPOSE_COPY[purpose];
  const showFinish =
    finishLabel &&
    !["ready", "connecting", "saving"].includes(status);

  useEffect(() => {
    if (!turnInteractive) return;

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
  }, [onToggleMicrophone, turnInteractive]);

  return (
    <ConversationScreen>
      <ConversationHeader onBack={onBack} />
      <section className="mx-auto grid h-full min-h-0 w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] justify-items-center gap-2 text-center short:gap-1.5 short-wide:max-w-5xl short-wide:grid-cols-[minmax(12rem,2fr)_minmax(20rem,3fr)] short-wide:grid-rows-[auto_auto_minmax(0,1fr)_auto] short-wide:gap-x-4 md:gap-3">
        <h1 className="m-0 text-lg font-black leading-tight text-brand-ink short:text-base short-wide:col-start-2 short-wide:row-start-1 short-wide:self-end sm:text-2xl">
          {title}
        </h1>

        <ConversationStatus
          className="short-wide:col-start-2 short-wide:row-start-2 short-wide:self-start"
          microphoneEnabled={microphoneEnabled}
          status={status}
        />

        <figure className="m-0 grid h-full min-h-0 w-full place-items-center short-wide:col-start-1 short-wide:row-span-4 short-wide:row-start-1">
          <img
            alt="Peppa"
            className="h-full min-h-0 w-full max-w-sm animate-float object-contain drop-shadow-lg motion-reduce:animate-none short:max-w-32 short-wide:max-w-56 sm:max-w-md"
            src={PEPPA_ASSETS[status]}
          />
        </figure>

        <ConversationCaptions
          caption={caption}
          className={cx(
            "short-wide:col-start-2 short-wide:row-start-3",
            expandLandscapeCaption
              ? "short-wide:h-full short-wide:self-stretch"
              : "short-wide:h-28 short-wide:self-end",
          )}
          onRepeatAudio={onRepeatAudio}
          showRepeat={showRepeat}
        />

        <div
          aria-label="Conversation controls"
          className={cx(
            "grid min-h-14 w-full max-w-xl items-center gap-2 short:min-h-12",
            showFinish && "grid-cols-[minmax(0,1fr)_auto]",
            "short-wide:col-start-2 short-wide:row-start-4",
          )}
          role="group"
        >
          {status === "error" ? (
            <ActionButton
              className="min-h-14 short:min-h-12 short:px-3"
              onClick={onStart}
              size="large"
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </ActionButton>
          ) : turnInteractive ? (
            <ActionButton
              aria-keyshortcuts="Space"
              aria-pressed={microphoneEnabled}
              className="min-h-14 short:min-h-12 short:px-3 short:text-sm"
              onClick={onToggleMicrophone}
              size="large"
              type="button"
              variant={microphoneEnabled ? "brand" : "success"}
            >
              {microphoneEnabled ? (
                <MicOff aria-hidden="true" />
              ) : (
                <Mic aria-hidden="true" />
              )}
              <span className="grid justify-items-start leading-tight">
                <strong>
                  {microphoneEnabled ? "End my turn" : "Start my turn"}
                </strong>
                <small className="mt-1 text-xs font-bold opacity-85 short:hidden">
                  Click or press Space
                </small>
              </span>
            </ActionButton>
          ) : ["thinking", "speaking", "reconnecting"].includes(status) ? (
            <WaitingTurnControl status={status} />
          ) : (
            <span aria-hidden="true" className="block h-14 short:h-12" />
          )}

          {showFinish ? (
            <TextButton
              className="whitespace-nowrap px-2 text-sm sm:px-3 sm:text-base"
              onClick={onFinish}
              type="button"
            >
              {finishLabel}
            </TextButton>
          ) : null}
        </div>
      </section>
    </ConversationScreen>
  );
}
