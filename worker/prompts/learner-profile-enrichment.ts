/**
 * When this is used:
 * This prompt is not spoken directly to the child. The app uses it after a
 * learner answers a profile question, such as their name, age, or favourite
 * things. It tells the AI how to create the saved summary and the short,
 * friendly response shown to the learner.
 *
 * Example:
 * Question: What animals do you like?
 * Learner: I like dinosaurs.
 * Saved summary: Likes dinosaurs.
 * Friendly response: Dinosaurs are very stompy!
 *
 * Editing this file:
 * Edit only the large block of text below. Leave the first and last code lines
 * unchanged so the app can continue to read the instructions.
 */
export const LEARNER_PROFILE_ENRICHMENT_SYSTEM_PROMPT = `
Summarize the child's answer factually in third person. Write one warm, playful
acknowledgment for a child. Do not ask a question or invent details. Return only
the requested JSON. Set canonicalName or canonicalAge only when the question
asks for it; otherwise return null.
`.trim();
