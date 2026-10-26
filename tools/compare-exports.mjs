#!/usr/bin/env node
// Erzeugt PDF und Word-Datei aus denselben Beispieldaten und legt beide Seite für Seite nebeneinander.
// So sieht man nach jeder Änderung sofort, ob die beiden Exporte noch gleich aussehen.
//
// Aufruf (im Projektordner):  node tools/compare-exports.mjs [foto1.jpg foto2.jpg …]
// Ergebnis: vergleich/vergleich.html (links PDF, rechts Word). Braucht LibreOffice (soffice) und pdftoppm (poppler).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const OUT = join(ROOT, 'vergleich');

// pdf-lib ist im Browser eine globale Variable; hier genauso laden
globalThis.self = globalThis;
vm.runInThisContext(readFileSync(join(APP, 'pdf-lib.min.js'), 'utf8'));
const { buildPdf } = await import(join(APP, 'export-pdf.js'));
const { buildDocx } = await import(join(APP, 'export-docx.js'));

const fields = {
  dokument_nr: '001', revision: 'A', pruefdatum: '2026-10-26', pruefer: 'Max Mustermann', objekt: 'HzB Wannsee',
  gebaeude_bereich: 'Halle 2', standort: 'Nordseite', treppen_nr: 'T-03', treppentyp: 'flucht', bauart: 'stahl',
  anwesende_personen: 'M. Mustermann, E. Beispiel', grundlage_1: 'Yes', grundlage_4: 'Yes', grundlagen_frei: 'Hausordnung',
  pruefergebnis: 'gering', ergebnis_bemerkung: 'Stufe 3 bis zur Reparatur markiert.', nachpruefung: 'ja', nachpruefung_datum: '2026-12-01',
  bemerkungen: 'Zugang war frei.', empfehlungen: 'Korrosionsschutz im Frühjahr prüfen.', naechster_prueftermin: '2027-10-26',
  abschluss_name_0: 'Max Mustermann',
};
for (let i = 1; i <= 24; i++) fields[`pruefstatus_${i}`] = i === 2 || i === 9 ? 'mangel' : i === 20 ? 'na' : 'io';
Object.assign(fields, {
  bemerkung_2: 'Stufe 3 lose', prioritaet_2: 'mittel', massnahme_2: 'Stufe nachziehen', verantwortlich_2: 'Hausmeister', termin_2: '2026-11-15',
  bemerkung_9: 'Rost am Podest', prioritaet_9: 'hoch', massnahme_9: 'Entrosten und beschichten',
});

const blobs = { signature_0: new Uint8Array(readFileSync(join(APP, 'icon-192.png'))) };
const photos = process.argv.slice(2).map((file, i) => {
  blobs[`photo_${i}`] = new Uint8Array(readFileSync(file));
  return { slot: `photo_${i}`, caption: `Beschriftung ${i + 1}`, ref: i === 0 ? 2 : undefined };
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'export.pdf'), await buildPdf({ fields, photos }, blobs));
writeFileSync(join(OUT, 'export.docx'), buildDocx({ fields, photos }, blobs));

// Word-Datei mit LibreOffice in ein PDF umwandeln, dann beide in Bilder
execFileSync('soffice', ['--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', join(OUT, 'word'), join(OUT, 'export.docx')], { stdio: 'ignore' });
execFileSync('pdftoppm', ['-r', '60', '-png', join(OUT, 'export.pdf'), join(OUT, 'pdf')]);
execFileSync('pdftoppm', ['-r', '60', '-png', join(OUT, 'word', 'export.pdf'), join(OUT, 'docx')]);

const pages = (prefix) => readdirSync(OUT).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.png')).sort();
const a = pages('pdf'), b = pages('docx');
const rows = Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
  `<tr><th>${i + 1}</th><td>${a[i] ? `<img src="${a[i]}">` : '–'}</td><td>${b[i] ? `<img src="${b[i]}">` : '–'}</td></tr>`).join('\n');
writeFileSync(join(OUT, 'vergleich.html'), `<!doctype html><meta charset="utf-8"><title>PDF und Word im Vergleich</title>
<style>body{font:14px sans-serif;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;vertical-align:top}img{width:100%;max-width:640px}</style>
<h1>PDF (links) und Word (rechts)</h1><p>PDF: ${a.length} Seiten · Word: ${b.length} Seiten (Word gerendert mit LibreOffice)</p>
<table><tr><th>Seite</th><th>PDF</th><th>Word</th></tr>${rows}</table>`);
console.log(`Fertig: ${join(OUT, 'vergleich.html')} (PDF ${a.length} Seiten, Word ${b.length} Seiten)`);
