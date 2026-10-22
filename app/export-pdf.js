// Fills the original template PDF and flattens it, without relying on the
// AcroForm tree (the template's field tree has orphaned widgets). We walk the
// widgets on each page, draw text / button appearances / images into the page
// content, then remove the widgets.

const PHOTO_BOXES = [
  // page index 5, PDF points, from the dashed "Foto hier einfügen" rectangles
  { x: 38, y: 391, w: 366, h: 80 }, { x: 438, y: 391, w: 366, h: 80 },
  { x: 38, y: 221, w: 366, h: 80 }, { x: 438, y: 221, w: 366, h: 80 },
  { x: 38, y: 51, w: 366, h: 80 }, { x: 438, y: 51, w: 366, h: 80 },
];
const TEXT_COLOR = [0.122, 0.161, 0.216];
const PAD = 3;

export async function buildPdf(templateBytes, record, blobs) {
  const { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, StandardFonts, rgb,
    pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
  const doc = await PDFDocument.load(templateBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const color = rgb(...TEXT_COLOR);
  const values = record.fields || {};
  const ctx = doc.context;

  const lookup = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const fieldName = (w) => {
    for (let d = w; d; d = lookup(d.get(PDFName.of('Parent')))) {
      const t = d.get(PDFName.of('T'));
      if (t) return t.decodeText();
    }
    return null;
  };
  const inherited = (w, key) => {
    for (let d = w; d; d = lookup(d.get(PDFName.of('Parent')))) {
      const v = d.get(PDFName.of(key));
      if (v) return lookup(v);
    }
    return undefined;
  };

  const widgetRects = {};
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const w = lookup(ref);
      if (!(w instanceof PDFDict) || w.get(PDFName.of('Subtype'))?.toString() !== '/Widget') continue;
      const name = fieldName(w);
      const [x1, y1, x2, y2] = lookup(w.get(PDFName.of('Rect'))).asArray().map((n) => n.asNumber());
      const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      widgetRects[name] = { page: pageIndex, ...rect };
      const ft = inherited(w, 'FT')?.toString();

      if (ft === '/Btn') {
        // Draw the widget's own appearance: its on-state if selected, else Off.
        const normal = lookup(lookup(w.get(PDFName.of('AP')))?.get(PDFName.of('N')));
        if (!(normal instanceof PDFDict)) continue;
        const onKey = normal.keys().map((k) => k.decodeText()).find((k) => k !== 'Off');
        const v = values[name];
        const state = onKey && v === onKey ? onKey : 'Off';
        const apRef = normal.get(PDFName.of(state));
        if (!apRef) continue;
        const xName = page.node.newXObject('FlatWidget', apRef);
        const bbox = lookup(lookup(apRef).dict.get(PDFName.of('BBox')))?.asArray().map((n) => n.asNumber()) || [0, 0, rect.w, rect.h];
        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(1, 0, 0, 1, rect.x - bbox[0], rect.y - bbox[1]),
          drawObject(xName),
          popGraphicsState(),
        );
      } else if (ft === '/Tx') {
        const text = sanitize(values[name]);
        if (!text || name.startsWith('abschluss_unterschrift')) continue;
        const da = inherited(w, 'DA')?.decodeText?.() || '';
        const size = parseFloat((da.match(/([\d.]+)\s+Tf/) || [])[1]) || 9;
        const multiline = ((inherited(w, 'Ff')?.asNumber?.() || 0) & 4096) !== 0;
        drawTextInRect(page, font, text, rect, size, multiline, color);
      }
    }
    page.node.delete(PDFName.of('Annots'));
  });
  doc.catalog.delete(PDFName.of('AcroForm'));

  // Photos
  const photoPage = doc.getPage(5);
  for (let i = 0; i < PHOTO_BOXES.length; i++) {
    const bytes = blobs[`photo_${i + 1}`];
    if (!bytes) continue;
    const img = await doc.embedJpg(bytes);
    const box = PHOTO_BOXES[i];
    // Cover the "Foto hier einfügen" placeholder text, keep the dashed border.
    photoPage.drawRectangle({ x: box.x + 1, y: box.y + 1, width: box.w - 2, height: box.h - 2, color: rgb(1, 1, 1) });
    fitImage(photoPage, img, box, 2);
  }

  // Signatures
  for (const n of [0, 1]) {
    const bytes = blobs[`signature_${n}`];
    const r = widgetRects[`abschluss_unterschrift_${n}`];
    if (!bytes || !r) continue;
    const img = await doc.embedPng(bytes);
    fitImage(doc.getPage(r.page), img, r, 2);
  }

  return doc.save();
}

function fitImage(page, img, box, pad) {
  const s = Math.min((box.w - 2 * pad) / img.width, (box.h - 2 * pad) / img.height);
  const w = img.width * s, h = img.height * s;
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h });
}

// Helvetica (WinAnsi) can't encode everything a phone keyboard produces.
function sanitize(v) {
  if (v == null) return '';
  return String(v)
    .replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E -ÿ€–—]/g, '')
    .trim();
}

function wrap(font, text, size, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= maxWidth || !line) line = cand;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function drawTextInRect(page, font, text, rect, baseSize, multiline, color) {
  const maxW = rect.w - 2 * PAD;
  if (!multiline) {
    let size = baseSize;
    const flat = text.replace(/\s*\n\s*/g, ', ');
    while (size > 5 && font.widthOfTextAtSize(flat, size) > maxW) size -= 0.5;
    let t = flat;
    while (t.length && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    const y = rect.y + (rect.h - font.heightAtSize(size, { descender: false })) / 2;
    page.drawText(t, { x: rect.x + PAD, y, size, font, color });
    return;
  }
  let size = baseSize, lines;
  for (;;) {
    lines = wrap(font, text, size, maxW);
    if (lines.length * size * 1.2 <= rect.h - 2 * PAD || size <= 5) break;
    size -= 0.5;
  }
  const lh = size * 1.2;
  let y = rect.y + rect.h - PAD - size;
  for (const line of lines) {
    if (y < rect.y + PAD - 1) break;
    page.drawText(line, { x: rect.x + PAD, y, size, font, color });
    y -= lh;
  }
}
