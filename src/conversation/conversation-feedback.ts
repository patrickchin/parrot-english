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
        label: "Getting ready",
        text: "Starting the voice chat.",
      };
    }
    if (stage === 1) {
      return {
        label: "Getting ready",
        text: "Still getting the voice chat ready.",
      };
    }
    return {
      action: "retry",
      label: "Chat paused",
      text: "The chat did not start. Tap “Try chat again” below.",
    };
  }

  if (status === "thinking") {
    if (stage === 0) {
      return {
        label: "Thinking",
        text: "Your turn is done. Wait for Peppa.",
      };
    }
    if (stage === 1) {
      return {
        label: "Thinking",
        text: "Waiting for Peppa’s answer.",
      };
    }
    if (stage < 3) return {
      label: "Thinking",
      text: "This is taking longer than usual.",
    };
    return {
      action: "retry",
      label: "Chat paused",
      text: "Peppa did not answer. Tap “Try chat again” below.",
    };
  }

  if (status === "reconnecting") {
    if (stage === 0) return {
      label: "Trying again",
      text: "The connection stopped. Trying again.",
    };
    if (stage === 1) return {
      label: "Trying again",
      text: "Still trying to connect.",
    };
    return {
      action: "retry",
      label: "Chat paused",
      text: "The connection did not come back. Tap “Try chat again” below.",
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
  if (stage === 1) {
    return savingProfile
      ? {
          label: "Saving your answers",
          text: "Still saving your answers…",
        }
      : {
          label: "Finishing chat",
          text: "Still finishing the chat…",
        };
  }
  return {
    action: "leave",
    label: "Finish paused",
    text: "Finishing took too long. You can go back.",
  };
}
