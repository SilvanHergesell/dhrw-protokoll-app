// Form definition. Every `name` is the field name in template.pdf, so export
// is a direct lookup. Choice values are the PDF's on-state names.

const CHECKPOINTS = [
  'Treppenstufen vollständig und sicher begehbar',
  'Stufen ohne Beschädigungen oder Stolperstellen',
  'Treppenlauf standsicher, keine erkennbaren Verformungen',
  'Podeste sicher und frei von Schäden',
  'Handläufe fest und vollständig',
  'Geländer vollständig und standsicher',
  'Befestigungen und Verbindungselemente augenscheinlich intakt',
  'Schweißnähte ohne erkennbare Schäden',
  'Stahlbauteile ohne erhebliche Korrosion',
  'Treppe frei von Hindernissen und Gegenständen',
  'Flucht- und Rettungsweg jederzeit nutzbar',
  'Bodenbeläge / Gitterroste trittsicher',
  'Keine losen oder fehlenden Bauteile',
  'Beleuchtung ausreichend und funktionsfähig',
  'Sicherheits- und Fluchtwegkennzeichnung vorhanden',
  'Türen im Fluchtweg frei zugänglich und funktionsfähig',
  'Keine erkennbaren Gefährdungen durch Witterungseinflüsse',
  'Entwässerung / Wasserablauf funktionsfähig',
  'Auftritts- und Stufenkanten augenscheinlich ordnungsgemäß',
  'Geländerfüllungen / Absturzsicherung vollständig',
  'Korrosionsschutz / Beschichtung augenscheinlich intakt',
  'Anschlüsse an Baukörper augenscheinlich intakt',
  'Fluchtwegbreite augenscheinlich nicht eingeschränkt',
  'Zugang zur Treppe jederzeit möglich',
];

const GRUNDLAGEN = [
  'DIN 18065 - Gebäudetreppen',
  'DIN EN 1090 - Ausführung von Stahltragwerken',
  'Arbeitsstättenverordnung (ArbStättV)',
  'ASR A2.3 - Fluchtwege und Notausgänge',
  'einschlägige DGUV-Vorschriften und DGUV-Regeln',
  'objektspezifische Anforderungen',
  'Herstellerangaben und technische Dokumentationen',
  'bauordnungsrechtliche Vorgaben / genehmigte Planunterlagen',
];

const STATUS = [['io', 'i. O.'], ['mangel', 'Mangel'], ['na', 'n. a.']];
const PRIO = [['hoch', 'hoch'], ['mittel', 'mittel'], ['niedrig', 'niedrig']];

