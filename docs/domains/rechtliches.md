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
(`LEGAL_BACKUP_RETENTION_DAYS`) muss zur tatsächlichen Aufbewahrung der
Backups beim Betreiber passen.

Vereint ist unentgeltlich: keine Tarife, keine Zahlung. Die AGB enthalten
deshalb keine Preise, keine Widerrufsbelehrung und keine Regeln zu Abos; die
Haftung ist wie bei einer Schenkung bzw. Leihe beschränkt (AGB § 12).

## Zustimmung

Registrierung per Einladungslink, „Gruppe eröffnen“ (mit und ohne Konto)
verlangen ein Häkchen „AGB gelesen und zugestimmt“. Der Fachservice prüft das
Feld `acceptTerms` (sonst `400 terms_not_accepted`) und speichert am Konto
`users.terms_version` und `users.terms_accepted_at`.

Seit der Fassung vom 10. November 2026 (Abschnitt § 11 „Statistiken“) fragt die
App nach jedem Login, ob das Konto der gültigen Fassung zugestimmt hat
(`GET /api/v1/users/me/terms`). Fehlt die Zustimmung oder ist sie älter (vom
Admin angelegte und bestehende Konten, jede neue Fassung), führen die Guards
auf `/agb-zustimmen`; erreichbar bleiben nur Abmelden, Impressum und AGB.
„Zustimmen“ speichert Fassung und Zeitpunkt (`POST /api/v1/users/me/terms`
mit `acceptTerms: true`). Die Seite nennt, wie man das Konto löschen lässt.
Im Kiosk-Modus wird nicht gefragt. Der Fachservice sperrt namentliche
Auswertungen (Statistik) ohne Zustimmung mit `403 terms_required`.

Lokaler Seed (`scripts/handbook/seed.mjs`) und E2E-Anmeldung
(`e2e/support/login.ts`) stimmen für ihre Konten nach dem Login zu.

## AGB ändern

1. Text in `agb.component.ts` ändern.
2. `TERMS_VERSION` und `TERMS_DATE_LABEL` in `legal-operator.ts` und
   `vereint.legal.terms-version` (`TERMS_VERSION`) im Fachservice auf das neue
   Datum setzen.
3. Nutzer nach § 14 der AGB mindestens sechs Wochen vorher informieren.
4. Alle Konten werden nach dem nächsten Login um Zustimmung zur neuen Fassung
   gebeten.

## Vor dem Freischalten der Registrierung

Die Texte sind ein Entwurf ohne anwaltliche Prüfung. Offen und Sache des
Betreibers:

- Platzhalter füllen (siehe oben) und die Texte prüfen lassen.
- Datenschutzerklärung (die AGB verweisen darauf) und Vertrag zur
  Auftragsverarbeitung mit den Gruppen (AGB § 10 Abs. 4).
- Löschen von Konto oder Gruppe auf Anfrage geht heute von Hand (AGB § 10
  Abs. 3).
