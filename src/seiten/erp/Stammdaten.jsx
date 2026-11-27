// Test ERP: Stammdaten (Lieferanten, Kunden, Artikel mit Index, Betriebsmittel,
// Prüfmittel, Liefer- und Zahlungsbedingungen, Lager, Arbeitspläne)
import { useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { formular, Tabelle, Suche, passt, tun, Feld, AG_FELDER, ohneSuche, sucheLeer } from "./teile.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import {
  einfuegen, aendern, loeschen, naechstePartnerNr, ARTIKELART, HOFER_NR, bestand, mengeText, chf,
  mapsLink, artikelText, zahl, buchen, peKurz, LAGERARTEN, lagerartText, lagerName, istHoferLager, HOFER_LAGERARTEN, lagerplatzId,
  NUMMERNKREISE, naechsteNummer, nummerText, nummernSpeichern,
} from "../../daten/erp.js";
import { stundensatz } from "../../daten/kalkulation.js";
import { artikelFensterOeffnen, neuerIndex } from "./ArtikelFenster.jsx";
import { partnerFensterOeffnen } from "./PartnerFenster.jsx";
import { umbuchenOeffnen, BewegungListe } from "./Bewegungen.jsx";

export const STAMM_REITER = [
  ["lieferant", "Lieferanten"], ["kunde", "Kunden"], ["artikel", "Artikel"], ["betriebsmittel", "Betriebsmittel"],
  ["liefer", "Lieferbedingungen"], ["zahlung", "Zahlungsbedingungen"],
  ["lager", "Lager"], ["arbeitsplan", "Arbeitspläne"], ["nummern", "Nummernkreise"],
];

const gemerkt = { reiter: "kunde", artArt: "hofer" };

export default function Stammdaten({ d, neu }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  gemerkt.reiter = reiter;
  return (
    <>
      <div className="reiter erp-unterreiter">
        {STAMM_REITER.map(([w, t]) => <button key={w} className={"reiter__knopf" + (reiter === w ? " aktiv" : "")}
          data-erp-stamm={w} onClick={() => setReiter(w)}>{t}</button>)}
      </div>
      {(reiter === "lieferant" || reiter === "kunde") && <Partner d={d} neu={neu} art={reiter} />}
      {reiter === "artikel" && <Artikel d={d} neu={neu} />}
      {reiter === "betriebsmittel" && <Betriebsmittel />}
      {(reiter === "liefer" || reiter === "zahlung") && <Bedingungen d={d} neu={neu} art={reiter} />}
      {reiter === "lager" && <Lager d={d} neu={neu} />}
      {reiter === "arbeitsplan" && <Arbeitsplaene d={d} neu={neu} />}
      {reiter === "nummern" && <Nummernkreise d={d} neu={neu} />}
    </>
  );
}

// ---------- Lieferanten und Kunden ----------
const ANSCHRIFT = [
  { name: "typ", label: "Art", auswahl: [["liefer", "Lieferanschrift"], ["rechnung", "Rechnungsanschrift"]], vorgabe: "liefer" },
  { name: "name", label: "Name" }, { name: "zusatz", label: "Zusatz" }, { name: "strasse", label: "Strasse" },
  { name: "plz", label: "PLZ" }, { name: "ort", label: "Ort" }, { name: "land", label: "Land", vorgabe: "CH" },
  { name: "mail", label: "E-Mail" },
];
const KONTAKT = [
  { name: "name", label: "Name" }, { name: "funktion", label: "Funktion" },
  { name: "telefon", label: "Telefon" }, { name: "mail", label: "E-Mail" },
];

