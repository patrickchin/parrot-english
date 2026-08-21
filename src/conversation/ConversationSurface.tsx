import {
  ArrowLeft,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ConversationPurpose } from "../../lib/conversation-purpose";
import {
  isTalkToPeppaPromptStyle,
  TALK_TO_PEPPA_PROMPT_STYLE_OPTIONS,
  talkToPeppaPromptStyleOption,
  type TalkToPeppaPromptStyle,
} from "../../lib/talk-to-peppa-prompt-style";
import { HeaderButton, RouteHeader } from "../app/AppHeader";
import {
  ActionButton,
  cx,
  fieldClassName,
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

export type ConversationSurfaceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ConversationSurfaceProps = {
  canFinish: boolean;
  error: string;
  liveTranscript: string;
  microphoneBusy: boolean;
  microphoneEnabled: boolean;
  onBack: () => void;
  onFinish: () => void;
  onPromptStyleChange: (style: TalkToPeppaPromptStyle) => void;
  onRepeatAudio: () => void;
  onStart: () => void;
  onToggleMicrophone: () => void;
  purpose: ConversationPurpose;
  promptStyle: TalkToPeppaPromptStyle;
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
  "profile-edit": {
    finishLabel: "Save changes",
    title: "Update my profile",
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
) {
  const [clock, setClock] = useState({ elapsedMs: 0, status });
  const elapsedMs = clock.status === status ? clock.elapsedMs : 0;

  useEffect(() => {
    if (!isTimedStatus(status)) return;
    const timers = conversationFeedbackMilestones(
      status,
      responseLatencyMs,
    ).map((milestone) =>
      window.setTimeout(
        () => setClock({ elapsedMs: milestone, status }),
        milestone,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [responseLatencyMs, status]);

  return isTimedStatus(status)
    ? selectConversationWaitFeedback({
        elapsedMs,
        purpose,
        responseLatencyMs,
        status,
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
  status: ConversationSurfaceStatus,
  microphoneBusy: boolean,
  microphoneEnabled: boolean,
  purpose: ConversationPurpose,
  waitFeedback: ConversationWaitFeedback | null,
) {
  if (status === "ready" && purpose === "small-chat") {
    return "Ready to talk";
  }
  if (status === "ready") return "Getting ready";
  if (status === "connecting" || status === "thinking") {
    return waitFeedback?.label ?? "Please wait";
  }
  if (status === "listening") {
    if (microphoneBusy) return "Opening microphone";
    return microphoneEnabled ? "Listening" : "Your turn";
  }
  if (status === "speaking") return "Peppa’s turn";
  if (status === "reconnecting" || status === "saving") {
    return waitFeedback?.label ?? "Please wait";
  }
  if (status === "error") return "Chat paused";
  return "Finishing chat";
}

function ConversationStatus({
  className,
  microphoneBusy,
  microphoneEnabled,
  purpose,
  status,
  waitFeedback,
}: {
  className?: string;
  microphoneBusy: boolean;
  microphoneEnabled: boolean;
  purpose: ConversationPurpose;
  status: ConversationSurfaceStatus;
  waitFeedback: ConversationWaitFeedback | null;
}) {
  const busy =
    !(status === "ready" && purpose === "small-chat") &&
    (microphoneBusy ||
      ["ready", "connecting", "thinking", "reconnecting", "saving"].includes(
        status,
      ));
  const learnerTurn = status === "listening";

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
      {statusLabel(
        status,
        microphoneBusy,
        microphoneEnabled,
        purpose,
        waitFeedback,
      )}
    </p>
  );
}

type Caption = {
  label: string;
  role: "alert" | undefined;
  text: string;
  transcript: "final" | "live" | null;
};

function selectCaption({
  error,
  latestTurn,
  liveTranscript,
  microphoneEnabled,
  purpose,
  status,
  waitFeedback,
}: {
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
      label: status === "error" ? "Chat paused" : "Please try again",
      role: "alert",
      text: error || "The voice room took a break. Try again.",
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
      label: "Getting ready",
      role: undefined,
      text: waitFeedback?.text ?? "Starting the voice chat.",
      transcript: null,
    };
  }
  if (status === "reconnecting") {
    return {
      label: "Trying again",
      role: undefined,
      text: waitFeedback?.text ?? "The connection stopped. Trying again.",
      transcript: null,
    };
  }
  if (status === "saving") {
    return {
      label: waitFeedback?.label ?? "Finishing",
      role: undefined,
      text: waitFeedback?.text ?? "Finishing up…",
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
    return {
      label: liveTranscript ? "You said" : "Please wait",
      role: undefined,
      text: liveTranscript || waitFeedback?.text || "Wait for Peppa.",
      transcript: liveTranscript ? "final" : null,
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
        "relative h-28 w-full max-w-xl short:h-24",
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
            caption.transcript === "live"
              ? "Live transcript"
              : caption.transcript === "final"
                ? "Your answer"
                : "Peppa's message"
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
            <span className="text-xs font-black uppercase tracking-wide opacity-65 short:text-[0.65rem] sm:text-sm">
              {caption.label}
            </span>
            <p
              className="m-0 mt-1 text-base font-black leading-snug sm:text-xl"
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
                variant="brand"
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

function WaitingTurnControl({ status }: { status: ConversationSurfaceStatus }) {
  const speaking = status === "speaking";
  return (
    <ActionButton
      aria-label={speaking ? "Listen to Peppa" : "Waiting for Peppa"}
      className="whitespace-nowrap short:gap-2 short:px-2 short:text-sm"
      disabled
      fullWidth
      size="large"
      type="button"
      variant="surface"
    >
      {speaking ? (
        <Volume2 aria-hidden="true" />
      ) : (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      )}
      {status === "reconnecting"
        ? "Trying again"
        : speaking
          ? "Listen to Peppa"
          : "Wait for Peppa"}
    </ActionButton>
  );
}

export function ConversationSurface({
  canFinish,
  error,
  liveTranscript,
  microphoneBusy,
  microphoneEnabled,
  onBack,
  onFinish,
  onPromptStyleChange,
  onRepeatAudio,
  onStart,
  onToggleMicrophone,
  purpose,
  promptStyle,
  responseLatencyMs,
  status,
  turnReady,
  turns,
}: ConversationSurfaceProps) {
  const showTurnControl = turnReady && status === "listening";
  const turnInteractive = showTurnControl && !microphoneBusy;
  const latestTurn = latestConversationTurn(turns);
  const waitFeedback = useConversationWaitFeedback(
    purpose,
    responseLatencyMs,
    status,
  );
  const caption = selectCaption({
    error,
    latestTurn,
    liveTranscript,
    microphoneEnabled,
    purpose,
    status,
    waitFeedback,
  });
  const showRepeat = Boolean(
    latestTurn?.role === "assistant" &&
      status === "listening" &&
      turnReady &&
      !microphoneBusy &&
      !microphoneEnabled,
  );
  const expandLandscapeCaption = caption.text.length > 100;
  const { finishLabel, title } = PURPOSE_COPY[purpose];
  const showPromptStyleSetup = purpose === "small-chat" && status === "ready";
  const promptStyleOption = talkToPeppaPromptStyleOption(promptStyle);
  const recoveryAction = waitFeedback?.action;
  const showFinish =
    canFinish &&
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
          microphoneBusy={microphoneBusy}
          microphoneEnabled={microphoneEnabled}
          purpose={purpose}
          status={status}
          waitFeedback={waitFeedback}
        />

        <figure className="m-0 grid h-full min-h-0 w-full place-items-center short-wide:col-start-1 short-wide:row-span-4 short-wide:row-start-1">
          <img
            alt="Peppa"
            className="h-full min-h-0 w-full max-w-sm animate-float object-contain drop-shadow-lg motion-reduce:animate-none short:max-w-32 short-wide:max-w-56 sm:max-w-md"
            decoding="async"
            height={1024}
            sizes="(max-height: 420px) 14rem, (max-width: 639px) min(24rem, calc(100vw - 1.5rem)), 28rem"
            src={responsivePeppaAsset(PEPPA_ASSETS[status], 768)}
            srcSet={responsivePeppaSrcSet(PEPPA_ASSETS[status])}
            width={1024}
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
            showFinish &&
              "grid-cols-[minmax(0,1fr)_auto]",
            "short-wide:col-start-2 short-wide:row-start-4",
          )}
          role="group"
        >
          {showPromptStyleSetup ? (
            <div className="grid w-full gap-1.5">
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
              <details className="group relative">
                <summary
                  aria-label={`Grown-up chat style: ${promptStyleOption.label}`}
                  className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-white/70 px-3 text-xs font-black text-brand-blue shadow-control-surface [&::-webkit-details-marker]:hidden"
                >
                  Grown-up: {promptStyleOption.label}
                  <span aria-hidden="true" className="group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div
                  className="absolute bottom-full left-0 z-50 mb-2 grid w-full min-w-0 gap-1 rounded-2xl border-3 border-white bg-white/95 p-2 text-left shadow-card"
                >
                  <label
                    className="text-xs font-black text-brand-blue"
                    htmlFor="peppa-prompt-style"
                  >
                    Chat style
                  </label>
                  <select
                    aria-describedby="peppa-prompt-style-description"
                    className={fieldClassName({
                      className:
                        "min-h-12 truncate rounded-xl px-3 py-1 text-sm",
                    })}
                    id="peppa-prompt-style"
                    onChange={(event) => {
                      if (isTalkToPeppaPromptStyle(event.target.value)) {
                        onPromptStyleChange(event.target.value);
                        const details = event.currentTarget.closest("details");
                        details?.removeAttribute("open");
                        details?.querySelector("summary")?.focus();
                      }
                    }}
                    value={promptStyle}
                  >
                    {TALK_TO_PEPPA_PROMPT_STYLE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="text-xs font-bold leading-snug text-brand-blue"
                    id="peppa-prompt-style-description"
                  >
                    {promptStyleOption.description}
                  </span>
                </div>
              </details>
            </div>
          ) : recoveryAction === "retry" ? (
            <ActionButton fullWidth onClick={onStart} size="large" type="button">
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
          ) : status === "error" ? (
            <ActionButton
              fullWidth
              onClick={onStart}
              size="large"
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </ActionButton>
          ) : showTurnControl ? (
            <ActionButton
              aria-keyshortcuts="Space"
              aria-label={
                microphoneBusy
                  ? "Opening microphone"
                  : microphoneEnabled
                    ? "I’m done"
                    : "Tap, then talk"
              }
              aria-pressed={microphoneEnabled}
              className="whitespace-nowrap short:gap-2 short:px-2 short:text-sm"
              disabled={microphoneBusy}
              fullWidth
              onClick={onToggleMicrophone}
              size="large"
              type="button"
              variant={microphoneEnabled ? "brand" : "success"}
            >
              {microphoneBusy ? (
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
                <strong>
                  {microphoneBusy
                    ? "Opening microphone"
                    : microphoneEnabled
                      ? "I’m done"
                      : "Tap, then talk"}
                </strong>
                <small className="hidden text-xs font-bold leading-none opacity-85 md:mt-0.5 md:block">
                  Tap or press Space
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
