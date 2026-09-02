export type PrivateMediaOwner = {
  learnerProfileId: string;
  userId: string;
};

export function accountPrivateMediaPrefix(userId: string) {
  return `accounts/${encodeURIComponent(userId)}/`;
}

export function learnerPrivateMediaPrefix(owner: PrivateMediaOwner) {
  return `${accountPrivateMediaPrefix(owner.userId)}learners/${encodeURIComponent(owner.learnerProfileId)}/`;
}

export function learnerRecordingsPrefix(owner: PrivateMediaOwner) {
  return `${learnerPrivateMediaPrefix(owner)}recordings/`;
}
