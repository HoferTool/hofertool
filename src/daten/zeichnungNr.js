// =================================================================
//  ZEICHNUNGSNUMMER FÜR DIE SCHNELLVORSCHAU
//  Wunsch Patrick (20. Oktober 2026): Beim Darüberfahren über einen
//  Balken steht die Zeichnungsnummer. Zuerst aus dem Dateinamen der
//  Zeichnung, weil die fast immer da ist („T04.514.13 Kunde.pdf“ →
//  T04.514.13); erst ohne solche Zeichnung aus der WBG („Z-Nr.:“).
//  Den Dateinamen kennt die App aus hoco_parts.zeichnung_quelle, das
//  der Pool-Rechner beim Hochladen schreibt (nur solange die Zeichnung
//  nicht von Hand ersetzt ist).
// =================================================================
import { alt } from "../bruecke.jsx";
import { zeichnungNrLesen, zeichnungNrGemerkt } from "./waschprog.js";

// „T04.514.13 Kunde.pdf“ → „T04.514.13“. Bei euch steht hinter der
// Nummer fast immer „Kunde“ oder „Hofer“, manchmal noch mehr („Hofer -
// Index 2“, „Kunde_gestempelt“): die Nummer ist, was davor steht. Ohne
// dieses Wort gilt nur ein Name ohne Leerzeichen mit Ziffer („M48078“),
// nicht „Stift Ø 3.2 x 70“. Die HOCO Nr. selbst ist keine Zeichnungsnummer.
export function zeichnungNrAusDatei(pfad, hoco) {
  const name = String(pfad || "").split(/[\\/]/).pop().replace(/\.pdf$/i, "").trim();
  const m = /^(.*?)[\s._-]+(kunde|hofer)/i.exec(name);
  let nr = m ? m[1] : (/^\S*\d\S*$/.test(name) && !/^(kunde|hofer)/i.test(name) ? name : "");
  nr = nr.replace(/[\s._-]+$/, "").trim();
  return nr && nr !== hoco ? nr : "";
}

let laden = null;
const jeAdresse = new Map(), jeHoco = new Map();

function dateinamenLaden() {
  if (!laden) {
    laden = (async () => {
      if (!alt.db) return;
      for (let ab = 0; ab < 20000; ab += 1000) {
        const r = await alt.db.from("hoco_parts").select("hoco_nr, zeichnung_url, zeichnung_quelle")
          .not("zeichnung_quelle", "is", null).range(ab, ab + 999);
        if (!r || r.error) return;
        for (const t of r.data || []) {
          const q = t.zeichnung_quelle;
          // Nur wenn die Zeichnung noch die vom Pool-Rechner ist
          if (!q || !q.pfad || !t.zeichnung_url || q.url !== t.zeichnung_url) continue;
          const nr = zeichnungNrAusDatei(q.pfad, t.hoco_nr);
          if (!nr) continue;
          jeAdresse.set(t.zeichnung_url, nr);
          if (t.hoco_nr) jeHoco.set(t.hoco_nr, { url: t.zeichnung_url, nr });
        }
        if ((r.data || []).length < 1000) return;
      }
    })().catch(() => { /* Spalte fehlt: dann nur aus der WBG */ });
  }
  return laden;
}

let bereit = false;
const ausDatei = (j) => {
  if (j.drawing_url) return jeAdresse.get(j.drawing_url) || "";
  const h = jeHoco.get(j.job_number);
  return h ? h.nr : "";
};

// Sofort, was schon bekannt ist: Text, "" (keine) oder undefined (noch lesen)
export function zeichnungNrSofort(j) {
  if (!bereit) return undefined;
  const d = ausDatei(j);
  if (d) return d;
  if (!j.wbg_url) return "";
  return zeichnungNrGemerkt(j.wbg_url);
}

export async function zeichnungNrHolen(j) {
  await dateinamenLaden();
  bereit = true;
  const d = ausDatei(j);
  if (d) return d;
  return j.wbg_url ? (await zeichnungNrLesen(j.wbg_url)) || "" : "";
}
