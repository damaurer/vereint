# Fachdomäne: Melden und Blockieren

Die App-Stores verlangen für Apps mit Inhalten anderer Personen, dass man
Inhalte melden und Personen blockieren kann (Issue #153). Vereint bietet beides
in der Web-App, damit eine spätere native App es nur noch anzeigen muss.

| Bereich | App | API |
| :--- | :--- | :--- |
| Melden oder blockieren | Chat: Reaktions-Auswahl einer fremden Nachricht → **Melden oder blockieren**; Moments: **Melden** am Moment oder an einer Antwort | `POST …/report`, `PUT /api/v1/blocks/{userId}` |
| Blockierte Personen | Profil → **Blockierte Personen** | `/api/v1/blocks` |
| Meldungen der Gruppe | `/meldungen` (Kachel **Meldungen** im Vorstand, mit Zahl offener Meldungen) | `/api/v1/reports` |
| Meldungen zu Direktnachrichten | `/plattform/meldungen` | `/api/v1/platform/reports` |

---

## 🎯 Fachliche Sicht

### Blockieren

- Gilt für die Person, nicht für eine Gruppe: über alle Gruppen und ohne
  gewählte Gruppe.
- Blockieren kann man nur, wen man kennt: gemeinsame Gruppe, Freundschaft oder
  bestehender Direktchat. Alle anderen Konten gelten als „nicht gefunden“.
- Für die blockierende Person verschwinden Nachrichten der blockierten Person
  aus allen Gruppen- und Event-Chats (auch aus Vorschau und Ungelesen-Zahl),
  ihre Moments, ihre Antworten auf Moments und der Direktchat mit ihr. Push von
  ihr kommt nicht mehr an.
- In beide Richtungen: keine Direktnachrichten und keine
  Freundschaftsanfragen. Eine bestehende Freundschaft endet.
- Die blockierte Person erfährt nichts. Sie sieht die Inhalte der
  blockierenden Person weiter; nur Direktnachrichten an sie gehen nicht mehr,
  mit demselben neutralen Hinweis wie ohne gemeinsame Gruppe. Daraus kann sie
  den Block erahnen; anders lässt sich das Senden nicht verhindern.
- Aufheben im Profil unter **Blockierte Personen**. Danach ist alles wieder
  sichtbar; eine beendete Freundschaft muss neu angefragt werden.

### Melden

- Melden lassen sich fremde Chatnachrichten (Gruppe, Event, Moment-Chat),
  Moments, Antworten auf Moments und Direktnachrichten. Eigene Inhalte nicht.
- Grund: Spam oder Werbung, Belästigung, unangemessener Inhalt oder etwas
  anderes, dazu eine freiwillige Notiz (bis 1.000 Zeichen). Im selben Dialog
  lässt sich die Person zusätzlich oder nur blockieren.
- Eine zweite Meldung derselben Person zum selben Inhalt legt keine neue offene
  Meldung an.
- **Wohin**: Inhalte einer Gruppe gehen an die Verwaltung dieser Gruppe, also an
  alle mit `chat.moderate` oder `members.manage` (Vorstand und Admin).
  Direktnachrichten gehören zu keiner Gruppe; ihre Meldungen gehen an die
  Anwendungs-Administration (Plattform-Admin).
- Die Meldung hält einen Auszug des Textes fest (verschlüsselt gespeichert),
  damit sie auch dann noch verständlich ist, wenn der Inhalt inzwischen geändert
  oder gelöscht wurde. Der Name der meldenden Person ist für die Bearbeitenden
  sichtbar.

### Bearbeiten

- **Inhalt entfernen** löscht den Inhalt endgültig: die Chatnachricht mit ihren
  Fotos und Videos, die Antwort mit ihren Medien bzw. den Moment mit Antworten,
  Medien und Moment-Chat. Weitere offene Meldungen zum selben Inhalt werden
  mit geschlossen.
- **Ohne Folgen schließen** schließt die Meldung, der Inhalt bleibt.
- Erledigte Meldungen bleiben mit Ergebnis, Name und Zeitpunkt sichtbar
  (Schalter **Erledigte Meldungen zeigen**). Beide Ergebnisse stehen in der
  Gruppe zusätzlich im Audit-Log (`REPORT_CONTENT_REMOVED`,
  `REPORT_DISMISSED`).
- Eine Mitteilung an die Bearbeitenden gibt es nicht; die Vorstandsübersicht
  zeigt die Zahl offener Meldungen an der Kachel **Meldungen**.

---

## ⚙️ Technische Sicht

### Daten (Migration `032-reports-and-blocks.xml`)

| Tabelle | Inhalt | Gruppe / RLS |
| :--- | :--- | :--- |
| `user_blocks` | `blocker_id`, `blocked_id`, `created_at`; ein Paar höchstens einmal | gruppenübergreifend, ohne RLS (wie `friendships`) |
| `content_reports` | Meldungen zu Inhalten einer Gruppe: Zieltyp und -ID, Kontext (Chat bzw. Moment), Autor, Grund, Notiz und Auszug (beide verschlüsselt), Status, Ergebnis, wer und wann erledigt | `stammtisch_id` + RLS-Policy `stammtisch_isolation`, Entity `StammtischScoped` |
| `direct_reports` | gleiche Spalten für Direktnachrichten | ohne Gruppe, nur Plattform-Admin |

### Komponenten

- `BlockService`: Liste, Blockieren, Aufheben; `hiddenFor(userId)` (wen ich
  ausblende), `blockersOf(userId)` (wer keine Push von mir bekommt) und
  `blockedEitherWay(a, b)`.
- Ausblenden an der Quelle: `ConversationService` und `ChatService`
  (Nachrichten, letzte Nachricht, Ungelesen-Zahl), `DirectMessageService`
  (Liste, Ungelesen, Schreibrecht), `FriendService` (Anfragen, Kontakte),
  `MomentService` (Listen, Antworten, Start-Push), `ChatNotifier` (Push).
- `ReportService`: Melden mit denselben Leserechten wie die Anzeige des Inhalts
  (`requireReadableConversation`, `requireMomentAccess`,
  `requireReadableDirect`), Listen und Erledigen.
- `ModerationController`: alle Endpunkte unten.
- Web-App: `moderation/` (API-Service, Dialog `app-report-dialog`, Profilteil
  `app-blocked-users`, Seite `ReportsComponent` für beide Listen).

### Endpunkte

| Methode | Pfad | Wer |
| :--- | :--- | :--- |
| `GET` | `/api/v1/blocks` | Angemeldet |
| `PUT` / `DELETE` | `/api/v1/blocks/{userId}` | Angemeldet |
| `POST` | `/api/v1/conversations/{id}/messages/{messageId}/report` | Wer den Chat lesen darf |
| `POST` | `/api/v1/moments/{id}/report` | Wer den Moment sehen darf |
| `POST` | `/api/v1/moments/{id}/responses/{responseId}/report` | Wer den Moment sehen darf |
| `POST` | `/api/v1/direct-conversations/{id}/messages/{messageId}/report` | Teilnehmende des Direktchats |
| `GET` | `/api/v1/reports[?all=true]`, `/api/v1/reports/open-count` | `chat.moderate` oder `members.manage` |
| `POST` | `/api/v1/reports/{id}/resolve` (`removed` / `dismissed`) | `chat.moderate` oder `members.manage` |
| `GET` | `/api/v1/platform/reports[?all=true]` | Plattform-Admin |
| `POST` | `/api/v1/platform/reports/{id}/resolve` | Plattform-Admin |

### Tests

- `ModerationIntegrationTest`: Wirkung des Blockierens (Chat, Push,
  Direktnachrichten, Freundschaft, Moments, Aufheben), Gruppenmeldungen mit
  Entfernen und Schließen, Meldung einer Direktnachricht an die Plattform.
- `RowLevelSecurityIntegrationTest`: Policy für `content_reports`.
- Web-App: Specs für Dialog, Meldungsliste und Blockierliste.
