/**
 * Reine Cache-Entscheidungslogik des Service Workers.
 *
 * Dieses Modul enthält ausschließlich seiteneffektfreie Funktionen und ist
 * damit unabhängig testbar. `public/vereint-sw.js` spiegelt exakt dieselben
 * Muster/Regex; beide Dateien MÜSSEN synchron gehalten werden (der Service
 * Worker kann dieses TypeScript nicht importieren).
 *
 * Grundsatz (siehe docs/architektur.md und docs/deployment.md):
 * - Nur sichere, öffentliche, statische Assets werden gecacht (`deny by
 *   default`). HTML-Seiten nicht, weil das SSR persönliche Daten einbettet;
 *   ohne Netz zeigt der Worker stattdessen `/offline.html`.
 * - Niemals gecacht: alles unter `/api/`, Nicht-GET-Requests, cross-origin
 *   sowie Antworten mit `Cache-Control: no-store` oder `private`.
 * - Die verbindliche Autorisierung bleibt serverseitig (Express-Auslieferung,
 *   Spring-Fachservice); der Client ist keine Sicherheitsgrenze.
 */

/** Dateiendungen öffentlicher, cachebarer statischer Assets. */
export const CACHEABLE_ASSET_EXTENSIONS = [
  'js',
  'mjs',
  'css',
  'map',
  'woff2',
  'woff',
  'ttf',
  'otf',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'gif',
  'ico',
] as const;

/** Erkennt cachebare statische Asset-Pfade anhand ihrer Endung. */
const ASSET_PATH_PATTERN = new RegExp(
  `\\.(?:${CACHEABLE_ASSET_EXTENSIONS.join('|')})$`,
  'i',
);

/** Pfad-Präfix der fachlichen API – niemals cachebar. */
export const API_PATH_PREFIX = '/api/';

/**
 * Prüft, ob ein Pfad ein cachebares statisches Asset bezeichnet. `/api/`-Pfade
 * werden ausgeschlossen, selbst wenn sie auf eine bekannte Endung enden.
 */
export function isCacheableAssetPath(pathname: string): boolean {
  if (!pathname || pathname.startsWith(API_PATH_PREFIX)) return false;
  return ASSET_PATH_PATTERN.test(pathname);
}

/**
 * Prüft, ob eine Anfrage grundsätzlich am Cache vorbeigeführt werden muss.
 * Das gilt für Nicht-GET-Requests, cross-origin-Requests und alles unter
 * `/api/`.
 */
export function isBypassedRequest(
  pathname: string,
  method: string,
  sameOrigin: boolean,
): boolean {
  if ((method ?? '').toUpperCase() !== 'GET') return true;
  if (!sameOrigin) return true;
  if (!pathname || pathname.startsWith(API_PATH_PREFIX)) return true;
  return false;
}

/**
 * Prüft anhand des `Cache-Control`-Headers, ob eine Antwort privat ist und
 * daher nicht in den Cache gelegt werden darf (`no-store` oder `private`).
 */
export function isPrivateResponse(cacheControlHeader: string | null | undefined): boolean {
  if (!cacheControlHeader) return false;
  const value = cacheControlHeader.toLowerCase();
  return value.includes('no-store') || value.includes('private');
}

/**
 * Hash-Segment im Dateinamen, z. B. `main-5RAM3QJT.js` (Angular/esbuild) oder
 * `styles.deadbeef99.css`. Mindestens eine Ziffer oder ein Großbuchstabe, damit
 * gewöhnliche Wörter wie `-something.png` nicht als unveränderlich gelten.
 */
const HASHED_FILE_PATTERN = /[.-](?=[A-Za-z0-9_]*[0-9A-Z])[A-Za-z0-9_]{8,}\.[a-z0-9]+$/;

/**
 * Gehashte Build-Artefakte (`main-<hash>.js`, `styles-<hash>.css`, Fonts)
 * dürfen als `immutable` cache-first bedient werden. Erkennung anhand eines
 * Hash-Segments im Dateinamen.
 */
export function isImmutableHashedAsset(pathname: string): boolean {
  if (!isCacheableAssetPath(pathname)) return false;
  const file = pathname.split('/').pop() ?? '';
  return HASHED_FILE_PATTERN.test(file);
}