export function partnerBearbeiten(d, neu, art, p) {
  const kunde = art === "kunde";
  const pd = (p && p.daten) || {};
  const bed = (a) => [["", "—"]].concat(d.bedingungen.filter((b) => b.art === a).map((b) => [b.id, b.code + " · " + b.text]));
  const ad = pd.adresse || {};
  formular({
    titel: (kunde ? "Kunde" : "Lieferant") + (p ? " " + p.nr : " neu"),
    gross: true,
    wert: { nr: p ? p.nr : naechstePartnerNr(d, art), name: p ? p.name : "", gruppe: p ? p.gruppe || "" : "",
      strasse: ad.strasse || "", plz: ad.plz || "", ort: ad.ort || "", land: ad.land || "CH",
      telefon: pd.telefon || "", mail: pd.mail || "", webseite: pd.webseite || "",
      liefer: pd.liefer || "", zahlung: pd.zahlung || "", kontakte: pd.kontakte || [], anschriften: pd.anschriften || [],
      rechnung_mail: pd.rechnung_mail || "", sammel: !!pd.sammel, termin_art: pd.termin_art || "datum",
      mwst: pd.mwst ?? "", ust: pd.ust || "", notiz: pd.notiz || "", aktiv: p ? p.aktiv : true },
    felder: [
      { name: "nr", label: (kunde ? "Kunden" : "Lieferanten") + "-Nr. (5-stellig)" },
      { name: "name", label: "Name" },
      { name: "gruppe", label: kunde ? "Kundenart" : "Lieferantenart",
        platzhalter: kunde ? "z.B. Industrie, Medizin, Uhren" : "z.B. Rohmaterial, Werkzeug, Lohnarbeit" },
      { name: "aktiv", label: "Aktiv", typ: "haken" },
      { titel: "Adresse" },
      { name: "strasse", label: "Strasse" }, { name: "plz", label: "PLZ" }, { name: "ort", label: "Ort" },
      { name: "land", label: "Land" }, { name: "telefon", label: "Telefon" }, { name: "mail", label: "E-Mail" },
      { name: "webseite", label: "Webseite", platzhalter: "https://…" }, { name: "ust", label: "UID / USt-IdNr." },
      { name: "kontakte", label: "Ansprechpartner", typ: "liste", felder: KONTAKT, neu: "Ansprechpartner" },
      { name: "anschriften", label: kunde ? "Liefer- und Rechnungsanschriften" : "Lieferanschriften (abweichend)",
        typ: "liste", felder: ANSCHRIFT, neu: "Anschrift" },
      { titel: "Bedingungen" },
      { name: "liefer", label: "Lieferbedingung", auswahl: bed("liefer") },
      { name: "zahlung", label: "Zahlungsbedingung", auswahl: bed("zahlung") },
      kunde && { name: "rechnung_mail", label: "Rechnungsanschrift E-Mail" },
      kunde && { name: "sammel", label: "Sammelrechnung (sonst Einzelrechnung je Lieferschein)", typ: "haken" },
      kunde && { name: "termin_art", label: "Liefertermin als", auswahl: [["datum", "Datum"], ["kw", "Kalenderwoche"]] },
      kunde && { name: "mwst", label: "MWST % (leer = 8.1, Ausland 0)" },
      { name: "notiz", label: "Notiz", typ: "textarea", breit: true },
    ],
    speichern: async (w) => {
      if (!/^\d{5}$/.test(w.nr.trim())) throw new Error("Die Nummer muss 5-stellig sein.");
      if (!w.name.trim()) throw new Error("Name fehlt.");
      const zeile = { art, nr: w.nr.trim(), name: w.name.trim(), gruppe: w.gruppe.trim() || null, aktiv: !!w.aktiv,
        geaendert_am: new Date().toISOString(),
        daten: { adresse: { strasse: w.strasse, plz: w.plz, ort: w.ort, land: w.land }, telefon: w.telefon, mail: w.mail,
          webseite: w.webseite, ust: w.ust, liefer: w.liefer || null, zahlung: w.zahlung || null, kontakte: w.kontakte,
          anschriften: w.anschriften, rechnung_mail: w.rechnung_mail, sammel: !!w.sammel, termin_art: w.termin_art,
          mwst: w.mwst, notiz: w.notiz } };
      if (p) await aendern("erp_partner", p.id, zeile); else await einfuegen("erp_partner", zeile);
      alt.meldung("Gespeichert.", "gut");
      neu();
    },
    loeschen: p ? async () => { await loeschen("erp_partner", p.id); neu(); } : null,
  });
}

function Partner({ d, neu, art }) {
  const [suche, setSuche] = useState("");
  const liste = ohneSuche(suche) ? [] : d.partner.filter((p) => p.art === art).sort((a, b) => a.nr.localeCompare(b.nr))
    .filter((p) => passt(suche, [p.nr, p.name, p.gruppe, JSON.stringify(p.daten)].join(" ")));
  return (
    <>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" data-erp-neu={art} onClick={() => partnerFensterOeffnen(d, neu, null, art)}>
          + {art === "kunde" ? "Kunde" : "Lieferant"}</button>
        <Suche wert={suche} setzen={setSuche} platzhalter="Nr., Name, Ort, Ansprechpartner …" fokus />
      </div>
      <Tabelle kopf={["Nr.", "Name", art === "kunde" ? "Kundenart" : "Lieferantenart", "Ort", "Telefon", "E-Mail", "Links"]}
        leer={ohneSuche(suche) ? sucheLeer(art === "kunde" ? "Kunden" : "Lieferanten") : "Keine " + (art === "kunde" ? "Kunden" : "Lieferanten") + " gefunden."}
        zeilen={liste.map((p) => {
          const pd = p.daten || {}, ad = pd.adresse || {};
          const karte = mapsLink(ad);
          return { key: p.id, klasse: p.aktiv ? "" : "erp-blass", klick: () => partnerFensterOeffnen(d, neu, p),
            zellen: [<b>{p.nr}</b>, p.name, p.gruppe || "", [ad.plz, ad.ort].filter(Boolean).join(" "), pd.telefon || "", pd.mail || "",
              <span className="erp-links" onClick={(e) => e.stopPropagation()}>
                {pd.webseite && <a href={/^https?:/.test(pd.webseite) ? pd.webseite : "https://" + pd.webseite} target="_blank" rel="noreferrer">Web</a>}
                {karte && <a href={karte} target="_blank" rel="noreferrer">Karte</a>}</span>] };
        })} />
    </>
  );
}

