# Leitfaden Administration

Für Administratorinnen und Administratoren. Du hast alle Rechte des Vorstands (siehe [Leitfaden Vorstand](03-vorstand.md)) und zusätzlich die **Administration**. Diese Arbeit erledigst du am besten am Rechner; die Bilder zeigen deshalb die Rechneransicht.

## Mitgliederliste

<img src="bilder/a-mitglieder.png" alt="Mitgliederliste" width="720">

Unter **Verwaltung → Administration** stehen alle Mitglieder mit E-Mail, Rolle, Status und Beitrittsdatum.

- Das **Suchfeld** filtert nach Namen, **Rolle: Alle** nach einer Rolle.
- **Aktiv** heißt: Das Mitglied kann sich anmelden und die App nutzen.
- **Bearbeiten** öffnet die Einstellungen eines Mitglieds.

Neue Mitglieder lädst du per Link ein (siehe unten). Nach ihrer Registrierung erscheinen sie in dieser Liste.

## Neue Mitglieder einladen

<img src="bilder/a-einladen.png" alt="Einladungslink erstellen" width="720">

Neue Mitglieder registrieren sich selbst über einen Einladungslink. Links erstellen Administration und Vorstand, entweder hier mit **Mitglied einladen** oder unter **Vorstand** → **Mitglied einladen**.

1. **Für wen?**: optional ein Name, damit du den Link später wiedererkennst.
2. **Gültig für**: wie lange der Link gilt, z. B. 7 Tage.
3. **Anzahl Personen**: wie viele sich mit diesem Link registrieren dürfen, meist 1.
4. **Link erstellen** tippen.
5. **Link kopieren** (am Handy **Teilen**) und an die Person schicken, etwa per Messenger oder E-Mail. **Der Link wird nur dieses eine Mal angezeigt.**

Unter **Einladungslinks** siehst du jeden Link mit Stand (**Offen**, **Verwendet**, **Abgelaufen**, **Zurückgezogen**), wie oft er schon genutzt wurde und wer sich damit registriert hat. **Zurückziehen** macht einen Link sofort ungültig.

Wer sich über den Link registriert, ist danach normales Mitglied mit der Rolle `member`. Weitere Rollen vergibst du anschließend unter **Bearbeiten**. Wie die Registrierung für die eingeladene Person aussieht, steht in den [Ersten Schritten](01-erste-schritte.md#mit-einem-einladungslink-registrieren).

## Ein Mitglied bearbeiten

<img src="bilder/a-bearbeiten.png" alt="Mitglied bearbeiten" width="720">

Nach **Bearbeiten** erscheint unter der Liste der Bereich „… bearbeiten“ mit der Mitglieds-ID. Jede Einstellung speicherst du mit ihrem eigenen Knopf.

**Rollen**, dann **Rollen speichern**:

| Rolle | Bedeutung |
| :--- | :--- |
| `member` | Mitglied: Termine, Guthaben, Käufe, Moments |
| `board` | Vorstand: Kasse, Events moderieren, Getränke freigeben, Mitteilungen |
| `admin` | Administration: alles, dazu Mitglieder verwalten und das Thekenterminal |
| `tabletRecorder` | Thekenterminal: Striche für alle Mitglieder erfassen |

**Vorstands-Unterrolle** (z. B. Kassenwart, Schriftwart) und **Drink Recorder**, dann **Profil speichern**. Drink Recorder schaltet das Thekenterminal für dieses Mitglied frei, etwa für den Thekendienst am eigenen Handy.

**Deaktiviert**, dann **Status speichern**: sperrt das Konto. Das Mitglied kann Vereint nicht mehr nutzen, seine Buchungen bleiben erhalten. Zum Entsperren den Haken wieder entfernen.

Gut zu wissen: Die Rechte im Hintergrund wirken sofort. Die **Menüpunkte** für Vorstand und Administration richten sich aber nach den Rollen im Anmeldesystem (Keycloak). Wer neu Vorstand wird, braucht die Rolle `board` deshalb auch dort, damit ihm die Vorstandsseiten angezeigt werden.

Die Tabelle **Rollen & Berechtigungen** darunter ist eine Vorschau. Änderungen dort werden nicht gespeichert.

## Thekentablet einrichten

1. Ein eigenes Konto für die Theke anlegen, z. B. „Theke Vereinsheim“: per Einladungslink registrieren und danach unter **Bearbeiten** die Rolle `tabletRecorder` geben.
2. Am Tablet mit diesem Konto anmelden und **Angemeldet bleiben** anhaken.
3. **Verwaltung → Thekenterminal** öffnen und **Kiosk-Modus starten**, damit das Tablet auf der Strichliste bleibt. Der Rest steht im [Leitfaden Thekenterminal](05-thekenterminal.md).

Ein eigenes Thekenkonto ist besser als ein persönliches: So erscheint auf dem Tablet kein privates Guthaben, und im Protokoll ist klar, welche Striche vom Tablet kamen.

## Passwort vergessen

Vereint verschickt keine E-Mails, deshalb gibt es keinen Link zum Zurücksetzen. Hat jemand sein Passwort vergessen, setzt die Administration in der Keycloak-Verwaltung (Realm `vereint` → *Users* → Person → *Credentials* → *Reset password*) ein neues Passwort mit **Temporary** an. Die Person muss es beim nächsten Anmelden ändern. Wie man die Keycloak-Verwaltung erreicht, steht in [`deploy/README.md`](../../deploy/README.md#keycloak-verwaltung).
