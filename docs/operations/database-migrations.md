# Betriebshandbuch: Datenbankmigrationen (Liquibase)

Alle Datenbankschema-Änderungen in **Vereint** werden über **Liquibase** versioniert und beim Start von `baseservice` automatisch ausgeführt.

---

## 🏗️ Struktur des Changelogs

```text
baseservice/src/main/resources/db/changelog/
├── db.changelog-master.xml               # Master-Inklusionsdatei
└── changes/
    ├── 001-initial-schema.xml            # Tabellen: Users, Events, Drinks, Ledger, Chat, Push
    ├── 002-integrity-constraints.xml     # Constraints, Optimistic Locking, Append-Only Trigger
    ├── 003-drink-catalog-approval.xml    # Getränke-Vorschlags- & Freigabefelder
    ├── 004-image-assets.xml              # S3 Bildmetadaten-Tabelle
    ├── 005-ledger-transactions.xml       # Erweiterte Buchungsarten (topup, payout, correction)
    ├── 007-food-and-cost-prices.xml      # Speisenkatalog, Eventspeisen, Einkaufspreise & Deckungsbeitrag
    ├── 008-encrypted-content.xml         # Verschlüsselte Mitteilungstitel
    ├── 009-chat-and-rsvp.xml             # Chat-Lesestand, Direktnachrichten, Reaktionen, Zusagen
    ├── 010-member-invites.xml            # Einladungslinks in die Gruppe
    ├── 011-kiosk-sessions.xml            # Kiosk-Sitzungen
    ├── 012-moment-types-and-media.xml    # Moment-Typen, Reaktionen, Fotos und Videos
    ├── 013-stammtische.xml               # Gruppen, Mitgliedschaften, Rollen je Gruppe, Row-Level-Security
    ├── 014-drink-library.xml             # Gemeinsame Getränkedatenbank
    ├── 015-billing.xml                   # Tarife und Stripe
    └── 016-terms-acceptance.xml          # Zustimmung zu den AGB je Konto
```

Die Nummer `006` ist nicht vergeben.

---

## 📜 Migrations-Changelog Übersicht

| ID / Präfix | Datei | Zweck | Rollback-Fähig |
| :--- | :--- | :--- | :---: |
| `001-023` | `001-initial-schema.xml` | Initiale Basistabellen und Fremdschlüssel | ✅ |
| `101-106` | `002-integrity-constraints.xml` | Check-Constraints, Version-Spalten, Trigger `vereint_reject_ledger_mutation` | ✅ |
| `201-202` | `003-drink-catalog-approval.xml` | Statusfeld (`proposed`, `approved`, `rejected`) für Getränkekatalog | ✅ |
| `301-302` | `004-image-assets.xml` | `image_assets` Tabelle für S3 Storage Keys | ✅ |
| `107-108` | `005-ledger-transactions.xml` | `entry_type`, `reverses_entry_id` und nullable Spalten für Ein-/Auszahlungen | ✅ |
| `109-112` | `007-food-and-cost-prices.xml` | `cost_price` für Getränke, Tabellen `food_catalog` & `event_food`, Ledger/Snapshot `food_id`, `item_type`, `cost_price`, `profit` | ✅ |
| `113` | `008-encrypted-content.xml` | Benachrichtigungstitel als verschlüsselter Text | ✅ |
| `120-123` | `009-chat-and-rsvp.xml` | Chat-Lesestand, Direktchats, Reaktionen, Zu-/Absagen und Einladungsversand | ✅ |
| `130-131` | `010-member-invites.xml` | Einladungslinks und Einlösungen | ✅ |
| `140` | `011-kiosk-sessions.xml` | Kiosk-Sitzungen am Thekenterminal | ✅ |
| `150-153` | `012-moment-types-and-media.xml` | Moment-Typen und Reaktionen (mit Startbestand), Beiträge ohne Pflicht-Reaktion, `moment_media` | ✅ |
| `160-165` | `013-stammtische.xml` | Gruppen (`stammtische`), `stammtisch_id` an allen fachlichen Tabellen, Mitgliedschaften und Rollen je Gruppe, Übernahme der Bestandsdaten in die Standardgruppe, Eindeutigkeit je Gruppe, Row-Level-Security (nur PostgreSQL) | teilweise (163, 164 ohne) |
| `170` | `014-drink-library.xml` | Gemeinsame Getränkedatenbank `drink_library` mit Barcodes | ✅ |
| `180-183` | `015-billing.xml` | Tarife je Gruppe (`stammtisch_subscriptions`), Stripe-Ereignisse (`billing_events`), Ersteller und Bild der Gruppe, Recht `billing.manage`, Name der Standardgruppe | teilweise (181, 183 ohne) |
| `190` | `016-terms-acceptance.xml` | `users.terms_version` und `users.terms_accepted_at` | ✅ (automatisch) |

---

## ✍️ Richtlinien für neue Migrationsskripte

1. **Neue Datei**: nächste freie Nummer ist `017-…xml`, eingetragen in `db.changelog-master.xml`. Changeset-IDs fortlaufend und noch nicht vergeben wählen (belegt sind u. a. `201-202` und `301-302`).
2. **DBMS-Kompatibilität**:
   - Die Zieldatenbank ist **PostgreSQL 17**.
   - H2 ist ausschließlich für die schnellen Spring-Context-Tests zugelassen.
   - Für Typen die Properties `${uuid.type}` und `${text.type}` nutzen; jede Datei, die sie nutzt, definiert sie selbst für `postgresql` und `h2`.
3. **Rollback**:
   - Schemaänderungen bekommen ein `<rollback>`, wenn Liquibase ihn nicht selbst ableiten kann (bei `addColumn` oder `createTable` kann es das).
   - Reine Datenmigrationen haben bisher keinen Rollback.
4. **Trigger, Policies & Stored Procedures**:
   - PostgreSQL-spezifische Teile laufen mit `dbms="postgresql"` am Changeset oder einer `preCondition`, Funktionen mit `splitStatements="false"`.
5. **Gruppen**:
   - Jede fachliche Tabelle bekommt `stammtisch_id` (Fremdschlüssel auf `stammtische`) und eine Policy `stammtisch_isolation` wie in Changeset `165`.
   - Datenmigrationen über alle Gruppen setzen vorher `SET LOCAL vereint.rls_bypass = 'on'` (siehe `015-billing.xml`).
   - Eindeutigkeit gilt je Gruppe (`stammtisch_id` in Unique Constraints).
6. **Kontexte**: Seed- und Testdaten nur mit `context="dev"`; Produktivmigrationen laufen ohne Context bzw. mit `prod`.
7. **Daten erhalten**:
   - Migrationen dürfen bestehende Daten niemals unkontrolliert löschen oder ändern.
