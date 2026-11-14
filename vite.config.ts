import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Public service endpoints only. Owner authentication stays in the private page.
function apiConfiguration(): Plugin {
  const middleware = (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!['/api/owner-config', '/api/share-config'].includes(path)) return next();
    let apiBase: string | undefined;
    try {
      const url = new URL(process.env[path === '/api/owner-config' ? 'OWNER_API_URL' : 'SHARE_API_URL'] ?? '');
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) apiBase = url.href.replace(/\/$/, '');
    } catch { /* The page explains that this service has not been configured. */ }
    response.statusCode = apiBase ? 200 : 503;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(apiBase ? { apiBase } : { error: 'not_configured' }));
  };
  return { name: 'public-api-configuration', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
export default defineConfig({ plugins: [react(), apiConfiguration()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } });
