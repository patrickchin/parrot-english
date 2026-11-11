import { useCallback, useEffect, useRef, useState } from 'react';

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
    const destination = new URL(href), previous = new URL(current.current.href);
    if (destination.hash !== previous.hash && destination.searchParams.get('dub') === previous.searchParams.get('dub')) {
      destination.searchParams.delete('dub');
      if (location.href === href) history.replaceState(null, '', destination);
      href = destination.href;
    }
    if (href === current.current.href) { update({ status: 'active', href }); return; }
    if (protectedSession.current) update({ status: 'confirming', href: current.current.href, destination: href });
    else accept(href);
  }
  useEffect(() => {
    // Keep the current Player mounted during history/hash navigation until the
    // learner confirms. Cancelling restores its address without reloading it.
    const change = () => request(location.href);
    window.addEventListener('hashchange', change);
    window.addEventListener('popstate', change);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('popstate', change); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, [dirty]);
  const rememberDraft = useCallback((id?: string) => {
    if (current.current.status !== 'active') return;
    const url = new URL(current.current.href);
    if (id) url.searchParams.set('dub', id); else url.searchParams.delete('dub');
    history.replaceState(null, '', url);
    const next = { status: 'active' as const, href: url.href };
    current.current = next; setRoute(next);
  }, []);
  return {
    slug: new URL(route.href).hash.slice(1),
    draftId: new URL(route.href).searchParams.get('dub') ?? undefined,
    revision, rememberDraft,
    pending: route.status === 'confirming',
    protect,
    navigate(slug: string, draftId?: string) { const url = new URL(current.current.status === 'active' ? location.href : current.current.href); url.hash = slug; if (draftId) url.searchParams.set('dub', draftId); else url.searchParams.delete('dub'); request(url.href); },
    confirm() { const state = current.current; if (state.status === 'confirming') accept(state.destination); },
    cancel() {
      if (location.href !== current.current.href) history.pushState(null, '', current.current.href);
      update({ status: 'active', href: current.current.href });
    },
  };
}
