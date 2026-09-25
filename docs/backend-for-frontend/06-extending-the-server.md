# 🛠️ 06. Server erweitern, How-Tos & Testen

Dieses Kapitel bietet praxisnahe Schritt-für-Schritt-Anleitungen für typische Erweiterungen des Express-BFF, erläutert die Testkonventionen mit Vitest, gibt Debugging-Tipps und fasst Best Practices in einer Checkliste zusammen.

---

## 📖 Rezepte & How-Tos

### 1. Neuen Router / Neue Express-Route hinzufügen
Um einen neuen Endpunkt (z. B. für Webhooks oder Systemstatus) zu registrieren:

1. **Router-Datei erstellen** unter `webservice/src/server/routes/my-feature.routes.ts`:
   ```typescript
   import { Router } from 'express';

   export const myFeatureRoutes = Router();

   myFeatureRoutes.get('/ping', (req, res) => {
     res.json({ status: 'ok', timestamp: new Date().toISOString() });
   });
   ```
2. **In `server.ts` einbinden**:
   ```typescript
   import { myFeatureRoutes } from './server/routes/my-feature.routes';

   // Vor authorizePages mounten:
   app.use('/api/my-feature', myFeatureRoutes);
   ```
3. **Unit-Test schreiben** in `webservice/src/server/routes/my-feature.routes.spec.ts`.

---

### 2. Neue öffentliche Seite registrieren
Öffentliche Seiten (z. B. `/impressum`, `/datenschutz`) müssen ohne Login-Zwang aufrufbar sein:

1. **`publicPaths` ergänzen** in `webservice/src/server/config/server-config.ts`:
   ```typescript
   export const publicPaths = new Set([
     '/',
     '/login',
     '/web/login',
     '/pwa/login',
     '/password-reset',
     '/invite/accept',
     '/impressum',    // <-- Hinzugefügt
     '/datenschutz',  // <-- Hinzugefügt
     '/403',
     '/404',
   ]);
   ```
2. **`KNOWN_APP_PREFIXES` ergänzen** in `webservice/src/server/auth/redirect.ts`, damit Weiterleitungen dorthin als sicher eingestuft werden:
   ```typescript
   export const KNOWN_APP_PREFIXES: readonly string[] = [
     // ...
     '/impressum',
     '/datenschutz',
   ];
   ```

---

### 3. Neuen `AppContext` einführen
Wenn ein neuer geschützter Bereich entsteht (z. B. ein eigenes Kassenprüfer-Modul):

1. **Typ erweitern** in `webservice/src/server/auth/auth.types.ts`:
   ```typescript
   export type AppContext =
     | 'memberPwa'
     | 'event'
     | 'eventOwner'
     | 'boardGeneral'
     | 'boardTreasury'
     | 'boardCommunications'
     | 'admin'
     | 'tabletRecorder'
     | 'eventGuest'
     | 'auditor'; // <-- Neuer Kontext
   ```
2. **Pfad-Mapping ergänzen** in `webservice/src/server/authorization/authorization.service.ts`:
   ```typescript
   export function resolvePathAppContext(pathname: string): PathAppContextMatch | null {
     // ...
     if (clean === '/auditor' || clean.startsWith('/auditor/')) {
       return { appContext: 'auditor' };
     }
     // ...
   }
   ```
3. **Login-Ziel & Fallback festlegen**:
   - In `webservice/src/server/authorization/authorization.middleware.ts`: Gehört der Kontext zum Web-Portal (`WEB_LOGIN_CONTEXTS`) oder zur PWA?
   - In `webservice/src/server/auth/redirect.ts`: `CONTEXT_DEFAULT_PATHS` für den Rücksprungpfad ergänzen.
4. **Backend-Matrix abstimmen**: Im Spring-Boot-Backend (`baseservice/.../security/RolePermissionMatrix.kt`) die Rollen und Berechtigungen für den neuen `AppContext` freigeben.

---

### 4. Neue Umgebungsvariable hinzufügen
1. **Interface `ServerEnvironment` erweitern** in `webservice/src/server/config/environment.ts`:
   ```typescript
   export interface ServerEnvironment {
     // ...
     readonly featureCustomFlag: boolean;
   }
   ```
2. **Auflösung in `resolveServerEnvironment` implementieren**:
   ```typescript
   export function resolveServerEnvironment(env: Record<string, string | undefined>): ServerEnvironment {
     return {
       // ...
       featureCustomFlag: readBoolean(env['FEATURE_CUSTOM_FLAG'], false),
     };
   }
   ```
3. **Validierung in `collectServerEnvironmentErrors` ergänzen** (falls Pflichtwert):
   ```typescript
   if (env.production && !env.featureCustomFlag) {
     errors.push('FEATURE_CUSTOM_FLAG ist in Produktion zwingend erforderlich.');
   }
   ```
