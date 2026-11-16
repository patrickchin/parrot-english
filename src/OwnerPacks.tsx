import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './app/AppHeader';
import { useContent } from './app/ContentProvider';
import { useSceneNavigation } from './app/useSceneNavigation';
import { packPath, packsPath } from './app/routes';
import { useLanguage } from './i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { listOwnerPacks, manageOwnerPack, ownerApiConfiguration, OwnerUploadError, preparePack, unlockOwner, uploadPack, type ManagedPack, type PreparedPack, type PublishedUpload, type UploadJob } from './owner-upload';

export function OwnerPacks() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const content = useContent();
  const navigation = useSceneNavigation();
  const [apiBase, setApiBase] = useState('');
  const [configuration, setConfiguration] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [key, setKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [prepared, setPrepared] = useState<PreparedPack>();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<OwnerUploadError>();
  const [phase, setPhase] = useState<'ready' | 'uploading' | 'publishing' | 'cancelled' | 'success'>('ready');
  const [progress, setProgress] = useState({ bytes: 0, path: '' });
  const [published, setPublished] = useState<PublishedUpload>();
  const [managed, setManaged] = useState<ManagedPack[]>([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const [managing, setManaging] = useState('');
  const [deleting, setDeleting] = useState<ManagedPack>();
  const operation = useRef<AbortController | undefined>(undefined);
  const management = useRef<AbortController | undefined>(undefined);
  const job = useRef<UploadJob | undefined>(undefined);
  const selection = useRef(0);
  const busy = phase === 'uploading' || phase === 'publishing';
  const bytes = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: value < 1024 * 1024 ? 3 : 1 }).format(value / 1024 / 1024);

  useEffect(() => {
    const abort = new AbortController();
    setConfiguration('loading');
    void ownerApiConfiguration(abort.signal).then(value => { setApiBase(value); setConfiguration('ready'); }).catch(() => {
      if (!abort.signal.aborted) setConfiguration('error');
    });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => () => { operation.current?.abort(); management.current?.abort(); }, []);
  useEffect(() => {
    if (!unlocked) { setManaged([]); return; }
    const abort = new AbortController();
    setListing(true); setListError(false);
    void listOwnerPacks(apiBase, key, abort.signal).then(setManaged).catch(cause => {
      if (abort.signal.aborted) return;
      setListError(true);
      if (cause instanceof OwnerUploadError && cause.code === 'unauthorized') setUnlocked(false);
    }).finally(() => { if (!abort.signal.aborted) setListing(false); });
    return () => abort.abort();
  }, [unlocked, apiBase, key, listRevision]);
  useEffect(() => { navigation.protect(busy); return () => navigation.protect(false); }, [busy, navigation.protect]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) return;
    const abort = new AbortController(); operation.current = abort;
    setUnlocking(true); setError(undefined);
    try { await unlockOwner(apiBase, key.trim(), abort.signal); setKey(key.trim()); setUnlocked(true); }
    catch (cause) { if (!abort.signal.aborted) setError(cause instanceof OwnerUploadError ? cause : new OwnerUploadError('request')); }
    finally { setUnlocking(false); }
  }
  async function choose(files: File[]) {
    const id = ++selection.current;
    setReading(true); setError(undefined); setPrepared(undefined); setPublished(undefined); setPhase('ready');
    job.current = undefined; setProgress({ bytes: 0, path: '' });
    try { const value = await preparePack(files); if (id === selection.current) setPrepared(value); }
    catch (cause) { if (id === selection.current) setError(cause instanceof OwnerUploadError ? cause : new OwnerUploadError('pack')); }
    finally { if (id === selection.current) setReading(false); }
  }
  async function publish() {
    if (!prepared || busy) return;
    const abort = new AbortController(); operation.current = abort;
    setPhase('uploading'); setError(undefined); setPublished(undefined);
    try {
      const result = await uploadPack(apiBase, key, prepared, job.current, abort.signal,
        value => { job.current = value; }, setProgress, () => setPhase('publishing'));
      setPublished(result); setPhase('success'); content.reload(); setListRevision(value => value + 1);
    } catch (cause) {
      if (abort.signal.aborted) setPhase('cancelled');
      else {
        setPhase('ready'); setError(cause instanceof OwnerUploadError ? cause : new OwnerUploadError('request'));
        if (cause instanceof OwnerUploadError && cause.code === 'unauthorized') setUnlocked(false);
      }
    }
  }
  async function manage(pack: ManagedPack, visible?: boolean) {
    if (busy || managing) return;
    const abort = new AbortController(); management.current = abort;
    setManaging(pack.id); setError(undefined);
    try {
      await manageOwnerPack(apiBase, key, pack.id, visible, abort.signal);
      setDeleting(undefined); setListRevision(value => value + 1); content.reload();
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof OwnerUploadError ? cause : new OwnerUploadError('request'));
        setDeleting(undefined);
        if (cause instanceof OwnerUploadError && cause.code === 'unauthorized') setUnlocked(false);
      }
    } finally { setManaging(''); }
  }
  function lock() { setKey(''); setUnlocked(false); setError(undefined); }
  const percentage = prepared?.bytes ? Math.min(100, Math.floor(progress.bytes / prepared.bytes * 100)) : 0;
  const currentIndex = prepared?.files.findIndex(file => file.path === progress.path) ?? -1;
  const currentFile = currentIndex >= 0 ? prepared!.files[currentIndex] : undefined;
  const earlierBytes = prepared?.files.slice(0, Math.max(0, currentIndex)).reduce((total, item) => total + item.file.size, 0) ?? 0;
  const filePercentage = currentFile?.file.size ? Math.min(100, Math.max(0, Math.floor((progress.bytes - earlierBytes) / currentFile.file.size * 100))) : 0;
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main owner-packs">
      <header className="pack-browser-heading">
        <Link className="library-back" to={packsPath(language)}>{t('packs.allPacks')}</Link>
        <h1 className="font-display">{t('owner.title')}</h1>
        <p>{t('owner.introduction')}</p>
      </header>
      {configuration === 'loading' ? <p role="status">{t('owner.connecting')}</p> : configuration === 'error' ? <Card className="owner-panel">
        <p role="alert">{t('owner.errors.configuration')}</p>
        <Button className="h-11" onClick={() => setAttempt(value => value + 1)}>{t('player.reload')}</Button>
      </Card> : <>
        {!unlocked ? <form className="owner-panel owner-unlock" onSubmit={event => void unlock(event)}>
          <h2>{t('owner.unlockTitle')}</h2>
          <p>{t('owner.keyNotice')}</p>
          <label htmlFor="owner-key">{t('owner.accessKey')}</label>
          <Input id="owner-key" name="owner-access-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} disabled={unlocking} required aria-invalid={error?.code === 'unauthorized' || undefined} aria-describedby={error ? 'owner-upload-error' : undefined} className="h-12" />
          <Button type="submit" className="h-12" disabled={unlocking || !key.trim()}>{t(unlocking ? 'owner.unlocking' : 'owner.unlock')}</Button>
        </form> : <section className="owner-panel" aria-labelledby="owner-package-heading">
          <div className="owner-panel-heading"><h2 id="owner-package-heading">{t('owner.packageTitle')}</h2><Button variant="ghost" disabled={busy || !!managing} className="h-11" onClick={lock}>{t('owner.lock')}</Button></div>
          <p>{t('owner.folderNotice')}</p>
          <p className="owner-limits">{t('owner.limits')}</p>
          <label htmlFor="owner-folder">{t('owner.chooseFolder')}</label>
          <Input id="owner-folder" type="file" multiple {...{ webkitdirectory: '' }} disabled={busy || reading} onChange={event => { const files = [...(event.target.files ?? [])]; if (files.length) void choose(files); }} className="owner-file-input" />
          {reading && <p role="status">{t('owner.checking')}</p>}
          {prepared && <>
            <div className="owner-pack-preview">
              <h3 className="font-display">{prepared.pack.title}</h3>
              <p>{prepared.pack.description}</p>
              <dl><div><dt>{t('owner.author')}</dt><dd>{prepared.pack.author}</dd></div><div><dt>{t('owner.contents')}</dt><dd>{t('library.sceneCount', { count: prepared.pack.scenes.length })} · {t('owner.fileCount', { count: prepared.files.length })} · {bytes(prepared.bytes)} MiB</dd></div></dl>
            </div>
            {busy && <div className="owner-upload-progress">
              <p role="status">{phase === 'publishing' ? t('owner.publishing') : t('owner.uploading', { percent: percentage })}</p>
              <progress aria-label={t('owner.uploadProgress')} max={prepared.bytes} value={progress.bytes} />
              {phase === 'uploading' && currentFile && <p className="owner-current-file">{t('owner.fileProgress', { path: progress.path, percent: filePercentage })}</p>}
            </div>}
            {phase === 'cancelled' && <p role="status">{t('owner.cancelled')}</p>}
            {phase !== 'success' && <div className="owner-actions"><Button variant="highlight" className="h-12" disabled={busy || !!managing} onClick={() => void publish()}>{t(job.current ? 'owner.retryUpload' : 'owner.publish')}</Button>{phase === 'uploading' && <Button variant="outline" className="h-12" onClick={() => operation.current?.abort()}>{t('owner.cancel')}</Button>}</div>}
          </>}
          {published && <div className="owner-published"><p role="status">{t('owner.published', { title: published.title })}</p><Link className="owner-pack-link" to={packPath(published.id, language)}>{t('owner.openPublished')}</Link></div>}
        </section>}
        {unlocked && <section className="owner-panel owner-management" aria-labelledby="owner-management-heading">
          <h2 id="owner-management-heading">{t('owner.manageTitle')}</h2>
          {listing ? <p role="status">{t('owner.loadingPacks')}</p> : listError ? <div><p role="alert">{t('owner.listError')}</p><Button className="mt-3 h-11" onClick={() => setListRevision(value => value + 1)}>{t('player.reload')}</Button></div> : managed.length ? <ul className="owner-managed-list">{managed.map(pack => <li key={pack.id}>
            <div><h3>{pack.title}</h3><p>{t('packs.uploadedBy', { uploader: pack.uploader })} · {t('library.sceneCount', { count: pack.sceneCount })}</p><p>{t(pack.visible ? 'owner.visible' : 'owner.hidden')}</p></div>
            <div className="owner-actions"><Button variant="outline" disabled={busy || !!managing} aria-label={t(pack.visible ? 'owner.hidePack' : 'owner.showPack', { title: pack.title })} onClick={() => void manage(pack, !pack.visible)}>{t(pack.visible ? 'owner.hide' : 'owner.show')}</Button><Button variant="ghost" disabled={busy || !!managing} aria-label={t('owner.deletePack', { title: pack.title })} onClick={() => setDeleting(pack)}>{t('owner.delete')}</Button></div>
          </li>)}</ul> : <p>{t('owner.noPacks')}</p>}
          {managing && <p role="status">{t('owner.saving')}</p>}
        </section>}
        {error && <div id="owner-upload-error" role="alert" className="owner-error"><p>{t(`owner.errors.${error.code}`)}</p>{error.detail && <p>{error.detail}</p>}</div>}
      </>}
    </main>
    <Dialog open={navigation.pending} onOpenChange={open => { if (!open) navigation.cancel(); }}>
      <DialogContent showCloseButton={false}><DialogTitle>{t('owner.leaveTitle')}</DialogTitle><DialogDescription>{t(phase === 'publishing' ? 'owner.leavePublishing' : 'owner.leaveUploading')}</DialogDescription><div className="owner-actions"><Button variant="outline" onClick={navigation.cancel}>{t('owner.stay')}</Button><Button onClick={() => { operation.current?.abort(); navigation.confirm(); }}>{t('owner.leave')}</Button></div></DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !managing) setDeleting(undefined); }}>
      <DialogContent showCloseButton={false}><DialogTitle>{t('owner.deleteTitle', { title: deleting?.title })}</DialogTitle><DialogDescription>{t('owner.deleteNotice')}</DialogDescription><div className="owner-actions"><Button variant="outline" disabled={!!managing} onClick={() => setDeleting(undefined)}>{t('owner.keepPack')}</Button><Button variant="danger" disabled={!!managing} onClick={() => { if (deleting) void manage(deleting); }}>{t('owner.delete')}</Button></div></DialogContent>
    </Dialog>
  </div>;
}