// ---------- Artikel ----------
export function artikelBearbeiten(d, neu, art, a, neuerIndex) {
  const kunden = [["", "—"]].concat(d.partner.filter((p) => p.art === "kunde").map((p) => [p.id, p.nr + " " + p.name]));
  const hofer = art === "hofer";
  // Jedem Hofer-Artikel ist ein Rohmaterial-Artikel zugewiesen, meist aus der
  // Kalkulation (Wunsch Patrick 21. November 2026)
  const rohe = [["", "—"]].concat(d.artikel.filter((x) => x.art === "rohmaterial")
    .sort((x, y) => x.nr.localeCompare(y.nr)).map((x) => [x.id, x.nr + (x.bezeichnung && x.bezeichnung !== x.nr ? " · " + x.bezeichnung : "")]));
  formular({
    titel: neuerIndex ? "Neuer Index für " + a.nr : (ARTIKELART[art] + (a ? " " + a.nr : " neu")),
    gross: true,
    wert: a ? { nr: a.nr, idx: neuerIndex ? "" : a.idx, bezeichnung: a.bezeichnung || "", zeichnung: a.zeichnung || "",
      kunde_id: a.kunde_id || "", einheit: a.einheit, preis: a.preis ?? "", aktiv: a.aktiv, notiz: (a.daten || {}).notiz || "",
      kunden_nr: (a.daten || {}).kunden_nr || "", rohmaterial_id: (a.daten || {}).rohmaterial_id || "" }
      : { nr: "", idx: "", bezeichnung: "", zeichnung: "", kunde_id: "", einheit: art === "rohmaterial" ? "kg" : "Stk", preis: "", aktiv: true },
    felder: [
      { name: "nr", label: hofer ? "Artikel-Nr. (xxxxx-xxxx)" : art === "rohmaterial" ? "Artikel-Nr. = Bezeichnung wie im HoferTool" : "Artikel-Nr. wie im HoferTool" },
      hofer && { name: "idx", label: "Index", hinweis: "Pro HOCO Nr. gibt es nur einen Artikel. Der Bestand bleibt je Index getrennt." },
      { name: "bezeichnung", label: "Bezeichnung" },
      hofer && { name: "zeichnung", label: "Zeichnungsnummer" },
      hofer && { name: "kunde_id", label: "Kunde", auswahl: kunden },
      hofer && { name: "kunden_nr", label: "Artikel-Nr. des Kunden" },
      hofer && { name: "rohmaterial_id", label: "Rohmaterial", auswahl: rohe, hinweis: "Kommt beim Anlegen über die Kalkulation mit." },
      { name: "einheit", label: "Einheit", auswahl: [["Stk", "Stk"], ["kg", "kg"], ["m", "m"], ["Stg", "Stangen"]] },
      // Bei Hofer-Artikeln gilt die Preisliste im Artikelfenster
      !hofer && { name: "preis", label: "Einstandspreis CHF" },
      { name: "aktiv", label: "Aktiv", typ: "haken" },
      { name: "notiz", label: "Notiz", typ: "textarea", breit: true },
    ],
    speichern: async (w) => {
      const nr = w.nr.trim();
      if (!nr) throw new Error("Artikel-Nr. fehlt.");
      if (hofer && !HOFER_NR.test(nr)) throw new Error("Hofer + Co Artikel haben die Form xxxxx-xxxx.");
      const zeile = { art, nr, idx: hofer ? w.idx.trim() : "", bezeichnung: w.bezeichnung.trim() || null,
        zeichnung: w.zeichnung ? w.zeichnung.trim() || null : null, kunde_id: w.kunde_id || null, einheit: w.einheit,
        preis: hofer ? (a ? a.preis : null) : w.preis === "" ? null : zahl(w.preis), aktiv: !!w.aktiv, geaendert_am: new Date().toISOString(),
        daten: { ...((a && a.daten) || {}), notiz: w.notiz || "", kunden_nr: w.kunden_nr || "",
          ...(hofer ? { rohmaterial_id: w.rohmaterial_id || null } : {}) } };
      if (a && !neuerIndex) await aendern("erp_artikel", a.id, zeile);
      else await einfuegen("erp_artikel", { ...zeile, arbeitsplan: neuerIndex ? a.arbeitsplan : [],
        kalkulation_id: neuerIndex ? a.kalkulation_id : null });
      alt.meldung("Gespeichert.", "gut");
      neu();
    },
    loeschen: a && !neuerIndex ? async () => { await loeschen("erp_artikel", a.id); neu(); } : null,
  });
}

