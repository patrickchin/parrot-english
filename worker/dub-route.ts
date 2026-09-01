import {
  DUB_DEFINITIONS,
  type DubDefinition,
} from "../src/dubbing/rhyme-catalog.ts";

export type DubRoute = {
  audio: boolean;
  consent: boolean;
  definition: DubDefinition;
  dubId: string;
  lineId: string | null;
};

export function parseDubRoute(
  pathname: string,
  definitions: readonly DubDefinition[] = DUB_DEFINITIONS,
): DubRoute | null {
  const match = /^\/api\/dubs\/([^/]+)(?:\/(consent)|\/lines\/([^/]+)(?:\/(audio))?)?$/.exec(
    pathname,
  );
  if (!match) return null;
  const definition = definitions.find(({ id }) => id === match[1]);
  if (!definition) return null;
  const lineId = match[3] ?? null;
  if (lineId !== null && !definition.lines.some((line) => line.id === lineId)) {
    return null;
  }
  return {
    audio: match[4] === "audio",
    consent: match[2] === "consent",
    definition,
    dubId: definition.id,
    lineId,
  };
}

export function isEncodedDubRouteAlias(pathname: string) {
  if (parseDubRoute(pathname)) return false;
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded !== pathname && parseDubRoute(decoded) !== null;
  } catch {
    return false;
  }
}
