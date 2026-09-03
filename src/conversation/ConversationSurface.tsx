import {
  ArrowLeft,
  LoaderCircle,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import type { ConversationPurpose } from "../../lib/conversation-purpose";
import { HeaderButton, RouteHeader } from "../app/AppHeader";
import { LESSON_LEARNING_PATH } from "../app/learning-paths";
import {
  ActionButton,
  cx,
  IconButton,
  TextButton,
} from "../shared/ui";
import {
  conversationFeedbackMilestones,
  selectConversationWaitFeedback,
  type ConversationWaitFeedback,
  type TimedConversationStatus,
} from "./conversation-feedback";

export type ConversationSurfaceStatus =
  | "ready"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "error"
  | "saving";

export type ConversationRecoveryPhase = "finish" | "restart" | null;

export type ConversationSurfaceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ConversationSurfaceProps = {
  audioPlaybackBlocked: boolean;
  audioPlaybackBusy: boolean;
  audioPlaybackError: string;
  canFinish: boolean;
  error: string;
  liveTranscript: string;
  microphoneBusy: boolean;
  microphoneEnabled: boolean;
  onBack: () => void;
  onChooseLesson: () => void;
  onFinish: () => void;
  onRepeatAudio: () => void;
  onRetryVoice: () => void;
  onStart: () => void;
  onStartAudio: () => void;
  onToggleMicrophone: () => void;
  purpose: ConversationPurpose;
  recoveryPhase: ConversationRecoveryPhase;
  responseLatencyMs: number | null;
  status: ConversationSurfaceStatus;
  turnReady: boolean;
  turns: ConversationSurfaceTurn[];
  voiceRetryUsed: boolean;
  waitCycle: number;
};

const PEPPA_ASSETS: Record<ConversationSurfaceStatus, string> = {
  ready: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-happy.webp",
  connecting: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-happy.webp",
  listening: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-listening.webp",
  thinking: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-listening.webp",
  speaking: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-talking.webp",
  reconnecting: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-surprised.webp",
  error: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-sad.webp",
  saving: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-happy.webp",
};

function responsivePeppaAsset(src: string, width: 384 | 768 | 1024) {
  return src.replace(/\.webp$/, `-${width}.webp`);
}

function responsivePeppaSrcSet(src: string) {
  return ([384, 768, 1024] as const)
    .map((width) => `${responsivePeppaAsset(src, width)} ${width}w`)
    .join(", ");
}

const PURPOSE_COPY: Record<
  ConversationPurpose,
  { finishLabel: string | null; title: string }
> = {
  "small-chat": {
    finishLabel: "Finish chat",
    title: "Chat with Peppa",
  },
  onboarding: {
    finishLabel: "Save and finish",
    title: "Help Peppa know you",
  },
};

function latestConversationTurn(turns: ConversationSurfaceTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].text.trim()) return turns[index];
  }
  return null;
}

function isTimedStatus(
  status: ConversationSurfaceStatus,
): status is TimedConversationStatus {
  return ["connecting", "thinking", "reconnecting", "saving"].includes(
    status,
  );
}