async function ausHoferTool(art, d, neu) {
  // Hofer + Co: pro HOCO Nr. nur ein Artikel, der Index zählt dafür nicht
  const schl = (x) => art === "hofer" ? x.nr : x.nr + "|" + (x.idx || "");
  const da = new Set(d.artikel.filter((a) => a.art === art).map(schl));
  let neue = [];
  if (art === "werkzeug") {
    const r = await alt.db.from("articles").select("article_number, name, description").limit(5000);
    if (r.error) throw r.error;
    neue = (r.data || []).filter((x) => x.article_number).map((x) => ({ art, nr: x.article_number, idx: "",
      bezeichnung: [x.name, x.description].filter(Boolean).join(" · ") || null, einheit: "Stk" }));
  } else {
    const r = await alt.db.from("hoco_parts").select("hoco_nr, bezeichnung, material").limit(10000);
    if (r.error) throw r.error;
    if (art === "rohmaterial") {
      const mat = [...new Set((r.data || []).map((x) => (x.material || "").trim()).filter(Boolean))];
      neue = mat.map((m) => ({ art, nr: m, idx: "", bezeichnung: m, einheit: "kg" }));
    } else {
      neue = (r.data || []).filter((x) => HOFER_NR.test(x.hoco_nr || "")).map((x) => ({ art, nr: x.hoco_nr, idx: "",
        bezeichnung: x.bezeichnung || null, einheit: "Stk", daten: { material: x.material || "" } }));
    }
  }
  const sicht = new Set();
  neue = neue.filter((x) => { const k = schl(x); if (da.has(k) || sicht.has(k)) return false; sicht.add(k); return true; });
  if (!neue.length) { alt.meldung("Nichts Neues im HoferTool gefunden.", "gut"); return; }
  const ok = await alt.nachfragen({ titel: "Aus HoferTool übernehmen",
    text: alt.zahlText(neue.length) + " " + ARTIKELART[art] + " übernehmen?" + (art === "hofer" ? " Index bleibt leer, bitte bei Bedarf ergänzen." : ""),
    bestaetigen: "Übernehmen" });
  if (!ok) return;
  for (let i = 0; i < neue.length; i += 500) {
    const r = await alt.db.from("erp_artikel").insert(neue.slice(i, i + 500));
    if (r.error) throw r.error;
  }
  alt.meldung(alt.zahlText(neue.length) + " übernommen.", "gut");
  neu();
}

