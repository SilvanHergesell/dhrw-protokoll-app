import { SECTIONS, DATE_FIELDS } from './fields.js';
import * as db from './db.js';
import { buildPdf } from './export-pdf.js';

const $app = document.getElementById('app');
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
};

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const recordTitle = (r) =>
  [r.fields.objekt, r.fields.standort, r.fields.treppen_nr && `Treppe ${r.fields.treppen_nr}`]
    .filter(Boolean).join(' · ') || 'Neue Prüfung';

// ---------- List view ----------

async function renderList() {
  const records = await db.listRecords();
  $app.replaceChildren(
    h('header', { class: 'bar' }, h('h1', {}, 'Prüfprotokolle')),
    h('main', { class: 'list' },
      h('button', { class: 'primary big', onclick: () => createRecord() }, '+ Neue Prüfung'),
      records.length === 0 && h('p', { class: 'muted' }, 'Noch keine Prüfungen. Lege für jeden Standort eine an.'),
      records.map((r) =>
        h('div', { class: 'card' },
          h('a', { class: 'card-main', href: `#/r/${r.id}` },
            h('strong', {}, recordTitle(r)),
            h('span', { class: 'muted' }, `Geändert ${new Date(r.updatedAt).toLocaleString('de-DE')}`)),
          h('div', { class: 'card-actions' },
            h('button', { onclick: () => createRecord(r) }, 'Kopie'),
            h('button', { class: 'danger', onclick: async () => {
              if (!confirm(`„${recordTitle(r)}“ mit allen Fotos löschen?`)) return;
              await db.deleteRecord(r.id);
              renderList();
            } }, 'Löschen'))))),
    h('footer', { class: 'muted small' }, storageNote));
  updateStorageNote();
}

const storageNote = h('span');
async function updateStorageNote() {
  if (!navigator.storage?.estimate) return;
  const { usage = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  storageNote.textContent = `Gespeichert auf diesem Gerät: ${(usage / 1e6).toFixed(1)} MB` +
    (persisted ? '' : ' · Speicher nicht dauerhaft gesichert');
}

// A copy keeps the object/location data but not photos, signatures or results.
const COPY_FIELDS = ['dokument_nr', 'revision', 'pruefer', 'objekt', 'gebaeude_bereich', 'standort',
  'treppentyp', 'bauart', 'bauart_sonstige', 'grundlagen_zusatz', 'grundlagen_frei',
  ...Array.from({ length: 8 }, (_, i) => `grundlage_${i + 1}`)];

async function createRecord(from) {
  const fields = {};
  if (from) for (const k of COPY_FIELDS) if (from.fields[k]) fields[k] = from.fields[k];
  fields.pruefdatum = new Date().toISOString().slice(0, 10);
  const rec = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), fields };
  await db.putRecord(rec);
  navigator.storage?.persist?.();
  location.hash = `#/r/${rec.id}`;
}

// ---------- Editor ----------

let current = null;
let saveTimer = null;
function setField(name, value) {
  if (value === '' || value == null) delete current.fields[name];
  else current.fields[name] = value;
  current.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.putRecord(current), 300);
  document.querySelector('.bar h1').textContent = recordTitle(current);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (current) await db.putRecord(current);
}

async function renderEditor(id) {
  const rec = await db.getRecord(id);
  if (!rec) { location.hash = '#/'; return; }
  current = rec;
  $app.replaceChildren(
    h('header', { class: 'bar' },
      h('a', { class: 'back', href: '#/', 'aria-label': 'Zurück' }, '‹'),
      h('h1', {}, recordTitle(rec)),
      h('button', { class: 'primary', onclick: exportPdf }, 'PDF')),
    h('main', { class: 'editor' },
      SECTIONS.map((s, i) => h('details', { class: 'section', open: i === 0 },
        h('summary', {}, s.title),
        h('div', { class: 'section-body' }, s.items.map(renderItem)))),
      h('button', { class: 'primary big', onclick: exportPdf }, 'PDF erstellen und teilen'),
      h('button', { class: 'link', onclick: fillTestData }, 'Testdaten einfügen')));
}

