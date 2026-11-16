import { contentCatalogUrl } from './catalog';

export type ShareCredits = { title: string; source: string; attribution: string };
export type ShareSummary = { id: string; title: string; expiresAt: string; credits?: ShareCredits };
export type ShareTicket = ShareSummary & { creatorToken: string; upload: { url: string; headers: Record<string, string>; size: number }; uploaded?: boolean };
export class ShareError extends Error {
  constructor(public code: 'configuration' | 'request' | 'size' | 'storage' | 'upload' | 'publish' | 'limit') { super(code); }
}
const validId = (id: string) => /^shr_[A-Za-z0-9_-]{24}$/.test(id);
const storageOrigin = new URL(contentCatalogUrl).origin;

async function request<T>(url: string, signal: AbortSignal, method = 'GET', body?: unknown, token?: string): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { method, signal, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (error) { if (signal.aborted) throw error; throw new ShareError('request'); }
  if (!response.ok) throw new ShareError(response.status === 429 ? 'limit' : 'request');
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; } catch { throw new ShareError('request'); }
}
export async function shareApiConfiguration(signal: AbortSignal): Promise<string> {
  try {
    const value = await request<{ apiBase: string }>('/api/share-config', signal);
    if (typeof value.apiBase !== 'string' || !value.apiBase.trim()) throw new Error();
    const url = new URL(value.apiBase, location.origin);
    const local = url.origin === location.origin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/$/, '');
  } catch (error) { if (signal.aborted) throw error; throw new ShareError('configuration'); }
}

function capabilityStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('parrotbook-share-capabilities', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('capabilities');
    open.onerror = () => reject(new ShareError('storage'));
    open.onblocked = () => reject(new ShareError('storage'));
    open.onsuccess = () => {
      const database = open.result;
      try {
        const transaction = database.transaction('capabilities', mode);
        const query = action(transaction.objectStore('capabilities'));
        transaction.oncomplete = () => { database.close(); resolve(query.result); };
        transaction.onabort = transaction.onerror = () => { database.close(); reject(new ShareError('storage')); };
      } catch { database.close(); reject(new ShareError('storage')); }
    };
  });
}
export async function getShareCapability(id: string): Promise<string | undefined> {
  if (!validId(id)) return undefined;
  const value = await capabilityStore('readonly', store => store.get(id));
  return typeof value === 'string' && /^cap_[A-Za-z0-9_-]{24}$/.test(value) ? value : undefined;
}
export async function forgetShareCapability(id: string): Promise<void> {
  await capabilityStore('readwrite', store => store.delete(id));
}
export async function removeSharedDub(apiBase: string, id: string, creatorToken: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
  if (!validId(id) || !/^cap_[A-Za-z0-9_-]{24}$/.test(creatorToken)) throw new ShareError('request');
  await request(apiBase + '/shares/' + id, signal, 'DELETE', undefined, creatorToken);
  await forgetShareCapability(id);
}

export async function createSharedDub(apiBase: string, video: File, credits: ShareCredits, signal: AbortSignal,
  phase: (value: 'uploading' | 'publishing') => void, previous?: ShareTicket, onTicket?: (value: ShareTicket) => void): Promise<ShareSummary> {
  if (video.size > 25 * 1024 * 1024) throw new ShareError('size');
  const ticket = previous ?? await request<ShareTicket>(apiBase + '/shares', signal, 'POST', { title: video.name.replace(/\.mp4$/i, ''), size: video.size, credits });
  let upload: URL;
  try {
    upload = new URL(ticket.upload.url);
    if (!validId(ticket.id) || !/^cap_[A-Za-z0-9_-]{24}$/.test(ticket.creatorToken) || !Number.isFinite(Date.parse(ticket.expiresAt)) ||
      upload.origin !== storageOrigin || upload.pathname !== `/guest-shares/uploads/${ticket.id}/video.mp4` || upload.username || upload.password || upload.hash || ticket.upload.size !== video.size ||
      !ticket.upload.headers || Object.entries(ticket.upload.headers).some(([name, value]) => /^(authorization|cookie|content-length)$/i.test(name) || typeof value !== 'string')) throw new Error();
  } catch { throw new ShareError('request'); }
  if (!previous) await capabilityStore('readwrite', store => store.put(ticket.creatorToken, ticket.id));
  onTicket?.(ticket);
  if (!ticket.uploaded) {
    phase('uploading');
    let response: Response;
    try { response = await fetch(upload.href, { method: 'PUT', headers: ticket.upload.headers, body: video, signal, credentials: 'omit', redirect: 'error' }); }
    catch (error) { if (signal.aborted) throw error; throw new ShareError('upload'); }
    if (!response.ok) throw new ShareError('upload');
    ticket.uploaded = true;
  }
  phase('publishing');
  try {
    const summary = await request<ShareSummary>(apiBase + '/shares/' + ticket.id + '/publish', signal, 'POST', {}, ticket.creatorToken);
    if (summary.id !== ticket.id || typeof summary.title !== 'string' || !Number.isFinite(Date.parse(summary.expiresAt))) throw new Error();
    return summary;
  } catch (error) { if (signal.aborted) throw error; throw new ShareError('publish'); }
}
