import type { DubSceneProps } from "./DubSceneTypes";
import { IllustratedDubScene } from "./IllustratedDubScene";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";

export function DuckScene(props: DubSceneProps) {
  return <IllustratedDubScene definition={FIVE_LITTLE_DUCKS_DUB} {...props} />;
}
