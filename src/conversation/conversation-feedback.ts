import type { ConversationPurpose } from "../../lib/conversation-purpose";

export type TimedConversationStatus =
  | "connecting"
  | "thinking"
  | "reconnecting"
  | "saving";

export type ConversationWaitFeedback = {
  action?: "leave" | "lesson" | "retry";
  label: string;
  showLearnerAnswer?: boolean;
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
  voiceRetryUsed = false,
}: {
  elapsedMs: number;
  purpose: ConversationPurpose;
  responseLatencyMs?: number | null;
  status: TimedConversationStatus;
  voiceRetryUsed?: boolean;
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
        text: "Still getting ready.",
      };
    }
    return {
      action:
        purpose === "small-chat" && voiceRetryUsed ? "lesson" : "retry",
      label: "Chat paused",
      text: "The chat did not start.",
    };
  }

  if (status === "thinking") {
    if (stage === 0) {
      return {
        label: "Thinking",
        showLearnerAnswer: true,
        text: "Your turn is done. Wait for Peppa.",
      };
    }
    if (stage === 1) {
      return {
        label: "Thinking",
        text: "Wait for Peppa.",
      };
    }
    if (stage < 3) return {
      label: "Thinking",
      text: "Still waiting for Peppa.",
    };
    return {
      action:
        purpose === "small-chat" && voiceRetryUsed ? "lesson" : "retry",
      label: "Chat paused",
      text: "Peppa did not answer.",
    };
  }

  if (status === "reconnecting") {
    if (stage === 0) return {
      label: "Trying again",
      text: "The chat stopped.",
    };
    if (stage === 1) return {
      label: "Trying again",
      text: "Still trying.",
    };
    return {
      action:
        purpose === "small-chat" && voiceRetryUsed ? "lesson" : "retry",
      label: "Chat paused",
      text: "The chat stopped.",
    };
  }

  const savingProfile = purpose !== "small-chat";
  if (stage === 0) {
    return savingProfile
      ? {
          label: "Saving your answers",
          text: "Lovely chat!",
        }
      : {
          label: "Finishing chat",
          text: "That was fun!",
        };
  }
  if (stage === 1) {
    return savingProfile
      ? {
          label: "Saving your answers",
          text: "Still working.",
        }
      : {
          label: "Finishing chat",
          text: "Still working.",
        };
  }
  return {
    action: "leave",
    label: "Finish paused",
    text: "Finishing took too long.",
  };
}
