// Baut das Prüfprotokoll als PDF (A4 quer) im Design der Vorlage.
// Alles wird direkt gezeichnet: Zeilen wachsen mit dem Text, lange Texte laufen
// auf die nächste Seite weiter, Fotos bekommen so viel Platz wie möglich.

import {
  CHECKPOINTS, GRUNDLAGEN, TREPPENTYP, BAUART, ERGEBNIS, PRIO, TEXTE, defectNumbers,
} from './fields.js';

const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;

const W = 841.89, H = 595.28, M = 28, CW = W - 2 * M;
const BOTTOM = 52;

const col = {
  navy: rgb(0.09, 0.212, 0.365), blue: rgb(0.184, 0.459, 0.71), grey: rgb(0.4, 0.439, 0.522),
  ink: rgb(0.122, 0.161, 0.216), line: rgb(0.722, 0.761, 0.8), soft: rgb(0.957, 0.969, 0.98),
  softLine: rgb(0.851, 0.886, 0.953), white: rgb(1, 1, 1),
  ok: rgb(0.18, 0.49, 0.2), warn: rgb(0.78, 0.467, 0), bad: rgb(0.706, 0.137, 0.094), na: rgb(0.45, 0.48, 0.54),
  badSoft: rgb(0.995, 0.94, 0.935), blueSoft: rgb(0.9, 0.94, 0.99),
};

// Die Standardschrift kann nur Latin-1; alles andere (z. B. Emojis) wird entfernt.
function S(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\r/g, '').replace(/\t/g, ' ')
    .replace(/[‘’]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[^\n\x20-\x7E -ÿ€–—…]/g, '')
    .trim();
}
const fmtDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('.') : S(v));

function wrap(font, size, text, maxW) {
  const out = [];
  for (const para of S(text).split('\n')) {
    let line = '';
    for (let word of para.split(/ +/)) {
      while (font.widthOfTextAtSize(word, size) > maxW) {
        let n = word.length;
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > maxW) n--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, n));
        word = word.slice(n);
      }
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= maxW) line = cand;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

class Writer {
  constructor(doc, font, bold, blank = false) {
    this.doc = doc; this.font = font; this.bold = bold; this.blank = blank;
    this.pages = []; this.page = null; this.y = 0; this.cont = null; this.defs = [];
  }

  // Formularfeld für die leere Vorlage merken (nur im blank-Modus)
  reg(def) { if (this.blank) this.defs.push({ page: this.page, ...def }); }
  regRadio(name, option, cx, cy, r = 6.5) { this.reg({ kind: 'radio', name, option, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }); }

  buildForm() {
    const form = this.doc.getForm();
    const radios = new Map();
    for (const d of this.defs) {
      if (d.kind === 'radio') { if (!radios.has(d.name)) radios.set(d.name, []); radios.get(d.name).push(d); continue; }
      const o = { x: d.x, y: d.y, width: d.w, height: d.h, borderWidth: 0, textColor: d.kind === 'text' ? col.ink : col.blue };
      if (d.kind === 'check') { form.createCheckBox(d.name).addToPage(d.page, o); continue; }
      const tf = form.createTextField(d.name);
      if (d.multiline) tf.enableMultiline();
      tf.addToPage(d.page, o);
      tf.setFontSize(d.size || 9.5);
    }
    for (const [name, opts] of radios) {
      const rg = form.createRadioGroup(name);
      opts.forEach((d) => rg.addOptionToPage(d.option, d.page, {
        x: d.x, y: d.y, width: d.w, height: d.h, borderWidth: 0, textColor: col.blue,
      }));
    }
  }

  // ---- Seiten ----
  newPage(eyebrow, title, base) {
    const p = this.doc.addPage([W, H]);
    this.page = p; this.pages.push(p);
    p.drawRectangle({ x: 0, y: H - 42, width: W, height: 42, color: col.navy });
    p.drawText('DHRW ENGINEERING GMBH', { x: M, y: 567.7, size: 12, font: this.bold, color: col.white });
    const t = 'PRÜFPROTOKOLL';
    p.drawText(t, { x: W - M - this.bold.widthOfTextAtSize(t, 11), y: 567.9, size: 11, font: this.bold, color: col.white });
    p.drawText(eyebrow, { x: M, y: 538.5, size: 8.2, font: this.bold, color: col.blue });
    p.drawText(title, { x: M, y: 515.7, size: 17, font: this.bold, color: col.navy });
    this.cont = { eyebrow, base: base ?? title };
    this.y = 496;
  }
  section(eyebrow, title) { this.newPage(eyebrow, title); }
  continuePage() { this.newPage(this.cont.eyebrow, `${this.cont.base} (Fortsetzung)`, this.cont.base); }
  ensure(h) { if (this.y - h < BOTTOM) { this.continuePage(); return true; } return false; }
  gap(n) { this.y -= n; }

