"use client";

import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import { DubStudio } from "./DubStudio";

export { DubEntry, DubLoading, resolveDubLineAudioSource } from "./DubStudio";

export function DuckDub() {
  return (
    <DubStudio definition={FIVE_LITTLE_DUCKS_DUB} />
  );
}
