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
  const { t, language } = useLanguage();
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
      if (id === reads.current) setShelf(state => ({ status: 'error', dubs: state.dubs, error: '无法读取本机配音。请重试；现有配音不会被删除。' }));
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
    } catch { setRemoval({ status: 'error', dub, error: '无法删除这次配音，请重试。' }); }
    finally { deletion.current = null; }
  }
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      <section aria-labelledby="saved-dubs-heading" className="saved-dubs">
        <h1 id="saved-dubs-heading" className="font-display text-2xl sm:text-3xl font-bold">{t('我的配音')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('只保存在此浏览器。清除网站数据会删除配音；重要作品请下载视频备份。')}</p>
        {shelf.status === 'loading' && <p role="status" className="mt-6">{t('正在读取本机配音…')}</p>}
        {shelf.status === 'ready' && !dubs.length && <div className="mt-6 rounded-xl bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{t('还没有配音')}</h2>
          <p className="mt-2 text-muted-foreground">{t('选一个片段，录下你的第一句台词。')}</p>
          <Button className="mt-5" onClick={() => navigation.navigateTo(libraryPath(navigation.folder))}>{t('去选片段')}<Icon name="arrow" /></Button>
        </div>}
        {shelf.status === 'error' && <div className="mt-2"><p role="alert">{t(shelf.error)}</p><Button tone="quiet" onClick={() => setAttempt(n => n + 1)}>{t('重试')}</Button></div>}
        {!!dubs.length && <ul className="mt-6 grid gap-2">{dubs.map(dub => <li key={dub.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-card p-2">
          <button className="min-h-14 min-w-0 flex-1 rounded-lg px-2 py-1 text-left focus-visible:outline-3 focus-visible:outline-brand" onClick={() => onChoose(dub.slug, dub.id)} aria-label={t('继续配音：{0}，{1}', t(dub.title), t(dub.roleName))}>
            <span className="block font-semibold">{t(dub.title)} · {t(dub.roleName)}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{t(dub.step === 'result' ? '已完成' : '未完成')} · {t('已录 {0} / {1} 句', dub.recorded, dub.total)} · <time dateTime={new Date(dub.updatedAt).toISOString()}>{new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dub.updatedAt)}</time></span>
          </button>
          <Button tone="quiet" aria-label={t('删除配音：{0}', t(dub.title))} onClick={() => setRemoval({ status: 'confirming', dub })} className="size-11 min-h-11 p-2"><Icon name="trash" /></Button>
        </li>)}</ul>}
        <Dialog open={removal.status !== 'idle'} onOpenChange={open => { if (!open && !deletion.current) setRemoval({ status: 'idle' }); }}><DialogContent>
          <DialogTitle>{t('删除这次配音？')}</DialogTitle>
          <DialogDescription>{t('这次配音的录音和进度会从此浏览器删除，无法找回。其他配音和已下载的视频不会受影响。')}</DialogDescription>
          {removal.status === 'error' && <p role="alert">{t(removal.error)}</p>}
          <Button tone="danger" disabled={deleting} onClick={() => void remove()}>{t('删除配音')}</Button>
          <Button tone="quiet" disabled={deleting} onClick={() => setRemoval({ status: 'idle' })}>{t('保留配音')}</Button>
        </DialogContent></Dialog>
      </section>
    </main>
  </div>;
}
