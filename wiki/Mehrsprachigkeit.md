# Mehrsprachigkeit

Die App gibt es auf **Deutsch** (Standard und Rückfall) und **Englisch**.
Gewechselt wird im Profil, ohne Neuladen. Die gewählte Sprache gilt durchgängig:
in der Oberfläche, in Fehlermeldungen des Fachservice und auf der
Keycloak-Anmeldeseite.

## Wie die Sprache bestimmt wird

1. Cookie `vereint.lang`, sobald jemand im Profil eine Sprache wählt.
2. Sonst die Browsersprache.
3. Sonst Deutsch.

## Neue Sprache hinzufügen

Beispiel Französisch (`fr`):

1. **App-Texte:** `webservice/src/app/i18n/locales/de.json` nach `fr.json`
   kopieren und alle Werte übersetzen. Schlüssel und `{platzhalter}` bleiben
   gleich.
2. **Registrieren:** in `webservice/src/app/i18n/languages.ts` eine Zeile
   ergänzen:
   ```ts
   { code: 'fr', label: 'Français', locale: 'fr-FR', load: () => import('./locales/fr.json') },
   ```
3. **Fehlertexte des Fachservice:** `baseservice/src/main/resources/i18n/messages_en.properties`
   nach `messages_fr.properties` kopieren, übersetzen und `fr` in
   `vereint.i18n.supported-locales` (`application.yaml`) ergänzen.
4. **Anmeldeseiten:** im Keycloak-Theme `messages_fr.properties` anlegen, `fr` in
   `theme.properties` und in `supportedLocales` beider Realm-Exports ergänzen.
   Bestehende Realms übernehmen das nicht automatisch: dort einmalig unter
   *Realm settings → Localization* nachtragen.
5. `npm test` im `webservice/`.

Fehlt in einer Sprache ein Schlüssel, erscheint der deutsche Text.

## Texte im Code

Neue Texte kommen immer in **beide** Dateien `de.json` und `en.json`; ein Test
prüft, dass beide dieselben Schlüssel und Platzhalter haben. Ändern sich
sichtbare Texte, die E2E-Tests als Selektor nutzen, müssen die
[E2E-Tests](E2E-Tests) mit angepasst werden.

Mehr: [docs/frontend/i18n.md](https://github.com/damaurer/vereint/blob/develop/docs/frontend/i18n.md),
[docs/baseservice/i18n.md](https://github.com/damaurer/vereint/blob/develop/docs/baseservice/i18n.md)
