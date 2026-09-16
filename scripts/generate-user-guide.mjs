#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 [Vereint User Guide] Starte PDF-Generierung...');

// Paths
const markdownPath = path.join(rootDir, 'docs', 'user-guide', 'user-guide.md');
const cssPath = path.join(rootDir, 'docs', 'user-guide', 'print.css');
const mockupsDir = path.join(rootDir, 'docs', 'user-guide', 'mockups');
const tempHtmlPath = path.join(rootDir, 'docs', 'user-guide', 'temp_manual.html');
const outputPdfPath = path.join(rootDir, 'docs', 'Vereint_Benutzerhandbuch.pdf');

if (!fs.existsSync(markdownPath)) {
  console.error(`❌ Fehler: Quelldatei ${markdownPath} nicht gefunden!`);
  process.exit(1);
}

const markdownContent = fs.readFileSync(markdownPath, 'utf8');
const cssContent = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

// Load mockups
function readMockupFile(filename) {
  const fullPath = path.join(mockupsDir, filename);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

const mockups = {
  login: readMockupFile('mockup-1-login.html'),
  dashboard: readMockupFile('mockup-2-dashboard.html'),
  kiosk: readMockupFile('mockup-3-kiosk.html'),
  events: readMockupFile('mockup-4-events.html'),
  moments: readMockupFile('mockup-5-moments.html'),
  chat: readMockupFile('mockup-6-chat.html'),
  analytics: readMockupFile('mockup-7-analytics.html')
};

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatInline(text) {
  let res = escapeHtml(text);
  res = res.replaceAll(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  res = res.replaceAll(/\*([^*\n]+)\*/g, '<em>$1</em>');
  res = res.replaceAll(/`([^`\n]+)`/g, '<code>$1</code>');
  res = res.replaceAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '<a href="$2">$1</a>');
  return res;
}

function getCalloutClass(text) {
  const lower = text.toLowerCase();
  if (text.includes('⚠️') || lower.includes('wichtig') || lower.includes('achtung')) {
    return 'callout-warning';
  }
  if (text.includes('🔒') || lower.includes('revisionssicherheit')) {
    return 'callout-success';
  }
  return 'callout-info';
}

function parseListItem(trimmed) {
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
    return { type: 'ul', text: trimmed.slice(2).trim() };
  }
  const dotIndex = trimmed.indexOf('. ');
  if (dotIndex > 0) {
    const numPart = trimmed.slice(0, dotIndex);
    if (/^\d+$/.test(numPart)) {
      return { type: 'ol', text: trimmed.slice(dotIndex + 2).trim() };
    }
  }
  return null;
}

const CHAPTER_MOCKUP_MAP = [
  { match: 'Kapitel 1', key: 'login' },
  { match: 'Kapitel 2', key: 'dashboard' },
  { match: 'Kapitel 3', key: 'kiosk' },
  { match: 'Kapitel 4', key: 'events' },
  { match: 'Kapitel 5', key: 'moments' },
  { match: 'Kapitel 6', key: 'chat' },
  { match: 'Kapitel 7', key: 'analytics' }
];

function getChapterMockupKey(headingText) {
  const entry = CHAPTER_MOCKUP_MAP.find(item => headingText.includes(item.match));
  return entry ? entry.key : null;
}

function parseHeading(line) {
  if (line.startsWith('# ')) {
    return { html: `<h1>${formatInline(line.slice(2))}</h1>\n` };
  }
  if (line.startsWith('## ')) {
    const headingText = line.slice(3);
    const isChapter = headingText.includes('Kapitel');
    const chapterClass = isChapter ? ' class="chapter-title"' : '';
    return {
      html: `<h2${chapterClass}>${formatInline(headingText)}</h2>\n`,
      mockupKey: getChapterMockupKey(headingText)
    };
  }
  if (line.startsWith('### ')) {
    return { html: `<h3>${formatInline(line.slice(4))}</h3>\n` };
  }
  if (line.startsWith('#### ')) {
    return { html: `<h4>${formatInline(line.slice(5))}</h4>\n` };
  }
  return null;
}

class MarkdownParser {
  constructor(mockupTemplates) {
    this.mockups = mockupTemplates;
    this.html = '';
    this.inCodeBlock = false;
    this.codeBlockContent = '';
    this.inTable = false;
    this.inList = false;
    this.listType = '';
  }

  closeList() {
    if (this.inList) {
      this.html += `</${this.listType}>\n`;
      this.inList = false;
    }
  }

  closeTable() {
    if (this.inTable) {
      this.html += '</tbody></table>\n';
      this.inTable = false;
    }
  }

  handleCodeBlock(line) {
    if (line.trim().startsWith('```')) {
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        this.codeBlockContent = '';
      } else {
        this.inCodeBlock = false;
        this.html += `<pre><code>${escapeHtml(this.codeBlockContent.trimEnd())}</code></pre>\n`;
      }
      return true;
    }
    if (this.inCodeBlock) {
      this.codeBlockContent += line + '\n';
      return true;
    }
    return false;
  }

  handleHorizontalRule(trimmed) {
    if (trimmed !== '---') {
      return false;
    }
    this.closeList();
    this.closeTable();
    this.html += '<hr />\n';
    return true;
  }

  handleTable(trimmed) {
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      this.closeTable();
      return false;
    }
    this.closeList();
    const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
    const isSeparatorRow = cells.every(c => {
      const stripped = c.replaceAll(':', '');
      return stripped.length > 0 && stripped.split('').every(ch => ch === '-');
    });
    if (isSeparatorRow) {
      return true;
    }
    if (!this.inTable) {
      this.inTable = true;
      const headerCells = cells.map(c => `<th>${formatInline(c)}</th>`).join('');
      this.html += `<table class="data-table"><thead><tr>${headerCells}</tr></thead><tbody>\n`;
    } else {
      const rowCells = cells.map(c => `<td>${formatInline(c)}</td>`).join('');
      this.html += `<tr>${rowCells}</tr>\n`;
    }
    return true;
  }

  handleCallout(trimmed) {
    if (!trimmed.startsWith('>')) {
      return false;
    }
    this.closeList();
    const quoteText = trimmed.slice(1).trim();
    const calloutClass = getCalloutClass(quoteText);
    this.html += `<div class="callout ${calloutClass}"><div class="callout-body">${formatInline(quoteText)}</div></div>\n`;
    return true;
  }

  handleList(trimmed) {
    const item = parseListItem(trimmed);
    if (!item) {
      if (this.inList && trimmed === '') {
        this.closeList();
      }
      return false;
    }
    if (!this.inList || this.listType !== item.type) {
      this.closeList();
      this.html += `<${item.type}>\n`;
      this.inList = true;
      this.listType = item.type;
    }
    this.html += `<li>${formatInline(item.text)}</li>\n`;
    return true;
  }

  handleHeading(line) {
    const heading = parseHeading(line);
    if (!heading) {
      return false;
    }
    this.closeList();
    this.html += heading.html;
    if (heading.mockupKey && this.mockups[heading.mockupKey]) {
      this.html += `<div class="mockup-container">${this.mockups[heading.mockupKey]}</div>\n`;
    }
    return true;
  }

  handleParagraph(trimmed) {
    if (trimmed.length > 0) {
      this.html += `<p>${formatInline(trimmed)}</p>\n`;
    }
  }

  parseLine(line) {
    if (this.handleCodeBlock(line)) return;
    const trimmed = line.trim();
    if (this.handleHorizontalRule(trimmed)) return;
    if (this.handleTable(trimmed)) return;
    if (this.handleCallout(trimmed)) return;
    if (this.handleList(trimmed)) return;
    if (this.handleHeading(line)) return;
    this.handleParagraph(trimmed);
  }

  parse(md) {
    const lines = md.split('\n');
    for (const line of lines) {
      this.parseLine(line);
    }
    this.closeList();
    this.closeTable();
    return this.html;
  }
}

