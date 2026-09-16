# Fehlerbehandlung & Idempotenz-Standards

Die **Vereint**-Plattform setzt auf strikte Fehlerstandards nach **RFC 7807 (Problem Details for HTTP APIs)** und garantiert durchgängige Transaktionssicherheit über serverseitig geprüfte **Idempotenzschlüssel**.

---

## 🛑 RFC 7807 Problem Details Standard

Jede fehlerhafte Antwort des Backends wird im standardisierten JSON-Format `application/problem+json` zurückgegeben:

```json
{
  "type": "https://vereint.example/problems/account_disabled",
  "title": "Forbidden",
  "status": 403,
  "detail": "Benutzerkonto ist gesperrt und kann keine Kassenbuchungen ausführen",
  "instance": "/api/v1/ledger/purchases",
  "code": "account_disabled",
  "traceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-15T06:45:00.123Z",
  "details": [
    "Wenden Sie sich an den Vereinsvorstand zur Klärung des Status."
  ]
}
```

### Problem Detail Erweiterungsfelder
- **`code`**: Stabiler, sprachneutraler Fehlerbezeichner aus `ErrorCode.kt` zur clientseitigen Programmlogik.
- **`traceId`**: Eindeutige Korrelations-ID (identisch mit dem HTTP-Response-Header `X-Request-Id`) zur Nachverfolgung in Server-Logs.
- **`timestamp`**: ISO-8601-Zeitstempel des Fehlereintritts.
- **`details`**: Optionale Liste von Validierungsfehlern (z. B. fehlerhafte Formularfelder).

---

## 📖 Katalog der Fehlercodes (`ErrorCode.kt`)

| Fehlercode (`code`) | HTTP-Status | Beschreibung & Ursache |
| :--- | :---: | :--- |
| `oidc_login_failed` | `401 Unauthorized` | OIDC Login oder Token-Austausch fehlgeschlagen. |
| `oidc_session_expired` | `401 Unauthorized` | OIDC Sitzung oder Refresh-Token ist abgelaufen. |
| `account_disabled` | `403 Forbidden` | Benutzer wurde durch Administration gesperrt (`disabled = true`). |
| `access_denied` | `403 Forbidden` | Fehlende Berechtigung für die angeforderte Ressource. |
| `permission_denied` | `403 Forbidden` | Spezifische Berechtigung (z. B. `purchase.tablet`) fehlt. |
| `role_not_assigned` | `403 Forbidden` | Erforderliche Benutzerrolle ist dem Benutzer nicht zugewiesen. |
| `consent_required` | `403 Forbidden` | Fehlende explizite Zustimmung (z. B. Standortfreigabe bei Moments). |
| `self_service_disabled` | `403 Forbidden` | Self-Service Barcode-Kauf ist für dieses Benutzerkonto deaktiviert. |
| `self_privilege_change_denied` | `403 Forbidden` | Administratoren dürfen sich eigene Privilegien nicht selbst entziehen. |
| `last_admin_protected` | `403 Forbidden` | Der letzte verbleibende Administrator kann nicht degradiert werden. |
| `not_found` | `404 Not Found` | Angefragte Ressource (User, Event, Drink, Sublist) existiert nicht. |
| `profile_not_found` | `404 Not Found` | Kein lokaler Vereinsdatensatz für den OIDC-Subject vorhanden. |
| `invitation_expired` | `410 Gone` | Gast-Einladungstoken ist zeitlich abgelaufen. |
| `invitation_revoked` | `410 Gone` | Einladungslink wurde manuell storniert oder Limit erreicht. |
| `event_not_active` | `409 Conflict` | Event ist nicht im Status `active` (Thekenbuchung nicht erlaubt). |
| `drink_not_in_event` | `409 Conflict` | Getränk ist nicht für dieses Event in der Subliste freigeschaltet. |
| `ledger_already_corrected` | `409 Conflict` | Buchung wurde bereits durch eine Gegenbuchung storniert. |
| `idempotency_conflict` | `409 Conflict` | Idempotenzschlüssel wurde mit abweichenden Parametern wiederverwendet. |
| `concurrent_modification` | `409 Conflict` | Optimistic Lock Fehler (`version` Konflikt bei paralleler Bearbeitung). |
| `data_integrity_violation` | `409 Conflict` | Datenbankintegritätsverletzung (z. B. Unique Constraint oder Fremdschlüssel). |
| `idempotency_key_required` | `400 Bad Request` | Pflicht-Header `Idempotency-Key` fehlt bei Kassenbuchung. |
| `invalid_request` | `400 Bad Request` | Ungültiges Anfrageformat oder Parameterkonflikt. |
| `validation_failed` | `400 / 422` | Bean-Validierungsfehler (z. B. ungültige E-Mail, negativer Preis). |
| `internal_error` | `500 Server Error` | Unerwarteter interner Serverfehler. |

---

## 🔑 Idempotenz-Muster & Header-Spezifikation

Bei Netzwerkabbrüchen (z. B. Funkloch an der Theke oder Reload) sendet der Client dieselbe Buchungsanfrage erneut. Der Server garantiert, dass der Buchungsvorgang exakt einmal ausgeführt wird (*Exactly-Once Semantik*).

### 1. HTTP-Header-Vorgabe
```http
POST /api/v1/ledger/purchases HTTP/1.1
Host: api.vereint.local
Authorization: Bearer <JWT>
Idempotency-Key: e4b0f98e-4a67-4f92-959c-1c88d87a4192
Content-Type: application/json
```

### 2. Idempotenz-Scopes
| Scope | Endpunkt | Zweck |
| :--- | :--- | :--- |
| `ledger:purchase` | `POST /api/v1/ledger/purchases` | PWA Barcode-Kauf |
| `ledger:topup` | `POST /api/v1/ledger/topups` | Guthabenaufladung |
| `ledger:payout` | `POST /api/v1/ledger/payouts` | Guthabenauszahlung |
| `ledger:correction` | `POST /api/v1/ledger/corrections` | Stornobuchung |
| `tablet:purchase` | `POST /api/v1/tablet/events/{id}/purchases` | Kiosk 1-Tap Touch-Kauf |
| `tablet:round` | `POST /api/v1/tablet/events/{id}/rounds` | Kiosk Rundenbuchung |
| `tablet:evening` | `POST /api/v1/tablet/events/{id}/evening` | Kiosk Abendabrechnung |

### 3. Server-Ablauf & Speicherung in `idempotency_records`
1. Der Server prüft in PostgreSQL: `SELECT response_body, response_code FROM idempotency_records WHERE scope = :scope AND idempotency_key = :key`.
2. **Treffer**: Der Server überspringt die Geschäftslogik und liefert unmittelbar die zuvor gespeicherte HTTP-Antwort mit unverändertem Statuscode (z. B. `201 Created`).
3. **Neu**: Der Server führt die Buchung in einer Transaktion aus, persistiert das Ergebnis im Ledger und speichert die Antwort im selben Commit in `idempotency_records`.
