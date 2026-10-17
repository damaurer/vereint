# Website

Die öffentliche Website stellt Vereint vor: Zielgruppen, Funktionen mit echten
Bildschirmfotos, Thekenterminal, Sicherheit, Tarife und häufige Fragen. Sie
liegt als statische Seite in [`website/`](../website/) und braucht keinen
Build-Schritt.

```text
website/
├── index.html          Startseite (Deutsch)
├── 404.html            Fehlerseite
├── assets/site.css     Gestaltung, heller und dunkler Modus
├── assets/site.js      Menü auf dem Handy, Umschalter monatlich/jährlich
├── bilder/*.webp       Bildschirmfotos aus docs/handbuch/bilder, verkleinert
├── favicon.svg, apple-touch-icon.png, robots.txt
```

## Grundsätze

- **Keine fremden Server:** keine Web-Schriften, kein CDN, keine Analyse, keine
  Cookies. Dadurch braucht die Website kein Cookie-Banner.
- **Strenge Content-Security-Policy** (im `Caddyfile`): nur eigene Dateien,
  keine Inline-Skripte oder -Styles. Alles funktioniert auch ohne JavaScript.
- **Links in die App** gehen über `/app/<pfad>`. Caddy leitet sie auf
  `https://<PUBLIC_DOMAIN>/<pfad>` weiter, so steht die App-Domain nirgends im
  HTML. Genutzt werden `/app/` (Anmelden), `/app/gruppe-eroeffnen`,
  `/app/impressum` und `/app/agb`.
- **Preise und Grenzen** stehen zusätzlich in
  [abrechnung.md](domains/abrechnung.md), `PlanLimits.kt`, `BillingProperties.kt`
  und `legal-operator.ts`. Bei Änderungen alle gleichziehen.

## Ausliefern

Caddy liefert die Website auf demselben Server aus wie die App, unter eigener
Domain. Es entstehen keine zusätzlichen AWS-Kosten.

1. In `infra/aws/terraform.tfvars` `website_domain` setzen, z. B.
   `"example.de, www.example.de"`, und `terraform apply` ausführen. Das legt den
   SSM-Parameter `/vereint/WEBSITE_DOMAIN` an (oder ihn von Hand anlegen).
2. Für jede dieser Domains einen `A`-Record auf `terraform output public_ip`
   setzen.
3. Beim nächsten Deployment holt Caddy die Zertifikate automatisch.

Ohne `WEBSITE_DOMAIN` ist die Website nicht erreichbar; der Rest läuft
unverändert. Da alle Knöpfe zum Eröffnen einer Gruppe führen, die Domain erst
setzen, wenn `SIGNUP_ENABLED` an ist (siehe [Offene Punkte](offene-punkte.md)).

Die Website ist Teil des Deploy-Bundles: Der Workflow `Deployment (Produktion)`
kopiert `website/` neben `deploy/`, ein Merge nach `main`, der `website/`
ändert, rollt also aus. `deploy.sh` prüft nach dem Start, dass die Dateien im
Caddy-Container liegen; antwortet die Website-Domain noch nicht (DNS fehlt),
gibt es nur eine Warnung und keinen Rollback.

## Prüfen

Der Workflow `Website` läuft bei jedem Pull Request, der `website/`, das
`Caddyfile` oder `compose.yaml` ändert:

- `node scripts/website/check.mjs`: lokale Links, Sprungziele, App-Routen,
  Bilder mit `alt`, `width`, `height`, keine externen Verweise, keine
  Inline-Skripte, keine Datei über 400 KB.
- `caddy validate` mit und ohne Website-Domain.
- Caddy liefert die Seite aus, die 404-Seite greift und `/app/...` leitet weiter.

Lokal ansehen: `cd website && python3 -m http.server 8000`, dann
http://localhost:8000 öffnen (die Links unter `/app/` gehen dabei ins Leere).

## Bildschirmfotos erneuern

Die Bilder stammen aus dem Handbuch (`docs/handbuch/bilder`, aufgenommen mit
[`scripts/handbook`](../scripts/handbook/)). Nach neuen Handbuch-Aufnahmen
verkleinert als WebP übernehmen, Handy-Ansichten 560 px, Tablet und Computer
1600 px breit:

```bash
python3 - <<'EOF'
from PIL import Image
for name, width in [('start', 560), ('t-strichliste', 1600)]:
    im = Image.open(f'docs/handbuch/bilder/{name}.png').convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(f'website/bilder/{name}.webp', 'WEBP', quality=82, method=6)
EOF
```

## Offen

- **Datenschutzerklärung:** Auch die Website braucht eine (Server-Logs von
  Caddy). Sobald es sie gibt, im Fuß der Website verlinken.
- **Umsatzsteuer:** Der Hinweis nach § 19 UStG unter den Preisen gilt nur, solange
  der Betreiber Kleinunternehmer ist (`smallBusiness` in `legal-operator.ts`).
- **Englische Fassung:** Bisher nur Deutsch.
