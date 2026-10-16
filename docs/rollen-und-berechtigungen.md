# Rollen und Berechtigungen

Rollen werden in Keycloak gepflegt (Realm `vereint`) und vom Fachservice bei
jeder Anfrage geprüft. Die Oberfläche blendet aus, was eine Rolle nicht darf; die
eigentliche Prüfung passiert immer im Backend.

| Rolle in der App | Keycloak-Rolle | Darf zusätzlich |
| :--- | :--- | :--- |
| **Mitglied** | `member` | Events sehen und zusagen, Chat, eigenes Guthaben und Käufe, per Barcode bezahlen, Getränke vorschlagen, Moments, Statistiken |
| **Vorstand** | `board` | Events anlegen und verwalten, Guthaben aller Mitglieder buchen (Kasse), Katalog pflegen und freigeben, Einkaufspreise, Rundbriefe und Infotafel, Einladungslinks, Moment-Typen und Reaktionen, Kiosk-Geräte entsperren, fremde Bilder und Videos aus Moments entfernen |
| **Administration** | `admin` | Alles vom Vorstand, dazu Mitglieder und Rollen verwalten, Konten deaktivieren, Audit-Protokoll |
| **Terminal** | `tabletRecorder` | Das Thekenterminal bedienen (Striche für Mitglieder buchen), Kiosk-Modus mit PIN starten |

Zusätzlich gibt es Vorstandsfunktionen als Kennzeichnung: `chair` (Vorsitz),
`treasurer` (Kasse), `secretary` (Schriftführung) und `assessor` (Beisitz).

Wichtige Regeln:

- Wer sich über einen [Einladungslink](Funktionen#mitglieder-per-einladungslink)
  registriert, bekommt **nur** `member`. Weitere Rollen vergibt die
  Administration.
- Mitglieder können ihr eigenes Guthaben nicht aufladen und sehen diese Option
  auch nicht.
- Der Vorstand darf IDs sehen, arbeitet in Formularen aber mit Namen.

Rechtematrix und technische Umsetzung:
[docs/architecture/security-and-auth.md](https://github.com/damaurer/vereint/blob/develop/docs/architecture/security-and-auth.md),
[docs/baseservice/03-security-and-authorization.md](https://github.com/damaurer/vereint/blob/develop/docs/baseservice/03-security-and-authorization.md)
