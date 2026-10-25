import {
  CHECKPOINTS, GRUNDLAGEN, TREPPENTYP, BAUART, STATUS, PRIO, ERGEBNIS, MAX_PHOTOS,
  defectNumbers, answeredCount, migrate,
} from './fields.js';
import * as db from './db.js';
import { buildPdf } from './export-pdf.js';

const APP_VERSION = '2';
const $app = document.getElementById('app');

// ---------- Hilfsfunktionen ----------

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : iso || '');

function toast(msg, { sticky = false, onclick } = {}) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status', onclick }, msg);
  document.body.append(t);
  if (!sticky) setTimeout(() => t.remove(), 3500);
}

// Großer Dialog mit Tasten. Gibt den `value` der gewählten Taste zurück.
function ask(title, text, buttons) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close(null) },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, title),
        text && h('p', { class: 'lead' }, text),
        buttons.map((b) => h('button', { class: `btn ${b.kind || 'ghost'}`, onclick: () => close(b.value) }, b.label))));
    document.body.append(overlay);
  });
}

function busy(text) {
  const el = h('div', { class: 'overlay busy' }, h('div', { class: 'sheet' }, h('p', { class: 'lead' }, text)));
  document.body.append(el);
  return () => el.remove();
}

// ---------- Schritte ----------

const STEPS = [
  { id: 'ort', name: 'Ort' },
  { id: 'treppe', name: 'Treppe' },
  { id: 'grundlagen', name: 'Grundlagen' },
  { id: 'punkte', name: 'Prüfpunkte' },
  { id: 'fotos', name: 'Fotos' },
  { id: 'ergebnis', name: 'Ergebnis' },
  { id: 'anmerkungen', name: 'Anmerkungen' },
  { id: 'unterschrift', name: 'Unterschrift' },
  { id: 'fertig', name: 'Abschluss' },
];
const STEP_PUNKTE = STEPS.findIndex((s) => s.id === 'punkte');
const NQ = CHECKPOINTS.length;

let current = null;
let urls = [];
let saveTimer = null;

const recordTitle = (r) =>
  [r.fields.objekt, r.fields.standort, r.fields.treppen_nr && `Treppe ${r.fields.treppen_nr}`]
    .filter(Boolean).join(' · ') || 'Neue Prüfung';

function scheduleSave() {
  current.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.putRecord(current), 300);
}
async function flush() {
  clearTimeout(saveTimer);
  if (current) await db.putRecord(current);
}
function setField(name, value) {
  if (value === '' || value == null) delete current.fields[name];
  else current.fields[name] = value;
  scheduleSave();
}

function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
}

// ---------- Startseite ----------

async function renderList() {
  const records = await db.listRecords();
  records.forEach((r) => migrate(r));
  $app.replaceChildren(
    h('header', { class: 'top' }, h('span', { class: 'top-title' }, 'Prüfprotokolle')),
    h('main', { class: 'screen' },
      h('button', { class: 'btn primary huge', onclick: () => createRecord(null, records[0]) }, '＋ Neue Prüfung'),
      records.length
        ? h('h2', { class: 'list-title' }, 'Meine Prüfungen')
        : h('p', { class: 'lead' }, 'Hier erscheinen Ihre Prüfungen. Tippen Sie auf „Neue Prüfung“, um zu beginnen.'),
      records.map((r) => h('div', { class: 'card' },
        h('button', { class: 'card-main', onclick: () => { location.hash = `#/r/${r.id}`; } },
          h('strong', {}, recordTitle(r)),
          h('span', { class: 'muted' },
            [fmtDate(r.fields.pruefdatum), r.exportedAt ? '✓ PDF erstellt' : `In Arbeit · ${STEPS[r.pos?.step ?? 0].name}`]
              .filter(Boolean).join(' · '))),
        h('button', { class: 'card-more', 'aria-label': 'Mehr', onclick: () => cardMenu(r, records) }, '⋯')))),
    h('footer', { class: 'foot' },
      h('p', {}, 'Alles wird automatisch auf diesem Gerät gespeichert. Die App funktioniert auch ohne Internet.'),
      location.search.includes('demo') && h('button', { class: 'link', onclick: createDemo }, 'Testdaten'),
      h('p', { class: 'tiny' }, `Version ${APP_VERSION}`)));
}

