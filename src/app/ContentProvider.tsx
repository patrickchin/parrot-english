import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { contentCatalogUrl } from '../catalog';
import { loadContent, type Clip, type ContentCatalog, type PublishedPack } from '../content-pack';
import { i18n } from '../i18n-engine';
import { languages } from '../locale';
import type { LoadState } from '../load-state';

const emptyClips: Clip[] = [];
const emptyPacks: PublishedPack[] = [];
const ContentContext = createContext<{
  clips: Clip[]; packs: PublishedPack[]; state: LoadState<ContentCatalog>; reload: () => void;
} | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState<ContentCatalog>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void loadContent(contentCatalogUrl, abort.signal).then(value => {
      if (abort.signal.aborted) return;
      for (const { value: language } of languages) {
        i18n.removeResourceBundle(language, 'content');
        i18n.addResourceBundle(language, 'content', value.locales[language] ?? {});
      }
      setState({ status: 'ready', value });
    }).catch(() => {
      if (!abort.signal.aborted) setState({ status: 'error', error: 'errors.contentLoad' });
    });
    return () => abort.abort();
  }, [attempt]);
  return <ContentContext value={{ clips: state.status === 'ready' ? state.value.clips : emptyClips, packs: state.status === 'ready' ? state.value.packs : emptyPacks, state, reload: () => setAttempt(value => value + 1) }}>{children}</ContentContext>;
}

export function useContent() {
  const context = useContext(ContentContext);
  if (!context) throw new Error('ContentProvider is missing.');
  return context;
}
