const PRIVATE_PROFILE_PATTERNS = [
  /\b(?:attend(?:s|ed|ing)?|go(?:es|ing)?\s+to|stud(?:y|ies|ied|ying)\s+at|enroll(?:s|ed|ing)?\s+at)\s+(?:[\p{L}\p{M}'’.-]+\s+){0,5}(?:school|academy|preschool|kindergarten|nursery|primary|elementary)\b/iu,
  /\b(?:my|our|your|his|her|their|[\p{L}\p{M}'’.-]+['’]s)\s+(?:school|academy|preschool|kindergarten|nursery)\s*(?::|(?:is|was|called|named|at|in|near|on)\b)/iu,
  /\b(?:school|academy|preschool|kindergarten|nursery)\s+(?:is\s+called|is\s+named|called|named)\b/iu,
  /\b(?:my|our|your|his|her|their|[\p{L}\p{M}'’.-]+['’]s)\s+(?:home\s+)?address\b/iu,
  /\b(?:address|post\s*code|zip\s*code)\s*(?::|is\b)/iu,
  /\b(?:lives?|stays?|home)\s+(?:at|in|near|on)\b/iu,
  /\b\d{1,6}\s+[\p{L}\p{M}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’.-]*){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|court|ct|place|pl)\b/iu,
  /\b(?:my|our|your|his|her|their|[\p{L}\p{M}'’.-]+['’]s)\s+(?:phone|mobile|telephone|e-?mail)\b/iu,
  /\b(?:phone|mobile|telephone|e-?mail)\s*(?::|(?:number|no\.?|address|is)\b)/iu,
  /\bcontact\s+(?:me|her|him|them|details?|info(?:rmation)?|number|is|at)\b/iu,
  /\b(?:wechat|whatsapp|telegram|discord|instagram|facebook|tiktok|snapchat)\s*(?::|(?:username|user\s+name|handle|account|id|is)\b)/iu,
  /\b(?:find|message|contact)\s+(?:me|her|him|them)\s+on\s+(?:wechat|whatsapp|telegram|discord|instagram|facebook|tiktok|snapchat)\b/iu,
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
  /(?:^|\s)@[\p{L}\p{N}_.-]{2,}/iu,
  /\b(?:https?:\/\/|www\.)\S+/iu,
  /\+?\d(?:[\s().-]*\d){6,}/u,
  /\b(?:my|our|your|his|her|their|[\p{L}\p{M}'’.-]+['’]s)\s+(?:password|passcode|secret(?:\s+code)?)\b/iu,
  /\b(?:password|passcode|secret\s+code|surname|last\s+name|full\s+name|date\s+of\s+birth|born\s+on|birthday\s+is)\s*(?::|is\b)/iu,
  /(?:\u6211\u7684|\u6211\u4eec\u7684|\u4ed6\u7684|\u5979\u7684|\u5b69\u5b50\u7684|[\u3400-\u9fff]{1,12}\u7684)(?:\u5b66\u6821|\u5b66\u9662|\u5e7c\u513f\u56ed)(?:\u662f|\u53eb|\u5728)/iu,
  /\u5c31\u8bfb\u4e8e[^\u3002\uff01\uff1f\n]{0,30}(?:\u5b66\u6821|\u5b66\u9662|\u5e7c\u513f\u56ed)|(?:\u6211\u7684|\u6211\u4eec\u7684|\u4ed6\u7684|\u5979\u7684|\u5b69\u5b50\u7684)(?:\u5730\u5740|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a\u53f7\u7801|\u7535\u5b50\u90ae\u4ef6|\u90ae\u7bb1|\u5bc6\u7801|\u59d3\u6c0f|\u5fae\u4fe1|qq\u53f7)|(?:\u5730\u5740|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a\u53f7\u7801|\u7535\u5b50\u90ae\u4ef6|\u90ae\u7bb1|\u5bc6\u7801|\u59d3\u6c0f|\u5fae\u4fe1|qq\u53f7)(?:\u662f|\u4e3a|:|\uff1a)|\u4f4f\u5728/iu,
] as const;

const NAME_WORD = /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u;
const NAME_TOKEN = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
const HAN_NAME = /^[\p{Script=Han}]{2,4}$/u;
const COMMON_HAN_SURNAMES = new Set(
  Array.from(
    "\u738b\u674e\u5f20\u5218\u9648\u6768\u9ec4\u8d75\u5434\u5468" +
      "\u5f90\u5b59\u9a6c\u6731\u80e1\u90ed\u4f55\u9ad8\u6797\u7f57" +
      "\u90d1\u6881\u8c22\u5b8b\u5510\u8bb8\u97e9\u51af\u9093\u66f9" +
      "\u5f6d\u66fe\u8096\u7530\u8463\u8881\u6f58\u4e8e\u848b\u8521" +
      "\u4f59\u675c\u53f6\u7a0b\u82cf\u9b4f\u5415\u4e01\u4efb\u6c88" +
      "\u59da\u5362\u59dc\u5d14\u949f\u8c2d\u9646\u6c6a\u8303\u91d1" +
      "\u77f3\u5ed6\u8d3e\u590f\u97e6\u4ed8\u65b9\u767d\u90b9\u5b5f" +
      "\u718a\u79e6\u90b1\u6c5f\u5c39\u859b\u95eb\u6bb5\u96f7\u4faf" +
      "\u9f99\u53f2\u9676\u9ece\u8d3a\u987e\u6bdb\u90dd\u9f9a\u90b5" +
      "\u4e07\u8983\u6b66\u6234\u83ab\u5b54\u5411\u6c64",
  ),
);
const COMMON_COMPOUND_HAN_SURNAMES = [
  "\u4e0a\u5b98",
  "\u4e1c\u65b9",
  "\u516c\u5b59",
  "\u53f8\u5f92",
  "\u53f8\u7a7a",
  "\u53f8\u9a6c",
  "\u5b87\u6587",
  "\u5c09\u8fdf",
  "\u6155\u5bb9",
  "\u6b27\u9633",
  "\u7687\u752b",
  "\u8bf8\u845b",
  "\u957f\u5b59",
  "\u4ee4\u72d0",
] as const;
const NAME_PARTICLES = new Set([
  "al",
  "bin",
  "da",
  "de",
  "del",
  "di",
  "van",
  "von",
]);
const PROFILE_PREDICATES = new Set([
  "age",
  "attends",
  "builds",
  "can",
  "draws",
  "enjoys",
  "feels",
  "finds",
  "goes",
  "has",
  "hopes",
  "is",
  "knows",
  "learns",
  "likes",
  "lives",
  "loves",
  "makes",
  "plays",
  "practices",
  "prefers",
  "reads",
  "speaks",
  "tries",
  "wants",
  "was",
  "watches",
]);
const PROFILE_MODIFIERS = new Set([
  "also",
  "always",
  "especially",
  "happily",
  "just",
  "never",
  "now",
  "often",
  "really",
  "sometimes",
  "usually",
]);
const PROFILE_RELATION_WORDS = new Set(["and", "or", "who", "with"]);

export const PRIVATE_PROFILE_FIELD_ERROR =
  "Do not share your school, home address, phone, email, or password.";
export const PREFERRED_NAME_FIELD_ERROR =
  "Please use only your first name or nickname.";

export function containsPrivateLearnerProfileDetails(...values: unknown[]) {
  const text = values
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .normalize("NFKC");
  return PRIVATE_PROFILE_PATTERNS.some((pattern) => pattern.test(text));
}

export function looksLikeFullLearnerName(value: unknown) {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").trim();
  if (HAN_NAME.test(normalized)) {
    if (
      COMMON_COMPOUND_HAN_SURNAMES.some(
        (surname) =>
          normalized.startsWith(surname) && normalized.length > surname.length,
      )
    ) {
      return true;
    }
    if (COMMON_HAN_SURNAMES.has(normalized[0])) return true;
  }
  const words = normalized.split(/\s+/u);
  return words.length > 1 && words.every((word) => NAME_WORD.test(word));
}

function summaryStartsWithHanFullName(
  profileName: string,
  profileSummary: string,
) {
  if (!/^[\p{Script=Han}]{1,3}$/u.test(profileName)) return false;
  if (
    Array.from(COMMON_HAN_SURNAMES).some((surname) =>
      profileSummary.startsWith(`${surname}${profileName}`),
    )
  ) {
    return true;
  }
  return COMMON_COMPOUND_HAN_SURNAMES.some((surname) =>
    profileSummary.startsWith(`${surname}${profileName}`),
  );
}

function likelyNameContinuation(word: string) {
  const normalized = word.toLocaleLowerCase();
  if (NAME_PARTICLES.has(normalized)) return true;
  if (word.toLocaleLowerCase() === word.toLocaleUpperCase()) return true;
  const firstCasedLetter = Array.from(word).find(
    (character) =>
      character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
  );
  return firstCasedLetter === firstCasedLetter?.toLocaleUpperCase();
}

export function containsLikelyFullLearnerName(
  profileName: unknown,
  profileSummary?: unknown,
) {
  if (looksLikeFullLearnerName(profileName)) return true;
  if (typeof profileName !== "string" || typeof profileSummary !== "string") {
    return false;
  }
  const normalizedName = profileName.normalize("NFKC").trim();
  const normalizedSummary = profileSummary.normalize("NFKC").trimStart();
  if (summaryStartsWithHanFullName(normalizedName, normalizedSummary)) {
    return true;
  }
  const canonicalTokens = Array.from(
    normalizedName.matchAll(NAME_TOKEN),
  );
  if (canonicalTokens.length !== 1) return false;
  const canonicalName = canonicalTokens[0][0].toLocaleLowerCase();
  const summary = normalizedSummary;
  const tokens = Array.from(summary.matchAll(NAME_TOKEN));

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token[0].toLocaleLowerCase() !== canonicalName) continue;
    const nextToken = tokens[index + 1];
    const separator = summary.slice(
      (token.index ?? 0) + token[0].length,
      nextToken.index,
    );
    if (!/^\s+$/u.test(separator)) continue;

    for (
      let lookahead = index + 1;
      lookahead < tokens.length && lookahead <= index + 4;
      lookahead += 1
    ) {
      const word = tokens[lookahead][0];
      const normalized = word.toLocaleLowerCase();
      if (PROFILE_PREDICATES.has(normalized)) break;
      if (PROFILE_MODIFIERS.has(normalized)) continue;
      if (PROFILE_RELATION_WORDS.has(normalized)) break;
      if (likelyNameContinuation(word)) return true;
      break;
    }
  }
  return false;
}