async function cardMenu(r, records) {
  const v = await ask(recordTitle(r), '', [
    { label: 'Kopie erstellen', value: 'copy' },
    { label: 'Löschen', value: 'del', kind: 'danger' },
    { label: 'Abbrechen', value: null },
  ]);
  if (v === 'copy') {
    await createRecord(r, null, true);
  } else if (v === 'del') {
    const sure = await ask('Wirklich löschen?', 'Alle Angaben und Fotos dieser Prüfung gehen verloren.', [
      { label: 'Ja, löschen', value: true, kind: 'danger' },
      { label: 'Nein, behalten', value: false, kind: 'primary' },
    ]);
    if (sure) { await db.deleteRecord(r.id); renderList(); }
  }
}

const CARRY = ['dokument_nr', 'revision', 'pruefer', 'objekt', 'gebaeude_bereich', 'grundlagen_frei',
  ...GRUNDLAGEN.map((_, i) => `grundlage_${i + 1}`)];
const CARRY_COPY = [...CARRY, 'standort', 'treppen_nr', 'treppentyp', 'bauart', 'bauart_sonstige'];

// Neue Prüfung übernimmt Objekt, Prüfer und Grundlagen der letzten Prüfung.
async function createRecord(copyOf, last, goToList) {
  const src = copyOf || last;
  const fields = {};
  if (src) for (const k of copyOf ? CARRY_COPY : CARRY) if (src.fields[k]) fields[k] = src.fields[k];
  fields.pruefdatum = today();
  const rec = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), fields, photos: [], pos: { step: 0, q: 0 } };
  await db.putRecord(rec);
  navigator.storage?.persist?.();
  if (goToList) renderList(); else location.hash = `#/r/${rec.id}`;
}

async function createDemo() {
  const t = today();
  const fields = {
    dokument_nr: '001', revision: 'A', pruefdatum: t, pruefer: 'Max Mustermann', objekt: 'HzB Wannsee',
    gebaeude_bereich: 'Halle 2', standort: 'Nordseite', treppen_nr: 'T-03', treppentyp: 'flucht', bauart: 'stahl',
    anwesende_personen: 'M. Mustermann, E. Beispiel', grundlage_1: 'Yes', grundlage_2: 'Yes',
  };
  for (let i = 1; i <= NQ; i++) fields[`pruefstatus_${i}`] = i === 2 ? 'mangel' : 'io';
  Object.assign(fields, { bemerkung_2: 'Stufe 3 lose', prioritaet_2: 'mittel', massnahme_2: 'Stufe nachziehen' });
  await db.putRecord({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), fields, photos: [], pos: { step: 0, q: 0 } });
  renderList();
}

// ---------- Führung durch die Schritte ----------

async function openRecord(id) {
  const rec = await db.getRecord(id);
  if (!rec) { location.hash = '#/'; return; }
  if (migrate(rec)) await db.putRecord(rec);
  rec.pos ??= { step: 0, q: 0 };
  current = rec;
  render();
}

async function go(step, q = 0) {
  current.pos = { step, q };
  await flush();
  render();
}

function prevPos() {
  const { step, q } = current.pos;
  if (step === STEP_PUNKTE && q > 0) return [step, q - 1];
  if (step === 0) return null;
  return step - 1 === STEP_PUNKTE ? [step - 1, NQ - 1] : [step - 1, 0];
}
function nextPos() {
  const { step, q } = current.pos;
  if (step === STEP_PUNKTE && q < NQ - 1) return [step, q + 1];
  if (step >= STEPS.length - 1) return null;
  return [step + 1, 0];
}

