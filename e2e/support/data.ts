import { randomBytes } from 'node:crypto';

/** Eindeutiger Suffix, damit Tests auf einem wiederverwendeten Stack nicht kollidieren. */
export const unique = (label: string) => `${label} ${randomBytes(3).toString('hex')}`;

/** Gueltiges 8x8-PNG (rot), erzeugt ohne Bildbibliothek. */
export const PNG_8X8 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000001149444154789c633821278715310c2d090090bf4101b29f3e220000000049454e44ae426082',
  'hex',
);

/** Betrag wie in der Oberflaeche (de-DE), z. B. `23,50 €`. */
export const euro = (value: number) =>
  `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
