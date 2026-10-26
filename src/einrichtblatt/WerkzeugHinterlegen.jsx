// =================================================================
//  WERKZEUG HINTERLEGEN
//  Werkzeuge, die die App aus dem Excel gelesen hat, stehen dort oft
//  nur als Text und ohne Hersteller. Das soll es nicht mehr geben
//  (Wunsch Patrick, 26. Oktober 2026: „es darf nicht sein, dass es ohne
//  Hersteller steht“): Solange ein Platz kein hinterlegtes Werkzeug hat
//  oder die App den Artikel nur selbst zugeordnet hat, ist er rot
//  umrandet. Hier legt man den Artikel an, Nummer, Bezeichnung und
//  Hersteller schlägt die App aus dem Excel-Text vor, der Hersteller
//  ist Pflicht.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";

// Ein Platz braucht noch eine Hand: Werkzeug ohne Artikel, oder der
// Artikel kommt nur vom Einlesen und ist nicht bestätigt
export function werkzeugOffen(p) {
  return !!(p && p.werkzeug && (!p.article_id || p.ungeprueft));
}

const klein = (x) => String(x || "").toLowerCase()
  .replace(/[äöü]/g, (z) => ({ ä: "a", ö: "o", ü: "u" })[z]).replace(/[^a-z0-9]/g, "");
// „Utillis“ und „Utilis“, „Vischer & Bolli“ und „Vischer und Bolli“
const grob = (x) => klein(x).replace(/und/g, "").replace(/(.)\1+/g, "$1");

// Wörter, die im Excel in der Herstellerzeile stehen, aber kein Hersteller sind
const KEIN_HERSTELLER = /^(hm|hss|vhm|nc|cbn|pkd|cermet|halter|platte|bohrer|schneideinsatz|art|ø.*|r\d.*|\d.*|links|rechts|innen|aussen)$/i;

// Hersteller zum Text: zuerst ein vorhandener Lieferant, dessen erstes
// Wort im Text steht, sonst das erste Wort der Herstellerzeile als neuer
export function herstellerVorschlag(hersteller, werkzeug, lieferanten) {
  const texte = [hersteller, werkzeug].map(grob);
  for (const t of texte) {
    if (!t) continue;
    const l = (lieferanten || []).find((x) => {
      const ganz = grob(x.name);
      const erst = grob(String(x.name || "").split(/[\s.]+/).filter(Boolean)[0] || "");
      return (ganz.length >= 4 && t.includes(ganz)) || (erst.length >= 4 && t.includes(erst));
    });
    if (l) return { id: l.id, name: l.name };
  }
  const wort = String(hersteller || "").split(/[\s,:;/()]+/).find((w) => w && !KEIN_HERSTELLER.test(w) && /[a-z]{3}/i.test(w));
  if (!wort) return null;
  // „SECO“ wird „Seco“, „Horn“ bleibt
  return { id: null, name: /^[A-ZÄÖÜ]+$/.test(wort) ? wort.charAt(0) + wort.slice(1).toLowerCase() : wort.charAt(0).toUpperCase() + wort.slice(1) };
}

// Bezeichnung aus Tätigkeit und Werkzeugtext, nur aus der gepflegten Liste
const BEZ_REGELN = [
  [/gew\w*\s*form|former|formen/i, "Gewindeformer"],
  [/gew\w*\s*bohr|gewindebohrer/i, "Gewindebohrer"],
  [/gewinde|strehl/i, "Gewindeplatte"],
  [/kugel/i, "Kugelfräser"],
  [/reib/i, "Reibahle"],
  [/zentrier|\bnc\b|anbohr/i, "Zentrierer"],
  [/flachbohr/i, "Flachbohrer"],
  [/halter/i, "Werkzeughalter"],
  [/stech|\bgim\b|\bdgn\b|\bgrip\b/i, "Stechplatte"],
  [/ausdreh|innen|\bmte[cn]/i, "Ausdrehwerkzeug"],
  [/fräs|fraes|\bsw\s?\d/i, "Schaftfräser"],
  [/\b[A-Z]{4}\s?\d{2,}/, "Wendeplatte"],
  [/bohr|kernloch/i, "Bohrer"],
  [/drehen|planier|schrupp|schlicht/i, "Wendeplatte"],
];
export function bezeichnungVorschlag(p, bezeichnungen) {
  const namen = (bezeichnungen || []).map((b) => b.name || b);
  const text = [p.werkzeug, p.taetigkeit, p.hersteller].filter(Boolean).join(" ");
  for (const [re, name] of BEZ_REGELN) if (re.test(text) && namen.includes(name)) return name;
  return "";
}

// Artikelnummer: der Werkzeugtext ohne den Hersteller vorne und ohne „Art.“
export function nummerVorschlag(werkzeug, herstellerName) {
  let t = String(werkzeug || "").trim();
  const erst = String(herstellerName || "").split(/\s+/)[0];
  if (erst && grob(t.split(/\s+/)[0]) === grob(erst)) t = t.split(/\s+/).slice(1).join(" ");
  return t.replace(/\bart\.?\s*(nr\.?)?\s*/i, "").trim();
}