function render(keepScroll) {
  const y = window.scrollY;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  const { step, q } = current.pos;
  const s = STEPS[step];
  const screens = {
    ort: screenOrt, treppe: screenTreppe, grundlagen: screenGrundlagen, punkte: screenPunkte, fotos: screenFotos,
    ergebnis: screenErgebnis, anmerkungen: screenAnmerkungen, unterschrift: screenUnterschrift, fertig: screenFertig,
  };
  const label = s.id === 'punkte' ? `Frage ${q + 1} von ${NQ}` : `Schritt ${step + 1} von ${STEPS.length}`;
  const progress = ((step + (s.id === 'punkte' ? (q + 1) / NQ : 1)) / STEPS.length) * 100;
  const prev = prevPos(), next = nextPos();
  $app.replaceChildren(
    h('header', { class: 'top' },
      h('button', { class: 'top-back', onclick: backToList }, '‹ Liste'),
      h('button', { class: 'top-steps', onclick: stepsMenu }, `${label} ▾`)),
    h('div', { class: 'progress', 'aria-hidden': 'true' }, h('div', { style: `width:${progress}%` })),
    h('main', { class: 'screen' }, screens[s.id]()),
    h('nav', { class: `nav${prev ? '' : ' single'}` },
      prev && h('button', { class: 'btn ghost', onclick: () => go(...prev) }, '‹ Zurück'),
      next && h('button', { class: 'btn primary', onclick: () => go(...next) }, 'Weiter ›'),
      !next && h('button', { class: 'btn primary', onclick: (e) => exportPdf(e.currentTarget) }, 'PDF erstellen')));
  window.scrollTo(0, keepScroll ? y : 0);
}

async function backToList() {
  await flush();
  location.hash = '#/';
}

function stepDone(id) {
  const f = current.fields;
  return {
    ort: !!f.objekt, treppe: !!(f.treppentyp && f.bauart), grundlagen: GRUNDLAGEN.some((_, i) => f[`grundlage_${i + 1}`]),
    punkte: answeredCount(f) === NQ, fotos: current.photos.length > 0, ergebnis: !!f.pruefergebnis,
    anmerkungen: !!(f.bemerkungen || f.empfehlungen), unterschrift: !!f._has_signature_0, fertig: !!current.exportedAt,
  }[id];
}

async function stepsMenu() {
  const v = await ask('Springen zu …', '', [
    ...STEPS.map((s, i) => ({ label: `${stepDone(s.id) ? '✓' : '○'}  ${s.name}`, value: i, kind: i === current.pos.step ? 'primary' : 'ghost' })),
    { label: 'Schließen', value: null },
  ]);
  if (v != null) go(v, v === STEP_PUNKTE ? Math.max(0, firstUnanswered()) : 0);
}
const firstUnanswered = () => {
  const i = CHECKPOINTS.findIndex((_, k) => !current.fields[`pruefstatus_${k + 1}`]);
  return i < 0 ? 0 : i;
};

// ---------- Bausteine ----------

function textField(name, label, { area = false, rows = 3, ph = '', max, type = 'text' } = {}) {
  const el = area
    ? h('textarea', { rows, placeholder: ph, maxlength: max })
    : h('input', { type, placeholder: ph, maxlength: max, autocomplete: 'off', enterkeyhint: 'next' });
  el.value = current.fields[name] ?? '';
  el.addEventListener('input', () => setField(name, el.value));
  return h('label', { class: 'f' }, h('span', {}, label), el);
}

function choiceGroup(name, list, { cols = 1, onChange } = {}) {
  const wrap = h('div', { class: `choices cols${cols}`, role: 'radiogroup' });
  const paint = () => wrap.querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.v === current.fields[name])));
  list.forEach(([val, label]) => wrap.append(
    h('button', { type: 'button', class: 'choice', 'data-v': val, role: 'radio', onclick: () => {
      setField(name, val);
      paint();
      onChange?.(val);
    } }, h('i', { class: 'mark' }), label)));
  paint();
  return wrap;
}

function checkRow(name, label) {
  const b = h('button', { type: 'button', class: 'choice check', role: 'checkbox', onclick: () => {
    setField(name, current.fields[name] === 'Yes' ? '' : 'Yes');
    b.setAttribute('aria-pressed', String(current.fields[name] === 'Yes'));
  } }, h('i', { class: 'mark' }), label);
  b.setAttribute('aria-pressed', String(current.fields[name] === 'Yes'));
  return b;
}

// ---------- Schritte: Ort, Treppe, Grundlagen ----------