  finish(footer) {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: col.line });
      p.drawText(footer, { x: M, y: 27, size: 7, font: this.font, color: col.grey });
      const t = `Seite ${i + 1} von ${n}`;
      p.drawText(t, { x: W - M - this.font.widthOfTextAtSize(t, 7), y: 27, size: 7, font: this.font, color: col.grey });
    });
  }

  // ---- Zeichenhelfer ----
  text(str, x, baseline, { size = 9.5, font = this.font, color = col.ink } = {}) {
    this.page.drawText(S(str), { x, y: baseline, size, font, color });
  }
  // Zeilen ab Oberkante `top`; gibt die Gesamthöhe zurück.
  lines(lines, x, top, { size = 9.5, lh = size * 1.28, font = this.font, color = col.ink } = {}) {
    lines.forEach((l, i) => {
      if (l) this.page.drawText(l, { x, y: top - i * lh - lh / 2 - size * 0.34, size, font, color });
    });
    return lines.length * lh;
  }
  rect(x, top, w, h, { fill, stroke, lw = 0.8 } = {}) {
    this.page.drawRectangle({
      x, y: top - h, width: w, height: h, color: fill, borderColor: stroke, borderWidth: stroke ? lw : 0,
    });
  }
  rrect(x, top, w, h, r, { fill, stroke, lw = 0.8 } = {}) {
    const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(p, { x, y: top, color: fill, borderColor: stroke, borderWidth: stroke ? lw : 0 });
  }
  hline(x1, x2, y, c = col.line, t = 0.5) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color: c });
  }
  vline(x, y1, y2, c = col.line, t = 0.5) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: t, color: c });
  }
  radio(cx, cy, on) {
    this.page.drawCircle({ x: cx, y: cy, size: 6.5, color: col.white, borderColor: col.blue, borderWidth: 1.2 });
    if (on) this.page.drawCircle({ x: cx, y: cy, size: 3.4, color: col.blue });
  }
  checkbox(cx, cy, on) {
    this.page.drawRectangle({
      x: cx - 6.5, y: cy - 6.5, width: 13, height: 13, color: on ? col.blue : col.white, borderColor: col.blue, borderWidth: 1.2,
    });
    if (on) this.tick(cx, cy, 5, col.white);
  }
  tick(cx, cy, s, color, t = 1.8) {
    const o = { thickness: t, color, lineCap: LineCapStyle.Round };
    this.page.drawLine({ start: { x: cx - s * 0.7, y: cy - s * 0.05 }, end: { x: cx - s * 0.2, y: cy - s * 0.55 }, ...o });
    this.page.drawLine({ start: { x: cx - s * 0.2, y: cy - s * 0.55 }, end: { x: cx + s * 0.8, y: cy + s * 0.65 }, ...o });
  }
  cross(cx, cy, s, color, t = 1.8) {
    const o = { thickness: t, color, lineCap: LineCapStyle.Round };
    this.page.drawLine({ start: { x: cx - s * 0.55, y: cy - s * 0.55 }, end: { x: cx + s * 0.55, y: cy + s * 0.55 }, ...o });
    this.page.drawLine({ start: { x: cx - s * 0.55, y: cy + s * 0.55 }, end: { x: cx + s * 0.55, y: cy - s * 0.55 }, ...o });
  }
  statusMark(cx, cy, kind, on) {
    const p = this.page;
    if (!on) { p.drawCircle({ x: cx, y: cy, size: 7.5, color: col.white, borderColor: col.line, borderWidth: 0.9 }); return; }
    const c = { io: col.ok, mangel: col.bad, na: col.na }[kind];
    p.drawCircle({ x: cx, y: cy, size: 8.5, color: c });
    if (kind === 'io') this.tick(cx, cy, 5.2, col.white);
    else if (kind === 'mangel') this.cross(cx, cy, 5, col.white);
    else this.hline(cx - 3.8, cx + 3.8, cy, col.white, 1.8);
  }

  // Beschriftung über einem Feld
  label(str, x, { color = col.grey, size = 8.3 } = {}) {
    this.text(str, x, this.y - 8, { size, font: this.bold, color });
  }

  // Eine Reihe kurzer Felder: [{x, w, label, value}]. Höhe richtet sich nach dem längsten Text.
  fieldRow(cols, { minH = 27 } = {}) {
    const pad = 6, size = 9.5, lh = 12.2;
    const prep = cols.map((c) => ({ ...c, lines: wrap(this.font, size, c.value, c.w - 2 * pad) }));
    const boxH = Math.max(minH, ...prep.map((c) => c.lines.length * lh + 2 * pad - 1));
    this.ensure(12 + boxH + 14);
    prep.forEach((c) => this.label(c.label, c.x));
    this.gap(12);
    prep.forEach((c) => {
      this.rect(c.x, this.y, c.w, boxH, { fill: col.white, stroke: col.line });
      this.lines(c.lines, c.x + pad, this.y - (boxH - c.lines.length * lh) / 2, { size, lh });
      if (c.name) this.reg({ kind: 'text', name: c.name, x: c.x + 1, y: this.y - boxH + 1, w: c.w - 2, h: boxH - 2 });
    });
    this.gap(boxH + 14);
  }

  // Textfeld, das bei Bedarf über mehrere Seiten läuft.
  flowBox(label, value, { minH = 60, labelStyle, name } = {}) {
    const pad = 6, size = 9.5, lh = 12.2;
    const lines = wrap(this.font, size, value, CW - 2 * pad);
    let i = 0, first = true;
    for (;;) {
      const labelH = first ? 14 : 0;
      const avail = this.y - BOTTOM - labelH;
      const need = Math.max(minH, (lines.length - i) * lh + 2 * pad);
      if (need > avail && avail < 3 * lh + 2 * pad) { this.continuePage(); continue; }
      if (first) { this.text(label, M, this.y - 9, labelStyle || { size: 8.3, font: this.bold, color: col.grey }); this.gap(labelH); first = false; }
      const h = Math.min(need, avail);
      const fit = Math.floor((h - 2 * pad) / lh);
      this.rect(M, this.y, CW, h, { fill: col.white, stroke: col.line });
      const chunk = lines.slice(i, i + fit);
      this.lines(chunk, M + pad, this.y - pad + 1, { size, lh });
      if (name && i === 0) this.reg({ kind: 'text', name, multiline: true, x: M + 1, y: this.y - h + 1, w: CW - 2, h: h - 2 });
      i += chunk.length;
      this.gap(h);
      if (i >= lines.length) break;
      this.continuePage();
    }
    this.gap(14);
  }

  // Hinweiskasten
  note(title, str) {
    const pad = 10, size = 8.5, lh = 11.5;
    const lines = wrap(this.font, size, str, CW - 2 * pad);
    const h = pad + 13 + lines.length * lh + pad - 2;
    this.ensure(h + 8);
    this.rrect(M, this.y, CW, h, 6, { fill: col.soft, stroke: col.softLine });
    this.text(title, M + pad, this.y - pad - 7, { size: 9.5, font: this.bold, color: col.navy });
    this.lines(lines, M + pad, this.y - pad - 13, { size, lh });
    this.gap(h + 10);
  }

  // Tabellenkopf
  tableHead(cols) {
    this.rect(M, this.y, CW, 25, { fill: col.soft });
    cols.forEach((c) => {
      const w = this.bold.widthOfTextAtSize(c.t, 8);
      const x = c.center ? c.x + (c.w - w) / 2 : c.x + 8;
      this.text(c.t, x, this.y - 15.5, { size: 8, font: this.bold, color: col.grey });
    });
    this.gap(25);
  }
}

