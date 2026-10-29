const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parrotbook · Alibaba prototype</title>
<style>
  body { font: 18px/1.5 system-ui, sans-serif; max-width: 38rem; margin: 3rem auto; padding: 0 1.25rem; }
  button { font: inherit; padding: .6rem 1rem; cursor: pointer; }
  output { display: block; margin-top: 1.25rem; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
<main>
  <h1>Parrotbook on Alibaba</h1>
  <p>This page is running on Alibaba ESA. Check the backend to confirm the full round trip.</p>
  <button type="button" id="check">Check backend</button>
  <output id="result" aria-live="polite">Ready to test.</output>
  <p>Prototype for two adult testers. This test does not record or save anything.</p>
</main>
<script>
  const button = document.getElementById('check');
  const result = document.getElementById('result');
  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = 'Checking…';
    try {
      const started = performance.now();
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.ok !== true || data.platform !== 'Alibaba ESA' || !data.serverTime) {
        throw new Error('Unexpected backend response');
      }
      result.textContent = 'Backend connected ✓\\nPlatform: ' + data.platform
        + '\\nServer time: ' + data.serverTime
        + '\\nRound trip: ' + Math.round(performance.now() - started) + ' ms';
    } catch (error) {
      result.textContent = 'Connection failed: ' + error.message + '. Try again.';
    } finally {
      button.disabled = false;
    }
  });
</script>
</html>`;

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = { 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET' } });
    }
    if (path === '/api/health') {
      return Response.json({ ok: true, platform: 'Alibaba ESA', serverTime: new Date().toISOString() }, { headers });
    }
    if (path === '/') {
      return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (path === '/favicon.ico') return new Response(null, { status: 204, headers });
    return new Response('Not found', { status: 404, headers });
  },
};
