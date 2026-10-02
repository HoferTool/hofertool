// Ein Nachbau von Supabase, nur für den Prüfstand. Hält die Daten im
// Speicher und versteht genau die Aufrufe, die die App benutzt.
export const TEST = {};

function heute() { return new Date(); }
function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
    + "-" + String(d.getDate()).padStart(2, "0");
}
function arbeitstagPlus(startIso, n) {
  const d = new Date(startIso + "T12:00:00");
  let i = 0;
  while (i < n) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) i++;
  }
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return iso(d);
}

const montag = (() => {
  const d = heute();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
})();

const P1 = "p-lang", P2 = "p-kurz";
const M = [];
for (let i = 1; i <= 7; i++) {
  M.push({ id: "m-l" + i, park_id: P1, name: "Star SR" + (30 + i),
           machine_number: "L-" + (1000 + i), sort_order: i, is_active: true,
           type_id: "t1" });
}
for (let i = 1; i <= 6; i++) {
  M.push({ id: "m-k" + i, park_id: P2, name: "Tornos M" + i,
           machine_number: "K-" + (2000 + i), sort_order: i, is_active: true,
           type_id: "t2" });
}

const FARBEN = ["blau", "gruen", "rot", "orange", "gelb", "violett", "tuerkis", "grau", "weiss", "rosa"];
const ZUSTAENDE = ["geplant", "ruesten", "laeuft", "fertig"];

const JOBS = [];
let nr = 0;
M.forEach((m, mi) => {
  let start = arbeitstagPlus(montag, mi % 3);          // versetzte Startpunkte
  for (let k = 0; k < 3; k++) {
    nr++;
    const dauer = 2 + ((mi + k) % 4);
    JOBS.push({
      id: "j" + nr,
      job_number: (10000 + mi) + "-" + String(300 + nr).padStart(4, "0"),
      machine_id: m.id, maschine: m.name, maschine_nr: m.machine_number,
      park_id: m.park_id, park: mi < 7 ? "Langdreher" : "Kurzdreher",
      maschine_reihenfolge: m.sort_order,
      planned_from: start, planned_days: dauer, planned_to: null,
      plan_note: k === 0 ? "Zeichnung beachten, Fase 0.3" : null,
      drawing_url: k === 0 ? "data:application/pdf;base64,JVBERi0xLjQK" : null,
      wbg_url: k === 1 ? "data:application/pdf;base64,JVBERi0xLjQK" : null,
      target_quantity: k === 1 ? 1200 : (k === 2 ? 450 : null),
      stand: k === 1 ? 540 : 0,
      color: FARBEN[(mi + k) % FARBEN.length],
      plan_status: ZUSTAENDE[(mi + k) % 4],
      problem: (mi === 2 && k === 0) ? "Material fehlt" : null,
      problem_at: null, problem_by: null, problem_von: null,
      fa_erstellt: k !== 0, material_ok: k !== 1,
      material_dm: 12 + k * 4, material_toleranz: "h9",
      created_at: new Date(Date.now() - nr * 60000).toISOString(),
      material_bez: ["CW614N", "1.4404", "CuSn8"][k % 3],
      material_menge: (40 + k * 10) + " kg",
      material_bez: "X10CrNiS18-9 rd 011 mm h8",
      material_liefertermin: null,
      geplant_von: "S.H",
      fa_nr: "2026-" + String(300 + nr).padStart(4, "0"),
      started_at: null, ended_at: null, laeuft: true,
    });
    start = arbeitstagPlus(start, dauer);             // lückenlos hintereinander
  }
});

