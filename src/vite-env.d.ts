/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARROT_APP_VERSION: string;
  readonly VITE_PARROT_COMMIT_SHA: string;
  readonly VITE_PARROT_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
