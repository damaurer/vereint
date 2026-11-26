/**
 * Merkt pro Gerät (localStorage), dass der Startdialog „Vereint einrichten“
 * schon gezeigt wurde. Wer dort etwas nicht erlaubt, wird beim Start nicht
 * erneut gefragt; die Funktion selbst fragt erst, wenn sie benutzt wird.
 *
 * Auf iPhone/iPad hat die App vom Home-Bildschirm einen eigenen Speicher. Dort
 * erscheint der Dialog nach der Installation deshalb noch einmal, was gewollt
 * ist: erst dort lassen sich Mitteilungen erlauben.
 */
export const START_SETUP_STORAGE_KEY = 'vereint.startSetup';
const DONE = 'v1';

export function startSetupDone(): boolean {
  try {
    return globalThis.localStorage?.getItem(START_SETUP_STORAGE_KEY) === DONE;
  } catch {
    // Ohne Speicher lieber nicht bei jedem Start fragen.
    return true;
  }
}

export function markStartSetupDone(): void {
  try {
    globalThis.localStorage?.setItem(START_SETUP_STORAGE_KEY, DONE);
  } catch {
    // Ohne Speicher gilt das nur für diese Sitzung.
  }
}
