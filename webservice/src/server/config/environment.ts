import { isMainThread } from 'node:worker_threads';

/**
 * Zentrale Auflösung aller Umgebungsvariablen des vertrauenswürdigen
 * Backendprozesses. Werte kommen aus der Prozessumgebung; lokal werden sie
 * über `.env` bereitgestellt (siehe `loadEnvFile`).
 *
 * Hier dürfen ausschließlich Konfigurationswerte gelesen werden. Secrets für
 * Keycloak und die Express-Session besitzen keinen Default: fehlt ein
 * Pflichtwert, bricht der Serverstart ab (`assertServerEnvironment`).
 */
export interface ServerEnvironment {
  readonly port: number;
  readonly production: boolean;
  readonly sessionCookieName: string;
  readonly sessionDurationMs: number;
  readonly sessionCookieSecure: boolean;
  /**
   * Cookies tragen das Präfix `__Host-` (nur mit `Secure`, `Path=/`, ohne
   * `Domain`). Aktiv bei `SESSION_COOKIE_SECURE=true` und HTTPS-Adresse;
   * lokal unter `http://localhost` bleiben die Namen ohne Präfix.
   */
  readonly hostPrefixedCookies: boolean;
  readonly sessionSecretCurrent: string;
  readonly sessionSecretPrevious: string | null;
  readonly publicBaseUrl: string;
  readonly springApiBaseUrl: string;
  readonly keycloakIssuerUri: string;
  readonly keycloakRealm: string;
  readonly keycloakClientId: string;
  readonly keycloakClientSecret: string;
  readonly keycloakRequestTimeoutMs: number;
  readonly keycloakRequestRetries: number;
}

interface NodeProcess {
  readonly env: Record<string, string | undefined>;
  loadEnvFile?: (path?: string) => void;
}

/**
 * Express-Session-TTL. Muss identisch zu `ssoSessionMaxLifespan` im
 * Keycloak-Realm (86400 s) bleiben, siehe `docs/backend-for-frontend/01-overview-and-setup.md`.
 */
const DEFAULT_SESSION_DURATION_MINUTES = 24 * 60;

/** Mindestlänge des Session-Secrets in Byte (AES-256 über HKDF). */
export const MINIMUM_SESSION_SECRET_BYTES = 32;

const DEFAULT_KEYCLOAK_REQUEST_TIMEOUT_MS = 3000;
const DEFAULT_KEYCLOAK_REQUEST_RETRIES = 1;

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readSecret(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed;
}

/** UTF-8-Bytelänge ohne Node-spezifische APIs. */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function resolveServerEnvironment(env: Record<string, string | undefined>): ServerEnvironment {
  const production = env['NODE_ENV'] === 'production';

  let sessionDurationMs: number;
  if (env['SESSION_DURATION_MINUTES']) {
    const minutes = readNumber(env['SESSION_DURATION_MINUTES'], DEFAULT_SESSION_DURATION_MINUTES);
    sessionDurationMs = minutes * 60 * 1000;
  } else if (env['SESSION_DURATION_DAYS']) {
    const durationDays = readNumber(env['SESSION_DURATION_DAYS'], 1);
    sessionDurationMs = durationDays * 24 * 60 * 60 * 1000;
  } else {
    sessionDurationMs = DEFAULT_SESSION_DURATION_MINUTES * 60 * 1000;
  }

  const sessionCookieSecure = readBoolean(env['SESSION_COOKIE_SECURE'], production);
  const publicBaseUrl = env['PUBLIC_BASE_URL'] || 'http://localhost:8080';
  const keycloakRealm = env['KEYCLOAK_REALM'] || 'vereint';
  const keycloakIssuerUri = env['KEYCLOAK_ISSUER_URI'] || `http://localhost:8082/realms/${keycloakRealm}`;

  return {
    port: readNumber(env['PORT'], 4300),
    production,
    sessionCookieName: env['SESSION_COOKIE_NAME'] || 'vereint_session',
    sessionDurationMs,
    sessionCookieSecure,
    hostPrefixedCookies: sessionCookieSecure && publicBaseUrl.startsWith('https://'),
    sessionSecretCurrent: readSecret(env['SESSION_SECRET_CURRENT'] ?? env['SESSION_SECRET']),
    sessionSecretPrevious: readSecret(env['SESSION_SECRET_PREVIOUS']) || null,
    publicBaseUrl,
    springApiBaseUrl: env['SPRING_API_BASE_URL'] || 'http://localhost:8081',
    keycloakIssuerUri,
    keycloakRealm,
    keycloakClientId: env['KEYCLOAK_CLIENT_ID'] || 'vereint-web',
    keycloakClientSecret: readSecret(env['KEYCLOAK_CLIENT_SECRET']),
    keycloakRequestTimeoutMs: readNumber(env['KEYCLOAK_REQUEST_TIMEOUT_MS'], DEFAULT_KEYCLOAK_REQUEST_TIMEOUT_MS),
    keycloakRequestRetries: readOptionalNumber(env['KEYCLOAK_REQUEST_RETRIES'], DEFAULT_KEYCLOAK_REQUEST_RETRIES),
  };
}

