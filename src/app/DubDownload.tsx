import { useTranslation } from 'react-i18next';
import { useEffect, useReducer, useRef, useState } from 'react';
import { exportDub } from '../export-dub';
import type { Scene } from '../scene';
import type { Takes } from '../useDubbing';
import { Button, Icon } from '../shared/ui';
import { buttonVariants } from '../components/ui/button';
import { transitionExport } from '../export-state';
import { useLanguage } from '../i18n';
import { languagePath } from '../locale';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { createSharedDub, shareApiConfiguration, ShareError, type ShareSummary, type ShareTicket } from '../share-client';

export function DubDownload({ scene, takes, source, active, disabled, onExportingChange }: { scene: Scene; takes: Takes; source?: string; active: boolean; disabled: boolean; onExportingChange: (busy: boolean) => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [video, setVideo] = useState<File>();
  const [shareOpen, setShareOpen] = useState(false);
  const [hosting, setHosting] = useState<'creating' | 'uploading' | 'publishing'>();
  const [shared, setShared] = useState<ShareSummary>();
  const [shareError, setShareError] = useState('');
  const [fileShared, setFileShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const shareOperation = useRef<AbortController | null>(null);
  const ticket = useRef<ShareTicket | undefined>(undefined);
  const autoDownload = useRef(false);
  const [state, send] = useReducer(transitionExport, { status: 'idle' });
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const url = useRef<string | undefined>(undefined);
  const downloadUrl = state.status === 'ready' ? state.url : undefined;
  const exporting = state.status === 'exporting' || !!hosting;
  const shareUrl = shared ? new URL(languagePath(`/s/${shared.id}`, language), location.origin).href : '';
  const canShareFile = !!video && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [video] });
  useEffect(() => { onExportingChange(exporting); return () => onExportingChange(false); }, [exporting, onExportingChange]);
  useEffect(() => {
    send({ type: 'RESET' });
    setVideo(undefined); setShareOpen(false); setHosting(undefined); setShared(undefined); setShareError(''); setCopied(false); setFileShared(false); setDownloaded(false); ticket.current = undefined;
    return () => {
      controller.current?.abort(); controller.current = null;
      shareOperation.current?.abort(); shareOperation.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = undefined;
    };
  }, [scene, takes, source, active]);

  async function prepare(download: boolean) {
    if (!active || disabled || !source || controller.current) return;
    const abort = new AbortController(); controller.current = abort; autoDownload.current = download;
    const id = ++operation.current;
    send({ type: 'START', operation: id });
    try {
      const blob = await exportDub(scene, takes, source, abort.signal, percent => {
        if (controller.current === abort && !abort.signal.aborted) send({ type: 'PROGRESS', operation: id, percent });
      });
      if (abort.signal.aborted || controller.current !== abort) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      setVideo(new File([blob], `${scene.title.slice(0, 180).replace(/[\\/]/g, '-')}.mp4`, { type: 'video/mp4' }));
      send({ type: 'READY', operation: id, url: url.current });
    } catch (error) {
      if (!abort.signal.aborted && controller.current === abort) send({ type: 'FAILED', operation: id, error: error instanceof Error ? error.message : "errors.exportFailed" });
    } finally { if (controller.current === abort) controller.current = null; }
  }
  useEffect(() => { if (downloadUrl && autoDownload.current) { autoDownload.current = false; link.current?.click(); } }, [downloadUrl]);

  async function shareFile() {
    if (!video || !canShareFile) return;
    setShareError(''); setFileShared(false);
    try { await navigator.share({ files: [video], title: scene.title }); setFileShared(true); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError('file'); }
  }
  async function host() {
    if (!video || hosting) return;
    const abort = new AbortController(); shareOperation.current = abort;
    setHosting('creating'); setShareError(''); setCopied(false);
    try {
      const apiBase = await shareApiConfiguration(abort.signal);
      const value = await createSharedDub(apiBase, video, { title: scene.credit.title, source: scene.credit.source, attribution: scene.credit.attribution }, abort.signal,
        setHosting, ticket.current, value => { ticket.current = value; });
      if (!abort.signal.aborted) setShared(value);
    } catch (error) { if (!abort.signal.aborted) setShareError(error instanceof ShareError ? error.code : 'request'); }
    finally { if (shareOperation.current === abort) { shareOperation.current = null; setHosting(undefined); } }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setShareError(''); }
    catch { setShareError('clipboard'); }
  }

  return <div className="dub-download">
    {state.status === 'exporting'
      ? <Button tone="quiet" aria-label={t("download.cancelExport")} className="py-1" onClick={() => { controller.current?.abort(); controller.current = null; send({ type: 'RESET' }); }}><span><span className="block">{t("download.cancelExport")} · {state.percent}%</span><span className="block text-xs font-normal">{t("download.keepThisPageOpen")}</span></span></Button>
      : state.status === 'ready'
        ? <a ref={link} href={downloadUrl} download={`parrotbook-${scene.id}.mp4`} onClick={() => setDownloaded(true)} className={buttonVariants({ size: 'lg', className: 'min-h-14 gap-3 px-5 py-3 text-lg font-semibold' })}><Icon name="download" />{t(downloaded ? 'download.downloadAgain' : 'download.downloadVideo')}</a>
        : <Button tone="primary" title={t("download.privacyNotice")} disabled={disabled || !source} onClick={() => void prepare(true)}><Icon name="download" />{t("download.downloadVideo")}</Button>}
    {active && state.status !== 'exporting' && state.status !== 'ready' && <Button tone="quiet" disabled={disabled || !source} onClick={() => void prepare(false)}>{t('share.prepare')}</Button>}
    {active && state.status === 'ready' && <div className="dub-share-actions">
      {canShareFile && <Button tone="quiet" disabled={disabled || !!hosting} onClick={() => void shareFile()}>{t('share.file')}</Button>}
      <Button tone="quiet" disabled={disabled || !!hosting} onClick={() => { setShareOpen(true); setShareError(''); }}>{t(shared ? 'share.viewLink' : 'share.createLink')}</Button>
      {!canShareFile && <p className="dub-share-note">{t('share.fileUnavailable')}</p>}
      {fileShared && <p role="status" className="dub-share-note">{t('share.fileShared')}</p>}
    </div>}
    {shareError === 'file' && <p role="alert" className="text-sm text-destructive">{t('share.errors.file')}</p>}
    {state.status === 'error' ? <p role="alert" className="text-sm text-destructive">{t(state.error, { defaultValue: t('errors.unexpected') })}</p>
      : <p role="status" className="sr-only">{state.status === 'exporting' ? t("download.progress", { percent: state.percent })
        : state.status === 'ready' ? t("download.ready") : t("download.privacyNotice")}</p>}
    <Dialog open={shareOpen} onOpenChange={open => { if (!hosting) setShareOpen(open); }}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>{t(shared ? 'share.linkReady' : 'share.createLink')}</DialogTitle>
        <DialogDescription>{t(shared ? 'share.linkNotice' : 'share.consent')}</DialogDescription>
        {shared ? <div className="dub-share-link">
          <label htmlFor={`share-link-${scene.id}`}>{t('share.linkLabel')}</label>
          <Input id={`share-link-${scene.id}`} readOnly className="h-12" value={shareUrl} onFocus={event => event.target.select()} />
          <p>{t('share.expires', { date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(shared.expiresAt)) })}</p>
          <p>{t('share.removalNotice')}</p>
          <div className="flex flex-wrap gap-3"><Button tone="quiet" onClick={() => void copyLink()}>{t(copied ? 'share.copied' : 'share.copyLink')}</Button><a href={shareUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', className: 'h-auto min-h-13 px-5 py-3' })}>{t('share.openLink')}</a><Button tone="quiet" onClick={() => setShareOpen(false)}>{t('player.close')}</Button></div>
          {copied && <p role="status">{t('share.copied')}</p>}
        </div> : <>
          <p className="dub-share-note">{t('share.removalNotice')}</p>
          {hosting && <p role="status">{t(`share.${hosting}`)}</p>}
          <div className="flex flex-wrap gap-3"><Button tone="quiet" onClick={() => { shareOperation.current?.abort(); if (!hosting) setShareOpen(false); }}>{t(hosting ? 'share.cancelUpload' : 'share.cancel')}</Button><Button disabled={!!hosting} onClick={() => void host()}>{t(ticket.current ? 'share.retry' : 'share.upload')}</Button></div>
        </>}
        {shareError && shareError !== 'file' && <p role="alert" className="text-sm text-destructive">{t(`share.errors.${shareError}`)}</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
