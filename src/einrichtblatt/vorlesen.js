// =================================================================
//  ALLE EXCEL-EINRICHTBLÄTTER IM HINTERGRUND EINLESEN
//  Die App liest jedes Excel-Einrichtblatt, das noch kein Blatt in der
//  App hat, selbst ein und speichert es als „noch nicht bestätigt“
//  (Wunsch Patrick, 25. Oktober 2026: „überall schon einlesen und
//  zwischenspeichern, wenn wir es dann benutzen, prüfen wir es und
//  machen den Feinschliff“). Der Pad Mode zeigt weiter das Excel, bis
//  jemand „EB OK“ drückt. Blätter in der App bleiben unberührt.
//
//  Läuft an jedem Computer mit Schreibrecht (vor allem am Pool-Rechner,
//  wo die App den ganzen Tag offen ist), nicht im Pad, am Handy und für
//  Externe. Der Reihe nach, wenige je Durchgang, damit niemand etwas
//  merkt. Mehrere Geräte zugleich schaden nicht: vor jedem Blatt wird
//  nachgeschaut, ob es schon da ist. Seit 1.194.0 auch alte .xls (ohne
//  Bilder und HD-Kästchen). Ein Excel ohne Werkzeuge (Kalkulation) bekommt kein Blatt.
// =================================================================
import { alt } from "../bruecke.jsx";
import { ausExcelEinlesen, tabelleFehlt, TABELLE } from "./daten.js";

const JE_DURCHGANG = 40;
const TAKT_MS = 5 * 60000;
const GESCHEITERT = "hofer.eb.vorlesen.fehler";   // Adressen, die nicht gingen, je Gerät

let takt = null;
let laeuft = false;

function gescheitert() {
  try { return JSON.parse(localStorage.getItem(GESCHEITERT) || "{}") || {}; } catch (f) { return {}; }
}
function scheitern(url) {
  try { const g = gescheitert(); g[url] = Date.now(); localStorage.setItem(GESCHEITERT, JSON.stringify(g)); } catch (f) { /* egal */ }
}

function darf() {
  if (!alt.db || !alt.profil || !alt.darfSchreiben || !alt.darfSchreiben() || alt.istExtern()) return false;
  if (document.body.classList.contains("pad-offen")) return false;
  return window.innerWidth >= 900 && !/iPad|iPhone|Android/i.test(navigator.userAgent);
}

// Alle Zeilen, auch über 1'000 hinaus
async function alle(tabelle, spalten) {
  const zeilen = [];
  for (let von = 0; ; von += 1000) {
    const r = await alt.db.from(tabelle).select(spalten).range(von, von + 999);
    if (r.error) throw r.error;
    zeilen.push(...(r.data || []));
    if ((r.data || []).length < 1000) return zeilen;
  }
}

export async function offeneBlaetter() {
  const [excel, app] = await Promise.all([alle("hoco_type_data", "hoco_nr, type_id, blatt_url"), alle(TABELLE, "hoco_nr, type_id")]);
  const da = new Set(app.map((b) => b.hoco_nr + "|" + b.type_id));
  const g = gescheitert();
  return excel.filter((z) => z.hoco_nr && z.type_id && /\.(xlsx|xlsm|xls)(\?|#|$)/i.test(String(z.blatt_url || ""))
    && !da.has(z.hoco_nr + "|" + z.type_id) && !g[z.blatt_url]);
}

async function durchgang() {
  if (laeuft || !darf()) return;
  laeuft = true;
  try {
    const liste = (await offeneBlaetter()).slice(0, JE_DURCHGANG);
    if (!liste.length) return;
    const typen = (await alt.ladeTypen()) || [];
    const artikel = {};
    for (const z of liste) {
      if (!darf()) break;
      const typ = typen.find((t) => t.id === z.type_id);
      if (!typ) continue;
      try {
        const e = await ausExcelEinlesen(z.hoco_nr, typ, z.blatt_url, { artikel, nurMitPlaetzen: true });
        if (!e.ok) scheitern(z.blatt_url);
      } catch (f) {
        if (tabelleFehlt(f)) return;
        scheitern(z.blatt_url);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (f) {
    console.warn("Einrichtblätter einlesen:", f);
  } finally { laeuft = false; }
}

export function einlesenWaechter() {
  if (takt) return;
  // Im Prüfstand nur auf Abruf, damit es keinem anderen Test dazwischenfährt
  if (window.TEST) { window.TEST.ebVorlesen = () => durchgang(); return; }
  takt = setInterval(() => { durchgang().catch(() => {}); }, TAKT_MS);
  setTimeout(() => { durchgang().catch(() => {}); }, 45000);
}
