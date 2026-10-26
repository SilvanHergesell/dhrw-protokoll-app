// Baut das ausgefüllte Prüfprotokoll als Word-Datei (.docx, A4 quer), gleiche Gliederung wie das PDF.
// Die Datei wird ohne Bibliothek direkt als Office-XML geschrieben und gezippt, damit der Export
// auch offline funktioniert. In Word bleibt alles bearbeitbar: Texte stehen in Tabellenzellen,
// Auswahlen sind anklickbare Kontrollkästchen, Fotos und Unterschriften sind normale Bilder.

import {
  CHECKPOINTS, GRUNDLAGEN, TREPPENTYP, BAUART, PRIO, ERGEBNIS, TEXTE, defectNumbers,
} from './fields.js';
import {
  COLORS, COMPANY, DOC_TITLE, FOOTER, SECTIONS, CONTINUED, LEGEND, CHECK_COLS, DEFECT_COLS, NO_DEFECTS, NO_PHOTOS,
  PHOTOS_PER_PAGE, SIGNERS, STATUS_COLORS, PRIO_COLORS, RESULT_ACCENTS,
} from './layout.js';

const {
  navy: NAVY, blue: BLUE, grey: GREY, ink: INK, line: LINE, soft: SOFT, softLine: SOFTLINE, blueSoft: BLUESOFT, badSoft: BADSOFT,
} = COLORS;
const FONT = 'Arial';
const CONTENT_W = 27.7; // cm

const cm = (v) => Math.round(v * 567); // Twips
const emu = (v) => Math.round(v * 360000);
const fmtDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('.') : v || '');

// ---------- XML-Bausteine ----------

