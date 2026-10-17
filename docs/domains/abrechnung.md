# Tarife und Abrechnung je Gruppe

Jede Gruppe hat einen eigenen Tarif. Bezahlt
wird online über **Stripe**; die App speichert keine Zahlungsdaten, nur die
Stripe-Kennungen von Kunde und Abo.

## Tarife

| | Kostenlos (Code `free`) | Standard (Code `stammtisch`) | Premium (Code `verein`) |
| :--- | :--- | :--- | :--- |
| Preis | 0 € | 4 €/Monat oder 40 €/Jahr | 9 €/Monat oder 90 €/Jahr |
| Mitglieder | bis 10 | bis 40 | unbegrenzt |
| Speicher (Bilder, Videos) | 1 GiB | 10 GiB | 50 GiB |
| Videos in Moments | nein | ja | ja |
| Kiosk-Geräte gleichzeitig | 1 | 1 | mehrere |

Die Grenzen stehen in `PlanLimits` (Fachservice). Geprüft wird nur beim
Hinzufügen (Antwort jeweils `409`): Mitglied aufnehmen (`plan_limit_members`), Bild oder Video
hochladen (`plan_limit_storage`, `plan_limit_videos`), Kiosk starten
(`plan_limit_kiosk`). Liegt eine Gruppe nach einem Wechsel in einen
kleineren Tarif darüber, bleibt alles erhalten; nur Neues ist gesperrt.

Die angezeigten Preise kommen aus `vereint.billing.amounts` (`BillingProperties`, Beträge in Cent) und müssen zu den
Preisen in Stripe passen; abgerechnet wird immer der Stripe-Preis.

Optional gibt es einen **Förderbeitrag** (Standard 2 €/Monat), den jedes Mitglied
für sich abschließen kann. Er ändert keinen Tarif.

## Bestehende und neue Gruppen

- „Meine Gruppe“ aus der Migration läuft als Tarif Premium mit Status
  `comped` (ohne Zahlung).
- Neue Gruppen starten im kostenlosen Tarif, auch die, die Kunden selbst
  eröffnen (siehe [Gruppen](stammtische.md#beitreten-verlassen-anlegen)).
- Die Plattform-Administration kann unter `/plattform` jeden Tarif von Hand
  vergeben (`comped`) oder auf kostenlos zurücksetzen, z. B. ohne Stripe oder
  für befreundete Gruppen.

## Ablauf

1. Unter **Gruppe → Tarif** wählt eine Person mit `billing.manage`
   (Systemrolle Admin) Tarif und Zahlweise. Die App leitet zu Stripe Checkout.
2. Stripe meldet per Webhook an `POST /api/v1/billing/stripe/webhook`; der
   Fachservice prüft die Signatur und setzt Tarif und Status.
3. Rechnungen, Zahlart, Tarifwechsel und Kündigung laufen über das
   Stripe-Kundenportal (**Zahlung und Rechnungen**).

| Stripe-Ereignis | Wirkung |
| :--- | :--- |
| `checkout.session.completed` | Kunde und Abo verknüpfen, Status `active` |
| `customer.subscription.created/updated` | Tarif und Zahlweise aus der Preis-ID, Laufzeitende, Status |
| `invoice.payment_failed` | Status `past_due`, Kulanzfrist 30 Tage |
| `invoice.paid` | Status `active`, Kulanzfrist endet |
| `customer.subscription.deleted` | zurück in den kostenlosen Tarif, Daten bleiben |

Jedes Ereignis wirkt genau einmal (`billing_events`). Jede Tarifänderung steht
im Audit-Log der Gruppe (`STAMMTISCH_PLAN_CHANGED`).

## Offene Zahlung

- Nach einer fehlgeschlagenen Zahlung läuft die Gruppe 30 Tage normal weiter
  (`BILLING_GRACE_DAYS`).
- Danach ist sie **nur lesbar**: schreibende Anfragen erhalten
  `403 stammtisch_read_only`. Erlaubt bleiben Tarif und Zahlung, Datenexport,
  Gruppe verlassen, Kiosk, eigenes Profil, Push-Geräte sowie alles ohne
  Gruppenbezug (z. B. Gruppe wechseln, Einladungslinks).
- Gelöscht wird nichts. Mit der Zahlung (`invoice.paid`) ist alles wieder offen.

## Datenexport

`GET /api/v1/stammtisch/export` (Recht `stammtisch.manage` oder
`billing.manage`) liefert eine JSON-Datei mit Rollen, Mitgliedern, Events,
Katalog, Buchungen, Chats und Moments, entschlüsselt. Bilder und Videos sind
nicht enthalten. Der Export funktioniert auch im Nur-Lesen-Zustand.

## Einrichtung

Ohne Konfiguration ist die Online-Zahlung aus (`503 billing_unavailable`); die
App zeigt die Tarife trotzdem an.

1. In Stripe zwei Produkte (Standard, Premium) mit je einem Monats- und einem
   Jahrespreis anlegen, optional ein Produkt „Förderbeitrag“ mit Monatspreis.
2. Kundenportal in Stripe aktivieren (Rechnungen, Zahlart, Kündigung,
   Tarifwechsel zwischen den vier Preisen).
3. Webhook-Endpunkt `https://<domain>/api/v1/billing/stripe/webhook` mit den
   Ereignissen aus der Tabelle oben anlegen. Caddy leitet den Pfad direkt an
   den Fachservice.
4. Werte setzen (in Produktion als SSM-Parameter unter `/vereint`, Geheimnisse
   als SecureString):

| Variable | Inhalt |
| :--- | :--- |
| `STRIPE_ENABLED` | `true` |
| `STRIPE_SECRET_KEY` | geheimer API-Schlüssel (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Signatur-Secret des Webhooks (`whsec_...`) |
| `STRIPE_PRICE_STAMMTISCH_MONTH`, `..._YEAR` | Preis-IDs Tarif Standard |
| `STRIPE_PRICE_VEREIN_MONTH`, `..._YEAR` | Preis-IDs Tarif Premium |
| `STRIPE_PRICE_SUPPORTER` | Preis-ID Förderbeitrag (optional) |

Lokal testen: `stripe listen --forward-to localhost:8081/api/v1/billing/stripe/webhook`
liefert ein Test-Webhook-Secret.

## Nicht in der App

Impressum und AGB (Entwurf mit Platzhaltern) stehen unter `/impressum` und
`/agb`, siehe [rechtliches.md](rechtliches.md). Gewerbeanmeldung, Prüfung und
Ausfüllen dieser Texte, Datenschutzerklärung, Auftragsverarbeitung (AVV) mit
den Gruppen, der Kündigungsbutton nach § 312k BGB und die steuerliche
Einordnung (z. B. Kleinunternehmerregelung) sind Aufgaben des Betreibers.