function screenOrt() {
  return h('div', {},
    h('h2', {}, 'Wo prüfen Sie?'),
    textField('objekt', 'Objekt', { ph: 'z. B. HzB Wannsee' }),
    textField('gebaeude_bereich', 'Gebäude / Bereich'),
    textField('standort', 'Standort der Treppe'),
    textField('treppen_nr', 'Treppen-Nr.'),
    textField('pruefer', 'Ihr Name'),
    textField('pruefdatum', 'Datum', { type: 'date' }),
    h('details', { class: 'more' }, h('summary', {}, 'Weitere Angaben'),
      textField('dokument_nr', 'Dokument-Nr.'), textField('revision', 'Revision')));
}

function screenTreppe() {
  const f = current.fields;
  return h('div', {},
    h('h2', {}, 'Welche Treppe ist es?'),
    h('p', { class: 'label' }, 'Art der Treppe'),
    choiceGroup('treppentyp', TREPPENTYP),
    h('p', { class: 'label' }, 'Material'),
    choiceGroup('bauart', BAUART, { onChange: () => render(true) }),
    f.bauart === 'sonstige' && textField('bauart_sonstige', 'Welches Material?'),
    textField('anwesende_personen', 'Wer ist bei der Prüfung dabei?', { area: true, rows: 2 }));
}

function screenGrundlagen() {
  return h('div', {},
    h('h2', {}, 'Wonach wird geprüft?'),
    h('p', { class: 'lead' }, 'Tippen Sie alles an, was gilt.'),
    GRUNDLAGEN.map((g, i) => checkRow(`grundlage_${i + 1}`, g)),
    textField('grundlagen_frei', 'Weitere Grundlagen (freiwillig)', { area: true, rows: 2 }));
}

// ---------- Schritt: Prüfpunkte ----------

let advanceTimer = null;

function screenPunkte() {
  const { q } = current.pos;
  const n = q + 1;
  const status = current.fields[`pruefstatus_${n}`];
  const buttons = h('div', { class: 'choices cols1' });
  STATUS.forEach(([val, label]) => buttons.append(
    h('button', { type: 'button', class: `choice big st-${val}`, 'aria-pressed': String(status === val), onclick: () => {
      setField(`pruefstatus_${n}`, val);
      clearTimeout(advanceTimer);
      if (val === 'mangel') {
        if (!current.fields[`prioritaet_${n}`]) setField(`prioritaet_${n}`, 'mittel');
        render(true);
        return;
      }
      render(true);
      const nx = nextPos(), at = `${current.pos.step}:${current.pos.q}`;
      advanceTimer = setTimeout(() => {
        if (nx && current && `${current.pos.step}:${current.pos.q}` === at) go(...nx);
      }, 350);
    } }, h('i', { class: 'mark' }), label)));
  return h('div', {},
    h('p', { class: 'qno' }, `Prüfpunkt ${n}`),
    h('h2', { class: 'question' }, CHECKPOINTS[q]),
    buttons,
    status === 'mangel' && defectPanel(n));
}

function defectPanel(n) {
  const linked = current.photos.map((p, i) => ({ p, i })).filter(({ p }) => p.ref === n);
  return h('section', { class: 'panel' },
    textField(`bemerkung_${n}`, 'Was ist das Problem?', { area: true, rows: 3, ph: 'Kurz beschreiben', max: 400 }),
    h('p', { class: 'label' }, 'Wie dringend?'),
    choiceGroup(`prioritaet_${n}`, PRIO, { cols: 3 }),
    h('p', { class: 'label' }, 'Foto zum Mangel'),
    photoButtons(n),
    linked.length > 0 && photoGrid(linked),
    h('details', { class: 'more' }, h('summary', {}, 'Weitere Angaben'),
      textField(`massnahme_${n}`, 'Was ist zu tun?', { area: true, rows: 2, max: 300 }),
      textField(`verantwortlich_${n}`, 'Wer kümmert sich?', { max: 100 }),
      textField(`termin_${n}`, 'Bis wann?', { type: 'date' })));
}

// ---------- Fotos ----------

async function compressImage(file, maxSide = 1800, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', quality));
}

