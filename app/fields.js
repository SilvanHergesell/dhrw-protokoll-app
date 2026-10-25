// Inhalt des Protokolls. Wird von der Oberfläche (app.js) und vom PDF-Bau (export-pdf.js) genutzt.

export const CHECKPOINTS = [
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

export const GRUNDLAGEN = [
  'DIN 18065 - Gebäudetreppen',
  'DIN EN 1090 - Ausführung von Stahltragwerken',
  'Arbeitsstättenverordnung (ArbStättV)',
  'ASR A2.3 - Fluchtwege und Notausgänge',
  'einschlägige DGUV-Vorschriften und DGUV-Regeln',
  'objektspezifische Anforderungen',
  'Herstellerangaben und technische Dokumentationen',
  'bauordnungsrechtliche Vorgaben / genehmigte Planunterlagen',
];

export const TREPPENTYP = [['flucht', 'Fluchttreppe'], ['rettung', 'Rettungswegtreppe'], ['sicher', 'Sicherheitstreppe']];
export const BAUART = [['stahl', 'Stahl'], ['stahlbeton', 'Stahlbeton'], ['sonstige', 'Sonstige']];
export const STATUS = [['io', 'In Ordnung'], ['mangel', 'Mangel'], ['na', 'Trifft nicht zu']];
export const PRIO = [['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];

// [Wert, Kurztitel, Erläuterung im PDF]
export const ERGEBNIS = [
  ['keine', 'Keine Mängel festgestellt',
    'Die geprüfte Treppe weist im Rahmen der durchgeführten Sicht- und Funktionsprüfung keine erkennbaren Mängel auf.'],
  ['gering', 'Geringfügige Mängel festgestellt',
    'Die Nutzung ist nach fachlicher Bewertung weiterhin möglich. Eine zeitnahe Mängelbeseitigung ist erforderlich.'],
  ['erheblich', 'Erhebliche Mängel festgestellt',
    'Eine kurzfristige Mängelbeseitigung ist erforderlich. Die weitere Nutzung ist unter Berücksichtigung der konkreten Gefährdung zu bewerten.'],
  ['sicherheit', 'Sicherheitsrelevanter Mangel festgestellt',
    'Die Nutzung ist bis zur Beseitigung bzw. geeigneten Absicherung des Mangels einzuschränken oder die Treppe zu sperren.'],
  ['weiter', 'Weitergehende fachkundige Prüfung erforderlich',
    'Eine abschließende Beurteilung ist durch eine entsprechend qualifizierte Fachperson / einen Sachverständigen erforderlich.'],
];

export const TEXTE = {
  pruefhinweis: 'Die Prüfung ist objektbezogen durchzuführen. Anzuwendende Vorschriften, genehmigte Planunterlagen, Herstellerangaben und weitere technische Grundlagen sind vor Ort festzulegen und bei Bedarf zu dokumentieren.',
  grundlagenHinweis: 'Die tatsächliche Auswahl und Rangfolge der Prüfgrundlagen ist objektspezifisch festzulegen. Die Checkfelder dienen der Dokumentation und ersetzen keine rechtliche oder fachkundige Prüfung.',
  checklisteHinweis: 'Bei Mängeln bitte fortlaufend in Abschnitt 4 eintragen und ggf. Foto in Abschnitt 5 zuordnen.',
  bewertungsHinweis: 'Die Priorität ist unter Berücksichtigung der konkreten Gefährdung, der Nutzung der Treppe und der betrieblichen Rahmenbedingungen festzulegen. Bei sicherheitsrelevanten Mängeln ist eine geeignete Absicherung bzw. Sperrung zu bewerten.',
  dokuHinweis: 'Mit der Unterschrift wird die Durchführung und Dokumentation der Prüfung bestätigt. Technische oder rechtliche Schlussfolgerungen sind auf die im Prüfauftrag vorgesehenen Kompetenzen zu beschränken.',
};

export const MAX_PHOTOS = 12;

// Prüfpunkt-Nummern (1-24), die als "Mangel" markiert sind.
export const defectNumbers = (fields) =>
  CHECKPOINTS.map((_, i) => i + 1).filter((n) => fields[`pruefstatus_${n}`] === 'mangel');

export const answeredCount = (fields) =>
  CHECKPOINTS.reduce((n, _, i) => n + (fields[`pruefstatus_${i + 1}`] ? 1 : 0), 0);

// Fotos aus Version 1.0 (feste Plätze foto 1-6) in die neue Liste übernehmen.
export function migrate(rec) {
  if (rec.photos) return false;
  rec.photos = [];
  for (let n = 1; n <= 6; n++) {
    if (!rec.fields[`_has_photo_${n}`]) continue;
    const caption = [rec.fields[`foto_bereich_${n}`], rec.fields[`foto_bemerkung_${n}`]].filter(Boolean).join(' – ');
    rec.photos.push({ slot: `photo_${n}`, caption });
  }
  rec.pos ??= { step: 0, q: 0 };
  return true;
}