function renderItem(it) {
  const v = current.fields[it.name] ?? '';
  switch (it.type) {
    case 'text':
      return h('label', { class: 'field' }, h('span', {}, it.label),
        h('input', { type: 'text', value: v, oninput: (e) => setField(it.name, e.target.value) }));
    case 'date':
      return h('label', { class: 'field' }, h('span', {}, it.label),
        h('input', { type: 'date', value: v, oninput: (e) => setField(it.name, e.target.value) }));
    case 'textarea':
      return h('label', { class: 'field' }, h('span', {}, it.label),
        h('textarea', { rows: it.rows || 3, oninput: (e) => setField(it.name, e.target.value) }, v));
    case 'check':
      return h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: v === 'Yes',
          onchange: (e) => setField(it.name, e.target.checked ? 'Yes' : '') }),
        h('span', {}, it.label));
    case 'radio':
      return h('fieldset', { class: 'field' }, h('legend', {}, it.label), segmented(it.name, it.options, it.vertical));
    case 'checkpoint':
      return h('div', { class: 'checkpoint' },
        h('div', { class: 'cp-head' }, h('span', { class: 'nr' }, it.nr), h('span', {}, it.label)),
        segmented(it.status, it.options),
        h('input', { type: 'text', placeholder: 'Bemerkung', value: current.fields[it.remark] ?? '',
          oninput: (e) => setField(it.remark, e.target.value) }));
    case 'group':
      return h('div', { class: 'group' }, h('h3', {}, it.label), it.items.map(renderItem));
    case 'photo':
      return h('div', { class: 'group' }, h('h3', {}, it.label), photoInput(it.slot), it.items.map(renderItem));
    case 'signature':
      return h('div', { class: 'field' }, h('span', {}, it.label), signaturePad(it.slot));
  }
}

// Tap-again-to-clear segmented buttons, so a wrong tap can be undone.
function segmented(name, options, vertical) {
  const wrap = h('div', { class: `seg${vertical ? ' vertical' : ''}`, role: 'radiogroup' });
  const paint = () => wrap.querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.v === current.fields[name])));
  for (const [val, label] of options) {
    wrap.append(h('button', { type: 'button', role: 'radio', 'data-v': val, class: `opt-${val}`, onclick: () => {
      setField(name, current.fields[name] === val ? '' : val);
      paint();
    } }, label));
  }
  paint();
  return wrap;
}

// ---------- Photos ----------

async function compressImage(file, maxSide = 1600, quality = 0.8) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}

function photoInput(slot) {
  const id = current.id;
  const preview = h('div', { class: 'photo-preview' }, h('span', { class: 'muted' }, 'Kein Foto'));
  const show = (blob) => {
    if (!blob) { preview.replaceChildren(h('span', { class: 'muted' }, 'Kein Foto')); return; }
    const url = URL.createObjectURL(blob);
    preview.replaceChildren(h('img', { src: url, alt: '', onload: () => URL.revokeObjectURL(url) }));
  };
  db.getBlob(id, slot).then(show);
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await compressImage(file);
      await db.putBlob(id, slot, blob);
      setField(`_has_${slot}`, '1');
      show(blob);
    } catch (err) {
      toast('Foto konnte nicht gelesen werden');
      console.error(err);
    }
  };
  return h('div', { class: 'photo' }, preview,
    h('div', { class: 'row' },
      h('label', { class: 'btn' }, 'Kamera',
        h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: pick })),
      h('label', { class: 'btn' }, 'Galerie',
        h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: pick })),
      h('button', { class: 'danger', onclick: async () => {
        await db.deleteBlob(id, slot);
        setField(`_has_${slot}`, '');
        show(null);
      } }, 'Entfernen')));
}

// ---------- Signatures ----------