async function addFiles(files, ref) {
  const list = [...files];
  if (!list.length) return;
  const room = MAX_PHOTOS - current.photos.length;
  if (room <= 0) { toast(`Mehr als ${MAX_PHOTOS} Fotos sind nicht möglich.`); return; }
  const done = busy('Foto wird gespeichert …');
  let failed = false;
  for (const file of list.slice(0, room)) {
    try {
      const blob = await compressImage(file);
      const slot = `photo_${uid().slice(0, 8)}`;
      await db.putBlob(current.id, slot, blob);
      current.photos.push(ref ? { slot, caption: '', ref } : { slot, caption: '' });
    } catch (e) { failed = true; console.error(e); }
  }
  current.updatedAt = Date.now();
  await db.putRecord(current);
  done();
  if (failed) toast('Ein Foto konnte nicht gelesen werden.');
  else if (list.length > room) toast(`Es passen höchstens ${MAX_PHOTOS} Fotos.`);
  render(true);
}

function photoButtons(ref) {
  const pick = (e) => { const files = e.target.files; addFiles(files, ref).then(() => { e.target.value = ''; }); };
  return h('div', { class: 'row2' },
    h('label', { class: 'btn primary' }, '📷 Foto aufnehmen',
      h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: pick })),
    h('label', { class: 'btn ghost' }, '🖼 Aus Galerie',
      h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: pick })));
}

function photoGrid(items) {
  return h('div', { class: 'grid2' }, items.map(({ p, i }) => {
    const img = h('img', { alt: `Foto ${i + 1}` });
    db.getBlob(current.id, p.slot).then((b) => { if (b) img.src = blobUrl(b); });
    return h('button', { class: 'tile', 'aria-label': `Foto ${i + 1} vergrößern`, onclick: () => openLightbox(i) },
      img, h('span', { class: 'badge' }, i + 1), p.caption && h('span', { class: 'cap' }, p.caption));
  }));
}

function screenFotos() {
  const n = current.photos.length;
  return h('div', {},
    h('h2', {}, 'Fotos'),
    h('p', { class: 'lead' }, n ? `${n} von ${MAX_PHOTOS} Fotos. Tippen Sie ein Foto an, um es zu vergrößern.` : 'Fotos sind freiwillig.'),
    photoButtons(null),
    n > 0 && photoGrid(current.photos.map((p, i) => ({ p, i }))));
}

function openLightbox(start) {
  let i = start;
  let url = null;
  const img = h('img', { alt: '' });
  const scroller = h('div', { class: 'lb-scroll', onclick: () => {
    scroller.classList.toggle('zoom');
    hint.textContent = scroller.classList.contains('zoom') ? 'Tippen zum Verkleinern' : 'Tippen zum Vergrößern';
  } }, img);
  const hint = h('p', { class: 'lb-hint' }, 'Tippen zum Vergrößern');
  const title = h('span', { class: 'lb-title' });
  const cap = h('input', { type: 'text', maxlength: 140, placeholder: 'Beschriftung (freiwillig)', autocomplete: 'off' });
  cap.addEventListener('input', () => { current.photos[i].caption = cap.value; scheduleSave(); });
  const prev = h('button', { class: 'btn ghost', onclick: () => show(i - 1) }, '‹');
  const next = h('button', { class: 'btn ghost', onclick: () => show(i + 1) }, '›');
  const del = h('button', { class: 'btn danger', onclick: async () => {
    const sure = await ask('Foto löschen?', '', [
      { label: 'Ja, löschen', value: true, kind: 'danger' }, { label: 'Nein', value: false, kind: 'primary' }]);
    if (!sure) return;
    const [p] = current.photos.splice(i, 1);
    await db.deleteBlob(current.id, p.slot);
    scheduleSave();
    if (!current.photos.length) close(); else show(Math.min(i, current.photos.length - 1));
  } }, 'Foto löschen');
  const close = () => { if (url) URL.revokeObjectURL(url); overlay.remove(); render(true); };
  const overlay = h('div', { class: 'lb' },
    h('div', { class: 'lb-top' }, title, h('button', { class: 'btn ghost', onclick: close }, '✕ Schließen')),
    scroller, hint,
    h('div', { class: 'lb-bottom' }, cap, h('div', { class: 'row3' }, prev, del, next)));
  async function show(k) {
    const n = current.photos.length;
    if (k < 0 || k >= n) return;
    i = k;
    scroller.classList.remove('zoom');
    hint.textContent = 'Tippen zum Vergrößern';
    title.textContent = `Foto ${i + 1} von ${n}`;
    cap.value = current.photos[i].caption || '';
    prev.disabled = i === 0;
    next.disabled = i === n - 1;
    const b = await db.getBlob(current.id, current.photos[i].slot);
    if (url) URL.revokeObjectURL(url);
    url = b ? URL.createObjectURL(b) : null;
    img.src = url || '';
  }
  document.body.append(overlay);
  show(i);
}

