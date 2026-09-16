# Datenmodell & PostgreSQL-Schema

Das Datenmodell von **Vereint** ist auf maximale Konsistenz, Revisionssicherheit und Idempotenz ausgelegt. Die Schemastruktur wird vollständig über **Liquibase** versioniert und in **PostgreSQL 17** persistiert.

---

## 📊 Entity-Relationship-Diagramm (ERD)

```mermaid
erDiagram
    users ||--o{ user_roles : "has"
    users ||--o{ user_permissions : "has"
    users ||--o{ ledger_entries : "member"
    users ||--o{ event_participants : "participates"
    users ||--o{ chat_messages : "sends"
    users ||--o{ push_subscriptions : "owns"
    users ||--o{ image_assets : "owns"
    users ||--o{ drink_with_me_sessions : "hosts"

    events ||--o{ event_participants : "has"
    events ||--o{ event_invites : "creates"
    events ||--o{ event_guests : "hosts"
    events ||--o{ event_drinks : "offers"
    events ||--o{ ledger_entries : "generates"
    events ||--o{ drink_with_me_sessions : "scopes"

    drink_catalog ||--o{ drink_barcodes : "identifies"
    drink_catalog ||--o{ drink_sublist_items : "included_in"
    drink_catalog ||--o{ event_drinks : "offered_as"
    drink_catalog ||--o{ ledger_entries : "purchased_as"

    drink_sublists ||--o{ drink_sublist_items : "contains"

    ledger_entries ||--o| ledger_entries : "reverses"

    conversations ||--o{ conversation_members : "includes"
    conversations ||--o{ chat_messages : "contains"
```

---

## 🗄️ Tabellenkatalog & Schema-Details

### 1. Benutzer & Autorisierung
- **`users`**:
  - `id` (`UUID`, PK)
  - `keycloak_subject` (`VARCHAR(64)`, Unique) – Verknüpfung zum OIDC Identity Provider
  - `email` (`VARCHAR(255)`), `display_name` (`VARCHAR(255)`)
  - `disabled` (`BOOLEAN`, default `false`)
  - `drink_recorder` (`BOOLEAN`, default `false`)
  - `board_role` (`VARCHAR(32)`, Check: `chair`, `treasurer`, `secretary`, `assessor`)
  - `created_at` (`TIMESTAMPTZ`), `updated_at` (`TIMESTAMPTZ`)
  - `version` (`BIGINT`, Optimistic Locking)
- **`user_roles`**: `user_id` (FK `users.id`), `role` (`VARCHAR(32)`), PK composite (`user_id`, `role`)
- **`user_permissions`**: `user_id` (FK `users.id`), `permission` (`VARCHAR(64)`), PK composite (`user_id`, `permission`)

### 2. Kassenbuch & Transaktionssicherheit (Double-Entry Ledger)
- **`ledger_entries`**:
  - `id` (`UUID`, PK)
  - `member_id` (`UUID`, FK `users.id`, non-null)
  - `event_id` (`UUID`, FK `events.id`, nullable für Topups/Payouts/Korrekturen)
  - `drink_id` (`UUID`, FK `drink_catalog.id`, nullable für Topups/Payouts/Korrekturen)
  - `amount` (`DECIMAL(10,2)`, negativ bei Belastung/Kauf, positiv bei Einzahlung/Topup)
  - `currency` (`VARCHAR(3)`, default `'EUR'`)
  - `entry_type` (`VARCHAR(32)`, Check: `purchase`, `topup`, `payout`, `correction`)
  - `accounting_mode` (`VARCHAR(32)`, Check: `credit`, `revenueOnly`)
  - `source` (`VARCHAR(32)`, nullable, Check: `pwaBarcode`, `tabletManual`, `round`, `evening`)
  - `actor_id` (`UUID`, FK `users.id`)
  - `idempotency_key` (`VARCHAR(128)`, Unique)
  - `reverses_entry_id` (`UUID`, FK `ledger_entries.id`, RESTRICT delete) – Für Stornierungen
  - `created_at` (`TIMESTAMPTZ`)
