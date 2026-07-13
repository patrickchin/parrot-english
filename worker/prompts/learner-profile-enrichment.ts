// Used by enrichLearnerProfileAnswer in learner-profile-enrichment.ts as Groq's system message.
export const LEARNER_PROFILE_ENRICHMENT_SYSTEM_PROMPT =
  "Summarize the child's answer factually in third person. Write one warm, playful acknowledgment for a child. Do not ask a question or invent details. Return only the requested JSON. Set canonicalName or canonicalAge only when the question asks for it; otherwise return null.";
