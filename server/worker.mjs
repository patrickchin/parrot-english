export function createWorker(assets, revision = null) {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
      if (path === '/api/health') return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true, platform: 'Alibaba ESA', revision, serverTime: new Date().toISOString() }), { headers: { ...headers, 'Content-Type': 'application/json' } });
      if (path === '/favicon.ico') return new Response(null, { status: 204, headers });
      const file = assets[path === '/' ? '/index.html' : path];
      if (!file) return new Response('Not found', { status: 404, headers });
      const text = atob(file.body);
      const bytes = Uint8Array.from(text, char => char.charCodeAt(0));
      const responseHeaders = { ...headers, 'Content-Type': file.type, 'Content-Length': String(bytes.length), 'Accept-Ranges': 'bytes', 'Cache-Control': path.startsWith('/assets/') || /-v1\.(mp4|m4a|jpg)$/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache' };
      const range = request.headers.get('Range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = 0, end = bytes.length - 1;
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...responseHeaders, 'Content-Length': '0', 'Content-Range': `bytes */${bytes.length}` } });
        if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
        else start = Math.max(0, bytes.length - Number(match[2]));
        if (start >= bytes.length || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return new Response(null, { status: 416, headers: { ...responseHeaders, 'Content-Length': '0', 'Content-Range': `bytes */${bytes.length}` } });
        return new Response(request.method === 'HEAD' ? null : bytes.slice(start, end + 1), { status: 206, headers: { ...responseHeaders, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) } });
      }
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: responseHeaders });
    },
  };
}
