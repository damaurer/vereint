# Impressum und AGB

Vereint zeigt Impressum und AGB als öffentliche Seiten ohne Anmeldung:

| Seite | Adresse | Quelle |
| :--- | :--- | :--- |
| Impressum (§ 5 DDG, Kontaktstelle nach DSA, Verbraucherstreitbeilegung) | `/impressum` | `webservice/src/app/legal/impressum.component.ts` |
| AGB für die unentgeltliche Nutzung | `/agb` (Sprungmarken z. B. `#inhalte`, `#haftung`) | `webservice/src/app/legal/agb.component.ts` |

Die Texte gibt es nur auf Deutsch; in anderen Sprachen steht ein Hinweis, dass
die deutsche Fassung gilt. Beide Seiten werden serverseitig gerendert und
stehen in `publicPaths` des BFF.

## Wo die Links stehen

- Anmeldeseite von Keycloak (Fußzeile in `keycloak/themes/vereint/login/template.ftl`).
- Öffentliche Seiten der App: Abgemeldet/Fehler, Registrierung per
  Einladungslink, Gruppe eröffnen.
- In der App: unten in der Seitenleiste und im „Mehr“-Menü.

## Betreiberangaben ausfüllen

Alle Angaben zum Betreiber und die Fristen stehen an einer Stelle:
`webservice/src/app/legal/legal-operator.ts`. Werte in eckigen Klammern sind
Platzhalter; solange einer übrig ist, zeigen beide Seiten oben einen gelben
Hinweis „Entwurf“. Die Aufbewahrung der Sicherungen
(`LEGAL_BACKUP_RETENTION_DAYS`) muss zur Aufbewahrung der Backups in
LinuxServerSetup passen (`backup_keep_*` der Rolle `backup`; ab Werk bis zu
sechs Monatsstände, also länger als die 30 Tage im Text).

Vereint ist unentgeltlich: keine Tarife, keine Zahlung. Die AGB enthalten
deshalb keine Preise, keine Widerrufsbelehrung und keine Regeln zu Abos; die
Haftung ist wie bei einer Schenkung bzw. Leihe beschränkt (AGB § 11).

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
3. Nutzer nach § 13 der AGB mindestens sechs Wochen vorher informieren.

## Vor dem Freischalten der Registrierung

Die Texte sind ein Entwurf ohne anwaltliche Prüfung. Offen und Sache des
Betreibers:

- Platzhalter füllen (siehe oben) und die Texte prüfen lassen.
- Datenschutzerklärung (die AGB verweisen darauf) und Vertrag zur
  Auftragsverarbeitung mit den Gruppen (AGB § 10 Abs. 4).
- Löschen von Konto oder Gruppe auf Anfrage geht heute von Hand (AGB § 10
  Abs. 3).