function signaturePad(slot) {
  const id = current.id;
  const canvas = h('canvas', { class: 'sig' });
  const ctx = canvas.getContext('2d');
  let drawing = false, dirty = false, last;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    // Matches the PDF box ratio (360 x 62 pt).
    canvas.width = Math.round(r.width * devicePixelRatio);
    canvas.height = Math.round(r.width * (62 / 360) * devicePixelRatio);
    canvas.style.height = `${r.width * (62 / 360)}px`;
    ctx.lineWidth = 2.2 * devicePixelRatio;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14215a';
    db.getBlob(id, slot).then(async (b) => {
      if (!b) return;
      const bmp = await createImageBitmap(b);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    });
  };
  new ResizeObserver(resize).observe(canvas);

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio];
  };
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
    last = p; dirty = true;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (dirty) canvas.toBlob(async (b) => {
      await db.putBlob(id, slot, b);
      setField(`_has_${slot}`, '1');
    }, 'image/png');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return h('div', {}, canvas,
    h('button', { class: 'link', onclick: async () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      await db.deleteBlob(id, slot);
      setField(`_has_${slot}`, '');
    } }, 'Unterschrift löschen'));
}

// ---------- Export ----------

let templateBytes;
async function exportPdf() {
  await flushSave();
  const btns = document.querySelectorAll('button.primary');
  btns.forEach((b) => (b.disabled = true));
  try {
    templateBytes ??= new Uint8Array(await (await fetch('template.pdf')).arrayBuffer());
    const fields = {};
    for (const [k, v] of Object.entries(current.fields)) {
      if (k.startsWith('_')) continue;
      fields[k] = DATE_FIELDS.has(k) ? fmtDate(v) : v;
    }
    const blobs = {};
    for (const slot of ['photo_1', 'photo_2', 'photo_3', 'photo_4', 'photo_5', 'photo_6', 'signature_0', 'signature_1']) {
      const b = await db.getBlob(current.id, slot);
      if (b) blobs[slot] = new Uint8Array(await b.arrayBuffer());
    }
    const bytes = await buildPdf(templateBytes, { fields }, blobs);
    const name = `Pruefprotokoll_${recordTitle(current).replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${current.fields.pruefdatum || ''}.pdf`;
    const file = new File([bytes], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    console.error(err);
    toast('PDF konnte nicht erstellt werden');
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

async function fillTestData() {
  const today = new Date().toISOString().slice(0, 10);
  Object.assign(current.fields, {
    dokument_nr: '001', revision: 'A', pruefdatum: today, pruefer: 'Max Mustermann',
    objekt: 'HzB Wannsee', gebaeude_bereich: 'Halle 2', standort: 'Nordseite', treppen_nr: 'T-03',
    treppentyp: 'flucht', bauart: 'stahl', anwesende_personen: 'M. Mustermann, E. Beispiel',
    grundlage_1: 'Yes', grundlage_2: 'Yes', grundlage_4: 'Yes',
    pruefergebnis: 'gering', ergebnis_bemerkung: 'Nutzung weiterhin möglich.',
    mangel_1: 'Stufe 3 lose', prioritaet_1: 'mittel', massnahme_1: 'Stufe nachziehen',
    verantwortlich_1: 'Betreiber', termin_1: today,
    bemerkungen: 'Testeintrag aus der App.', nachpruefung: 'ja', nachpruefung_datum: today,
    abschluss_name_0: 'Max Mustermann', abschluss_datum_0: today,
  });
  for (let i = 1; i <= 24; i++) current.fields[`pruefstatus_${i}`] = i === 2 ? 'mangel' : 'io';
  current.fields.bemerkung_2 = 'Stufe 3 lose, siehe Mangel 1';
  current.updatedAt = Date.now();
  await flushSave();
  await renderEditor(current.id);
  toast('Testdaten eingefügt');
}

// ---------- Routing ----------

async function route() {
  await flushSave();
  current = null;
  const m = location.hash.match(/^#\/r\/(.+)$/);
  if (m) renderEditor(m[1]); else renderList();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => document.hidden && flushSave());
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version verfügbar – App neu öffnen');
        }
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));
}