export function WerkzeugHinterlegen({ p, fertig, abbrechen }) {
  const [lieferanten, setLieferanten] = useState(null);
  const [bezeichnungen, setBezeichnungen] = useState([]);
  const [w, setW] = useState({ nummer: "", name: "", lieferant: "", neuerName: "" });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  useEffect(() => {
    Promise.all([alt.ladeLieferanten().catch(() => []), alt.ladeBezeichnungen().catch(() => [])]).then(([l, b]) => {
      setLieferanten(l); setBezeichnungen(b);
      const h = herstellerVorschlag(p.hersteller, p.werkzeug, l);
      setW({ nummer: nummerVorschlag(p.werkzeug, h && h.name), name: bezeichnungVorschlag(p, b),
        lieferant: h ? (h.id || "__neu") : "", neuerName: h && !h.id ? h.name : "" });
    });
  }, []);
  const f = (feld) => (e) => { setFehler(""); setW(Object.assign({}, w, { [feld]: e.target.value })); };

  const speichern = async () => {
    const nummer = w.nummer.trim();
    const neuerName = w.neuerName.trim();
    if (!nummer) { setFehler("Artikelnummer fehlt."); return; }
    if (!w.name) { setFehler("Bezeichnung wählen."); return; }
    if (!w.lieferant || (w.lieferant === "__neu" && !neuerName)) { setFehler("Ohne Hersteller geht es nicht."); return; }
    setLaeuft(true); setFehler("");
    try {
      const db = alt.db;
      let lief = (lieferanten || []).find((l) => l.id === w.lieferant) || null;
      if (w.lieferant === "__neu") {
        // Gibt es ihn schon unter anderer Schreibweise, den nehmen
        lief = (lieferanten || []).find((l) => grob(l.name) === grob(neuerName)) || null;
        if (!lief) {
          const r = await db.from("suppliers").insert({ name: neuerName }).select().single();
          if (r.error) throw r.error;
          lief = r.data;
        }
      }
      let a = null;
      const r = await db.from("articles").insert({ article_number: nummer, name: w.name, unit: "Stück", supplier_id: lief.id })
        .select().single();
      if (r.error) {
        // Die Nummer gibt es schon: diesen Artikel nehmen
        const da = await db.from("articles").select("*").eq("article_number", nummer).maybeSingle();
        if (!da.data) throw r.error;
        a = da.data;
        if (a.is_active === false) await db.from("articles").update({ is_active: true }).eq("id", a.id);
        const l2 = (lieferanten || []).find((l) => l.id === a.supplier_id);
        if (l2) lief = l2;
        alt.meldung("Den Artikel " + nummer + " gab es schon, er ist jetzt hinterlegt.", "gut");
      } else {
        a = r.data;
        alt.meldung("Werkzeug angelegt und hinterlegt.", "gut");
      }
      fertig(Object.assign({}, a, { supplier_name: lief ? lief.name : "" }));
    } catch (x) { setFehler(alt.fehlertext(x)); }
    finally { setLaeuft(false); }
  };

  if (!lieferanten) return <div className="eba-hl" data-pf-hinterlegen=""><span>Lade Hersteller …</span></div>;
  return (
    <div className="eba-hl" data-pf-hinterlegen="">
      <span className="eba-hl-titel">Werkzeug hinterlegen</span>
      <small>Vorschlag aus dem Excel: „{p.werkzeug}“{p.hersteller ? ", " + p.hersteller : ""}. Bitte prüfen.</small>
      <label className="feld"><span>Artikelnummer</span><input data-hl="nummer" value={w.nummer} onChange={f("nummer")} /></label>
      <label className="feld"><span>Bezeichnung</span>
        <select data-hl="name" value={w.name} onChange={f("name")}>
          <option value="">— wählen —</option>
          {bezeichnungen.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></label>
      <label className="feld"><span>Hersteller (Pflicht)</span>
        <select data-hl="lieferant" value={w.lieferant} onChange={f("lieferant")}
          className={!w.lieferant ? "eba-hl-fehlt" : ""}>
          <option value="">— wählen —</option>
          {lieferanten.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="__neu">+ Neuer Hersteller …</option></select></label>
      {w.lieferant === "__neu" && <label className="feld"><span>Name des neuen Herstellers</span>
        <input data-hl="neuerName" value={w.neuerName} onChange={f("neuerName")} /></label>}
      {fehler && <div className="eba-hl-fehler" data-hl-fehler="">{fehler}</div>}
      <div className="eba-pf-wknoepfe">
        <button className="knopf knopf--klein knopf--still" data-hl-abbrechen="" onClick={abbrechen}>Abbrechen</button>
        <button className="knopf knopf--klein knopf--haupt" data-hl-ok="" disabled={laeuft} onClick={speichern}>Anlegen und hinterlegen</button>
      </div>
    </div>
  );
}