// Gemeinsame Spaltenaufteilung der Checkliste
const CK = { nr: [M, 38], text: [66, 400], io: [466, 58], mangel: [524, 58], na: [582, 58], note: [640, W - M - 640] };

function sectionGeneral(w, f) {
  w.section('1 · ALLGEMEINE ANGABEN', 'Objekt- und Prüfungsdaten');
  const x4 = [M, 282, 429, 629.5], w4 = [238, 130, 184, W - M - 629.5];
  w.fieldRow([
    { x: x4[0], w: w4[0], label: 'Dokument-Nr.', value: f.dokument_nr, name: 'dokument_nr' },
    { x: x4[1], w: w4[1], label: 'Revision', value: f.revision, name: 'revision' },
    { x: x4[2], w: w4[2], label: 'Prüfdatum', value: fmtDate(f.pruefdatum), name: 'pruefdatum' },
    { x: x4[3], w: w4[3], label: 'Prüfer', value: f.pruefer, name: 'pruefer' },
  ]);
  const half = (CW - 16) / 2, x2 = M + half + 16;
  w.fieldRow([
    { x: M, w: half, label: 'Objekt', value: f.objekt, name: 'objekt' },
    { x: x2, w: half, label: 'Gebäude / Bereich', value: f.gebaeude_bereich, name: 'gebaeude_bereich' },
  ]);
  w.fieldRow([
    { x: M, w: half, label: 'Standort', value: f.standort, name: 'standort' },
    { x: x2, w: half, label: 'Treppen-Nr.', value: f.treppen_nr, name: 'treppen_nr' },
  ]);

  // Treppentyp / Bauart als Auswahlreihen
  const opts = (name, label, list, value, x, width, extra) => {
    w.rrect(x, w.y, 130, 20, 5, { fill: col.soft });
    w.text(label, x + 9, w.y - 13.2, { size: 8, font: w.bold, color: col.navy });
    const top = w.y - 28;
    const cw = width / list.length;
    let maxLines = 1;
    list.forEach(([key, optName], i) => {
      const cx = x + i * cw;
      w.radio(cx + 9, top - 8, value === key);
      w.regRadio(name, key, cx + 9, top - 8);
      if (key === 'sonstige' && w.blank) {
        w.lines(['Sonstige:'], cx + 22, top - 1, { size: 9, lh: 11.5 });
        const bx = cx + 22 + 46, bw = cw - 22 - 46 - 6;
        w.rect(bx, top + 3, bw, 17, { fill: col.white, stroke: col.line });
        w.reg({ kind: 'text', name: 'bauart_sonstige', x: bx + 1, y: top + 3 - 17 + 1, w: bw - 2, h: 15 });
        return;
      }
      let t = optName;
      if (key === 'sonstige' && value === 'sonstige' && extra) t = `Sonstige: ${extra}`;
      const lines = wrap(w.font, 9, t, cw - 28);
      maxLines = Math.max(maxLines, lines.length);
      w.lines(lines, cx + 22, top - 1, { size: 9, lh: 11.5 });
    });
    return 28 + Math.max(18, maxLines * 11.5);
  };
  w.ensure(70);
  const h1 = opts('treppentyp', 'Treppentyp', TREPPENTYP, f.treppentyp, M, half);
  const h2 = opts('bauart', 'Bauart', BAUART, f.bauart, x2, half, S(f.bauart_sonstige));
  w.gap(Math.max(h1, h2) + 12);

  w.flowBox('Anwesende Personen', f.anwesende_personen, { minH: 27, name: 'anwesende_personen' });
  w.note('Prüfhinweis', TEXTE.pruefhinweis);
}

