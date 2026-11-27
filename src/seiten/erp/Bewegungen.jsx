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

// ---------- Umbuchen, Zubuchen, Abbuchen ----------
// Seit 1.878.0 (Wunsch Patrick 27. November 2026: „hier muss ich auch zubuchen
// und abbuchen können für manuelle Korrekturen“): im selben Fenster die Wahl
// Umbuchen / Zubuchen / Abbuchen. Zu- und Abbuchen sind eine Bewegung mit Art
// „korrektur“ (+ bzw. −) am selben Platz, gleiche Charge und gleicher Index,
// der Vermerk ist Pflicht. Ohne e (kein Bestand) bucht es neu zu: Charge,
// Index und Platz gibt man selbst an (a = Artikel).
export function umbuchenOeffnen(d, e, neu, a) {
  fensterOeffnen((zu) => <Umbuchen d={d} e={e} artikel={a} neu={neu} zu={zu} />);
}

const MODI = [["um", "Umbuchen"], ["zu", "Zubuchen"], ["ab", "Abbuchen"]];

function Umbuchen({ d, e, artikel, neu, zu }) {
  const a = (e ? d.artikelMap.get(e.artikel_id) : artikel) || {};
  const von = e ? d.lagerMap.get(e.lager_id) : null;
  const start = lagerStart(d, a);
  // Vorschlag Ziel: bei HFL das Fertiglager, sonst leer lassen (Patrick wählt)
  if (von && von.lagerart === "HFL") start.lart = "FL";
  else if (von && a.art === "hofer") start.lart = von.lagerart === "FL" ? "SPL" : "FL";
  if (a.art === "hofer" && e) start.lplatz = "";
  const [modus, setModus] = useState(e && e.menge > 0 ? "um" : "zu");
  const [w, setW] = useState({ ...start, menge: e ? String(e.menge) : "", grund: "",
    charge: "", idx: a.idx || "" });
  const [laeuft, setLaeuft] = useState(false);
  const setzen = (k, v) => setW((x) => ({ ...x, [k]: v }));
  const modusSetzen = (m) => {
    setModus(m);
    // Beim Zubuchen startet die Menge leer, beim Um- und Abbuchen mit dem Bestand
    setW((x) => ({ ...x, menge: m === "zu" ? "" : String(e ? e.menge : "") }));
  };
  const los = async () => {
    setLaeuft(true);
    try {
      const m = zahl(w.menge);
      if (!(m > 0)) throw new Error("Menge fehlt.");
      if (modus !== "zu" && m > e.menge + 1e-9) throw new Error("Am Platz liegen nur " + mengeText(e.menge) + ".");
      const grund = String(w.grund).trim();
      if (!grund) throw new Error("Bitte einen Vermerk eintragen: was, wer oder warum.");
      if (modus === "um") {
        const ziel = await lagerAus(d, a, w);
        if (!ziel) throw new Error("Ziel fehlt.");
        if (ziel === e.lager_id) throw new Error("Ziel ist derselbe Platz.");
        const nach = d.lagerMap.get(ziel);
        const gemeinsam = { artikel_id: e.artikel_id, charge: e.charge, art: "umbuchung", notiz: grund, idx: e.idx || "" };
        await buchen({ ...gemeinsam, lager_id: e.lager_id, menge: -m, herkunft: "→ " + lagerName(nach) });
        await buchen({ ...gemeinsam, lager_id: ziel, menge: m, herkunft: "von " + lagerName(von) });
        alt.meldung(mengeText(m) + " " + (a.einheit || "") + " nach " + lagerName(nach) + " umgebucht.", "gut");
      } else if (e) {
        await buchen({ artikel_id: e.artikel_id, charge: e.charge, art: "korrektur", notiz: grund, idx: e.idx || "",
          lager_id: e.lager_id, menge: modus === "zu" ? m : -m, herkunft: "Korrektur von Hand" });
        alt.meldung(mengeText(m) + " " + (a.einheit || "") + (modus === "zu" ? " zugebucht." : " abgebucht."), "gut");
      } else {
        const ziel = await lagerAus(d, a, w);
        if (!ziel) throw new Error("Lagerplatz fehlt.");
        const charge = String(w.charge).trim();
        if (!charge) throw new Error("Charge fehlt.");
        await buchen({ artikel_id: a.id, charge, art: "korrektur", notiz: grund, idx: String(w.idx || "").trim(),
          lager_id: ziel, menge: m, herkunft: "Korrektur von Hand" });
        alt.meldung(mengeText(m) + " " + (a.einheit || "") + " nach " + lagerName(d.lagerMap.get(ziel)) + " zugebucht.", "gut");
      }
      zu(); neu && neu();
    } catch (err) { alt.meldung(alt.fehlertext(err), "fehler"); setLaeuft(false); }
  };
  const titel = (MODI.find((x) => x[0] === modus) || MODI[0])[1];
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog" data-erp-umbuchen="">
      <h2>{e ? titel : "Zubuchen"}</h2>
      {e && <div className="reiter" data-erp-buchmodus="">
        {MODI.map(([k, t]) => <button key={k} className={"reiter__knopf" + (modus === k ? " aktiv" : "")}
          data-erp-modus={k} onClick={() => modusSetzen(k)}>{t}</button>)}
      </div>}
      <p className="klein"><b>{artikelText(a)}</b>{e && e.idx ? " · Index " + e.idx : ""}{e ? " · Charge " + e.charge : ""}
        {e && <><br />{modus === "um" ? "Von " : "Am Platz "}<b>{lagerName(von)}</b>, dort {mengeText(e.menge)} {a.einheit || ""}</>}</p>
      <div className="erp-formular">
        {!e && <Feld f={{ name: "charge", label: "Charge" }} wert={w.charge} setzen={(v) => setzen("charge", v)} />}
        {!e && a.art === "hofer" && <Feld f={{ name: "idx", label: "Index" }} wert={w.idx} setzen={(v) => setzen("idx", v)} />}
        <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w.menge} setzen={(v) => setzen("menge", v)} />
        {(modus === "um" || !e) && <LagerEingabe d={d} artikel={a} w={w} setzen={setzen} id="umbuchen" />}
        <Feld f={{ name: "grund", label: "Vermerk: was, wer, warum", breit: true, typ: "textarea", zeilen: 2,
          platzhalter: modus === "um" ? "z. B. Masshaltigkeit prüfen, gesperrt von QS" : "z. B. Inventur, Zählfehler korrigiert" }}
          wert={w.grund} setzen={(v) => setzen("grund", v)} />
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" disabled={laeuft} data-erp-speichern="" onClick={los}>{e ? titel : "Zubuchen"}</button>
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

