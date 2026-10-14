# Leitfaden Administration

Für Administratorinnen und Administratoren. Du hast alle Rechte des Vorstands (siehe [Leitfaden Vorstand](03-vorstand.md)) und zusätzlich die **Administration**. Diese Arbeit erledigst du am besten am Rechner; die Bilder zeigen deshalb die Rechneransicht.

## Mitgliederliste

<img src="bilder/a-mitglieder.png" alt="Mitgliederliste" width="720">

Unter **Verwaltung → Administration** stehen alle Mitglieder mit E-Mail, Rolle, Status und Beitrittsdatum.

- Das **Suchfeld** filtert nach Namen, **Rolle: Alle** nach einer Rolle.
- **Aktiv** heißt: Das Mitglied kann sich anmelden und die App nutzen.
- **Bearbeiten** öffnet die Einstellungen eines Mitglieds.

Neue Mitglieder werden derzeit im Anmeldesystem (Keycloak) angelegt. Nach ihrer ersten Anmeldung erscheinen sie in dieser Liste. „Mitglied einladen“ ist noch eine Vorschau und verschickt keine Einladung; die Einladung per Link ist in Arbeit.

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

1. Im Anmeldesystem ein eigenes Konto für die Theke anlegen, z. B. „Theke Vereinsheim“, mit der Rolle `tabletRecorder`.
2. Am Tablet mit diesem Konto anmelden und **Angemeldet bleiben** anhaken.
3. **Verwaltung → Thekenterminal** öffnen. Der Rest steht im [Leitfaden Thekenterminal](05-thekenterminal.md).

Ein eigenes Thekenkonto ist besser als ein persönliches: So erscheint auf dem Tablet kein privates Guthaben, und im Protokoll ist klar, welche Striche vom Tablet kamen.
