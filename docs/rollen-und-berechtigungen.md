# Rollen und Berechtigungen

Rollen gelten **je Gruppe**. Jede Gruppe hat eigene Rollen mit einzeln
zugeschnittenen Rechten; der Fachservice prüft sie bei jeder Anfrage für die
gerade gewählte Gruppe. Die Oberfläche blendet aus, was eine Rolle nicht darf;
die eigentliche Prüfung passiert immer im Backend.

## Systemrollen

Jede neue Gruppe erhält vier Systemrollen. Ihre Rechte lassen sich anpassen,
löschen lassen sie sich nicht.

| Rolle in der App | Code | Darf |
| :--- | :--- | :--- |
| **Mitglied** | `member` | Events sehen und zusagen, Chat, eigenes Guthaben und Käufe, per Barcode bezahlen, Getränke vorschlagen, Moments, Statistiken |
| **Vorstand** | `board` | Zusätzlich Events anlegen und verwalten, Guthaben aller Mitglieder buchen (Kasse), Katalog pflegen und freigeben, Einkaufspreise, Rundbriefe und Infotafel, Einladungslinks, Moment-Typen und Reaktionen, Kiosk-Geräte entsperren, fremde Bilder und Videos aus Moments entfernen |
| **Admin** | `admin` | Alles vom Vorstand, dazu Mitglieder und Rollen verwalten, Konten deaktivieren, Audit-Protokoll, Gruppe umbenennen, Daten exportieren, Tarif und Zahlung |
| **Theke** | `tabletRecorder` | Das Thekenterminal bedienen (Striche für Mitglieder buchen), Kiosk-Modus mit PIN starten |

Zusätzlich gibt es Vorstandsfunktionen als Kennzeichnung: `chair` (Vorsitz),
`treasurer` (Kasse), `secretary` (Schriftführung) und `assessor` (Beisitz).

## Eigene Rollen

Wer Rollen verwalten darf (`roles.manage`), legt unter *Gruppeneinstellungen →
Rollen & Berechtigungen* eigene Rollen an und schneidet Rechte zu. Zugewiesen
werden sie wie Systemrollen unter *Administration → Bearbeiten → Rollen*.
Eine Rolle „Kasse“ mit `ledger.read` sieht so die Kasse, aber nicht den
Adminbereich. Rechte für die Verwaltung:

| Recht | Wofür |
| :--- | :--- |
| `members.read` | Mitgliederliste und Rollen sehen |
| `members.invite` | Einladungslinks erstellen |
| `members.manage` | Mitglieder deaktivieren, Vorstandsamt setzen |
| `roles.manage` | Rollen anlegen, ändern, zuweisen |
| `stammtisch.manage` | Gruppe umbenennen, Bild, Daten exportieren |
| `billing.manage` | Tarif buchen, Zahlung und Rechnungen |
| `moments.manage` | Moment-Typen und Reaktionen verwalten |
| `kiosk.manage` | Kiosk-Geräte entsperren |
| `notifications.broadcast` | Rundschreiben senden |
| `chat.moderate` | Chatnachrichten anderer entfernen |
| `audit.read.all` | Audit-Log aller Mitglieder |

## Plattform-Admin

Die Keycloak-Realmrolle `admin` macht eine Person zum **Plattform-Admin** des
Vereint-Teams: Gruppen anlegen, umbenennen, archivieren und Tarife von Hand
vergeben (`/plattform`). Alle anderen Realmrollen (`board`, `member` …) haben
keine Wirkung mehr; Rollen kommen nur aus der gewählten Gruppe.

## Wichtige Regeln

- Wer über einen [Einladungslink](funktionen.md#mitglieder-per-einladungslink)
  beitritt, bekommt **nur** die Rolle Mitglied. Weitere Rollen vergibt die
  Gruppe selbst.
- Wer eine Gruppe eröffnet, wird ihr Admin.
- Die letzte Person, die Mitglieder **und** Rollen verwalten darf, kann diese
  Rechte nicht verlieren und die Gruppe nicht verlassen.
- Mitglieder können ihr eigenes Guthaben nicht aufladen und sehen diese Option
  auch nicht.
- Der Vorstand darf IDs sehen, arbeitet in Formularen aber mit Namen.

Rechtematrix und technische Umsetzung:
[docs/domains/stammtische.md](domains/stammtische.md),
[docs/architecture/security-and-auth.md](architecture/security-and-auth.md),
[docs/baseservice/03-security-and-authorization.md](baseservice/03-security-and-authorization.md)