- **`idempotency_records`**:
  - `id` (`UUID`, PK), `scope` (`VARCHAR(64)`), `idempotency_key` (`VARCHAR(128)`)
  - `response_code` (`INTEGER`), `response_body` (`TEXT`), `created_at` (`TIMESTAMPTZ`)
  - Unique Constraint auf `(scope, idempotency_key)` verhindert doppelte Ausführung.

### 3. Getränkekatalog & Sublisten
- **`drink_catalog`**:
  - `id` (`UUID`, PK), `name` (`VARCHAR(255)`), `description` (`TEXT`), `category` (`VARCHAR(64)`)
  - `default_price` (`DECIMAL(10,2)`), `currency` (`VARCHAR(3)`, default `'EUR'`), `volume_ml` (`INTEGER`)
  - `status` (`VARCHAR(32)`, Check: `proposed`, `approved`, `rejected`)
  - `catalog_version` (`INTEGER`, default `1`), `active` (`BOOLEAN`, default `true`)
  - `image_reference` (`VARCHAR(512)`), `image_asset_id` (FK `image_assets.id`)
  - `proposed_by_user_id` (FK `users.id`), `approved_by_user_id` (FK `users.id`)
  - `created_at` (`TIMESTAMPTZ`), `updated_at` (`TIMESTAMPTZ`), `version` (`BIGINT`)
- **`drink_barcodes`**: `id` (`UUID`, PK), `drink_id` (FK `drink_catalog.id`), `barcode` (`VARCHAR(128)`, Unique), `active` (`BOOLEAN`)
- **`drink_sublists`**: `id` (`UUID`, PK), `name` (`VARCHAR(255)`), `description` (`TEXT`), `created_by` (FK `users.id`)
- **`drink_sublist_items`**: `id` (`UUID`, PK), `sublist_id` (FK `drink_sublists.id`), `drink_id` (FK `drink_catalog.id`), `default_price` (`DECIMAL(10,2)`)
- **`event_drinks`**: `id` (`UUID`, PK), `event_id` (FK `events.id`), `drink_id` (FK `drink_catalog.id`), `price` (`DECIMAL(10,2)`), `currency` (`VARCHAR(3)`), `self_service_enabled` (`BOOLEAN`), `tablet_enabled` (`BOOLEAN`), `catalog_version` (`INTEGER`), `image_snapshot` (`VARCHAR(512)`)

### 4. Events & Einladungen
- **`events`**:
  - `id` (`UUID`, PK), `title` (`VARCHAR(255)`), `description` (`TEXT`), `location` (`VARCHAR(255)`)
  - `starts_at` (`TIMESTAMPTZ`), `ends_at` (`TIMESTAMPTZ`)
  - `status` (`VARCHAR(32)`, Check: `draft`, `published`, `active`, `cancelled`, `completed`, `archived`)
  - `owner_id` (`UUID`, FK `users.id`), `created_at` (`TIMESTAMPTZ`), `updated_at` (`TIMESTAMPTZ`), `version` (`BIGINT`)
- **`event_participants`**: `id` (`UUID`, PK), `event_id` (FK `events.id`), `user_id` (FK `users.id`), `role` (`VARCHAR(32)`), `joined_at` (`TIMESTAMPTZ`)
- **`event_invites`**: `id` (`UUID`, PK), `event_id` (FK `events.id`), `token_hash` (`VARCHAR(64)`, Unique SHA-256), `created_by` (FK `users.id`), `role` (`VARCHAR(32)`), `max_uses` (`INTEGER`), `uses_count` (`INTEGER`), `expires_at` (`TIMESTAMPTZ`), `revoked` (`BOOLEAN`)
- **`event_guests`**: `id` (`UUID`, PK), `event_id` (FK `events.id`), `invite_id` (FK `event_invites.id`), `display_name` (`VARCHAR(255)`), `status` (`VARCHAR(32)`, Check: `pending`, `active`, `revoked`, `expired`), `expires_at` (`TIMESTAMPTZ`)

