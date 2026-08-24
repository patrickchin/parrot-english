// @ts-check

const QUESTION_WORD_WARNING = 7;
const LEARNER_LINE_WORD_WARNING = 7;
const SPOKEN_LINE_WORD_WARNING = 13;
const MAX_LANGUAGE_WARNINGS = 8;
const TECHNICAL_TERMS =
  /\b(?:AI|API|algorithm|authentication|configuration|database|interface|JSON|parameter|URL)\b/gi;

/**
 * @param {string} text
 */
function wordCount(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/**
 * Return concrete review notes for child-facing custom-lesson dialogue. These
 * are advisory authoring heuristics, not an age, reading-level, or ability
 * assessment.
 *
 * @param {import("./lesson-data.js").Lesson} lesson
 */
export function getLessonLanguageWarnings(lesson) {
  /** @type {string[]} */
  const warnings = [];

  /**
   * @param {string} dialogue
   * @param {string} speaker
   * @param {string} location
   */
  function reviewLine(dialogue, speaker, location) {
    const words = wordCount(dialogue);
    if (speaker === "user" && words > LEARNER_LINE_WORD_WARNING) {
      warnings.push(
        `${location}: the learner practice line has ${words} words. Consider one shorter phrase (about 7 words or fewer).`,
      );
    } else if (
      speaker !== "user" &&
      dialogue.includes("?") &&
      words > QUESTION_WORD_WARNING
    ) {
      warnings.push(
        `${location}: the question has ${words} words. Consider one short question (about 7 words or fewer).`,
      );
    } else if (speaker !== "user" && words > SPOKEN_LINE_WORD_WARNING) {
      warnings.push(
        `${location}: the spoken line has ${words} words. Consider splitting it into one idea at a time.`,
      );
    }

    const technicalTerms = [
      ...new Set(dialogue.match(TECHNICAL_TERMS) ?? []),
    ];
    if (technicalTerms.length > 0) {
      warnings.push(
        `${location}: check the technical ${technicalTerms.length === 1 ? "term" : "terms"} ${technicalTerms.map((term) => JSON.stringify(term)).join(", ")}. Keep it only if it is taught or explained.`,
      );
    }
  }

  lesson.scenes.forEach((scene, sceneIndex) => {
    scene.steps.forEach((step, stepIndex) => {
      const location = `Scene ${sceneIndex + 1}, dialogue ${stepIndex + 1}`;
      reviewLine(step.dialogue, step.speaker, location);

      if (!step.check) return;
      reviewLine(
        step.check.correct.dialogue,
        step.check.correct.speaker,
        `${location}, correct feedback`,
      );
      reviewLine(
        step.check.incorrect.dialogue,
        step.check.incorrect.speaker,
        `${location}, try-again feedback`,
      );
      reviewLine(
        step.check.incorrectFinal.dialogue,
        step.check.incorrectFinal.speaker,
        `${location}, final feedback`,
      );
      if (step.check.noInput) {
        reviewLine(
          step.check.noInput.dialogue,
          step.check.noInput.speaker,
          `${location}, no-speech feedback`,
        );
      }
      if (step.check.noInputFinal) {
        reviewLine(
          step.check.noInputFinal.dialogue,
          step.check.noInputFinal.speaker,
          `${location}, final no-speech feedback`,
        );
      }
    });
  });

  if (warnings.length <= MAX_LANGUAGE_WARNINGS) return warnings;
  return [
    ...warnings.slice(0, MAX_LANGUAGE_WARNINGS),
    `${warnings.length - MAX_LANGUAGE_WARNINGS} more language notes are hidden. Review the remaining dialogue for the same patterns.`,
  ];
}