function sectionGrundlagen(w, f) {
  w.section('2 · PRÜFGRUNDLAGEN', 'Prüfgrundlagen und Anwendungsbereich');
  GRUNDLAGEN.forEach((name, i) => {
    w.ensure(30);
    const on = f[`grundlage_${i + 1}`] === 'Yes';
    w.rect(M, w.y, CW, 28, { fill: on ? col.blueSoft : col.white, stroke: col.line, lw: 0.5 });
    w.checkbox(M + 16, w.y - 14, on);
    w.reg({ kind: 'check', name: `grundlage_${i + 1}`, x: M + 16 - 6.5, y: w.y - 14 - 6.5, w: 13, h: 13 });
    w.text(name, M + 34, w.y - 17.5, { size: 9.5, font: on ? w.bold : w.font });
    w.gap(28);
  });
  w.gap(14);
  w.flowBox('Weitere Grundlagen / objektspezifische Festlegungen', f.grundlagen_frei, { minH: 56, name: 'grundlagen_frei' });
  w.note('Hinweis', TEXTE.grundlagenHinweis);
}

function sectionChecklist(w, f) {
  w.section('3 · SICHT- UND FUNKTIONSPRÜFUNG', 'Prüfcheckliste');
  const head = () => w.tableHead([
    { t: 'Nr.', x: CK.nr[0], w: CK.nr[1], center: true }, { t: 'Prüfpunkt', x: CK.text[0], w: CK.text[1] },
    { t: 'i. O.', x: CK.io[0], w: CK.io[1], center: true }, { t: 'Mangel', x: CK.mangel[0], w: CK.mangel[1], center: true },
    { t: 'n. a.', x: CK.na[0], w: CK.na[1], center: true }, { t: 'Bemerkung', x: CK.note[0], w: CK.note[1] },
  ]);
  w.text('i. O. = in Ordnung  ·  n. a. = nicht anwendbar', M, w.y - 8, { size: 8.5, color: col.grey });
  w.gap(16);
  head();
  CHECKPOINTS.forEach((name, i) => {
    const n = i + 1, status = f[`pruefstatus_${n}`];
    const tl = wrap(w.font, 8.6, name, CK.text[1] - 14);
    const nl = wrap(w.font, 8.2, f[`bemerkung_${n}`], CK.note[1] - 12);
    const h = Math.max(30, Math.max(tl.length, nl.length) * 11 + 12);
    if (w.ensure(h)) head();
    w.rect(M, w.y, CW, h, { fill: status === 'mangel' ? col.badSoft : undefined, stroke: col.line, lw: 0.5 });
    [CK.text[0], CK.io[0], CK.mangel[0], CK.na[0], CK.note[0]].forEach((x) => w.vline(x, w.y, w.y - h));
    w.text(String(n), CK.nr[0] + CK.nr[1] / 2 - w.bold.widthOfTextAtSize(String(n), 8.5) / 2, w.y - h / 2 - 3, { size: 8.5, font: w.bold, color: col.navy });
    w.lines(tl, CK.text[0] + 8, w.y - (h - tl.length * 11) / 2, { size: 8.6, lh: 11 });
    w.lines(nl, CK.note[0] + 6, w.y - (h - nl.length * 11) / 2, { size: 8.2, lh: 11 });
    ['io', 'mangel', 'na'].forEach((k) => {
      w.statusMark(CK[k][0] + CK[k][1] / 2, w.y - h / 2, k, status === k);
      w.regRadio(`pruefstatus_${n}`, k, CK[k][0] + CK[k][1] / 2, w.y - h / 2, 8);
    });
    w.reg({ kind: 'text', name: `bemerkung_${n}`, multiline: true, size: 8, x: CK.note[0] + 2, y: w.y - h + 2, w: CK.note[1] - 4, h: h - 4 });
    w.gap(h);
  });
  w.gap(12);
  w.note('Dokumentation', TEXTE.checklisteHinweis);
}

