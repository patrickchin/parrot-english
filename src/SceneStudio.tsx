import { useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, Ellipsis, FolderOpen, Minus, Pause, Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contentCatalogUrl } from './catalog';
import { storageUrl } from './content-pack';
import { validateScene, type Line, type Role, type Scene } from './scene';
import { useStudioPreview, youtubeId } from './scene-studio-preview';
import './scene-studio.css';

type Draft = {
  id: string; title: string; source: string; clipStart: number; clipEnd: number;
  roles: Pick<Role, 'id' | 'name'>[]; lines: Line[]; template?: Omit<Scene, 'base'>;
};
type Edge = 'start' | 'end';
type Drag = { line: Line; width: number; x: number; edge: Edge; pointer: number };

const storageKey = 'parrotbook.scene-drafts.v1';
const draftFormat = 'parrotbook-scene-draft-v1';
const minWindow = 0.05;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const hundredths = (time: number) => Math.round(time * 100) / 100;
function id(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return prefix + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function clock(seconds: number, precise = false) {
  const total = Math.max(0, Math.round(seconds * 100));
  const mins = String(Math.floor(total / 6000)).padStart(2, '0');
  const secs = String(Math.floor(total / 100) % 60).padStart(2, '0');
  return mins + ':' + secs + (precise ? '.' + String(total % 100).padStart(2, '0') : '');
}
function blankDraft(): Draft {
  return { id: id('draft_'), title: '', source: '', clipStart: 0, clipEnd: 20, roles: [], lines: [] };
}
function parseDraft(value: unknown): Draft {
  const draft = value as Draft;
  if (!draft || typeof draft.id !== 'string' || typeof draft.title !== 'string' || typeof draft.source !== 'string' ||
      !Number.isFinite(draft.clipStart) || !Number.isFinite(draft.clipEnd) ||
      !Array.isArray(draft.roles) || draft.roles.length > 8 ||
      !draft.roles.every(role => role && /^role_[\w-]+$/.test(role.id) && typeof role.name === 'string') ||
      !Array.isArray(draft.lines) || draft.lines.length > 60 ||
      !draft.lines.every(line => line && /^line_[\w-]+$/.test(line.id) && draft.roles.some(role => role.id === line.roleId) &&
        Number.isFinite(line.start) && Number.isFinite(line.end) && typeof line.text === 'string' && typeof line.hint === 'string')) {
    throw new Error('Invalid scene draft');
  }
  if (draft.template) validateScene(draft.template, '');
  return draft;
}
function loadDrafts(): Draft[] {
  try {
    const items: unknown[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return items.flatMap(item => { try { return [parseDraft(item)]; } catch { return []; } });
  } catch { return []; }
}
function hostedMedia(draft: Draft) {
  const scene = draft.template;
  if (!scene?.mediaBase || draft.source && draft.source !== scene.credit.source) return;
  try {
    return {
      src: storageUrl(scene.mediaBase + scene.video, contentCatalogUrl, 'mp4'),
      poster: scene.poster && storageUrl(scene.mediaBase + scene.poster, contentCatalogUrl, 'jpg'),
    };
  } catch { return; }
}
function trackTicks(duration: number) {
  const step = [0.5, 1, 2, 5, 10, 15, 20, 30].find(size => size >= duration / 5) ?? 60;
  return Array.from({ length: Math.ceil(duration / step) }, (_, index) => index * step);
}

export function SceneStudio() {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState(loadDrafts);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [selectedId, setSelectedId] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [dragLine, setDragLine] = useState<Line>();
  const drag = useRef<Drag | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const projectMenu = useRef<HTMLDetailsElement>(null);
  const importRevision = useRef(0);
  const line = draft.lines.find(item => item.id === selectedId);
  const roleName = (roleId: string) => draft.roles.find(role => role.id === roleId)?.name.trim() || t('owner.speaker');
  const media = hostedMedia(draft);
  const embed = youtubeId(draft.source);
  const preview = useStudioPreview(media ? '' : embed, Math.max(0, draft.clipStart), draft.id + (media?.src ?? ''));
  const duration = draft.clipEnd - draft.clipStart;
  const extent = duration > 0 && duration <= 120 ? duration : 20;
  const position = clamp(preview.time - draft.clipStart, 0, extent);
  const playStart = draft.clipStart + (line?.start ?? 0);
  const playEnd = line ? Math.min(draft.clipEnd, draft.clipStart + line.end) : draft.clipEnd;
  const playLabel = t(preview.playing ? 'player.pausePlayback' : line ? 'owner.playWindow' : 'owner.playClip');
  const ticks = trackTicks(extent);
  const percent = (seconds: number) => (clamp(seconds / extent, 0, 1) * 100) + '%';
  const currentCaption = draft.lines.find(item => item.start <= position && position < item.end)?.text;
  const invalidTiming = draft.clipStart < 0 || duration <= 0 || duration > 120 || !draft.lines.length ||
    draft.lines.some((item, index) => item.start < 0 || item.end <= item.start || item.end > duration + 0.01 ||
      index > 0 && item.start < draft.lines[index - 1].end);

  function update(patch: Partial<Draft>) {
    setDraft(current => ({ ...current, ...patch }));
    setSaved(false);
    setError('');
  }

  function load(next: Draft, isSaved = false) {
    importRevision.current++;
    drag.current = null;
    setDragLine(undefined);
    setDraft(next);
    setSelectedId(next.lines[0]?.id);
    setSaved(isSaved);
    setError('');
    if (projectMenu.current) projectMenu.current.open = false;
  }

  function save() {
    const next = [...drafts.filter(item => item.id !== draft.id), draft];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setDrafts(next);
      setSaved(true);
      setError('');
    } catch { setError('owner.draftError'); }
  }

  function importScene(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (projectMenu.current) projectMenu.current.open = false;
    const revision = ++importRevision.current;
    void selected.text().then(raw => {
      if (revision !== importRevision.current) return;
      const value = JSON.parse(raw);
      if (value?.format === draftFormat) {
        const { format: _format, scene: _scene, ...data } = value;
        load({ ...parseDraft(data), id: id('draft_') });
        return;
      }
      const { base: _base, ...scene } = validateScene(value, '');
      load({
        id: id('draft_'), title: scene.title, source: youtubeId(scene.credit.source) ? scene.credit.source : '',
        clipStart: 0, clipEnd: scene.duration, roles: scene.roles.map(({ id, name }) => ({ id, name })),
        lines: scene.lines, template: scene,
      });
    }).catch(() => { if (revision === importRevision.current) setError('owner.draftError'); });
  }

  function exportDraft() {
    const template = draft.template;
    const scene = template && {
      ...template, title: draft.title, duration,
      roles: draft.roles.map(item => ({
        label: '', hint: '', ...template.roles.find(original => original.id === item.id), id: item.id, name: roleName(item.id),
      })),
      lines: draft.lines, credit: { ...template.credit, source: draft.source || template.credit.source },
    };
    const blob = new Blob([JSON.stringify({ format: draftFormat, ...draft, ...(scene ? { scene } : {}) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (draft.title.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'scene') + '-draft.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (projectMenu.current) projectMenu.current.open = false;
  }

  function editSource() {
    preview.pause();
    setSelectedId(undefined);
    if (projectMenu.current) projectMenu.current.open = false;
    requestAnimationFrame(() => document.getElementById('studio-source-url')?.focus());
  }

  function selectLine(item: Line) {
    preview.pause();
    setSelectedId(item.id);
    preview.seek(draft.clipStart + item.start);
  }

  function adjust(item: Line, edge: Edge, time: number): Line {
    const index = draft.lines.findIndex(candidate => candidate.id === item.id);
    const minLength = Math.min(minWindow, item.end - item.start);
    const lower = edge === 'start' ? draft.lines[index - 1]?.end ?? 0 : item.start + minLength;
    const upper = edge === 'start' ? item.end - minLength : draft.lines[index + 1]?.start ?? extent;
    return { ...item, [edge]: clamp(hundredths(time), lower, upper) };
  }

  function commitWindow(item: Line, next: Line, edge: Edge) {
    if (item[edge] === next[edge]) return;
    const words = item.words ?? draft.template?.lines.find(original => original.id === item.id && original.text === item.text)?.words;
    const fits = words?.every(word => word.start >= next.start - 0.001 && word.end <= next.end + 0.001);
    const adjusted = { ...next, words: fits ? words : undefined };
    update({ lines: draft.lines.map(candidate => candidate.id === item.id ? adjusted : candidate) });
    preview.pause();
    preview.seek(draft.clipStart + next[edge]);
  }

  function seekTimeline(time: number) {
    if (line) preview.pause();
    preview.seek(draft.clipStart + time);
  }

  function trim(item: Line, edge: Edge, time: number) {
    commitWindow(item, adjust(item, edge, time), edge);
  }

  function dragHandlers(item: Line, edge: Edge) {
    const apply = (event: PointerEvent<HTMLButtonElement>, origin: Drag) => {
      const delta = (event.clientX - origin.x) / origin.width * extent;
      return adjust(origin.line, origin.edge, origin.line[origin.edge] + delta);
    };
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || drag.current) return;
        const track = event.currentTarget.closest('[data-studio-track]');
        if (!track?.clientWidth) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { line: item, width: track.clientWidth, x: event.clientX, edge, pointer: event.pointerId };
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const origin = drag.current;
        if (origin?.pointer === event.pointerId) setDragLine(apply(event, origin));
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const origin = drag.current;
        if (origin?.pointer !== event.pointerId) return;
        drag.current = null;
        setDragLine(undefined);
        if (Math.abs(event.clientX - origin.x) >= 3) commitWindow(item, apply(event, origin), edge);
      },
      onLostPointerCapture() { if (drag.current) { drag.current = null; setDragLine(undefined); } },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.5 : 0.1);
        trim(item, edge, item[edge] + delta);
      },
    };
  }

  const playhead = <i className="studio-playhead" aria-hidden="true" style={{ left: percent(position) }} />;
  const timeField = (edge: 'start' | 'end', label: string, value: number, change: (value: number) => void) =>
    <label>
      {t(edge === 'start' ? 'owner.timeStart' : 'owner.timeEnd')}
      <Input type="number" aria-label={label} min={0} step="0.01" value={value} onChange={event => change(Number(event.target.value))} />
    </label>;

  return <section className="owner-scene-studio" aria-labelledby="scene-studio-heading">
    <div className="studio-toolbar">
      <h2 id="scene-studio-heading" className="max-[700px]:sr-only"><Clapperboard aria-hidden="true" />{t('owner.studioTitle')}</h2>
      <Input className="studio-name" aria-label={t('owner.sceneTitle')} value={draft.title} placeholder={t('owner.untitled')}
        maxLength={200} onChange={event => update({ title: event.target.value })} />
      <div className="studio-project-actions">
        <details className="studio-project-menu" ref={projectMenu}>
          <summary aria-label={t('owner.projectActions')} title={t('owner.projectActions')}><Ellipsis aria-hidden="true" /></summary>
          <div>
            <Button variant="ghost" onClick={editSource}>{t('owner.sourceClip')}</Button>
            <Button variant="ghost" onClick={() => load(blankDraft())}>{t('owner.newDraft')}</Button>
            <Button variant="ghost" onClick={() => file.current?.click()}>{t('owner.importScene')}</Button>
            <Button variant="ghost" disabled={invalidTiming} onClick={exportDraft}>{t('owner.exportDraft')}</Button>
            {drafts.length > 0 && <select aria-label={t('owner.savedDrafts')} value={drafts.some(item => item.id === draft.id) ? draft.id : ''}
                onChange={event => { const next = drafts.find(item => item.id === event.target.value); if (next) load(next, true); }}>
                <option value="" disabled>{t('owner.savedDrafts')}</option>
                {drafts.map(item => <option key={item.id} value={item.id}>{item.title || t('owner.untitled')}</option>)}
            </select>}
          </div>
        </details>
        <input hidden ref={file} type="file" aria-label={t('owner.importScene')} accept="application/json,.json" onChange={importScene} />
        <Button className="studio-save" variant="highlight" onClick={save}>{t('owner.saveDraft')}</Button>
      </div>
    </div>
    <div className="studio-workspace">
      <div className="studio-monitor" aria-label={t('owner.studioPreview')}>
        <div className="studio-picture">
          {media ? <video key={media.src + draft.id + preview.retry} ref={preview.video} src={media.src} poster={media.poster}
            aria-label={t('owner.studioPreview')} controls={!line} preload="metadata" playsInline {...preview.videoEvents} /> :
            embed ? <div ref={preview.mount} className="studio-embed" /> : <div className="studio-empty-preview">
              <Button variant="outline" onClick={() => file.current?.click()}><FolderOpen aria-hidden="true" />{t('owner.openScene')}</Button>
            </div>}
          {media && preview.playing && line && currentCaption && <p className="studio-monitor-caption">{currentCaption}</p>}
          {preview.failed && <div className="studio-empty-preview studio-preview-error">
            <p role="alert">{t('owner.previewFailed')}</p>
            <Button variant="outline" onClick={preview.reload}>{t('player.reload')}</Button>
          </div>}
        </div>
        <div className="studio-transport">
          <Button variant="secondary" size="icon" disabled={!preview.ready || playStart < draft.clipStart || playEnd <= playStart}
            aria-label={playLabel} title={playLabel}
            onClick={() => preview.toggle(playStart, playEnd, !!line)}>
            {preview.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <section className="studio-timeline" aria-label={t('owner.timeline')}>
            <div className="studio-cue-strip" data-studio-track style={{ minWidth: Math.ceil(extent * 7) + 'px' }}>
              {ticks.map(tick => <span key={tick} className="studio-tick" aria-hidden="true" style={{ left: percent(tick) }}>
                {clock(tick, tick % 1 !== 0)}
              </span>)}
              {playhead}
              <input type="range" aria-label={t('owner.timelinePosition')} aria-valuetext={clock(position, true)}
                min={0} max={extent} step="any" value={position}
                onChange={event => seekTimeline(hundredths(Number(event.target.value)))}
                onKeyDown={event => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  seekTimeline(clamp(position + (event.key === 'ArrowLeft' ? -0.1 : 0.1), 0, extent));
                }} />
              {draft.lines.map(cue => {
                const shown = dragLine?.id === cue.id ? dragLine : cue;
                const active = line?.id === cue.id;
                const name = cue.text.trim() || t('owner.emptyDialogue');
                const time = clock(shown.start, true) + ' – ' + clock(shown.end, true);
                return <div key={cue.id} className="studio-dialogue" data-active={active}
                  data-tone={draft.roles.findIndex(role => role.id === cue.roleId) % 3}
                  style={{ left: percent(shown.start), right: percent(extent - shown.end) }}>
                  <button type="button" className="studio-dialogue-body" aria-label={name} aria-pressed={active}
                    title={roleName(cue.roleId) + ' · ' + name + ' · ' + time} onClick={() => selectLine(cue)}>
                    <span>{name}</span>
                  </button>
                  {active && (['start', 'end'] as const).map(edge => <button key={edge} type="button" className="studio-trim-handle"
                    data-edge={edge} aria-label={t(edge === 'start' ? 'owner.trimStart' : 'owner.trimEnd')}
                    title={t(edge === 'start' ? 'owner.trimStart' : 'owner.trimEnd')} {...dragHandlers(cue, edge)} />)}
                </div>;
              })}
            </div>
          </section>
        </div>
      </div>

      <aside className="studio-inspector" aria-label={t('owner.selectionDetails')}>
        {line ? <>
          <div className="studio-current-line">
            <p className="studio-speaker">{roleName(line.roleId)}</p>
            <textarea key={line.id} aria-label={t('owner.subtitle')} placeholder={t('owner.subtitle')}
              rows={2} maxLength={299} value={line.text} onChange={event => {
                const text = event.target.value;
                update({ lines: draft.lines.map(item => item.id === line.id ? { ...item, text, words: undefined } : item) });
              }} />
          </div>
          <div className="studio-time-fields">
            {(['start', 'end'] as const).map(edge => {
              const label = t(edge === 'start' ? 'owner.timeStart' : 'owner.timeEnd');
              const shown = dragLine?.id === line.id ? dragLine[edge] : line[edge];
              const earlier = adjust(line, edge, line[edge] - 0.1);
              const later = adjust(line, edge, line[edge] + 0.1);
              return <div className="studio-timing" key={line.id + edge}>
                <label htmlFor={'studio-' + edge}>{label}</label>
                <div className="studio-stepper">
                  <Button variant="ghost" size="icon" aria-label={t('owner.nudgeEarlier', { time: label })}
                    disabled={earlier[edge] >= line[edge]} onClick={() => commitWindow(line, earlier, edge)}><Minus aria-hidden="true" /></Button>
                  <Input key={shown} id={'studio-' + edge} type="number" min={0} step="0.01"
                    aria-label={t(edge === 'start' ? 'owner.recordFrom' : 'owner.recordUntil')} defaultValue={shown}
                    onBlur={event => {
                      const input = event.currentTarget;
                      if (Number.isFinite(input.valueAsNumber)) trim(line, edge, input.valueAsNumber);
                      input.value = String(line[edge]);
                    }}
                    onKeyDown={event => {
                      if (event.key !== 'Enter' && event.key !== 'Escape') return;
                      if (event.key === 'Escape') event.currentTarget.value = String(line[edge]);
                      event.currentTarget.blur();
                    }} />
                  <Button variant="ghost" size="icon" aria-label={t('owner.nudgeLater', { time: label })}
                    disabled={later[edge] <= line[edge]} onClick={() => commitWindow(line, later, edge)}><Plus aria-hidden="true" /></Button>
                </div>
              </div>;
            })}
          </div>
        </> : <>
          <label>
            <span className="sr-only">{t('owner.youtubeUrl')}</span>
            <Input id="studio-source-url" type="url" value={draft.source} placeholder={t('owner.youtubeUrl')} onChange={event => update({ source: event.target.value.trim() })} />
          </label>
          {draft.source && !embed && <p role="alert">{t('owner.invalidYoutube')}</p>}
          <div className="studio-time-fields">
            {timeField('start', t('owner.clipStart'), draft.clipStart, value => update({ clipStart: value }))}
            {timeField('end', t('owner.clipEnd'), draft.clipEnd, value => update({ clipEnd: value }))}
          </div>
          <p className="studio-inspector-hint">{t('owner.sourceTimingHelp')}</p>
        </>}
      </aside>
    </div>
    {saved && <p className="studio-save-status" role="status">{t('owner.draftSaved')}</p>}
    {(error || invalidTiming && draft.lines.length > 0) && <p className="studio-error" role="alert">{t(error || 'owner.invalidTiming')}</p>}
  </section>;
}
