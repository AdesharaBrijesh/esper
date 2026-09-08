/**
 * Generates the PWA icons from an inline SVG (no font dependency).
 *   npm run icons
 * Outputs: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
 *          app/icon.png (64px favicon) and app/apple-icon.png (180px).
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BRAND = process.env.NEXT_PUBLIC_THEME_COLOR || "#0f766e";

/** Rising bars + coin mark. `pad` controls the safe-area inset (maskable icons need ~20%). */
function svg(size: number, pad: number, rounded: boolean): string {
  const r = rounded ? size * 0.22 : 0;
  const inner = size * (1 - 2 * pad);
  const x0 = size * pad;
  const y0 = size * pad;
  const barW = inner * 0.16;
  const gap = inner * 0.08;
  const baseY = y0 + inner * 0.88;
  const bars = [0.38, 0.58, 0.78].map((h, i) => {
    const x = x0 + inner * 0.12 + i * (barW + gap);
    const bh = inner * h;
    return `<rect x="${x}" y="${baseY - bh}" width="${barW}" height="${bh}" rx="${barW * 0.3}" fill="white" fill-opacity="${0.75 + i * 0.12}"/>`;
  });
  const coinR = inner * 0.13;
  const coinX = x0 + inner * 0.84;
  const coinY = y0 + inner * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BRAND}"/>
  ${bars.join("\n  ")}
  <circle cx="${coinX}" cy="${coinY}" r="${coinR}" fill="#fbbf24"/>
  <circle cx="${coinX}" cy="${coinY}" r="${coinR * 0.55}" fill="none" stroke="#b45309" stroke-width="${coinR * 0.18}"/>
</svg>`;
}

async function render(file: string, size: number, pad: number, rounded: boolean) {
  await mkdir(path.dirname(file), { recursive: true });
  const png = await sharp(Buffer.from(svg(size, pad, rounded))).png().toBuffer();
  await writeFile(file, png);
  console.log(`wrote ${file} (${size}px)`);
}

async function main() {
  const root = process.cwd();
  await render(path.join(root, "public/icons/icon-192.png"), 192, 0.1, true);
  await render(path.join(root, "public/icons/icon-512.png"), 512, 0.1, true);
  await render(path.join(root, "public/icons/icon-maskable-512.png"), 512, 0.2, false);
  await render(path.join(root, "app/icon.png"), 64, 0.08, true);
  await render(path.join(root, "app/apple-icon.png"), 180, 0.12, false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
