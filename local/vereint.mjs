#!/usr/bin/env node
// Startet Vereint komplett lokal und führt alle Tests aus.
//
//   node local/vereint.mjs up              Images bauen, Stack starten, Demo-Daten anlegen
//   node local/vereint.mjs down            Stack stoppen (Daten bleiben)
//   node local/vereint.mjs down --clean    Stack samt Daten und lokalen Secrets entfernen
//   node local/vereint.mjs logs [dienst]   Logs ansehen (Strg+C beendet)
//   node local/vereint.mjs seed            Demo-Daten anlegen, falls noch keine da sind
//   node local/vereint.mjs test [teil ...] Tests: backend, frontend, e2e (ohne Angabe alle)
//
// Braucht nur Docker (mit Compose) und Node.js; Java, Gradle und die
// Frontend-Abhängigkeiten laufen in Containern. Nur die E2E-Tests brauchen
// zusätzlich Bash, OpenSSL und einen Eintrag für vereint.test (siehe
// local/README.md). Läuft unter Linux, macOS und Windows.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, 'local', '.env.local');
const RESULTS = join(ROOT, 'local', 'test-results');
const APP_URL = 'http://localhost:4200';
const WINDOWS = process.platform === 'win32';

// Demo-Passwörter der lokalen Konten; sie existieren nur auf diesem Rechner.
const SEED_PASSWORDS = {
  SEED_ADMIN_PASSWORD: 'admin-demo-2026',
  SEED_BOARD_PASSWORD: 'board-demo-2026',
  SEED_MEMBER_PASSWORD: 'member-demo-2026',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT, shell: options.shell ?? false, ...options });
  if (result.error) {
    console.error(`${command} konnte nicht gestartet werden: ${result.error.message}`);
    return 127;
  }
  return result.status ?? 1;
}

function must(status, what) {
  if (status !== 0) {
    console.error(`\n${what} fehlgeschlagen (Exit-Code ${status}).`);
    process.exit(status);
  }
}

const rand = () => randomBytes(24).toString('hex');

/** Wegwerf-Secrets für den lokalen Stack, einmal erzeugt und dann wiederverwendet. */
function ensureEnv() {
  if (existsSync(ENV_FILE)) return;
  const values = {
    PUBLIC_DOMAIN: 'localhost:4200',
    KEYCLOAK_IMAGE: 'vereint-local/keycloak',
    BASESERVICE_IMAGE: 'vereint-local/baseservice',
    WEBSERVICE_IMAGE: 'vereint-local/webservice',
    POSTGRES_PASSWORD: rand(),
    KEYCLOAK_DB_PASSWORD: rand(),
    VEREINT_DB_PASSWORD: rand(),
    KEYCLOAK_ADMIN_PASSWORD: rand(),
    KEYCLOAK_CLIENT_SECRET: rand(),
    KEYCLOAK_TABLET_CLIENT_SECRET: rand(),
    KEYCLOAK_REGISTRATION_CLIENT_SECRET: rand(),
    SESSION_SECRET: rand(),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ...SEED_PASSWORDS,
  };
  const text = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  writeFileSync(ENV_FILE, `# Lokale Wegwerf-Secrets, erzeugt von local/vereint.mjs. Nicht versionieren.\n${text}\n`, { mode: 0o600 });
}

