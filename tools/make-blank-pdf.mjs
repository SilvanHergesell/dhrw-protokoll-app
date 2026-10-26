// Erzeugt app/vorlagen/Leeres_Pruefprotokoll.pdf neu (ausfüllbares Formular).
// Aufruf im Projektordner: node tools/make-blank-pdf.mjs
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
// pdf-lib.min.js ist ein UMD-Paket; es liefert das Modul direkt zurück.
globalThis.PDFLib = require('../app/pdf-lib.min.js');
const { buildBlankPdf } = await import('../app/export-pdf.js');
const out = fileURLToPath(new URL('../app/vorlagen/Leeres_Pruefprotokoll.pdf', import.meta.url));
writeFileSync(out, await buildBlankPdf());
console.log('geschrieben:', out);
