# Fachdomäne: Kalender, Freunde und Direktnachrichten

Drei Bereiche gehören nicht zu einer einzelnen Gruppe, sondern zur Person. Sie
funktionieren über alle Gruppen, in denen jemand Mitglied ist, und laufen ohne
gewählte Gruppe.

| Bereich | App | API |
| :--- | :--- | :--- |
| Persönlicher Kalender | `/kalender` | `GET /api/v1/calendar` |
| Freundesliste | `/freunde` | `/api/v1/friends` |
| Direktnachrichten | `/direktnachrichten` | `/api/v1/direct-conversations` |

Die strikte Trennung der Gruppen bleibt bestehen: Niemand sieht über diese
Bereiche etwas aus einer Gruppe, in der er nicht selbst aktives Mitglied ist.

---

## 🎯 Fachliche Sicht

### Kalender

- Zeigt je Monat alle Events, die man in seinen Gruppen sehen darf, vergangene
  wie künftige, und die Moments dieser Events.
- Events und Moments bleiben Teil ihrer Gruppe. Der Kalender zeigt sie nur
  gesammelt an; jeder Eintrag nennt seine Gruppe.
- Sichtbar ist dasselbe wie auf der Event-Seite der jeweiligen Gruppe: eigene
  Events, Events mit Einladung und mit `event.manage` alle Events der Gruppe.
  Entwürfe erscheinen nur bei der Person, die sie angelegt hat.
- Ein Klick auf einen Eintrag einer anderen Gruppe wechselt erst in diese Gruppe
  und öffnet den Eintrag dann dort.
- Die App filtert auf Wunsch nach einer Gruppe.

### Freundesliste

- Freundschaft entsteht per Anfrage und Annahme. Fragen sich zwei Personen
  gegenseitig an, sind sie sofort befreundet.
- Anfragen gehen nur an Personen, mit denen man eine Gruppe teilt. Eine freie
  Suche über alle Konten gibt es nicht. Wer keine Gruppe teilt, gilt für die
  API als „nicht gefunden“ (`404`), damit keine fremden Konten sichtbar werden.
- Freundschaften bleiben, wenn jemand eine Gruppe verlässt.
- Anfragen ablehnen, zurückziehen und Freundschaften beenden geht jederzeit.
- Neben jeder Person stehen die gemeinsamen Gruppen. Genannt werden nur Gruppen,
  in denen man selbst Mitglied ist.

### Direktnachrichten

- Je Personenpaar gibt es genau ein Gespräch, egal aus welcher Gruppe.
- Ein Gespräch beginnen und neu schreiben darf man mit Freunden und mit
  Personen, mit denen man eine Gruppe teilt.
- Fällt beides weg, bleibt der Verlauf lesbar, neue Nachrichten gehen aber nicht
  mehr (`canWrite = false`, beim Senden `403`).
- Lesen und schreiben dürfen nur die beiden Beteiligten. Wer nicht beteiligt
  ist, erfährt nicht, ob es das Gespräch gibt (`404`).
- Ungelesene Direktnachrichten zählen im Badge am Chat-Eintrag mit, egal welche
  Gruppe gerade gewählt ist.
- Nachrichten werden wie alle Chats mit AES-256-GCM verschlüsselt gespeichert.

### Push-Benachrichtigungen

- Eine neue Direktnachricht, eine neue Freundschaftsanfrage und eine
  angenommene Anfrage lösen bei der jeweils anderen Person einen Web-Push aus,
  egal welche Gruppe dort gerade gewählt ist. Gruppenchats bleiben ohne Push.
- Wie alle Pushes tragen sie keinen Inhalt. Der Service Worker lädt
  `/api/v1/notifications` (Mitteilungen der gewählten Gruppe) und
  `/api/v1/personal-notifications` und zeigt die neueste ungelesene Mitteilung.
- Die persönlichen Mitteilungen werden nicht gespeichert, sondern aus den Daten
  berechnet: je Gespräch die neueste ungelesene Nachricht, jede offene Anfrage
  an mich und für 15 Minuten jede eigene Anfrage, die angenommen wurde. Sie
  erledigen sich, sobald das Gespräch gelesen bzw. die Anfrage beantwortet ist.
  In der Glocke erscheinen sie nicht; dafür gibt es den Chat-Zähler und die
  Freundesliste.
- Direktnachrichten eines Gesprächs ersetzen auf dem Gerät einander, statt sich
  zu stapeln.

---

## ⚙️ Technische Sicht

### Daten

Migration `017-friends-and-direct-messages.xml`:

