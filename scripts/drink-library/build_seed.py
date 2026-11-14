"""Baut drink-library-seed-2*.csv aus dem gefilterten Open-Food-Facts-Export.

Aufruf: python3 build_seed.py de_bev.tsv [Zielordner/]
"""
import csv, os, re, sys, uuid, collections, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, '../../baseservice/src/main/resources/db/changelog/data/')
NS = uuid.UUID("6f1c2b1e-6f7a-4d8e-9a51-2a7d0c1f0b17")
def ok(c):
    if not c.isdigit() or len(c) not in (8, 13) or c[0] == '2': return False
    d = [int(x) for x in c]; s = sum(v * (3 if i % 2 == 0 else 1) for i, v in enumerate(reversed(d[:-1])))
    return (10 - s % 10) % 10 == d[-1]
def fold(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', s.lower()) if not unicodedata.combining(ch)).replace('ß', 'ss')
groups = []  # (regexes, display, kind)
for line in open(os.path.join(HERE, 'breweries.txt')):
    *pats, disp = line.strip().split('|'); groups.append(([re.compile(p) for p in pats], disp, 'Brauerei'))
groups.append(([re.compile(r'^mixery')], 'Karlsberg', 'Brauerei'))
groups += [([re.compile(r'^rapp-?s$')], "Rapp's", 'Kelterei'),
           ([re.compile(r'brauerrei-rapp|brauerei-rapp|^rappen$')], 'Brauerei Rapp', 'Brauerei'),
           ([re.compile(r'^adelholz')], 'Adelholzener', 'Bayern'),
           ([re.compile(r'^almdudler')], 'Almdudler', 'Bayern')]
def owner(btags):
    for t in btags.split(','):
        t = t.split(':', 1)[-1]
        for pats, disp, kind in groups:
            if any(p.search(t) for p in pats): return disp, kind
    return None, None
SKIP = ('en:syrups', 'en:tea-bags', 'en:tea-leaves', 'en:coffees', 'en:coffee-capsules', 'en:milks', 'en:plant-based-milk-alternatives', 'en:instant-beverages', 'en:beverage-preparations', 'en:dairies', 'en:dietary-supplements', 'en:hot-beverages')
def category(cats, name, brewery=False):
    c = set(cats.split(',')); n = fold(name)
    if any(s in c for s in SKIP) and 'en:alcoholic-beverages' not in c: return None
    beer = bool(c & {'en:beers', 'en:beer-based-alcoholic-beverages', 'en:non-alcoholic-beers', 'en:non-alcoholic-wheat-beers'})
    if not beer and c <= {'en:beverages-and-beverages-preparations', 'en:beverages', 'en:non-alcoholic-beverages', 'en:alcoholic-beverages', ''} and brewery:
        if re.search(r'fassbrause|limo|cola|spezi|malz', n): return 'Softdrink'
        if re.search(r'energy', n): return 'Energydrink'
        beer = bool(re.search(r'bier|pils|hell|weiss|weizen|weisse|keller|zwickl|export|marzen|bock|\bale\b|lager|radler|dunkel|kolsch|\balt\b|zapfle|urtyp|landbier|zoigl', n))
    if 'en:shandy' in c or 'en:radlers' in c or 'radler' in n or 'en:beer-mixes' in c or (beer and ('cola' in n or 'grapefruit' in n or 'zitrone' in n and 'weiss' in n)):
        return 'Biermischgetränk'
    if beer: return 'Bier alkoholfrei' if ('en:non-alcoholic-beers' in c or 'alkoholfrei' in n or '0,0' in n or ' 0.0' in n) else 'Bier'
    if 'en:energy-drinks' in c: return 'Energydrink'
    if 'en:sparkling-wines' in c: return 'Sekt'
    if 'en:ciders' in c or 'apfelwein' in n or 'cidre' in n: return 'Apfelwein & Cider'
    if 'en:wines' in c or 'en:mulled-wines' in c or 'gluhwein' in n: return 'Wein'
    if 'en:hard-liquors' in c or 'en:liqueurs' in c or 'en:distilled-beverages' in c: return 'Spirituose'
    if 'en:waters' in c: return 'Wasser'
    if c & {'en:juices-and-nectars', 'en:fruit-juices', 'en:apple-schorle', 'en:fruit-nectars', 'en:vegetable-juices', 'en:smoothies', 'en:juices'} or 'schorle' in n or 'saft' in n or 'nektar' in n: return 'Saft & Schorle'
    if c & {'en:sodas', 'en:carbonated-drinks', 'en:iced-teas', 'en:lemonade', 'en:colas', 'en:malt-beverages', 'en:fruit-sodas', 'de:cola-mix', 'en:soft-drinks'} or 'limo' in n or 'spezi' in n or 'malz' in n or 'eistee' in n or 'ice tea' in n or 'en:eistees' in c: return 'Softdrink'
    return None
BEERTYPE = [('en:wheat-beers', 'Weißbier'), ('en:pilsner', 'Pils'), ('en:pilsners', 'Pils'), ('en:kolsch', 'Kölsch'), ('en:altbier', 'Altbier'),
            ('en:black-beers', 'Schwarzbier'), ('en:bocks', 'Bockbier'), ('en:bock-beers', 'Bockbier'), ('en:kellerbier', 'Kellerbier'),
            ('en:export-beers', 'Exportbier'), ('en:dark-beers', 'Dunkles'), ('en:ipa', 'IPA'), ('en:india-pale-ales', 'IPA'), ('en:ales', 'Ale'), ('en:lagers', 'Lagerbier')]
NAMETYPE = [('weiss', 'Weißbier'), ('weizen', 'Weißbier'), ('pils', 'Pils'), ('kolsch', 'Kölsch'), ('alt', 'Altbier'), ('schwarz', 'Schwarzbier'), ('bock', 'Bockbier'),
            ('keller', 'Kellerbier'), ('zwickl', 'Kellerbier'), ('export', 'Exportbier'), ('dunkel', 'Dunkles'), ('hell', 'Helles'), ('marzen', 'Märzen'), ('ipa', 'IPA'), ('lager', 'Lagerbier')]
LABEL = {'Bier': 'Bier', 'Softdrink': 'Erfrischungsgetränk', 'Wasser': 'Mineralwasser', 'Saft & Schorle': 'Saft', 'Energydrink': 'Energydrink',
         'Sekt': 'Sekt', 'Wein': 'Wein', 'Apfelwein & Cider': 'Apfelwein', 'Spirituose': 'Spirituose'}
def describe(cat, cats, name, brand):
    c = set(cats.split(',')); n = fold(name)
    if cat in ('Bier', 'Bier alkoholfrei'):
        t = next((v for k, v in NAMETYPE if re.search((r'' if k in ('weiss', 'weizen') else r'\b') + k, n)), None) or next((v for k, v in BEERTYPE if k in c), 'Bier')
        t = t if cat == 'Bier' else ('Alkoholfreies ' + t if t not in ('Bier', 'IPA', 'Ale', 'Pils', 'Helles', 'Dunkles', 'Weißbier') else {'Bier': 'Alkoholfreies Bier', 'IPA': 'Alkoholfreies IPA', 'Ale': 'Alkoholfreies Ale', 'Pils': 'Alkoholfreies Pils', 'Helles': 'Alkoholfreies Helles', 'Dunkles': 'Alkoholfreies Dunkles', 'Weißbier': 'Alkoholfreies Weißbier'}[t])
        if t.startswith('Alkoholfreies ') and t[14:] in ('Altbier', 'Schwarzbier', 'Bockbier', 'Kellerbier', 'Exportbier', 'Märzen', 'Lagerbier', 'Kölsch'): pass
        return f'{t} von {brand}'
    if cat == 'Biermischgetränk': return f'Biermischgetränk von {brand}'
    return f'{LABEL[cat]} von {brand}'
def size(q):
    q = fold(q).replace(' ', '')
    if not q or re.search(r'\d+x|x\d|pcs|stk|stuck|kiste|pack|\+', q): return None
    m = re.fullmatch(r'(\d+(?:[.,]\d+)?)(ml|cl|l|liter|litre)?\.?', q)
    if not m or not m.group(2): return None
    v = float(m.group(1).replace(',', '.')); u = m.group(2)
    lit = v / 1000 if u == 'ml' else v / 100 if u == 'cl' else v
    if not 0.01 <= lit <= 5: return None
    s = ('%.3f' % lit).rstrip('0').rstrip('.')
    return s.replace('.', ',') + ' l'
BAD = re.compile(r'€|pfand|angebot|http|\?|uvp|zzgl|kiste|pack|sixpack|bottle|\d\s*x\b|\bx\s*\d|^\W*$|^\d+$|fromage|kase|kasten')
def clean_name(name, brand, sz):
    n = re.sub(r'\s+', ' ', re.sub(r"[\u2018\u2019\u00b4`]", "'", name)).strip(' -,.')
    n = re.sub(r"^Rapps\b|^Rapp's", "Rapp's", n)
    n = re.sub(r'\s*[-,(]?\s*\d+(?:[.,]\d+)?\s*(ml|cl|l|liter)\b\.?\)?', '', n, flags=re.I).strip(' -,.')
    if not n or BAD.search(fold(n)) or len(n) > 70: return None
    if n.isupper() and len(n) > 4: n = n.title()
    n = n[0].upper() + n[1:]
    squash = lambda x: re.sub(r"[^a-z0-9]", '', fold(x))
    bf = squash(brand.replace("'s", '').split()[0])
    if bf not in squash(n): n = f'{brand} {n}'
    return f'{n} {sz}' if sz else n
seed_codes = {r['barcode'] for r in csv.DictReader(open(SEED + 'drink-library-seed-barcodes.csv'))}
seed_names = {r['name'].lower() for r in csv.DictReader(open(SEED + 'drink-library-seed.csv'))}
drinks = collections.OrderedDict(); used = set(); stats = collections.Counter(); kinds = {}
rows = sorted(csv.reader(open(sys.argv[1]), delimiter='\t', quoting=csv.QUOTE_NONE), key=lambda r: -int(r[1] or 0))
for row in rows:
    code, mod, name, qty, brands, btags, cats = row[:7]
    brand, kind = owner(btags)
    if not brand: continue
    if not name.strip(): stats['noname'] += 1; continue
    cat = category(cats, name, kind == 'Brauerei')
    if not cat: stats['nocat'] += 1; continue
    if kind == 'Bayern' and cat not in ('Wasser', 'Softdrink', 'Saft & Schorle'): continue
    if kind == 'Brauerei' and cat in ('Wein', 'Sekt', 'Spirituose', 'Apfelwein & Cider'): continue
    has_code = ok(code)
    if not has_code and brand != 'Brauerei Rapp': stats['badcode'] += 1; continue
    if code in seed_codes or code in used: stats['dupcode'] += 1; continue
    sz = size(qty)
    n = clean_name(name, brand, sz)
    if not n: stats['badname'] += 1; continue
    key = n.lower()
    if key in seed_names: stats['seedname'] += 1; continue
    d = drinks.setdefault(key, {'name': n, 'category': cat, 'description': describe(cat, cats, name, brand), 'barcodes': [], 'brand': brand})
    if has_code: d['barcodes'].append(code); used.add(code)
    kinds[brand] = kind
print(stats, file=sys.stderr)
per = collections.Counter(d['brand'] for d in drinks.values())
brew = [b for b in per if kinds[b] == 'Brauerei']
print('drinks', len(drinks), 'barcodes', sum(len(d['barcodes']) for d in drinks.values()), 'breweries', len(brew), file=sys.stderr)
print(sorted(per.items(), key=lambda x: -x[1]), file=sys.stderr)
print(collections.Counter(d['category'] for d in drinks.values()), file=sys.stderr)
out = sys.argv[2] if len(sys.argv) > 2 else None
if out:
    with open(out + 'drink-library-seed-2.csv', 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['id', 'name', 'category', 'description'])
        for d in drinks.values(): w.writerow([uuid.uuid5(NS, d['name']), d['name'], d['category'], d['description']])
    with open(out + 'drink-library-seed-2-barcodes.csv', 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['id', 'drink_id', 'barcode'])
        for d in drinks.values():
            for b in d['barcodes']: w.writerow([uuid.uuid5(NS, 'barcode:' + b), uuid.uuid5(NS, d['name']), b])