// Bewegungen aus dem Gewatec (Wunsch Patrick 26. November 2026: „Ja unbedingt,
// für alle artikel“): 49'479 Bewegungen aus vLagerbewegung liegen in der eigenen
// Tabelle erp_bewegungen_gewatec. Sie zählen NIE zum Bestand (der kommt nur aus
// erp_bewegungen, übernommen aus dem Gewatec-Lagerbestand), sie stehen nur in der
// Liste. Geholt wird erst beim Anzeigen und nur so viele, wie gezeigt werden.
const GW_SPALTEN = "gw_id, artikel_id, artikelcode, einheit, am, menge, lagerort, endlager, idx, charge, fa, ls_intern, kunde, lieferant, ls_lieferant, bemerkung, wer, ohne_buchung";
function useGewatec({ artikelId, artikelNr, journal, von, bis, arten, suche, anzahl }) {
  const [st, setSt] = useState({ zeilen: [], mehr: false });
  const art = !arten.gewatec || (!arten.zu && !arten.ab) ? "keine" : arten.zu && arten.ab ? "" : arten.zu ? "zu" : "ab";
  useEffect(() => {
    if (art === "keine") { setSt({ zeilen: [], mehr: false }); return; }
    if (!journal && !artikelId) return;
    let weg = false;
    let q = alt.db.from("erp_bewegungen_gewatec").select(GW_SPALTEN);
    if (artikelId) q = artikelNr ? q.or("artikel_id.eq." + artikelId + ",artikelcode.eq." + artikelNr) : q.eq("artikel_id", artikelId);
    if (von) q = q.gte("am", von);
    if (bis) q = q.lt("am", bis + "T23:59:59.999");
    if (art === "zu") q = q.gt("menge", 0);
    if (art === "ab") q = q.lt("menge", 0);
    const s = String(suche || "").trim().replace(/[,()*]/g, " ").split(/\s+/)[0];
    if (journal && s) q = q.or(["artikelcode", "charge", "fa", "ls_intern", "kunde", "lieferant", "bemerkung", "lagerort"].map((k) => k + ".ilike.*" + s + "*").join(","));
    q.order("am", { ascending: false }).order("gw_id", { ascending: false }).limit(anzahl + 1).then((r) => {
      if (weg) return;
      const z = r.data || [];
      setSt({ zeilen: z.slice(0, anzahl), mehr: z.length > anzahl });
    });
    return () => { weg = true; };
  }, [artikelId, artikelNr, journal, von, bis, art, suche, anzahl]);
  return st;
}

