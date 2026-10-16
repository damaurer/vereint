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
    └── 007-food-and-cost-prices.xml      # Speisenkatalog, Eventspeisen, Einkaufspreise & Deckungsbeitrag
```

---

## 📜 Migrations-Changelog Übersicht

| ID / Präfix | Datei | Zweck | Rollback-Fähig |
| :--- | :--- | :--- | :---: |
| `001-create-*` | `001-initial-schema.xml` | Initiale Basistabellen und Fremdschlüssel | ✅ |
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
| `160-165` | `013-stammtische.xml` | Gruppen (`stammtische`), `stammtisch_id` an allen fachlichen Tabellen, Mitgliedschaften und Rollen je Gruppe, Übernahme der Bestandsdaten in „Meine Gruppe“, Row-Level-Security | ✅ |
| `170` | `014-drink-library.xml` | Gemeinsame Getränkedatenbank `drink_library` mit Barcodes | ✅ |
| `180-183` | `015-billing.xml` | Tarife je Gruppe (`stammtisch_subscriptions`), Stripe-Ereignisse (`billing_events`), Recht `billing.manage`, Name der Standardgruppe | ✅ |

---

## ✍️ Richtlinien für neue Migrationsskripte

1. **DBMS-Kompatibilität**:
   - Die Zieldatenbank ist stets **PostgreSQL 17**.
   - H2 ist ausschließlich für schnelle Unit-/Context-Tests zugelassen.
   - Verwende immer die typunabhängigen Properties `${uuid.type}` und `${text.type}`.
2. **Rollback-Pflicht**:
   - Jedes `<changeSet>` **muss** ein valides `<rollback>`-Tag enthalten.
3. **Trigger & Stored Procedures**:
   - PostgreSQL-spezifische Prozeduren und Trigger müssen `splitStatements="false"` und eine `preCondition` auf `postgresql` tragen.
4. **Idempotenz**:
   - Migrationen dürfen bestehende Tabellendaten niemals unkontrolliert löschen oder mutieren.