function useConversationWaitFeedback(
  purpose: ConversationPurpose,
  responseLatencyMs: number | null,
  status: ConversationSurfaceStatus,
  voiceRetryUsed: boolean,
  waitCycle: number,
) {
  const [clock, setClock] = useState({ elapsedMs: 0, status, waitCycle });
  const elapsedMs =
    clock.status === status && clock.waitCycle === waitCycle
      ? clock.elapsedMs
      : 0;

  useEffect(() => {
    if (!isTimedStatus(status)) return;
    const timers = conversationFeedbackMilestones(
      status,
      responseLatencyMs,
    ).map((milestone) =>
      window.setTimeout(
        () => setClock({ elapsedMs: milestone, status, waitCycle }),
        milestone,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [responseLatencyMs, status, waitCycle]);

  return isTimedStatus(status)
    ? selectConversationWaitFeedback({
        elapsedMs,
        purpose,
        responseLatencyMs,
        status,
        voiceRetryUsed,
      })
    : null;
}

function isInteractiveSpaceTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest(
      "a[href], area[href], button, input, textarea, select, summary, audio[controls], video[controls], [contenteditable]:not([contenteditable='false']), [tabindex]:not([tabindex='-1']), [role='button'], [role='link']",
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
  audioPlaybackBlocked: boolean,
  status: ConversationSurfaceStatus,
  microphoneEnabled: boolean,
  purpose: ConversationPurpose,
  waitFeedback: ConversationWaitFeedback | null,
) {
  if (audioPlaybackBlocked) return "Sound is off";
  if (status === "ready" && purpose === "small-chat") {
    return "Ready to talk";
  }
  if (status === "ready") return "Getting ready";
  if (status === "connecting" || status === "thinking") {
    return waitFeedback?.label ?? "Please wait";
  }
  if (status === "listening") {
    return microphoneEnabled ? "Listening" : "Your turn";
  }
  if (status === "speaking") return "Peppa’s turn";
  if (status === "reconnecting" || status === "saving") {
    return waitFeedback?.label ?? "Please wait";
  }
  if (status === "error") return waitFeedback?.label ?? "Chat paused";
  return "Finishing chat";
}

function ConversationStatus({
  audioPlaybackBlocked,
  audioPlaybackError,
  className,
  directActionAnnouncement,
  microphoneEnabled,
  purpose,
  status,
  waitFeedback,
  waitDetailIsVisibleTranscript,
}: {
  audioPlaybackBlocked: boolean;
  audioPlaybackError: string;
  className?: string;
  directActionAnnouncement: string | null;
  microphoneEnabled: boolean;
  purpose: ConversationPurpose;
  status: ConversationSurfaceStatus;
  waitFeedback: ConversationWaitFeedback | null;
  waitDetailIsVisibleTranscript: boolean;
}) {
  const waitComplete = Boolean(waitFeedback?.action);
  const announceWaitDetail = Boolean(
    waitFeedback &&
      !waitDetailIsVisibleTranscript &&
      !audioPlaybackBlocked &&
      !directActionAnnouncement,
  );
  const busy =
    !audioPlaybackBlocked &&
    !waitComplete &&
    !(status === "ready" && purpose === "small-chat") &&
    ["ready", "connecting", "thinking", "reconnecting", "saving"].includes(
      status,
    );
  const learnerTurn =
    status === "listening" && !audioPlaybackBlocked;
  const visibleLabel = statusLabel(
    audioPlaybackBlocked,
    status,
    microphoneEnabled,
    purpose,
    waitFeedback,
  );

  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      className={cx(
        "m-0 inline-flex min-h-8 min-w-40 max-w-full items-center justify-center gap-2 rounded-full px-3 py-1 text-center text-sm font-black leading-tight text-white shadow-sm short:min-h-7 short:text-xs sm:text-base",
        learnerTurn ? "bg-brand-green" : "bg-brand-ink/90",
        className,
      )}
      role="status"
    >
      {busy ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : audioPlaybackBlocked ? (
        <VolumeX aria-hidden="true" className="size-4 shrink-0" />
      ) : waitFeedback?.action === "retry" ? (
        <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
      ) : waitFeedback?.action === "lesson" ? (
        <Play aria-hidden="true" className="size-4 shrink-0 fill-current" />
      ) : waitFeedback?.action === "leave" ? (
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      ) : status === "listening" ? (
        <Mic aria-hidden="true" className="size-4 shrink-0" />
      ) : status === "speaking" ? (
        <Volume2 aria-hidden="true" className="size-4 shrink-0" />
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
      <span aria-hidden={directActionAnnouncement ? true : undefined}>
        {visibleLabel}
      </span>
      {directActionAnnouncement ? (
        <span className="sr-only">{directActionAnnouncement}.</span>
      ) : null}
      {!directActionAnnouncement && audioPlaybackError ? (
        <span className="sr-only">. {audioPlaybackError}</span>
      ) : null}
      {announceWaitDetail ? (
        <span className="sr-only">
          . {waitFeedback?.text}{" "}
          {waitFeedback?.action === "retry"
            ? "Try chat again."
            : waitFeedback?.action === "lesson"
              ? "Play a lesson."
              : waitComplete
                ? "Back."
                : null}
        </span>
      ) : null}
    </p>
  );
}

type Caption = {
  label: string | null;
  role: "alert" | undefined;
  text: string;
  transcript: "final" | "live" | null;
};

function selectCaption({
  audioPlaybackBlocked,
  audioPlaybackBusy,
  audioPlaybackError,
  error,
  latestTurn,
  liveTranscript,
  microphoneEnabled,
  purpose,
  status,
  waitFeedback,
}: {
  audioPlaybackBlocked: boolean;
  audioPlaybackBusy: boolean;
  audioPlaybackError: string;
  error: string;
  latestTurn: ConversationSurfaceTurn | null;
  liveTranscript: string;
  microphoneEnabled: boolean;
  purpose: ConversationPurpose;
  status: ConversationSurfaceStatus;
  waitFeedback: ConversationWaitFeedback | null;
}): Caption {
  if (status === "error" || error) {
    return {
      label:
        status === "error"
          ? waitFeedback?.label ?? "Chat paused"
          : "Please try again",
      role: waitFeedback?.action ? undefined : "alert",
      text:
        waitFeedback?.text ||
        error ||
        "The voice room took a break. Try again.",
      transcript: null,
    };
  }
  if (audioPlaybackBlocked || audioPlaybackBusy) {
    if (audioPlaybackError) {
      return {
        label: "Please try again",
        role: undefined,
        text: audioPlaybackError,
        transcript: null,
      };
    }
    const peppaTurn =
      latestTurn?.role === "assistant" ? latestTurn : null;
    return {
      label: peppaTurn ? "Peppa" : null,
      role: undefined,
      text: peppaTurn?.text ?? "Peppa is here.",
      transcript: null,
    };
  }
  if (status === "ready") {
    return {
      label: "Peppa",
      role: undefined,
      text:
        purpose === "small-chat"
          ? "Tap Talk to Peppa."
          : "Wait here. The voice chat is getting ready…",
      transcript: null,
    };
  }
  if (status === "connecting") {
    return {
      label: null,
      role: undefined,
      text: waitFeedback?.text ?? "Starting the voice chat.",
      transcript: null,
    };
  }
  if (status === "reconnecting") {
    return {
      label: null,
      role: undefined,
      text: waitFeedback?.text ?? "The connection stopped.",
      transcript: null,
    };
  }
  if (status === "saving") {
    return {
      label: null,
      role: undefined,
      text: waitFeedback?.text ?? "That was fun!",
      transcript: null,
    };
  }
  if (status === "listening" && microphoneEnabled) {
    return {
      label: "Your words",
      role: undefined,
      text: liveTranscript || "Say your answer.",
      transcript: "live",
    };
  }
  if (status === "thinking") {
    const showLearnerAnswer = Boolean(
      liveTranscript && waitFeedback?.showLearnerAnswer,
    );
    return {
      label: showLearnerAnswer ? "You said" : null,
      role: undefined,
      text: showLearnerAnswer
        ? liveTranscript
        : waitFeedback?.text || "Wait for Peppa.",
      transcript: showLearnerAnswer ? "final" : null,
    };
  }
  if (status === "speaking") {
    return {
      label: "Peppa",
      role: undefined,
      text:
        latestTurn?.role === "assistant"
          ? latestTurn.text
          : "Listen to Peppa.",
      transcript: null,
    };
  }
  if (latestTurn?.role === "assistant") {
    return {
      label: "Peppa",
      role: undefined,
      text: latestTurn.text,
      transcript: null,
    };
  }
  return {
    label: "Peppa",
    role: undefined,
    text: "Tap the green button. Then talk.",
    transcript: null,
  };
}

function ConversationCaptions({
  caption,
  className,
  onRepeatAudio,
  regionRef,
  showRepeat,
}: {
  caption: Caption;
  className?: string;
  onRepeatAudio: () => void;
  regionRef?: Ref<HTMLDivElement>;
  showRepeat: boolean;
}) {
  return (
    <div
      className={cx(
        "relative h-28 w-full max-w-xl short:h-24",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2.5 left-1/2 z-0 size-6 -translate-x-1/2 rotate-45 border-l-4 border-t-4 border-white bg-white min-[560px]:landscape:-left-2.5 min-[560px]:landscape:top-1/2 min-[560px]:landscape:-translate-y-1/2 min-[560px]:landscape:translate-x-0 min-[560px]:landscape:border-b-4 min-[560px]:landscape:border-l-4 min-[560px]:landscape:border-t-0"
      />
      <div
        aria-label="Conversation captions"
        className="relative z-10 h-full w-full overflow-y-auto overscroll-contain rounded-3xl border-4 border-white bg-white/95 px-4 py-3 text-center text-brand-ink shadow-control-surface short:rounded-2xl short:px-3 short:py-2 sm:px-5 sm:py-4"
        role="region"
        ref={regionRef}
        tabIndex={0}
      >
        <div
          aria-label={
            caption.transcript === "live"
              ? "Live transcript"
              : caption.transcript === "final"
                ? "Your answer"
                : caption.label === "Peppa"
                  ? "Peppa's message"
                  : "Conversation message"
          }
          className={cx(
            "relative grid min-h-full items-center",
            showRepeat && "grid-cols-[minmax(0,1fr)_auto] gap-x-2",
          )}
          role={caption.transcript ? undefined : "group"}
        >
          <div
            aria-label={
              caption.label === "Peppa" ? "Peppa's speech" : undefined
            }
            className="min-w-0"
            role={caption.label === "Peppa" ? "blockquote" : undefined}
          >
            {caption.label ? (
              <span className="text-xs font-black uppercase tracking-wide opacity-70 short:text-[0.65rem] sm:text-sm">
                {caption.label}
              </span>
            ) : null}
            <p
              className={cx(
                "m-0 text-base font-black leading-snug sm:text-xl",
                caption.label && "mt-1",
              )}
              role={caption.role}
            >
              {caption.text}
            </p>
          </div>
          {showRepeat ? (
            <span className="sticky -bottom-2 col-start-2 row-start-1 block translate-y-2 self-end">
              <IconButton
                aria-label="Repeat Peppa's audio"
                elevation="flat"
                frame="white"
                onClick={onRepeatAudio}
                size="compact"
                type="button"
                variant="rose"
              >
                <Volume2 aria-hidden="true" className="size-5" />
              </IconButton>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ConversationSurface({
  audioPlaybackBlocked,
  audioPlaybackBusy,
  audioPlaybackError,
  canFinish,
  error,
  liveTranscript,
  microphoneBusy,
  microphoneEnabled,
  onBack,
  onChooseLesson,
  onFinish,
  onRepeatAudio,
  onRetryVoice,
  onStart,
  onStartAudio,
  onToggleMicrophone,
  purpose,
  recoveryPhase,
  responseLatencyMs,
  status,
  turnReady,
  turns,
  voiceRetryUsed,
  waitCycle,
}: ConversationSurfaceProps) {
  const captionRegionRef = useRef<HTMLDivElement>(null);
  const soundActionRef = useRef<HTMLButtonElement>(null);
  const soundFocusHandoffRef = useRef(false);
  const turnActionRef = useRef<HTMLButtonElement>(null);
  const showAudioRecovery =
    (audioPlaybackBlocked || audioPlaybackBusy) &&
    !microphoneEnabled &&
    !["error", "reconnecting", "saving"].includes(status);
  const showTurnControl =
    (turnReady || microphoneEnabled) && status === "listening";
  const openingMicrophone =
    showTurnControl && microphoneBusy && !microphoneEnabled;
  const directActionAnnouncement =
    showAudioRecovery && audioPlaybackBusy
      ? "Starting sound"
      : openingMicrophone
        ? "Opening microphone"
        : null;
  const turnControlLabel = openingMicrophone
    ? "Opening microphone"
    : microphoneEnabled
      ? "I’m done"
      : "Tap, then talk";
  const turnInteractive =
    showTurnControl && !microphoneBusy && !showAudioRecovery;
  const latestTurn = latestConversationTurn(turns);
  const waitFeedback = useConversationWaitFeedback(
    purpose,
    responseLatencyMs,
    status,
    voiceRetryUsed,
    waitCycle,
  );
  const repeatedErrorFeedback: ConversationWaitFeedback | null =
    purpose === "small-chat" &&
    status === "error" &&
    recoveryPhase === "restart" &&
    voiceRetryUsed
      ? {
          action: "lesson",
          label: "Chat paused",
          text: "Peppa cannot talk now.",
        }
      : null;
  const recoveryFeedback = repeatedErrorFeedback ?? waitFeedback;
  const caption = selectCaption({
    audioPlaybackBlocked: showAudioRecovery && audioPlaybackBlocked,
    audioPlaybackBusy: showAudioRecovery && audioPlaybackBusy,
    audioPlaybackError: showAudioRecovery ? audioPlaybackError : "",
    error,
    latestTurn,
    liveTranscript,
    microphoneEnabled,
    purpose,
    status,
    waitFeedback: recoveryFeedback,
  });
  const showRepeat = Boolean(
    latestTurn?.role === "assistant" &&
      status === "listening" &&
      turnReady &&
      !showAudioRecovery &&
      !microphoneBusy &&
      !microphoneEnabled,
  );
  const expandLandscapeCaption = caption.text.length > 100;
  const { finishLabel, title } = PURPOSE_COPY[purpose];
  const finishRetryLabel = finishLabel ? `${finishLabel} again` : "Finish again";
  const showStartAction = purpose === "small-chat" && status === "ready";
  const recoveryAction = recoveryFeedback?.action;
  const peppaStatus = recoveryAction ? "error" : status;
  const peppaIsStatic =
    isTimedStatus(status) || showAudioRecovery || openingMicrophone;
  const showFinish =
    canFinish &&
    finishLabel &&
    !recoveryAction &&
    !["ready", "connecting", "error", "saving"].includes(status);
  const hasConversationControls = Boolean(
    showStartAction ||
      recoveryAction ||
      status === "error" ||
      showAudioRecovery ||
      showTurnControl ||
      showFinish,
  );

  useEffect(() => {
    if (!turnInteractive) return;

    function toggleTurnWithSpace(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.isComposing ||
        event.metaKey ||
        event.repeat ||
        event.shiftKey ||
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

  useEffect(() => {
    if (showAudioRecovery || !soundFocusHandoffRef.current) return;
    soundFocusHandoffRef.current = false;
    if (document.hasFocus() && document.activeElement === document.body) {
      (turnActionRef.current ?? captionRegionRef.current)?.focus({
        preventScroll: true,
      });
    }
  }, [showAudioRecovery]);

  return (
    <ConversationScreen>
      <ConversationHeader onBack={onBack} />
      <section className="mx-auto grid h-full min-h-0 w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] justify-items-center gap-2 text-center short:gap-1.5 min-[560px]:landscape:max-w-7xl min-[560px]:landscape:grid-cols-[minmax(12rem,2fr)_minmax(20rem,3fr)] min-[560px]:landscape:grid-rows-[auto_auto_minmax(0,1fr)_auto] min-[560px]:landscape:gap-x-4 min-[900px]:landscape:grid-cols-[minmax(20rem,1.15fr)_minmax(28rem,0.85fr)] min-[900px]:landscape:gap-x-6 md:gap-3">
        <h1 className="m-0 text-lg font-black leading-tight text-brand-ink short:text-base min-[560px]:landscape:col-start-2 min-[560px]:landscape:row-start-1 min-[560px]:landscape:self-end sm:text-2xl">
          {title}
        </h1>

        <ConversationStatus
          audioPlaybackBlocked={showAudioRecovery && audioPlaybackBlocked}
          audioPlaybackError={showAudioRecovery ? audioPlaybackError : ""}
          className="min-[560px]:landscape:col-start-2 min-[560px]:landscape:row-start-2 min-[560px]:landscape:self-start"
          directActionAnnouncement={directActionAnnouncement}
          microphoneEnabled={microphoneEnabled}
          purpose={purpose}
          status={status}
          waitFeedback={recoveryFeedback}
          waitDetailIsVisibleTranscript={caption.transcript === "final"}
        />

        <figure className="m-0 grid h-full min-h-0 w-full place-items-center min-[560px]:landscape:col-start-1 min-[560px]:landscape:row-span-4 min-[560px]:landscape:row-start-1">
          {recoveryAction === "lesson" ? (
            <div className="relative aspect-[4/3] max-h-full w-full max-w-sm overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short:max-w-56 short:rounded-2xl short-wide:max-w-sm sm:max-w-md min-[900px]:landscape:!max-w-2xl">
              <img
                alt={LESSON_LEARNING_PATH.imageAlt}
                className="size-full object-cover"
                decoding="async"
                height={LESSON_LEARNING_PATH.imageHeight}
                sizes="(max-height: 420px) 24rem, (max-width: 639px) min(24rem, calc(100vw - 1.5rem)), 28rem"
                src={LESSON_LEARNING_PATH.imageSrc}
                srcSet={LESSON_LEARNING_PATH.imageSrcSet}
                width={LESSON_LEARNING_PATH.imageWidth}
              />
            </div>
          ) : (
            <img
              alt="Peppa"
              className={cx(
                "h-full min-h-0 w-full max-w-sm object-contain drop-shadow-lg short:max-w-32 short-wide:max-w-56 sm:max-w-md min-[900px]:landscape:!max-w-2xl",
                !peppaIsStatic &&
                  "animate-float motion-reduce:animate-none",
              )}
              decoding="async"
              height={1024}
              sizes="(max-height: 420px) 14rem, (max-width: 639px) min(24rem, calc(100vw - 1.5rem)), 28rem"
              src={responsivePeppaAsset(PEPPA_ASSETS[peppaStatus], 768)}
              srcSet={responsivePeppaSrcSet(PEPPA_ASSETS[peppaStatus])}
              width={1024}
            />
          )}
        </figure>

        {!showStartAction ? (
          <ConversationCaptions
            caption={caption}
            className={cx(
              "min-[560px]:landscape:col-start-2 min-[560px]:landscape:row-start-3",
              expandLandscapeCaption
                ? "min-[560px]:landscape:!h-full min-[560px]:landscape:self-stretch min-[900px]:landscape:max-h-72 min-[900px]:landscape:self-end"
                : "min-[560px]:landscape:!h-28 min-[560px]:landscape:self-end",
            )}
            onRepeatAudio={onRepeatAudio}
            regionRef={captionRegionRef}
            showRepeat={showRepeat}
          />
        ) : null}

        <div
          aria-label={
            hasConversationControls ? "Conversation controls" : undefined
          }
          className={cx(
            "grid min-h-14 w-full max-w-xl items-center gap-2 short:min-h-12 md:min-h-16",
            showFinish &&
              "grid-cols-[minmax(0,1fr)_auto]",
            "min-[560px]:landscape:col-start-2 min-[560px]:landscape:row-start-4",
          )}
          role={hasConversationControls ? "group" : undefined}
        >
          {showStartAction ? (
            <ActionButton
              aria-label="Start chat"
              className="min-h-14 short:min-h-12 short:rounded-xl"
              fullWidth
              onClick={onStart}
              size="large"
              type="button"
            >
              Talk to Peppa
            </ActionButton>
          ) : recoveryAction === "lesson" ? (
            <ActionButton
              fullWidth
              onClick={onChooseLesson}
              size="large"
              type="button"
              variant="rose"
            >
              <Play aria-hidden="true" className="fill-current" />
              {LESSON_LEARNING_PATH.label}
            </ActionButton>
          ) : status === "error" && recoveryPhase === "finish" ? (
            <ActionButton
              fullWidth
              onClick={onFinish}
              size="large"
              type="button"
            >
              {finishRetryLabel}
            </ActionButton>
          ) : status === "error" ? (
            <ActionButton
              fullWidth
              onClick={onRetryVoice}
              size="large"
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </ActionButton>
          ) : showAudioRecovery ? (
            <ActionButton
              aria-disabled={audioPlaybackBusy ? true : undefined}
              fullWidth
              onBlur={(event) => {
                if (event.relatedTarget instanceof Element) {
                  soundFocusHandoffRef.current = false;
                }
              }}
              onClick={
                audioPlaybackBusy
                  ? undefined
                  : () => {
                      soundFocusHandoffRef.current =
                        document.activeElement === soundActionRef.current;
                      onStartAudio();
                    }
              }
              ref={soundActionRef}
              size="large"
              type="button"
            >
              {audioPlaybackBusy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
              {audioPlaybackBusy ? "Starting sound" : "Tap for sound"}
            </ActionButton>
          ) : recoveryAction === "retry" ? (
            <ActionButton
              fullWidth
              onClick={onRetryVoice}
              size="large"
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Try chat again
            </ActionButton>
          ) : recoveryAction === "leave" ? (
            <ActionButton
              fullWidth
              onClick={onBack}
              size="large"
              type="button"
              variant="navy"
            >
              Back
            </ActionButton>
          ) : showTurnControl ? (
            <ActionButton
              aria-disabled={microphoneBusy ? true : undefined}
              aria-keyshortcuts={microphoneBusy ? undefined : "Space"}
              aria-label={turnControlLabel}
              className="whitespace-nowrap short:gap-2 short:px-2 short:text-sm"
              fullWidth
              onClick={microphoneBusy ? undefined : onToggleMicrophone}
              ref={turnActionRef}
              size="large"
              type="button"
              variant={microphoneEnabled ? "brand" : "success"}
            >
              {openingMicrophone ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : microphoneEnabled ? (
                <MicOff aria-hidden="true" />
              ) : (
                <Mic aria-hidden="true" />
              )}
              <span className="grid justify-items-start leading-tight">
                <strong>{turnControlLabel}</strong>
              </span>
            </ActionButton>
          ) : (
            <span
              aria-hidden="true"
              className="block h-14 short:h-12 md:h-16"
            />
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
