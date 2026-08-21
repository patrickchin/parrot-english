/* global process */

import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIRECTORIES = [
  "public/assets/lesson-covers",
  "public/assets/stories",
];
const WIDTHS = [384, 768];

for (const directory of DIRECTORIES) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".webp") && !/-\d+\.webp$/.test(file))
    .sort();

  for (const file of files) {
    const source = path.join(directory, file);
    for (const width of WIDTHS) {
      const destination = source.replace(/\.webp$/, `-${width}.webp`);
      await sharp(source)
        .resize({ width, withoutEnlargement: true })
        .webp({ effort: 6, quality: 76, smartSubsample: true })
        .toFile(destination);
      process.stdout.write(`${destination}\n`);
    }
  }
}
