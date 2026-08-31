/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARROT_APP_VERSION: string;
  readonly VITE_PARROT_COMMIT_SHA: string;
  readonly VITE_PARROT_E2E?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
