"use client";

import { DubStudio } from "./DubStudio";
import { FIVE_LITTLE_DUCKS_DUB } from "./rhyme-catalog";

export {
  DubEntry,
  DubLoading,
  resolveDubLineAudioSource,
  resolveGuideOnlyDubLineAudioSource,
} from "./DubStudio";

export function DuckDub() {
  return (
    <DubStudio definition={FIVE_LITTLE_DUCKS_DUB} />
  );
}
