import { useTranslation } from 'react-i18next';
import { useLanguage } from './i18n';
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { AppHeader } from './app/AppHeader';
import { DubDownload } from './app/DubDownload';
import { Button, Icon } from './shared/ui';
import { asset, type Scene, type Role } from './scene';
import { loadScene } from './content-pack';
import { useDubbing, type Take } from './useDubbing';
import { Library } from './Library';
import { SavedDubs } from './app/SavedDubs';
import { dubsPath } from './app/routes';
import { VoiceWaveform } from './VoiceWaveform';
import { PreviewSubtitles } from './PreviewSubtitles';
import { lineWindow } from './line-window';
import { useContent } from './app/ContentProvider';
import { createLesson, lessonTakes, transitionLesson, type LessonEvent, type LessonState } from './lesson-state';
import { useSceneNavigation } from './app/useSceneNavigation';
import { loadDub, type RestoredDub } from './dub-store';
import { useDubAutosave } from './app/useDubAutosave';
import type { LoadState } from './load-state';
import { Button as ControlButton } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function App() {
  const { t } = useTranslation();
  const content = useContent();
  const { clips } = content;
  const navigation = useSceneNavigation();
  const [loadedScene, setLoadedScene] = useState<{ revision: number; attempt: number; load: LoadState<{ scene: Scene; draft?: RestoredDub }> }>({ revision: -1, attempt: 0, load: { status: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  const selected = clips.find(c => c.slug === navigation.slug);
  const choose = (slug: string, draftId?: string) => navigation.navigate(slug, draftId);
  const back = () => navigation.navigate('');
  useEffect(() => {
    const abort = new AbortController();
    const request = { revision: navigation.revision, attempt };
    setLoadedScene({ ...request, load: { status: 'loading' } });
    if (!selected) return;
    loadScene(selected, abort.signal)
      .then(async scene => {
        const draft = navigation.draftId ? await loadDub(navigation.draftId, scene) : undefined;
        if (!abort.signal.aborted) setLoadedScene({ ...request, load: { status: 'ready', value: { scene, draft } } });
      })
      .catch(e => { if (!abort.signal.aborted) setLoadedScene({ ...request, load: { status: 'error', error: e instanceof Error ? e.message : "errors.sceneLoadFailed" } }); });
    return () => abort.abort();
  // Saving an ID into the current URL does not reload the running Player.
  }, [attempt, selected, navigation.revision]);
  if (navigation.page === 'not-found') return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('errors.pageNotFound')}</h1><Button onClick={back}>{t('navigation.library')}</Button></main></div>;
  if (navigation.page === 'dubs') return <SavedDubs onChoose={choose} />;
  if (content.state.status !== 'ready') return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main aria-busy={content.state.status === 'loading'} className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('navigation.library')}</h1><p role={content.state.status === 'error' ? 'alert' : 'status'} className="my-6 text-muted-foreground">{t(content.state.status === 'error' ? 'errors.contentLoad' : 'library.loading')}</p>{content.state.status === 'error' && <Button onClick={content.reload}>{t('player.reload')}</Button>}</main></div>;
  if (navigation.page === 'scene' && !selected) return <div className="min-h-dvh bg-paper text-ink"><AppHeader /><main className="mx-auto max-w-md px-6 py-16 text-center"><h1 className="mb-6 font-display text-3xl font-bold">{t('errors.pageNotFound')}</h1><p role="status" className="my-6 text-muted-foreground">{t('library.unavailable')}</p><Button onClick={back}>{t('navigation.library')}</Button></main></div>;
  if (!selected) return <Library onChoose={choose} folder={navigation.folder} onFolderChange={navigation.chooseFolder} />;
  const load = loadedScene.revision === navigation.revision && loadedScene.attempt === attempt ? loadedScene.load : { status: 'loading' } as const;
  const error = load.status === 'error' ? load.error : '';
  if (load.status !== 'ready') return <div className="min-h-dvh bg-paper text-ink"><AppHeader onBack={back} /><main aria-busy={load.status === 'loading'} className="flex min-h-[70dvh] items-center justify-center px-6"><div className="max-w-md text-center"><h1 className="font-display text-3xl font-bold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted-foreground">{error ? t(error, { defaultValue: t('errors.unexpected') }) : t("player.loading")}</p>{error && <><Button onClick={() => setAttempt(n => n + 1)}>{t("player.reload")}</Button>{navigation.draftId && <Button tone="quiet" onClick={() => choose(selected.slug)}>{t("player.startANewDub")}</Button>}</>}</div></main></div>;
  return <Player key={load.value.scene.id + (load.value.draft?.saved.id ?? '')} scene={load.value.scene} slug={selected.slug} notice={selected.notices?.[navigation.language]?.scene} initial={load.value.draft} rememberDraft={navigation.rememberDraft} onBack={back} leaving={navigation.pending} onConfirmLeave={navigation.confirm} onCancelLeave={navigation.cancel} onDirtyChange={navigation.protect} />;
}

function Player({ scene, slug, notice, initial, rememberDraft, onBack, leaving, onConfirmLeave, onCancelLeave, onDirtyChange }: {
  scene: Scene; slug: string; notice?: string; initial?: RestoredDub; rememberDraft: (id?: string) => void; onBack: () => void; leaving: boolean; onConfirmLeave: () => void; onCancelLeave: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [lesson, send] = useReducer((state: LessonState, event: LessonEvent) => transitionLesson(state, event, scene), initial?.lesson ?? createLesson(scene));
  const { step, roleId, lineIndex, progress } = lesson;
  const practiceRoles = scene.roles.filter(role => role.selectable !== false);
  const takes = useMemo(() => lessonTakes(progress), [progress]);
  const skipped = useMemo(() => new Set(Object.keys(progress).filter(id => progress[id].status === 'skipped')), [progress]);
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
  useEffect(() => {
    if (!localSource) return;
    const url = URL.createObjectURL(localSource); setLocalVideo(url);
    return () => URL.revokeObjectURL(url);
  }, [localSource]);
  const autosave = useDubAutosave(scene, slug, lesson, initial, localSource);
  const source = scene.mode === 'local' ? localVideo : asset(scene, scene.video);
  const video = useRef<HTMLVideoElement>(null);
  const rolesLines = scene.lines.filter(line => line.roleId === roleId);
  const line = rolesLines[lineIndex];
  const window = lineWindow(scene, line);
  const role = scene.roles.find(r => r.id === roleId)!;
  const media = useDubbing(video, scene, saveTake);
  const [exporting, setExporting] = useState(false);
  const busy = media.phase !== 'idle';
  const capturing = media.phase === 'recording' || media.phase === 'saving';
  const completed = rolesLines.filter(l => takes[l.id] || skipped.has(l.id)).length;
  const recorded = rolesLines.filter(l => takes[l.id]).length;
  const currentTake = takes[line.id];
  const currentCaption = busy && !capturing ? scene.lines.find(l => media.time >= l.start && media.time < l.end) : undefined;
  const captionId = step === 'result' ? currentCaption?.id : line.id;
  const allDone = completed === rolesLines.length;
  useEffect(() => { onDirtyChange(capturing || autosave.dirty); }, [capturing, autosave.dirty, onDirtyChange]);
  useEffect(() => { if (autosave.status === 'saved' && !autosave.dirty && step !== 'choose' && !leaving) rememberDraft(autosave.id); }, [autosave.status, autosave.dirty, autosave.id, step, leaving, rememberDraft]);

  function saveTake(id: string, take: Take) {
    send({ type: 'SAVE_TAKE', id, take }); onDirtyChange(true);
  }
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { if (leaving) media.stop(); }, [leaving]);

  function reset() {
    media.stop(); media.setError('');
    autosave.startNew(); rememberDraft();
    send({ type: 'RESET' }); onDirtyChange(false);
    if (video.current) video.current.currentTime = 0;
  }
  function openFile(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024 || !/\.(mp4|webm|mov)$/i.test(file.name)) { media.setError("errors.invalidVideoFile"); return; }
    media.stop(); media.setError(''); setVideoStatus('loading');
    setLocalSource(file);
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
    ? scene.lines.flatMap(l => takes[l.id] ? [{ start: takes[l.id].start, peaks: takes[l.id].peaks }] : [])
    : [{ start: capturing ? media.liveStart : currentTake?.start ?? line.start, peaks: capturing ? media.livePeaks : currentTake?.peaks ?? [] }],
  [step, scene.lines, takes, line.start, capturing, media.liveStart, media.livePeaks, currentTake]);

  return <div className="player-shell bg-paper text-ink">
    <AppHeader onHelp={() => { media.stop(); setModal('help'); }} onBack={() => { media.stop(); onBack(); }} />
    <main className="player-main" data-step={step}>
      {step === 'practice' && <h1 className="sr-only">{t(`content:scenes.${scene.id}.title`, { defaultValue: scene.title })}</h1>}
      <section aria-label={t("player.movieScene")} className="player-video" style={{ '--video-aspect': videoAspect } as CSSProperties}>
        <div className="player-frame overflow-hidden rounded-xl">
          <div className="player-screen relative">
            <video ref={video} src={source} poster={scene.poster ? asset(scene, scene.poster) : undefined} crossOrigin="anonymous" playsInline preload="auto" aria-label={t("player.dialogueScene", { title: scene.credit.title })}
              className="player-picture"
              onLoadedMetadata={e => { const el = e.currentTarget; if (el.videoWidth && el.videoHeight) setVideoAspect(el.videoWidth / el.videoHeight); }}
              onCanPlay={() => { const duration = video.current?.duration ?? 0; if (scene.mode === 'local' && Math.abs(duration - scene.duration) > 0.7) { setVideoStatus('error'); media.setError("errors.videoDuration"); } else setVideoStatus('ready'); }}
              onWaiting={() => { if (media.phase === 'preview' || media.phase === 'replay' || media.phase === 'listening' || media.phase === 'recording') media.setError("errors.videoBuffering"); }}
              onError={() => { setVideoStatus('error'); media.setError("errors.videoLoad"); }} />
            {!source ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white"><p className="text-sm font-bold">{t("player.loadTheVideoFromYourDevice")}</p><label className="cursor-pointer rounded-xl bg-paper px-5 py-3 text-sm font-bold text-ink">{t("player.chooseALocalVideo")}<input aria-label={t("player.chooseALocalVideo")} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={e => openFile(e.target.files?.[0])} /></label><p className="text-xs text-white/80">{scene.video}{t("player.fileStaysOnYourDevice")}</p></div>
              : !busy && <button onClick={() => step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={step === 'result' ? t("player.playMyDub") : t("player.playOriginalScene")} className="absolute inset-0 flex items-center justify-center text-white focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-lemon disabled:opacity-40"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/75 text-primary-foreground sm:h-17 sm:w-17"><Icon name="play" className="h-7 w-7" /></span></button>}
            {media.phase === 'recording' && <span className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-destructive-foreground"><span className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" />{t("player.recording")}</span>}
            {media.phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white" role="status">{t("player.gettingReady")}</div>}
          </div>
          <div className="player-transport flex items-center gap-2 bg-neutral-900 px-2 text-white sm:px-4">
            <button onClick={() => busy ? media.stop() : step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={busy ? t("player.stopPlaybackOrRecording") : step === 'result' ? t("player.playDub") : t("player.playReferenceScene")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"><Icon name={busy ? 'stop' : 'play'} /></button>
            <progress aria-label={t("player.scenePlaybackProgress")} max={scene.duration} value={media.time} className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/30 [&::-webkit-progress-value]:bg-coral [&::-moz-progress-bar]:bg-coral" /><span className="shrink-0 font-mono text-xs">{clock(media.time)} / {clock(scene.duration)}</span>
          </div>
        </div>
        {step === 'choose' && <PreviewSubtitles scene={scene} time={media.time} />}
      </section>
      <section aria-label={step === 'choose' ? t("player.chooseARole") : step === 'result' ? t("player.dubComplete") : t("player.recordYourLines")} className="player-workspace">
        {step === 'choose' && <div className="player-choose text-center">
          <h1 className="font-display text-2xl font-bold">{t(`content:scenes.${scene.id}.title`, { defaultValue: scene.title })}</h1>
          <h2 className="mt-3 text-base font-semibold text-muted-foreground">{t("player.chooseRolePrompt")}</h2>
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-3">{practiceRoles.map(r => <ControlButton variant="outline" key={r.id} onClick={() => send({ type: 'SELECT_ROLE', roleId: r.id })} aria-pressed={roleId === r.id} className="group h-auto min-h-17 flex-1 basis-50 justify-start gap-3 whitespace-normal px-4 py-3 text-left aria-pressed:border-primary aria-pressed:bg-accent"><RolePortrait scene={scene} role={r} /><span className="flex-1 font-bold">{t(`content:roles.${r.id}.name`, { defaultValue: r.name })}</span><Icon name="check" className="invisible group-aria-pressed:visible" /></ControlButton>)}</div>
          <Button className="mt-5 w-full" disabled={!videoReady || busy} onClick={startPractice}>{t("player.startDubbing")}<Icon name="arrow" /></Button>
        </div>}
        {step !== 'choose' && <>
          <div className="practice-content">
            <div className="practice-meta flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><span className="block font-display font-bold">{t(`content:roles.${role.id}.name`, { defaultValue: role.name })}</span><span role="status" className="block text-xs text-muted-foreground">{t(autosave.status === 'saved' ? "player.savedOnThisDevice" : autosave.status === 'saving' ? "player.saving" : autosave.status === 'error' ? "player.notSavedYet" : "player.savedOnThisDeviceOnly")}</span></span><span className="sr-only">{t("recording.completedLines", { completed, total: rolesLines.length })}</span>
              <nav aria-label={t("player.yourLines")} className="line-picker flex flex-wrap items-center gap-1">
                <span className="line-picker-label mr-1 font-semibold">{t("player.chooseALine")}</span>
                {rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => chooseLine(i)} aria-label={t("recording.lineLabel", { number: i + 1, text: l.text })} aria-current={i === lineIndex ? 'step' : undefined} className="relative flex h-11 min-w-11 items-center justify-center rounded-full bg-secondary text-sm text-ink aria-[current=step]:bg-brand/10 aria-[current=step]:font-extrabold aria-[current=step]:ring-2 aria-[current=step]:ring-brand focus-visible:outline-3 focus-visible:outline-brand disabled:opacity-50">{i + 1}{takes[l.id] && <Icon name="check" className="absolute right-0 bottom-0 size-3 rounded-full bg-card" />}{skipped.has(l.id) && <span className="sr-only">{t("player.original")}</span>}</button>)}
              </nav>
            </div>
            <VoiceWaveform scene={scene} start={step === 'result' ? 0 : window.start} end={step === 'result' ? scene.duration : window.end} target={step === 'result' ? undefined : line} time={media.time} recordings={graphRecordings} recording={media.phase === 'recording'} />
            <p className="sr-only">{t("recording.lineNumber", { number: lineIndex + 1, total: rolesLines.length })}</p>
            <div className="practice-caption text-center" role="group" aria-label={t("player.dialogue")}>
              {scene.lines.map(l => <div key={l.id} aria-hidden={l.id !== captionId} className={l.id === captionId ? undefined : 'invisible'}><p className="text-balance font-medium" lang="en">{l.text}</p><p lang="zh-CN" className="mt-1 text-base text-muted-foreground">{l.hint}</p></div>)}
            </div>
            <p className="sr-only" role="status">{media.phase === 'recording' ? t("recording.speakingGuidance") : media.phase === 'saving' ? t("player.preparingYourRecording") : currentTake ? t("recording.takeReady") : t("recording.listenFirst")}</p>
          </div>
          <div className="player-controls">
            <div className={`practice-actions ${step !== 'practice' ? 'invisible' : ''}`} inert={step !== 'practice'} aria-hidden={step !== 'practice'} role="group" aria-label={t("player.dubbingControls")}>
              <Button tone="quiet" aria-label={t("player.listenToTheOriginalLine")} disabled={busy || !videoReady} onClick={() => void media.preview(line)}><Icon name="sound" />{t("recording.listenOriginal")}</Button>
              {media.phase === 'recording' ? <Button tone="danger" onClick={media.finish}><Icon name="stop" />{t("player.stopRecording")}</Button> : busy ? <Button tone="quiet" onClick={media.stop}><Icon name="stop" />{capturing || media.phase === 'loading' ? t("player.cancel") : t("player.stopPlayback")}</Button> : <Button tone={currentTake ? 'quiet' : 'record'} aria-label={currentTake ? t("player.recordThisLineAgain") : t("player.record")} disabled={!videoReady} onClick={() => void media.record(line)}><Icon name="mic" />{currentTake ? t("player.recordAgain") : t("player.record")}</Button>}
              <Button tone={currentTake ? 'primary' : 'quiet'} aria-label={t("player.myRecording")} disabled={busy || !currentTake} onClick={() => { if (currentTake) void media.listen(currentTake, line); }}><Icon name="play" />{t("player.myRecording")}</Button>
              <div className="practice-navigation">
                <Button tone="quiet" aria-label={t("player.previousLine")} title={t("player.previousLine")} disabled={busy || lineIndex === 0} onClick={() => chooseLine(lineIndex - 1)}><Icon name="back" /></Button>
                <Button tone={currentTake || skipped.has(line.id) ? 'primary' : 'quiet'} disabled={busy} onClick={nextLine}>{lineIndex === rolesLines.length - 1 && allDone ? t("player.watchMyDub") : t("player.next")}<Icon name="arrow" /></Button>
              </div>
              <div className="practice-secondary">
                <Button tone="quiet" onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" />{t("player.startOver")}</Button>
                {media.phase === 'recording' ? <Button tone="quiet" onClick={media.stop}>{t("player.cancel")}</Button> : <Button tone="quiet" onClick={() => { media.stop(); setModal('details'); }}>{t("player.sceneCredits")}</Button>}
              </div>
            </div>
            <div className={`player-result text-center ${step !== 'result' ? 'invisible' : ''}`} inert={step !== 'result'} aria-hidden={step !== 'result'}>
              <h1 className="text-lg font-semibold">{t("player.resultTitle")}</h1>
              <p className="result-summary text-xs text-muted-foreground">{t("recording.recordedLines", { count: recorded })}{!recorded && t("player.emptyResult")}</p>
              <div className="result-actions">
                <Button tone="quiet" disabled={!videoReady || exporting} onClick={() => busy ? media.stop() : void media.replay(takes)}><Icon name={busy ? 'stop' : 'play'} />{busy ? t("player.stopPlayback") : t("player.playMyDub")}</Button>
                <Button tone="quiet" disabled={busy || exporting} onClick={() => chooseLine(0)}><Icon name="repeat" />{t("player.editALine")}</Button>
              </div>
              <DubDownload scene={scene} takes={takes} source={source} active={step === 'result' && !leaving} disabled={busy || !videoReady || !recorded || autosave.status === 'saving'} onExportingChange={setExporting} />
              <div className="practice-secondary">
                <Button tone="quiet" onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" />{t("player.startOver")}</Button>
                <Button tone="quiet" onClick={() => { media.stop(); setModal('details'); }}>{t("player.sceneCredits")}</Button>
              </div>
            </div>
          </div>
        </>}
        {media.error && <div role="alert" className="player-error rounded-xl border border-danger/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive"><p>{t(media.error, { defaultValue: t('errors.unexpected') })}</p>{!videoReady && <button onClick={() => { media.setError(''); setVideoStatus('loading'); video.current?.load(); }} className="mt-2 min-h-11 rounded-lg px-2 font-bold underline">{t("player.reloadVideo")}</button>}</div>}
        {autosave.status === 'error' && <div className="player-error rounded-xl bg-destructive/10 p-3 text-sm"><p role="alert">{t(autosave.error!, { defaultValue: t('errors.unexpected') })}</p><div className="mt-2 flex flex-wrap items-center gap-3"><Button tone="quiet" onClick={autosave.retry}>{t("player.retrySaving")}</Button><a href={dubsPath(language)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-2 underline">{t("player.manageSavedDubsInANewTab")}</a></div></div>}
      </section>
    </main>
    {step === 'choose' && <footer className="player-footer text-xs text-muted-foreground">
      <button onClick={() => { media.stop(); setModal('details'); }} className="min-h-11 rounded-lg focus-visible:outline-3 focus-visible:outline-brand">{t("player.sceneCredits")}</button>
    </footer>}

    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}>
      <DialogContent showCloseButton={false} className="block max-h-[90dvh] overflow-y-auto p-6 sm:max-w-md">
      {modal === 'help' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t("help.title")}</DialogTitle><ol className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground"><li><strong className="text-ink">{t("help.chooseRoleTitle")}</strong>{t("help.chooseRoleDescription")}</li><li><strong className="text-ink">{t("help.recordTitle")}</strong>{t("help.recordDescription")}</li><li><strong className="text-ink">{t("help.watchTitle")}</strong>{t("help.watchDescription")}</li></ol><p className="mt-5 text-xs leading-6 text-muted-foreground">{t("help.recordingAdvice")}</p><p className="mt-3 text-xs leading-6 text-muted-foreground">{t("help.guardianConsent")}</p><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("player.gotIt")}</Button></>}
      {modal === 'details' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t("player.sceneCredits")}</DialogTitle><div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground"><p>{scene.credit.title}</p><p>{scene.credit.attribution} · <a href={scene.credit.licenceUrl} target="_blank" rel="noreferrer" className="underline">{t(`content:scenes.${scene.id}.licence`, { defaultValue: scene.credit.licence })}</a> · <a href={scene.credit.source} target="_blank" rel="noreferrer" className="underline">{t("player.watchTheOriginal")}</a></p><p>{t(`content:scenes.${scene.id}.changes`, { defaultValue: scene.credit.changes })}</p>{scene.mode === 'local' && <p>{t("credits.localVideoNotice")}</p>}{notice && <p>{notice}</p>}</div><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("player.close")}</Button></>}
      {modal === 'reset' && <><DialogTitle className="font-display text-2xl leading-tight font-bold">{t(leaving ? "player.leaveThisDub" : "player.startANewSession")}</DialogTitle><DialogDescription className="mt-4 text-sm leading-7 text-muted-foreground">{t(autosave.status === 'error' ? "player.unsavedChangesWarning" : "player.savedDubNotice")}</DialogDescription><Button className="mt-6 w-full" disabled={autosave.status === 'saving'} onClick={() => leaving ? onConfirmLeave() : reset()}>{t(autosave.status === 'error' ? "player.discardUnsavedChanges" : leaving ? "player.leaveScene" : "player.startANewDub")}</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>{t("player.keepRecordingsAndContinue")}</Button></>}
    </DialogContent>
    </Dialog>
  </div>;
}

function clock(time: number) { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function RolePortrait({ scene, role }: { scene: Scene; role: Role }) {
  const [failed, setFailed] = useState(false);
  return <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground" aria-hidden="true">{role.portrait && !failed ? <img src={asset(scene, role.portrait)} alt="" width={192} height={192} onError={() => setFailed(true)} className="h-full w-full object-cover" /> : <Icon name="person" className="size-7" />}</span>;
}
