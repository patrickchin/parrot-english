const CORE_OBJECTIVES = ["name", "age"];
const INTEREST_TOPICS = new Set([
  "activities",
  "animals",
  "cartoons",
  "food",
  "music",
  "stories",
]);
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
    facts: state.facts.map((fact) => ({ ...fact })),
    rephraseCount: { ...state.rephraseCount },
  };
}

function stringValue(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  return trimmed;
}

function normalizedFact(fact) {
  if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
    throw new Error("Conversation facts must be objects.");
  }

  if (fact.key === "name") {
    return { key: "name", value: stringValue(fact.value, "Name", 120) };
  }

  if (fact.key === "age") {
    if (!Number.isInteger(fact.value) || fact.value < 3 || fact.value > 17) {
      throw new Error("Age must be an integer from 3 to 17.");
    }
    return { key: "age", value: fact.value };
  }

  if (fact.key === "interest") {
    if (typeof fact.topic !== "string" || !fact.topic.trim()) {
      throw new Error("Interest topic is required.");
    }
    const topic = stringValue(fact.topic, "Interest topic", 40).toLowerCase();
    if (!INTEREST_TOPICS.has(topic)) {
      throw new Error("Interest topic is not allowed.");
    }
    return {
      key: "interest",
      topic,
      value: stringValue(fact.value, "Interest", 240),
    };
  }

  throw new Error(`Unsupported conversation fact: ${String(fact.key)}`);
}

function hasFact(state, key) {
  return state.facts.some((fact) => fact.key === key);
}

function mergeFacts(state, facts) {
  for (const fact of facts) {
    if (fact.key === "interest") {
      state.facts.push(fact);
      continue;
    }

    const index = state.facts.findIndex((entry) => entry.key === fact.key);
    if (index === -1) state.facts.push(fact);
    else state.facts[index] = fact;
  }
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

export function createOnboardingConversationState() {
  return {
    phase: "core",
    activeObjective: "name",
    rephraseCount: { name: 0, age: 0, interest: 0 },
    optionalExchangeCount: 0,
    facts: [],
    finishReason: null,
  };
}

export function isConversationTerminal(state) {
  return state.phase === "closing";
}

export function validateCandidateFacts(state, facts) {
  if (!Array.isArray(facts) || facts.length > 5) {
    throw new Error("Candidate facts must be a bounded array.");
  }
  const normalized = facts.map(normalizedFact);
  const existingInterests = state.facts.filter(
    (fact) => fact.key === "interest",
  ).length;
  const newInterests = normalized.filter(
    (fact) => fact.key === "interest",
  ).length;
  if (existingInterests + newInterests > 3) {
    throw new Error("At most three interest facts are allowed.");
  }
  return normalized;
}

export function applyConversationObservation(state, observation) {
  if (isConversationTerminal(state)) {
    throw new Error("Conversation is already terminal.");
  }
  if (!observation || !OUTCOMES.has(observation.outcome)) {
    throw new Error("Unsupported conversation outcome.");
  }

  const next = cloneState(state);
  const facts = validateCandidateFacts(next, observation.facts ?? []);

  if (observation.outcome === "stop") {
    next.phase = "closing";
    next.activeObjective = null;
    next.finishReason = "child_stopped";
    return next;
  }

  if (observation.outcome === "answered") {
    if (facts.length === 0) {
      throw new Error("Answered outcomes require at least one candidate fact.");
    }
    mergeFacts(next, facts);

    if (next.phase === "core") {
      const missingCore = CORE_OBJECTIVES.find((key) => !hasFact(next, key));
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
      includeChineseHint: false,
      mustFinishAfterTurn: true,
    };
  }

  const objective = state.activeObjective;
  const rephrasing = Boolean(objective && state.rephraseCount[objective] > 0);
  return {
    objective,
    mode: rephrasing ? "rephrase" : "initial",
    includeChineseHint: rephrasing,
    mustFinishAfterTurn: false,
  };
}
