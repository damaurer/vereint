/**
 * Angaben zum Betreiber für Impressum, AGB und Widerrufsbelehrung.
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
  /** Kleinunternehmer nach § 19 UStG: Preise ohne Umsatzsteuer. */
  readonly smallBusiness: boolean;
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
  smallBusiness: true,
  appUrl: '[https://deine-domain.de]',
};

/**
 * Stand der AGB. Bei jeder inhaltlichen Änderung neu setzen und
 * `vereint.legal.terms-version` im Fachservice gleichziehen; der Fachservice
 * speichert diese Fassung zur Zustimmung jedes Kontos.
 */
export const TERMS_VERSION = '2026-10-16';

/** Datum der AGB-Fassung für die Anzeige („16. Oktober 2026“). */
export const TERMS_DATE_LABEL = '16. Oktober 2026';

/** Preise der bezahlten Tarife in Euro, wie sie in Stripe hinterlegt sind. */
export const LEGAL_PRICES = {
  standardMonth: '4,00 €',
  standardYear: '40,00 €',
  premiumMonth: '9,00 €',
  premiumYear: '90,00 €',
  supporterMonth: '2,00 €',
} as const;

/** Zahlungsfrist bis zur Nur-Lesen-Sperre (`BILLING_GRACE_DAYS`). */
export const LEGAL_GRACE_DAYS = 30;

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
