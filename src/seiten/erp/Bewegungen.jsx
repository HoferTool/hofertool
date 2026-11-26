// Test ERP: Umbuchen von Hand und Liste der Lagerbewegungen.
// Wunsch Patrick 25. November 2026: „manuell umbuchen, z. B. von HFL nach FL
// oder FL nach Sperrlager … dazu brauche ich einen Vermerk, was oder wer oder
// warum“ und „eine Liste der Lagerbewegungen der Artikel, Zugang / Abgang mit
// wohin, woher, welche Referenz, z. B. Fertigungsauftrag oder Wareneingang
// Bestell-Nr.“. Eine Umbuchung sind zwei Bewegungen mit Art „umbuchung“:
// minus am alten Platz, plus am neuen, gleiche Charge und gleicher Index,
// der Grund in der Notiz. Der Bestand rechnet sich wie immer aus den Bewegungen.
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { buchen, mengeText, datumText, lagerName, bewIdx, BELEGTYP, zahl, artikelText, partnerText } from "../../daten/erp.js";
import { Feld, LagerEingabe, lagerStart, lagerAus, Suche, passt } from "./teile.jsx";
import { GTabelle } from "./Stamm.jsx";
import { belegOeffnen } from "./Belege.jsx";

// ---------- Umbuchen ----------
export function umbuchenOeffnen(d, e, neu) {
  fensterOeffnen((zu) => <Umbuchen d={d} e={e} neu={neu} zu={zu} />);
}

function Umbuchen({ d, e, neu, zu }) {
  const a = d.artikelMap.get(e.artikel_id) || {};
  const von = d.lagerMap.get(e.lager_id);
  const start = lagerStart(d, a);
  // Vorschlag Ziel: bei HFL das Fertiglager, sonst leer lassen (Patrick wählt)
  if (von && von.lagerart === "HFL") start.lart = "FL";
  else if (von && a.art === "hofer") start.lart = von.lagerart === "FL" ? "SPL" : "FL";
  if (a.art === "hofer") start.lplatz = "";
  const [w, setW] = useState({ ...start, menge: String(e.menge), grund: "" });
  const [laeuft, setLaeuft] = useState(false);
  const setzen = (k, v) => setW((x) => ({ ...x, [k]: v }));
  const los = async () => {
    setLaeuft(true);
    try {
      const m = zahl(w.menge);
      if (!(m > 0)) throw new Error("Menge fehlt.");
      if (m > e.menge + 1e-9) throw new Error("Am Platz liegen nur " + mengeText(e.menge) + ".");
      if (!String(w.grund).trim()) throw new Error("Bitte einen Vermerk eintragen: was, wer oder warum.");
      const ziel = await lagerAus(d, a, w);
      if (!ziel) throw new Error("Ziel fehlt.");
      if (ziel === e.lager_id) throw new Error("Ziel ist derselbe Platz.");
      const nach = d.lagerMap.get(ziel);
      const gemeinsam = { artikel_id: e.artikel_id, charge: e.charge, art: "umbuchung", notiz: String(w.grund).trim(), idx: e.idx || "" };
      await buchen({ ...gemeinsam, lager_id: e.lager_id, menge: -m, herkunft: "→ " + lagerName(nach) });
      await buchen({ ...gemeinsam, lager_id: ziel, menge: m, herkunft: "von " + lagerName(von) });
      alt.meldung(mengeText(m) + " " + (a.einheit || "") + " nach " + lagerName(nach) + " umgebucht.", "gut");
      zu(); neu && neu();
    } catch (err) { alt.meldung(alt.fehlertext(err), "fehler"); setLaeuft(false); }
  };
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog" data-erp-umbuchen="">
      <h2>Umbuchen</h2>
      <p className="klein"><b>{artikelText(a)}</b>{e.idx ? " · Index " + e.idx : ""} · Charge {e.charge}<br />
        Von <b>{lagerName(von)}</b>, dort {mengeText(e.menge)} {a.einheit || ""}</p>
      <div className="erp-formular">
        <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w.menge} setzen={(v) => setzen("menge", v)} />
        <LagerEingabe d={d} artikel={a} w={w} setzen={setzen} id="umbuchen" />
        <Feld f={{ name: "grund", label: "Vermerk: was, wer, warum", breit: true, typ: "textarea", zeilen: 2,
          platzhalter: "z. B. Masshaltigkeit prüfen, gesperrt von QS" }} wert={w.grund} setzen={(v) => setzen("grund", v)} />
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" disabled={laeuft} data-erp-speichern="" onClick={los}>Umbuchen</button>
      </div>
    </div>
  );
}

