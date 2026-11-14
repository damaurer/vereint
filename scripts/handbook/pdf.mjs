// Baut aus docs/handbuch ein gesetztes PDF-Handbuch (A4, Deckblatt,
// Inhaltsverzeichnis mit Seitenzahlen, Kapitelseiten, Kopf- und Fußzeilen).
//
//   node pdf.mjs [ausgabe.pdf]
//
// Ablauf: Markdown -> HTML (marked), Seitensatz im Browser (Paged.js),
// PDF-Druck mit Chromium (Playwright). Ohne Argument landet das PDF in
// scripts/handbook/dist/vereint-handbuch.pdf.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const docsDir = path.join(root, 'docs/handbuch');
const require = createRequire(import.meta.url);
const outFile = path.resolve(process.argv[2] ?? path.join(here, 'dist/vereint-handbuch.pdf'));
const workDir = path.join(here, 'dist');

const CHAPTERS = [
  { file: '01-erste-schritte.md', id: 'erste-schritte', title: 'Erste Schritte', audience: 'Für alle mit einem Konto' },
  { file: '02-mitglied.md', id: 'mitglied', title: 'Mitglied', audience: 'Für alle Mitglieder einer Gruppe' },
  { file: '03-vorstand.md', id: 'vorstand', title: 'Vorstand', audience: 'Für Kassenwart, Schriftwart und Gastgeber' },
  { file: '04-administration.md', id: 'administration', title: 'Administration', audience: 'Für Administratorinnen und Administratoren' },
  { file: '05-thekenterminal.md', id: 'thekenterminal', title: 'Thekenterminal', audience: 'Für den Thekendienst am Tablet' },
  { file: '06-gast.md', id: 'gast', title: 'Gast', audience: 'Für Gäste ohne Konto' },
];
const chapterByFile = new Map(CHAPTERS.map((c) => [c.file, c]));

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const now = new Date(process.env.HANDBOOK_DATE ?? Date.now());
const edition = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Wie GitHub: klein, Satzzeichen weg, Leerzeichen zu Bindestrichen.
const slug = (text) => decode(stripTags(text)).toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

/** Rendert ein Kapitel. Überschriften bekommen kapitelweite IDs, Links zeigen ins PDF. */
function renderChapter(markdown, chapterId, toc) {
  const seen = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let s = slug(inner);
        const n = seen.get(s) ?? 0;
        seen.set(s, n + 1);
        if (n) s = `${s}-${n}`;
        const id = depth === 1 ? chapterId : `${chapterId}--${s}`;
        if (depth === 2) toc.push({ id, title: stripTags(inner) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const inner = this.parser.parseInline(tokens);
        if (/^https?:/.test(href)) return `<a href="${escapeHtml(href)}">${inner}</a>`;
        const [file, anchor] = href.split('#');
        if (!file) return `<a href="#${chapterId}--${anchor}">${inner}</a>`;
        const target = chapterByFile.get(path.basename(file));
        if (!target) return inner; // Verweise auf Entwicklerdateien bleiben reiner Text.
        return `<a href="#${anchor ? `${target.id}--${anchor}` : target.id}">${inner}</a>`;
      },
    },
  });
  return marked.parse(markdown);
}

