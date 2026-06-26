# Parrot English

One-page fixed-stage English speaking practice prototype for children.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Cloudflare Worker TypeScript REST API
- Groq speech endpoints behind server-side `/api/*` routes

The frontend is a Vite single-page app. The backend is a plain Cloudflare Worker
that serves static Vite assets and handles REST API requests before falling back
to `env.ASSETS.fetch(request)`.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
```

`npm run dev` builds the Vite app and starts Wrangler on port 3000 so local
browser requests use the same Worker REST API shape as deployment.

## Environment

Set `GROQ_API_KEY` in `.dev.vars` for local Worker speech calls. Keep real keys
out of source control.