const daten = {
  machine_parks: [
    { id: P1, name: "Langdreher", is_active: true },
    { id: P2, name: "Kurzdreher", is_active: true },
  ],
  machines: M,
  planwand: JOBS,
  jobs: JOBS,
  vacations: [
    { id: "f1", person: "Ramona", zeile: 1, von: arbeitstagPlus(montag, 2), tage: 5,
      note: null, genehmigt: true, genehmigt_von: null, genehmigt_am: null, profiles: null },
    { id: "f2", person: "Tristan", zeile: 2, von: arbeitstagPlus(montag, 6), tage: 3,
      note: null, genehmigt: false, genehmigt_von: null, genehmigt_am: null, profiles: null },
  ],
  profiles: [
    { id: "u1", email: "saheesan.hudson@hoferco.ch", full_name: "saheesan.hudson",
      role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: true, ist_planer: true, initialen: "S.H",
      ohne_passwort: false, einstellungen: {} },
    { id: "u2", email: "ramona.jordi@hoferco.ch", full_name: "ramona.jordi",
      role: "langdreher", is_active: true, geburtstag: null, bild_url: null,
      parks: [], darf_bearbeiten: false, ist_planer: false, initialen: "R.J",
      ohne_passwort: false, einstellungen: {} },
    { id: "u3", email: "tristan.ecker@hoferco.ch", full_name: "tristan.ecker",
      role: "kurzdreher", is_active: true, geburtstag: null, bild_url: null,
      parks: [], darf_bearbeiten: false, ist_planer: false, initialen: "T.E",
      ohne_passwort: false, einstellungen: {} },
  ],
  farb_material: FARBEN.map((f, i) => ({
    farbe: f, material: ["Stahl", "Alu", "Messing", "Titan"][i % 4],
    buchstabe: ["S", "A", "M", "T"][i % 4], sortierung: i })),
  app_config: [{ schluessel: "planwand_pin", wert: "0000" }],
  machine_types: [
    { id: "t1", name: "Star SR-32J", beschreibung: "Langdreher", is_active: true,
      blatt_url: null },
    { id: "t2", name: "Tornos Swiss GT 26", beschreibung: null, is_active: true,
      blatt_url: null },
  ],
  tool_kinds: [
    { id: "k1", name: "Drehstahl", sortierung: 1, is_active: true },
    { id: "k2", name: "Angetriebenes Querwerkzeug", sortierung: 2, is_active: true },
    { id: "k3", name: "Front Bohr-/Ausdrehwerkzeug", sortierung: 3, is_active: true },
    { id: "k4", name: "Angetriebenes Frontwerkzeug", sortierung: 4, is_active: true },
  ],
  type_paths: [
    { id: "pa1", type_id: "t1", name: "Path 1", nummer: 1, sortierung: 1, nr_mit_path: false },
    { id: "pa2", type_id: "t1", name: "Path 3", nummer: 3, sortierung: 2, nr_mit_path: true },
  ],
  type_slots: [
    { id: "sl1", path_id: "pa1", bezeichnung: "Drehstahlhalter", kind_id: "k1",
      platz_nr: 1, tool_nr: "T100", werkzeuge: 1, hinweis: null, sortierung: 1 },
    { id: "sl2", path_id: "pa1", bezeichnung: "Front Bohrhalter", kind_id: "k3",
      platz_nr: 2, tool_nr: "T200", werkzeuge: 3, hinweis: "nimmt drei Werkzeuge", sortierung: 2 },
    { id: "sl3", path_id: "pa2", bezeichnung: "Querbohrhalter", kind_id: "k2",
      platz_nr: 1, tool_nr: "T3100", werkzeuge: 2, hinweis: null, sortierung: 1 },
  ],
  slot_tools: [
    { id: "w1", slot_id: "sl1", unter_nr: 0, tool_nr: null,
      article_id: "a1", frei_text: null, hinweis: null, sortierung: 1 },
    { id: "w2", slot_id: "sl2", unter_nr: 0, tool_nr: null,
      article_id: null, frei_text: "Bohrer 4.2 HSS", hinweis: null, sortierung: 1 },
    { id: "w3", slot_id: "sl2", unter_nr: 1, tool_nr: null,
      article_id: null, frei_text: "Ausdrehstahl 6 mm", hinweis: null, sortierung: 2 },
  ],
  hoco_parts: [
    { hoco_nr: "10000-0301", bezeichnung: "Deckel Ø20 x 7.2 trov.",
      material: "CW400J", material_groesse: "Ø20h9", waschgebinde: "Typ 5 gross",
      zeichnungs_nr: "416.4638.01", fabrik_auftrag: null, infos: null,
      zeichnung_url: "data:application/pdf;base64,JVBERi0xLjQK" },
  ],
  wash_containers: [
    { id: "g1", name: "Typ 5 gross", sortierung: 1 },
    { id: "g2", name: "Typ 5 klein", sortierung: 2 },
  ],
  tool_changes: [],
  hoco_type_data: [{ hoco_nr: "10000-0303", type_id: "t1",
    pad_info: "Kühlmittel prüfen, Zange nach 20'000 Stk", abend_stk: 150 }], setup_sheets: [], setup_sheet_slots: [],
  werkzeugwechsel: [],
  einrichtblaetter: [],
  todos: [], shopping_items: [],
  suppliers: [
    { id: "s1", name: "Vischer & Bolli AG", website: "https://vb.ch",
      email: "v@vb.ch", adresse: "Kanalstrasse 17", bestellweg: "mail" },
    { id: "s2", name: "Brütsch Rüegger", website: null,
      email: "b@br.ch", adresse: "Heinrich-Stutz-Str. 20", bestellweg: "mail" },
  ],
  articles: [
    { id: "a1", article_number: "MTEC-452410", name: "Wendeplatte", unit: "Stück",
      description: null, supplier_id: "s1", is_active: true },
  ],
  order_items: [
    { id: "o1", article_id: "a1", supplier_id: "s1", quantity: 50,
      status: "offen", needed_by: null, note: null,
      created_by: "u1", created_at: "2026-09-10T08:00:00Z" },
  ],
  production_records: (() => {
    const raus = [
      { id: "pr1", machine_id: "m-k1", record_date: montag, quantity: 340, job_id: "j1" },
      { id: "pr2", machine_id: "m-k1", record_date: arbeitstagPlus(montag, 1),
        quantity: 620, job_id: "j1" },
    ];
    // Zählerstände an einer Langdreher-Maschine über ein halbes Jahr,
    // an Werktagen, mit leicht schwankender Tagesleistung
    let stand = 0, n = 0;
    for (let k = 180; k >= 0; k--) {
      const d = new Date(Date.now() - k * 86400000);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      stand += 900 + ((k * 37) % 400) + (k < 60 ? 300 : 0);
      raus.push({ id: "prl" + (n++), machine_id: "m-l1", job_id: "j-l1",
        record_date: iso(d), quantity: stand,
        updated_at: iso(d) + "T17:" + String(10 + (k % 40)).padStart(2, "0") + ":00Z" });
    }
    return raus;
  })(), designations: [], game_scores: [],
  eier_zaehler: [{ id: true, wert: 12 }], eier_historie: [],
  fahrzeuge: [], fahrzeug_buchungen: [], fahrzeug_probleme: [],
  chat_gespraeche: [], chat_nachrichten: [], chat_teilnehmer: [], chat_gelesen: [],
  storage_locations: [], stock_balances: [], stock_movements: [],
};