/** Bilder: schmale Handybilder neben den Text, breite Bilder über die Satzbreite, jeweils mit Bildunterschrift. */
function layoutFigures(html, chapterNo) {
  let fig = 0;
  const figure = (tag) => {
    const src = pathToFileURL(path.join(docsDir, tag.match(/src="([^"]+)"/)[1])).href;
    const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? '';
    const wide = !/align="right"/.test(tag);
    fig += 1;
    const label = `Abb. ${chapterNo}.${fig}`;
    return { wide, html: `<figure class="${wide ? 'wide' : 'phone'}"><div class="frame"><img src="${src}" alt="${alt}"></div><figcaption><span>${label}</span> ${alt}</figcaption></figure>` };
  };
  // Abschnitt "Bild rechts + Text bis <br clear>" wird zu einer zweispaltigen Zeile.
  html = html.replace(
    /<img[^>]*align="right"[^>]*>\s*([\s\S]*?)(?:<br clear="right">|(?=<img[^>]*align="right")|(?=<h[12][ >])|$)/g,
    (match, text) => {
      const tag = match.match(/<img[^>]*>/)[0];
      return `<div class="split"><div class="split-text">${text.trim()}</div>${figure(tag).html}</div>\n`;
    },
  );
  html = html.replace(/(?:<p>)?\s*(<img(?![^>]*align=)[^>]*width="[^"]*"[^>]*>)\s*(?:<\/p>)?/g, (m, tag) => figure(tag).html);
  return html;
}

async function main() {
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(outFile), { recursive: true });

  // Einleitung aus der README, ohne Entwicklerteile.
  let intro = await readFile(path.join(docsDir, 'README.md'), 'utf8');
  intro = intro
    .replace(/^# .*\n/, '')
    .replace(/\n## Bilder neu erzeugen[\s\S]*$/, '\n')
    .replace(/## Gut zu wissen: noch nicht fertige Bereiche/, '## Gut zu wissen');
  const introToc = [];
  const introHtml = renderChapter(intro, 'einleitung', introToc);

  const chapters = [];
  for (const [i, c] of CHAPTERS.entries()) {
    const md = await readFile(path.join(docsDir, c.file), 'utf8');
    const toc = [];
    let html = renderChapter(md, c.id, toc);
    // Titel + erster Absatz bilden die Kapitelseite.
    const lead = html.match(/^<h1[^>]*>[\s\S]*?<\/h1>\s*(<p>[\s\S]*?<\/p>)?/);
    html = html.slice(lead[0].length);
    html = layoutFigures(html, i + 1);
    chapters.push({ ...c, no: i + 1, toc, lead: lead[1] ?? '', html });
  }

  const asset = (p) => pathToFileURL(p).href;
  const fontDir = path.join(path.dirname(require.resolve('@fontsource/inter/package.json')), 'files');
  const font = (w, style = 'normal') =>
    `@font-face{font-family:"Inter Handbuch";font-style:${style};font-weight:${w};src:url("${asset(path.join(fontDir, `inter-latin-${w}-${style}.woff2`))}") format("woff2");}`;
  const css = await readFile(path.join(here, 'pdf.css'), 'utf8');
  const logo = (await readFile(path.join(root, 'webservice/public/vereint-icon.svg'), 'utf8')).replace(/<\?xml[^>]*>/, '');
  const shot = (name) => asset(path.join(docsDir, 'bilder', name));

  const tocHtml = [
    `<li class="toc-chapter"><a href="#einleitung"><span class="toc-no"></span>Über dieses Handbuch</a></li>`,
    ...chapters.map(
      (c) =>
        `<li class="toc-chapter"><a href="#${c.id}"><span class="toc-no">${c.no}</span>${c.title}</a></li>` +
        c.toc.map((t) => `<li class="toc-section"><a href="#${t.id}">${t.title}</a></li>`).join(''),
    ),
  ].join('\n');

  const doc = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Vereint – Benutzerhandbuch</title>
<style>${[400, 500, 600, 700, 800].map((w) => font(w)).join('')}${font(400, 'italic')}</style>
<style>${css.replace('__EDITION__', `Ausgabe ${edition}`)}</style>
</head>
<body>

<section class="cover">
  <div class="cover-glow"></div>
  <header class="cover-brand">${logo}<span>vereint</span></header>
  <div class="cover-title">
    <p class="cover-kicker">Benutzerhandbuch</p>
    <h1>Deine Gruppe.<br>Vereint.</h1>
    <p class="cover-sub">Events, Chat, Guthaben, Strichliste und Thekenterminal: alles, was deine Gruppe im Alltag braucht, Schritt für Schritt erklärt.</p>
  </div>
  <div class="cover-phones">
    <img class="p1" src="${shot('m-events.png')}" alt="">
    <img class="p2" src="${shot('start.png')}" alt="">
    <img class="p3" src="${shot('m-guthaben.png')}" alt="">
  </div>
  <footer class="cover-foot"><span>Ausgabe ${edition}</span><span>Für Mitglieder, Vorstand, Administration und Thekendienst</span></footer>
</section>

<section class="toc">
  <p class="eyebrow">Übersicht</p>
  <h1 class="toc-title">Inhalt</h1>
  <ol>${tocHtml}</ol>
</section>

<section class="intro">
  <p class="eyebrow">Einleitung</p>
  <h1 id="einleitung">Über dieses Handbuch</h1>
  ${introHtml}
</section>

${chapters
  .map(
    (c) => `
<section class="chapter" data-chapter="${c.no}">
  <header class="chapter-open">
    <div class="cover-glow"></div>
    <div class="chapter-no">${String(c.no).padStart(2, '0')}</div>
    <p class="eyebrow">Kapitel ${c.no} · ${c.audience}</p>
    <h1 id="${c.id}">${c.title}</h1>
    <div class="chapter-lead">${c.lead}</div>
    <ol class="chapter-toc">${c.toc.map((t) => `<li><a href="#${t.id}">${t.title}</a></li>`).join('')}</ol>
  </header>
  <div class="chapter-body">${c.html}</div>
</section>`,
  )
  .join('\n')}

<section class="back">
  <div class="cover-glow"></div>
  <div class="back-inner">${logo}<p class="back-name">vereint</p><p>Deine Gruppe. Vereint.</p></div>
</section>

</body>
</html>`;

  const htmlFile = path.join(workDir, 'handbuch.html');
  await writeFile(htmlFile, doc);

  const browser = await chromium.launch(process.env.HANDBOOK_CHROMIUM ? { executablePath: process.env.HANDBOOK_CHROMIUM } : {});
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('Seitenfehler:', e.message));
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.PagedConfig = { auto: false }; });
    await page.addScriptTag({ path: path.join(path.dirname(require.resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js') });
    const pages = await page.evaluate(async () => {
      await window.PagedPolyfill.preview();
      return document.querySelectorAll('.pagedjs_page').length;
    });
    await page.pdf({ path: outFile, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    console.log(`${pages} Seiten -> ${path.relative(process.cwd(), outFile)}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
