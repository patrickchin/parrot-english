import { useLanguage } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { AppHeader } from './app/AppHeader';
import { Button, Icon } from './shared/ui';
import { asset, validatePack, type Pack, type Role } from './pack';
import { useDubbing, type Take, type Takes } from './useDubbing';
import { Library } from './Library';
import { VoiceWaveform } from './VoiceWaveform';
import { clips, type ClipSlug } from './catalog';

export default function App() {
  const { t } = useLanguage();
  const [pack, setPack] = useState<Pack>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [slug, setSlug] = useState(() => location.hash.slice(1));
  const selected = clips.find(c => c.slug === slug);
  useEffect(() => { const change = () => setSlug(location.hash.slice(1)); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const choose = (next: ClipSlug) => { location.hash = next; setSlug(next); };
  const back = () => { location.hash = ''; setSlug(''); setPack(undefined); };
  useEffect(() => {
    const abort = new AbortController();
    setError(''); setPack(undefined);
    if (!selected) return;
    const base = `/packs/${selected.slug}/`;
    fetch(base + 'pack.json', { signal: abort.signal, cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('片段没能加载成功，请再试一次。'); return r.json(); })
      .then(data => { if (!abort.signal.aborted) setPack(validatePack(data, base)); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '片段加载失败。'); });
    return () => abort.abort();
  }, [attempt, selected]);
  if (!selected) return <Library onChoose={choose} />;
  if (!pack) return <div className="min-h-dvh bg-paper text-ink"><AppHeader onBack={back} /><main className="flex min-h-[70dvh] items-center justify-center px-6"><div className="max-w-md text-center"><h1 className="font-display text-3xl font-extrabold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted">{error ? t(error) : t("正在准备你的小片场…")}</p>{error && <Button onClick={() => setAttempt(n => n + 1)}>{t("重新加载")}</Button>}</div></main></div>;
  return <Player key={pack.id} pack={pack} onBack={back} />;
}

function Player({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const { t } = useLanguage();
  const [step, setStep] = useState<'choose' | 'practice' | 'result'>('choose');
  const [roleId, setRoleId] = useState(pack.roles[0].id);
  const [lineIndex, setLineIndex] = useState(0);
  const [takes, setTakes] = useState<Takes>({});
  const takesRef = useRef<Takes>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState(true);
  const [consent, setConsent] = useState(false);
  const [modal, setModal] = useState<'help' | 'details' | 'record' | 'reset' | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [localVideo, setLocalVideo] = useState<string>();
  const localVideoRef = useRef<string | undefined>(undefined);
  const source = pack.mode === 'local' ? localVideo ?? (import.meta.env.DEV ? `/content/local-dubbing/${pack.video}` : undefined) : asset(pack, pack.video);
  const [returnToLibrary, setReturnToLibrary] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const rolesLines = pack.lines.filter(line => line.roleId === roleId);
  const line = rolesLines[lineIndex];
  const role = pack.roles.find(r => r.id === roleId)!;
  const media = useDubbing(video, pack, saveTake);
  const busy = media.phase !== 'idle';
  const capturing = media.phase === 'countdown' || media.phase === 'recording' || media.phase === 'saving';
  const completed = rolesLines.filter(l => takes[l.id] || skipped.has(l.id)).length;
  const recorded = rolesLines.filter(l => takes[l.id]).length;
  const currentTake = takes[line.id];
  const currentCaption = busy && !capturing ? pack.lines.find(l => media.time >= l.start && media.time < l.end) : undefined;
  const allDone = completed === rolesLines.length;

  function saveTake(id: string, take: Take) {
    const previous = takesRef.current[id];
    if (previous) URL.revokeObjectURL(previous.url);
    takesRef.current = { ...takesRef.current, [id]: take };
    setTakes(takesRef.current);
    setSkipped(previous => { const next = new Set(previous); next.delete(id); return next; });
  }
  useEffect(() => () => { Object.values(takesRef.current).forEach(t => URL.revokeObjectURL(t.url)); }, []);
  useEffect(() => () => { if (localVideoRef.current) URL.revokeObjectURL(localVideoRef.current); }, []);
  useEffect(() => {
    if (modal) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [modal]);

  function reset() {
    media.stop(); media.setError('');
    Object.values(takesRef.current).forEach(t => URL.revokeObjectURL(t.url));
    takesRef.current = {}; setTakes({}); setSkipped(new Set()); setLineIndex(0); setStep('choose'); setConsent(false); setModal(null);
    if (video.current) video.current.currentTime = 0;
    if (returnToLibrary) { setReturnToLibrary(false); onBack(); }
  }
  function openFile(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024 || !/\.(mp4|webm|mov)$/i.test(file.name)) { media.setError('请选择小于 100 MB 的 MP4、WebM 或 MOV 视频。'); return; }
    media.stop(); media.setError(''); setVideoReady(false);
    if (localVideoRef.current) URL.revokeObjectURL(localVideoRef.current);
    const url = URL.createObjectURL(file); localVideoRef.current = url; setLocalVideo(url);
  }
  function chooseLine(index: number) { media.stop(); media.setError(''); setLineIndex(index); }
  function startRecording() {
    if (!consent) { setModal('record'); return; }
    void media.record(line);
  }
  function nextLine() {
    media.stop(); media.setError('');
    if (lineIndex < rolesLines.length - 1) setLineIndex(n => n + 1);
    else if (allDone) { setStep('result'); if (video.current) video.current.currentTime = 0; }
    else setLineIndex(rolesLines.findIndex(l => !takes[l.id] && !skipped.has(l.id)));
  }
  function startPractice() { media.stop(); media.setError(''); setStep('practice'); setLineIndex(0); }

  const graphRecordings = step === 'result'
    ? pack.lines.flatMap(l => takes[l.id] ? [{ start: l.start, peaks: takes[l.id].peaks }] : [])
    : [{ start: line.start, peaks: media.phase === 'recording' || media.phase === 'saving' ? media.livePeaks : currentTake?.peaks ?? [] }];

  return <div className="player-shell bg-paper text-ink">
    <AppHeader onHelp={() => { media.stop(); setModal('help'); }} onBack={() => { media.stop(); if (Object.keys(takes).length) { setReturnToLibrary(true); setModal('reset'); } else onBack(); }} />
    <main className="player-main" data-step={step}>
      <h1 className="sr-only">{step === 'result' ? t("这一回，主角是你的声音。") : t(pack.title)}</h1>
      <section aria-label={t("电影片段")} className="player-video overflow-hidden rounded-2xl border-2 border-brand bg-brand">
        <div className="player-screen relative bg-[#123c38]">
          <video ref={video} src={source} poster={pack.poster ? asset(pack, pack.poster) : undefined} crossOrigin="anonymous" playsInline preload="auto" aria-label={t("{0} 对话片段", pack.credit.title)}
            className="absolute inset-0 h-full w-full object-contain"
            onCanPlay={() => { const duration = video.current?.duration ?? 0; if (pack.mode === 'local' && Math.abs(duration - pack.duration) > 0.7) { setVideoReady(false); media.setError('请选择准备好的片段文件，且时长须与参考片段一致。'); } else setVideoReady(true); }}
            onWaiting={() => { if (media.phase === 'replay' || media.phase === 'recording') { media.stop(); media.setError('视频缓冲中，请等一下再试。之前的录音还在。'); } }}
            onError={() => { setVideoReady(false); media.stop(); media.setError('视频没能加载成功。请检查网络，然后重新加载。'); }} />
          {!source ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white"><p className="text-sm font-bold">{t("从设备载入这段视频")}</p><label className="cursor-pointer rounded-xl bg-paper px-5 py-3 text-sm font-bold text-ink">{t("选择本地片段")}<input aria-label={t("选择本地片段")} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={e => openFile(e.target.files?.[0])} /></label><p className="text-xs text-white/80">{pack.video}{t("· 文件不会上传")}</p></div>
            : !busy && <button onClick={() => step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady} aria-label={step === 'result' ? t("播放我的配音") : t("播放原片")} className="absolute inset-0 flex items-center justify-center text-white focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-lemon disabled:opacity-40"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/75 sm:h-17 sm:w-17"><Icon name="play" className="h-7 w-7" /></span></button>}
          {media.phase === 'recording' && <span className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-white"><span className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" />{t("录音中")}</span>}
          {media.phase === 'countdown' && <div className="absolute inset-0 flex items-center justify-center bg-brand/40"><span aria-live="assertive" className="font-display text-8xl font-extrabold text-white">{media.countdown}</span></div>}
          {media.phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-brand/40 text-sm font-bold text-white" role="status">{t("正在准备…")}</div>}
        </div>
        <div className="player-transport flex items-center gap-2 px-2 text-white sm:px-4">
          <button onClick={() => busy ? media.stop() : step === 'result' ? void media.replay(takes) : void media.preview(step === 'practice' ? line : undefined)} disabled={!videoReady} aria-label={busy ? t("停止播放或录音") : step === 'result' ? t("播放配音") : t("播放参考片段")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"><Icon name={busy ? 'stop' : 'play'} /></button>
          <progress aria-label={t("片段播放进度")} max={pack.duration} value={media.time} className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/30 [&::-webkit-progress-value]:bg-coral [&::-moz-progress-bar]:bg-coral" /><span className="shrink-0 font-mono text-xs">{clock(media.time)} / {clock(pack.duration)}</span>
        </div>
      </section>
      <section aria-label={step === 'choose' ? t("选择角色") : step === 'result' ? t("配音完成") : t("录制台词")} className="player-workspace">
        {step === 'choose' && <div className="player-choose text-center">
          <h2 className="font-display text-xl font-extrabold sm:text-2xl">{t("想成为哪个角色？")}</h2>
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-3">{pack.roles.map(r => <button key={r.id} onClick={() => setRoleId(r.id)} aria-pressed={roleId === r.id} className="group flex min-h-17 flex-1 basis-50 items-center gap-3 rounded-2xl border-2 border-brand/20 px-4 py-3 text-left aria-pressed:border-brand aria-pressed:bg-mint/70 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-brand"><RolePortrait pack={pack} role={r} /><span className="flex-1"><span className="block font-bold">{t(r.name)}</span><span className="mt-0.5 block text-xs text-muted">{t(r.hint)}</span></span><Icon name="check" className="invisible group-aria-pressed:visible" /></button>)}</div>
          <Button tone="record" className="mt-5 w-full" disabled={!videoReady || busy} onClick={startPractice}>{t("开始配音")}<Icon name="arrow" /></Button>
        </div>}
        {step === 'practice' && <>
          <div className="practice-content">
            <div className="practice-meta flex items-center justify-between gap-2 text-sm">
              <h2 className="font-display font-extrabold">{t(role.name)}</h2><span className="sr-only">{t('已完成 {0} / {1} 句', completed, rolesLines.length)}</span>
              <nav aria-label={t("你的台词")} className="flex justify-center">{rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => chooseLine(i)} aria-label={t("第 {0} 句：{1}", i + 1, l.text)} aria-current={i === lineIndex ? 'step' : undefined} className="flex h-11 min-w-11 items-center justify-center rounded-full text-sm text-muted aria-[current=step]:bg-brand/10 aria-[current=step]:font-extrabold aria-[current=step]:text-ink focus-visible:outline-3 focus-visible:outline-brand">{takes[l.id] ? <Icon name="check" /> : i + 1}{skipped.has(l.id) && <span className="sr-only">{t("原声")}</span>}</button>)}</nav>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">{t("中文")}<input aria-label={t("显示中文提示")} type="checkbox" checked={hint} onChange={e => setHint(e.target.checked)} className="peer sr-only" /><span className="relative h-6 w-11 rounded-full bg-brand/20 peer-checked:bg-brand/75 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-brand after:absolute after:top-0.75 after:left-0.75 after:h-4.5 after:w-4.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" /></label>
            </div>
            <div className="practice-caption text-center"><p className="sr-only">{t('第 {0} / {1} 句', lineIndex + 1, rolesLines.length)}</p><p className="text-balance font-display font-extrabold tracking-tight" lang="en">{line.text}</p>{hint && <p lang="zh-CN" className="mt-1 text-base text-muted">{line.hint}</p>}</div>
            <VoiceWaveform pack={pack} start={line.start} end={line.end} time={media.phase === 'countdown' ? line.start : media.time} recordings={graphRecordings} recording={media.phase === 'recording'} />
            <p className="sr-only" role="status">{media.phase === 'recording' ? t("正在录音，跟着指针说。") : media.phase === 'countdown' ? t("准备好，倒数结束就开口。") : media.phase === 'saving' ? t("正在整理这次录音…") : currentTake ? t("录音已保存，可听录音或继续下一句。") : t("先听原声，再录音。")}</p>
          </div>
          <div className="practice-actions" role="group" aria-label={t("配音操作")}>
            <Button tone="quiet" aria-label={t("听这一句原声")} disabled={busy || !videoReady} onClick={() => void media.preview(line)}><Icon name="sound" />{t("听原声")}</Button>
            {media.phase === 'recording' ? <Button tone="danger" onClick={media.finish}><Icon name="stop" />{t("停止录音")}</Button> : busy ? <Button tone="quiet" onClick={media.stop}><Icon name="stop" />{capturing || media.phase === 'loading' ? t("取消") : t("停止播放")}</Button> : <Button tone={currentTake ? 'quiet' : 'record'} aria-label={currentTake ? t("重新录这一句") : t("开始录音")} disabled={!videoReady} onClick={startRecording}><Icon name="mic" />{currentTake ? t("重录") : t("开始录音")}</Button>}
            <Button tone={currentTake ? 'primary' : 'quiet'} aria-label={t("听我的录音")} disabled={busy || !currentTake} onClick={() => { if (currentTake) void media.listen(currentTake, line); }}><Icon name="play" />{t("听我的录音")}</Button>
            <Button tone={currentTake || skipped.has(line.id) ? 'record' : 'quiet'} disabled={busy || (!currentTake && !skipped.has(line.id))} onClick={nextLine}>{lineIndex === rolesLines.length - 1 && allDone ? t("看我的配音") : lineIndex === rolesLines.length - 1 ? t("继续配音") : t("下一句")}<Icon name="arrow" /></Button>

          </div>
        </>}
        {step === 'result' && <div className="player-result text-center">
          <h2 className="font-display text-2xl font-extrabold">{t("你的配音，完成啦！")}</h2><p className="mt-2 text-sm text-muted">{t('录了 {0} 句台词。', recorded)}{!recorded && t("这一次先听原声，下次试着录一句。")}</p>
          <div className="mt-5 text-left"><VoiceWaveform pack={pack} start={0} end={pack.duration} time={media.time} recordings={graphRecordings} /></div>
          {currentCaption && <p lang="en" className="mt-4 font-display text-lg font-bold">{currentCaption.text}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-3"><Button tone="record" disabled={!videoReady} onClick={() => busy ? media.stop() : void media.replay(takes)}><Icon name={busy ? 'stop' : 'play'} />{busy ? t("停止播放") : t("播放我的配音")}</Button><Button tone="quiet" disabled={busy} onClick={() => { media.stop(); setStep('practice'); setLineIndex(0); }}><Icon name="repeat" />{t("再改一句")}</Button></div>
        </div>}
        {media.error && <div role="alert" className="player-error rounded-xl border border-danger/25 bg-red-50/70 p-3 text-sm leading-6 text-danger"><p>{t(media.error)}</p>{!videoReady && <button onClick={() => { media.setError(''); video.current?.load(); }} className="mt-2 min-h-11 rounded-lg px-2 font-bold underline">{t("重新加载视频")}</button>}</div>}
      </section>
    </main>
    <footer className="player-footer text-xs text-muted">
      <span>{t("录音不上传 · 关闭清空")}</span>
      <div className="flex items-center gap-3">{step === 'practice' && !currentTake && <button disabled={busy} onClick={() => { setSkipped(s => new Set(s).add(line.id)); if (lineIndex < rolesLines.length - 1) setLineIndex(n => n + 1); }} aria-label={skipped.has(line.id) ? t("这句会保留电影原声") : t("这句先用原声，跳过")} className="min-h-11 rounded-lg disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-brand">{t("跳过")}</button>}<button onClick={() => { media.stop(); setModal('details'); }} className="min-h-11 rounded-lg focus-visible:outline-3 focus-visible:outline-brand">{t("片段与来源")}</button>{step !== 'choose' && <button onClick={() => { media.stop(); setReturnToLibrary(false); setModal('reset'); }} className="min-h-11 rounded-lg focus-visible:outline-3 focus-visible:outline-brand">{t("重新开始")}</button>}</div>
    </footer>

    <dialog ref={dialog} onCancel={() => setModal(null)} onClose={() => setModal(null)} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_32px)] max-w-md overflow-auto rounded-3xl border-0 bg-white p-7 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-sm">
      {modal === 'help' && <><h2 className="font-display text-2xl font-extrabold">{t("给电影，换上你的声音。")}</h2><ol className="mt-5 space-y-4 text-sm leading-7 text-muted"><li><strong className="text-ink">{t("1. 选角色。")}</strong>{t("先看一遍电影，再选想演的人。")}</li><li><strong className="text-ink">{t("2. 一句一句录。")}</strong>{t("听原声，点录音，倒数后开口。说完就点停止。")}</li><li><strong className="text-ink">{t("3. 看你的版本。")}</strong>{t("别的角色保留原声，你的角色换成你的录音。")}</li></ol><p className="mt-5 text-xs leading-6 text-muted">{t("最好戴上耳机。绿色是原声波形，橙色是你的声音；指针表示当前时间。波形显示声音强弱，不代表发音得分；原声也包含影片的音乐和音效。录音不会上传，关闭或刷新页面会清空。手机请用 Safari 或 Chrome；微信内录音尚未验证。")}</p><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("知道了")}</Button></>}
      {modal === 'details' && <><h2 className="font-display text-2xl font-extrabold">{t("片段与来源")}</h2><div className="mt-4 space-y-3 text-sm leading-7 text-muted"><p>{pack.credit.title}</p><p>{pack.credit.attribution} · <a href={pack.credit.licenceUrl} target="_blank" rel="noreferrer" className="underline">{t(pack.credit.licence)}</a> · <a href={pack.credit.source} target="_blank" rel="noreferrer" className="underline">{t("观看原片")}</a></p><p>{t(pack.credit.changes)}</p><p>{pack.mode === 'local' ? t("此片段从你的设备读取，未上传；公开发布前需确认相应授权。") : t("本片段用于成人原型测试；完整电影并非儿童入门教材。")}{t("创作者未对本产品作出背书。")}</p></div><Button className="mt-6 w-full" onClick={() => setModal(null)}>{t("关闭")}</Button></>}
      {modal === 'record' && <><h2 className="font-display text-2xl font-extrabold">{t("准备好麦克风了吗？")}</h2><p className="mt-4 text-sm leading-7 text-muted">{t("接下来浏览器会询问麦克风权限。录音只在本次页面里使用，不会上传；刷新或关闭后就会清空。")}</p><p className="mt-3 text-xs leading-6 text-muted">{t("当前供你和同事测试。儿童使用前，请由监护人了解并同意录音用途。")}</p><Button className="mt-6 w-full" onClick={() => { setConsent(true); setModal(null); void media.record(line); }}>{t("同意并开始录音")}</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>{t("暂时不录")}</Button></>}
      {modal === 'reset' && <><h2 className="font-display text-2xl font-extrabold">{t("重新开始一场？")}</h2><p className="mt-4 text-sm leading-7 text-muted">{t(returnToLibrary ? '这会清空本次所有录音，返回片段列表。清空后无法找回。' : '这会清空本次所有录音，返回选择角色。清空后无法找回。')}</p><Button className="mt-6 w-full" onClick={reset}>{t("清空录音，重新开始")}</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>{t("保留录音，继续玩")}</Button></>}
    </dialog>
  </div>;
}

function clock(time: number) { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function RolePortrait({ pack, role, large = false }: { pack: Pack; role: Role; large?: boolean }) {
  const { t } = useLanguage();
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand/10 font-display text-xl font-extrabold text-brand ${large ? 'h-16 w-16' : 'h-11 w-11'}`} aria-hidden="true">{role.portrait ? <img src={asset(pack, role.portrait)} alt="" className="h-full w-full object-cover" /> : t(role.name).slice(0, 1)}</span>;
}
