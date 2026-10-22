# DHRW Prüfprotokoll – Test-Build (PWA)

Offline-fähige Web-App zum Ausfüllen des Prüfprotokolls. Das Ergebnis ist das
originale `template.pdf`, befüllt mit allen Eingaben, Fotos und Unterschriften.

## Auf Android testen (schnellster Weg)

1. Auf https://app.netlify.com/drop den ganzen Ordner `app` in das Browserfenster ziehen.
2. Die angezeigte `https://…netlify.app`-Adresse in **Chrome auf dem Android-Gerät** öffnen.
3. Chrome-Menü (⋮) → **App installieren** / **Zum Startbildschirm hinzufügen**.
4. App einmal online öffnen, danach funktioniert sie auch im Flugmodus.

HTTPS ist Pflicht: Service Worker, Kamera-Zugriff und Installation funktionieren
nicht über `http://` oder als lokal geöffnete Datei.

## Lokal am Rechner

    cd app
    python3 -m http.server 8000

Dann `http://localhost:8000` im Browser öffnen (localhost gilt als sicher).

## Dateien

- `index.html`, `styles.css`, `app.js` – Oberfläche, Liste der Prüfungen, Formular
- `fields.js` – Abschnitte und Feldnamen (identisch mit den Formularfeldern im PDF)
- `export-pdf.js` – befüllt `template.pdf`, setzt Fotos/Unterschriften ein, flacht ab
- `db.js` – Speicherung im Browser (IndexedDB), Fotos werden auf ~1600 px verkleinert
- `sw.js`, `manifest.webmanifest`, `icon-*.png` – Offline-Cache und Installation
- `pdf-lib.min.js` – PDF-Bibliothek (lokal, damit offline verfügbar)

Nach Änderungen an Dateien `VERSION` in `sw.js` erhöhen, sonst behalten
installierte Geräte die alte Version.