const esc = (s) => String(s ?? '')
  .replace(/[^\n\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rPr({ size = 9, bold, italic, color = INK } = {}) {
  const sz = Math.round(size * 2);
  return `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>`
    + `${bold ? '<w:b/><w:bCs/>' : ''}${italic ? '<w:i/><w:iCs/>' : ''}`
    + `<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function run(text, o) {
  if (text == null || text === '') return '';
  const parts = String(text).replace(/\r/g, '').replace(/\t/g, ' ').split('\n');
  return `<w:r>${rPr(o)}${parts.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(p)}</w:t>`).join('')}</w:r>`;
}

// mark: Schrift für das Absatzende, damit in leeren Feldern getippter Text passend aussieht.
function para(content = '', { align, before = 0, after = 0, keepNext, pageBreak, mark, tabs } = {}) {
  return `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}${pageBreak ? '<w:pageBreakBefore/>' : ''}`
    + `${tabs ? `<w:tabs>${tabs.map((t) => `<w:tab w:val="left" w:pos="${cm(t)}"/>`).join('')}</w:tabs>` : ''}`
    + `<w:spacing w:before="${Math.round(before * 20)}" w:after="${Math.round(after * 20)}"/>`
    + `${align ? `<w:jc w:val="${align}"/>` : ''}${mark ? rPr(mark) : ''}</w:pPr>${content}</w:p>`;
}

const text = (s, o = {}, p = {}) => para(run(s, o), { mark: o, ...p });

// Mehrzeiliger Eingabetext: eine Zeile pro Absatz, damit er sich in Word natürlich bearbeiten lässt.
const textParas = (value, o = { size: 10 }) =>
  String(value ?? '').replace(/\r/g, '').split('\n').map((l) => text(l, o)).join('');

function borderXml({ sides = ['top', 'left', 'bottom', 'right'], color = LINE, sz = 4, val = 'single' } = {}) {
  return `<w:tcBorders>${['top', 'left', 'bottom', 'right'].map((s) => (sides.includes(s)
    ? `<w:${s} w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/>`
    : `<w:${s} w:val="nil"/>`)).join('')}</w:tcBorders>`;
}

// border: true = Rahmen ringsum, Objekt = eigene Seiten/Farbe; mar in Twips [oben, unten, links, rechts]
function cell(content, { w, span, fill, border, mar, v } = {}) {
  const b = border ? borderXml(border === true ? {} : border) : borderXml({ sides: [] });
  const m = mar ? `<w:tcMar><w:top w:w="${mar[0]}" w:type="dxa"/><w:left w:w="${mar[2]}" w:type="dxa"/>`
    + `<w:bottom w:w="${mar[1]}" w:type="dxa"/><w:right w:w="${mar[3]}" w:type="dxa"/></w:tcMar>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${cm(w)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${b}`
    + `${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${m}${v ? `<w:vAlign w:val="${v}"/>` : ''}`
    + `</w:tcPr>${content || '<w:p/>'}</w:tc>`;
}

function row(cells, { h, rule = 'atLeast', header, split = false } = {}) {
  return `<w:tr><w:trPr>${split ? '' : '<w:cantSplit/>'}${h ? `<w:trHeight w:val="${cm(h)}" w:hRule="${rule}"/>` : ''}`
    + `${header ? '<w:tblHeader/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;
}

function table(widths, rows, { indent } = {}) {
  const total = widths.reduce((a, b) => a + cm(b), 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>`
    + `${indent ? `<w:tblInd w:w="${cm(indent)}" w:type="dxa"/>` : ''}<w:tblLayout w:type="fixed"/>`
    + `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>`
    + `</w:tblPr><w:tblGrid>${widths.map((x) => `<w:gridCol w:w="${cm(x)}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

// Kleiner Abstandsabsatz (trennt auch zwei Tabellen, die Word sonst zusammenfügt)
const spacer = (pt = 6) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round(pt * 20)}" w:lineRule="exact"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>`;

// Anklickbares Kontrollkästchen (Word-Inhaltssteuerelement). Die Zeichen entsprechen den Symbolen im PDF:
// box = Kästchen mit Haken, radio = Kreis mit Punkt, io/mangel/na = Haken, Kreuz, Strich für die Prüfpunkte.
const GLYPHS = {
  box: ['2610', '2611'], radio: ['25CB', '25C9'], io: ['25CB', '2714'], mangel: ['25CB', '2716'], na: ['25CB', '2296'],
};
const SYMBOL_FONT = 'Segoe UI Symbol';
function checkbox(on, { kind = 'box', size = 11, color = BLUE } = {}) {
  const sz = Math.round(size * 2);
  const [off, onGlyph] = GLYPHS[kind];
  return `<w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="${on ? 1 : 0}"/>`
    + `<w14:checkedState w14:val="${onGlyph}" w14:font="${SYMBOL_FONT}"/><w14:uncheckedState w14:val="${off}" w14:font="${SYMBOL_FONT}"/>`
    + '</w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:rPr>'
    + `<w:rFonts w:ascii="${SYMBOL_FONT}" w:eastAsia="${SYMBOL_FONT}" w:hAnsi="${SYMBOL_FONT}" w:cs="${SYMBOL_FONT}"/>`
    + `<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`
    + `<w:t>${String.fromCodePoint(parseInt(on ? onGlyph : off, 16))}</w:t></w:r></w:sdtContent></w:sdt>`;
}

const option = (label, on, size = 9, gap = '', kind = 'radio') =>
  checkbox(on, { kind, size: size + 2 }) + run(` ${label}${gap}`, { size, bold: on && kind === 'box', color: INK });

// ---------- Bilder ----------

// Pixelmaße aus dem Dateikopf lesen (JPEG oder PNG)
function imageInfo(b) {
  if (!b || b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { type: 'png', w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { type: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

class Media {
  constructor() { this.files = []; this.rels = []; this.n = 0; }

  // Bild einbetten; Rückgabe ist ein Absatzinhalt (Run) oder '' falls das Bild nicht lesbar ist.
  picture(bytes, maxW, maxH, name) {
    const info = imageInfo(bytes);
    if (!info || !info.w || !info.h) return '';
    const n = ++this.n;
    const file = `media/bild${n}.${info.type === 'png' ? 'png' : 'jpg'}`;
    const rid = `rIdImg${n}`;
    this.files.push({ name: `word/${file}`, data: bytes });
    this.rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${file}"/>`);
    const s = Math.min(maxW / info.w, maxH / info.h);
    const cx = emu(info.w * s), cy = emu(info.h * s);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${esc(name)}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:nvPicPr><pic:cNvPr id="${n}" name="${esc(name)}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
}

// ---------- Abschnitte ----------

function heading(eyebrow, title, first = false) {
  return text(eyebrow, { size: 8, bold: true, color: BLUE }, { after: 2, keepNext: true, pageBreak: !first })
    + text(title, { size: 17, bold: true, color: NAVY }, { after: 8, keepNext: true });
}

// Reihe beschrifteter Felder mit schmalen Lückenspalten
// Wie im PDF: Beschriftung über dem Kasten, darunter das umrandete Feld.
function fieldRow(items, widths, minH = 0.95) {
  const ws = [], labels = [], boxes = [];
  widths.forEach((w, i) => {
    if (i) { ws.push(0.4); labels.push(cell('', { w: 0.4 })); boxes.push(cell('', { w: 0.4 })); }
    ws.push(w);
    const [label, value] = items[i];
    labels.push(cell(text(label, { size: 8.3, bold: true, color: GREY }), { w, mar: [0, 40, 0, 0] }));
    boxes.push(cell(textParas(value, { size: 9.5 }), { w, border: true, v: 'center', mar: [60, 60, 110, 110] }));
  });
  return table(ws, [row(labels), row(boxes, { h: minH })]) + spacer(8);
}

function textBox(label, value, minH, labelStyle = { size: 8.3, bold: true, color: GREY }) {
  return text(label, labelStyle, { after: 2, keepNext: true })
    + table([CONTENT_W], [row([cell(textParas(value), { w: CONTENT_W, border: true, mar: [80, 80, 140, 140] })], { h: minH, split: true })])
    + spacer(8);
}

function noteBox(title, body) {
  return table([CONTENT_W], [row([cell(
    text(title, { size: 9.5, bold: true, color: NAVY }, { after: 3 }) + text(body, { size: 8.5 }),
    { w: CONTENT_W, fill: SOFT, border: { color: SOFTLINE }, mar: [100, 100, 200, 200] })])]) + spacer(6);
}

function sectionGeneral(f) {
  let x = heading(...SECTIONS.general, true);
  x += fieldRow([['Dokument-Nr.', f.dokument_nr], ['Revision', f.revision], ['Prüfdatum', fmtDate(f.pruefdatum)], ['Prüfer', f.pruefer]], [8.0, 4.6, 6.3, 7.6]);
  x += fieldRow([['Objekt', f.objekt], ['Gebäude / Bereich', f.gebaeude_bereich]], [13.65, 13.65]);
  x += fieldRow([['Standort', f.standort], ['Treppen-Nr.', f.treppen_nr]], [13.65, 13.65]);

  // Optionen gleichmäßig verteilt wie im PDF (Tabstopps statt Leerzeichen)
  const TAB = '<w:r><w:tab/></w:r>';
  const opts = (list, value) => list.map(([k, label]) => option(label, value === k, 9)).join(TAB);
  const bauart = BAUART.map(([k, label]) => (k === 'sonstige'
    ? option(f.bauart === k && f.bauart_sonstige ? `Sonstige: ${f.bauart_sonstige}` : label, f.bauart === k, 9)
    : option(label, f.bauart === k, 9))).join(TAB);
  const head = (s) => cell(text(s, { size: 8, bold: true, color: NAVY }), { w: 4.6, fill: SOFT, mar: [60, 60, 160, 160] });
  const body = (c) => cell(para(c, { tabs: [4.55, 9.1] }), { w: 13.65, span: 2, mar: [110, 40, 60, 40] });
  x += table([4.6, 9.05, 0.4, 4.6, 9.05], [
    row([head('Treppentyp'), cell('', { w: 9.05 }), cell('', { w: 0.4 }), head('Bauart'), cell('', { w: 9.05 })]),
    row([body(opts(TREPPENTYP, f.treppentyp)), cell('', { w: 0.4 }), body(bauart)]),
  ]) + spacer(10);
  x += textBox('Anwesende Personen', f.anwesende_personen, 1.3);
  x += noteBox('Prüfhinweis', TEXTE.pruefhinweis);
  return x;
}

function sectionGrundlagen(f) {
  let x = heading(...SECTIONS.grundlagen);
  x += table([CONTENT_W], GRUNDLAGEN.map((g, i) => {
    const on = f[`grundlage_${i + 1}`] === 'Yes';
    return row([cell(para(option(g, on, 9.5, '', 'box')), { w: CONTENT_W, border: true, v: 'center', fill: on ? BLUESOFT : undefined, mar: [70, 70, 200, 100] })], { h: 0.99 });
  })) + spacer(10);
  x += textBox('Weitere Grundlagen / objektspezifische Festlegungen', f.grundlagen_frei, 2.0);
  x += noteBox('Hinweis', TEXTE.grundlagenHinweis);
  return x;
}

function sectionChecklist(f) {
  let x = heading(...SECTIONS.checklist);
  x += text(LEGEND, { size: 8.5, color: GREY }, { after: 5 });
  const widths = [1.3, 13.3, 2.0, 2.0, 2.0, 7.1];
  const center = [0, 2, 3, 4];
  const rows = [row(CHECK_COLS.map((t, i) => cell(
    text(t, { size: 8, bold: true, color: GREY }, { align: center.includes(i) ? 'center' : undefined }),
    { w: widths[i], fill: SOFT, border: true, mar: [70, 70, 100, 100] })), { header: true })];
    CHECKPOINTS.forEach((name, i) => {
    const n = i + 1, st = f[`pruefstatus_${n}`];
    const o = { border: true, v: 'center', mar: [40, 40, 100, 100], fill: st === 'mangel' ? BADSOFT : undefined };
    rows.push(row([
      cell(text(String(n), { size: 8.5, bold: true, color: NAVY }, { align: 'center' }), { w: widths[0], ...o }),
      cell(text(name, { size: 8.6 }), { w: widths[1], ...o }),
      ...['io', 'mangel', 'na'].map((k, j) => cell(
        para(checkbox(st === k, { kind: k, size: 13, color: st === k ? COLORS[STATUS_COLORS[k]] : LINE }), { align: 'center' }), { w: widths[2 + j], ...o })),
      cell(textParas(f[`bemerkung_${n}`], { size: 8.2 }), { w: widths[5], ...o }),
    ], { h: 0.9 }));
  });
  x += table(widths, rows) + spacer(8);
  x += noteBox('Dokumentation', TEXTE.checklisteHinweis);
  return x;
}

function sectionDefects(f) {
  let x = heading(...SECTIONS.defects);
  const widths = [1.2, 7.2, 2.6, 7.2, 5.4, 4.1];
  const rows = [row(DEFECT_COLS.map((t, i) => cell(
    text(t, { size: 8, bold: true, color: GREY }, { align: i === 0 ? 'center' : undefined }),
    { w: widths[i], fill: SOFT, border: true, mar: [70, 70, 100, 100] })), { header: true })];
  const nums = defectNumbers(f);
  const o = { border: true, mar: [80, 60, 100, 100] };
  if (!nums.length) {
    rows.push(row([cell('', { w: widths[0], ...o }),
      cell(text(NO_DEFECTS, { size: 9 }), { w: CONTENT_W - widths[0], span: 5, ...o })], { h: 0.9 }));
  }
  nums.forEach((n, idx) => {
    const prio = PRIO.map(([k, label]) => para(
      checkbox(f[`prioritaet_${n}`] === k, { kind: 'radio', color: f[`prioritaet_${n}`] === k ? COLORS[PRIO_COLORS[k]] : LINE })
      + run(` ${label.toLowerCase()}`, { size: 8.2, bold: f[`prioritaet_${n}`] === k, color: f[`prioritaet_${n}`] === k ? COLORS[PRIO_COLORS[k]] : INK }),
      { after: 1 })).join('');
    rows.push(row([
      cell(text(String(idx + 1), { size: 8.5, bold: true, color: NAVY }, { align: 'center' }), { w: widths[0], ...o, v: 'center' }),
      cell(text(`Prüfpunkt ${n}: ${CHECKPOINTS[n - 1]}`, { size: 7.6, color: GREY }, { after: 2 })
        + textParas(f[`bemerkung_${n}`], { size: 8.6 }), { w: widths[1], ...o }),
      cell(prio, { w: widths[2], ...o }),
      cell(textParas(f[`massnahme_${n}`], { size: 8.6 }), { w: widths[3], ...o }),
      cell(textParas(f[`verantwortlich_${n}`], { size: 8.6 }), { w: widths[4], ...o }),
      cell(text(fmtDate(f[`termin_${n}`]), { size: 8.6 }), { w: widths[5], ...o }),
    ], { h: 1.4 }));
  });
  x += table(widths, rows);
  x += text('Weitere Zeilen: in der letzten Zelle die Tabulatortaste drücken.', { size: 8, color: GREY, italic: true }, { before: 3, after: 6 });
  x += noteBox('Bewertungshinweis', TEXTE.bewertungsHinweis);
  return x;
}

function sectionPhotos(photos, blobs, media) {
  let x = heading(...SECTIONS.photos);
  if (!photos.length) {
    return x + table([CONTENT_W], [row([cell(text(NO_PHOTOS, { size: 10 }),
      { w: CONTENT_W, fill: SOFT, border: { color: SOFTLINE }, mar: [300, 300, 300, 300] })])]) + spacer(6);
  }
  const photoCell = (p, n, w, maxH) => {
    const pic = blobs[p.slot] ? media.picture(blobs[p.slot], w - 0.6, maxH, `Foto ${n}`) : '';
    const cap = [];
    if (p.ref) cap.push(text(`Prüfpunkt ${p.ref}: ${CHECKPOINTS[p.ref - 1]}`, { size: 7.8, color: GREY }));
    cap.push(textParas(p.caption, { size: 8.8 }));
    return [
      cell(text(`Foto ${n}`, { size: 9, bold: true, color: NAVY }), { w, border: { sides: ['top', 'left', 'right'] }, mar: [80, 20, 140, 140] }),
      cell(pic ? para(pic, { align: 'center' }) : text('Foto nicht verfügbar', { size: 9, color: GREY }, { align: 'center' }),
        { w, fill: SOFT, border: { color: SOFTLINE }, v: 'center', mar: [40, 40, 40, 40] }),
      cell(cap.join(''), { w, border: { sides: ['bottom', 'left', 'right'] }, mar: [60, 80, 140, 140] }),
    ];
  };
  // Wie im PDF: höchstens 4 Fotos pro Seite, ein einzelnes Foto bekommt die ganze Breite.
  for (let i = 0; i < photos.length; i += PHOTOS_PER_PAGE) {
    const chunk = photos.slice(i, i + PHOTOS_PER_PAGE);
    if (i) x += heading(SECTIONS.photos[0], SECTIONS.photos[1] + CONTINUED);
    if (chunk.length === 1) {
      const c = photoCell(chunk[0], i + 1, CONTENT_W, 11.8);
      x += table([CONTENT_W], [row([c[0]]), row([c[1]], { h: 12.0 }), row([c[2]])]) + spacer(10);
      continue;
    }
    // Bei 2 Fotos eine Reihe über die ganze Seitenhöhe, bei 3-4 Fotos zwei Reihen
    const imgH = chunk.length <= 2 ? 11.8 : 5.0;
    for (let k = 0; k < chunk.length; k += 2) {
      const a = photoCell(chunk[k], i + k + 1, 13.65, imgH);
      const b = chunk[k + 1] ? photoCell(chunk[k + 1], i + k + 2, 13.65, imgH) : [0, 1, 2].map(() => cell('', { w: 13.65 }));
      const gap = () => cell('', { w: 0.4 });
      x += table([13.65, 0.4, 13.65], [
        row([a[0], gap(), b[0]]), row([a[1], gap(), b[1]], { h: imgH + 0.2 }), row([a[2], gap(), b[2]]),
      ]) + spacer(10);
    }
  }
  return x;
}

function sectionResult(f) {
  let x = heading(...SECTIONS.result);
  // Wie im PDF: jede Option ein eigener Kasten mit farbigem Balken links
  ERGEBNIS.forEach(([key, title, desc], i) => {
    const on = f.pruefergebnis === key;
    const fill = on ? BLUESOFT : undefined;
    const bc = on ? BLUE : LINE, bs = on ? 12 : 4;
    x += table([0.35, 0.15, 1.1, 26.1], [row([
      cell('', { w: 0.35, fill, border: { sides: ['top', 'bottom', 'left'], color: bc, sz: bs } }),
      cell('', { w: 0.15, fill: COLORS[RESULT_ACCENTS[i]], border: { sides: ['top', 'bottom'], color: bc, sz: bs } }),
      cell(para(checkbox(on, { kind: 'radio', size: 14 }), { align: 'center' }),
        { w: 1.1, fill, v: 'center', border: { sides: ['top', 'bottom'], color: bc, sz: bs }, mar: [80, 80, 60, 60] }),
      cell(text(title, { size: 10, bold: true, color: NAVY }, { after: 1 }) + text(desc, { size: 8.6 }),
        { w: 26.1, fill, v: 'center', border: { sides: ['top', 'bottom', 'right'], color: bc, sz: bs }, mar: [100, 100, 100, 120] }),
    ], { h: 1.4 })]) + spacer(6);
  });
  x += spacer(4);
  x += textBox('Zusatzbewertung / Begründung', f.ergebnis_bemerkung, 2.2);
  return x;
}

function sectionRemarks(f) {
  const ls = { size: 10, bold: true, color: NAVY };
  let x = heading(...SECTIONS.remarks);
  x += textBox('7. Bemerkungen', f.bemerkungen, 3.6, ls);
  x += textBox('8. Empfehlungen / weitere Maßnahmen', f.empfehlungen, 3.6, ls);
  x += text('Erforderliche Nachprüfung', ls, { after: 4 });
  // Termin erscheint wie im PDF nur bei „ja“
  const termin = f.nachpruefung === 'ja'
    ? '<w:r><w:tab/></w:r>' + run('Termin: ', { size: 9.5, bold: true, color: GREY }) + run(fmtDate(f.nachpruefung_datum) || '-', { size: 9.5 }) : '';
  x += para(option('nein', f.nachpruefung === 'nein', 9.5) + '<w:r><w:tab/></w:r>' + option('ja', f.nachpruefung === 'ja', 9.5) + termin,
    { tabs: [3.6, 5.3] });
  return x;
}

function sectionClosing(f, blobs, media) {
  let x = heading(...SECTIONS.closing);
  const cols = [0, 1].map((n) => {
    const name = f[`abschluss_name_${n}`] || (n === 0 ? f.pruefer : '');
    const sig = blobs[`signature_${n}`] ? media.picture(blobs[`signature_${n}`], 11.6, 2.0, `Unterschrift ${n + 1}`) : '';
    const date = f[`abschluss_datum_${n}`] || (sig || name ? f.pruefdatum : '');
    return { title: SIGNERS[n], name, sig, date: fmtDate(date) };
  });
  // Wie im PDF: je ein umrandeter Kasten pro Person, darin Name, Unterschrift und Datum als Felder
  const IW = 12.65;
  const box = (content, h) => table([IW], [row([cell(content, { w: IW, border: true, v: 'center', mar: [60, 60, 110, 110] })], { h })]);
  const lbl = (s) => text(s, { size: 8.3, bold: true, color: GREY }, { before: 6, after: 2 });
  const card = (c) => cell(
    text(c.title, { size: 11, bold: true, color: NAVY }, { before: 2, after: 2 })
    + lbl('Name') + box(text(c.name, { size: 9.5 }), 0.9)
    + lbl('Unterschrift') + box(c.sig ? para(c.sig, { align: 'center' }) : '<w:p/>', 2.4)
    + lbl('Datum') + box(text(c.date, { size: 9.5 }), 0.9) + spacer(6),
    { w: 13.65, border: true, mar: [200, 100, 280, 280] });
  x += table([13.65, 0.4, 13.65], [row([card(cols[0]), cell('', { w: 0.4 }), card(cols[1])])]) + spacer(12);
  x += table([9.5, 18.2], [row([
    cell(text('Nächster Prüftermin', { size: 11, bold: true, color: NAVY }, { after: 6 })
      + table([7.8], [row([cell(text(fmtDate(f.naechster_prueftermin), { size: 10 }), { w: 7.8, border: true, v: 'center', mar: [60, 60, 110, 110] })], { h: 0.9 })])
      + spacer(4), { w: 9.5, border: { sides: ['top', 'bottom', 'left'] }, mar: [200, 100, 280, 100] }),
    cell(text('Dokumentationshinweis:', { size: 8.3, bold: true, color: GREY }, { after: 3 }) + text(TEXTE.dokuHinweis, { size: 8.3 }),
      { w: 18.2, border: { sides: ['top', 'bottom', 'right'] }, mar: [220, 100, 100, 280] }),
  ])]);
  return x;
}

// ---------- Paketteile ----------

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function headerXml() {
  const c = (s, align) => cell(text(s, { size: align ? 11 : 12, bold: true, color: 'FFFFFF' }, { align }),
    { w: 14.85, fill: NAVY, v: 'center', mar: [0, 0, 567, 567] });
  return `${XML}<w:hdr ${NS}>${table([14.85, 14.85], [row([c(COMPANY), c(DOC_TITLE, 'right')], { h: 1.48, rule: 'exact' })], { indent: -1 })}<w:p/></w:hdr>`;
}

function footerXml() {
  const o = { size: 7, color: GREY };
  const field = (instr) => `<w:fldSimple w:instr=" ${instr} ">${run('1', o)}</w:fldSimple>`;
  return `${XML}<w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${LINE}"/></w:pBdr>`
    + `<w:tabs><w:tab w:val="right" w:pos="${cm(CONTENT_W)}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>`
    + `${run(FOOTER, o)}<w:r>${rPr(o)}<w:tab/></w:r>${run('Seite ', o)}${field('PAGE')}${run(' von ', o)}${field('NUMPAGES')}</w:p></w:ftr>`;
}

const STYLES = `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>`
  + '<w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="de-DE" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="character" w:default="1" w:styleId="Absatz-Standardschriftart"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
  + '<w:style w:type="table" w:default="1" w:styleId="NormaleTabelle"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>'
  + '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
  + '</w:styles>';

const SETTINGS = `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  + '<w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/>'
  + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
  + '<w:themeFontLang w:val="de-DE"/></w:settings>';

function coreXml(title, author) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" `
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`
    + '</cp:coreProperties>';
}

const APP = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DHRW Prüfprotokoll</Application></Properties>`;

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
  + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
  + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
  + '</Types>';

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
  + '</Relationships>';

// ---------- ZIP (ohne Kompression; Fotos sind ohnehin schon komprimiert) ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// fields: Eingaben, photos: [{slot, caption, ref}], blobs: {slot: Uint8Array}. Gibt die .docx-Bytes zurück.
export function buildDocx({ fields = {}, photos = [] } = {}, blobs = {}) {
  const f = fields;
  const media = new Media();
  const body = sectionGeneral(f) + sectionGrundlagen(f) + sectionChecklist(f) + sectionDefects(f)
    + sectionPhotos(photos, blobs, media) + sectionResult(f) + sectionRemarks(f) + sectionClosing(f, blobs, media);
  const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>'
    + '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
    + '<w:pgMar w:top="1134" w:right="567" w:bottom="850" w:left="567" w:header="0" w:footer="340" w:gutter="0"/></w:sectPr>';
  const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    + '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
    + '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
    + `${media.rels.join('')}</Relationships>`;
  const title = `Prüfprotokoll ${f.objekt || ''} ${f.standort || ''}`.trim();
  return zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: `${XML}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>` },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/settings.xml', data: SETTINGS },
    { name: 'word/header1.xml', data: headerXml() },
    { name: 'word/footer1.xml', data: footerXml() },
    { name: 'docProps/core.xml', data: coreXml(title, f.pruefer || 'DHRW Engineering GmbH') },
    { name: 'docProps/app.xml', data: APP },
    ...media.files,
  ]);
}
