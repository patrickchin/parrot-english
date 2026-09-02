export type PrivateMediaOwner = {
  privateMediaName: string;
  userEmail: string;
};

function percentEncode(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  ).join("");
}

export function privateMediaPathSegment(value: string) {
  if (!value.trim()) throw new Error("Private-media path segment is empty.");
  if (value === "." || value === "..") return percentEncode(value);
  return [...value].map((character) =>
    character === "%" ||
    character === "/" ||
    character === "\\" ||
    /\p{Cc}/u.test(character)
      ? percentEncode(character)
      : character
  ).join("");
}

export function accountPrivateMediaPrefix(userEmail: string) {
  const normalizedEmail = userEmail.normalize("NFKC").trim().toLowerCase();
  return `accounts/${privateMediaPathSegment(normalizedEmail)}/`;
}

export function learnerPrivateMediaPrefix(owner: PrivateMediaOwner) {
  return `${accountPrivateMediaPrefix(owner.userEmail)}learners/${privateMediaPathSegment(owner.privateMediaName)}/`;
}

export function learnerRecordingsPrefix(owner: PrivateMediaOwner) {
  return `${learnerPrivateMediaPrefix(owner)}recordings/`;
}
