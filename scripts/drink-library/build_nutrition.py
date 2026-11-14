"""Füllmenge und Kalorien je Portion für die Getränkedatenbank aus Open Food Facts.

Liest den CSV-Export von Open Food Facts (Tab-getrennt, mit Kopfzeile) von stdin,
sucht die Barcodes aus den Seed-Dateien der Getränkedatenbank und schreibt
`drink-library-nutrition.csv` (Spalten `drink_id,volume_ml,kcal_per_serving`).

Aufruf (aus dem Repo-Wurzelverzeichnis):

    curl -s https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz \\
      | gunzip | python3 -I scripts/drink-library/build_nutrition.py \\
        baseservice/src/main/resources/db/changelog/data/

Regeln:
- Füllmenge aus `product_quantity` (wenn die Einheit Milliliter oder Liter ist),
  sonst aus `quantity` ("0,5 l", "330 ml", "33 cl"), sonst aus dem Namen
  ("Krombacher Pils 0,5 l"). Mehrfachpackungen ("6 x 0,33 l") zählen nicht.
- Energie aus `energy-kcal_100g`, sonst `energy-kj_100g` / 4,184. Bei Getränken
  gilt 100 g ≈ 100 ml.
- Unplausible Werte werden verworfen: Füllmenge außerhalb 20 ml bis 3 l, Energie
  über 120 kcal je 100 ml (Spirituosen: über 400). Höhere Werte bei Bier oder
  Limonade sind fast immer Kilojoule im falschen Feld. Mehrere Barcodes eines Getränks: die erste brauchbare Füllmenge zählt,
  fehlende Energie wird aus weiteren Barcodes ergänzt.
- Ohne Energieangabe bleibt `kcal_per_serving` leer; ohne Füllmenge entfällt die Zeile.

Die Ausgabe gehört zu `changes/024-statistics.xml`. Wie die Seed-Dateien ist sie
nach dem Ausführen der Migration eingefroren (Liquibase-Prüfsumme); neue Werte
kommen in eine neue Datei mit eigenem Changeset.
"""
import csv
import re
import sys

csv.field_size_limit(10**9)

SEED = sys.argv[1] if len(sys.argv) > 1 else 'baseservice/src/main/resources/db/changelog/data/'
OUT = sys.argv[2] if len(sys.argv) > 2 else SEED + 'drink-library-nutrition.csv'

drinks = {}
categories = {}
barcode_to_drink = {}
for base in ('drink-library-seed', 'drink-library-seed-2'):
    for row in csv.DictReader(open(SEED + base + '.csv', encoding='utf-8')):
        drinks[row['id']] = row['name']
        categories[row['id']] = row['category']
    for row in csv.DictReader(open(SEED + base + '-barcodes.csv', encoding='utf-8')):
        barcode_to_drink[row['barcode']] = row['drink_id']


def volume_ml(text):
    """Füllmenge in ml aus einem Text wie "0,5 l" oder "330 ml"; Mehrfachpackungen ergeben None."""
    t = (text or '').lower().replace(' ', '')
    if not t or re.search(r'\d+x|x\d|\+|pack|kiste', t):
        return None
    m = re.search(r'(\d+(?:[.,]\d+)?)(ml|cl|l|liter|litre)\b', t)
    if not m:
        return None
    v = float(m.group(1).replace(',', '.'))
    unit = m.group(2)
    ml = v if unit == 'ml' else v * 10 if unit == 'cl' else v * 1000
    return round(ml) if 20 <= ml <= 3000 else None


def name_volume(name):
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b', name or '', flags=re.I)
    return volume_ml(m.group(0)) if m else None


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


found = {}
reader = csv.reader(sys.stdin, delimiter='\t', quoting=csv.QUOTE_NONE)
header = next(reader)
col = {name: i for i, name in enumerate(header)}
need = ['code', 'quantity', 'product_quantity', 'product_quantity_unit', 'energy-kcal_100g', 'energy-kj_100g']
idx = {n: col.get(n) for n in need}
seen = 0
for row in reader:
    code = row[idx['code']] if idx['code'] is not None and len(row) > idx['code'] else ''
    drink_id = barcode_to_drink.get(code)
    if not drink_id or (drink_id in found and found[drink_id][1] is not None):
        continue
    get = lambda n: row[idx[n]] if idx[n] is not None and len(row) > idx[n] else ''
    seen += 1
    vol = None
    unit = get('product_quantity_unit').strip().lower()
    pq = number(get('product_quantity'))
    if pq and unit in ('ml', 'l'):
        ml = pq * 1000 if unit == 'l' else pq
        vol = round(ml) if 20 <= ml <= 3000 else None
    vol = vol or volume_ml(get('quantity')) or name_volume(drinks.get(drink_id))
    kcal100 = number(get('energy-kcal_100g'))
    if kcal100 is None:
        kj = number(get('energy-kj_100g'))
        kcal100 = kj / 4.184 if kj is not None else None
    limit = 400 if categories.get(drink_id) == 'Spirituose' else 120
    if kcal100 is not None and not 0 <= kcal100 <= limit:
        kcal100 = None
    vol = found[drink_id][0] if drink_id in found else vol
    if vol is None:
        continue
    kcal = round(kcal100 * vol / 100) if kcal100 is not None else None
    found[drink_id] = (vol, kcal)

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['drink_id', 'volume_ml', 'kcal_per_serving'])
    for drink_id in drinks:
        if drink_id in found:
            vol, kcal = found[drink_id]
            w.writerow([drink_id, vol, '' if kcal is None else kcal])

with_kcal = sum(1 for v in found.values() if v[1] is not None)
print(f'drinks {len(drinks)} matched {seen} volume {len(found)} kcal {with_kcal}', file=sys.stderr)
