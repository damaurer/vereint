# Startdaten der gemeinsamen Getränkedatenbank

`drink-library-seed.csv` und `drink-library-seed-barcodes.csv` werden von
`changes/017-drink-library-seed.xml` in `drink_library` und
`drink_library_barcodes` eingespielt, `drink-library-seed-2*.csv` von
`changes/018-drink-library-seed-breweries.xml`.

Die Barcodes (EAN/GTIN) stammen aus [Open Food Facts](https://world.openfoodfacts.org)
und stehen unter der [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Für den ersten Bestand wurde jede EAN einzeln auf der Produktseite von Open
Food Facts nachgeschlagen. Der zweite Bestand stammt aus dem Datenexport von
Open Food Facts und wird mit `scripts/drink-library/` gefiltert: Getränke mit
Verkaufsland Deutschland, deren Marke in `scripts/drink-library/breweries.txt`
steht. Von allen Barcodes wird die Prüfziffer kontrolliert; ladeninterne Codes
(Präfix 2) werden verworfen. Open Food Facts wird von Freiwilligen gepflegt,
einzelne Namen können daher ungenau sein. Ohne Gebindegröße in den Daten steht
keine im Namen. Name, Sorte und Gebinde sind aus den
Produktangaben übernommen; Preise enthält die Datenbank bewusst nicht.

Die Dateien sind nach dem Ausführen der Migration eingefroren. Liquibase
prüft ihre Prüfsumme, deshalb kommen weitere Getränke in neue CSV-Dateien mit
einem eigenen Changeset.