function blankDefects(w, c, head) {
  for (let k = 1; k <= 5; k++) {
    const h = 62;
    if (w.ensure(h)) head();
    w.rect(M, w.y, CW, h, { stroke: col.line, lw: 0.5 });
    [c.text[0], c.prio[0], c.mass[0], c.wer[0], c.term[0]].forEach((x) => w.vline(x, w.y, w.y - h));
    w.text(String(k), c.nr[0] + c.nr[1] / 2 - w.bold.widthOfTextAtSize(String(k), 8.5) / 2, w.y - h / 2 - 3, { size: 8.5, font: w.bold, color: col.navy });
    ['hoch', 'mittel', 'niedrig'].forEach((key, i) => {
      const cy = w.y - 13 - i * 18;
      w.radio(c.prio[0] + 13, cy, false);
      w.regRadio(`prioritaet_${k}`, key, c.prio[0] + 13, cy);
      w.text(key, c.prio[0] + 24, cy - 3, { size: 8.2 });
    });
    [['mangel', c.text], ['massnahme', c.mass], ['verantwortlich', c.wer], ['termin', c.term]].forEach(([nm, [x, wd]]) =>
      w.reg({ kind: 'text', name: `${nm}_${k}`, multiline: true, size: 8.6, x: x + 2, y: w.y - h + 2, w: wd - 4, h: h - 4 }));
    w.gap(h);
  }
}

