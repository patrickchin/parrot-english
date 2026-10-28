import { useEffect, useRef, useState } from 'react';
import { AppHeader } from './app/AppHeader';
import { Button, Icon } from './shared/ui';
import { asset, validatePack, type Pack, type Role } from './pack';
import { useDubbing, type Take, type Takes } from './useDubbing';
import { Library } from './Library';
import { clips, type ClipSlug } from './catalog';

export default function App() {
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
  if (!pack) return <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink"><div className="max-w-md text-center"><h1 className="font-display text-3xl font-extrabold">Parrotbook</h1><p role={error ? 'alert' : 'status'} className="my-6 text-muted">{error || '正在准备你的小片场…'}</p>{error && <Button onClick={() => setAttempt(n => n + 1)}>重新加载</Button>}</div></main>;
  return <Player key={pack.id} pack={pack} onBack={back} />;
}

function Player({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const [step, setStep] = useState<'choose' | 'practice' | 'result'>('choose');
  const [roleId, setRoleId] = useState(pack.roles[0].id);
  const [lineIndex, setLineIndex] = useState(0);
  const [takes, setTakes] = useState<Takes>({});
  const takesRef = useRef<Takes>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState(true);
  const [consent, setConsent] = useState(false);
  const [modal, setModal] = useState<'help' | 'record' | 'reset' | null>(null);
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

  return <div className="min-h-dvh bg-paper pb-[max(24px,env(safe-area-inset-bottom))] text-ink">
    <AppHeader onHelp={() => { media.stop(); setModal('help'); }} />
    <main className="mx-auto max-w-7xl px-4 pt-3 sm:px-8 sm:pt-7">
      <button onClick={() => { media.stop(); if (Object.keys(takes).length) { setReturnToLibrary(true); setModal('reset'); } else onBack(); }} className="mb-4 flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-blue focus-visible:outline-3 focus-visible:outline-blue"><Icon name="back" className="h-4 w-4" />返回片段</button>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div><p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-muted"><span className="h-1.5 w-1.5 rounded-full bg-blue" />{step === 'result' ? '你的作品' : '小小配音员'}<span className="mx-1 text-ink/20">/</span>{pack.credit.title.toUpperCase()}</p><h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{step === 'result' ? '这一回，主角是你的声音。' : pack.title}</h1></div>
        {step !== 'choose' && <button onClick={() => { media.stop(); setReturnToLibrary(false); setModal('reset'); }} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted hover:text-blue focus-visible:outline-3 focus-visible:outline-blue"><Icon name="repeat" />重新开始</button>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <section aria-label="电影片段" className="min-w-0">
          <div className="overflow-hidden rounded-3xl bg-ink shadow-[0_12px_36px_-22px_#19284280]">
            <div className="relative aspect-[16/9] bg-[#121b2a]">
              <video ref={video} src={source} poster={pack.poster ? asset(pack, pack.poster) : undefined} crossOrigin="anonymous" playsInline preload="auto" aria-label={`${pack.credit.title} 对话片段`}
                className="h-full w-full object-contain" onCanPlay={() => { const duration = video.current?.duration ?? 0; if (pack.mode === "local" && Math.abs(duration - pack.duration) > 0.7) { setVideoReady(false); media.setError(`请选择准备好的 ${pack.video}（约 ${Math.round(pack.duration)} 秒）。`); } else setVideoReady(true); }}
                onWaiting={() => { if (media.phase === 'replay' || media.phase === 'recording') { media.stop(); media.setError('视频缓冲中，请等一下再试。之前的录音还在。'); } }}
                onError={() => { setVideoReady(false); media.stop(); media.setError('视频没能加载成功。请检查网络，然后重新加载。'); }} />
              {!source ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center text-white"><p className="text-sm font-bold">从设备载入这段视频</p><label className="cursor-pointer rounded-xl bg-lemon px-5 py-3 text-sm font-bold text-ink">选择本地片段<input aria-label="选择本地片段" type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={e => openFile(e.target.files?.[0])} /></label><p className="text-xs text-white/60">{pack.video} · 文件不会上传</p></div> : !busy && <button onClick={() => step === 'result' ? void media.replay(takes) : void media.preview()} disabled={!videoReady} aria-label={step === 'result' ? '播放我的配音' : '播放原片'} className="absolute inset-0 flex items-center justify-center rounded-3xl text-white transition-colors hover:bg-black/10 focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-lemon disabled:opacity-40"><span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/35 backdrop-blur-sm sm:h-20 sm:w-20"><Icon name="play" className="h-8 w-8 sm:h-10 sm:w-10" /></span></button>}
              <span className="absolute top-4 left-4 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">{step === 'result' ? '你的配音版' : media.phase === 'recording' ? '正在配音' : `${pack.credit.title} · 对话节选`}</span>
              {media.phase === 'recording' && <span className="absolute top-4 right-4 flex items-center gap-2 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white"><span className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" />录音中</span>}
              {media.phase === 'countdown' && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><span aria-live="assertive" className="font-display text-8xl font-extrabold text-lemon">{media.countdown}</span></div>}
              {media.phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-bold text-white" role="status">正在准备…</div>}
            </div>
            <div className="flex min-h-14 items-center gap-3 px-4 py-3 text-white sm:px-5">
              <button onClick={() => busy ? media.stop() : step === 'result' ? void media.replay(takes) : void media.preview()} disabled={!videoReady} aria-label={busy ? '停止播放或录音' : step === 'result' ? '播放配音' : '播放参考片段'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-lemon disabled:opacity-40"><Icon name={busy ? 'stop' : 'play'} /></button>
              <div className="flex-1"><progress aria-label="片段播放进度" max={pack.duration} value={media.time} className="block h-1.5 w-full overflow-hidden rounded-full accent-lemon" /></div><span className="w-21 shrink-0 text-right font-mono text-xs text-white/80">{clock(media.time)} / {clock(pack.duration)}</span>
            </div>
          </div>
          <div className="mt-4 flex min-h-22 items-center justify-center rounded-2xl bg-white/70 px-5 py-4 text-center">
            {currentCaption ? <div><p className="font-display text-lg font-bold sm:text-xl">{currentCaption.text}</p>{hint && <p className="mt-1 text-sm text-muted">{currentCaption.hint}</p>}</div> : <p className="text-sm leading-6 text-muted">{step === 'choose' ? '先看一遍原片，听听他们怎么说。' : step === 'result' ? '点播放，听见你的声音走进电影里。' : '先听原声，再用自己的声音演一句。'}</p>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><span className="flex items-center gap-2"><Icon name="sound" className="h-4 w-4" />戴上耳机，听得更清楚</span><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={hint} onChange={e => setHint(e.target.checked)} className="h-4 w-4 accent-blue" />显示中文提示</label></div>
        </section>

        <section aria-label={step === 'choose' ? '选择角色' : step === 'result' ? '配音完成' : '录制台词'} className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_-24px_#19284250] sm:p-7">
          {step === 'choose' && <>
            <p className="text-xs font-bold tracking-widest text-blue">轮到你演了</p><h2 className="mt-3 font-display text-2xl font-extrabold">想成为哪个角色？</h2><p className="mt-2 text-sm leading-6 text-muted">选一个角色，替 TA 说台词。</p>
            <div className="mt-6 grid gap-3">{pack.roles.map(r => <button key={r.id} onClick={() => setRoleId(r.id)} aria-pressed={roleId === r.id} className="group flex min-h-24 items-center gap-4 rounded-2xl border-2 border-ink/10 p-3 text-left transition-colors hover:border-blue/40 aria-pressed:border-blue aria-pressed:bg-blue/5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-blue"><RolePortrait pack={pack} role={r} large /><span className="min-w-0 flex-1"><span className="block text-base font-extrabold">{r.name}</span><span className="mt-1 block text-xs text-muted">{r.hint}</span></span><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink/20 text-transparent group-aria-pressed:border-blue group-aria-pressed:bg-blue group-aria-pressed:text-white"><Icon name="check" className="h-4 w-4" /></span></button>)}</div>
            <Button className="mt-6 w-full" disabled={!videoReady || busy} onClick={startPractice}>开始配音<Icon name="arrow" /></Button>
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-paper px-4 py-3 text-xs leading-5 text-muted"><span className="mt-0.5 font-bold text-blue">3</span><p>听原声 → 录一句 → 看你的配音版<br />本次录音只留在这个页面，不上传。</p></div>
          </>}

          {step === 'practice' && <>
            <div className="flex items-center gap-3"><RolePortrait pack={pack} role={role} /><div><p className="text-xs text-muted">你正在扮演</p><h2 className="mt-0.5 font-display text-lg font-extrabold">{role.name}</h2></div><span className="ml-auto rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-ink">{completed} / {rolesLines.length} 句</span></div>
            <nav aria-label="你的台词" className="mt-6 flex gap-2">{rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => chooseLine(i)} aria-label={`第 ${i + 1} 句：${l.text}`} aria-current={i === lineIndex ? 'step' : undefined} className="flex h-11 min-w-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/10 text-sm font-bold text-muted transition-colors aria-[current=step]:border-blue aria-[current=step]:bg-blue aria-[current=step]:text-white hover:border-blue disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-blue">{takes[l.id] ? <Icon name="check" className="h-4 w-4" /> : i + 1}{skipped.has(l.id) && <span className="text-[10px]">原声</span>}</button>)}</nav>
            <div className="my-7 min-h-30"><p className="text-xs font-semibold text-muted">第 {lineIndex + 1} 句 · 用你的声音说</p><p className="mt-3 font-display text-[1.65rem] leading-snug font-extrabold tracking-tight" lang="en">{line.text}</p>{hint && <p className="mt-3 text-sm text-muted">{line.hint}</p>}</div>
            {media.phase === 'recording' ? <div className="mb-4 flex h-10 items-center justify-center gap-1" aria-label="麦克风音量">{Array.from({ length: 15 }, (_, i) => <span key={i} style={{ height: `${10 + media.level * (18 + (i % 4) * 5)}px` }} className="w-1.5 rounded-full bg-danger transition-[height] duration-75 motion-reduce:transition-none" />)}</div> : <p className="mb-4 min-h-6 text-center text-xs text-muted" aria-live="polite">{media.phase === 'countdown' ? '准备好，倒数结束就开口。' : media.phase === 'saving' ? '正在整理这次录音…' : currentTake ? '录好了！听听看，不满意可以重录。' : `说完点停止，最多录 ${(line.end - line.start).toFixed(1)} 秒。`}</p>}
            <div className="grid gap-3"><Button tone="quiet" disabled={busy || !videoReady} onClick={() => void media.preview(line)}><Icon name="sound" />听这一句原声</Button>
              {media.phase === 'recording' ? <Button tone="danger" onClick={media.finish}><Icon name="stop" />停止录音</Button> : busy ? <Button tone="quiet" onClick={media.stop}><Icon name="stop" />{capturing || media.phase === 'loading' ? '取消' : '停止播放'}</Button> : <Button tone="record" disabled={!videoReady} onClick={startRecording}><Icon name="mic" />{currentTake ? '重新录这一句' : '开始录音'}</Button>}
              {currentTake && <Button tone="quiet" disabled={busy} onClick={() => void media.listen(currentTake)}><Icon name="play" />听我的录音</Button>}
            </div>
            <div className="mt-6 border-t border-ink/8 pt-5"><Button className="w-full" disabled={busy || (!currentTake && !skipped.has(line.id))} onClick={nextLine}>{lineIndex === rolesLines.length - 1 && allDone ? '看我的配音' : lineIndex === rolesLines.length - 1 ? '完成剩下的台词' : '下一句'}<Icon name="arrow" /></Button>
              {!currentTake && <button disabled={busy} onClick={() => { setSkipped(s => new Set(s).add(line.id)); if (lineIndex < rolesLines.length - 1) setLineIndex(n => n + 1); }} className="mt-2 min-h-11 w-full rounded-lg text-xs font-semibold text-muted hover:text-blue disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-blue">{skipped.has(line.id) ? '这句会保留电影原声' : '这句先用原声，跳过'}</button>}</div>
          </>}

          {step === 'result' && <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lemon"><Icon name="check" className="h-7 w-7" /></div><h2 className="mt-5 font-display text-2xl font-extrabold">你的配音，完成啦！</h2><p className="mt-3 text-sm leading-7 text-muted">你为 <strong className="text-ink">{role.name}</strong> 录了 {recorded} 句台词。<br />{recorded ? '现在，一起看你的版本。' : '这一次先听原声，下次试着录一句。'}</p>
            <Button className="mt-7 w-full" disabled={!videoReady} onClick={() => busy ? media.stop() : void media.replay(takes)}><Icon name={busy ? 'stop' : 'play'} />{busy ? '停止播放' : '播放我的配音'}</Button>
            <Button tone="quiet" className="mt-3 w-full" disabled={busy} onClick={() => { media.stop(); setStep('practice'); setLineIndex(0); }}><Icon name="repeat" />再改一句</Button>
            <div className="mt-7 space-y-2">{rolesLines.map((l, i) => <button key={l.id} disabled={busy} onClick={() => { setStep('practice'); chooseLine(i); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-paper px-3 py-2 text-left text-sm focus-visible:outline-3 focus-visible:outline-blue"><span className="text-blue">{takes[l.id] ? <Icon name="check" className="h-4 w-4" /> : <Icon name="sound" className="h-4 w-4" />}</span><span className="flex-1" lang="en">{l.text}</span><span className="text-[11px] text-muted">{takes[l.id] ? '你的声音' : '原声'}</span></button>)}</div>
            <p className="mt-6 text-xs leading-5 text-muted">刷新或关闭页面后，录音就会清空。准备换个人玩时，请点「重新开始」。</p>
          </>}
          {media.error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-6 text-danger"><p>{media.error}</p>{!videoReady && <button onClick={() => { media.setError(''); video.current?.load(); }} className="mt-2 min-h-11 rounded-lg px-2 font-bold underline">重新加载视频</button>}</div>}
        </section>
      </div>

      <footer className="mt-8 border-t border-ink/8 py-6 sm:mt-12"><details className="text-xs leading-6 text-muted"><summary className="min-h-11 w-fit rounded-lg py-2 font-semibold focus-visible:outline-3 focus-visible:outline-blue">片段与来源 · {pack.credit.title}</summary><div className="mt-2 max-w-3xl space-y-1"><p>{pack.credit.attribution} · <a href={pack.credit.licenceUrl} target="_blank" rel="noreferrer" className="underline">{pack.credit.licence}</a> · <a href={pack.credit.source} target="_blank" rel="noreferrer" className="underline">观看原片</a></p><p>{pack.credit.changes}</p><p>{pack.mode === 'local' ? '此片段从你的设备读取，未上传；公开发布前需确认相应授权。' : '本片段用于成人原型测试；完整电影并非儿童入门教材。'}创作者未对本产品作出背书。</p></div></details></footer>
    </main>

    <dialog ref={dialog} onCancel={() => setModal(null)} onClose={() => setModal(null)} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_32px)] max-w-md overflow-auto rounded-3xl border-0 bg-white p-7 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-sm">
      {modal === 'help' && <><h2 className="font-display text-2xl font-extrabold">给电影，换上你的声音。</h2><ol className="mt-5 space-y-4 text-sm leading-7 text-muted"><li><strong className="text-ink">1. 选角色。</strong>先看一遍电影，再选想演的人。</li><li><strong className="text-ink">2. 一句一句录。</strong>听原声，点录音，倒数后开口。说完就点停止。</li><li><strong className="text-ink">3. 看你的版本。</strong>别的角色保留原声，你的角色换成你的录音。</li></ol><p className="mt-5 text-xs leading-6 text-muted">最好戴上耳机。录音不会上传，关闭或刷新页面会清空。手机请用 Safari 或 Chrome；微信内录音尚未验证。</p><Button className="mt-6 w-full" onClick={() => setModal(null)}>知道了</Button></>}
      {modal === 'record' && <><h2 className="font-display text-2xl font-extrabold">准备好麦克风了吗？</h2><p className="mt-4 text-sm leading-7 text-muted">接下来浏览器会询问麦克风权限。录音只在本次页面里使用，不会上传；刷新或关闭后就会清空。</p><p className="mt-3 text-xs leading-6 text-muted">当前供你和同事测试。儿童使用前，请由监护人了解并同意录音用途。</p><Button className="mt-6 w-full" onClick={() => { setConsent(true); setModal(null); void media.record(line); }}>同意并开始录音</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>暂时不录</Button></>}
      {modal === 'reset' && <><h2 className="font-display text-2xl font-extrabold">重新开始一场？</h2><p className="mt-4 text-sm leading-7 text-muted">这会清空本次所有录音，{returnToLibrary ? '返回片段列表' : '返回选择角色'}。清空后无法找回。</p><Button className="mt-6 w-full" onClick={reset}>清空录音，重新开始</Button><Button tone="quiet" className="mt-3 w-full" onClick={() => setModal(null)}>保留录音，继续玩</Button></>}
    </dialog>
  </div>;
}

function clock(time: number) { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function RolePortrait({ pack, role, large = false }: { pack: Pack; role: Role; large?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue/10 font-display text-xl font-extrabold text-blue ${large ? 'h-16 w-16' : 'h-11 w-11'}`} aria-hidden="true">{role.portrait ? <img src={asset(pack, role.portrait)} alt="" className="h-full w-full object-cover" /> : role.name.slice(0, 1)}</span>;
}
