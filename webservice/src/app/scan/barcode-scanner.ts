import { InjectionToken } from '@angular/core';

/** Laufender Kamera-Scan; `stop()` gibt die Kamera wieder frei. */
export interface ScannerHandle {
  stop(): void;
}

/** Startet die Kamera im übergebenen Video-Element und meldet erkannte Codes. */
export interface BarcodeScanner {
  /** `true`, wenn der Browser überhaupt eine Kamera anbieten kann. */
  supported(): boolean;
  start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScannerHandle>;
}

/**
 * Scanner auf Basis von ZXing. Die Bibliothek wird erst beim Start geladen,
 * damit sie nicht im Haupt-Bundle landet. Erkannt werden die Strichcodes, die
 * auf Getränken üblich sind (EAN/UPC), dazu Code 128 für eigene Etiketten.
 */
export const zxingScanner: BarcodeScanner = {
  supported(): boolean {
    return (
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
  },

  async start(video, onCode) {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const controls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      video,
      (result) => {
        if (result) onCode(result.getText());
      },
    );
    return { stop: () => controls.stop() };
  },
};

/** Austauschbar für Tests. */
export const BARCODE_SCANNER = new InjectionToken<BarcodeScanner>('BARCODE_SCANNER', {
  providedIn: 'root',
  factory: () => zxingScanner,
});
