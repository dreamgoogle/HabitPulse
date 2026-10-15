/**
 * PWA icons generate karta hai.
 *
 * Purane manifest.json mein icons `https://placehold.co/192x192/...` the —
 * remote URLs. Bubblewrap aur PWABuilder dono inhe reject karte hain, aur
 * install hone par icon offline nahi dikhta. Ab sab local PNG hain.
 *
 * Bolt ek vector path hai, emoji nahi — emoji ke liye system par color-emoji
 * font hona zaroori hota hai, jo CI/Docker mein aksar nahi hota (wahan icon
 * khaali square ban jata hai).
 *
 * Chalaiye: npm run icons
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

const BRAND = '#4f46e5';
const BRAND_DARK = '#4338ca';

/** 100x100 space mein lightning bolt. */
const BOLT = 'M58.5 6 L26 55.5 H45.5 L41.5 94 L74 44.5 H54.5 Z';

/**
 * @param {number} size
 * @param {{maskable?: boolean}} opts
 *   maskable icons ko Android ke safe zone ke liye chhota content chahiye —
 *   launcher kisi bhi shape mein crop kar sakta hai.
 */
function svg(size, { maskable = false } = {}) {
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const scale = maskable ? 0.58 : 0.74; // content ka hissa
  const offset = (size - size * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${(size * scale) / 100})">
    <path d="${BOLT}" fill="#ffffff"/>
  </g>
</svg>`;
}

const TARGETS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
  // Play Store listing ke liye
  { name: 'play-store-512.png', size: 512 },
];

await mkdir(outDir, { recursive: true });

for (const t of TARGETS) {
  const buf = Buffer.from(svg(t.size, { maskable: t.maskable }));
  await sharp(buf, { density: 384 }).png({ compressionLevel: 9 }).toFile(join(outDir, t.name));
  console.log(`✅ ${t.name} (${t.size}x${t.size})`);
}

// Source SVG bhi rakh lo taaki baad mein brand badalna aasan ho
await writeFile(join(outDir, 'icon-source.svg'), svg(512), 'utf8');
console.log('✅ icon-source.svg');
console.log(`\nIcons yahan hain: ${outDir}`);
