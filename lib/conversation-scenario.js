const CORE_OBJECTIVES = ["name", "age"];
const OUTCOMES = new Set([
  "answered",
  "declined",
  "off_topic",
  "silence",
  "stop",
  "unclear",
  "unknown",
]);

function cloneState(state) {
  return {
    ...state,
    rephraseCount: { ...state.rephraseCount },
  };
}

function enterOptional(state) {
  state.phase = "optional";
  state.activeObjective = "interest";
  state.rephraseCount.interest = 0;
}

function finishOptionalExchange(state) {
  state.optionalExchangeCount += 1;
  state.rephraseCount.interest = 0;
  if (state.optionalExchangeCount >= 3) {
    state.phase = "closing";
    state.activeObjective = null;
    state.finishReason = "max_optional_exchanges";
  }
}

function advanceCore(state) {
  if (state.activeObjective === "name") {
    state.activeObjective = "age";
    return;
  }
  enterOptional(state);
}

export function createLearnerProfileConversationState(seed = {}) {
  const profileName =
    typeof seed.profileName === "string" &&
    seed.profileName.trim() &&
    seed.profileName.trim().length <= 120
      ? seed.profileName.trim()
      : null;
  const profileAge =
    Number.isSafeInteger(seed.profileAge) && seed.profileAge >= 0
      ? seed.profileAge
      : null;
  const profileSummary =
    typeof seed.profileSummary === "string" &&
    seed.profileSummary.trim().length <= 2_000
      ? seed.profileSummary.trim()
      : "";
  const learnedName = profileName !== null;
  const learnedAge = profileAge !== null;
  const phase = learnedName && learnedAge ? "optional" : "core";
  const activeObjective =
    phase === "optional" ? "interest" : learnedName ? "age" : "name";

  return {
    phase,
    activeObjective,
    rephraseCount: { name: 0, age: 0, interest: 0 },
    optionalExchangeCount: 0,
    profileSummary,
    profileName,
    profileAge,
    learnedName,
    learnedAge,
    finishReason: null,
  };
}

export function isConversationTerminal(state) {
  return state.phase === "closing";
}

export function applyConversationObservation(state, observation) {
  if (isConversationTerminal(state)) {
    throw new Error("Conversation is already terminal.");
  }
  if (!observation || !OUTCOMES.has(observation.outcome)) {
    throw new Error("Unsupported conversation outcome.");
  }

  const next = cloneState(state);

  if (observation.outcome === "stop") {
    next.phase = "closing";
    next.activeObjective = null;
    next.finishReason = "child_stopped";
    return next;
  }

  if (observation.outcome === "answered") {
    if (typeof observation.summary !== "string" || !observation.summary.trim()) {
      throw new Error("Summary must be a non-empty paragraph.");
    }
    const summary = observation.summary.trim();
    if (summary.length > 2_000) {
      throw new Error("Summary is too long.");
    }
    next.profileSummary = summary;
    if (observation.learnedName === true) {
      if (
        typeof observation.profileName !== "string" ||
        !observation.profileName.trim() ||
        observation.profileName.trim().length > 120
      ) {
        throw new Error("A learned name must include the child's name.");
      }
      next.profileName = observation.profileName.trim();
    }
    if (observation.learnedAge === true) {
      if (
        !Number.isSafeInteger(observation.profileAge) ||
        observation.profileAge < 0
      ) {
        throw new Error("A learned age must be a non-negative whole number.");
      }
      next.profileAge = observation.profileAge;
    }
    next.learnedName = next.learnedName || observation.learnedName === true;
    next.learnedAge = next.learnedAge || observation.learnedAge === true;

    if (next.phase === "core") {
      const missingCore = CORE_OBJECTIVES.find(
        (key) => !next[`learned${key[0].toUpperCase()}${key.slice(1)}`],
      );
      if (missingCore) next.activeObjective = missingCore;
      else enterOptional(next);
    } else {
      finishOptionalExchange(next);
    }
    return next;
  }

  const mayRephrase =
    observation.outcome === "unclear" || observation.outcome === "off_topic";
  const objective = next.activeObjective;
  if (mayRephrase && objective && next.rephraseCount[objective] === 0) {
    next.rephraseCount[objective] = 1;
    return next;
  }

  if (next.phase === "core") advanceCore(next);
  else finishOptionalExchange(next);
  return next;
}

export function nextConversationPrompt(state) {
  if (isConversationTerminal(state)) {
    return {
      objective: "closing",
      mode: "close",
      mustFinishAfterTurn: true,
    };
  }

  const objective = state.activeObjective;
  const rephrasing = Boolean(objective && state.rephraseCount[objective] > 0);
  return {
    objective,
    mode: rephrasing ? "rephrase" : "initial",
    mustFinishAfterTurn: false,
  };
}