// Zwei geplante Aufträge mit derselben FA Nr., einer davon mit WBG
JOBS.push({
  id: "jfa1", job_number: "10000-0301", fa_nr: "2026-9999",
  machine_id: "m-l1", maschine: "Star SR31", maschine_nr: "L-1001",
  park_id: P1, park: "Langdreher", maschine_reihenfolge: 1,
  planned_from: arbeitstagPlus(montag, 60), planned_days: 2, plan_status: "geplant",
  drawing_url: null, wbg_url: "data:application/pdf;base64,JVBERi0xLjQK",
  stand: 0, color: "blau", ended_at: null, created_at: new Date().toISOString(),
});
JOBS.push({
  id: "jfa2", job_number: "10000-0301", fa_nr: "2026-9998",
  machine_id: "m-l2", maschine: "Star SR32", maschine_nr: "L-1002",
  park_id: P1, park: "Langdreher", maschine_reihenfolge: 2,
  planned_from: arbeitstagPlus(montag, 60), planned_days: 2, plan_status: "geplant",
  drawing_url: null, wbg_url: null,
  stand: 0, color: "blau", ended_at: null, created_at: new Date().toISOString(),
});

JOBS.push({
  id: "jleer", job_number: "10000-0301", fa_nr: null,
  machine_id: "m-l3", maschine: "Star SR33", maschine_nr: "L-1003",
  park_id: P1, park: "Langdreher", maschine_reihenfolge: 3,
  planned_from: arbeitstagPlus(montag, 70), planned_days: 2, plan_status: "geplant",
  drawing_url: null, wbg_url: null,
  material_dm: null, material_toleranz: null, material_menge: null,
  stand: 0, color: "blau", ended_at: null, created_at: new Date().toISOString(),
});