function gewatecZeile(d, g) {
  const a = (g.artikel_id && d.artikelMap.get(g.artikel_id)) || { nr: g.artikelcode, einheit: g.einheit };
  const zu = Number(g.menge) > 0;
  const fa = g.fa && g.fa !== "0" ? "FA " + g.fa : "";
  const gegen = zu
    ? (g.lieferant ? "Lieferant " + g.lieferant : g.kunde ? "Kunde " + g.kunde : fa ? "Produktion " + fa : g.endlager || "")
    : (g.kunde ? "Kunde " + g.kunde : g.lieferant ? "Lieferant " + g.lieferant : fa ? "Fertigung " + fa : g.endlager || "");
  const ref = [fa, g.ls_intern && g.ls_intern !== "0" ? "LS " + g.ls_intern : "", g.ls_lieferant ? "LS Lief. " + g.ls_lieferant : ""].filter(Boolean).join(" · ");
  const b = { id: "gw" + g.gw_id, am: g.am, menge: g.menge, charge: g.charge || "", notiz: g.bemerkung || "", art: "gewatec", idx: g.idx || "" };
  const hier = g.lagerort || "";
  return { b, a, beleg: null, zu, gw: true, woher: zu ? gegen : hier, wohin: zu ? hier : gegen, ref, wer: g.wer || "",
    text: ["Gewatec", a.nr, a.bezeichnung, g.idx, g.charge, hier, gegen, ref, g.bemerkung, g.wer].join(" ") };
}

