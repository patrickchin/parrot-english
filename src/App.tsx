import { useTranslation } from 'react-i18next';
import { Component, lazy, startTransition, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AppHeader } from './app/AppHeader';
import { Button } from './shared/ui';
import type { Scene } from './scene';
import { loadScene } from './content-pack';
import { PackBrowser } from './PackBrowser';
import { Library } from './Library';
import { packsPath } from './app/routes';
import { useContent } from './app/ContentProvider';
import { useSceneNavigation } from './app/useSceneNavigation';
import { loadDub, type RestoredDub } from './dub-store';
import type { LoadState } from './load-state';

const loadPlayer = () => import('./app/Player');
const Player = lazy(() => loadPlayer().then(module => ({ default: module.Player })));
const OwnerPacks = lazy(() => import('./OwnerPacks').then(module => ({ default: module.OwnerPacks })));
const SavedDubs = lazy(() => import('./app/SavedDubs').then(module => ({ default: module.SavedDubs })));
const SharedDub = lazy(() => import('./SharedDub').then(module => ({ default: module.SharedDub })));

function PageStatus({ error = false }: { error?: boolean }) {
  const { t } = useTranslation();
  const navigation = useSceneNavigation();
  return <div className="min-h-dvh bg-paper text-ink"><AppHeader onBack={navigation.slug ? () => navigation.navigate('') : undefined} /><main aria-busy={!error} className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted-foreground">{t(error ? 'errors.unexpected' : 'player.loading')}</p>{error && <Button onClick={() => window.location.reload()}>{t('player.reload')}</Button>}</main></div>;
}

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PageStatus error /> : this.props.children; }
}

export default function App() {
  const navigation = useSceneNavigation();
  return <PageBoundary key={navigation.page}><Suspense fallback={<PageStatus />}><AppContent /></Suspense></PageBoundary>;
}

function AppContent() {
  const { t } = useTranslation();
  const content = useContent();
  const { clips } = content;
  const navigation = useSceneNavigation();
  const [loadedScene, setLoadedScene] = useState<{ revision: number; attempt: number; load: LoadState<{ scene: Scene; draft?: RestoredDub }> }>({ revision: -1, attempt: 0, load: { status: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  const selected = clips.find(c => c.slug === navigation.slug);
  const choose = (slug: string, draftId?: string) => navigation.navigate(slug, draftId);
  const back = () => navigation.navigate('');
  useEffect(() => {
    // Prepare player code while browsing scenes or resolving a direct link.
    if (!navigation.directory && ['scene', 'pack', 'library', 'dubs'].includes(navigation.page)) void loadPlayer().catch(() => {});
  }, [navigation.page, navigation.directory]);
  useEffect(() => {
    const abort = new AbortController();
    const request = { revision: navigation.revision, attempt };
    setLoadedScene({ ...request, load: { status: 'loading' } });
    if (!selected) return;
    loadScene(selected, abort.signal)
      .then(async scene => {
        const draft = navigation.draftId ? await loadDub(navigation.draftId, scene) : undefined;
        if (!abort.signal.aborted) startTransition(() => setLoadedScene({ ...request, load: { status: 'ready', value: { scene, draft } } }));
      })
      .catch(e => { if (!abort.signal.aborted) setLoadedScene({ ...request, load: { status: 'error', error: e instanceof Error ? e.message : "errors.sceneLoadFailed" } }); });
    return () => abort.abort();
  // Saving an ID into the current URL does not reload the running Player.
  }, [attempt, selected, navigation.revision]);
  if (navigation.page === 'not-found') return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('errors.pageNotFound')}</h1><Button onClick={back}>{t('navigation.library')}</Button></main></div>;
  if (navigation.page === 'dubs') return <SavedDubs onChoose={choose} />;
  if (navigation.page === 'share') return <SharedDub key={navigation.shareId} id={navigation.shareId!} />;
  if (navigation.page === 'owner') return <OwnerPacks />;
  if (content.state.status !== 'ready') return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main aria-busy={content.state.status === 'loading'} className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('navigation.library')}</h1><p role={content.state.status === 'error' ? 'alert' : 'status'} className="my-6 text-muted-foreground">{t(content.state.status === 'error' ? 'errors.contentLoad' : 'library.loading')}</p>{content.state.status === 'error' && <Button onClick={content.reload}>{t('player.reload')}</Button>}</main></div>;
  if (navigation.page === 'scene' && !selected) return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('errors.pageNotFound')}</h1><p role="status" className="my-6 text-muted-foreground">{t('library.unavailable')}</p><Button onClick={back}>{t('navigation.library')}</Button></main></div>;
  if (navigation.page === 'packs' || navigation.directory) return <PackBrowser />;
  if (navigation.page === 'pack' && !content.packs.some(pack => pack.id === navigation.packId)) return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('errors.pageNotFound')}</h1><p role="status" className="my-6 text-muted-foreground">{t('library.unavailable')}</p><Button onClick={() => navigation.navigateTo(packsPath(navigation.language))}>{t('navigation.packs')}</Button></main></div>;
  if (!selected) return <Library key={navigation.packId ?? navigation.folder} onChoose={choose} packId={navigation.packId} teens={navigation.folder === 'teens'} />;
  const load = loadedScene.revision === navigation.revision && loadedScene.attempt === attempt ? loadedScene.load : { status: 'loading' } as const;
  const error = load.status === 'error' ? load.error : '';
  if (load.status !== 'ready') return <div className="min-h-dvh bg-paper text-ink"><AppHeader onBack={back} /><main aria-busy={load.status === 'loading'} className="flex min-h-[70dvh] items-center justify-center px-6"><div className="max-w-md text-center"><h1 className="font-display text-3xl font-bold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted-foreground">{error ? t(error, { defaultValue: t('errors.unexpected') }) : t("player.loading")}</p>{error && <><Button onClick={() => setAttempt(n => n + 1)}>{t("player.reload")}</Button>{navigation.draftId && <Button tone="quiet" onClick={() => choose(selected.slug)}>{t("player.startANewDub")}</Button>}</>}</div></main></div>;
  return <Player key={load.value.scene.id + (load.value.draft?.saved.id ?? '')} scene={load.value.scene} slug={selected.slug} notice={selected.notices?.[navigation.language]?.scene} initial={load.value.draft} rememberDraft={navigation.rememberDraft} onBack={back} leaving={navigation.pending} onConfirmLeave={navigation.confirm} onCancelLeave={navigation.cancel} onDirtyChange={navigation.protect} />;
}