JOBS.push({
  id: "jfertig", job_number: "10000-0301", fa_nr: "2026-7777",
  machine_id: "m-l4", maschine: "Star SR34", maschine_nr: "L-1004",
  park_id: P1, park: "Langdreher", maschine_reihenfolge: 4,
  planned_from: arbeitstagPlus(montag, 80), planned_days: 2,
  plan_status: "fertig", ended_at: new Date().toISOString(),
  drawing_url: null, wbg_url: null, material_bez: "ALT-MATERIAL",
  stand: 0, color: "grau", created_at: new Date().toISOString(),
});

// Ein Tag Solarwerte, für die Anzeige auf der Startseite
daten.solar_werte = (() => {
  const raus = [], jetzt = Date.now();
  for (let i = 96; i >= 0; i--) {
    const t = new Date(jetzt - i * 15 * 60000);
    const std = t.getHours() + t.getMinutes() / 60;
    const sonne = Math.max(0, Math.sin(((std - 6) / 13) * Math.PI));
    const prod = Math.round(sonne * 42000);
    const verb = std > 6.5 && std < 17 ? 16000 + Math.round(sonne * 6000) : 5200;
    raus.push({
      id: 1000 + i, gemessen: t.toISOString(),
      produktion_w: prod, verbrauch_w: verb, netz_w: verb - prod,
      batterie_w: 0, ertrag_tag_kwh: 186.4,
      bezug_tag_kwh: 42.1, eingespeist_tag_kwh: 61.8, quelle: "Pruefstand",
    });
  }
  return raus;
})();

daten.login_kacheln = [];
TEST.rpc = {};
TEST.funktionen = {};
TEST.daten = daten;
if (typeof window !== "undefined") window.TEST = TEST;
TEST.protokoll = [];

function passt(zeile, f) {
  const w = zeile[f.feld];
  switch (f.art) {
    case "eq":  return String(w) === String(f.wert);
    case "neq": return String(w) !== String(f.wert);
    case "is":  return f.wert === null ? (w === null || w === undefined) : w === f.wert;
    case "gt":  return w > f.wert;
    case "gte": return w >= f.wert;
    case "lt":  return w < f.wert;
    case "lte": return w <= f.wert;
    case "in":  return (f.wert || []).map(String).indexOf(String(w)) !== -1;
    case "like": return String(w || "").toLowerCase()
      .includes(String(f.wert).replace(/%/g, "").toLowerCase());
    default: return true;
  }
}