/**
 * Hosts, für die Angular SSR rendern darf. Angular lehnt jeden anderen
 * `Host`-Header ab (SSRF-Schutz); `angular.json` enthält nur die lokalen
 * Entwicklungs-Hosts. Die öffentliche Domain stammt deshalb aus
 * `PUBLIC_BASE_URL`, weitere Hosts optional aus `NG_ALLOWED_HOSTS`.
 */
export function ssrAllowedHosts(publicBaseUrl: string, extraHosts?: string): string[] {
  const hosts = new Set<string>();
  try {
    const url = new URL(publicBaseUrl);
    hosts.add(url.host);
    hosts.add(url.hostname);
  } catch {
    // Eine ungültige Basis-URL fügt keinen Host hinzu.
  }
  for (const host of (extraHosts ?? '').split(',')) {
    if (host.trim()) hosts.add(host.trim());
  }
  return [...hosts];
}

/**
 * Prüft die Pflichtwerte der Serverkonfiguration. Fehlende oder zu kurze
 * Secrets führen zum Startabbruch; ein stiller Fallback auf bekannte Werte
 * ist ausgeschlossen (`deny by default`).
 */
export function collectServerEnvironmentErrors(env: ServerEnvironment): string[] {
  const errors: string[] = [];

  if (!env.keycloakClientSecret) {
    errors.push('KEYCLOAK_CLIENT_SECRET fehlt.');
  }

  if (!env.sessionSecretCurrent) {
    errors.push('SESSION_SECRET (oder SESSION_SECRET_CURRENT) fehlt.');
  } else if (byteLength(env.sessionSecretCurrent) < MINIMUM_SESSION_SECRET_BYTES) {
    errors.push(`SESSION_SECRET ist kürzer als ${MINIMUM_SESSION_SECRET_BYTES} Byte.`);
  }

  if (env.sessionSecretPrevious && byteLength(env.sessionSecretPrevious) < MINIMUM_SESSION_SECRET_BYTES) {
    errors.push(`SESSION_SECRET_PREVIOUS ist kürzer als ${MINIMUM_SESSION_SECRET_BYTES} Byte.`);
  }

  if (env.sessionSecretPrevious && env.sessionSecretPrevious === env.sessionSecretCurrent) {
    errors.push('SESSION_SECRET_PREVIOUS ist identisch mit SESSION_SECRET_CURRENT.');
  }

  if (!env.keycloakIssuerUri) {
    errors.push('KEYCLOAK_ISSUER_URI fehlt.');
  }

  if (!env.publicBaseUrl) {
    errors.push('PUBLIC_BASE_URL fehlt.');
  }

  if (!env.springApiBaseUrl) {
    errors.push('SPRING_API_BASE_URL fehlt.');
  }

  if (env.production && !env.sessionCookieSecure) {
    errors.push('SESSION_COOKIE_SECURE muss in Produktion aktiv sein.');
  }

  return errors;
}