// ---------- Ergebnis, Anmerkungen ----------

function screenErgebnis() {
  const f = current.fields;
  const nd = defectNumbers(f).length;
  if (!f.pruefergebnis && nd === 0 && answeredCount(f) > 0) setField('pruefergebnis', 'keine');
  return h('div', {},
    h('h2', {}, 'Wie lautet das Ergebnis?'),
    h('p', { class: 'lead' }, nd ? `Sie haben ${nd} ${nd === 1 ? 'Mangel' : 'Mängel'} erfasst.` : 'Sie haben keinen Mangel erfasst.'),
    choiceGroup('pruefergebnis', ERGEBNIS.map(([k, t]) => [k, t])),
    h('p', { class: 'label' }, 'Ist eine Nachprüfung nötig?'),
    choiceGroup('nachpruefung', [['nein', 'Nein'], ['ja', 'Ja']], { cols: 2, onChange: () => render(true) }),
    f.nachpruefung === 'ja' && textField('nachpruefung_datum', 'Nachprüfung am', { type: 'date' }),
    textField('ergebnis_bemerkung', 'Begründung (freiwillig)', { area: true, rows: 3 }));
}

function screenAnmerkungen() {
  return h('div', {},
    h('h2', {}, 'Anmerkungen'),
    h('p', { class: 'lead' }, 'Alles hier ist freiwillig.'),
    textField('bemerkungen', 'Bemerkungen', { area: true, rows: 4 }),
    textField('empfehlungen', 'Empfehlungen / weitere Maßnahmen', { area: true, rows: 4 }),
    textField('naechster_prueftermin', 'Nächste Prüfung am', { type: 'date' }));
}

// ---------- Unterschrift ----------

function croppedPng(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: hgt } = canvas;
  const data = ctx.getImageData(0, 0, w, hgt).data;
  let x0 = w, y0 = hgt, x1 = -1, y1 = -1;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return Promise.resolve(null);
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hgt - 1, y1 + pad);
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
  c.getContext('2d').drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

function signaturePad(slot) {
  const id = current.id;
  const canvas = h('canvas', { class: 'sig' });
  const hint = h('span', { class: 'sig-hint' }, 'Hier mit dem Finger unterschreiben');
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null;
  hint.hidden = !!current.fields[`_has_${slot}`];

  const paint = async () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.width * 0.42 * dpr);
    canvas.style.height = `${r.width * 0.42}px`;
    ctx.lineWidth = 3 * dpr; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#14215a';
    const b = await db.getBlob(id, slot);
    if (!b) return;
    const bmp = await createImageBitmap(b);
    const s = Math.min((canvas.width * 0.9) / bmp.width, (canvas.height * 0.9) / bmp.height, 1.5);
    ctx.drawImage(bmp, (canvas.width - bmp.width * s) / 2, (canvas.height - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
  };
  new ResizeObserver(paint).observe(canvas);

  const pos = (e) => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); hint.hidden = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
    last = p;
  });
  const end = async () => {
    if (!drawing) return;
    drawing = false;
    const blob = await croppedPng(canvas);
    if (!blob) { hint.hidden = false; return; }
    await db.putBlob(id, slot, blob);
    setField(`_has_${slot}`, '1');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return h('div', { class: 'sigwrap' },
    h('div', { class: 'sigbox' }, canvas, hint),
    h('button', { class: 'btn ghost', onclick: async () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hint.hidden = false;
      await db.deleteBlob(id, slot);
      setField(`_has_${slot}`, '');
    } }, 'Neu schreiben'));
}