export function Artikel({ d, neu }) {
  const [art, setArt] = useState(gemerkt.artArt);
  const [suche, setSuche] = useState("");
  const [anzahl, setAnzahl] = useState(200);
  gemerkt.artArt = art;
  const best = new Map();
  bestand(d).forEach((e) => best.set(e.artikel_id, (best.get(e.artikel_id) || 0) + e.menge));
  const liste = ohneSuche(suche) ? [] : d.artikel.filter((a) => a.art === art)
    .filter((a) => passt(suche, [a.nr, a.idx, a.bezeichnung, a.zeichnung, (d.partnerMap.get(a.kunde_id) || {}).name].join(" ")))
    .sort((a, b) => a.nr.localeCompare(b.nr) || a.idx.localeCompare(b.idx));
  return (
    <>
      <div className="mat-kopf">
        {Object.entries(ARTIKELART).map(([w, t]) => <button key={w} className={"knopf" + (art === w ? " knopf--haupt" : "")}
          data-erp-artart={w} onClick={() => setArt(w)}>{t}</button>)}
      </div>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" data-erp-neu="artikel" onClick={() => artikelFensterOeffnen(d, neu, null, { art })}>+ Artikel</button>
        <button className="knopf" onClick={() => tun(() => ausHoferTool(art, d, neu))}>Aus HoferTool übernehmen</button>
        <Suche wert={suche} setzen={setSuche} platzhalter="Nr., Bezeichnung, Zeichnung, Kunde …" fokus />
      </div>
      {!ohneSuche(suche) && <p className="klein">{alt.zahlText(liste.length)} Artikel</p>}
      <Tabelle leer={ohneSuche(suche) ? sucheLeer("Artikel") : "Keine Artikel gefunden."} kopf={art === "hofer" ? ["Artikel-Nr.", "Index", "Bezeichnung", "Zeichnung", "Kunde", "Preis", "Bestand", "AP", ""]
        : ["Artikel-Nr.", "Bezeichnung", "Einheit", "Preis", "Bestand"]}
        zeilen={liste.slice(0, anzahl).map((a) => ({ key: a.id, klasse: a.aktiv ? "" : "erp-blass",
          klick: () => artikelFensterOeffnen(d, neu, a),
          zellen: art === "hofer"
            ? [<b>{a.nr}</b>, a.idx || "–", a.bezeichnung || "", a.zeichnung || "", (d.partnerMap.get(a.kunde_id) || {}).name || "",
              a.preis != null ? <>{chf(a.preis)} <small>{peKurz((a.daten || {}).pe)}</small>{((a.daten || {}).preisliste || {}).kalkulation_nr ? <small> · {a.daten.preisliste.kalkulation_nr}</small> : null}</> : "",
              mengeText(best.get(a.id) || 0), (a.arbeitsplan || []).length || "",
              <button className="knopf knopf--klein" title="Neuen Index setzen, der Artikel bleibt derselbe"
                onClick={(e) => { e.stopPropagation(); neuerIndex(d, a, neu); }}>Neuer Index</button>]
            : [<b>{a.nr}</b>, a.bezeichnung || "", a.einheit, a.preis != null ? chf(a.preis) : "", mengeText(best.get(a.id) || 0)] }))} />
      {liste.length > anzahl && <button className="knopf" onClick={() => setAnzahl(anzahl + 200)}>Mehr zeigen</button>}
    </>
  );
}

// ---------- Betriebsmittel und Prüfmittel (aus Kalkulation und QS) ----------
function Betriebsmittel() {
  const { daten, fehler } = useDaten(async () => {
    const r = await alt.db.from("kalk_maschinen").select("*").order("sort").order("name");
    if (r.error) throw r.error;
    return r.data || [];
  }, []);
  if (fehler) return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  return (
    <>
      <p className="klein">Die Maschinen mit Stundensätzen stehen in der Kalkulation und werden dort geändert.
        {" "}<a href="#/kalkulation">Zur Kalkulation</a></p>
      <Tabelle kopf={["Betriebsmittel", "Stundensatz CHF/h", "Rüstsatz CHF/h"]}
        zeilen={daten.map((m) => { const s = stundensatz(m); return { key: m.id, zellen: [<b>{m.name}</b>, chf(s.eff), chf(s.ruest)] }; })} />
    </>
  );
}