function sectionDefects(w, f) {
  w.section('4 · FESTGESTELLTE MÄNGEL', 'Mängelerfassung');
  const c = { nr: [M, 34], text: [62, 230], prio: [292, 78], mass: [370, 230], wer: [600, 112], term: [712, W - M - 712] };
  const head = () => w.tableHead([
    { t: 'Nr.', x: c.nr[0], w: c.nr[1], center: true }, { t: 'Feststellung / Mangel', x: c.text[0], w: c.text[1] },
    { t: 'Priorität', x: c.prio[0], w: c.prio[1] }, { t: 'Erforderliche Maßnahme', x: c.mass[0], w: c.mass[1] },
    { t: 'Verantwortlich', x: c.wer[0], w: c.wer[1] }, { t: 'Termin', x: c.term[0], w: c.term[1] },
  ]);
  head();
  const nums = w.blank ? [] : defectNumbers(f);
  if (w.blank) blankDefects(w, c, head);
  else if (!nums.length) {
    w.rect(M, w.y, CW, 30, { stroke: col.line, lw: 0.5 });
    w.text('Es wurden keine Mängel festgestellt.', c.text[0] + 8, w.y - 18.5, { size: 9, color: col.ink });
    w.gap(30);
  }
  nums.forEach((n, idx) => {
    const ref = wrap(w.font, 7.6, `Prüfpunkt ${n}: ${CHECKPOINTS[n - 1]}`, c.text[1] - 14);
    const tl = wrap(w.font, 8.6, f[`bemerkung_${n}`], c.text[1] - 14);
    const ml = wrap(w.font, 8.6, f[`massnahme_${n}`], c.mass[1] - 14);
    const vl = wrap(w.font, 8.6, f[`verantwortlich_${n}`], c.wer[1] - 14);
    const prio = PRIO.find(([k]) => k === f[`prioritaet_${n}`]);
    const left = ref.length * 9.5 + tl.length * 11;
    const h = Math.max(38, left + 14, ml.length * 11 + 14, vl.length * 11 + 14);
    if (w.ensure(h)) head();
    w.rect(M, w.y, CW, h, { stroke: col.line, lw: 0.5 });
    [c.text[0], c.prio[0], c.mass[0], c.wer[0], c.term[0]].forEach((x) => w.vline(x, w.y, w.y - h));
    const lbl = String(idx + 1);
    w.text(lbl, c.nr[0] + c.nr[1] / 2 - w.bold.widthOfTextAtSize(lbl, 8.5) / 2, w.y - h / 2 - 3, { size: 8.5, font: w.bold, color: col.navy });
    const used = w.lines(ref, c.text[0] + 8, w.y - 7, { size: 7.6, lh: 9.5, color: col.grey });
    w.lines(tl, c.text[0] + 8, w.y - 7 - used - 2, { size: 8.6, lh: 11 });
    if (prio) {
      const pc = { hoch: col.bad, mittel: col.warn, niedrig: col.ok }[prio[0]];
      w.page.drawCircle({ x: c.prio[0] + 14, y: w.y - h / 2, size: 4, color: pc });
      w.text(prio[1].toLowerCase(), c.prio[0] + 24, w.y - h / 2 - 3, { size: 8.6, font: w.bold, color: pc });
    }
    w.lines(ml, c.mass[0] + 8, w.y - 7, { size: 8.6, lh: 11 });
    w.lines(vl, c.wer[0] + 8, w.y - 7, { size: 8.6, lh: 11 });
    w.lines(wrap(w.font, 8.6, fmtDate(f[`termin_${n}`]), c.term[1] - 12), c.term[0] + 6, w.y - 7, { size: 8.6, lh: 11 });
    w.gap(h);
  });
  w.gap(14);
  w.note('Bewertungshinweis', TEXTE.bewertungsHinweis);
}

async function sectionPhotos(w, f, photos, blobs) {
  w.section('5 · FOTODOKUMENTATION', 'Fotodokumentation und Anlagen');
  if (w.blank) photos = Array.from({ length: 6 }, (_, i) => ({ slot: `leer${i}`, caption: '' }));
  if (!photos.length) {
    w.rrect(M, w.y, CW, 60, 6, { fill: col.soft, stroke: col.softLine });
    w.text('Es wurden keine Fotos dokumentiert.', M + 16, w.y - 35, { size: 10, color: col.ink });
    return;
  }
  const items = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    let img = null;
    if (blobs[p.slot]) { try { img = await w.doc.embedJpg(blobs[p.slot]); } catch { img = null; } }
    items.push({ n: i + 1, p, img });
  }
  const gap = 12;
  const pages = [];
  for (let i = 0; i < items.length; i += 4) pages.push(items.slice(i, i + 4));
  pages.forEach((chunk, pi) => {
    if (pi > 0) w.continuePage();
    const top = w.y;
    const avail = top - BOTTOM;
    const cols = chunk.length === 1 ? 1 : 2;
    const rows = chunk.length <= 2 ? 1 : 2;
    const cw = (CW - gap * (cols - 1)) / cols;
    const ch = (avail - gap * (rows - 1)) / rows;
    chunk.forEach((it, k) => {
      const cx = M + (k % cols) * (cw + gap);
      const ctop = top - Math.floor(k / cols) * (ch + gap);
      photoCard(w, it, cx, ctop, cw, ch);
    });
    w.y = BOTTOM;
  });
}

