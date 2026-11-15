import type { RequestHandler } from 'express';
import type { AppStage } from '../config/environment';

/**
 * Manifest und App-Icons der QS-Umgebung.
 *
 * Die QS-Installation (`APP_STAGE=qs`) liefert unter denselben Adressen wie
 * die Produktion ein eigenes Manifest („Vereint QS“) und Icons mit QS-Kennung
 * aus `public/qs/` aus. `index.html`, Service Worker und Push-Mitteilungen
 * bleiben unverändert und erhalten dadurch automatisch die QS-Variante; eine
 * auf dem Gerät installierte QS-App ist so auf dem Startbildschirm von der
 * Produktiv-App zu unterscheiden. In der Produktion greift die Middleware
 * nicht.
 */
export const QS_ASSET_PATHS: ReadonlyMap<string, string> = new Map([
  ['/manifest.webmanifest', '/qs/manifest.webmanifest'],
  ['/vereint-app-icon.svg', '/qs/vereint-app-icon.svg'],
  ['/icons/apple-touch-icon.png', '/qs/icons/apple-touch-icon.png'],
  ['/icons/icon-192.png', '/qs/icons/icon-192.png'],
  ['/icons/icon-512.png', '/qs/icons/icon-512.png'],
  ['/icons/icon-maskable-512.png', '/qs/icons/icon-maskable-512.png'],
]);

export function stageAssetPath(stage: AppStage, pathname: string): string | undefined {
  if (stage !== 'qs') return undefined;
  return QS_ASSET_PATHS.get(pathname);
}

/** Leitet Manifest- und Icon-Anfragen intern auf die Variante der Umgebung um. */
export function stageAssets(stage: AppStage): RequestHandler {
  return (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const target = stageAssetPath(stage, req.path);
      if (target) {
        const queryIndex = req.url.indexOf('?');
        req.url = queryIndex >= 0 ? target + req.url.slice(queryIndex) : target;
      }
    }
    next();
  };
}
