import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { AppHeader } from './AppHeader';
import { DubDownload } from './DubDownload';
import { Button, Icon, controlLabel } from '../shared/ui';
import { IconButton } from '../shared/IconButton';
import { asset, type Scene, type Role } from '../scene';
import { useDubbing, type Take } from '../useDubbing';
import { dubsPath } from './routes';
import { VoiceWaveform } from '../VoiceWaveform';
import { lineWindow } from '../line-window';
import { createLesson, lessonTakes, transitionLesson, type LessonEvent, type LessonState } from '../lesson-state';
import type { RestoredDub } from '../dub-store';
import { useDubAutosave } from './useDubAutosave';
import { Button as ControlButton } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function Player({ scene, slug, notice, initial, rememberDraft, onBack, leaving, onConfirmLeave, onCancelLeave, onDirtyChange }: {
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
  const videoReady = !!source && videoStatus !== 'error' && (scene.mode !== 'local' || videoStatus === 'ready');
  const video = useRef<HTMLVideoElement>(null);
  const rolesLines = scene.lines.filter(line => line.roleId === roleId);
  const line = rolesLines[lineIndex];
  const window = lineWindow(scene, line);
  const role = scene.roles.find(r => r.id === roleId)!;
  const media = useDubbing(video, scene, saveTake);
  const diagnosticField = useRef<HTMLTextAreaElement>(null);
  const [copiedDiagnostic, setCopiedDiagnostic] = useState('');
  async function copyDiagnostic() {
    try { await navigator.clipboard.writeText(media.diagnostic); setCopiedDiagnostic(media.diagnostic); }
    catch { diagnosticField.current?.focus(); diagnosticField.current?.select(); }
  }
  const restoreActionFocus = useRef(false);
  const mediaActionRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    if (restoreActionFocus.current) node.focus({ preventScroll: true });
    return () => { restoreActionFocus.current = document.activeElement === node; };
  }, []);
  const [exporting, setExporting] = useState(false);
  const busy = media.phase !== 'idle';
  const capturing = media.phase === 'recording' || media.phase === 'saving';
  const completed = rolesLines.filter(l => takes[l.id] || skipped.has(l.id)).length;
  const recorded = rolesLines.filter(l => takes[l.id]).length;
  const currentTake = takes[line.id];
  const nextCaption = scene.lines.findIndex(l => l.start > media.time);
  const currentCaption = scene.lines[nextCaption < 0 ? scene.lines.length - 1 : Math.max(0, nextCaption - 1)];
  const caption = step === 'practice' ? line : currentCaption;
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
  function startPractice() { media.stop(); media.setError(''); media.prepareVideo(); onDirtyChange(true); send({ type: 'START' }); }

  const graphRecordings = useMemo(() => step === 'result'
    ? scene.lines.flatMap(l => takes[l.id] ? [{ start: takes[l.id].start, peaks: takes[l.id].peaks }] : [])
    : currentTake ? [{ start: currentTake.start, peaks: currentTake.peaks }] : [],
  [step, scene.lines, takes, currentTake]);

  return <div className="player-shell bg-paper text-ink">
    <AppHeader onHelp={() => { media.stop(); setModal('help'); }} onBack={() => { media.stop(); onBack(); }} />
    <main className="player-main" data-step={step}>
      {step === 'practice' && <h1 className="sr-only">{t(`content:scenes.${scene.id}.title`, { defaultValue: scene.title })}</h1>}
      <section aria-label={t("player.movieScene")} className="player-video" style={{ '--video-aspect': videoAspect } as CSSProperties}>
        <div className="player-frame overflow-hidden">
          <div className="player-screen relative">
            <video key={media.videoKey} ref={video} src={source} poster={scene.poster ? asset(scene, scene.poster) : undefined} crossOrigin="anonymous" playsInline preload="auto" aria-label={t("player.dialogueScene", { title: scene.credit.title })}
              className="player-picture"
              onLoadedMetadata={e => {
                const el = e.currentTarget;
                if (el.videoWidth && el.videoHeight) setVideoAspect(el.videoWidth / el.videoHeight);
                if (scene.mode === 'local' && Math.abs(el.duration - scene.duration) > 0.7) { setVideoStatus('error'); media.setError("errors.videoDuration"); }
                else setVideoStatus('ready');
              }}
              onError={() => { setVideoStatus('error'); media.setError("errors.videoLoad"); }} />
            {!source ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white"><p className="text-sm font-bold">{t("player.loadTheVideoFromYourDevice")}</p><label className="cursor-pointer rounded-xl bg-paper px-5 py-3 text-sm font-bold text-ink">{t("player.chooseALocalVideo")}<input aria-label={t("player.chooseALocalVideo")} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={e => openFile(e.target.files?.[0])} /></label><p className="text-xs text-white/80">{scene.video}{t("player.fileStaysOnYourDevice")}</p></div>
              : !busy && <button onClick={() => step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={step === 'result' ? t("player.playMyDub") : t("player.playOriginalScene")} className="absolute inset-0 flex items-center justify-center text-white focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-lemon disabled:opacity-40"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/75 text-primary-foreground sm:h-17 sm:w-17"><Icon name="play" className="h-7 w-7" /></span></button>}
            {media.phase === 'recording' && <span className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-destructive-foreground"><span className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" />{t("player.recording")}</span>}
            {source && <div className="video-subtitles" role="group" aria-label={t("player.dialogue")}>
              {caption && <div><p lang="en">{caption.text}</p>{caption.hint && <p lang="zh-CN">{caption.hint}</p>}</div>}
            </div>}
            {(media.phase === 'loading' || media.buffering) && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white" role="status">{t("player.gettingReady")}</div>}
          </div>
          <div className="player-transport flex items-center gap-2 bg-neutral-900 px-2 text-white sm:px-4">
            <progress ref={media.playbackProgress} aria-label={t("player.scenePlaybackProgress")} max={scene.duration} value={0} className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/30 [&::-webkit-progress-value]:bg-coral [&::-moz-progress-bar]:bg-coral" /><span className="shrink-0 font-mono text-xs">{clock(media.time)} / {clock(scene.duration)}</span>
            <button onClick={() => busy ? media.stop() : step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady || exporting} aria-label={busy ? t("player.stopPlaybackOrRecording") : step === 'result' ? t("player.playDub") : t("player.playReferenceScene")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"><Icon name={busy ? 'stop' : 'play'} /></button>
          </div>
        </div>
      </section>
      <section aria-label={step === 'choose' ? t("player.chooseARole") : step === 'result' ? t("player.dubComplete") : t("player.recordYourLines")} className="player-workspace">
        {step === 'choose' && <div className="player-choose text-center">
          <h1 className="font-display text-2xl font-bold">{t(`content:scenes.${scene.id}.title`, { defaultValue: scene.title })}</h1>
          <h2 className="mt-3 text-base font-semibold text-muted-foreground">{t("player.chooseRolePrompt")}</h2>
          <div className="role-options mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-3">{practiceRoles.map(r => <ControlButton variant="outline" key={r.id} onClick={() => send({ type: 'SELECT_ROLE', roleId: r.id })} aria-pressed={roleId === r.id} className="group h-auto min-h-17 flex-1 basis-50 justify-start gap-3 whitespace-normal px-4 py-3 text-left aria-pressed:border-primary aria-pressed:bg-accent"><RolePortrait scene={scene} role={r} /><span className="flex-1 font-bold">{t(`content:roles.${r.id}.name`, { defaultValue: r.name })}</span><Icon name="check" className="invisible group-aria-pressed:visible" /></ControlButton>)}</div>
          <div className="choose-actions mt-5">
            <Button disabled={!videoReady || busy} onClick={startPractice}>{t("player.startDubbing")}<Icon name="arrow" /></Button>
            <IconButton tone="plain" label={t("player.sceneCredits")} onClick={() => { media.stop(); setModal('details'); }}><Icon name="info" /></IconButton>
          </div>
        </div>}
        {step !== 'choose' && <>
          <div className="practice-content">
            <div className="practice-meta flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="sr-only">{t(`content:roles.${role.id}.name`, { defaultValue: role.name })}</span><span role="status" className={autosave.status === 'saving' || autosave.status === 'error' ? 'save-status text-xs text-muted-foreground' : 'sr-only'}>{t(autosave.status === 'saved' ? "player.savedOnThisDevice" : autosave.status === 'saving' ? "player.saving" : autosave.status === 'error' ? "player.notSavedYet" : "player.savedOnThisDeviceOnly")}</span><span className="sr-only">{t("recording.completedLines", { completed, total: rolesLines.length })}</span>
              <nav aria-label={t("player.yourLines")} className="line-picker flex flex-wrap items-center gap-1">
                {rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => chooseLine(i)} aria-label={t("recording.lineLabel", { number: i + 1, text: l.text })} aria-current={i === lineIndex ? 'step' : undefined} className="line-choice"><span className="line-number">{i + 1}{takes[l.id] && <Icon name="check" className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-card text-brand" />}</span>{skipped.has(l.id) && <span className="sr-only">{t("player.original")}</span>}</button>)}
              </nav>
            </div>
            <VoiceWaveform scene={scene} start={step === 'result' ? 0 : window.start} end={step === 'result' ? scene.duration : window.end} target={step === 'result' ? undefined : line} timeline={media.timeline} recordings={graphRecordings} recording={capturing} active={busy} idleTime={busy ? undefined : media.time} />
            <p className="sr-only">{t("recording.lineNumber", { number: lineIndex + 1, total: rolesLines.length })}</p>
            <p className="sr-only" role="status">{media.phase === 'recording' ? t("recording.speakingGuidance") : media.phase === 'saving' ? t("player.preparingYourRecording") : currentTake ? t("recording.takeReady") : t("recording.listenFirst")}</p>
          </div>
          <div className="player-controls" role="group" aria-label={t("player.dubbingControls")}>
            <div className={`practice-actions ${step !== 'practice' ? 'invisible' : ''}`} inert={step !== 'practice'} aria-hidden={step !== 'practice'}>
              <IconButton tone="plain" label={controlLabel(t("player.listenToTheOriginalLine"), t("recording.listenOriginal"))} disabled={busy || !videoReady} onClick={() => void media.preview(line)}><Icon name="sound" /><span className="control-caption">{t("recording.listenOriginal")}</span></IconButton>
              {/* Keep each action's DOM identity: a Stop pointer gesture must not become Record after an asynchronous stop. */}
              {media.phase === 'recording' ? <IconButton key="finish-recording" ref={mediaActionRef} tone="danger" label={controlLabel(t("player.stopRecording"), t("controls.stop"))} onClick={media.finish}><Icon name="stop" /><span className="control-caption">{t("controls.stop")}</span></IconButton> : busy ? <IconButton key="stop-media" ref={mediaActionRef} tone="quiet" label={capturing || media.phase === 'loading' ? t("player.cancel") : controlLabel(t("player.stopPlayback"), t("controls.stop"))} onClick={media.stop}><Icon name={capturing || media.phase === 'loading' ? 'close' : 'stop'} /><span className="control-caption">{capturing || media.phase === 'loading' ? t("player.cancel") : t("controls.stop")}</span></IconButton> : <IconButton key="start-recording" ref={mediaActionRef} tone={currentTake ? 'quiet' : 'record'} label={controlLabel(currentTake ? t("player.recordThisLineAgain") : t("player.record"), t("player.record"))} disabled={!videoReady} onClick={() => void media.record(line)}><Icon name="mic" /><span className="control-caption">{t("player.record")}</span></IconButton>}
              <IconButton tone={currentTake ? 'primary' : 'plain'} label={controlLabel(t("player.myRecording"), t("controls.you"))} disabled={busy || !currentTake} onClick={() => { if (currentTake) void media.listen(currentTake, line); }}><Icon name="play" /><span className="control-caption">{t("controls.you")}</span></IconButton>
              <div className="practice-navigation">
                <IconButton tone="quiet" label={controlLabel(t("player.previousLine"), t("controls.previous"))} disabled={busy || lineIndex === 0} onClick={() => chooseLine(lineIndex - 1)}><Icon name="back" /><span className="control-caption">{t("controls.previous")}</span></IconButton>
                <div className="practice-secondary">
                  <IconButton tone="plain" label={t("player.startOver")} onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" /></IconButton>
                  {media.phase === 'recording' ? <IconButton tone="plain" label={t("player.cancel")} onClick={media.stop}><Icon name="close" /></IconButton> : <IconButton tone="plain" label={t("player.sceneCredits")} onClick={() => { media.stop(); setModal('details'); }}><Icon name="info" /></IconButton>}
                </div>
                <IconButton tone={currentTake || skipped.has(line.id) ? 'primary' : 'quiet'} label={controlLabel(lineIndex === rolesLines.length - 1 && allDone ? t("player.watchMyDub") : t("player.next"), lineIndex === rolesLines.length - 1 && allDone ? t("controls.play") : t("player.next"))} disabled={busy} onClick={nextLine}><Icon name={lineIndex === rolesLines.length - 1 && allDone ? 'play' : 'arrow'} /><span className="control-caption">{lineIndex === rolesLines.length - 1 && allDone ? t("controls.play") : t("player.next")}</span></IconButton>
              </div>
            </div>
            <div className={`player-result text-center ${step !== 'result' ? 'invisible' : ''}`} inert={step !== 'result'} aria-hidden={step !== 'result'}>
              <h1 className="sr-only">{t("player.resultTitle")}</h1>
              <p className="sr-only">{t("recording.recordedLines", { count: recorded })}{!recorded && t("player.emptyResult")}</p>
              <div className="result-actions">
                <IconButton className="result-primary" tone="quiet" label={controlLabel(t("player.previousLine"), t("controls.previous"))} disabled={busy || exporting} onClick={() => chooseLine(lineIndex)}><Icon name="back" /><span className="control-caption">{t("controls.previous")}</span></IconButton>
                <IconButton className="result-primary" tone="primary" label={controlLabel(busy ? t("player.stopPlayback") : t("player.playMyDub"), busy ? t("controls.stop") : t("controls.play"))} disabled={!videoReady || exporting} onClick={() => busy ? media.stop() : void media.replay(takes)}><Icon name={busy ? 'stop' : 'play'} /><span className="control-caption">{busy ? t("controls.stop") : t("controls.play")}</span></IconButton>
                <IconButton className="result-primary" tone="quiet" label={controlLabel(t("player.editALine"), t("controls.edit"))} disabled={busy || exporting} onClick={() => chooseLine(0)}><Icon name="edit" /><span className="control-caption">{t("controls.edit")}</span></IconButton>
              </div>
              <DubDownload scene={scene} takes={takes} source={source} active={step === 'result' && !leaving} disabled={busy || !videoReady || !recorded || autosave.status === 'saving'} onExportingChange={setExporting} />
              <div className="practice-secondary">
                <IconButton tone="plain" label={t("player.startOver")} onClick={() => { media.stop(); setModal('reset'); }}><Icon name="repeat" /></IconButton>
                <IconButton tone="plain" label={t("player.sceneCredits")} onClick={() => { media.stop(); setModal('details'); }}><Icon name="info" /></IconButton>
              </div>
            </div>
          </div>
        </>}
        {media.error && <div className="player-error rounded-xl border border-danger/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive"><p role="alert">{t(media.error, { defaultValue: t('errors.unexpected') })}</p>{!videoReady && <button onClick={() => { media.setError(''); setVideoStatus('loading'); video.current?.load(); }} className="mt-2 min-h-11 rounded-lg px-2 font-bold underline">{t("player.reloadVideo")}</button>}
          {media.diagnostic && <details className="mt-2">
            <summary className="min-h-11 cursor-pointer content-center font-bold underline">{t('player.errorDetails')}</summary>
            <p>{t('player.diagnosticDescription')}</p>
            <textarea ref={diagnosticField} readOnly aria-label={t('player.diagnosticReport')} value={media.diagnostic} onFocus={event => event.target.select()} className="mt-2 block h-32 w-full rounded border border-current bg-paper p-2 font-mono text-xs text-ink" />
            <Button tone="quiet" onClick={() => void copyDiagnostic()}>{t(copiedDiagnostic === media.diagnostic ? 'player.diagnosticCopied' : 'player.copyDiagnostic')}</Button>
          </details>}
        </div>}
        {autosave.status === 'error' && <div className="player-error rounded-xl bg-destructive/10 p-3 text-sm"><p role="alert">{t(autosave.error!, { defaultValue: t('errors.unexpected') })}</p><div className="mt-2 flex flex-wrap items-center gap-3"><Button tone="quiet" onClick={autosave.retry}>{t("player.retrySaving")}</Button><a href={dubsPath(language)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-2 underline">{t("player.manageSavedDubsInANewTab")}</a></div></div>}
      </section>
    </main>
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
