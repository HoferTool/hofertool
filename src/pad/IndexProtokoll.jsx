// =================================================================
//  WERKZEUGWECHSEL-PROTOKOLL FÜR INDEX
//  Beim Index ist das Blatt, das „Als PDF ablegen“ in der Historie macht,
//  wie das Excel „Werkzeugwechselprotokoll“ (Wunsch Patrick 29. Oktober
//  2026): je Revolver die Plätze T1 bis T10, aber nur die, auf denen laut
//  Einrichtblatt ein Werkzeug steht; daneben sechs Spalten „Dat. /
//  Stückz.“ je Blatt, eine je Wechsel. Das Protokoll gehört zur HOCO Nr.
//  auf dem Typ: kommt ein neuer FA desselben Teils, geht es weiter, eine
//  rote Spaltenlinie mit „Neuer FA …“ darüber trennt die Aufträge.
//  Behalten werden nur die letzten drei Blätter, Älteres löscht die App
//  (Patrick: „rest wird nicht mehr gebraucht“).
//
//  Eingetragen wird wie bei allen Typen über die Platzwahl (Werkzeugwechsel.jsx)
//  in tool_changes, Path = „Revolver N“ in bezeichnung.
// =================================================================
import { alt } from "../bruecke.jsx";
import { blattSuchen, platzInGebrauch } from "../einrichtblatt/daten.js";
import { REVOLVER } from "../einrichtblatt/vorlagen.js";

export const SPALTEN_JE_BLATT = 6;
export const BLAETTER_BEHALTEN = 3;
const PLAETZE = Array.from({ length: 10 }, (_, i) => "T" + (i + 1));

export const istIndex = (typ) => /^\s*index/i.test((typ && typ.name) || "");

const revolverVon = (bez) => { const m = /revolver\s*(\d)/i.exec(bez || ""); return m ? m[1] : null; };
const datum = (iso) => new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });

// Alle Wechsel dieser HOCO Nr. auf Maschinen dieses Typs, älteste zuerst,
// als Runden (alle Zeilen eines Eintrags teilen Zeitpunkt und Stückzahl)
async function protokollLaden(hoco, typId) {
  const m = await alt.db.from("machines").select("id, name").eq("type_id", typId);
  if (m.error) throw m.error;
  const maschinen = m.data || [];
  if (!maschinen.length) return [];
  const r = await alt.zeitlimit(alt.db.from("werkzeugwechsel").select("*").eq("hoco_nr", hoco)
    .in("machine_id", maschinen.map((x) => x.id)).order("gewechselt_am", { ascending: true }).limit(1000),
    12000, "Werkzeugwechsel");
  if (r.error) throw r.error;
  const liste = r.data || [];

  // Die FA Nr. steht am Auftrag, nicht im Wechsel
  const jobIds = Array.from(new Set(liste.map((z) => z.job_id).filter(Boolean)));
  const fa = {};
  if (jobIds.length) {
    try {
      const j = await alt.db.from("jobs").select("id, fa_nr").in("id", jobIds);
      (j.data || []).forEach((x) => { fa[x.id] = x.fa_nr || ""; });
    } catch (f) { /* dann ohne FA Nr. */ }
  }
  const runden = [];
  liste.forEach((z) => {
    const schluessel = z.gewechselt_am + "|" + (z.stueckzahl === null ? "" : z.stueckzahl) + "|" + (z.job_id || "");
    let rd = runden.find((x) => x.schluessel === schluessel);
    if (!rd) {
      rd = { schluessel, wann: z.gewechselt_am, stk: z.stueckzahl, job: z.job_id || null,
        fa: z.job_id ? fa[z.job_id] || "" : "", maschine: z.maschine, person: z.person, zeilen: [] };
      runden.push(rd);
    }
    rd.zeilen.push(z);
  });
  return runden;
}

// Mehr als drei Blätter: die ältesten ganzen Blätter weg, so bleiben die
// übrigen Blätter genau, wie sie waren
async function altesLoeschen(runden) {
  const blaetter = Math.ceil(runden.length / SPALTEN_JE_BLATT);
  if (blaetter <= BLAETTER_BEHALTEN) return runden;
  const weg = runden.slice(0, (blaetter - BLAETTER_BEHALTEN) * SPALTEN_JE_BLATT);
  const ids = weg.flatMap((r) => r.zeilen.map((z) => z.id)).filter(Boolean);
  try {
    const r = await alt.db.from("tool_changes").delete().in("id", ids).select("id");
    if (r.error) throw r.error;
    // Ohne Recht löscht die Datenbank still nichts, dann bleibt es eben
    if (r.data && r.data.length === 0) return runden;
  } catch (f) { alt.fehlerMerken && alt.fehlerMerken("Werkzeugwechsel aufräumen", alt.fehlertext(f)); return runden; }
  return runden.slice(weg.length);
}

