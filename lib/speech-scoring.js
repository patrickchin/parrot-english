// @ts-check

const CONTRACTIONS = new Map([
  ["can't", "cannot"],
  ["cant", "cannot"],
  ["i'm", "i am"],
  ["you're", "you are"],
  ["it's", "it is"],
  ["that's", "that is"],
]);

/** @param {unknown} value */
export function normalizeSpeechText(value) {
  const words = String(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (CONTRACTIONS.get(word) ?? word).split(" "));

  return words.join(" ");
}

/**
 * @param {string} left
 * @param {string} right
 */
function levenshteinDistance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 0; i < a.length; i += 1) {
    current[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const substitution = previous[j] + (a[i] === b[j] ? 0 : 1);
      const insertion = current[j] + 1;
      const deletion = previous[j + 1] + 1;
      current[j + 1] = Math.min(substitution, insertion, deletion);
    }

    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

/**
 * @param {string} transcript
 * @param {string} targetText
 */
export function scoreSpeechTranscript(transcript, targetText) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const normalizedTarget = normalizeSpeechText(targetText);

  if (!normalizedTarget) {
    return {
      transcript,
      normalizedTranscript,
      normalizedTarget,
      similarity: 0,
      passed: false,
      feedbackText: "Please choose a phrase to practise.",
      retryAllowed: false,
    };
  }

  if (!normalizedTranscript) {
    return {
      transcript,
      normalizedTranscript,
      normalizedTarget,
      similarity: 0,
      passed: false,
      feedbackText: "I couldn't hear you. Please try again.",
      retryAllowed: true,
    };
  }

  const distance = levenshteinDistance(normalizedTranscript, normalizedTarget);
  const longest = Math.max(normalizedTranscript.length, normalizedTarget.length);
  const similarity = longest === 0 ? 1 : Math.max(0, 1 - distance / longest);
  const passed = similarity >= 0.74;

  return {
    transcript,
    normalizedTranscript,
    normalizedTarget,
    similarity,
    passed,
    feedbackText: passed ? "Great job!" : "Almost! Try again.",
    retryAllowed: !passed,
  };
}
