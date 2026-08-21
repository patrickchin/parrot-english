import type { ConversationPurpose } from "../../lib/conversation-purpose";

export type TimedConversationStatus =
  | "connecting"
  | "thinking"
  | "reconnecting"
  | "saving";

export type ConversationWaitFeedback = {
  action?: "leave" | "retry";
  label: string;
  text: string;
};

function boundedUsualReplyMs(responseLatencyMs: number | null) {
  if (responseLatencyMs === null) return 7_000;
  return Math.min(15_000, Math.max(7_000, Math.round(responseLatencyMs * 1.5)));
}

export function conversationFeedbackMilestones(
  status: TimedConversationStatus,
  responseLatencyMs: number | null = null,
) {
  if (status === "connecting") return [4_000, 12_000] as const;
  if (status === "thinking") {
    const usualReplyMs = boundedUsualReplyMs(responseLatencyMs);
    return [
      1_800,
      usualReplyMs,
      Math.min(23_000, usualReplyMs + 8_000),
    ] as const;
  }
  if (status === "reconnecting") return [8_000, 18_000] as const;
  return [8_000, 18_000] as const;
}

export function selectConversationWaitFeedback({
  elapsedMs,
  purpose,
  responseLatencyMs = null,
  status,
}: {
  elapsedMs: number;
  purpose: ConversationPurpose;
  responseLatencyMs?: number | null;
  status: TimedConversationStatus;
}): ConversationWaitFeedback {
  const stage = conversationFeedbackMilestones(
    status,
    responseLatencyMs,
  ).filter((milestone) => elapsedMs >= milestone).length;

  if (status === "connecting") {
    if (stage === 0) {
      return {
        label: "Waking up Peppa",
        text: "Peppa is waking up. Stay here.",
      };
    }
    if (stage === 1) {
      return {
        label: "Almost ready",
        text: "Peppa is getting her voice ready.",
      };
    }
    return {
      action: "retry",
      label: "Taking too long",
      text: "Let’s try again.",
    };
  }

  if (status === "thinking") {
    if (stage === 0) {
      return {
        label: "Peppa heard you",
        text: "Got it! Wait for Peppa.",
      };
    }
    if (stage === 1) {
      return {
        label: "Peppa is thinking",
        text: "Peppa is making an answer.",
      };
    }
    if (stage < 3) return {
      label: "Still thinking",
      text: "Peppa needs a little more time.",
    };
    return {
      action: "retry",
      label: "Taking too long",
      text: "Let’s try the chat again.",
    };
  }

  if (status === "reconnecting") {
    if (stage === 0) return {
      label: "Connecting again",
      text: "The chat stopped. Trying again. Your words are safe.",
    };
    if (stage === 1) return {
      label: "Still trying",
      text: "Still trying. Your words are safe.",
    };
    return {
      action: "retry",
      label: "Taking too long",
      text: "Let’s try the chat again.",
    };
  }

  const savingProfile = purpose !== "small-chat";
  if (stage === 0) {
    return savingProfile
      ? {
          label: "Saving your answers",
          text: "Lovely chat! Saving your answers…",
        }
      : {
          label: "Finishing chat",
          text: "That was fun! Finishing up…",
        };
  }
  if (stage === 1) return {
      label: "Still finishing",
      text: "Your chat is safe. Still finishing…",
    };
  return {
    action: "leave",
    label: "Taking too long",
    text: "Your chat is safe. You can go back.",
  };
}
