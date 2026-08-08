function parseHexColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Invalid palette color: ${value}`);
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function nearestColor(red, green, blue, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const redDelta = red - color[0];
    const greenDelta = green - color[1];
    const blueDelta = blue - color[2];
    const distance =
      redDelta * redDelta +
      greenDelta * greenDelta +
      blueDelta * blueDelta;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }

  return best;
}

export function compileRgbaToPixelGrid({
  alphaThreshold = 128,
  data,
  palette,
}) {
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
    throw new Error("Pixel data must be a Uint8Array.");
  }
  if (data.length % 4 !== 0) {
    throw new Error("Pixel data must contain complete RGBA pixels.");
  }
  if (!Array.isArray(palette) || palette.length === 0) {
    throw new Error("The compiler requires at least one palette color.");
  }
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new Error("alphaThreshold must be an integer from 0 through 255.");
  }

  const parsedPalette = palette.map(parseHexColor);
  const output = new Uint8ClampedArray(data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < alphaThreshold) continue;
    const color = nearestColor(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      parsedPalette,
    );
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = 255;
  }
  return output;
}

export function expandRgbaCells({ cellSize, data, height, width }) {
  if (!Number.isInteger(cellSize) || cellSize < 1) {
    throw new Error("cellSize must be a positive integer.");
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("width and height must be positive integers.");
  }
  if (data.length !== width * height * 4) {
    throw new Error("Pixel data does not match the declared dimensions.");
  }

  const expandedWidth = width * cellSize;
  const expandedHeight = height * cellSize;
  const output = new Uint8ClampedArray(expandedWidth * expandedHeight * 4);
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      const sourceOffset = (sourceY * width + sourceX) * 4;
      for (let cellY = 0; cellY < cellSize; cellY += 1) {
        for (let cellX = 0; cellX < cellSize; cellX += 1) {
          const targetX = sourceX * cellSize + cellX;
          const targetY = sourceY * cellSize + cellY;
          const targetOffset = (targetY * expandedWidth + targetX) * 4;
          output[targetOffset] = data[sourceOffset];
          output[targetOffset + 1] = data[sourceOffset + 1];
          output[targetOffset + 2] = data[sourceOffset + 2];
          output[targetOffset + 3] = data[sourceOffset + 3];
        }
      }
    }
  }

  return { data: output, height: expandedHeight, width: expandedWidth };
}

export function mergeCompiledAssetEntries({
  assetIds,
  compiledEntries,
  existingEntries,
}) {
  const expectedIds = new Set(assetIds);
  if (expectedIds.size !== assetIds.length) {
    throw new Error("Pixel-world asset IDs must be unique.");
  }
  const entriesById = new Map();
  for (const entry of [...existingEntries, ...compiledEntries]) {
    if (!expectedIds.has(entry.id)) {
      throw new Error(`Unknown compiled manifest entry: ${entry.id}`);
    }
    entriesById.set(entry.id, entry);
  }
  return assetIds.map((assetId) => {
    const entry = entriesById.get(assetId);
    if (!entry) {
      throw new Error(`Missing compiled manifest entry for ${assetId}`);
    }
    return entry;
  });
}

export function validatePixelAssetContract({
  actualHeight,
  actualWidth,
  expectedHeight,
  expectedWidth,
  worldScale,
}) {
  if (worldScale !== 1) {
    throw new Error(`worldScale must be 1; received ${worldScale}.`);
  }
  if (
    actualWidth !== expectedWidth ||
    actualHeight !== expectedHeight
  ) {
    throw new Error(
      `expected ${expectedWidth}x${expectedHeight} but received ${actualWidth}x${actualHeight}.`,
    );
  }
}
