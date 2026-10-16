import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/package.json'));
const sharp = require('sharp');

const SRC = path.join(root, 'logo.png');
const CREAM = { r: 255, g: 251, b: 245, alpha: 1 };

function isolate(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    if (mn > 248 && mx - mn < 12) {
      data[i + 3] = 0;
    } else if (mn > 220 && mx - mn < 18) {
      data[i + 3] = Math.min(data[i + 3], Math.round(((255 - mn) / 35) * 255));
    }
  }
  return data;
}

async function fitOnCanvas(logoBuf, size, background, scale) {
  const meta = await sharp(logoBuf).metadata();
  const target = Math.round(size * scale);
  const fitted = await sharp(logoBuf)
    .resize({ width: target, height: target, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const fittedMeta = await sharp(fitted).metadata();
  const left = Math.round((size - (fittedMeta.width ?? target)) / 2);
  const top = Math.round((size - (fittedMeta.height ?? target)) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  const src = sharp(SRC).ensureAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  isolate(data);
  const isolated = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .png()
    .toBuffer();

  const webPublic = path.join(root, 'apps/web/public');
  const webApp = path.join(root, 'apps/web/src/app');
  const mobile = path.join(root, 'apps/mobile/assets');
  mkdirSync(webPublic, { recursive: true });
  mkdirSync(webApp, { recursive: true });
  mkdirSync(mobile, { recursive: true });

  await sharp(isolated).png().toFile(path.join(webPublic, 'logo.png'));
  await sharp(isolated).png().toFile(path.join(mobile, 'logo.png'));

  const icon = await fitOnCanvas(isolated, 1024, CREAM, 0.78);
  await sharp(icon).png().toFile(path.join(mobile, 'icon.png'));
  await sharp(icon).png().toFile(path.join(mobile, 'adaptive-icon.png'));
  const splash = await fitOnCanvas(isolated, 1024, { r: 0, g: 0, b: 0, alpha: 0 }, 0.9);
  await sharp(splash).png().toFile(path.join(mobile, 'splash-icon.png'));

  const fav = await fitOnCanvas(isolated, 512, CREAM, 0.82);
  await sharp(fav).png().toFile(path.join(webApp, 'icon.png'));
  await sharp(fav).png().toFile(path.join(webApp, 'apple-icon.png'));
  console.log('Wrote isolated logo assets');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
