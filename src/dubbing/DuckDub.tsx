"use client";

import type { DubSceneComponent } from "./DubSceneTypes";
import { DuckScene } from "./DuckScene";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import { DubStudio } from "./DubStudio";

export { DubEntry, DubLoading, resolveDubLineAudioSource } from "./DubStudio";

export function DuckDub() {
  return (
    <DubStudio
      Scene={DuckScene as unknown as DubSceneComponent}
      definition={FIVE_LITTLE_DUCKS_DUB}
    />
  );
}
