import { DUB_ID, DUB_LINES } from "../src/dubbing/dub-script.ts";

export type DubRoute = {
  audio: boolean;
  consent: boolean;
  dubId: typeof DUB_ID;
  lineId: string | null;
};

export function parseDubRoute(pathname: string): DubRoute | null {
  if (pathname === `/api/dubs/${DUB_ID}/consent`) {
    return { audio: false, consent: true, dubId: DUB_ID, lineId: null };
  }
  const match = /^\/api\/dubs\/([^/]+)(?:\/lines\/([^/]+)(?:\/(audio))?)?$/.exec(
    pathname,
  );
  if (
    !match ||
    match[1] !== DUB_ID ||
    (match[2] && !DUB_LINES.some((line) => line.id === match[2]))
  ) {
    return null;
  }
  return {
    audio: match[3] === "audio",
    consent: false,
    dubId: DUB_ID,
    lineId: match[2] ?? null,
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