function screenUnterschrift() {
  const f = current.fields;
  if (!f.abschluss_name_0 && f.pruefer) setField('abschluss_name_0', f.pruefer);
  return h('div', {},
    h('h2', {}, 'Unterschrift'),
    textField('abschluss_name_0', 'Name des Prüfers'),
    h('p', { class: 'label' }, 'Bitte unterschreiben'),
    signaturePad('signature_0'),
    h('details', { class: 'more', open: !!f._has_signature_1 }, h('summary', {}, 'Unterschrift Betreiber (falls vor Ort)'),
      textField('abschluss_name_1', 'Name des Betreibers'),
      signaturePad('signature_1')));
}

// ---------- Abschluss und PDF ----------

function screenFertig() {
  const f = current.fields;
  const a = answeredCount(f);
  const nd = defectNumbers(f).length;
  const rows = [
    { ok: !!f.objekt, text: f.objekt ? `Objekt: ${f.objekt}` : 'Objekt fehlt', fix: () => go(0) },
    { ok: a === NQ, text: `${a} von ${NQ} Prüfpunkten beantwortet`, fix: () => go(STEP_PUNKTE, firstUnanswered()) },
    { ok: true, text: nd ? `${nd} ${nd === 1 ? 'Mangel' : 'Mängel'} erfasst` : 'Keine Mängel erfasst' },
    { ok: true, text: `${current.photos.length} ${current.photos.length === 1 ? 'Foto' : 'Fotos'}` },
    { ok: !!f.pruefergebnis, text: f.pruefergebnis ? 'Ergebnis ausgewählt' : 'Ergebnis fehlt', fix: () => go(5) },
    { ok: !!f._has_signature_0, text: f._has_signature_0 ? 'Unterschrift vorhanden' : 'Unterschrift fehlt', fix: () => go(7) },
  ];
  return h('div', {},
    h('h2', {}, 'Fast geschafft'),
    h('ul', { class: 'summary' }, rows.map((r) => h('li', { class: r.ok ? 'ok' : 'warn' },
      h('i', {}, r.ok ? '✓' : '!'), h('span', {}, r.text),
      !r.ok && r.fix && h('button', { class: 'btn small ghost', onclick: r.fix }, 'Ändern')))),
    current.exportedAt && h('p', { class: 'lead done' }, '✓ Das PDF wurde erstellt. Sie können es jederzeit erneut erstellen.'));
}

async function exportPdf(btn) {
  await flush();
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'PDF wird erstellt …';
  try {
    const fields = {};
    for (const [k, v] of Object.entries(current.fields)) if (!k.startsWith('_')) fields[k] = v;
    const blobs = {};
    for (const slot of [...current.photos.map((p) => p.slot), 'signature_0', 'signature_1']) {
      const b = await db.getBlob(current.id, slot);
      if (b) blobs[slot] = new Uint8Array(await b.arrayBuffer());
    }
    const bytes = await buildPdf({ fields, photos: current.photos }, blobs);
    const base = [fields.objekt, fields.standort, fields.treppen_nr, fields.pruefdatum].filter(Boolean).join('_')
      .replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/^_+|_+$/g, '');
    const name = `Pruefprotokoll_${base || 'neu'}.pdf`;
    const file = new File([bytes], name, { type: 'application/pdf' });
    current.exportedAt = Date.now();
    await db.putRecord(current);
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); render(true); return; }
      catch (e) { if (e.name === 'AbortError') { render(true); return; } }
    }
    const url = URL.createObjectURL(file);
    const link = h('a', { href: url, download: name, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('PDF wurde gespeichert.');
    render(true);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = label;
    toast('Das PDF konnte nicht erstellt werden.');
  }
}

// ---------- Start ----------

async function route() {
  clearTimeout(advanceTimer);
  await flush();
  current = null;
  const m = location.hash.match(/^#\/r\/(.+)$/);
  if (m) await openRecord(m[1]); else await renderList();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.hidden && flush());
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version bereit. Hier tippen zum Aktualisieren.', { sticky: true, onclick: () => location.reload() });
        }
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));
}
