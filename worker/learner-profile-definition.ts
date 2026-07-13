import source from "../content/learner-profile/questionnaire-v2.json" with { type: "json" };
import { validateLearnerProfileQuestionnaire } from "../lib/learner-profile-questionnaire.js";

export const LEARNER_PROFILE_QUESTIONNAIRE =
  validateLearnerProfileQuestionnaire(source);