function bauer(tabelle) {
  const zustand = { filter: [], sort: [], grenze: null, einzeln: false,
                    art: "select", nutzlast: null };

  const b = {
    select() { if (zustand.art === "select") zustand.art = "select"; return b; },
    insert(zeilen) {
      zustand.art = "insert";
      zustand.nutzlast = Array.isArray(zeilen) ? zeilen : [zeilen];
      return b;
    },
    update(werte) { zustand.art = "update"; zustand.nutzlast = werte; return b; },
    upsert(zeilen, o) { zustand.art = "insert"; zustand.upsert = o || {};
      zustand.nutzlast = Array.isArray(zeilen) ? zeilen : [zeilen]; return b; },
    delete() { zustand.art = "delete"; return b; },
    eq(feld, wert)  { zustand.filter.push({ feld, wert, art: "eq" }); return b; },
    neq(feld, wert) { zustand.filter.push({ feld, wert, art: "neq" }); return b; },
    is(feld, wert)  { zustand.filter.push({ feld, wert, art: "is" }); return b; },
    gt(feld, wert)  { zustand.filter.push({ feld, wert, art: "gt" }); return b; },
    gte(feld, wert) { zustand.filter.push({ feld, wert, art: "gte" }); return b; },
    lt(feld, wert)  { zustand.filter.push({ feld, wert, art: "lt" }); return b; },
    lte(feld, wert) { zustand.filter.push({ feld, wert, art: "lte" }); return b; },
    in(feld, wert)  { zustand.filter.push({ feld, wert, art: "in" }); return b; },
    ilike(feld, wert) { zustand.filter.push({ feld, wert, art: "like" }); return b; },
    like(feld, wert)  { zustand.filter.push({ feld, wert, art: "like" }); return b; },
    or() { return b; },
    not() { return b; },
    order(feld, o) { zustand.sort.push({ feld, ab: !!(o && o.ascending === false) }); return b; },
    limit(n) { zustand.grenze = n; return b; },
    // Wie bei Supabase: range(von, bis) liefert den Ausschnitt, und
    // ohne range höchstens 1000 Zeilen — genau die Grenze, an der die
    // Planwand mit den infoBoard-Daten hängen blieb.
    range(von, bis) { zustand.von = von; zustand.bis = bis; return b; },
    single() { zustand.einzeln = true; return b; },
    maybeSingle() { zustand.einzeln = true; return b; },
    then(erfolg, fehler) { return lauf().then(erfolg, fehler); },
    catch(f) { return lauf().catch(f); },
    finally(f) { return lauf().finally(f); },
  };

  function lauf() {
    return new Promise((fertig) => {
      setTimeout(() => {
        const tab = daten[tabelle] || (daten[tabelle] = []);
        TEST.protokoll.push({ tabelle, art: zustand.art });

        if (zustand.art === "insert") {
          let last = zustand.nutzlast;
          if (zustand.upsert && zustand.upsert.onConflict) {
            // Mehrere Schlüsselfelder wie in der echten Datenbank.
            // Vorhandene Zeilen werden überschrieben, nicht verworfen.
            const felder = zustand.upsert.onConflict.split(",").map((f) => f.trim());
            last = last.filter((z) => {
              const alt = tab.find((x) => felder.every((f) => x[f] === z[f]));
              if (alt) { Object.assign(alt, z); return false; }
              return true;
            });
          }
          const neu = last.map((z) => Object.assign(
            { id: "neu-" + Math.random().toString(36).slice(2, 8) }, z));
          // Der Planwand-Blick zeigt dieselben Datensätze wie jobs
          neu.forEach((z) => {
            const m = daten.machines.find((x) => x.id === z.machine_id);
            if (m) { z.maschine = m.name; z.maschine_nr = m.machine_number;
                     z.park_id = m.park_id; z.maschine_reihenfolge = m.sort_order;
                     z.park = m.park_id === P1 ? "Langdreher" : "Kurzdreher"; }
            z.stand = z.stand || 0;
            tab.push(z);
            if (tabelle === "jobs" && daten.planwand !== tab) daten.planwand.push(z);
          });
          fertig({ data: zustand.einzeln ? (neu[0] || null) : neu, error: null });
          return;
        }

        let treffer = tab.filter((z) => zustand.filter.every((f) => passt(z, f)));

        // Wie in der echten Datenbank: setup_sheet_slots kennt keine
        // Spalte "bezeichnung". So lässt sich prüfen, ob die App
        // unbekannte Spalten sauber weglässt.
        // Wie in der echten Datenbank: tool_changes kennt kein gehalten_stk
        if (zustand.art === "insert" && tabelle === "tool_changes") {
          const hat = (Array.isArray(zustand.nutzlast) ? zustand.nutzlast : [zustand.nutzlast])
            .some((z) => z && Object.prototype.hasOwnProperty.call(z, "gehalten_stk"));
          if (hat) {
            fertig({ data: null, error: { code: "PGRST204",
              message: "Could not find the 'gehalten_stk' column of "
                + "'tool_changes' in the schema cache" } });
            return;
          }
        }
        if (zustand.art === "insert" && tabelle === "setup_sheet_slots") {
          const hat = (Array.isArray(zustand.nutzlast) ? zustand.nutzlast : [zustand.nutzlast])
            .some((z) => z && Object.prototype.hasOwnProperty.call(z, "bezeichnung"));
          if (hat) {
            fertig({ data: null, error: { code: "PGRST204",
              message: "Could not find the 'bezeichnung' column of "
                + "'setup_sheet_slots' in the schema cache" } });
            return;
          }
        }
        if (zustand.art === "update") {
          // Pflichtfelder wie in der echten Datenbank: leeren geht nicht
          const PFLICHT = { jobs: ["started_at", "machine_id", "job_number"] };
          const verboten = (PFLICHT[tabelle] || []).find((f) =>
            Object.prototype.hasOwnProperty.call(zustand.nutzlast || {}, f)
            && (zustand.nutzlast[f] === null || zustand.nutzlast[f] === undefined));
          if (verboten) {
            fertig({ data: null, error: { code: "23502",
              message: 'null value in column "' + verboten + '" of relation "'
                + tabelle + '" violates not-null constraint' } });
            return;
          }
          // Nur ein laufender Auftrag je Maschine, wie idx_jobs_laeuft
          if (tabelle === "jobs" && zustand.nutzlast && zustand.nutzlast.plan_status === "laeuft") {
            const kollision = treffer.some((z) => tab.some((x) => x.id !== z.id
              && x.machine_id === z.machine_id && x.plan_status === "laeuft" && !x.ended_at));
            if (kollision) {
              fertig({ data: null, error: { code: "23505",
                message: 'duplicate key value violates unique constraint "idx_jobs_laeuft"' } });
              return;
            }
          }
          treffer.forEach((z) => {
            Object.assign(z, zustand.nutzlast);
            const m = daten.machines.find((x) => x.id === z.machine_id);
            if (m) { z.maschine = m.name; z.maschine_nr = m.machine_number;
                     z.park_id = m.park_id; z.maschine_reihenfolge = m.sort_order; }
          });
          fertig({ data: treffer, error: null });
          return;
        }

        if (zustand.art === "delete") {
          treffer.forEach((z) => {
            const i = tab.indexOf(z); if (i >= 0) tab.splice(i, 1);
            if (tabelle === "jobs") {
              const k = daten.planwand.indexOf(z);
              if (k >= 0) daten.planwand.splice(k, 1);
            }
          });
          fertig({ data: treffer, error: null });
          return;
        }

        zustand.sort.slice().reverse().forEach((s) => {
          treffer = treffer.slice().sort((x, y) => {
            const a = x[s.feld], c = y[s.feld];
            if (a === c) return 0;
            if (a === null || a === undefined) return 1;
            if (c === null || c === undefined) return -1;
            return (a > c ? 1 : -1) * (s.ab ? -1 : 1);
          });
        });
        if (zustand.grenze) treffer = treffer.slice(0, zustand.grenze);
        if (zustand.von !== undefined) treffer = treffer.slice(zustand.von, zustand.bis + 1);
        else if (treffer.length > 1000) treffer = treffer.slice(0, 1000);

        // Verknuepfungen nachbilden, wie Supabase sie mitliefert
        if (tabelle === "order_items") {
          treffer = treffer.map((z) => {
            const a = daten.articles.find((x) => x.id === z.article_id) || null;
            const eigener = daten.suppliers.find((x) => x.id === z.supplier_id) || null;
            const amArtikel = a
              ? daten.suppliers.find((x) => x.id === a.supplier_id) || null : null;
            return Object.assign({}, z, {
              articles: a ? Object.assign({}, a, { suppliers: amArtikel }) : null,
              suppliers: eigener,
              profiles: daten.profiles[0] || null,
            });
          });
        }
        if (tabelle === "chat_nachrichten" || tabelle === "chat_teilnehmer") {
          treffer = treffer.map((z) => Object.assign({}, z, {
            profiles: daten.profiles.find((x) => x.id === (z.sender_id || z.user_id)) || null }));
        }
        if (tabelle === "type_paths") {
          treffer = treffer.map((p) => Object.assign({}, p, {
            type_slots: daten.type_slots.filter((s) => s.path_id === p.id)
              .map((s) => Object.assign({}, s, {
                slot_tools: daten.slot_tools.filter((w) => w.slot_id === s.id)
                  .map((w) => Object.assign({}, w, {
                    articles: daten.articles.find((a) => a.id === w.article_id) || null })) })) }));
        }
        if (tabelle === "werkzeugwechsel") {
          treffer = daten.tool_changes.map((z) => Object.assign({}, z, {
            maschine: (daten.machines.find((m) => m.id === z.machine_id) || {}).name || null,
            person: (daten.profiles[0] || {}).full_name || null,
            auftrag_nr: (daten.jobs.find((j) => j.id === z.job_id) || {}).job_number || null,
          })).filter((z) => zustand.filter.every((f) => passt(z, f)));
        }
        if (tabelle === "artikel_uebersicht") {
          treffer = daten.articles.map((a) => {
            const l = daten.suppliers.find((x) => x.id === a.supplier_id) || null;
            return Object.assign({}, a, {
              supplier_name: l ? l.name : null,
              supplier_website: l ? l.website : null,
              gesamtbestand: 0, unter_mindestbestand: false });
          });
        }
        if (tabelle === "setup_sheet_slots") {
          treffer = treffer.map((z) => Object.assign({}, z, {
            articles: daten.articles.find((a) => a.id === z.article_id) || null }));
        }
        if (tabelle === "articles") {
          treffer = treffer.map((z) => Object.assign({}, z, {
            suppliers: daten.suppliers.find((x) => x.id === z.supplier_id) || null }));
        }
        fertig(zustand.einzeln
          ? { data: treffer[0] || null, error: treffer.length ? null : { message: "keine Zeile" } }
          : { data: treffer, error: null });
      }, 1);
    });
  }

  return b;
}

