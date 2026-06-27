import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const browserGlobals = {
  Audio: "readonly",
  Blob: "readonly",
  FormData: "readonly",
  MediaRecorder: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  clearTimeout: "readonly",
  document: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  window: "readonly",
};

export default defineConfig([
  globalIgnores(["dist/**", ".wrangler/**", "node_modules/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "worker/**/*.ts", "vite.config.ts"],
    languageOptions: {
      globals: browserGlobals,
    },
  },
  {
    files: ["tests/**/*.mjs", "*.config.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        File: "readonly",
        FormData: "readonly",
        Request: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
      },
    },
  },
]);
