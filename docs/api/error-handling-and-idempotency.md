# Fehlerbehandlung & Idempotenz-Standards

Die **Vereint**-Plattform setzt auf strikte Fehlerstandards nach **RFC 7807 (Problem Details for HTTP APIs)** und schützt Buchungen über serverseitig geprüfte **Idempotenzschlüssel** vor doppelter Ausführung.

---

## 🛑 RFC 7807 Problem Details Standard

Jede fehlerhafte Antwort des Backends wird im standardisierten JSON-Format `application/problem+json` zurückgegeben:

```json
{
  "type": "https://vereint.example/problems/account_disabled",
  "title": "Forbidden",
  "status": 403,
  "detail": "Das Konto ist deaktiviert",
  "instance": "/api/v1/ledger/purchases",
  "code": "account_disabled",
  "traceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-15T06:45:00.123Z"
}
```

### Felder
- **`type`**: `https://vereint.example/problems/<code>`; **`title`** ist der Name des HTTP-Status.
- **`detail`**: Text in der Sprache aus `Accept-Language` (Deutsch oder Englisch).
- **`code`**: Stabiler, sprachneutraler Fehlerbezeichner aus `ErrorCode.kt` zur clientseitigen Programmlogik.
- **`traceId`**: Eindeutige Korrelations-ID (identisch mit dem HTTP-Response-Header `X-Request-Id`) zur Nachverfolgung in Server-Logs.
- **`timestamp`**: ISO-8601-Zeitstempel des Fehlereintritts.
- **`details`**: Nur bei Validierungsfehlern, als Liste `feld: meldung`.

---

## 📖 Katalog der Fehlercodes (`ErrorCode.kt`)

Die Zuordnung zu den Exceptions beschreibt [Fehlerbehandlung im Fachservice](../baseservice/05-error-handling-and-observability.md).

| Fehlercode (`code`) | HTTP-Status | Beschreibung & Ursache |
| :--- | :---: | :--- |
| `invalid_request` | `400` | Ungültige Parameter, leere Pflichtfelder oder ungültiges Format. |
| `validation_failed` | `400` | Bean-Validation-Fehler; Feldfehler stehen in `details`. |
| `consent_required` | `400` | Erforderliche Zustimmung fehlt (z. B. Standortfreigabe bei Moments). |
| `event_not_active` | `400` | Buchung oder Chat bei einem nicht aktiven, beendeten oder abgesagten Event. |
| `idempotency_key_required` | `400` | Header `Idempotency-Key` fehlt bei einer Buchung. |
| `drink_not_in_event` | `400` | Getränk gehört nicht zum Angebot des Events. |
| `password_rejected` | `400` | Keycloak lehnt das Passwort ab (Passwortregeln). |
| `terms_not_accepted` | `400` | Den AGB wurde bei Registrierung oder Eröffnung nicht zugestimmt. |
| `kiosk_pin_invalid_format` | `400` | Die Kiosk-PIN hat nicht 4 bis 8 Ziffern. |
| `video_too_long` | `400` | Video in Moments ist zu lang. |
| `access_denied` | `401` / `403` | Ohne gültiges Token `401`; sonst fehlende Berechtigung (`403`). |
| `oidc_login_failed`, `oidc_session_expired` | `401` | Anmeldung fehlgeschlagen bzw. Sitzung abgelaufen (vom BFF). |
| `permission_denied` | `403` | Zugriff von Spring Security verweigert. |
| `account_disabled` | `403` | Das Konto ist gesperrt. |
| `role_not_assigned`, `profile_not_found` | `403` | Rolle bzw. Benutzerprofil fehlt. |
| `self_service_disabled` | `403` | Selbstbuchung für diesen Artikel oder dieses Event abgeschaltet. |
| `credit_purchase_at_event` | `409` | Guthabenkauf ohne Event oder Fremdgetränk, obwohl die Person an einem laufenden Event mit Selbstbedienung teilnimmt; dort läuft der Kauf über das Event. |
| `no_catalog_price` | `404` | Das Getränk hat im Katalog der Gruppe keinen Preis; ein Guthabenkauf ohne Event ist nicht möglich. |
| `statistics_disabled` | `409` | Die Statistik ist für die Person oder die Gruppe ausgeschaltet; ein Fremdgetränk lässt sich nicht erfassen. |
| `self_privilege_change_denied` | `403` | Eigene Rollen, Berechtigungen oder den eigenen Status darf man nicht ändern. |
| `last_role_manager_protected` | `403` | Die Änderung nähme der Gruppe die letzte Person mit `members.manage` oder `roles.manage`. |
| `last_admin_protected` | `403` | Konstante vorhanden, derzeit ohne Auslöser. |
| `stammtisch_access_denied` | `403` | Kein aktives Mitglied der gewählten Gruppe. |
| `not_found` | `404` | Ressource existiert nicht (oder gehört zu einer anderen Gruppe). |
| `concurrent_modification` | `409` | Parallele Bearbeitung (`@Version`). |
| `data_integrity_violation` | `409` | Unique Constraint oder Fremdschlüssel verletzt. |
| `idempotency_conflict` | `409` | Gleicher `Idempotency-Key` mit anderen Buchungsdaten. |
| `ledger_already_corrected` | `409` | Buchung wurde bereits durch eine Gegenbuchung storniert. |
| `email_already_registered` | `409` | Für die E-Mail-Adresse gibt es schon ein Konto. |
| `stammtisch_required` | `409` | Fachlicher Endpunkt ohne gewählte Gruppe bei mehreren Mitgliedschaften. |
| `stammtisch_limit` | `409` | Höchstzahl selbst eröffneter Gruppen erreicht (`SIGNUP_MAX_OWNED`). |
| `invitation_expired`, `invitation_revoked`, `invitation_used_up` | `410` | Einladung abgelaufen, widerrufen bzw. ausgeschöpft. |
| `media_too_large` | `413` | Foto oder Video in Moments ist zu groß. |
| `internal_error` | `500` | Unerwarteter Serverfehler. |
| `registration_unavailable` | `503` | Kontoanlage über Keycloak ist nicht eingerichtet. |

