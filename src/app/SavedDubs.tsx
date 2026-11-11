import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { deleteDub, listDubs, type SavedDub } from '../dub-store';
import { useLanguage } from '../i18n';
import { Button, Icon } from '../shared/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { AppHeader } from './AppHeader';
import { libraryPath } from './routes';
import { useSceneNavigation } from './useSceneNavigation';

type ShelfState =
  | { status: 'loading' | 'ready'; dubs: SavedDub[] }
  | { status: 'error'; dubs: SavedDub[]; error: string };
type RemovalState =
  | { status: 'idle' }
  | { status: 'confirming' | 'deleting'; dub: SavedDub }
  | { status: 'error'; dub: SavedDub; error: string };

export function SavedDubs({ onChoose }: { onChoose: (slug: string, id: string) => void }) {
  const { language } = useLanguage();
  const { t } = useTranslation();
  const navigation = useSceneNavigation();
  const [shelf, setShelf] = useState<ShelfState>({ status: 'loading', dubs: [] });
  const { dubs } = shelf;
  const [attempt, setAttempt] = useState(0);
  const [removal, setRemoval] = useState<RemovalState>({ status: 'idle' });
  const deleting = removal.status === 'deleting';
  const reads = useRef(0);
  const deletion = useRef<string | null>(null);
  useEffect(() => {
    const id = ++reads.current;
    setShelf(state => ({ status: 'loading', dubs: state.dubs }));
    void listDubs().then(dubs => { if (id === reads.current) setShelf({ status: 'ready', dubs }); }, () => {
      if (id === reads.current) setShelf(state => ({ status: 'error', dubs: state.dubs, error: "errors.dubsRead" }));
    });
    return () => { reads.current++; };
  }, [attempt]);
  async function remove() {
    if (removal.status === 'idle' || deletion.current) return;
    const dub = removal.dub;
    deletion.current = dub.id;
    setRemoval({ status: 'deleting', dub });
    try {
      await deleteDub(dub.id);
      reads.current++; // A read started before this delete cannot resurrect its row.
      setShelf(state => ({ status: 'ready', dubs: state.dubs.filter(row => row.id !== dub.id) }));
      setRemoval({ status: 'idle' });
    } catch { setRemoval({ status: 'error', dub, error: "errors.dubDelete" }); }
    finally { deletion.current = null; }
  }
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      <section aria-labelledby="saved-dubs-heading" className="saved-dubs">
        <h1 id="saved-dubs-heading" className="font-display text-2xl sm:text-3xl font-bold">{t("navigation.dubs")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dubs.storageNotice")}</p>
        {shelf.status === 'loading' && <p role="status" className="mt-6">{t("dubs.loadingSavedDubs")}</p>}
        {shelf.status === 'ready' && !dubs.length && <div className="mt-6 rounded-xl bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{t("dubs.noDubsYet")}</h2>
          <p className="mt-2 text-muted-foreground">{t("dubs.emptyDescription")}</p>
          <Button className="mt-5" onClick={() => navigation.navigateTo(libraryPath(navigation.folder, language))}>{t("dubs.browseScenes")}<Icon name="arrow" /></Button>
        </div>}
        {shelf.status === 'error' && <div className="mt-2"><p role="alert">{t(shelf.error, { defaultValue: t('errors.unexpected') })}</p><Button tone="quiet" onClick={() => setAttempt(n => n + 1)}>{t("dubs.retry")}</Button></div>}
        {!!dubs.length && <ul className="mt-6 grid gap-2">{dubs.map(dub => <li key={dub.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-card p-2">
          <button className="min-h-14 min-w-0 flex-1 rounded-lg px-2 py-1 text-left focus-visible:outline-3 focus-visible:outline-brand" onClick={() => onChoose(dub.slug, dub.id)} aria-label={t("dubs.continueLabel", { title: t(`scenes.${dub.sceneId}.title`, { defaultValue: dub.title }), role: t(`roles.${dub.roleId}.name`, { defaultValue: dub.roleName }) })}>
            <span className="block font-semibold">{t(`scenes.${dub.sceneId}.title`, { defaultValue: dub.title })} · {t(`roles.${dub.roleId}.name`, { defaultValue: dub.roleName })}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{t(dub.step === 'result' ? "dubs.complete" : "dubs.inProgress")} · {t("dubs.recordedLines", { recorded: dub.recorded, total: dub.total })} · <time dateTime={new Date(dub.updatedAt).toISOString()}>{new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dub.updatedAt)}</time></span>
          </button>
          <Button tone="quiet" aria-label={t("dubs.deleteLabel", { title: t(`scenes.${dub.sceneId}.title`, { defaultValue: dub.title }) })} onClick={() => setRemoval({ status: 'confirming', dub })} className="size-11 min-h-11 p-2"><Icon name="trash" /></Button>
        </li>)}</ul>}
        <Dialog open={removal.status !== 'idle'} onOpenChange={open => { if (!open && !deletion.current) setRemoval({ status: 'idle' }); }}><DialogContent>
          <DialogTitle>{t("dubs.deleteThisDub")}</DialogTitle>
          <DialogDescription>{t("dubs.deleteDescription")}</DialogDescription>
          {removal.status === 'error' && <p role="alert">{t(removal.error, { defaultValue: t('errors.unexpected') })}</p>}
          <Button tone="danger" disabled={deleting} onClick={() => void remove()}>{t("dubs.deleteDub")}</Button>
          <Button tone="quiet" disabled={deleting} onClick={() => setRemoval({ status: 'idle' })}>{t("dubs.keepDub")}</Button>
        </DialogContent></Dialog>
      </section>
    </main>
  </div>;
}