// ---------- Nummernkreise ----------
// Fortlaufend je Jahr, das neue Jahr beginnt von selbst bei 1 bzw. beim
// Startwert. Startwerte für den Wechsel vom alten ERP (Wunsch Patrick 25. November 2026).
function Nummernkreise({ d, neu }) {
  const jahr = new Date().getFullYear();
  // Startwert nur fürs laufende Jahr; das nächste Jahr zählt von selbst weiter
  // und wechselt nur das Jahr (seit 1.820.0, Wunsch Patrick 25. November 2026)
  const jahre = [jahr];
  const { daten: kalk } = useDaten(async () => {
    const r = await alt.db.from("kalkulationen").select("nr");
    return r.error ? [] : (r.data || []).map((k) => k.nr);
  }, []);
  const [w, setW] = useState(() => {
    const v = {};
    NUMMERNKREISE.forEach((k) => { v[k.typ] = {}; jahre.forEach((j) => { const s = (d.nummern || {})[k.typ]?.[j]; v[k.typ][j] = s ? String(s) : ""; }); });
    return v;
  });
  const [laeuft, setLaeuft] = useState(false);
  const geaendert = NUMMERNKREISE.some((k) => jahre.some((j) => (w[k.typ][j] || "") !== String((d.nummern || {})[k.typ]?.[j] || "")));
  const vorhandene = (typ) => typ === "kalkulation" ? (kalk || []) : d.belege.filter((b) => b.typ === typ).map((b) => b.nr);
  const speichern = async () => {
    const neuW = { ...(d.nummern || {}) };
    for (const k of NUMMERNKREISE) {
      const e = { ...(neuW[k.typ] || {}) };
      for (const j of jahre) {
        const t = String(w[k.typ][j] || "").replace(/['’\s]/g, "");
        if (!t) { delete e[j]; continue; }
        const n = parseInt(t, 10);
        if (!(n > 0) || String(n) !== t.replace(/^0+/, "")) { alt.meldung(k.name + " " + j + ": nur eine ganze Zahl ab 1.", "warn"); return; }
        if (String(n).length > k.stellen + 2) { alt.meldung(k.name + " " + j + ": Zahl zu gross.", "warn"); return; }
        e[j] = n;
      }
      if (Object.keys(e).length) neuW[k.typ] = e; else delete neuW[k.typ];
    }
    setLaeuft(true);
    await tun(async () => { await nummernSpeichern(neuW); alt.meldung("Nummernkreise gespeichert.", "gut"); neu(); });
    setLaeuft(false);
  };
  return (
    <>
      <p className="klein">Die Nummern laufen fortlaufend weiter, auch über den Jahreswechsel: am 1. Januar ändert nur
        das Jahr vorne, die laufende Nummer geht weiter, wo sie im alten Jahr aufgehört hat (20260145 → 20270146).
        Für den Wechsel vom alten ERP hier den <b>Startwert</b> eintragen: die nächste Nummer ist dann
        mindestens dieser Wert (sind schon höhere vergeben, geht es dort weiter). Leer = ab 1.</p>
      <Tabelle kopf={["Nummernkreis", "Beispiel", ...jahre.map((j) => "Startwert " + j), "Nächste Nummer", "Ab 1. Januar " + (jahr + 1)]}
        zeilen={NUMMERNKREISE.map((k) => ({
          key: k.typ,
          zellen: [<b>{k.name}</b>, <span className="klein">{nummerText(k, jahr, 1)}</span>,
            ...jahre.map((j) => <input key={j} className="erp-nr-start" inputMode="numeric" data-erp-nrstart={k.typ + "-" + j}
              value={w[k.typ][j]} placeholder="1" style={{ width: 90 }}
              onChange={(e) => setW({ ...w, [k.typ]: { ...w[k.typ], [j]: e.target.value } })} />),
            <b data-erp-nrnaechst={k.typ}>{k.typ === "kalkulation" && !kalk ? "…"
              : naechsteNummer({ [k.typ]: { [jahr]: parseInt(w[k.typ][jahr], 10) || 0 } }, k.typ, vorhandene(k.typ), jahr)}</b>,
            <span data-erp-nrfolge={k.typ}>{k.typ === "kalkulation" && !kalk ? "…"
              : naechsteNummer({ [k.typ]: { [jahr]: parseInt(w[k.typ][jahr], 10) || 0 } }, k.typ, vorhandene(k.typ), jahr + 1)}</span>],
        }))} />
      <div className="knopfreihe" style={{ marginTop: 10 }}>
        <button className="knopf knopf--haupt" id="erp-nr-speichern" disabled={!geaendert || laeuft} onClick={speichern}>Speichern</button>
      </div>
    </>
  );
}

// ---------- Bedingungen ----------
function Bedingungen({ d, neu, art }) {
  const liste = d.bedingungen.filter((b) => b.art === art).sort((a, b) => a.code.localeCompare(b.code));
  const bearbeiten = (b) => formular({
    titel: (art === "liefer" ? "Lieferbedingung" : "Zahlungsbedingung") + (b ? " " + b.code : " neu"),
    wert: b ? { code: b.code, text: b.text, tage: b.tage ?? "", skonto_pct: b.skonto_pct ?? "", skonto_tage: b.skonto_tage ?? "" }
      : { code: "", text: "", tage: "", skonto_pct: "", skonto_tage: "" },
    felder: [{ name: "code", label: "Kürzel" }, { name: "text", label: "Text", breit: true },
      art === "zahlung" && { name: "tage", label: "Zahlbar in Tagen (netto)" },
      art === "zahlung" && { name: "skonto_pct", label: "Skonto %" },
      art === "zahlung" && { name: "skonto_tage", label: "Skonto innert Tagen" }],
    speichern: async (w) => {
      if (!w.code.trim() || !w.text.trim()) throw new Error("Kürzel und Text werden benötigt.");
      const n = (x) => (x === "" || x == null ? null : zahl(x));
      const zeile = { art, code: w.code.trim(), text: w.text.trim(), tage: n(w.tage), skonto_pct: n(w.skonto_pct), skonto_tage: n(w.skonto_tage) };
      if (b) await aendern("erp_bedingungen", b.id, zeile); else await einfuegen("erp_bedingungen", zeile);
      neu();
    },
    loeschen: b ? async () => { await loeschen("erp_bedingungen", b.id); neu(); } : null,
  });
  return (
    <>
      <div className="mat-kopf"><button className="knopf knopf--haupt" onClick={() => bearbeiten()}>+ Bedingung</button></div>
      <Tabelle kopf={art === "zahlung" ? ["Kürzel", "Text", "Netto Tage", "Skonto"] : ["Kürzel", "Text"]}
        zeilen={liste.map((b) => ({ key: b.id, klick: () => bearbeiten(b), zellen: art === "zahlung"
          ? [<b>{b.code}</b>, b.text, b.tage ?? "", b.skonto_pct ? b.skonto_pct + " % in " + (b.skonto_tage || "?") + " Tagen" : ""]
          : [<b>{b.code}</b>, b.text] }))} />
    </>
  );
}

// ---------- Lager ----------
// Nur Plätze für Rohmaterial und Werkzeug sind Stammdaten; die der Hofer + Co
// Artikel entstehen beim Buchen (Patrick 25. November 2026)
const stammPlaetze = (d) => d.lager.filter((l) => !istHoferLager(l.lagerart));
const artRang = (l) => { const i = LAGERARTEN.findIndex((a) => a.code === l.lagerart); return i < 0 ? 99 : i; };
function Lager({ d, neu }) {
  const [suche, setSuche] = useState("");
  const platzBearbeiten = (l) => formular({
    titel: "Lagerplatz" + (l ? " " + l.platz : " neu"),
    wert: l ? { lagerart: l.lagerart, platz: l.platz, bezeichnung: l.bezeichnung || "" } : { lagerart: "RM", platz: "", bezeichnung: "" },
    felder: [{ name: "lagerart", label: "Lagerart", auswahl: LAGERARTEN.filter((a) => a.je !== "hofer").map((a) => [a.code, a.code + " · " + a.text])
        .concat(l && !lagerartText(l.lagerart) ? [[l.lagerart, l.lagerart]] : []) },
      { name: "platz", label: "Lagerplatz" }, { name: "bezeichnung", label: "Bezeichnung" }],
    speichern: async (w) => {
      if (!w.lagerart.trim() || !w.platz.trim()) throw new Error("Lagerart und Platz werden benötigt.");
      const z = { lagerart: w.lagerart.trim(), platz: w.platz.trim(), bezeichnung: w.bezeichnung.trim() || null };
      if (l) await aendern("erp_lager", l.id, z); else await einfuegen("erp_lager", z);
      neu();
    },
    loeschen: l ? async () => { await loeschen("erp_lager", l.id); neu(); } : null,
  });
  const korrektur = () => {
    const artikel = d.artikel.filter((a) => a.aktiv).sort((a, b) => a.nr.localeCompare(b.nr));
    formular({
      titel: "Lagerbuchung von Hand (Inventur / Korrektur)",
      wert: { artikel_id: artikel[0] ? artikel[0].id : "", lager_id: "art:FL", platz: "", charge: "", menge: "", notiz: "" },
      felder: [{ name: "artikel_id", label: "Artikel (mit Index)", auswahl: artikel.map((a) => [a.id, ARTIKELART[a.art].slice(0, 5) + " · " + artikelText(a)]) },
        // Hofer + Co Artikel: Lagerart wählen und Platz frei eintippen
        { name: "lager_id", label: "Lager", auswahl: HOFER_LAGERARTEN.map((a) => ["art:" + a.code, a.code + " · " + a.text + " (Platz eintippen)"])
          .concat(stammPlaetze(d).map((l) => [l.id, lagerName(l)])) },
        { name: "platz", label: "Lagerplatz (bei FL, HFL, EXT, SPL)" },
        { name: "charge", label: "Charge" }, { name: "menge", label: "Menge (+ zu, − ab)" },
        { name: "notiz", label: "Grund", breit: true }],
      speichern: async (w) => {
        if (!w.charge.trim() || !zahl(w.menge)) throw new Error("Charge und Menge werden benötigt.");
        const lagerId = String(w.lager_id).startsWith("art:") ? await lagerplatzId(d, w.lager_id.slice(4), w.platz) : (w.lager_id || null);
        await buchen({ artikel_id: w.artikel_id, lager_id: lagerId, charge: w.charge.trim(), menge: zahl(w.menge),
          art: "korrektur", notiz: w.notiz || null, idx: (d.artikelMap.get(w.artikel_id) || {}).idx || "" });
        neu();
      },
    });
  };
  const best = ohneSuche(suche) ? [] : bestand(d).filter((e) => {
    const a = d.artikelMap.get(e.artikel_id) || {};
    const l = d.lagerMap.get(e.lager_id) || {};
    return passt(suche, [a.nr, e.idx, a.bezeichnung, e.charge, l.platz, l.lagerart].join(" "));
  });
  return (
    <>
      <h3>Lagerplätze</h3>
      <div className="mat-kopf"><button className="knopf knopf--haupt" onClick={() => platzBearbeiten()}>+ Lagerplatz</button></div>
      <Tabelle kopf={["Lagerart", "Platz", "Bezeichnung"]} zeilen={stammPlaetze(d).sort((a, b) => (artRang(a) - artRang(b)) || a.platz.localeCompare(b.platz))
        .map((l) => ({ key: l.id, klick: () => platzBearbeiten(l), zellen: [<span><b>{l.lagerart}</b> {lagerartText(l.lagerart)}</span>, <b>{l.platz}</b>, l.bezeichnung || ""] }))} />
      <h3>Bestand nach Charge</h3>
      <div className="mat-kopf">
        <button className="knopf" onClick={korrektur}>Buchung von Hand</button>
        <Suche wert={suche} setzen={setSuche} platzhalter="Artikel, Index, Charge, Platz …" />
      </div>
      <Tabelle kopf={["Artikel", "Index", "Bezeichnung", "Charge", "Lagerart", "Lagerplatz", "Menge"]} leer={ohneSuche(suche) ? sucheLeer("Bestände") : "Kein Bestand gefunden."}
        zeilen={best.map((e) => {
          const a = d.artikelMap.get(e.artikel_id) || {};
          const l = d.lagerMap.get(e.lager_id);
          return { key: e.artikel_id + "|" + e.idx + e.charge + e.lager_id, klasse: e.menge < 0 ? "erp-minus" : "",
            klick: () => umbuchenOeffnen(d, e, neu),
            zellen: [<b>{a.nr}</b>, e.idx || "", a.bezeichnung || "", e.charge, l ? l.lagerart : "–", l ? l.platz : "–", mengeText(e.menge) + " " + (a.einheit || "")] };
        })} />
      <p className="klein">Zeile antippen zum Umbuchen, Zubuchen oder Abbuchen, immer mit Vermerk.</p>
      <h3>Lagerbewegungen</h3>
      <BewegungListe d={d} aussen={neu} />
    </>
  );
}

// ---------- Arbeitspläne ----------
export { AG_FELDER };

export function arbeitsplanBearbeiten(a, neu) {
  fensterOeffnen((zu) => <ApFenster a={a} neu={neu} zu={zu} />);
}

function ApFenster({ a, neu, zu }) {
  const [ap, setAp] = useState((a.arbeitsplan || []).map((x) => ({ ...x })));
  return (
    <div className="dialog erp-fenster erp-fenster--gross" role="dialog">
      <h2>Arbeitsplan {artikelText(a)}</h2>
      <p className="klein">Die Fertigungsaufträge übernehmen diesen Arbeitsplan. Angelegt meist aus der Kalkulation.</p>
      <Feld f={{ name: "ap", label: "Arbeitsgänge", typ: "liste", felder: AG_FELDER, neu: "Arbeitsgang" }} wert={ap} setzen={setAp} />
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" onClick={async () => {
          const r = await tun(() => aendern("erp_artikel", a.id, { arbeitsplan: ap.map((x, i) => ({ ...x, pos: (i + 1) * 10 })),
            geaendert_am: new Date().toISOString() }), "Arbeitsplan gespeichert.");
          if (r !== null) { neu(); zu(); }
        }}>Speichern</button>
      </div>
    </div>
  );
}

