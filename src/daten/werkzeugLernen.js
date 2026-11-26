// =================================================================
//  WERKZEUGWAHL LERNT (seit 1.872.0, Wunsch Patrick 26. November 2026:
//  „soll lernen, wie es früher hiess und was dann gewählt wird, und
//  so Sachen vorschlagen, obwohl das, was man eingibt, nicht ähnlich
//  ist“, Beispiel: Applitec hiessen früher die SM-Tool-Platten)
//
//  Wird ein Artikel gewählt, merkt sich die Tabelle werkzeug_gelernt
//  (sql/werkzeug-lernen.sql), wie das Werkzeug vorher hiess: der Text
//  aus dem alten Excel, der vorherige Artikel oder das Eingetippte.
//  Beim nächsten Mal steht oben „Könnte das sein?“ mit den Artikeln,
//  die zu diesem oder einem ähnlichen alten Text gewählt wurden. Dazu
//  lernt die App, wenn ein Lieferant jetzt anders heisst (alter
//  Hersteller im Excel, gewählter Artikel von einem anderen), und
//  sucht dann beim neuen Lieferanten nach einer ähnlichen Nummer.
//  Ohne Tabelle passiert einfach nichts.
// =================================================================
import { alt } from "../bruecke.jsx";
import { normal, aehnlichWert, aehnlicheTreffer } from "./aehnlich.js";

let speicher = null;   // { zeit, zeilen, artikel: {id: Artikel} }

export function gelerntVergessen() { speicher = null; }

async function gelerntLaden() {
  if (speicher && Date.now() - speicher.zeit < 60000) return speicher;
  let zeilen = [];
  const artikel = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("werkzeug_gelernt").select("*")
      .order("zuletzt_am", { ascending: false }).limit(5000), 12000, "Gelerntes");
    if (r.error) throw r.error;
    zeilen = r.data || [];
    const ids = [...new Set(zeilen.map((z) => z.article_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const a = await alt.db.from("artikel_uebersicht").select("*").in("id", ids.slice(i, i + 200));
      (a.data || []).forEach((x) => { artikel[x.id] = x; });
    }
  } catch (f) { zeilen = []; }
  speicher = { zeit: Date.now(), zeilen, artikel };
  return speicher;
}

// Steht der alte Text schon so im Artikel, gibt es nichts zu lernen:
// den findet die normale Suche von selbst
function stehtSchonDrin(text, a) {
  const felder = normal([a.article_number, a.name, a.description, a.supplier_name].join(" "));
  const woerter = String(text || "").split(/[\s,]+/).map(normal).filter(Boolean);
  return woerter.length > 0 && woerter.every((w) => felder.includes(w));
}

export async function lernen(altText, altHersteller, a) {
  const text = String(altText || "").trim();
  const norm = normal(text);
  if (!norm || !a || !a.id) return;
  const hersteller = String(altHersteller || "").trim();
  const andererLieferant = hersteller && normal(hersteller) !== normal(a.supplier_name);
  if (stehtSchonDrin(text, a) && !andererLieferant) return;
  try {
    const r = await alt.db.rpc("werkzeug_lernen", { p_norm: norm, p_artikel: a.id, p_text: text, p_hersteller: hersteller });
    if (r.error) throw r.error;
    speicher = null;
  } catch (f) { /* ohne Tabelle lernt sie eben nicht */ }
}

// Alter Lieferant → neuer, aus dem Gelernten: im Excel stand „SM Tools“,
// gewählt wurde ein Artikel von Applitec
function umbenannteLieferanten(s) {
  const je = {};
  for (const z of s.zeilen) {
    const a = s.artikel[z.article_id];
    const alt_ = normal(z.alt_hersteller);
    if (!a || !alt_ || !a.supplier_name || normal(a.supplier_name) === alt_) continue;
    const k = alt_ + "|" + a.supplier_name;
    if (!je[k]) je[k] = { alt: z.alt_hersteller, altNorm: alt_, neu: a.supplier_name, anzahl: 0 };
    je[k].anzahl += z.anzahl || 1;
  }
  return Object.values(je).sort((x, y) => y.anzahl - x.anzahl);
}

// Vorschläge zu einem alten Text (und Hersteller), die besten zuerst:
// [{ artikel, grund }]. ohneId: der Artikel, der schon dran ist.
export async function vorschlaege(text, hersteller, ohneId) {
  const t = String(text || "").trim();
  const h = String(hersteller || "").trim();
  if (!t && !h) return [];
  const s = await gelerntLaden();
  if (!s.zeilen.length) return [];
  const norm = normal(t);
  const je = new Map();
  const dazu = (a, wert, grund) => {
    if (!a || a.id === ohneId) return;
    const da = je.get(a.id);
    if (!da || da.wert < wert) je.set(a.id, { artikel: a, wert, grund });
  };

  if (norm) {
    for (const z of s.zeilen) {
      const a = s.artikel[z.article_id];
      if (!a) continue;
      const n = z.anzahl || 1;
      const grund = "Früher „" + (z.alt_text || z.alt_norm) + "“, " + n + "× so gewählt";
      if (z.alt_norm === norm) { dazu(a, 100 + n, grund); continue; }
      // Ähnlich geschrieben, oder der eine Text steckt im anderen
      const w = aehnlichWert(t, [z.alt_text || ""]);
      if (w != null) { dazu(a, 60 - w * 10 + n, grund); continue; }
      if (z.alt_norm.length >= 4 && norm.length >= 4 && (norm.includes(z.alt_norm) || z.alt_norm.includes(norm)))
        dazu(a, 50 + n, grund);
    }
  }

  // Lieferant heisst jetzt anders: dort nach ähnlicher Nummer suchen
  const umbenannt = umbenannteLieferanten(s).filter((u) =>
    (h && normal(h) === u.altNorm) || (u.altNorm.length >= 3 && norm.includes(u.altNorm)));
  for (const u of umbenannt.slice(0, 2)) {
    // Ohne die Wörter des alten Lieferanten bleibt die Nummer
    const nummer = t.split(/\s+/).filter((w) => { const n = normal(w); return n.length < 2 || !u.altNorm.includes(n); }).join(" ").trim();
    if (!nummer) continue;
    try {
      const r = await alt.zeitlimit(alt.db.from("artikel_uebersicht").select("*")
        .eq("supplier_name", u.neu).limit(3000), 12000, "Artikel");
      const treffer = aehnlicheTreffer(nummer, r.data || [],
        (a) => [a.article_number, a.name, a.description], [], 5);
      treffer.forEach((a, i) => dazu(Object.assign({}, a, { aehnlich: false }), 40 - i,
        "„" + u.alt + "“ heisst jetzt " + u.neu));
    } catch (f) { /* dann eben nicht */ }
  }

  return [...je.values()].sort((x, y) => y.wert - x.wert).slice(0, 5)
    .map((v) => ({ artikel: v.artikel, grund: v.grund }));
}
