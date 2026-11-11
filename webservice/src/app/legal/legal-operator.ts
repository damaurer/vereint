/**
 * Angaben zum Betreiber für Impressum und AGB.
 *
 * Werte in eckigen Klammern sind Platzhalter. Solange einer übrig ist, zeigen
 * Impressum und AGB einen gut sichtbaren Hinweis. Vor dem Freischalten der
 * öffentlichen Registrierung (`SIGNUP_ENABLED`) müssen alle Angaben stimmen.
 */
export interface LegalOperator {
  /** Vor- und Nachname des Inhabers (Einzelunternehmen) bzw. Firma laut Register. */
  readonly name: string;
  /** Optionaler Zusatz, etwa „Vereint“ als Geschäftsbezeichnung; leer lassen, wenn keiner. */
  readonly tradingName: string;
  /** Ladungsfähige Anschrift, kein Postfach. */
  readonly street: string;
  readonly postalCodeAndCity: string;
  readonly country: string;
  readonly email: string;
  /** Zweiter schneller Kontaktweg neben der E-Mail (Pflicht nach § 5 DDG). */
  readonly phone: string;
  /** Umsatzsteuer-Identifikationsnummer; leer lassen, wenn keine erteilt ist. */
  readonly vatId: string;
  /** Wirtschafts-Identifikationsnummer; leer lassen, wenn keine erteilt ist. */
  readonly economicId: string;
  /** Öffentliche Adresse der App, ohne abschließenden Schrägstrich. */
  readonly appUrl: string;
}

export const LEGAL_OPERATOR: LegalOperator = {
  name: '[Vorname Nachname]',
  tradingName: 'Vereint',
  street: '[Straße Hausnummer]',
  postalCodeAndCity: '[PLZ Ort]',
  country: 'Deutschland',
  email: '[kontakt@deine-domain.de]',
  phone: '[Telefonnummer]',
  vatId: '',
  economicId: '',
  appUrl: '[https://deine-domain.de]',
};

/**
 * Stand der AGB. Bei jeder inhaltlichen Änderung neu setzen und
 * `vereint.legal.terms-version` im Fachservice gleichziehen; der Fachservice
 * speichert diese Fassung zur Zustimmung jedes Kontos.
 */
export const TERMS_VERSION = '2026-11-11';

/** Datum der AGB-Fassung für die Anzeige („28. Oktober 2026“). */
export const TERMS_DATE_LABEL = '10. November 2026';

/** Aufbewahrung der Datenbanksicherungen (`backup_retention_days`). */
export const LEGAL_BACKUP_RETENTION_DAYS = 30;

/** Enthält ein Wert noch einen Platzhalter in eckigen Klammern? */
export function isPlaceholder(value: string): boolean {
  return /\[[^\]]+\]/.test(value);
}

/** Sind noch Betreiberangaben offen? */
export function hasOpenPlaceholders(operator: LegalOperator = LEGAL_OPERATOR): boolean {
  return Object.values(operator).some((value) => typeof value === 'string' && isPlaceholder(value));
}
