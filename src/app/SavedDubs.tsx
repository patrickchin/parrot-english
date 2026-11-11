import { useEffect, useState } from 'react';
import { deleteDub, listDubs, type SavedDub } from '../dub-store';
import { useLanguage } from '../i18n';
import { Button, Icon } from '../shared/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';

export function SavedDubs({ onChoose }: { onChoose: (slug: string, id: string) => void }) {
  const { t, language } = useLanguage();
  const [dubs, setDubs] = useState<SavedDub[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<SavedDub | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let active = true;
    void listDubs().then(rows => { if (active) { setDubs(rows); setError(''); } }, () => { if (active) setError('无法读取本机配音。请重试；现有配音不会被删除。'); });
    return () => { active = false; };
  }, [attempt]);
  async function remove() {
    if (!removing || deleting) return;
    setDeleting(true);
    try { await deleteDub(removing.id); setDubs(rows => rows.filter(row => row.id !== removing.id)); setRemoving(null); setError(''); }
    catch { setError('无法删除这次配音，请重试。'); }
    finally { setDeleting(false); }
  }
  if (!dubs.length && !error) return null;
  return <section aria-labelledby="saved-dubs-heading" className="saved-dubs">
    <h2 id="saved-dubs-heading" className="font-display text-lg font-bold">{t('我的配音')}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t('只保存在此浏览器。清除网站数据会删除配音；重要作品请下载视频备份。')}</p>
    {error && <div className="mt-2"><p role="alert">{t(error)}</p><Button tone="quiet" onClick={() => setAttempt(n => n + 1)}>{t('重试')}</Button></div>}
    <ul className="mt-3 grid gap-2">{dubs.map(dub => <li key={dub.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-card p-2">
      <button className="min-h-14 min-w-0 flex-1 rounded-lg px-2 py-1 text-left focus-visible:outline-3 focus-visible:outline-brand" onClick={() => onChoose(dub.slug, dub.id)} aria-label={t('继续配音：{0}，{1}', t(dub.title), t(dub.roleName))}>
        <span className="block font-semibold">{t(dub.title)} · {t(dub.roleName)}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{t(dub.step === 'result' ? '已完成' : '未完成')} · {t('已录 {0} / {1} 句', dub.recorded, dub.total)} · <time dateTime={new Date(dub.updatedAt).toISOString()}>{new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dub.updatedAt)}</time></span>
      </button>
      <Button tone="quiet" aria-label={t('删除配音：{0}', t(dub.title))} onClick={() => setRemoving(dub)} className="size-11 min-h-11 p-2"><Icon name="trash" /></Button>
    </li>)}</ul>
    <Dialog open={!!removing} onOpenChange={open => { if (!open && !deleting) setRemoving(null); }}><DialogContent>
      <DialogTitle>{t('删除这次配音？')}</DialogTitle>
      <DialogDescription>{t('这次配音的录音和进度会从此浏览器删除，无法找回。其他配音和已下载的视频不会受影响。')}</DialogDescription>
      {error && <p role="alert">{t(error)}</p>}
      <Button tone="danger" disabled={deleting} onClick={() => void remove()}>{t('删除配音')}</Button>
      <Button tone="quiet" disabled={deleting} onClick={() => setRemoving(null)}>{t('保留配音')}</Button>
    </DialogContent></Dialog>
  </section>;
}
