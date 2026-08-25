/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARROT_APP_VERSION: string;
  readonly VITE_PARROT_COMMIT_SHA: string;
  readonly VITE_PARROT_E2E?: string;
  readonly VITE_PARROT_PRIVATE_STORIES?: readonly import("./stories/story-types.ts").Story[];
  readonly VITE_PARROT_PRIVATE_STORY_PREVIEW?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
