"""Filtert den CSV-Export von Open Food Facts auf Getränke, die in Deutschland verkauft werden.

Aufruf: curl -s https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz \\
          | gunzip | python3 filter_off_export.py > de_bev.tsv
"""
import sys, csv
csv.field_size_limit(10**9)
r = csv.reader(sys.stdin, delimiter='\t', quoting=csv.QUOTE_NONE)
next(r)
w = sys.stdout
n = 0
for row in r:
    if len(row) < 159: continue
    cats = row[22]; ctry = row[40]
    if 'en:beverages' not in cats and 'en:alcoholic-beverages' not in cats and 'en:beers' not in cats and 'en:waters' not in cats: continue
    if 'en:germany' not in ctry: continue
    out = [row[0], row[5], row[10], row[13], row[18], row[19], row[22], row[28], row[68], row[75], row[77], row[157], row[11]]
    w.write('\t'.join(x.replace('\t',' ').replace('\n',' ') for x in out) + '\n'); n += 1
sys.stderr.write(f'rows {n}\n')
