import { copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
await copyFile(root + 'package.json', root + 'dist/package.json');
await copyFile(root + 'package-lock.json', root + 'dist/package-lock.json');
execFileSync('npm', ['ci', '--omit=dev', '--prefix', root + 'dist'], { stdio: 'inherit' });
console.log('Prepared API code and production dependencies. No content or media is included.');