export const SECTIONS = [
  {
    title: '1 · Allgemeine Angaben',
    items: [
      { type: 'text', name: 'dokument_nr', label: 'Dokument-Nr.' },
      { type: 'text', name: 'revision', label: 'Revision' },
      { type: 'date', name: 'pruefdatum', label: 'Prüfdatum' },
      { type: 'text', name: 'pruefer', label: 'Prüfer' },
      { type: 'text', name: 'objekt', label: 'Objekt' },
      { type: 'text', name: 'gebaeude_bereich', label: 'Gebäude / Bereich' },
      { type: 'text', name: 'standort', label: 'Standort' },
      { type: 'text', name: 'treppen_nr', label: 'Treppen-Nr.' },
      { type: 'radio', name: 'treppentyp', label: 'Treppentyp',
        options: [['flucht', 'Fluchttreppe'], ['rettung', 'Rettungswegtreppe'], ['sicher', 'Sicherheitstreppe']] },
      { type: 'radio', name: 'bauart', label: 'Bauart',
        options: [['stahl', 'Stahl'], ['stahlbeton', 'Stahlbeton'], ['sonstige', 'Sonstige']] },
      { type: 'text', name: 'bauart_sonstige', label: 'Bauart sonstige' },
      { type: 'text', name: 'anwesende_personen', label: 'Anwesende Personen' },
      { type: 'textarea', name: 'grundlagen_zusatz', label: 'Prüfhinweis – Ergänzung' },
    ],
  },
  {
    title: '2 · Prüfgrundlagen',
    items: [
      ...GRUNDLAGEN.map((label, i) => ({ type: 'check', name: `grundlage_${i + 1}`, label })),
      { type: 'textarea', name: 'grundlagen_frei', label: 'Weitere Grundlagen / objektspezifische Festlegungen' },
    ],
  },
  {
    title: '3 · Sicht- und Funktionsprüfung',
    items: CHECKPOINTS.map((label, i) => ({
      type: 'checkpoint', nr: i + 1, label,
      status: `pruefstatus_${i + 1}`, remark: `bemerkung_${i + 1}`, options: STATUS,
    })),
  },
  {
    title: '4 · Festgestellte Mängel',
    items: [1, 2, 3, 4, 5].map((n) => ({
      type: 'group', label: `Mangel ${n}`, items: [
        { type: 'textarea', name: `mangel_${n}`, label: 'Feststellung / Mangel' },
        { type: 'radio', name: `prioritaet_${n}`, label: 'Priorität', options: PRIO },
        { type: 'textarea', name: `massnahme_${n}`, label: 'Erforderliche Maßnahme' },
        { type: 'text', name: `verantwortlich_${n}`, label: 'Verantwortlich' },
        { type: 'date', name: `termin_${n}`, label: 'Termin' },
      ],
    })),
  },
  {
    title: '5 · Fotodokumentation',
    items: [1, 2, 3, 4, 5, 6].map((n) => ({
      type: 'photo', slot: `photo_${n}`, label: `Foto ${n}`,
      items: [
        { type: 'text', name: `foto_bereich_${n}`, label: 'Bereich' },
        { type: 'text', name: `foto_bemerkung_${n}`, label: 'Bemerkung' },
      ],
    })),
  },
  {
    title: '6 · Ergebnis der Prüfung',
    items: [
      { type: 'radio', name: 'pruefergebnis', label: 'Ergebnis', vertical: true, options: [
        ['keine', 'Keine Mängel festgestellt'],
        ['gering', 'Geringfügige Mängel festgestellt'],
        ['erheblich', 'Erhebliche Mängel festgestellt'],
        ['sicherheit', 'Sicherheitsrelevanter Mangel festgestellt'],
        ['weiter', 'Weitergehende fachkundige Prüfung erforderlich'],
      ] },
      { type: 'textarea', name: 'ergebnis_bemerkung', label: 'Zusatzbewertung / Begründung' },
    ],
  },
  {
    title: '7–8 · Bemerkungen und Maßnahmen',
    items: [
      { type: 'textarea', name: 'bemerkungen', label: '7. Bemerkungen', rows: 5 },
      { type: 'textarea', name: 'empfehlungen', label: '8. Empfehlungen / weitere Maßnahmen', rows: 5 },
      { type: 'radio', name: 'nachpruefung', label: 'Erforderliche Nachprüfung',
        options: [['nein', 'nein'], ['ja', 'ja']] },
      { type: 'date', name: 'nachpruefung_datum', label: 'Nachprüfung am' },
    ],
  },
  {
    title: '9 · Abschluss',
    items: [
      { type: 'group', label: 'Prüfer', items: [
        { type: 'text', name: 'abschluss_name_0', label: 'Name' },
        { type: 'signature', slot: 'signature_0', label: 'Unterschrift' },
        { type: 'date', name: 'abschluss_datum_0', label: 'Datum' },
      ] },
      { type: 'group', label: 'Verantwortlicher Betreiber', items: [
        { type: 'text', name: 'abschluss_name_1', label: 'Name' },
        { type: 'signature', slot: 'signature_1', label: 'Unterschrift' },
        { type: 'date', name: 'abschluss_datum_1', label: 'Datum' },
      ] },
      { type: 'date', name: 'naechster_prueftermin', label: 'Nächster Prüftermin' },
    ],
  },
];

export const DATE_FIELDS = new Set();
(function collect(items) {
  for (const it of items) {
    if (it.type === 'date') DATE_FIELDS.add(it.name);
    if (it.items) collect(it.items);
  }
})(SECTIONS);
