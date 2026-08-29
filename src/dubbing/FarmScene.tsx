import type { DubSceneProps } from "./DubSceneTypes";
import { IllustratedDubScene } from "./IllustratedDubScene";
import { OLD_MACDONALD_DUB } from "./rhyme-catalog";

export function FarmScene(props: DubSceneProps) {
  return <IllustratedDubScene definition={OLD_MACDONALD_DUB} {...props} />;
}