// Lagerjournal (Wunsch Patrick 25. November 2026: „das lagerjournal kannst du
// machen“): dieselbe Liste über alle Artikel, dazu Zeitraum, Artikelart,
// Summen Zugang / Abgang und Export als CSV für Excel.
// Bewegungsarten als Häkchen statt Auswahlliste (Wunsch Patrick 27. November
// 2026: „checkboxen zum aktivieren und deaktivieren“). Umbuchung und Korrektur
// zählen für sich, alles andere nach dem Vorzeichen als Zugang oder Abgang.
const BEW_ARTEN = [["zu", "Zugang"], ["ab", "Abgang"], ["umbuchung", "Umbuchung"], ["korrektur", "Korrektur"], ["gewatec", "Gewatec"]];
const ALLE_ARTEN = { zu: true, ab: true, umbuchung: true, korrektur: true, gewatec: true };
function bewArt(z) { return z.b.art === "umbuchung" || z.b.art === "korrektur" ? z.b.art : z.zu ? "zu" : "ab"; }
const ARTIKELART = { hofer: "Hofer + Co", rohmaterial: "Rohmaterial", werkzeug: "Werkzeug" };
export function BewegungListe({ d, artikelId, aussen, journal }) {
  const namen = useNamen();
  const [suche, setSuche] = useState("");
  const [arten, setArten] = useState(ALLE_ARTEN);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [aart, setAart] = useState("");
  const [zahlZeigen, setZahl] = useState(200);
  const artikelNr = artikelId ? (d.artikelMap.get(artikelId) || {}).nr : "";
  const gw = useGewatec({ artikelId, artikelNr, journal, von, bis, arten, suche, anzahl: zahlZeigen });
  const eigene = bewegungZeilen(d, artikelId).map((b) => {
    const a = d.artikelMap.get(b.artikel_id) || {};
    const l = d.lagerMap.get(b.lager_id);
    const beleg = d.belegMap.get(b.beleg_id);
    const pos = b.position_id && d.posMap.get(b.position_id);
    const zu = Number(b.menge) > 0;
    const hier = lagerName(l);
    const gegen = gegenseite(d, b);
    const ref = beleg ? (BELEGTYP[beleg.typ] || {}).kurz + " " + beleg.nr + (pos && pos.pos ? " · Pos " + pos.pos : "") : "";
    const wer = namen.get(b.von) || "";
    return { b, a, beleg, zu, woher: zu ? gegen : hier, wohin: zu ? hier : gegen, ref, wer,
      text: [ART_TEXT[b.art] || b.art, a.nr, a.bezeichnung, bewIdx(d, b), b.charge, hier, gegen, ref, b.notiz, wer].join(" ") };
  }).filter((z) => arten[bewArt(z)]
    && passt(suche, z.text)
    && (!von || String(z.b.am || "").slice(0, 10) >= von) && (!bis || String(z.b.am || "").slice(0, 10) <= bis)
    && (!aart || z.a.art === aart));
  const gwZeilen = gw.zeilen.map((g) => gewatecZeile(d, g)).filter((z) => passt(suche, z.text) && (!aart || z.a.art === aart));
  const alle = eigene.concat(gwZeilen).sort((x, y) => String(y.b.am || "").localeCompare(String(x.b.am || "")));
  // Lagerbewegungen zeigen immer gleich die neusten (Patrick 26. November 2026:
  // „ich sehe die lagerbewegungen immer noch nicht“), die Liste ist schnell genug.
  const zeit = (iso) => (iso ? datumText(String(iso).slice(0, 10)) + " " + String(new Date(iso).toTimeString()).slice(0, 5) : "");
  const kopf = ["Datum", "Art"].concat(artikelId ? [] : ["Artikel"], ["Index", "Charge", "Menge", "Woher", "Wohin", "Referenz", "Vermerk", "Wer"]);
  return (
    <div data-erp-bewegungen="">
      <div className="mat-kopf">
        <Suche wert={suche} setzen={setSuche} platzhalter="Charge, Platz, FA, BE, Vermerk …" />
        <span className="erp-bew-arten">
          {BEW_ARTEN.map(([k, t]) => <label key={k} data-erp-bew-art={k}>
            <input type="checkbox" checked={!!arten[k]} onChange={(e) => setArten({ ...arten, [k]: e.target.checked })} /> {t}
          </label>)}
        </span>
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
        zeilen={alle.slice(0, zahlZeigen).map((z) => ({ key: z.b.id, klasse: (z.zu ? "" : "erp-minus") + (z.gw ? " erp-gewatec" : ""),
          klick: z.beleg ? () => belegOeffnen(d, aussen, z.beleg) : undefined,
          zellen: [zeit(z.b.am), (z.gw ? "Gewatec" : ART_TEXT[z.b.art] || z.b.art) + (z.b.art === "umbuchung" ? "" : z.zu ? " · Zugang" : " · Abgang")]
            .concat(artikelId ? [] : [<b>{z.a.nr}</b>],
              [bewIdx(d, z.b) || "", z.b.charge, (z.zu ? "+" : "") + mengeText(z.b.menge) + " " + (z.a.einheit || ""),
                z.woher, z.wohin, z.ref ? <b>{z.ref}</b> : "", z.b.notiz || "", z.wer]) }))} />
      {(alle.length > zahlZeigen || gw.mehr) && <p><button className="knopf knopf--klein" data-erp-bew-mehr="" onClick={() => setZahl(zahlZeigen + 200)}>
        Mehr{gw.mehr ? "" : " (" + mengeText(alle.length - zahlZeigen) + " weitere)"}</button></p>}
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
  for (const z of alle) zeilen.push([zeit(z.b.am), z.gw ? "Gewatec" : ART_TEXT[z.b.art] || z.b.art, z.a.nr, z.a.bezeichnung, bewIdx(d, z.b) || "", z.b.charge,
    String(Number(z.b.menge) || 0), z.a.einheit || "", z.woher, z.wohin, z.ref, z.b.notiz || "", z.wer]);
  const text = zeilen.map((r) => r.map(feld).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const l = document.createElement("a");
  l.href = url; l.download = "Lagerjournal-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