// ---------- Lagerbewegungen ----------
const ART_TEXT = { eingang: "Wareneingang", fertig: "Fertigmeldung", lieferung: "Lieferung", entnahme: "Materialentnahme",
  korrektur: "Korrektur von Hand", umbuchung: "Umbuchung" };

// Namen derer, die gebucht haben, einmal je Laden geholt
let namenVorrat = null;
function useNamen() {
  const [namen, setNamen] = useState(namenVorrat || new Map());
  useEffect(() => {
    if (namenVorrat) return;
    let weg = false;
    alt.db.from("profiles").select("id, full_name, email").then((r) => {
      const m = new Map((r.data || []).map((p) => [p.id, p.full_name || p.email || ""]));
      namenVorrat = m; if (!weg) setNamen(m);
    });
    return () => { weg = true; };
  }, []);
  return namen;
}

// Gegenseite der Bewegung: woher ein Zugang kam bzw. wohin ein Abgang ging
function gegenseite(d, b) {
  const beleg = d.belegMap.get(b.beleg_id);
  const partner = beleg && d.partnerMap.get(beleg.partner_id);
  if (b.art === "eingang") return partner ? "Lieferant " + partnerText(partner) : (b.herkunft || "Lieferant");
  if (b.art === "fertig") return "Produktion" + (beleg ? " FA " + beleg.nr : "");
  if (b.art === "entnahme") return "Fertigung" + (beleg ? " FA " + beleg.nr : "");
  if (b.art === "lieferung") return partner ? "Kunde " + partnerText(partner) : "Kunde";
  if (b.art === "umbuchung") return String(b.herkunft || "").replace(/^(→ |von )/, "");
  if (b.art === "korrektur") return "Korrektur von Hand";
  return b.herkunft || "";
}

export function bewegungZeilen(d, artikelId) {
  return d.bewegungen.filter((b) => !artikelId || b.artikel_id === artikelId)
    .slice().sort((x, y) => String(y.am || "").localeCompare(String(x.am || "")));
}

