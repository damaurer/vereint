# Startdaten der gemeinsamen Getränkedatenbank

`drink-library-seed.csv` und `drink-library-seed-barcodes.csv` werden von
`changes/017-drink-library-seed.xml` in `drink_library` und
`drink_library_barcodes` eingespielt.

Die Barcodes (EAN/GTIN) stammen aus [Open Food Facts](https://world.openfoodfacts.org)
und stehen unter der [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Jede EAN wurde einzeln auf der Produktseite von Open Food Facts nachgeschlagen
und ihre Prüfziffer kontrolliert. Name, Sorte und Gebinde sind aus den
Produktangaben übernommen; Preise enthält die Datenbank bewusst nicht.

Die Dateien sind nach dem Ausführen der Migration eingefroren. Liquibase
prüft ihre Prüfsumme, deshalb kommen weitere Getränke in neue CSV-Dateien mit
einem eigenen Changeset.