4. **`.env.example` aktualisieren** mit Dokumentationskommentar.

---

### 5. Transfer-State-Positivliste erweitern
Wenn eine neue, unkritische Eigenschaft beim serverseitigen Rendern in den Angular-Client übergeben werden soll:

1. **`TRANSFER_STATE_ALLOWLIST` bearbeiten** in `webservice/src/server/authorization/transfer-state.ts`:
   ```typescript
   export const TRANSFER_STATE_ALLOWLIST: readonly string[] = [
     'appContext',
     'title',
     'description',
     'access',
     'locale',
     'theme',
     'buildVersion',
     'featureFlags',
     'clubBranding', // <-- Neues unkritisches Feld
   ];
   ```
2. **Wichtig**: Niemals E-Mail-Adressen, Guthabenstände, Passwörter oder Tokens in die Positivliste aufnehmen!

---

## 🧪 Test-Konventionen & Test-Fixtures

Der Server wird mit **Vitest** getestet. Alle Tests liegen als `*.spec.ts` direkt neben dem Quellcode.

### Tests ausführen:
```bash
cd webservice
npm test
```

### Verwendung der Token-Fixtures (`webservice/src/server/auth/testing/token-fixtures.ts`)
Für Unit-Tests, die authentifizierte Anfragen oder JWT-Validierung testen, stehen vorgefertigte Test-Hilfsmittel zur Verfügung:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installTestSecrets,
  installTestKeySet,
  uninstallTestKeySet,
  signTokenPair,
} from './testing/token-fixtures';
import { resetTestEnvironmentOverrides } from '../config/environment';

describe('Mein Auth-Test', () => {
  beforeEach(async () => {
    installTestSecrets();      // Setzt Test-Session-Secrets
    await installTestKeySet(); // Erzeugt ein lokales RSA-Schlüsselpaar für jose
  });

  afterEach(() => {
    uninstallTestKeySet();
    resetTestEnvironmentOverrides();
  });

  it('sollte ein gültiges Keycloak-Tokenpaar signieren', async () => {
    const tokens = await signTokenPair({
      subject: 'user-123',
      accessClaims: { roles: ['member'] },
    });

    expect(tokens.access_token).toBeDefined();
    expect(tokens.id_token).toBeDefined();
  });
});
```

---

## 🐛 Debugging & Troubleshooting

| Problem / Fehlermeldung | Mögliche Ursache | Lösung |
| :--- | :--- | :--- |
| `server_environment_invalid: KEYCLOAK_CLIENT_SECRET fehlt` | Keine lokale `.env`-Datei vorhanden. | `npm run env:prepare` ausführen oder `.env.example` nach `.env` kopieren. |
| `SESSION_SECRET ist kürzer als 32 Byte` | Das konfigurierte Session-Secret bietet unzureichende Entropie für AES-256. | Längeres Secret in `.env` eintragen (z. B. `openssl rand -hex 32`). |
| `401 oidc_session_expired` bei API-Aufrufen | Session-Cookie abgelaufen oder Token-Refresh fehlgeschlagen (Keycloak nicht erreichbar). | Keycloak-Container prüfen (`docker compose ps`) und neu einloggen. |
| `503 service_unavailable` bei Seitenaufrufen | Spring Boot Fachservice antwortet nicht innerhalb des 800-ms-Timeouts. | Spring-Logs prüfen; Verbindung über `SPRING_API_BASE_URL` prüfen. |
| Browser meldet `Cookie too large` | Session-Token überschreitet `MAX_SESSION_COOKIE_BYTES` (18 KB). | Rollen und Scopes in Keycloak minimieren. |
| Angular Hydration Mismatch | TransferState wurde durch `sanitizeTransferState` bereinigt, Client erwartet jedoch ein gefiltertes Feld. | Prüfen, ob das Feld vertraulich ist. Falls unkritisch, in `TRANSFER_STATE_ALLOWLIST` aufnehmen. |

---

## 📋 Checkliste für Pull Requests (BFF)

Vor dem Erstellen eines PRs für Änderungen am Express-Server:

- [ ] **Tests erfolgreich**: `npm test` im Ordner `webservice/` läuft fehlerfrei durch.
- [ ] **Keine Secrets im Client**: Keine Tokens, Keys oder Passwörter verlassen den Server.
- [ ] **Sicherheitsheader beachtet**: Neue Routen unterliegen den globalen Delivery- und Cache-Headern (`private, no-store` für geschützte Daten).
- [ ] **Open-Redirect-Schutz**: Neue Seitenpfade sind in `KNOWN_APP_PREFIXES` registriert.
- [ ] **Fail-Closed gewahrt**: Keine stillen Fallbacks bei Ausfall von Keycloak oder Spring Boot.
- [ ] **Dokumentation aktualisiert**: Relevante Tabellen und Mermaid-Diagramme in `docs/backend-for-frontend/` nachgeführt.