function photoCard(w, { n, p, img }, x, top, cw, ch) {
  const pad = 10;
  w.rrect(x, top, cw, ch, 7, { fill: col.white, stroke: col.line });
  w.text(`Foto ${n}`, x + pad, top - pad - 8, { size: 9, font: w.bold, color: col.navy });
  const capLines = [];
  if (p.ref) capLines.push(...wrap(w.font, 7.8, `Prüfpunkt ${p.ref}: ${CHECKPOINTS[p.ref - 1]}`, cw - 2 * pad).slice(0, 1).map((t) => ({ t, grey: true })));
  wrap(w.font, 8.8, p.caption, cw - 2 * pad).slice(0, 3).forEach((t) => capLines.push({ t }));
  const capH = w.blank ? 28 : Math.max(14, capLines.length * 11 + 6);
  const imgTop = top - pad - 18;
  const imgH = ch - pad - 18 - capH - pad;
  const imgW = cw - 2 * pad;
  w.rect(x + pad, imgTop, imgW, imgH, { fill: col.soft, stroke: col.softLine });
  if (img) {
    const s = Math.min((imgW - 4) / img.width, (imgH - 4) / img.height);
    const dw = img.width * s, dh = img.height * s;
    w.page.drawImage(img, { x: x + pad + (imgW - dw) / 2, y: imgTop - imgH + (imgH - dh) / 2, width: dw, height: dh });
  } else if (w.blank) {
    w.page.drawRectangle({ x: x + pad, y: imgTop - imgH, width: imgW, height: imgH, color: col.soft, borderColor: col.blue, borderWidth: 0.8, borderDashArray: [3, 3] });
    const t = 'Foto hier einfügen';
    w.text(t, x + pad + (imgW - w.bold.widthOfTextAtSize(t, 9)) / 2, imgTop - imgH / 2 - 3, { size: 9, font: w.bold, color: col.grey });
  } else {
    w.text('Foto nicht verfügbar', x + pad + 10, imgTop - imgH / 2, { size: 9, color: col.grey });
  }
  if (w.blank) {
    w.rect(x + pad, imgTop - imgH - 3, imgW, capH - 3, { fill: col.white, stroke: col.line });
    w.reg({ kind: 'text', name: `foto_bemerkung_${n}`, x: x + pad + 1, y: imgTop - imgH - capH + 1, w: imgW - 2, h: capH - 5, size: 8.8 });
  }
  capLines.forEach((l, i) => {
    w.text(l.t, x + pad, imgTop - imgH - 12 - i * 11 + 0, { size: l.grey ? 7.8 : 8.8, color: l.grey ? col.grey : col.ink });
  });
}

function sectionResult(w, f) {
  w.section('6 · ERGEBNIS DER PRÜFUNG', 'Ergebnis und fachliche Bewertung');
  const accents = [col.ok, col.warn, col.bad, col.bad, col.blue];
  ERGEBNIS.forEach(([key, title, desc], i) => {
    const on = f.pruefergebnis === key;
    const dl = wrap(w.font, 8.6, desc, CW - 74);
    const h = 14 + 14 + dl.length * 11 + 12;
    w.ensure(h + 8);
    w.rrect(M, w.y, CW, h, 6, { fill: on ? col.blueSoft : col.white, stroke: on ? col.blue : col.line, lw: on ? 1.4 : 0.8 });
    w.rect(M + 10, w.y - 12, 4, h - 24, { fill: accents[i] });
    w.radio(M + 34, w.y - 22, on);
    w.regRadio('pruefergebnis', key, M + 34, w.y - 22);
    w.text(title, M + 52, w.y - 25, { size: 10, font: w.bold, color: col.navy });
    w.lines(dl, M + 52, w.y - 31, { size: 8.6, lh: 11 });
    w.gap(h + 8);
  });
  w.gap(6);
  w.flowBox('Zusatzbewertung / Begründung', f.ergebnis_bemerkung, { minH: 50, name: 'ergebnis_bemerkung' });
}

function sectionRemarks(w, f) {
  w.section('7-8 · BEMERKUNGEN UND MASSNAHMEN', 'Bemerkungen, Empfehlungen und Nachprüfung');
  const ls = { size: 10, font: w.bold, color: col.navy };
  w.flowBox('7. Bemerkungen', f.bemerkungen, { minH: 90, labelStyle: ls, name: 'bemerkungen' });
  w.flowBox('8. Empfehlungen / weitere Maßnahmen', f.empfehlungen, { minH: 90, labelStyle: ls, name: 'empfehlungen' });
  w.ensure(70);
  w.text('Erforderliche Nachprüfung', M, w.y - 9, ls);
  w.gap(24);
  w.radio(M + 9, w.y - 8, f.nachpruefung === 'nein'); w.text('nein', M + 24, w.y - 11.5, { size: 9.5 });
  w.regRadio('nachpruefung', 'nein', M + 9, w.y - 8);
  w.radio(M + 110, w.y - 8, f.nachpruefung === 'ja'); w.text('ja', M + 125, w.y - 11.5, { size: 9.5 });
  w.regRadio('nachpruefung', 'ja', M + 110, w.y - 8);
  if (w.blank || f.nachpruefung === 'ja') {
    w.text('Termin:', M + 170, w.y - 11.5, { size: 9.5, font: w.bold, color: col.grey });
    if (w.blank) {
      w.rect(M + 214, w.y + 1, 130, 20, { fill: col.white, stroke: col.line });
      w.reg({ kind: 'text', name: 'nachpruefung_datum', x: M + 215, y: w.y - 18, w: 128, h: 18 });
    } else {
      w.text(fmtDate(f.nachpruefung_datum) || '-', M + 214, w.y - 11.5, { size: 9.5 });
    }
  }
  w.gap(24);
}