function parseMarkdownToHtml(md) {
  const parser = new MarkdownParser(mockups);
  return parser.parse(md);
}

// Build complete HTML Document
const renderedBodyHtml = parseMarkdownToHtml(markdownContent);

const completeHtml = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vereint – Benutzerhandbuch</title>
  <style>
    ${cssContent}
  </style>
</head>
<body>
  <div class="document-container">
    <!-- Deckblatt / Cover Page -->
    <div class="cover-page">
      <div class="cover-header">
        <span class="cover-brand-icon">🍻</span>
        <div>
          <div class="cover-brand-title">VEREINT</div>
          <div class="cover-brand-sub">Plattform für Vereinswesen & Digitale Strichliste</div>
        </div>
      </div>

      <div class="cover-body">
        <div class="cover-doc-badge">Offizielle Dokumentation</div>
        <h1 class="cover-title">Benutzerhandbuch & Leitfaden</h1>
        <p class="cover-subtitle">
          Vollständige Anleitung für Mitglieder, Vorstände, Thekenbediener und Gäste mit detaillierten UI-Mockups der Optimus-Benutzeroberflächen.
        </p>
      </div>

      <div class="cover-meta-grid">
        <div class="cover-meta-item">
          <div class="meta-label">Zielgruppe</div>
          <div class="meta-value">Alle Vereinsrollen</div>
        </div>
        <div class="cover-meta-item">
          <div class="meta-label">Version & Stand</div>
          <div class="meta-value">Release 2026.1 (Sept 2026)</div>
        </div>
        <div class="cover-meta-item">
          <div class="meta-label">Design-System</div>
          <div class="meta-value">Optimus UI Standard</div>
        </div>
      </div>

      <div class="cover-footer">
        <span>Vereint Plattform • Revisionssichere Vereinsverwaltung</span>
        <span>Dokumenten-Klassifizierung: Öffentlich</span>
      </div>
    </div>

    <!-- Main Content -->
    <main class="manual-content">
      ${renderedBodyHtml}
    </main>
  </div>
