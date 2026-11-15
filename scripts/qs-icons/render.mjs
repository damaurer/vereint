// Rendert die PNG-Icons der QS-App aus den SVG-Quellen.
// Aufruf aus dem Repository-Wurzelverzeichnis: node scripts/qs-icons/render.mjs
// Benötigt Playwright mit Chromium (z. B. `npx playwright install chromium`).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// `require` findet Playwright auch global installiert (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const here = import.meta.dirname;
const target = join(here, '../../webservice/public/qs/icons');
const sources = {
  any: join(here, '../../webservice/public/qs/vereint-app-icon.svg'),
  fullBleed: join(here, 'icon-full-bleed.svg'),
  maskable: join(here, 'icon-maskable.svg'),
};
const outputs = [
  { file: 'icon-192.png', source: 'any', size: 192, transparent: true },
  { file: 'icon-512.png', source: 'any', size: 512, transparent: true },
  { file: 'icon-maskable-512.png', source: 'maskable', size: 512, transparent: false },
  { file: 'apple-touch-icon.png', source: 'fullBleed', size: 180, transparent: false },
];

const browser = await chromium.launch();
try {
  for (const output of outputs) {
    const svg = await readFile(sources[output.source], 'utf8');
    const page = await browser.newPage({ viewport: { width: output.size, height: output.size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${output.size}px;height:${output.size}px}</style>${svg}`,
    );
    await page.screenshot({ path: join(target, output.file), omitBackground: output.transparent });
    await page.close();
    console.log(`geschrieben: ${output.file}`);
  }
} finally {
  await browser.close();
}
