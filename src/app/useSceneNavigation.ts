import { useCallback, useEffect, useRef, useState } from 'react';
import { libraryPath, readRoute, scenePath } from './routes';

type RouteState =
  | { status: 'active'; href: string }
  | { status: 'confirming'; href: string; destination: string };

export function useSceneNavigation() {
  const [route, setRoute] = useState<RouteState>(() => ({ status: 'active', href: location.href }));
  const current = useRef(route);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const protectedSession = useRef(false);
  function update(next: RouteState) { current.current = next; setRoute(next); }
  const protect = useCallback((value: boolean) => { protectedSession.current = value; setDirty(value); }, []);
  function accept(href: string) {
    if (location.href !== href) history.pushState(null, '', href);
    update({ status: 'active', href });
    setRevision(value => value + 1);
  }
  function request(href: string) {
    if (href === current.current.href) { update({ status: 'active', href }); return; }
    if (protectedSession.current) update({ status: 'confirming', href: current.current.href, destination: href });
    else accept(href);
  }
  useEffect(() => {
    // Keep the current Player mounted during history navigation until the
    // learner confirms. Cancelling restores its address without reloading it.
    const change = () => request(location.href);
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, [dirty]);
  const rememberDraft = useCallback((id?: string) => {
    if (current.current.status !== 'active') return;
    const url = new URL(scenePath(readRoute(current.current.href).slug, id), current.current.href);
    history.replaceState(null, '', url);
    const next = { status: 'active' as const, href: url.href };
    current.current = next; setRoute(next);
  }, []);
  return {
    ...readRoute(route.href),
    revision, rememberDraft,
    pending: route.status === 'confirming',
    protect,
    navigate(slug: string, draftId?: string) {
      const path = slug ? scenePath(slug, draftId) : libraryPath(readRoute(current.current.href).folder);
      request(new URL(path, current.current.href).href);
    },
    chooseFolder(folder: string) {
      request(new URL(libraryPath(folder), current.current.href).href);
    },
    confirm() { const state = current.current; if (state.status === 'confirming') accept(state.destination); },
    cancel() {
      if (location.href !== current.current.href) history.pushState(null, '', current.current.href);
      update({ status: 'active', href: current.current.href });
    },
  };
}