// Lagerjournal (Wunsch Patrick 25. November 2026: „das lagerjournal kannst du
// machen“): dieselbe Liste über alle Artikel, dazu Zeitraum, Artikelart,
// Summen Zugang / Abgang und Export als CSV für Excel.
const ARTIKELART = { hofer: "Hofer + Co", rohmaterial: "Rohmaterial", werkzeug: "Werkzeug" };
export function BewegungListe({ d, artikelId, aussen, journal }) {
  const namen = useNamen();
  const [suche, setSuche] = useState("");
  const [art, setArt] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [aart, setAart] = useState("");
  const [zahlZeigen, setZahl] = useState(200);
  const alle = bewegungZeilen(d, artikelId).map((b) => {
    const a = d.artikelMap.get(b.artikel_id) || {};
    const l = d.lagerMap.get(b.lager_id);
    const beleg = d.belegMap.get(b.beleg_id);
    const pos = b.position_id && d.posMap.get(b.position_id);
    const zu = Number(b.menge) > 0;
    const hier = lagerName(l);
    const gegen = gegenseite(d, b);
    const ref = beleg ? BELEGTYP[beleg.typ].kurz + " " + beleg.nr + (pos && pos.pos ? " · Pos " + pos.pos : "") : "";
    const wer = namen.get(b.von) || "";
    return { b, a, beleg, zu, woher: zu ? gegen : hier, wohin: zu ? hier : gegen, ref, wer,
      text: [ART_TEXT[b.art] || b.art, a.nr, a.bezeichnung, bewIdx(d, b), b.charge, hier, gegen, ref, b.notiz, wer].join(" ") };
  }).filter((z) => (!art || (art === "zu" ? z.zu && z.b.art !== "umbuchung" : art === "ab" ? !z.zu && z.b.art !== "umbuchung" : z.b.art === art))
    && passt(suche, z.text)
    && (!von || String(z.b.am || "").slice(0, 10) >= von) && (!bis || String(z.b.am || "").slice(0, 10) <= bis)
    && (!aart || z.a.art === aart));
  const zeit = (iso) => (iso ? datumText(String(iso).slice(0, 10)) + " " + String(new Date(iso).toTimeString()).slice(0, 5) : "");
  const kopf = ["Datum", "Art"].concat(artikelId ? [] : ["Artikel"], ["Index", "Charge", "Menge", "Woher", "Wohin", "Referenz", "Vermerk", "Wer"]);
  return (
    <div data-erp-bewegungen="">
      <div className="mat-kopf">
        <Suche wert={suche} setzen={setSuche} platzhalter="Charge, Platz, FA, BE, Vermerk …" />
        <select value={art} onChange={(e) => setArt(e.target.value)} data-erp-bew-art="">
          <option value="">Alle</option><option value="zu">Zugang</option><option value="ab">Abgang</option>
          <option value="umbuchung">Umbuchung</option><option value="korrektur">Korrektur</option>
        </select>
        {journal && <>
          <select value={aart} onChange={(e) => setAart(e.target.value)} data-erp-journal-aart="">
            <option value="">Alle Artikel</option>
            {Object.entries(ARTIKELART).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <label className="erp-journal-datum">von <input type="date" value={von} onChange={(e) => setVon(e.target.value)} data-erp-journal-von="" /></label>
          <label className="erp-journal-datum">bis <input type="date" value={bis} onChange={(e) => setBis(e.target.value)} data-erp-journal-bis="" /></label>
          <button className="knopf knopf--klein" data-erp-journal-csv="" onClick={() => journalCsv(alle, zeit, d)}>⬇ CSV für Excel</button>
        </>}
      </div>
      {journal && <JournalSummen alle={alle} />}
      <GTabelle kopf={kopf} rechts={[artikelId ? 4 : 5]} leer="Keine Lagerbewegungen."
        zeilen={alle.slice(0, zahlZeigen).map((z) => ({ key: z.b.id, klasse: z.zu ? "" : "erp-minus",
          klick: z.beleg ? () => belegOeffnen(d, aussen, z.beleg) : undefined,
          zellen: [zeit(z.b.am), (ART_TEXT[z.b.art] || z.b.art) + (z.b.art === "umbuchung" ? "" : z.zu ? " · Zugang" : " · Abgang")]
            .concat(artikelId ? [] : [<b>{z.a.nr}</b>],
              [bewIdx(d, z.b) || "", z.b.charge, (z.zu ? "+" : "") + mengeText(z.b.menge) + " " + (z.a.einheit || ""),
                z.woher, z.wohin, z.ref ? <b>{z.ref}</b> : "", z.b.notiz || "", z.wer]) }))} />
      {alle.length > zahlZeigen && <p><button className="knopf knopf--klein" onClick={() => setZahl(zahlZeigen + 200)}>
        Mehr ({mengeText(alle.length - zahlZeigen)} weitere)</button></p>}
    </div>
  );
}

// Summen je Einheit: Zugänge, Abgänge (ohne Umbuchungen, die heben sich auf)
function JournalSummen({ alle }) {
  const je = new Map();
  for (const z of alle) {
    if (z.b.art === "umbuchung") continue;
    const e = z.a.einheit || "Stk";
    const s = je.get(e) || { zu: 0, ab: 0 };
    if (z.zu) s.zu += Number(z.b.menge) || 0; else s.ab += Number(z.b.menge) || 0;
    je.set(e, s);
  }
  return (
    <p className="erp-journal-summe" data-erp-journal-summe="">
      {mengeText(alle.length)} Bewegungen{[...je].map(([e, s]) => (
        <span key={e}> · Zugang <b>+{mengeText(s.zu)} {e}</b>, Abgang <b>{mengeText(s.ab)} {e}</b></span>))}
    </p>
  );
}

function journalCsv(alle, zeit, d) {
  const feld = (v) => { const t = String(v == null ? "" : v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const zeilen = [["Datum", "Art", "Artikel", "Bezeichnung", "Index", "Charge", "Menge", "Einheit", "Woher", "Wohin", "Referenz", "Vermerk", "Wer"]];
  for (const z of alle) zeilen.push([zeit(z.b.am), ART_TEXT[z.b.art] || z.b.art, z.a.nr, z.a.bezeichnung, bewIdx(d, z.b) || "", z.b.charge,
    String(Number(z.b.menge) || 0), z.a.einheit || "", z.woher, z.wohin, z.ref, z.b.notiz || "", z.wer]);
  const text = zeilen.map((r) => r.map(feld).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const l = document.createElement("a");
  l.href = url; l.download = "Lagerjournal-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
