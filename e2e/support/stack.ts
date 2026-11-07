import { execFileSync } from 'node:child_process';

/**
 * Direkter Blick in die Datenhaltung des E2E-Stacks, um zu pruefen, was
 * tatsaechlich gespeichert wird (z. B. dass Chat-Nachrichten verschluesselt
 * in PostgreSQL liegen). Nur lesend.
 */
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? 'vereint-e2e-postgres-1';
const BASESERVICE_CONTAINER = process.env.E2E_BASESERVICE_CONTAINER ?? 'vereint-e2e-baseservice-1';
/** Dateispeicher des baseservice (STORAGE_DIRECTORY in local/compose.yaml). */
const FILES_DIR = '/data/files';

/** Fuehrt eine SQL-Abfrage in der Datenbank `vereint` aus und liefert die Zeilen als Text. */
export function sql(query: string): string[] {
  const out = execFileSync(
    'docker',
    ['exec', POSTGRES_CONTAINER, 'psql', '-U', 'postgres', '-d', 'vereint', '-tA', '-c', query],
    { encoding: 'utf8' },
  );
  return out.split('\n').filter((line) => line.length > 0);
}

/** Liest eine gespeicherte Datei roh aus dem Dateispeicher (am baseservice vorbei). */
export async function rawObject(key: string): Promise<Buffer> {
  if (key.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Ungueltiger Speicherschluessel ${key}`);
  }
  return execFileSync('docker', ['exec', BASESERVICE_CONTAINER, 'cat', `${FILES_DIR}/${key}`]);
}

/** Alle Speicherschluessel unter einem Praefix (ohne halbfertige Uploads). */
export async function listObjects(prefix: string): Promise<string[]> {
  const out = execFileSync(
    'docker',
    ['exec', BASESERVICE_CONTAINER, 'find', FILES_DIR, '-type', 'f', '!', '-name', '.upload-*'],
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.slice(FILES_DIR.length + 1))
    .filter((key) => key.startsWith(prefix));
}
