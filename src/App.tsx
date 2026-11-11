import { useLanguage } from './i18n';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { AppHeader } from './app/AppHeader';
import { DubDownload } from './app/DubDownload';
import { Button, Icon } from './shared/ui';
import { asset, validatePack, type Pack, type Role } from './pack';
import { useDubbing, type Take } from './useDubbing';
import { Library } from './Library';
import { VoiceWaveform } from './VoiceWaveform';
import { PreviewSubtitles } from './PreviewSubtitles';
import { lineWindow } from './line-window';
import { clips } from './catalog';
import { createLesson, lessonTakes, transitionLesson, type LessonEvent, type LessonState } from './lesson-state';
import { useSceneNavigation } from './app/useSceneNavigation';
import { loadDub, type RestoredDub } from './dub-store';
import { useDubAutosave } from './app/useDubAutosave';
import type { LoadState } from './load-state';
import { Button as ControlButton } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function App() {
  const { t } = useLanguage();
  const navigation = useSceneNavigation();
  const [scene, setScene] = useState<{ slug: string; load: LoadState<Pack>; draft?: RestoredDub }>({ slug: '', load: { status: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  const selected = clips.find(c => c.slug === navigation.slug);
  const choose = (slug: string, draftId?: string) => navigation.navigate(slug, draftId);
  const back = () => navigation.navigate('');
  useEffect(() => {
    const abort = new AbortController();
    if (!selected) { setScene({ slug: '', load: { status: 'loading' } }); return; }
    const slug = selected.slug;
    setScene({ slug, load: { status: 'loading' } });
    const base = `/packs/${selected.slug}/`;
    fetch(base + 'pack.json', { signal: abort.signal, cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('片段没能加载成功，请再试一次。'); return r.json(); })
      .then(async data => {
        const pack = validatePack(data, base);
        const draft = navigation.draftId ? await loadDub(navigation.draftId, pack) : undefined;
        if (!abort.signal.aborted) setScene({ slug, load: { status: 'ready', value: pack }, draft });
        else if (draft) Object.values(lessonTakes(draft.lesson.progress)).forEach(take => URL.revokeObjectURL(take.url));
      })
      .catch(e => { if (!abort.signal.aborted) setScene({ slug, load: { status: 'error', error: e instanceof Error ? e.message : '片段加载失败。' } }); });
    return () => abort.abort();
  // Saving an ID into the current URL does not reload the running Player.
  }, [attempt, selected, navigation.revision]);
  if (!selected) return <Library onChoose={choose} folder={navigation.folder} onFolderChange={navigation.chooseFolder} />;
  const load: LoadState<Pack> = scene.slug === selected.slug ? scene.load : { status: 'loading' };
  const error = load.status === 'error' ? load.error : '';
  if (load.status !== 'ready') return <div className="min-h-dvh bg-paper text-ink"><AppHeader onBack={back} /><main className="flex min-h-[70dvh] items-center justify-center px-6"><div className="max-w-md text-center"><h1 className="font-display text-3xl font-extrabold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted-foreground">{error ? t(error) : t("正在准备你的小片场…")}</p>{error && <><Button onClick={() => setAttempt(n => n + 1)}>{t("重新加载")}</Button>{navigation.draftId && <Button tone="quiet" onClick={() => choose(selected.slug)}>{t('开始新的配音')}</Button>}</>}</div></main></div>;
  return <Player key={load.value.id + (scene.draft?.saved.id ?? '')} pack={load.value} slug={selected.slug} initial={scene.draft} rememberDraft={navigation.rememberDraft} onBack={back} leaving={navigation.pending} onConfirmLeave={navigation.confirm} onCancelLeave={navigation.cancel} onDirtyChange={navigation.protect} />;
}

function Player({ pack, slug, initial, rememberDraft, onBack, leaving, onConfirmLeave, onCancelLeave, onDirtyChange }: {
  pack: Pack; slug: string; initial?: RestoredDub; rememberDraft: (id?: string) => void; onBack: () => void; leaving: boolean; onConfirmLeave: () => void; onCancelLeave: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useLanguage();
  const [lesson, send] = useReducer((state: LessonState, event: LessonEvent) => transitionLesson(state, event, pack), initial?.lesson ?? createLesson(pack));
  const { step, roleId, lineIndex, progress } = lesson;
  const practiceRoles = pack.roles.filter(role => role.selectable !== false);
  const takes = useMemo(() => lessonTakes(progress), [progress]);
  const skipped = useMemo(() => new Set(Object.keys(progress).filter(id => progress[id].status === 'skipped')), [progress]);
  // This map owns URL cleanup; lesson.progress is the sole source of take state.
  const takeUrls = useRef(new Map(Object.entries(takes).map(([id, take]) => [id, take.url])));
  const modal = leaving ? 'reset' : lesson.overlay === 'none' ? null : lesson.overlay;
  function setModal(value: 'help' | 'details' | 'reset' | null) {
    if (value) send({ type: 'OPEN_OVERLAY', overlay: value });
    else { if (leaving) onCancelLeave(); send({ type: 'CLOSE_OVERLAY' }); }
  }
  const [videoStatus, setVideoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const videoReady = videoStatus === 'ready';
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [localVideo, setLocalVideo] = useState<string>();
  const [localSource, setLocalSource] = useState<Blob | undefined>(initial?.source);
  const localVideoRef = useRef(localVideo);
  useEffect(() => {
    if (!initial?.source) return;
    const url = URL.createObjectURL(initial.source); localVideoRef.current = url; setLocalVideo(url);
    return () => URL.revokeObjectURL(url);
  }, [initial?.source]);
  const autosave = useDubAutosave(pack, slug, lesson, initial, localSource);
  const source = pack.mode === 'local' ? localVideo ?? (import.meta.env.DEV ? `/content/local-dubbing/${pack.video}` : undefined) : asset(pack, pack.video);
  const video = useRef<HTMLVideoElement>(null);
  const main = useRef<HTMLElement>(null);
  const videoFrame = useRef<HTMLDivElement>(null);
  const rolesLines = pack.lines.filter(line => line.roleId === roleId);
  const line = rolesLines[lineIndex];
  const window = lineWindow(pack, line);
  const role = pack.roles.find(r => r.id === roleId)!;
  const media = useDubbing(video, pack, saveTake);
  const [exporting, setExporting] = useState(false);
  const busy = media.phase !== 'idle';
  const capturing = media.phase === 'recording' || media.phase === 'saving';
  useLayoutEffect(() => {
    const root = main.current!;
    const frame = videoFrame.current!;
    const alignPanel = () => {
      const offset = frame.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.style.setProperty('--video-top', `${Math.max(0, offset)}px`);
    };
    alignPanel();
    let alignmentFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(alignmentFrame);
      alignmentFrame = requestAnimationFrame(alignPanel);
    });
    for (const element of [root, frame.parentElement!, ...frame.parentElement!.children]) observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(alignmentFrame); };
  }, [step]);
  const completed = rolesLines.filter(l => takes[l.id] || skipped.has(l.id)).length;
  const recorded = rolesLines.filter(l => takes[l.id]).length;
  const currentTake = takes[line.id];
  const currentCaption = busy && !capturing ? pack.lines.find(l => media.time >= l.start && media.time < l.end) : undefined;
  const captionId = step === 'result' ? currentCaption?.id : line.id;
  const allDone = completed === rolesLines.length;
  useEffect(() => { onDirtyChange(capturing || autosave.dirty); }, [capturing, autosave.dirty, onDirtyChange]);
  useEffect(() => { if (autosave.status === 'saved' && !autosave.dirty && step !== 'choose' && !leaving) rememberDraft(autosave.id); }, [autosave.status, autosave.dirty, autosave.id, step, leaving, rememberDraft]);

  function saveTake(id: string, take: Take) {
    const previous = takeUrls.current.get(id);
    if (previous) URL.revokeObjectURL(previous);
    takeUrls.current.set(id, take.url);
    send({ type: 'SAVE_TAKE', id, take }); onDirtyChange(true);
  }
  useEffect(() => () => {
    takeUrls.current.forEach(url => URL.revokeObjectURL(url));
    onDirtyChange(false);
  }, [onDirtyChange]);
  useEffect(() => () => { if (localVideoRef.current) URL.revokeObjectURL(localVideoRef.current); }, []);
  useEffect(() => { if (leaving) media.stop(); }, [leaving]);

  function reset() {
    media.stop(); media.setError('');
    takeUrls.current.forEach(url => URL.revokeObjectURL(url)); takeUrls.current.clear();
    autosave.startNew(); rememberDraft();
    send({ type: 'RESET' }); onDirtyChange(false);
    if (video.current) video.current.currentTime = 0;
    if (leaving) onConfirmLeave();
  }
  function openFile(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024 || !/\.(mp4|webm|mov)$/i.test(file.name)) { media.setError('请选择小于 100 MB 的 MP4、WebM 或 MOV 视频。'); return; }
    media.stop(); media.setError(''); setVideoStatus('loading');
    if (localVideoRef.current) URL.revokeObjectURL(localVideoRef.current);
    const url = URL.createObjectURL(file); localVideoRef.current = url; setLocalVideo(url); setLocalSource(file);
  }
  function chooseLine(index: number) { media.stop(); media.setError(''); if (step === 'practice' && index === lineIndex) return; onDirtyChange(true); send({ type: 'CHOOSE_LINE', index }); }
  function nextLine() {
    media.stop(); media.setError('');
    onDirtyChange(true);
    send({ type: 'NEXT' });
    if (lineIndex === rolesLines.length - 1 && video.current) video.current.currentTime = 0;
  }
  function startPractice() { media.stop(); media.setError(''); onDirtyChange(true); send({ type: 'START' }); }

  const graphRecordings = useMemo(() => step === 'result'
    ? pack.lines.flatMap(l => takes[l.id] ? [{ start: takes[l.id].start, peaks: takes[l.id].peaks }] : [])
    : [{ start: capturing ? media.liveStart : currentTake?.start ?? line.start, peaks: capturing ? media.livePeaks : currentTake?.peaks ?? [] }],
  [step, pack.lines, takes, line.start, capturing, media.liveStart, media.livePeaks, currentTake]);

  return <div className="player-shell bg-paper text-ink">
    <AppHeader onHelp={() => { media.stop(); setModal('help'); }} onBack={() => { media.stop(); onBack(); }} />
    <main ref={main} className="player-main" data-step={step}>
      {step === 'practice' && <h1 className="sr-only">{t(pack.title)}</h1>}
      <section aria-label={t("电影片段")} className="player-video" style={{ '--video-aspect': videoAspect } as CSSProperties}>
        <div ref={videoFrame} className="player-frame overflow-hidden rounded-xl border border-border">
          <div className="player-screen relative bg-neutral-900">
            <video ref={video} src={source} poster={pack.poster ? asset(pack, pack.poster) : undefined} crossOrigin="anonymous" playsInline preload="auto" aria-label={t("{0} 对话片段", pack.credit.title)}
              className="absolute inset-0 h-full w-full object-contain"
              onLoadedMetadata={e => { const el = e.currentTarget; if (el.videoWidth && el.videoHeight) setVideoAspect(el.videoWidth / el.videoHeight); }}
              onCanPlay={() => { const duration = video.current?.duration ?? 0; if (pack.mode === 'local' && Math.abs(duration - pack.duration) > 0.7) { setVideoStatus('error'); media.setError('请选择准备好的片段文件，且时长须与参考片段一致。'); } else setVideoStatus('ready'); }}
              onWaiting={() => { if (media.phase === 'preview' || media.phase === 'replay' || media.phase === 'listening' || media.phase === 'recording') media.setError('视频缓冲中，请等一下再试。之前的录音还在。'); }}
              onError={() => { setVideoStatus('error'); media.setError('视频没能加载成功。请检查网络，然后重新加载。'); }} />
            {!source ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white"><p className="text-sm font-bold">{t("从设备载入这段视频")}</p><label className="cursor-pointer rounded-xl bg-paper px-5 py-3 text-sm font-bold text-ink">{t("选择本地片段")}<input aria-label={t("选择本地片段")} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={e => openFile(e.target.files?.[0])} /></label><p className="text-xs text-white/80">{pack.video}{t("· 文件不会上传")}</p></div>
              : !busy && <button onClick={() => step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={step === 'result' ? t("播放我的配音") : t("播放原片")} className="absolute inset-0 flex items-center justify-center text-white focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-lemon disabled:opacity-40"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/75 text-primary-foreground sm:h-17 sm:w-17"><Icon name="play" className="h-7 w-7" /></span></button>}
            {media.phase === 'recording' && <span className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-destructive-foreground"><span className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" />{t("录音中")}</span>}
            {media.phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white" role="status">{t("正在准备…")}</div>}
          </div>
          <div className="player-transport flex items-center gap-2 bg-neutral-900 px-2 text-white sm:px-4">
            <button onClick={() => busy ? media.stop() : step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={busy ? t("停止播放或录音") : step === 'result' ? t("播放配音") : t("播放参考片段")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"><Icon name={busy ? 'stop' : 'play'} /></button>
            <progress aria-label={t("片段播放进度")} max={pack.duration} value={media.time} className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/30 [&::-webkit-progress-value]:bg-coral [&::-moz-progress-bar]:bg-coral" /><span className="shrink-0 font-mono text-xs">{clock(media.time)} / {clock(pack.duration)}</span>
          </div>
        </div>
        {step === 'choose' && <PreviewSubtitles pack={pack} time={media.time} />}
      </section>
      <section aria-label={step === 'choose' ? t("选择角色") : step === 'result' ? t("配音完成") : t("录制台词")} className="player-workspace">
        {step === 'choose' && <div className="player-choose text-center">
          <h1 className="font-display text-2xl font-extrabold">{t(pack.title)}</h1>
          <h2 className="mt-3 text-base font-semibold text-muted-foreground">{t("想成为哪个角色？")}</h2>
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-3">{practiceRoles.map(r => <ControlButton variant="outline" key={r.id} onClick={() => send({ type: 'SELECT_ROLE', roleId: r.id })} aria-pressed={roleId === r.id} className="group h-auto min-h-17 flex-1 basis-50 justify-start gap-3 whitespace-normal px-4 py-3 text-left aria-pressed:border-primary aria-pressed:bg-accent"><RolePortrait pack={pack} role={r} /><span className="flex-1"><span className="block font-bold">{t(r.name)}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t(r.hint)}</span></span><Icon name="check" className="invisible group-aria-pressed:visible" /></ControlButton>)}</div>
          <Button className="mt-5 w-full" disabled={!videoReady || busy} onClick={startPractice}>{t("开始配音")}<Icon name="arrow" /></Button>
        </div>}
        {step !== 'choose' && <>
          <div className="practice-content">
            <div className="practice-meta flex items-center justify-between gap-2 text-sm">
              <span><span className="block font-display font-extrabold">{t(role.name)}</span><span role="status" className="block text-xs text-muted-foreground">{t(autosave.status === 'saved' ? '已保存到本机' : autosave.status === 'saving' ? '正在保存…' : autosave.status === 'error' ? '尚未保存' : '仅在此设备保存')}</span></span><span className="sr-only">{t('已完成 {0} / {1} 句', completed, rolesLines.length)}</span>
              <nav aria-label={t("你的台词")} className="flex justify-center">{rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => chooseLine(i)} aria-label={t("第 {0} 句：{1}", i + 1, l.text)} aria-current={i === lineIndex ? 'step' : undefined} className="flex h-11 min-w-11 items-center justify-center rounded-full text-sm text-muted-foreground aria-[current=step]:bg-brand/10 aria-[current=step]:font-extrabold aria-[current=step]:text-ink focus-visible:outline-3 focus-visible:outline-brand">{takes[l.id] ? <Icon name="check" /> : i + 1}{skipped.has(l.id) && <span className="sr-only">{t("原声")}</span>}</button>)}</nav>
            </div>
            <VoiceWaveform pack={pack} start={step === 'result' ? 0 : window.start} end={step === 'result' ? pack.duration : window.end} target={step === 'result' ? undefined : line} time={media.time} recordings={graphRecordings} recording={media.phase === 'recording'} />
            <p className="sr-only">{t('第 {0} / {1} 句', lineIndex + 1, rolesLines.length)}</p>
            <div className="practice-caption text-center" role="group" aria-label={t('台词')}>
              {pack.lines.map(l => <div key={l.id} aria-hidden={l.id !== captionId} className={l.id === captionId ? undefined : 'invisible'}><p className="text-balance font-medium" lang="en">{l.text}</p><p lang="zh-CN" className="mt-1 text-base text-muted-foreground">{l.hint}</p></div>)}
            </div>
            <p className="sr-only" role="status">{media.phase === 'recording' ? t("正在录音，跟着指针说。") : media.phase === 'saving' ? t("正在整理这次录音…") : currentTake ? t("录音已保存，可听录音或继续下一句。") : t("先听原声，再录音。")}</p>
          </div>
          <div className="player-controls">
            <div className={`practice-actions ${step !== 'practice' ? 'invisible' : ''}`} inert={step !== 'practice'} aria-hidden={step !== 'practice'} role="group" aria-label={t("配音操作")}>
              <Button tone="quiet" aria-label={t("听这一句原声")} disabled={busy || !videoReady} onClick={() => void media.preview(line)}><Icon name="sound" />{t("听原声")}</Button>
              {media.phase === 'recording' ? <Button tone="danger" onClick={media.finish}><Icon name="stop" />{t("停止录音")}</Button> : busy ? <Button tone="quiet" onClick={media.stop}><Icon name="stop" />{capturing || media.phase === 'loading' ? t("取消") : t("停止播放")}</Button> : <Button tone={currentTake ? 'quiet' : 'record'} aria-label={currentTake ? t("重新录这一句") : t("开始录音")} disabled={!videoReady} onClick={() => void media.record(line)}><Icon name="mic" />{currentTake ? t("重录") : t("开始录音")}</Button>}
              <Button tone={currentTake ? 'primary' : 'quiet'} aria-label={t("听我的录音")} disabled={busy || !currentTake} onClick={() => { if (currentTake) void media.listen(currentTake, line); }}><Icon name="play" />{t("听我的录音")}</Button>
              <Button tone={currentTake || skipped.has(line.id) ? 'primary' : 'quiet'} disabled={busy} onClick={nextLine}>{lineIndex === rolesLines.length - 1 && allDone ? t("看我的配音") : t("下一步")}<Icon name="arrow" /></Button>
              <div className="practice-secondary">
                <Button tone="quiet" onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" />{t("重新开始")}</Button>
                {media.phase === 'recording' ? <Button tone="quiet" onClick={media.stop}>{t("取消")}</Button> : <Button tone="quiet" onClick={() => { media.stop(); setModal('details'); }}>{t("片段与来源")}</Button>}
              </div>
            </div>
            <div className={`player-result text-center ${step !== 'result' ? 'invisible' : ''}`} inert={step !== 'result'} aria-hidden={step !== 'result'}>
              <h1 className="text-lg font-semibold">{t("你的配音，完成啦！")}</h1>
              <p className="result-summary text-xs text-muted-foreground">{t('录了 {0} 句台词。', recorded)}{!recorded && t("这一次先听原声，下次试着录一句。")}</p>
              <div className="result-actions">
                <Button tone="quiet" disabled={!videoReady || exporting} onClick={() => busy ? media.stop() : void media.replay(takes)}><Icon name={busy ? 'stop' : 'play'} />{busy ? t("停止播放") : t("播放我的配音")}</Button>
                <Button tone="quiet" disabled={busy || exporting} onClick={() => chooseLine(0)}><Icon name="repeat" />{t("再改一句")}</Button>
              </div>
              <DubDownload pack={pack} takes={takes} source={source} active={step === 'result' && !leaving} disabled={busy || !videoReady || !recorded || autosave.status === 'saving'} onExportingChange={setExporting} />
              <div className="practice-secondary">
                <Button tone="quiet" onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" />{t("重新开始")}</Button>
                <Button tone="quiet" onClick={() => { media.stop(); setModal('details'); }}>{t("片段与来源")}</Button>
              </div>
            </div>
          </div>
        </>}
        {media.error && <div role="alert" className="player-error rounded-xl border border-danger/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive"><p>{t(media.error)}</p>{!videoReady && <button onClick={() => { media.setError(''); setVideoStatus('loading'); video.current?.load(); }} className="mt-2 min-h-11 rounded-lg px-2 font-bold underline">{t("重新加载视频")}</button>}</div>}
        {autosave.status === 'error' && <div className="player-error rounded-xl bg-destructive/10 p-3 text-sm"><p role="alert">{t(autosave.error!)}</p><div className="mt-2 flex flex-wrap items-center gap-3"><Button tone="quiet" onClick={autosave.retry}>{t('重试保存')}</Button><a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-2 underline">{t('在新标签页管理已保存的配音')}</a></div></div>}
      </section>
    </main>
    {step === 'choose' && <footer className="player-footer text-xs text-muted-foreground">
      <button onClick={() => { media.stop(); setModal('details'); }} className="min-h-11 rounded-lg focus-visible:outline-3 focus-visible:outline-brand">{t("片段与来源")}</button>
    </footer>}

    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}>
      <DialogContent showCloseButton={false} className="block max-h-[90dvh] overflow-y-auto p-6 sm:max-w-md">
      {modal === 'help' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t("给电影，换上你的声音。")}</DialogTitle><ol className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground"><li><strong className="text-ink">{t("1. 选角色。")}</strong>{t("先看一遍电影，再选想演的人。")}</li><li><strong className="text-ink">{t("2. 一句一句录。")}</strong>{t("听原声，点录音就开口。说完就点停止。")}</li><li><strong className="text-ink">{t("3. 看你的版本。")}</strong>{t("别的角色保留原声，你的角色换成你的录音。")}</li></ol><p className="mt-5 text-xs leading-6 text-muted-foreground">{t("最好戴上耳机。绿色是原声波形，橙色是你的声音；指针表示当前时间。波形显示声音强弱，不代表发音得分；原声也包含影片的音乐和音效。配音会自动保存在此浏览器，不会上传，可在「我的配音」继续或删除。手机请用 Safari 或 Chrome；微信内录音尚未验证。")}</p><p className="mt-3 text-xs leading-6 text-muted-foreground">{t("当前供你和同事测试。儿童使用前，请由监护人了解并同意录音用途。")}</p><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("知道了")}</Button></>}
      {modal === 'details' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t("片段与来源")}</DialogTitle><div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground"><p>{pack.credit.title}</p><p>{pack.credit.attribution} · <a href={pack.credit.licenceUrl} target="_blank" rel="noreferrer" className="underline">{t(pack.credit.licence)}</a> · <a href={pack.credit.source} target="_blank" rel="noreferrer" className="underline">{t("观看原片")}</a></p><p>{t(pack.credit.changes)}</p><p>{pack.mode === 'local' ? t("此片段从你的设备读取，未上传；公开发布前需确认相应授权。") : t("本片段用于成人原型测试；完整电影并非儿童入门教材。")}{t("创作者未对本产品作出背书。")}</p></div><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("关闭")}</Button></>}
      {modal === 'reset' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t(leaving ? '离开这次配音？' : '重新开始一场？')}</DialogTitle><DialogDescription className="mt-4 text-sm leading-7 text-muted-foreground">{t(autosave.status === 'error' ? '新的改动还没保存。继续会丢失未保存的改动，之前保存的配音仍会保留。' : '这次配音会保留在「我的配音」里，随时可以继续。')}</DialogDescription><Button className="mt-6 w-full" disabled={autosave.status === 'saving'} onClick={() => leaving ? onConfirmLeave() : reset()}>{t(autosave.status === 'error' ? '丢弃未保存的改动' : leaving ? '离开片段' : '开始新的配音')}</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>{t('保留录音，继续玩')}</Button></>}
    </DialogContent>
    </Dialog>
  </div>;
}

function clock(time: number) { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function RolePortrait({ pack, role }: { pack: Pack; role: Role }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  return <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand/10 font-display text-xl font-extrabold text-brand" aria-hidden="true">{role.portrait && !failed ? <img src={asset(pack, role.portrait)} alt="" width={192} height={192} onError={() => setFailed(true)} className="h-full w-full object-cover" /> : t(role.name).slice(0, 1)}</span>;
}
