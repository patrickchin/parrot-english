import { createLesson, type LessonState } from './lesson-state';
import type { Scene } from './scene';
import type { Take } from './useDubbing';

type Disposition = 'unattempted' | 'skipped' | 'recorded';
export type SavedDub = {
  id: string; slug: string; sceneId: string; signature: string; title: string;
  roleName: string; createdAt: number; updatedAt: number;
  step: 'practice' | 'result'; roleId: string; lineIndex: number;
  progress: Record<string, Disposition>; recorded: number; total: number;
};
type SavedMedia = { dubId: string; lineId: string; bytes?: ArrayBuffer; mimeType?: string; blob?: Blob; duration?: number; start?: number; peaks?: number[] };
export type RestoredDub = { saved: SavedDub; lesson: LessonState; source?: Blob };

export function newDubId() {
  return 'dub_' + Array.from(crypto.getRandomValues(new Uint8Array(15)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function mediaBlob(media?: SavedMedia) {
  if (media?.bytes instanceof ArrayBuffer) return new Blob([media.bytes], { type: media.mimeType ?? 'audio/wav' });
  return media?.blob instanceof Blob ? media.blob : undefined;
}

function signature(scene: Scene) {
  return JSON.stringify([scene.id, scene.video, scene.mediaBase, scene.duration, scene.roles.map(role => [role.id, role.selectable]),
    scene.lines.map(line => [line.id, line.roleId, line.start, line.end, line.text])]);
}

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('parrotbook-dubs', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('dubs', { keyPath: 'id' });
      request.result.createObjectStore('media', { keyPath: ['dubId', 'lineId'] }).createIndex('dubId', 'dubId');
    };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("errors.storageBlocked")); };
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => () => T): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(['dubs', 'media'], mode);
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('errors.dubSave')); };
    tx.oncomplete = () => { db.close(); resolve(result()); };
    let result: () => T;
    try { result = run(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

export function listDubs(): Promise<SavedDub[]> {
  return transaction('readonly', tx => {
    const request = tx.objectStore('dubs').getAll();
    return () => (request.result as SavedDub[]).sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export async function loadDub(id: string, scene: Scene): Promise<RestoredDub> {
  const { saved, media } = await transaction('readonly', tx => {
    const saved = tx.objectStore('dubs').get(id), media = tx.objectStore('media').index('dubId').getAll(id);
    return () => ({ saved: saved.result as SavedDub | undefined, media: media.result as SavedMedia[] });
  }).catch(error => { throw new Error("errors.dubsRead", { cause: error }); });
  if (!saved) throw new Error("errors.dubMissing");
  if (saved.signature !== signature(scene)) throw new Error("errors.sceneChanged");
  const lines = scene.lines.filter(line => line.roleId === saved.roleId);
  if (!saved.progress || !lines[saved.lineIndex] || !scene.roles.some(role => role.id === saved.roleId && role.selectable !== false) ||
      !['practice', 'result'].includes(saved.step)) throw new Error("errors.dubDamaged");
  const lesson = createLesson(scene);
  // Validate everything before creating object URLs, so a damaged draft leaks none.
  for (const line of scene.lines) {
    const status = saved.progress[line.id];
    if (!['unattempted', 'skipped', 'recorded'].includes(status)) throw new Error("errors.dubDamaged");
    if (status === 'recorded') {
      const take = media.find(item => item.lineId === line.id);
      if (!mediaBlob(take)?.size || !take || !Number.isFinite(take.start) || !Number.isFinite(take.duration) ||
          take.duration! <= 0 || !Array.isArray(take.peaks) || !take.peaks.every(value => Number.isFinite(value) && value >= 0)) throw new Error("errors.dubDamaged");
    }
  }
  for (const line of scene.lines) {
    const status = saved.progress[line.id];
    if (status !== 'recorded') lesson.progress[line.id] = { status };
    else {
      const take = media.find(item => item.lineId === line.id)!;
      const blob = mediaBlob(take)!;
      lesson.progress[line.id] = { status, take: { blob, url: URL.createObjectURL(blob), duration: take.duration!, start: take.start!, peaks: take.peaks! } };
    }
  }
  return { saved, lesson: { ...lesson, step: saved.step, roleId: saved.roleId, lineIndex: saved.lineIndex }, source: mediaBlob(media.find(item => item.lineId === 'source')) };
}

export async function saveDub(id: string, createdAt: number, slug: string, scene: Scene, lesson: LessonState, source?: Blob) {
  const lines = scene.lines.filter(line => line.roleId === lesson.roleId);
  const saved: SavedDub = {
    id, slug, sceneId: scene.id, signature: signature(scene), title: scene.title,
    roleName: scene.roles.find(role => role.id === lesson.roleId)!.name,
    createdAt, updatedAt: Date.now(), step: lesson.step === 'result' ? 'result' : 'practice',
    roleId: lesson.roleId, lineIndex: lesson.lineIndex,
    progress: Object.fromEntries(Object.entries(lesson.progress).map(([id, line]) => [id, line.status])),
    recorded: lines.filter(line => lesson.progress[line.id].status === 'recorded').length, total: lines.length,
  };
  // Store binary buffers directly. WebKit can fail while preparing Blob backing
  // files for IndexedDB. Finish all asynchronous reads before opening the transaction.
  const recordings = await Promise.all(Object.entries(lesson.progress).flatMap(([lineId, progress]) => progress.status !== 'recorded' ? [] : [(async () => {
    const { blob, duration, start, peaks }: Take = progress.take;
    return { dubId: id, lineId, bytes: await blob.arrayBuffer(), mimeType: blob.type, duration, start, peaks } satisfies SavedMedia;
  })()]));
  const video = source ? { dubId: id, lineId: 'source', bytes: await source.arrayBuffer(), mimeType: source.type } satisfies SavedMedia : undefined;
  return transaction('readwrite', tx => {
    tx.objectStore('dubs').put(saved);
    const media = tx.objectStore('media');
    for (const recording of recordings) media.put(recording);
    if (video) media.put(video);
    return () => saved;
  });
}

export function deleteDub(id: string) {
  return transaction('readwrite', tx => {
    tx.objectStore('dubs').delete(id);
    const request = tx.objectStore('media').index('dubId').openCursor(IDBKeyRange.only(id));
    request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    return () => undefined;
  });
}

export function storageError(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return "errors.storageFull";
  return "errors.dubSave";
}
