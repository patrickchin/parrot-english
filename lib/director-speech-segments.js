// @ts-check
import {
  findStaticAudioLineByTextForSpeaker,
  getStaticAudioLine,
} from "./static-audio.js";

/**
 * @param {string} text
 * @returns {string}
 */
function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * @param {{ speaker: string, lang: string, text: string }} segment
 * @returns {string}
 */
export function createDirectorSpeechSegmentKey(segment) {
  return `${segment.speaker}__${segment.lang}__${hashText(segment.text)}`;
}

/**
 * @param {{ speaker: string, lang: string, text: string }} segment
 * @returns {{
 *   kind: "dynamic" | "static",
 *   key: string,
 *   audioId: string | null,
 *   audioSrc: string | null,
 *   lang: string,
 *   text: string,
 * }}
 */
export function resolveStaticDirectorSpeechSegment(segment) {
  const audioId = findStaticAudioLineByTextForSpeaker(
    segment.text,
    segment.speaker,
    segment.lang
  );
  if (!audioId) {
    return {
      kind: "dynamic",
      key: createDirectorSpeechSegmentKey(segment),
      audioId: null,
      audioSrc: null,
      lang: segment.lang,
      text: segment.text,
    };
  }

  const line = getStaticAudioLine(audioId);
  return {
    kind: "static",
    key: createDirectorSpeechSegmentKey(segment),
    audioId: line.id,
    audioSrc: line.src,
    lang: line.lang,
    text: line.text,
  };
}