async function sectionClosing(w, f, blobs, doc) {
  w.section('9 · ABSCHLUSS', 'Abschluss und nächste Prüfung');
  const cw = (CW - 16) / 2;
  const sigs = [];
  for (const n of [0, 1]) {
    let img = null;
    if (blobs[`signature_${n}`]) { try { img = await doc.embedPng(blobs[`signature_${n}`]); } catch { img = null; } }
    sigs.push(img);
  }
  const titles = ['Prüfer', 'Verantwortlicher Betreiber'];
  const ch = 214;
  w.ensure(ch + 10);
  [0, 1].forEach((n) => {
    const x = M + n * (cw + 16), top = w.y, pad = 14;
    w.rrect(x, top, cw, ch, 7, { fill: col.white, stroke: col.line });
    w.text(titles[n], x + pad, top - 24, { size: 11, font: w.bold, color: col.navy });
    const name = f[`abschluss_name_${n}`] || (n === 0 ? f.pruefer : '');
    const date = f[`abschluss_datum_${n}`] || (sigs[n] || name ? f.pruefdatum : '');
    const fw = cw - 2 * pad;
    const field = (label, y, h, fn, key) => {
      w.text(label, x + pad, y - 8, { size: 8.3, font: w.bold, color: col.grey });
      w.rect(x + pad, y - 13, fw, h, { fill: col.white, stroke: col.line });
      fn(y - 13);
      if (key) w.reg({ kind: 'text', name: key, x: x + pad + 1, y: y - 13 - h + 1, w: fw - 2, h: h - 2 });
    };
    field('Name', top - 38, 26, (y) => w.lines(wrap(w.font, 9.5, name, fw - 12).slice(0, 1), x + pad + 6, y - 6.5, { size: 9.5 }), `abschluss_name_${n}`);
    field('Unterschrift', top - 84, 66, (y) => {
      const img = sigs[n];
      if (!img) return;
      const s = Math.min((fw - 12) / img.width, 54 / img.height);
      w.page.drawImage(img, { x: x + pad + (fw - img.width * s) / 2, y: y - 66 + (66 - img.height * s) / 2, width: img.width * s, height: img.height * s });
    });
    field('Datum', top - 168, 26, (y) => w.lines([fmtDate(date)], x + pad + 6, y - 6.5, { size: 9.5 }), `abschluss_datum_${n}`);
  });
  w.gap(ch + 14);

  const h = 70;
  w.ensure(h + 8);
  w.rrect(M, w.y, CW, h, 7, { fill: col.white, stroke: col.line });
  w.text('Nächster Prüftermin', M + 14, w.y - 24, { size: 11, font: w.bold, color: col.navy });
  w.rect(M + 14, w.y - 38, 220, 26, { fill: col.white, stroke: col.line });
  w.lines([fmtDate(f.naechster_prueftermin)], M + 20, w.y - 44.5, { size: 10 });
  w.reg({ kind: 'text', name: 'naechster_prueftermin', size: 10, x: M + 15, y: w.y - 38 - 24, w: 218, h: 24 });
  w.text('Dokumentationshinweis:', M + 270, w.y - 24, { size: 8.3, font: w.bold, color: col.grey });
  w.lines(wrap(w.font, 8.3, TEXTE.dokuHinweis, CW - 270 - 14 - 10), M + 270, w.y - 31, { size: 8.3, lh: 11 });
}

// fields: Eingaben, photos: [{slot, caption, ref}], blobs: {slot: Uint8Array}
export async function buildPdf({ fields = {}, photos = [] } = {}, blobs = {}, { blank = false } = {}) {
  const f = fields;
  const doc = await PDFDocument.create();
  doc.setTitle(blank ? 'Prüfprotokoll (leere Vorlage)' : S(`Prüfprotokoll ${f.objekt || ''} ${f.standort || ''}`).trim());
  doc.setAuthor(S(f.pruefer) || 'DHRW Engineering GmbH');
  doc.setCreator('DHRW Prüfprotokoll');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, blank);

  sectionGeneral(w, f);
  sectionGrundlagen(w, f);
  sectionChecklist(w, f);
  sectionDefects(w, f);
  await sectionPhotos(w, f, photos, blobs);
  sectionResult(w, f);
  sectionRemarks(w, f);
  await sectionClosing(w, f, blobs, doc);

  if (blank) w.buildForm();
  w.finish('DHRW Engineering GmbH · Edisonallee 39 · 89231 Neu-Ulm · Tel. 0731 14113924 · info@dhrw.group');
  return doc.save();
}

export const buildBlankPdf = () => buildPdf({}, {}, { blank: true });
