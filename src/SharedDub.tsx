import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AppHeader } from './app/AppHeader';
import { packsPath } from './app/routes';
import { useLanguage } from './i18n';
import { contentCatalogUrl } from './catalog';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { getShareCapability, removeSharedDub, shareApiConfiguration } from './share-client';

type SharedVideo = { title: string; expiresAt: string; url: string; credits?: { title: string; source: string; attribution: string } };
export function SharedDub({ id }: { id: string }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [video, setVideo] = useState<SharedVideo>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'removed'>('loading');
  const [access, setAccess] = useState<{ apiBase: string; token?: string }>();
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setVideo(undefined); setStatus('loading'); setAccess(undefined); setError(false);
    void (async () => {
      const apiBase = await shareApiConfiguration(abort.signal);
      const token = await getShareCapability(id).catch(() => undefined);
      if (!abort.signal.aborted) setAccess({ apiBase, token });
      const response = await fetch(`${apiBase}/shares/${encodeURIComponent(id)}`, { signal: abort.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json() as SharedVideo;
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(contentCatalogUrl).origin || url.pathname !== `/guest-shares/published/${id}/video.mp4` ||
          typeof data.title !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('Invalid shared video');
      if (data.credits && new URL(data.credits.source).protocol !== 'https:') throw new Error('Invalid source');
      if (!abort.signal.aborted) { setVideo(data); setStatus('ready'); }
    })().catch(() => { if (!abort.signal.aborted) setStatus('error'); });
    return () => abort.abort();
  }, [id, attempt]);
  async function remove() {
    if (!access?.token || removing) return;
    setRemoving(true); setError(false);
    try { await removeSharedDub(access.apiBase, id, access.token); setVideo(undefined); setStatus('removed'); setConfirm(false); }
    catch { setError(true); }
    finally { setRemoving(false); }
  }
  return <div className="min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl font-bold">{video?.title ?? t('share.watchTitle')}</h1>
      {status === 'ready' && video ? <>
        <video key={video.url} src={video.url} controls playsInline preload="metadata" aria-label={video.title} className="my-6 max-h-[70dvh] w-full rounded-xl bg-black" onError={() => setStatus('error')} />
        <p className="my-4 text-sm text-muted-foreground">{t('share.expiredAt', { date: new Date(video.expiresAt).toLocaleString(language) })}</p>
        {video.credits && <div className="my-4 text-sm"><a href={video.credits.source} target="_blank" rel="noreferrer" className="underline">{t('share.source')}: {video.credits.title}</a><p>{video.credits.attribution}</p></div>}
      </> : <p role="status" className="my-6">{t(status === 'loading' ? 'share.loading' : status === 'removed' ? 'share.removed' : 'share.unavailable')}</p>}
      <div className="my-6 flex flex-wrap gap-3">
        {status === 'error' && <Button className="min-h-11" onClick={() => setAttempt(value => value + 1)}>{t('share.refresh')}</Button>}
        {access?.token && status !== 'removed' && <Button className="min-h-11" variant="outline" onClick={() => setConfirm(true)}>{t('share.remove')}</Button>}
        <Link className="inline-flex min-h-11 items-center rounded-lg px-4 underline" to={packsPath(language)}>{t('share.backToPacks')}</Link>
      </div>
      <Dialog open={confirm} onOpenChange={value => { if (!removing) setConfirm(value); }}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>{t('share.confirmRemove')}</DialogTitle>
          <DialogDescription>{t('share.removeDescription')}</DialogDescription>
          {removing && <p role="status">{t('share.removing')}</p>}
          {error && <p role="alert">{t('share.removalError')}</p>}
          <div className="flex flex-wrap gap-3"><Button className="min-h-11" variant="danger" disabled={removing} onClick={() => void remove()}>{t('share.remove')}</Button><Button className="min-h-11" variant="outline" disabled={removing} onClick={() => setConfirm(false)}>{t('player.cancel')}</Button></div>
        </DialogContent>
      </Dialog>
    </main>
  </div>;
}
