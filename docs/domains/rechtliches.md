# Impressum und AGB

Vereint zeigt Impressum und AGB als öffentliche Seiten ohne Anmeldung:

| Seite | Adresse | Quelle |
| :--- | :--- | :--- |
| Impressum (§ 5 DDG, Kontaktstelle nach DSA, Verbraucherstreitbeilegung) | `/impressum` | `webservice/src/app/legal/impressum.component.ts` |
| AGB samt Widerrufsbelehrung und Muster-Widerrufsformular | `/agb` (Sprungmarken z. B. `#widerruf`, `#inhalte`) | `webservice/src/app/legal/agb.component.ts` |

Die Texte gibt es nur auf Deutsch; in anderen Sprachen steht ein Hinweis, dass
die deutsche Fassung gilt. Beide Seiten werden serverseitig gerendert und
stehen in `publicPaths` des BFF.

## Wo die Links stehen

- Anmeldeseite von Keycloak (Fußzeile in `keycloak/themes/vereint/login/template.ftl`).
- Öffentliche Seiten der App: Abgemeldet/Fehler, Registrierung per
  Einladungslink, Gruppe eröffnen.
- In der App: unten in der Seitenleiste und im „Mehr“-Menü.
- Unter **Gruppe → Tarif** ein Hinweis auf AGB und Widerrufsbelehrung vor der
  Buchung.

## Betreiberangaben ausfüllen

Alle Angaben zum Betreiber, die Preise und Fristen stehen an einer Stelle:
`webservice/src/app/legal/legal-operator.ts`. Werte in eckigen Klammern sind
Platzhalter; solange einer übrig ist, zeigen beide Seiten oben einen gelben
Hinweis „Entwurf“. Preise (`LEGAL_PRICES`), Kulanzfrist (`LEGAL_GRACE_DAYS`,
wie `BILLING_GRACE_DAYS`) und Aufbewahrung der Sicherungen
(`LEGAL_BACKUP_RETENTION_DAYS`, wie `backup_retention_days` in Terraform)
müssen zu Stripe und Betrieb passen.

## Zustimmung

Registrierung per Einladungslink, „Gruppe eröffnen“ (mit und ohne Konto)
verlangen ein Häkchen „AGB gelesen und zugestimmt“. Der Fachservice prüft das
Feld `acceptTerms` (sonst `400 terms_not_accepted`) und speichert am Konto
`users.terms_version` und `users.terms_accepted_at`. Konten von vor dieser
Änderung haben dort nichts stehen; sie stimmen spätestens beim Eröffnen einer
weiteren Gruppe zu.

## AGB ändern

1. Text in `agb.component.ts` ändern.
2. `TERMS_VERSION` und `TERMS_DATE_LABEL` in `legal-operator.ts` und
   `vereint.legal.terms-version` (`TERMS_VERSION`) im Fachservice auf das neue
   Datum setzen.
3. Nutzer nach § 16 der AGB mindestens sechs Wochen vorher informieren.

## Vor dem Freischalten der Registrierung

Die Texte sind ein Entwurf ohne anwaltliche Prüfung. Offen und Sache des
Betreibers:

- Platzhalter füllen (siehe oben) und die Texte prüfen lassen.
- Datenschutzerklärung (die AGB verweisen darauf) und Vertrag zur
  Auftragsverarbeitung mit den Gruppen (AGB § 13 Abs. 4).
- Kündigungsbutton nach § 312k BGB: Verbraucher mit bezahltem Tarif müssen
  online ohne Anmeldung kündigen können, mit sofortiger Bestätigung in
  Textform. Das braucht eine eigene Seite und E-Mail-Versand (heute gibt es
  kein SMTP); bis dahin bezahlte Tarife nur an Vereine und Unternehmen oder
  nicht öffentlich anbieten.
- Stripe: Kundenportal so einstellen, dass ein Wechsel in einen größeren Tarif
  sofort und anteilig gilt, ein kleinerer zum Periodenende (AGB § 5 Abs. 5);
  Kündigungsbestätigungen per E-Mail aktivieren; die AGB-Adresse als
  Nutzungsbedingungen hinterlegen. Die Schaltfläche auf der Bezahlseite muss
  die Zahlungspflicht eindeutig nennen (§ 312j Abs. 3 BGB).
- Jahrestarif für Verbraucher: Nach dem ersten Jahr ist er monatlich kündbar
  mit anteiliger Erstattung (AGB § 6 Abs. 3). Stripe verlängert von sich aus um
  ein Jahr; Erstattungen gehen von Hand im Stripe-Dashboard.
- Löschen von Konto oder Gruppe auf Anfrage geht heute von Hand (AGB § 13
  Abs. 3).
