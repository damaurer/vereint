/** Browser-Erkennung für Installations- und Push-Hinweise (nur im Browser aufrufen). */

/** iPhone oder iPad; iPadOS meldet sich als Mac mit Touchscreen. */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Läuft die App installiert (vom Home-Bildschirm) statt im Browser-Tab? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