/**
 * Fehler, die auch in der lokalen Entwicklung zum Startabbruch führen. Fehlende
 * Secrets sind immer fatal; die Längenvorgabe für lokal generierte Platzhalter
 * wird außerhalb der Produktion nur protokolliert.
 */
function isFatalOutsideProduction(error: string): boolean {
  return !error.includes('kürzer als');
}

export function assertServerEnvironment(env: ServerEnvironment): void {
  const errors = collectServerEnvironmentErrors(env);
  if (!errors.length) return;

  const fatal = env.production ? errors : errors.filter(isFatalOutsideProduction);
  const warnings = errors.filter((error) => !fatal.includes(error));

  if (warnings.length) {
    console.warn(`server_environment_warning: ${warnings.join(' ')}`);
  }

  if (fatal.length) {
    const hint = !env.production
      ? ' Bitte erstelle eine lokale .env-Datei (z. B. via `npm run env:prepare` oder Kopieren von .env.example).'
      : '';
    throw new Error(`server_environment_invalid: ${fatal.join(' ')}${hint}`);
  }
}

/**
 * Lädt `.env` in `process.env`, falls die Node-Laufzeit das unterstützt und
 * die Datei an einem der Kandidatenpfade vorhanden ist. In deployten Umgebungen
 * existiert keine `.env`; dort gelten ausschließlich die injizierten Umgebungsvariablen.
 */
export function loadEnvFile(customPath?: string): void {
  const nodeProcess = getNodeProcess();
  if (typeof nodeProcess?.loadEnvFile !== 'function') return;

  const candidatePaths = customPath
    ? [customPath]
    : ['.env', '../.env', 'webservice/.env'];

  for (const candidate of candidatePaths) {
    try {
      nodeProcess.loadEnvFile(candidate);
      return;
    } catch {
      // Weiter mit nächstem Kandidaten, falls Datei an diesem Pfad nicht existiert.
    }
  }
}

/** Node-Prozess defensiv gelesen; die Datei wird ausschließlich serverseitig geladen. */
function getNodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/**
 * Unit-Tests laden die Serverkonfiguration ohne echte Secrets. Die
 * Startvalidierung greift daher nur außerhalb der Testausführung; die
 * Secret-Verwender selbst brechen unabhängig davon bei leerem Wert ab.
 */
function isTestRuntime(env: Record<string, string | undefined>): boolean {
  return env['NODE_ENV'] === 'test' || env['VITEST'] !== undefined || env['VITEST_WORKER_ID'] !== undefined;
}

/**
 * Der Serverstart läuft im Hauptthread. Die Routen-Extraktion und das
 * Prerendering des Angular-Builds laden dasselbe Bundle in Worker-Threads ohne
 * Prozessumgebung; dort würde die Validierung den Build blockieren, obwohl kein
 * Server bedient wird.
 */
function isServerStartup(): boolean {
  return getNodeProcess() !== undefined && isMainThread;
}

// In der Testausführung wird keine lokale `.env` geladen: Tests arbeiten mit
// den Code-Standards und eigenen Overrides und dürfen nicht von einer lokal
// vorhandenen Entwickler-`.env` (z. B. abweichender `SESSION_COOKIE_NAME`)
// abhängen.
if (!isTestRuntime(getNodeProcess()?.env ?? {})) {
  loadEnvFile();
}

const processEnv = getNodeProcess()?.env ?? {};

const resolvedEnvironment = resolveServerEnvironment(processEnv);

export const serverEnvironment: ServerEnvironment = resolvedEnvironment;

/**
 * Setzt einzelne Konfigurationswerte zur Laufzeit. Ausschließlich für Tests,
 * die ohne echte Secrets arbeiten; im Betrieb stammen alle Werte aus der
 * Prozessumgebung.
 */
export function applyTestEnvironmentOverrides(overrides: Partial<ServerEnvironment>): void {
  Object.assign(resolvedEnvironment as unknown as Record<string, unknown>, overrides);
}

if (!isTestRuntime(processEnv) && isServerStartup()) {
  assertServerEnvironment(serverEnvironment);
}
