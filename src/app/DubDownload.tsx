import { useTranslation } from 'react-i18next';
import { useEffect, useReducer, useRef } from 'react';
import { exportDub } from '../export-dub';
import type { Scene } from '../scene';
import type { Takes } from '../useDubbing';
import { Button, Icon } from '../shared/ui';
import { buttonVariants } from '../components/ui/button';
import { transitionExport } from '../export-state';

export function DubDownload({ scene, takes, source, active, disabled, onExportingChange }: { scene: Scene; takes: Takes; source?: string; active: boolean; disabled: boolean; onExportingChange: (busy: boolean) => void }) {
  const { t } = useTranslation();
  const [state, send] = useReducer(transitionExport, { status: 'idle' });
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const url = useRef<string | undefined>(undefined);
  const downloadUrl = state.status === 'ready' ? state.url : undefined;
  const exporting = state.status === 'exporting';
  useEffect(() => { onExportingChange(exporting); return () => onExportingChange(false); }, [exporting, onExportingChange]);
  useEffect(() => {
    send({ type: 'RESET' });
    return () => {
      controller.current?.abort(); controller.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = undefined;
    };
  }, [scene, takes, source, active]);

  async function download() {
    if (!active || disabled || !source || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const id = ++operation.current;
    send({ type: 'START', operation: id });
    try {
      const blob = await exportDub(scene, takes, source, abort.signal, percent => {
        if (controller.current === abort && !abort.signal.aborted) send({ type: 'PROGRESS', operation: id, percent });
      });
      if (abort.signal.aborted || controller.current !== abort) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      send({ type: 'READY', operation: id, url: url.current });
    } catch (error) {
      if (!abort.signal.aborted && controller.current === abort) send({ type: 'FAILED', operation: id, error: error instanceof Error ? error.message : "errors.exportFailed" });
    } finally { if (controller.current === abort) controller.current = null; }
  }
  useEffect(() => { if (downloadUrl) link.current?.click(); }, [downloadUrl]);

  return <div className="dub-download">
    {state.status === 'exporting'
      ? <Button tone="quiet" aria-label={t("download.cancelExport")} className="py-1" onClick={() => { controller.current?.abort(); controller.current = null; send({ type: 'RESET' }); }}><span><span className="block">{t("download.cancelExport")} · {state.percent}%</span><span className="block text-xs font-normal">{t("download.keepThisPageOpen")}</span></span></Button>
      : state.status === 'ready'
        ? <a ref={link} href={downloadUrl} download={`parrotbook-${scene.id}.mp4`} className={buttonVariants({ size: 'lg', className: 'min-h-14 gap-3 px-5 py-3 text-lg font-semibold' })}><Icon name="download" />{t("download.downloadAgain")}</a>
        : <Button tone="primary" title={t("download.privacyNotice")} disabled={disabled || !source} onClick={() => void download()}><Icon name="download" />{t("download.downloadVideo")}</Button>}
    {state.status === 'error' ? <p role="alert" className="text-sm text-destructive">{t(state.error, { defaultValue: t('errors.unexpected') })}</p>
      : <p role="status" className="sr-only">{state.status === 'exporting' ? t("download.progress", { percent: state.percent })
        : state.status === 'ready' ? t("download.ready") : t("download.privacyNotice")}</p>}
  </div>;
}