// Die Reihen: je Revolver die Plätze mit Werkzeug im Einrichtblatt, dazu
// alles, was schon gewechselt wurde. Ohne Blatt alle T1 bis T10.
function reihenBilden(blatt, runden, alle) {
  const plaetze = (blatt && blatt.plaetze) || {};
  const mitBlatt = Object.keys(plaetze).some((k) => /^R\d-T\d+$/.test(k) && platzInGebrauch(plaetze[k]));
  const gewechselt = new Set(runden.flatMap((r) => r.zeilen.map((z) => (revolverVon(z.bezeichnung) || "?") + "|" + z.tool_nr)));
  return REVOLVER.map(([nr, farbe]) => {
    const namen = PLAETZE.slice();
    // Ein Platz, den es nur in der Historie gibt (etwa T11), kommt hinten dazu
    gewechselt.forEach((k) => { const [r, t] = k.split("|"); if (r === nr && !namen.includes(t)) namen.push(t); });
    const reihe = namen.filter((t) => alle || !mitBlatt || platzInGebrauch(plaetze["R" + nr + "-" + t]) || gewechselt.has(nr + "|" + t))
      .map((t) => ({ id: "R" + nr + "-" + t, tool_nr: t, eb: plaetze["R" + nr + "-" + t] || null }));
    return { nr, name: "Revolver " + nr, farbe, plaetze: reihe };
  }).filter((r) => r.plaetze.length);
}

// Nach jedem Wechsel an einem Index: mehr als drei Blätter dieser HOCO Nr.,
// dann die ältesten weg
export async function indexAufraeumen(maschine, auftrag) {
  if (!auftrag || !auftrag.job_number) return;
  try {
    const typ = (await alt.ladeTypen()).find((t) => t.id === maschine.type_id);
    if (!istIndex(typ)) return;
    await altesLoeschen(await protokollLaden(auftrag.job_number, typ.id));
  } catch (f) { /* dann beim nächsten Mal */ }
}

// Das PDF der Historie beim Index ist dieses Protokoll statt des Blatts
// „Plattenwechsel“ (Patrick 29. Oktober 2026: „hätte anstelle von der
// aktuellen PDF-Version kommen sollen, Historie behalten“). Gibt null
// zurück, wenn es kein Index ist oder kein Auftrag dahintersteht.
export async function indexPdfAufbau(maschine, auftrag) {
  if (!auftrag || !auftrag.job_number) return null;
  const typ = (await alt.ladeTypen()).find((t) => t.id === maschine.type_id);
  if (!istIndex(typ)) return null;
  const [runden, blatt] = await Promise.all([protokollLaden(auftrag.job_number, typ.id),
    blattSuchen(auftrag.job_number, typ.id).catch(() => null)]);
  return { html: (titel) => protokollHtml(maschine, auftrag, blatt, runden, titel) };
}