</body>
</html>`;

fs.writeFileSync(tempHtmlPath, completeHtml, 'utf8');
console.log(`✅ Temporäres HTML erfolgreich erzeugt: ${tempHtmlPath}`);

// Browser Detection
function findBrowserExecutable() {
  const candidatePaths = [
    String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
    String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

const browserExe = findBrowserExecutable();

if (!browserExe) {
  console.error('❌ Kein geeigneter Chromium-Browser (Chrome / Edge) zur PDF-Generierung gefunden!');
  process.exit(1);
}

console.log(`🌐 Verwende Browser-Engine: ${browserExe}`);

const htmlFileUrl = `file:///${tempHtmlPath.replaceAll('\\', '/')}`;

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--run-all-compositor-stages-before-draw',
  '--print-to-pdf-no-header',
  `--print-to-pdf=${outputPdfPath}`,
  htmlFileUrl
];

try {
  console.log(`📄 Rendere PDF nach ${outputPdfPath}...`);
  execFileSync(browserExe, args, { stdio: 'inherit', timeout: 30000 });
  
  if (fs.existsSync(outputPdfPath)) {
    const stats = fs.statSync(outputPdfPath);
    console.log(`🎉 [Erfolg] Benutzerhandbuch-PDF erfolgreich erstellt!`);
    console.log(`📍 Dateipfad: ${outputPdfPath}`);
    console.log(`📦 Dateigröße: ${(stats.size / 1024).toFixed(1)} KB`);
  } else {
    console.error('❌ PDF-Datei wurde nach dem Browser-Lauf nicht im Zielverzeichnis gefunden.');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Fehler beim Ausführen des Headless-Browsers:', err.message);
  process.exit(1);
}