### 5. Chat, Push & Standortfreigabe
- **`conversations`**: `id` (`UUID`, PK), `type` (`VARCHAR(32)`, default `'event'`), `title` (`VARCHAR(255)`), `event_id` (FK `events.id`)
- **`conversation_members`**: `id` (`UUID`, PK), `conversation_id` (FK `conversations.id`), `user_id` (FK `users.id`)
- **`chat_messages`**: `id` (`UUID`, PK), `conversation_id` (FK `conversations.id`), `sender_id` (FK `users.id`), `guest_id` (FK `event_guests.id`), `message` (`TEXT`), `image_url` (`VARCHAR(512)`), `created_at` (`TIMESTAMPTZ`)
- **`push_subscriptions`**: `id` (`UUID`, PK), `user_id` (FK `users.id`), `endpoint` (`TEXT`), `p256dh` (`VARCHAR(255)`), `auth` (`VARCHAR(255)`), `user_agent` (`VARCHAR(512)`)
- **`notifications`**: `id` (`UUID`, PK), `user_id` (FK `users.id`), `title` (`VARCHAR(255)`), `body` (`TEXT`), `type` (`VARCHAR(64)`), `read` (`BOOLEAN`), `created_at` (`TIMESTAMPTZ`)
- **`drink_with_me_sessions`**: `id` (`UUID`, PK), `event_id` (FK `events.id`), `user_id` (FK `users.id`), `latitude` (`DECIMAL(10,7)`), `longitude` (`DECIMAL(10,7)`), `message` (`VARCHAR(255)`), `active` (`BOOLEAN`), `expires_at` (`TIMESTAMPTZ`), `created_at` (`TIMESTAMPTZ`)
- **`image_assets`**: `id` (`UUID`, PK), `user_id` (FK `users.id`), `purpose` (`VARCHAR(32)`, Check: `profile`, `event`, `drink`, `drinkWithMe`), `target_id` (`VARCHAR(128)`), `storage_key` (`VARCHAR(512)`), `content_type` (`VARCHAR(128)`), `size_bytes` (`BIGINT`), `status` (`VARCHAR(32)`, Check: `active`, `deleted`)
- **`audit_logs`**: `id` (`UUID`, PK), `actor_id` (FK `users.id`), `action` (`VARCHAR(128)`), `target_entity` (`VARCHAR(64)`), `target_id` (`VARCHAR(128)`), `details` (`TEXT`), `ip_address` (`VARCHAR(64)`), `created_at` (`TIMESTAMPTZ`)

---

## 🔒 Datenbankseitige Integritätsregeln & Trigger

### Append-Only Trigger für das Kassenbuch (`002-integrity-constraints.xml`)
Um Manipulationen an historischen Buchungsdaten auszuschließen, verbietet ein PostgreSQL-Trigger jegliches `UPDATE` oder `DELETE` auf den Tabellen `ledger_entries` und `purchase_snapshots`:

```sql
CREATE OR REPLACE FUNCTION vereint_reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger is append-only: % on % is not allowed, use a compensating entry',
        TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION vereint_reject_ledger_mutation();
```

---

## 📜 Liquibase Migration Changelog Historie

| Changeset | Datei | Beschreibung |
| :--- | :--- | :--- |
| `001` | `001-initial-schema.xml` | Grundlegendes relationales Datenmodell (Users, Events, Drinks, Ledger, Chat, Push). |
| `002` | `002-integrity-constraints.xml` | CHECK-Constraints für Enums, Optimistic Locking (`version`), Append-Only Trigger für Ledger, Query-Indizes. |
| `003` | `003-drink-catalog-approval.xml` | Getränke-Vorschlagsworkflow (`proposed`, `approved`, `rejected`) mit `proposed_by` und `approved_by`. |
| `004` | `004-image-assets.xml` | S3 Metadatentabelle `image_assets` mit Zweckzuordnung (`profile`, `event`, `drink`, `drinkWithMe`). |
| `005` | `005-ledger-transactions.xml` | Erweiterte Buchungstypen (`topup`, `payout`, `correction`), Storno-Referenz (`reverses_entry_id`) und gelockerte Null-Constraints. |