| Tabelle | Inhalt |
| :--- | :--- |
| `friendships` | Je Paar eine Zeile (`pair_key` = sortierte Konto-IDs), Status `pending` oder `accepted` |
| `direct_conversations` | Je Paar ein Gespräch (`pair_key`) |
| `direct_participants` | Die beiden Beteiligten mit Lesestand (`last_read_at`) |
| `direct_messages` | Nachrichten (verschlüsselt) |
| `direct_reactions` | Emoji-Reaktionen |

Diese Tabellen gehören wie `users` den Konten und keiner Gruppe. Sie haben
deshalb keine Spalte `stammtisch_id`, erben nicht von `StammtischScoped` und
haben keine Row-Level-Security. Den Zugriff prüfen allein die Fachservices: Jede
Zeile geht nur an die beiden beteiligten Personen.

Changeset 212 zieht die bisherigen Direktnachrichten (je Gruppe in
`conversations` mit `type = 'direct'`) in die neuen Tabellen um. Hatte ein Paar
in mehreren Gruppen schon einen Direktchat, werden die Verläufe zu einem
Gespräch zusammengeführt. Die Nachrichten bleiben unverändert verschlüsselt, da
der Schlüssel nicht an der Gruppe hängt.

### Komponenten

- `SharedGroups` (`tenancy`): Personen aus den eigenen Gruppen samt gemeinsamen
  Gruppen. Liest im System-Kontext, gibt aber nur Personen und Gruppen heraus,
  in denen die fragende Person selbst aktives Mitglied ist.
- `FriendService` / `FriendController`: Freundesliste.
- `DirectMessageService` / `DirectConversationController`: Direktnachrichten.
- `PersonalAlertService` / `PersonalNotificationController`: persönliche
  Mitteilungen für den Service Worker. `FriendService` und
  `DirectMessageService` lösen den Push über den `PushDispatcher` aus.
- `CalendarService` / `CalendarController`: Kalender. Liest je eigener Gruppe in
  einer eigenen, nur lesenden Transaktion im Kontext genau dieser Gruppe
  (`TenantTransactions.readInStammtisch`). Hibernate-Filter und
  Row-Level-Security greifen dabei wie bei jeder Anfrage in dieser Gruppe; die
  Rechte stammen aus der Mitgliedschaft in dieser Gruppe.
- `StammtischContextFilter`: `/api/v1/calendar`, `/api/v1/friends`,
  `/api/v1/direct-conversations` und `/api/v1/personal-notifications` laufen ohne gewählte Gruppe und bleiben auch in
  einer nur lesbaren Gruppe (Zahlung überfällig) nutzbar.

### Endpunkte

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/api/v1/calendar?from=…&to=…` | Einträge im Zeitraum `[from, to)` (ISO-Zeitpunkte, höchstens 400 Tage; ohne Angabe 31 Tage zurück bis 62 Tage voraus) |
| `GET` | `/api/v1/friends` | Freunde, Anfragen an mich, eigene Anfragen |
| `GET` | `/api/v1/friends/contacts` | Personen aus den eigenen Gruppen plus Freunde, mit Status und gemeinsamen Gruppen |
| `POST` | `/api/v1/friends/requests` | Anfrage senden (`{ userId }`) |
| `POST` | `/api/v1/friends/requests/{userId}/accept` | Anfrage annehmen |
| `DELETE` | `/api/v1/friends/{userId}` | Anfrage ablehnen oder zurückziehen, Freundschaft beenden |
| `GET` | `/api/v1/direct-conversations` | Eigene Gespräche (`ConversationSummaryDto`, `type = direct`) |
| `GET` | `/api/v1/direct-conversations/unread-count` | Ungelesene Direktnachrichten |
| `POST` | `/api/v1/direct-conversations` | Gespräch beginnen oder bestehendes liefern (`{ userId }`) |
| `GET` / `POST` | `/api/v1/direct-conversations/{id}/messages` | Nachrichten lesen bzw. senden |
| `POST` | `/api/v1/direct-conversations/{id}/read` | Als gelesen markieren |
| `POST` | `/api/v1/direct-conversations/{id}/messages/{messageId}/reactions` | Reaktion umschalten |
| `GET` | `/api/v1/personal-notifications` | Persönliche Mitteilungen für Push (`NotificationDto`, neueste zuerst) |

### Tests

`PersonalNetworkIntegrationTest` prüft mit zwei Gruppen: Anfragen nur an
Personen aus eigenen Gruppen, Freundschaft bleibt nach dem Verlassen einer
Gruppe, ein Gespräch je Paar über Gruppen hinweg, Sperre neuer Nachrichten ohne
Freundschaft und Gruppe, Kalender mit Einträgen beider Gruppen und ohne fremde
Entwürfe oder Events ohne Einladung, Push und persönliche Mitteilungen für
Direktnachrichten und Freundschaftsanfragen.
