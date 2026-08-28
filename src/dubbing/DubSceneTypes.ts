import type { ComponentType } from "react";
import type { DubLine } from "./rhyme-catalog.ts";

export type DubSceneProps = {
  compact?: boolean;
  line?: DubLine;
  playing?: boolean;
  thumbnail?: boolean;
};

export type DubSceneComponent = ComponentType<DubSceneProps>;
