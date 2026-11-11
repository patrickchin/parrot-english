import { useEffect, useRef, useState } from 'react';
import { exportDub } from '../export-dub';
import type { Pack } from '../pack';
import type { Takes } from '../useDubbing';
import { useLanguage } from '../i18n';
import { Button, Icon } from '../shared/ui';
import { buttonVariants } from '../components/ui/button';

export function DubDownload({ pack, takes, source, active, disabled, onExportingChange }: { pack: Pack; takes: Takes; source?: string; active: boolean; disabled: boolean; onExportingChange: (busy: boolean) => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<'idle' | 'exporting' | 'ready' | 'error'>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const url = useRef<string | undefined>(undefined);
  const [downloadUrl, setDownloadUrl] = useState<string>();
  useEffect(() => { onExportingChange(state === 'exporting'); return () => onExportingChange(false); }, [state, onExportingChange]);
  useEffect(() => {
    setState('idle'); setDownloadUrl(undefined);
    return () => {
      controller.current?.abort(); controller.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = undefined;
    };
  }, [pack, takes, source, active]);

  async function download() {
    if (!active || !source || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setState('exporting'); setPercent(0); setError('');
    try {
      const blob = await exportDub(pack, takes, source, abort.signal, setPercent);
      if (abort.signal.aborted) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      setDownloadUrl(url.current); setState('ready');
    } catch (error) {
      if (!abort.signal.aborted) { setError(error instanceof Error ? error.message : '视频导出失败，请重试。'); setState('error'); }
    } finally { if (controller.current === abort) controller.current = null; }
  }
  useEffect(() => { if (downloadUrl) link.current?.click(); }, [downloadUrl]);

  return <div className="dub-download">
    {state === 'exporting'
      ? <Button tone="quiet" aria-label={t('取消导出')} className="py-1" onClick={() => { controller.current?.abort(); controller.current = null; setState('idle'); }}><span><span className="block">{t('取消导出')} · {percent}%</span><span className="block text-xs font-normal">{t('请保持页面打开')}</span></span></Button>
      : state === 'ready'
        ? <a ref={link} href={downloadUrl} download={`parrotbook-${pack.id}.mp4`} className={buttonVariants({ size: 'lg', className: 'min-h-14 gap-3 px-5 py-3 text-lg font-semibold' })}><Icon name="download" />{t('再次下载视频')}</a>
        : <Button tone="primary" title={t('视频在本机生成，不会上传。')} disabled={disabled || !source} onClick={() => void download()}><Icon name="download" />{t('下载配音视频')}</Button>}
    {state === 'error' ? <p role="alert" className="text-sm text-destructive">{t(error)}</p>
      : <p role="status" className="sr-only">{state === 'exporting' ? t('正在生成视频 {0}%，请保持页面打开。', percent)
        : state === 'ready' ? t('视频已生成，可保存后分享。') : t('视频在本机生成，不会上传。')}</p>}
  </div>;
}
