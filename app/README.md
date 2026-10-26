# DHRW Prüfprotokoll (PWA)

Offline-fähige Web-App zum Ausfüllen des Treppen-Prüfprotokolls. Die Eingaben
werden Schritt für Schritt abgefragt; am Ende entsteht ein PDF im Design der
Vorlage (`../DHRW_Pruefprotokoll_Tablet 01.pdf`).

## Aufbau

- `index.html`, `styles.css`, `app.js` – Oberfläche (Startseite mit allen Prüfungen, geführte Schritte)
- `fields.js` – Prüfpunkte, Auswahllisten und Texte des Protokolls
- `export-pdf.js` – zeichnet das PDF komplett selbst (Zeilen wachsen mit dem Text, lange Texte laufen auf die nächste Seite, Fotos groß)
- `export-docx.js` – baut dieselben Inhalte als Word-Datei (.docx) zum Nachbearbeiten am PC; ohne Bibliothek, funktioniert offline (Knopf „Word-Datei erstellen“ im Schritt Abschluss)
- `layout.js` – gemeinsames Aussehen beider Exporte (Farben, Abschnittstitel, Spalten, Fußzeile). Änderungen hier wirken auf PDF und Word gleich
- `db.js` – Speicherung auf dem Gerät (IndexedDB); Fotos werden auf ca. 1800 px verkleinert
- `sw.js`, `manifest.webmanifest`, `icon-*.png` – Offline-Cache und Installation
- `pdf-lib.min.js` – PDF-Bibliothek (lokal eingebunden, damit sie offline verfügbar ist)
- `template.pdf` – wird seit Version 2 nicht mehr benötigt
- `vorlagen/` – leere Vorlagen zum Herunterladen (Startseite, unten „Leere Vorlage herunterladen“): `Leeres_Pruefprotokoll.pdf` (ausfüllbar) und `Leeres_Pruefprotokoll.docx` (für Word)
- `../tools/` – erzeugt die Vorlagen neu, falls sich das Protokoll ändert: `node tools/make-blank-pdf.mjs` und `python3 tools/make_docx.py app/vorlagen/Leeres_Pruefprotokoll.docx` (braucht `python-docx`)

## PDF und Word vergleichen

Nach Änderungen an einem Export: `node tools/compare-exports.mjs [foto.jpg …]` erzeugt beide Dateien aus
Beispieldaten und legt sie in `vergleich/vergleich.html` Seite für Seite nebeneinander (braucht LibreOffice und pdftoppm).

## Änderungen veröffentlichen

Nach jeder Änderung an den Dateien `VERSION` in `sw.js` erhöhen. Sonst behalten
installierte Geräte die alte Version. Beim nächsten Öffnen mit Internet erscheint
dann der Hinweis „Neue Version bereit“.

## Lokal testen

    cd app
    python3 -m http.server 8000

Dann `http://localhost:8000` öffnen. Mit `?demo` am Ende der Adresse erscheint auf
der Startseite ein Knopf, der eine Beispielprüfung anlegt.