function protokollHtml(maschine, auftrag, blatt, runden, titel) {
  const esc = alt.esc;
  const reihen = reihenBilden(blatt, runden, false);
  const blaetter = [];
  for (let i = 0; i < Math.max(1, runden.length); i += SPALTEN_JE_BLATT) blaetter.push(runden.slice(i, i + SPALTEN_JE_BLATT));
  const neuerFa = (c) => { const i = runden.indexOf(c); return i > 0 && (runden[i - 1].job || "") !== (c.job || ""); };
  const faText = (c) => (c.fa ? "FA " + c.fa : "anderer Auftrag");
  const gewechselt = (c, r, p) => c.zeilen.some((z) => z.tool_nr === p.tool_nr && (revolverVon(z.bezeichnung) === r.nr || !z.bezeichnung));
  const kl = (c) => "sp" + (c && neuerFa(c) ? " fa" : "");

  const seite = (spalten, nr) => {
    const sp = spalten.slice();
    while (sp.length < SPALTEN_JE_BLATT) sp.push(null);
    return '<div class="seite">'
      + '<div class="kopf"><div>Werkstück: <b>' + esc(auftrag.job_number) + '</b></div>'
      + '<h1>Werkzeugwechselprotokoll</h1>'
      + '<div class="rechts">' + esc((maschine.name || "Index C100") + (maschine.machine_number ? " · " + maschine.machine_number : ""))
      + '<div class="logo" role="img" aria-label="Hofer + Co."></div></div></div>'
      + '<table><colgroup><col class="nr"><col class="wz">' + sp.map(() => '<col class="sp">').join("") + '</colgroup>'
      + '<thead><tr class="falabel"><th colspan="2"></th>' + sp.map((c, i) => '<th class="' + kl(c) + '">'
        + (c ? (neuerFa(c) ? '<span class="neu">Neuer ' + esc(faText(c)) + '</span>' : (i === 0 ? '<span class="still">' + esc(faText(c)) + '</span>' : "")) : "")
        + '</th>').join("") + '</tr>'
      + '<tr><th class="nr">T-Nr</th><th class="wz">Werkzeug</th>' + sp.map((c) => '<th class="' + kl(c) + '">Dat. / Stückz.</th>').join("") + '</tr></thead><tbody>'
      + reihen.map((r) => '<tr class="rev"><th colspan="' + (2 + SPALTEN_JE_BLATT) + '" style="background:' + r.farbe + '">' + esc(r.name) + '</th></tr>'
        + r.plaetze.map((p) => '<tr><td class="nr">' + esc(p.tool_nr) + '</td><td class="wz">'
          + (p.eb ? '<b>' + esc(p.eb.taetigkeit || p.eb.werkzeug || "") + '</b>' + (p.eb.hersteller ? ' <small>' + esc(p.eb.hersteller) + '</small>' : "") : "")
          + '</td>' + sp.map((c) => '<td class="' + kl(c) + '">' + (c && gewechselt(c, r, p)
            ? esc(datum(c.wann)) + '<br><b>' + (c.stk === null || c.stk === undefined ? "—" : esc(alt.zahlText(c.stk))) + '</b>' : "") + '</td>').join("")
          + '</tr>').join("")).join("")
      + '</tbody></table>'
      + '<div class="fuss"><span>Blatt ' + nr + ' von ' + blaetter.length + ' · behalten werden die letzten ' + BLAETTER_BEHALTEN + ' Blätter</span>'
      + '<span>Erstellt ' + esc(alt.datumZeitKurz(new Date().toISOString())) + '</span></div></div>';
  };

  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + esc(titel) + '</title><style>'
    + '@page { size: A4 landscape; margin: 9mm 9mm }'
    + '* { box-sizing: border-box } body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0;'
    + ' -webkit-print-color-adjust: exact; print-color-adjust: exact }'
    + '.seite { max-width: 279mm; margin: 0 auto; padding: 60px 0 10mm; break-after: page }'
    + '.seite:last-child { break-after: auto }'
    + '@media print { .seite { padding: 0; max-width: none } }'
    + '.kopf { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; margin-bottom: 3mm; font-size: 12pt }'
    + '.kopf b { font-size: 15pt } h1 { font-size: 20pt; font-weight: 400; margin: 0 }'
    + '.rechts { display: flex; align-items: flex-end; gap: 5mm }'
    + '.logo { width: 40mm; aspect-ratio: 643 / 240; background: #2f6db5;'
    + ' -webkit-mask: url(' + alt.LOGO_WEISS + ') center / contain no-repeat; mask: url(' + alt.LOGO_WEISS + ') center / contain no-repeat }'
    + 'table { width: 100%; border-collapse: collapse; table-layout: fixed }'
    + 'th, td { border: .6pt solid #000; padding: 1mm 1.5mm; font-size: 10pt }'
    + 'col.nr { width: 14mm } col.wz { width: 62mm }'
    + 'thead th { font-size: 9pt; text-align: center } td.nr { text-align: center; font-weight: 700 }'
    + 'td.wz { overflow: hidden; white-space: nowrap; text-overflow: ellipsis } td.wz small { color: #444 }'
    + 'td.sp { text-align: center; height: 10mm; font-size: 9pt; line-height: 1.2 } td.sp b { font-size: 10.5pt }'
    + 'tr.falabel th { border: 0; text-align: left; padding: 0 1mm 1mm; font-size: 9pt; vertical-align: bottom }'
    + 'tr.falabel .neu { color: #d62828; font-weight: 700; white-space: nowrap } tr.falabel .still { color: #555; font-weight: 400 }'
    + '.fa { border-left: 2.4pt solid #d62828 !important }'
    + 'tr.rev th { text-align: left; padding: .8mm 2mm; font-size: 10pt }'
    + 'tr { break-inside: avoid }'
    + '.fuss { margin-top: 2mm; display: flex; justify-content: space-between; color: #555; font-size: 7.5pt }'
    + '.leiste { position: fixed; top: 10px; right: 12px; display: flex; gap: 6px }'
    + '.leiste button { font: inherit; font-size: 10pt; padding: 8px 16px; border: 1px solid #2f6db5;'
    + ' background: #2f6db5; color: #fff; border-radius: 6px; cursor: pointer }'
    + '.leiste button + button { background: #fff; color: #2f6db5 } @media print { .leiste { display: none } }'
    + '</style></head><body><div class="leiste"><button onclick="window.print()">Drucken / PDF</button>'
    + '<button onclick="window.close()">Schliessen</button></div>'
    + blaetter.map((b, i) => seite(b, i + 1)).join("") + '</body></html>';
}
