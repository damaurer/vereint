import { execFileSync } from 'node:child_process';

/**
 * Direkter Blick in die Datenhaltung des E2E-Stacks, um zu pruefen, was
 * tatsaechlich gespeichert wird (z. B. dass Chat-Nachrichten verschluesselt
 * in PostgreSQL liegen). Nur lesend.
 */
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? 'vereint-e2e-postgres-1';
const S3_URL = process.env.E2E_S3_URL ?? 'http://127.0.0.1:9090';
const S3_BUCKET = process.env.E2E_S3_BUCKET ?? 'vereint-e2e';

/** Fuehrt eine SQL-Abfrage in der Datenbank `vereint` aus und liefert die Zeilen als Text. */
export function sql(query: string): string[] {
  const out = execFileSync(
    'docker',
    ['exec', POSTGRES_CONTAINER, 'psql', '-U', 'postgres', '-d', 'vereint', '-tA', '-c', query],
    { encoding: 'utf8' },
  );
  return out.split('\n').filter((line) => line.length > 0);
}

/** Liest ein Objekt roh aus dem S3-kompatiblen Speicher (am baseservice vorbei). */
export async function rawObject(key: string): Promise<Buffer> {
  const response = await fetch(`${S3_URL}/${S3_BUCKET}/${key}`);
  if (!response.ok) throw new Error(`S3-Objekt ${key} nicht lesbar (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/** Alle Objektschluessel unter einem Praefix. */
export async function listObjects(prefix: string): Promise<string[]> {
  const response = await fetch(`${S3_URL}/${S3_BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  const xml = await response.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}