export function createClient() {
  return {
    from: (t) => bauer(t),
    // Tests können Antworten je Funktion vorgeben: TEST.rpc.name = (args) => data
    rpc: (name, args) => {
      TEST.protokoll.push({ art: "rpc", name, args });
      const f = TEST.rpc && TEST.rpc[name];
      return Promise.resolve({ data: f ? f(args) : null, error: null });
    },
    functions: { invoke: (name, opt) => {
      TEST.protokoll.push({ art: "funktion", name, body: opt && opt.body });
      const f = TEST.funktionen && TEST.funktionen[name];
      return Promise.resolve(f ? { data: f(opt && opt.body), error: null }
        : { data: null, error: { message: "nicht eingerichtet" } });
    } },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    storage: { from: () => ({
      upload: (pfad) => Promise.resolve({ data: { path: pfad }, error: null }),
      getPublicUrl: (pfad) => ({ data: { publicUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
        + "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==#" + pfad } }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }) },
    auth: {
      getSession: () => Promise.resolve({
        data: { session: (window.OHNE_SITZUNG ? null
          : { user: { id: "u1", email: "saheesan.hudson@hoferco.ch" } }) },
        error: null }),
      getUser: () => Promise.resolve({
        data: { user: { id: "u1", email: "saheesan.hudson@hoferco.ch" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      verifyOtp: (a) => {
        TEST.protokoll.push({ art: "verifyOtp", a });
        window.OHNE_SITZUNG = false;
        return Promise.resolve({ data: {}, error: null });
      },
      signOut: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
    },
  };
}
