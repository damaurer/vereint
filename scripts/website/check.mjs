#!/usr/bin/env node
// Prueft die statische Website (website/) vor dem Deployment:
//   - jeder lokale Link und jede Datei (href/src) existiert,
//   - Sprungziele (#abschnitt) gibt es auf der Seite,
//   - Bilder haben alt, width und height,
//   - keine fremden Server (Schriften, Skripte, Bilder), keine Inline-Skripte
//     oder -Styles (die Content-Security-Policy im Caddyfile wuerde sie sperren).
// Links unter /app/ leitet Caddy auf die App-Domain weiter; sie werden nur
// gegen eine Liste bekannter App-Routen geprueft.
//
//   node scripts/website/check.mjs [website-ordner]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), '../../website'));
const APP_ROUTES = new Set(['/app/', '/app/gruppe-eroeffnen', '/app/impressum', '/app/agb']);
const errors = [];

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

const htmlFiles = walk(root).filter((f) => f.endsWith('.html'));
if (!htmlFiles.some((f) => relative(root, f) === 'index.html')) errors.push('index.html fehlt');

for (const file of htmlFiles) {
  const rel = relative(root, file);
  const html = readFileSync(file, 'utf8');
  const fail = (msg) => errors.push(`${rel}: ${msg}`);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  if (!/^<!doctype html>/i.test(html)) fail('<!doctype html> fehlt');
  if (!/<html lang="[a-z]{2}"/.test(html)) fail('<html lang> fehlt');
  if (!/<title>[^<]+<\/title>/.test(html)) fail('<title> fehlt');
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) fail('Inline-Skript (CSP erlaubt nur Dateien)');
  if (/<style[\s>]/i.test(html) || /\sstyle="/i.test(html)) fail('Inline-Style (CSP erlaubt nur Dateien)');
  if (/\son[a-z]+="/i.test(html)) fail('Inline-Event-Handler (CSP)');

  for (const [, attr, value] of html.matchAll(/\s(href|src|srcset)="([^"]*)"/g)) {
    if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
      fail(`externer Verweis ${value} (Website laedt nichts von fremden Servern)`);
      continue;
    }
    if (/^(mailto|tel):/.test(value)) continue;
    if (value.startsWith('#')) {
      if (value.length > 1 && !ids.has(value.slice(1))) fail(`Sprungziel ${value} fehlt`);
      continue;
    }
    if (value.startsWith('/app')) {
      if (!APP_ROUTES.has(value)) fail(`unbekannte App-Route ${value}`);
      continue;
    }
    const path = value.split(/[?#]/)[0];
    const target = path.startsWith('/') ? join(root, path) : join(dirname(file), path);
    const resolved = path.endsWith('/') || path === '' ? join(target, 'index.html') : target;
    if (!existsSync(resolved)) fail(`${attr}="${value}" zeigt auf keine Datei`);
  }

  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(img)) fail(`Bild ohne alt: ${img}`);
    if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img)) fail(`Bild ohne width/height: ${img}`);
  }
}

for (const css of walk(root).filter((f) => f.endsWith('.css'))) {
  const text = readFileSync(css, 'utf8');
  for (const [, url] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    if (/^https?:|^\/\//.test(url)) errors.push(`${relative(root, css)}: externe Ressource ${url}`);
  }
  if (/@import/.test(text)) errors.push(`${relative(root, css)}: @import nicht erlaubt`);
}

const MAX_BYTES = 400 * 1024;
for (const file of walk(root)) {
  if (statSync(file).size > MAX_BYTES) errors.push(`${relative(root, file)}: groesser als 400 KB, bitte verkleinern`);
}

if (errors.length) {
  console.error(`Website-Pruefung fehlgeschlagen (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Website ok: ${htmlFiles.length} Seiten, ${walk(root).length} Dateien.`);