function envValue(name) {
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

function compose(args) {
  return run('docker', [
    'compose',
    '--project-name', 'vereint-local',
    '--project-directory', join(ROOT, 'local'),
    '--env-file', ENV_FILE,
    '-f', join(ROOT, 'local', 'compose.yaml'),
    '-f', join(ROOT, 'local', 'compose.local.yaml'),
    ...args,
  ]);
}

function checkDocker() {
  const result = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  if (result.status !== 0) {
    console.error('Docker mit Compose wurde nicht gefunden oder läuft nicht. Bitte Docker Desktop starten.');
    process.exit(1);
  }
}

function seed() {
  must(compose(['--profile', 'seed', 'run', '--rm', 'seed']), 'Anlegen der Demo-Daten');
}

function up() {
  ensureEnv();
  console.log('Baue Images und starte den Stack, das dauert beim ersten Mal einige Minuten ...');
  must(compose(['up', '-d', '--build', '--wait', '--wait-timeout', '600']), 'Start des Stacks');
  seed();
  console.log(`
Vereint läuft unter ${APP_URL}

Anmelden (Passwort jeweils):
  admin    ${SEED_PASSWORDS.SEED_ADMIN_PASSWORD}   Administration, Vorstand, Mitglied
  board    ${SEED_PASSWORDS.SEED_BOARD_PASSWORD}   Vorstand und Kasse
  member   ${SEED_PASSWORDS.SEED_MEMBER_PASSWORD}  Mitglied
  jonas, mia, felix  <name>-demo-2026          weitere Mitglieder
  theke    theke-demo-2026                       Thekentablet

Keycloak-Admin-Konsole: http://localhost:8090/kc/admin  (admin / ${envValue('KEYCLOAK_ADMIN_PASSWORD')})
Stoppen: node local/vereint.mjs down`);
}

function down(clean) {
  if (!existsSync(ENV_FILE)) {
    console.log('Kein lokaler Stack angelegt.');
    return;
  }
  must(compose(clean ? ['--profile', 'seed', 'down', '-v', '--remove-orphans'] : ['--profile', 'seed', 'down']), 'Stoppen');
  if (clean) rmSync(ENV_FILE);
}

/**
 * Kopiert die nötigen Verzeichnisse in einen Container, damit Build-Ausgaben
 * und Abhängigkeiten den Rechner nicht verändern; Berichte landen in local/test-results.
 */
function containerTest(name, image, source, script, extraArgs = []) {
  const out = join(RESULTS, name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const owner = typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid()}` : '';
  const excludes = source.exclude.map((e) => `--exclude=./${source.dirs[0]}/${e}`).join(' ');
  const copyIn = `mkdir -p /work && cd /src && tar ${excludes} -cf - ${source.dirs.map((d) => `./${d}`).join(' ')} | tar -xf - -C /work && cd /work/${source.dirs[0]}`;
  const fix = owner ? `; chown -R ${owner} /out` : '';
  return run('docker', [
    'run', '--rm',
    '-v', `${ROOT}:/src:ro`,
    '-v', `${out}:/out`,
    ...extraArgs,
    image,
    'sh', '-c', `${copyIn} && (${script}); rc=$?${fix}; exit $rc`,
  ]);
}

function testBackend() {
  // Testcontainers startet PostgreSQL über den Docker-Socket des Rechners.
  return containerTest(
    'backend',
    'eclipse-temurin:25.0.5_8-jdk',
    { dirs: ['baseservice'], exclude: ['build', '.gradle'] },
    './gradlew test --no-daemon --console=plain; rc=$?; cp -r build/reports/tests/test/. /out/ 2>/dev/null; exit $rc',
    [
      '-v', 'vereint-local-gradle:/root/.gradle',
      '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '--add-host', 'host.docker.internal:host-gateway',
      '-e', 'TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal',
    ],
  );
}

function testFrontend() {
  return containerTest(
    'frontend',
    'node:22.23.3',
    // keycloak/ und das Caddyfile prüfen die Realm- und Caddyfile-Tests mit.
    { dirs: ['webservice', 'keycloak', 'local/Caddyfile'], exclude: ['node_modules', 'dist', '.angular'] },
    'npm ci --no-audit --no-fund --loglevel=error && npm test -- --watch=false',
    ['-v', 'vereint-local-npm:/root/.npm'],
  );
}

async function testE2e() {
  try {
    await lookup('vereint.test');
  } catch {
    const hosts = WINDOWS ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts';
    console.error(`vereint.test ist nicht auflösbar. Einmalig "127.0.0.1 vereint.test" in ${hosts} eintragen (siehe local/README.md).`);
    return 1;
  }
  const e2e = { cwd: join(ROOT, 'e2e'), shell: WINDOWS };
  let status = run('npm', ['ci', '--no-audit', '--no-fund'], e2e);
  if (status === 0) status = run('npx', ['playwright', 'install', 'chromium'], e2e);
  if (status !== 0) return status;
  status = run('bash', ['stack.sh', 'up'], { cwd: join(ROOT, 'e2e') });
  if (status === 0) {
    status = run('npx', ['playwright', 'test', '--output', join(RESULTS, 'e2e')], e2e);
    if (status !== 0) {
      const logs = spawnSync('bash', ['stack.sh', 'logs'], { cwd: join(ROOT, 'e2e'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      mkdirSync(join(RESULTS, 'e2e'), { recursive: true });
      writeFileSync(join(RESULTS, 'e2e', 'stack-logs.txt'), `${logs.stdout ?? ''}${logs.stderr ?? ''}`);
    }
  }
  run('bash', ['stack.sh', 'down'], { cwd: join(ROOT, 'e2e') });
  return status;
}

async function test(parts) {
  const suites = { backend: testBackend, frontend: testFrontend, e2e: testE2e };
  const selected = parts.length ? parts : Object.keys(suites);
  const unknown = selected.filter((part) => !suites[part]);
  if (unknown.length) {
    console.error(`Unbekannter Testteil: ${unknown.join(', ')}. Möglich: ${Object.keys(suites).join(', ')}`);
    process.exit(2);
  }
  const results = [];
  for (const part of selected) {
    console.log(`\n=== Tests: ${part} ===`);
    results.push([part, await suites[part]()]);
  }
  console.log('\n=== Ergebnis ===');
  for (const [part, status] of results) console.log(`  ${status === 0 ? 'OK    ' : 'FEHLER'}  ${part}`);
  console.log(`Berichte: ${RESULTS}`);
  process.exit(results.some(([, status]) => status !== 0) ? 1 : 0);
}

const [command, ...rest] = process.argv.slice(2);
checkDocker();
switch (command) {
  case 'up':
    up();
    break;
  case 'down':
    down(rest.includes('--clean'));
    break;
  case 'logs':
    if (!existsSync(ENV_FILE)) process.exit(0);
    process.exit(compose(['logs', '-f', '--tail', '200', ...rest]));
    break;
  case 'seed':
    ensureEnv();
    seed();
    break;
  case 'test':
    await test(rest);
    break;
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(command ? 2 : 0);
}
