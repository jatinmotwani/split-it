// Renders public/icons/*.svg to the PNG sizes the web manifest and iOS need.
// Run: node scripts/make-icons.mjs   (uses the sharp that ships with Next.js)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next')] }));

const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-maskable.svg', 'apple-touch-icon.png', 180],
];
for (const [src, out, size] of jobs) {
  await sharp(readFileSync(`public/icons/${src}`))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${out}`);
  console.info(`public/icons/${out}`);
}
