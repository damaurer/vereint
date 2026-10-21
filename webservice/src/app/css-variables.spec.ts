import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Jede in den Komponenten genutzte CSS-Variable muss irgendwo definiert sein.
 * Eine unbekannte Variable macht eine Farbe still unsichtbar (so fehlten im
 * Kalender die Punkte für Events, weil `--color-primary` nicht existiert).
 * Variablen mit Rückfallwert (`var(--x, …)`) sind ausgenommen.
 */
const SRC = join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|css|scss|html)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('CSS-Variablen', () => {
  it('nutzt nur definierte Variablen', () => {
    const sources = [...files(join(SRC, 'app')), join(SRC, 'styles.css')].map((path) => ({
      path,
      text: readFileSync(path, 'utf8'),
    }));
    const defined = new Set(
      sources.flatMap(({ text }) => [...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
    );
    const missing = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/var\((--[a-z0-9-]+)\)/g)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name))
        .map((name) => `${path.slice(SRC.length + 1)}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
