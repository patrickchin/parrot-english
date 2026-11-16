export function createWorker(assets, revision = null) {
  return {
    async fetch(request, context, env = {}) {
      const path = new URL(request.url).pathname;
      const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
      if (path === '/api/health') return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true, platform: 'Alibaba ESA', revision, serverTime: new Date().toISOString() }), { headers: { ...headers, 'Content-Type': 'application/json' } });
      if (['/api/owner-config', '/api/share-config'].includes(path)) {
        let apiBase;
        try {
          const url = new URL(path === '/api/owner-config' ? env.OWNER_API_URL : env.SHARE_API_URL);
          if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) apiBase = url.href.replace(/\/$/, '');
        } catch { /* An unset endpoint leaves the private uploader unavailable. */ }
        return new Response(request.method === 'HEAD' ? null : JSON.stringify(apiBase ? { apiBase } : { error: 'not_configured' }), {
          status: apiBase ? 200 : 503, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      if (path === '/favicon.ico') return new Response(null, { status: 204, headers });
      const pagePath = path.replace(/^\/(?:en|zh|es|ja|ko)(?=\/|$)/, '') || '/';
      const appRoute = pagePath === '/' || /^\/s\/shr_[A-Za-z0-9_-]{24}\/?$/.test(pagePath) || /^\/dubs\/?$/.test(pagePath) || /^\/owner\/packs\/?$/.test(pagePath) || /^\/packs(?:\/pack_[A-Za-z0-9_-]{1,80})?\/?$/.test(pagePath) || /^\/library\/[a-z0-9-]+\/?$/.test(pagePath) || /^\/scenes\/[a-z0-9-]+(?:\/dubs\/[A-Za-z0-9_-]+)?\/?$/.test(pagePath);
      const file = assets[appRoute ? '/index.html' : path];
      if (!file) return new Response('Not found', { status: 404, headers });
      const bytes = file.encoding === 'utf8'
        ? new TextEncoder().encode(file.body)
        : Uint8Array.from(atob(file.body), char => char.charCodeAt(0));
      const responseHeaders = { ...headers, ...(/^\/s\//.test(pagePath) || /^\/owner\//.test(pagePath) ? { 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } : {}), 'Content-Type': file.type, 'Content-Length': String(bytes.length), 'Accept-Ranges': 'none', ...(file.contentEncoding ? { 'Content-Encoding': file.contentEncoding } : {}), 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: responseHeaders });
    },
  };
}
