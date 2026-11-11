import { useEffect, useReducer, useRef } from 'react';
import { exportDub } from '../export-dub';
import type { Pack } from '../pack';
import type { Takes } from '../useDubbing';
import { useLanguage } from '../i18n';
import { Button, Icon } from '../shared/ui';
import { buttonVariants } from '../components/ui/button';
import { transitionExport } from '../export-state';

export function DubDownload({ pack, takes, source, active, disabled, onExportingChange }: { pack: Pack; takes: Takes; source?: string; active: boolean; disabled: boolean; onExportingChange: (busy: boolean) => void }) {
  const { t } = useLanguage();
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
  }, [pack, takes, source, active]);

  async function download() {
    if (!active || disabled || !source || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const id = ++operation.current;
    send({ type: 'START', operation: id });
    try {
      const blob = await exportDub(pack, takes, source, abort.signal, percent => {
        if (controller.current === abort && !abort.signal.aborted) send({ type: 'PROGRESS', operation: id, percent });
      });
      if (abort.signal.aborted || controller.current !== abort) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      send({ type: 'READY', operation: id, url: url.current });
    } catch (error) {
      if (!abort.signal.aborted && controller.current === abort) send({ type: 'FAILED', operation: id, error: error instanceof Error ? error.message : '视频导出失败，请重试。' });
    } finally { if (controller.current === abort) controller.current = null; }
  }
  useEffect(() => { if (downloadUrl) link.current?.click(); }, [downloadUrl]);

  return <div className="dub-download">
    {state.status === 'exporting'
      ? <Button tone="quiet" aria-label={t('取消导出')} className="py-1" onClick={() => { controller.current?.abort(); controller.current = null; send({ type: 'RESET' }); }}><span><span className="block">{t('取消导出')} · {state.percent}%</span><span className="block text-xs font-normal">{t('请保持页面打开')}</span></span></Button>
      : state.status === 'ready'
        ? <a ref={link} href={downloadUrl} download={`parrotbook-${pack.id}.mp4`} className={buttonVariants({ size: 'lg', className: 'min-h-14 gap-3 px-5 py-3 text-lg font-semibold' })}><Icon name="download" />{t('再次下载视频')}</a>
        : <Button tone="primary" title={t('视频在本机生成，不会上传。')} disabled={disabled || !source} onClick={() => void download()}><Icon name="download" />{t('下载配音视频')}</Button>}
    {state.status === 'error' ? <p role="alert" className="text-sm text-destructive">{t(state.error)}</p>
      : <p role="status" className="sr-only">{state.status === 'exporting' ? t('正在生成视频 {0}%，请保持页面打开。', state.percent)
        : state.status === 'ready' ? t('视频已生成，可保存后分享。') : t('视频在本机生成，不会上传。')}</p>}
  </div>;
}
