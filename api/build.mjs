import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const entries = [['index', '../server/owner-api.mjs'], ['share', '../server/share-api.mjs']];
let first = true;
for (const [name, path] of entries) {
  const entry = fileURLToPath(new URL(path, import.meta.url));
  await build({
    configFile: false, root, publicDir: false,
    ssr: { external: ['ali-oss'] },
    build: {
      ssr: entry, target: 'node20', outDir: root + 'dist', emptyOutDir: first,
      minify: false,
      rolldownOptions: { external: ['ali-oss'], output: { format: 'cjs', entryFileNames: name + '.js' } },
    },
  });
  first = false;
}
