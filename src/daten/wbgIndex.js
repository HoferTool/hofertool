// =================================================================
//  INDEX AUS DER WBG AM AUFTRAG MERKEN
//  Wunsch Patrick, 25. November 2026: „bei allen Aufträgen soll aus der
//  WBG der Index herausgelesen werden, bei den Stammdaten festgehalten
//  … die Teile mitverfolgen, da HOCO Art mit verschiedenen Indexen
//  nicht dasselbe Teil ist“. Die App liest im Hintergrund jede WBG, die
//  noch keinen Index am Auftrag hat, und schreibt ihn in jobs.wbg_index
//  ("-" = kein Index, "?" = nicht lesbar). Die Datenbank trägt den
//  Index des jüngsten Auftrags von selbst in hoco_parts.index_nr ein
//  (sql/wbg-index.sql) und leert wbg_index, wenn eine neue WBG kommt.
//
//  Läuft wie das Einlesen der Einrichtblätter an Computern mit
//  Schreibrecht, nicht im Pad, am Handy und für Externe.
// =================================================================
import { alt } from "../bruecke.jsx";
import { wbgFelderLesen } from "./waschprog.js";

const JE_DURCHGANG = 30;
const TAKT_MS = 5 * 60000;

let takt = null;
let laeuft = false;
let ohneSpalte = false;

function darf() {
  if (ohneSpalte || !alt.db || !alt.profil || !alt.darfSchreiben || !alt.darfSchreiben() || alt.istExtern()) return false;
  if (document.body.classList.contains("pad-offen")) return false;
  return window.innerWidth >= 900 && !/iPad|iPhone|Android/i.test(navigator.userAgent);
}

const spalteFehlt = (f) => /wbg_index/.test(String((f && (f.message || f.details)) || f));

async function durchgang() {
  if (laeuft || !darf()) return;
  laeuft = true;
  try {
    const r = await alt.db.from("jobs").select("id, wbg_url")
      .not("wbg_url", "is", null).is("wbg_index", null)
      .order("planned_from", { ascending: false }).limit(JE_DURCHGANG);
    if (r.error) { if (spalteFehlt(r.error)) ohneSpalte = true; return; }
    for (const j of r.data || []) {
      if (!darf() || !j.wbg_url) continue;
      const w = await wbgFelderLesen(j.wbg_url);
      if (!w) continue;   // nicht erreichbar: beim nächsten Mal nochmals
      const wert = w.idx || "?";
      const u = await alt.db.from("jobs").update({ wbg_index: wert }).eq("id", j.id).eq("wbg_url", j.wbg_url);
      if (u.error) { if (spalteFehlt(u.error)) { ohneSpalte = true; return; } }
      await new Promise((res) => setTimeout(res, 500));
    }
  } catch (f) {
    console.warn("Index aus WBG:", f);
  } finally { laeuft = false; }
}

export function wbgIndexWaechter() {
  if (takt) return;
  if (window.TEST) { window.TEST.wbgIndex = () => durchgang(); return; }
  takt = setInterval(() => { durchgang().catch(() => {}); }, TAKT_MS);
  setTimeout(() => { durchgang().catch(() => {}); }, 60000);
}
