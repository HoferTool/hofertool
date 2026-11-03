// =================================================================
//  SYSTEMZUSTAND (seit 1.382.0, Wunsch Patrick 3. November 2026:
//  „allgemein wenn was nicht stimmt … dass sowas nicht nochmals passiert“)
//
//  Nur für Admins. Liest, was die Hintergrundarbeiten selbst melden
//  (app_config: Sicherung, Planwand-Archiv, Einrichtblätter als PDF,
//  Pool-Rechner, Druckprogramm, NC-Geometrie) und den letzten Wert der
//  Solaranlage. Steht nur da, wenn etwas nicht stimmt: zu lange keine
//  Meldung oder ein Fehler. Sonst bleibt die Startseite ruhig.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";

const keine = async () => null;
const MIN = 60 * 1000;
const STD = 60 * MIN;

const SCHLUESSEL = ["sicherung", "sicherung_status", "planwand_archiv", "planwand_archiv_status",
  "eb_pdf", "eb_pdf_status", "dok_pool_status", "druck_status", "nc_geo_status"];

function jsonOder(text, ersatz) {
  if (text && typeof text === "object") return text;
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

const alter = (zeit, jetzt) => {
  const t = zeit ? new Date(zeit).getTime() : NaN;
  return isNaN(t) ? Infinity : jetzt - t;
};

function seitText(ms) {
  if (ms === Infinity) return "noch nie";
  if (ms < 2 * STD) return "seit " + Math.round(ms / MIN) + " Minuten";
  if (ms < 48 * STD) return "seit " + Math.round(ms / STD) + " Stunden";
  return "seit " + Math.round(ms / (24 * STD)) + " Tagen";
}

const fehlerText = (f) => (Array.isArray(f) ? f.slice(0, 2).join(" · ") : String(f || "")).slice(0, 200);

// Liefert die Liste der Probleme: [{ was, text }]
export function zustandPruefen(w, solarZeit, jetzt = Date.now()) {
  const aus = [];
  const s = w.sicherung_status || {};
  // Täglich ab der eingestellten Stunde; 30 Stunden lassen Luft, falls
  // der Pool-Rechner am Morgen erst später läuft
  if ((w.sicherung || {}).geraet) {
    const a = alter(s.letzte && s.letzte.zeit, jetzt);
    if (a > 30 * STD) aus.push({ was: "Sicherung", text: "Letzte Sicherung " + seitText(a) + " her. Läuft die App am Sicherungsgerät?" });
    if (s.fehler) aus.push({ was: "Sicherung", text: fehlerText(s.fehler) });
  }
  const ar = w.planwand_archiv_status || {};
  if ((w.planwand_archiv || {}).geraet) {
    const a = alter(ar.letzte && ar.letzte.zeit, jetzt);
    if (a > 30 * STD) aus.push({ was: "Planwand-Archiv", text: "Letztes Archiv " + seitText(a) + " her." });
    if (ar.fehler) aus.push({ was: "Planwand-Archiv", text: fehlerText(ar.fehler) });
  }
  const eb = w.eb_pdf_status || {};
  if ((w.eb_pdf || {}).geraet && eb.fehler && eb.fehler.length)
    aus.push({ was: "Einrichtblätter als PDF", text: fehlerText(eb.fehler) });
  const pool = w.dok_pool_status;
  if (pool) {
    // Die Aufgabe „HoferTool“ meldet alle 5 Minuten
    const a = alter(pool.zeit || pool.gesehen, jetzt);
    if (a > 30 * MIN) aus.push({ was: "Pool-Rechner", text: "Aufgabe „HoferTool“ meldet sich " + seitText(a) + " nicht mehr (WBGs, Zeichnungen, Einrichtblätter, Solar)." });
    else if (pool.fehler) aus.push({ was: "Pool-Rechner", text: fehlerText(pool.fehler) });
  }
  const dr = w.druck_status;
  if (dr) {
    // Das Druckprogramm meldet jede Minute
    const a = alter(dr.gesehen, jetzt);
    if (a > 15 * MIN) aus.push({ was: "Drucken", text: "Druckprogramm am Pool-Rechner meldet sich " + seitText(a) + " nicht mehr." });
    else if (dr.fehler) aus.push({ was: "Drucken", text: fehlerText(dr.fehler) });
  }
  const nc = w.nc_geo_status;
  if (nc && nc.fehler) aus.push({ was: "GEO-OFFSET", text: fehlerText(nc.fehler) });
  if (solarZeit !== undefined) {
    const a = alter(solarZeit, jetzt);
    if (a > 30 * MIN) aus.push({ was: "Solaranlage", text: "Keine Werte " + seitText(a) + "." });
  }
  return aus;
}

export async function systemzustandLaden() {
  const [r, sol] = await Promise.all([
    alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert").in("schluessel", SCHLUESSEL), 8000, "Systemzustand"),
    alt.zeitlimit(alt.db.from("solar_werte").select("gemessen").order("gemessen", { ascending: false }).limit(1), 8000, "Solaranlage")
      .catch(() => null)]);
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  // Ohne Lesen der Solarwerte nicht melden, nur wenn wirklich alte da sind
  const solarZeit = sol && !sol.error && sol.data && sol.data.length ? sol.data[0].gemessen : undefined;
  return zustandPruefen(w, solarZeit);
}

export default function Systemzustand({ auffrischen }) {
  const zeigen = alt.istAdmin() && !alt.istExtern();
  const { daten } = useDaten(zeigen ? systemzustandLaden : keine, [auffrischen, zeigen]);
  if (!daten || !daten.length) return null;
  return (
    <section className="karte karte--warnung systemzustand" id="db-systemzustand">
      <h2>⚠ Systemzustand <span className="marke">{daten.length}</span></h2>
      {daten.map((x, i) => (
        <div className="systemzustand__zeile" key={i} data-system={x.was}>
          <b>{x.was}</b> <span>{x.text}</span>
        </div>))}
    </section>
  );
}
