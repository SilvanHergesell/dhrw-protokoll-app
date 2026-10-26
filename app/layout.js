// Gemeinsames Aussehen von PDF (export-pdf.js) und Word-Datei (export-docx.js).
// Wer hier etwas ändert, ändert beide Exporte gleich. Die Inhalte (Prüfpunkte, Texte) stehen in fields.js.

// Farben als Hex-Werte (ohne #)
export const COLORS = {
  navy: '17365D', blue: '2F75B5', grey: '667085', ink: '1F2937', line: 'B8C2CC', soft: 'F4F7FA', softLine: 'D9E2F3',
  white: 'FFFFFF', ok: '2E7D33', warn: 'C77700', bad: 'B42318', na: '737A8A', badSoft: 'FEF0EE', blueSoft: 'E6F0FC',
};

export const COMPANY = 'DHRW ENGINEERING GMBH';
export const DOC_TITLE = 'PRÜFPROTOKOLL';
export const FOOTER = 'DHRW Engineering GmbH · Edisonallee 39 · 89231 Neu-Ulm · Tel. 0731 14113924 · info@dhrw.group';

// [Kopfzeile, Überschrift] je Abschnitt, in dieser Reihenfolge in beiden Exporten
export const SECTIONS = {
  general: ['1 · ALLGEMEINE ANGABEN', 'Objekt- und Prüfungsdaten'],
  grundlagen: ['2 · PRÜFGRUNDLAGEN', 'Prüfgrundlagen und Anwendungsbereich'],
  checklist: ['3 · SICHT- UND FUNKTIONSPRÜFUNG', 'Prüfcheckliste'],
  defects: ['4 · FESTGESTELLTE MÄNGEL', 'Mängelerfassung'],
  photos: ['5 · FOTODOKUMENTATION', 'Fotodokumentation und Anlagen'],
  result: ['6 · ERGEBNIS DER PRÜFUNG', 'Ergebnis und fachliche Bewertung'],
  remarks: ['7-8 · BEMERKUNGEN UND MASSNAHMEN', 'Bemerkungen, Empfehlungen und Nachprüfung'],
  closing: ['9 · ABSCHLUSS', 'Abschluss und nächste Prüfung'],
};
export const CONTINUED = ' (Fortsetzung)';

export const LEGEND = 'i. O. = in Ordnung  ·  n. a. = nicht anwendbar';
export const CHECK_COLS = ['Nr.', 'Prüfpunkt', 'i. O.', 'Mangel', 'n. a.', 'Bemerkung'];
export const DEFECT_COLS = ['Nr.', 'Feststellung / Mangel', 'Priorität', 'Erforderliche Maßnahme', 'Verantwortlich', 'Termin'];
export const NO_DEFECTS = 'Es wurden keine Mängel festgestellt.';
export const NO_PHOTOS = 'Es wurden keine Fotos dokumentiert.';
export const PHOTOS_PER_PAGE = 4;
export const SIGNERS = ['Prüfer', 'Verantwortlicher Betreiber'];

// Symbolfarben: Status der Prüfpunkte, Priorität der Mängel, Balken der Ergebnis-Optionen (Reihenfolge wie ERGEBNIS)
export const STATUS_COLORS = { io: 'ok', mangel: 'bad', na: 'na' };
export const PRIO_COLORS = { hoch: 'bad', mittel: 'warn', niedrig: 'ok' };
export const RESULT_ACCENTS = ['ok', 'warn', 'bad', 'bad', 'blue'];
