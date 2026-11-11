import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPath, useBeforeUnload, useBlocker, useLocation, useNavigate, type BlockerFunction } from 'react-router';
import { libraryPath, readRoute, scenePath } from './routes';
import { languagePath, type Language } from '../locale';

type Page = ReturnType<typeof readRoute>;
function languageOnly(previous: Page, next: Page) {
  return previous.language !== next.language && !!next.slug && next.slug === previous.slug && !next.draftId && !!previous.draftId;
}
function samePage(previous: Page, next: Page) {
  return next.page === previous.page && next.slug === previous.slug && next.folder === previous.folder &&
    (next.draftId === previous.draftId || languageOnly(previous, next));
}

const NavigationContext = createContext<ReturnType<typeof useNavigationState> | null>(null);
export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigation = useNavigationState();
  return <NavigationContext value={navigation}>{children}</NavigationContext>;
}
export function useSceneNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error('NavigationProvider is missing.');
  return navigation;
}

function useNavigationState() {
  const location = useLocation();
  const go = useNavigate();
  const href = createPath(location);
  const replacement = useRef<string | undefined>(undefined);
  const protectedSession = useRef(false);
  // This checkpoint owns only the running player session. React Router owns URL
  // matching, history, redirects, navigation, and the blocked destination.
  const [active, setActive] = useState(() => ({ href, page: readRoute(href), revision: 0 }));
  if (active.href !== href) {
    const page = readRoute(href);
    const preserve = replacement.current === href || samePage(active.page, page);
    if (languageOnly(active.page, page)) page.draftId = active.page.draftId;
    setActive({ href, page, revision: active.revision + (preserve ? 0 : 1) });
  }
  const current = useRef(active);
  useLayoutEffect(() => { current.current = active; }, [active]);
  const blocker = useBlocker(useCallback<BlockerFunction>(({ currentLocation, nextLocation }) =>
    protectedSession.current && replacement.current !== createPath(nextLocation) &&
    !samePage(readRoute(createPath(currentLocation)), readRoute(createPath(nextLocation))), []));
  const blocked = blocker.state === 'blocked';
  const blockedRef = useRef(blocked);
  useLayoutEffect(() => { blockedRef.current = blocked; }, [blocked]);
  useBeforeUnload(useCallback(event => {
    if (protectedSession.current) { event.preventDefault(); event.returnValue = ''; }
  }, []));

  useEffect(() => {
    // An autosave may add an ID after an older language-history entry was made.
    const actual = readRoute(href);
    if (active.page.draftId && !actual.draftId && actual.slug === active.page.slug) {
      const path = scenePath(actual.slug, active.page.draftId, actual.language) + new URL(href, window.location.origin).search;
      replacement.current = path;
      void go(path, { replace: true });
    } else if (replacement.current === href) replacement.current = undefined;
  }, [href, active.page, go]);

  const protect = useCallback((value: boolean) => { protectedSession.current = value; }, []);
  const rememberDraft = useCallback((id?: string) => {
    if (blockedRef.current) return;
    const { page, href } = current.current;
    const path = scenePath(page.slug, id, page.language) + new URL(href, window.location.origin).search;
    if (path === href) return;
    replacement.current = path;
    void go(path, { replace: true });
  }, [go]);
  return {
    ...active.page, revision: active.revision, rememberDraft, protect,
    pending: blocked,
    navigateTo(path: string) { void go(path); },
    setLanguage(language: Language) {
      const url = new URL(current.current.href, window.location.origin);
      void go(languagePath(url.pathname, language) + url.search + url.hash);
    },
    navigate(slug: string, draftId?: string) {
      const { page, href } = current.current;
      const search = new URL(href, window.location.origin).search;
      void go((slug ? scenePath(slug, draftId, page.language) : libraryPath(page.folder, page.language)) + search);
    },
    chooseFolder(folder: string) { void go(libraryPath(folder, current.current.page.language)); },
    confirm() { if (blocker.state === 'blocked') blocker.proceed(); },
    cancel() { if (blocker.state === 'blocked') blocker.reset(); },
  };
}
