const LAYER_ORDER = Object.freeze(["sky", "far", "mid", "play", "foreground"]);

export function flattenSceneLayers(scene) {
  return LAYER_ORDER.flatMap((role) =>
    scene.layers[role].map((layer) => Object.freeze({ ...layer, role })),
  ).sort((left, right) => left.depth - right.depth);
}

export function getLayerScrollFactor(layer, mode, reducedMotion) {
  if (mode === "off" || reducedMotion) return { x: 1, y: 1 };
  return { x: layer.scrollFactorX, y: layer.scrollFactorY };
}

export function resolveHeldItemTransform({
  anchors,
  flipX,
  frameIndex,
  itemHold,
}) {
  if (!anchors.length) throw new Error("A held-item pose requires an anchor.");
  const anchor = anchors[frameIndex % anchors.length] ?? anchors[0];
  const x = anchor.x + itemHold.offsetX;
  return {
    depth: anchor.depth,
    flipX,
    originX: itemHold.originX,
    originY: itemHold.originY,
    rotation: flipX ? -itemHold.rotation : itemHold.rotation,
    x: flipX ? -x : x,
    y: anchor.y + itemHold.offsetY,
  };
}