function Arbeitsplaene({ d, neu }) {
  const [suche, setSuche] = useState("");
  const liste = d.artikel.filter((a) => a.art === "hofer" && ((a.arbeitsplan || []).length || suche))
    .filter((a) => passt(suche, [a.nr, a.idx, a.bezeichnung].join(" "))).sort((a, b) => a.nr.localeCompare(b.nr)).slice(0, 300);
  return (
    <>
      <div className="mat-kopf"><Suche wert={suche} setzen={setSuche} platzhalter="Artikel suchen, um einen Arbeitsplan anzulegen …" /></div>
      <Tabelle kopf={["Artikel", "Index", "Bezeichnung", "Arbeitsgänge", "Aus Kalkulation"]}
        leer="Noch keine Arbeitspläne. In der offenen Kalkulation „Artikel und Arbeitsplan übernehmen“ oder hier einen Artikel suchen."
        zeilen={liste.map((a) => ({ key: a.id, klick: () => artikelFensterOeffnen(d, neu, a, { reiter: "arbeitsplan" }),
          zellen: [<b>{a.nr}</b>, a.idx || "–", a.bezeichnung || "", (a.arbeitsplan || []).map((x) => x.bez).join(" → "), a.kalkulation_id ? "ja" : ""] }))} />
    </>
  );
}