---

## 🔑 Idempotenz-Muster & Header-Spezifikation

Bei Netzwerkabbrüchen (z. B. Funkloch an der Theke oder Reload) sendet der Client dieselbe Buchung erneut. Der Server bucht sie trotzdem nur einmal.

### 1. HTTP-Header
```http
POST /api/v1/ledger/purchases HTTP/1.1
Idempotency-Key: e4b0f98e-4a67-4f92-959c-1c88d87a4192
Content-Type: application/json
```

Der Schlüssel ist bei allen Buchungen Pflicht (`400 idempotency_key_required`) und höchstens 128 Zeichen lang. Der Client erzeugt ihn einmal je Buchung (z. B. eine UUID) und schickt ihn bei Wiederholungen unverändert mit.

### 2. Endpunkte und Scopes
| Scope | Endpunkte |
| :--- | :--- |
| `ledger-purchase` | `POST /api/v1/ledger/purchases`, `POST /api/v1/tablet/events/{id}/purchases` |
| `ledger-topup` | `POST /api/v1/ledger/topups` |
| `ledger-payout` | `POST /api/v1/ledger/payouts` |
| `ledger-correction` | `POST /api/v1/ledger/corrections`, `POST /api/v1/ledger/purchases/{entryId}/undo`, `POST /api/v1/tablet/events/{id}/purchases/{entryId}/undo` |

Geht ein Strich am Terminal auf eine Runde, steht die Buchung beim Geber. Ein wiederholter Strich mit demselben Schlüssel liefert diese Buchung, ohne die Runde erneut zu prüfen.

### 3. Ablauf im Server
1. Der Schlüssel steht an der Buchung selbst (`ledger_entries.idempotency_key`).
2. **Gibt es schon eine Buchung mit diesem Schlüssel** und stimmen Art, Mitglied, Betrag und Währung überein, liefert der Server diese Buchung erneut, ohne neu zu buchen.
3. **Weichen die Daten ab**, antwortet er mit `409 idempotency_conflict`.
4. **Sonst** legt er die Buchung an und vermerkt Scope und Schlüssel in derselben Transaktion in `idempotency_records` (gültig 30 Tage). Die Spalten `request_hash`, `response_status` und `response_payload` sind vorhanden, werden derzeit aber nicht befüllt.
