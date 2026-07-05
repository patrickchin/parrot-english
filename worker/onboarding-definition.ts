import source from "../content/onboarding/questionnaire-v2.json" with { type: "json" };
import { validateOnboardingQuestionnaire } from "../lib/onboarding-questionnaire.js";

export const ONBOARDING_QUESTIONNAIRE =
  validateOnboardingQuestionnaire(source);
