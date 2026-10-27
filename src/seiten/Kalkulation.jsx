// =================================================================
//  KALKULATION (seit 1.214.0, Wunsch Patrick 27. Oktober 2026: „ein
//  Testprogramm … im HoferTool einbauen, nur für Patrick Ruch“)
//
//  Wie das Kalkulationsmodul im Gewatec: Kopfdaten, Material,
//  Arbeitsgänge an Maschinen mit Stundensatz, Preis, Ergebnis als
//  Protokoll und das Angebot als PDF. Anders als im Gewatec beliebig
//  viele Staffelmengen (Wunsch Patrick), jede rechnet für sich.
//  Gerechnet wird in src/daten/kalkulation.js. Sichtbar nur mit dem
//  Vermerk kalkulationSehen am Konto, auch in der Datenbank.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { ZiehListe } from "../teile/ZiehListe.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import {
  z, chf, stundensatz, staffelRechnen, leereKalkulation, kalkulationenLaden, maschinenLaden,
  kalkulationSpeichern, maschineSpeichern, naechsteNr, BEISPIEL_MASCHINEN, beispielKalkulation,
} from "../daten/kalkulation.js";

const REITER = [
  ["kopf", "Kopfdaten"], ["material", "Staffeln und Material"], ["ags", "Arbeitsgänge"],
  ["preis", "Preis"], ["ergebnis", "Ergebnis"], ["angebot", "Angebot"],
];

// Offene Kalkulation und Reiter bleiben beim Seitenwechsel und Neuladen
const gemerkt = { offen: null, reiter: "kopf", saetze: false };
teilMerken("kalkulation", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

// Escape: aus der Kalkulation oder den Stundensätzen zurück zur Liste
let zurueckFn = null;
export function kalkulationZurueck() { return zurueckFn ? zurueckFn() : false; }

export default function Kalkulation({ auffrischen }) {
  const [offen, setOffen] = useState(gemerkt.offen);
  const [saetze, setSaetze] = useState(gemerkt.saetze);
  useGemerkt(gemerkt, { offen, saetze });
  const liste = useDaten(kalkulationenLaden, [auffrischen]);
  const masch = useDaten(maschinenLaden, [auffrischen]);

  zurueckFn = () => {
    if (offen || saetze) { setOffen(null); setSaetze(false); return true; }
    return false;
  };
  useEffect(() => () => { zurueckFn = null; }, []);

  useSeitenSuche({
    name: "Kalkulation", platzhalter: "Nummer, Kunde oder Artikel …",
    eintraege: () => (liste.daten || []).map((k) => ({
      gruppe: "Kalkulationen", zeichen: "∑", titel: (k.nr || "ohne Nr.") + " · " + (k.kunde || "ohne Kunde"),
      zeile: [k.artikel, k.daten && k.daten.kopf && k.daten.kopf.bezeichnung].filter(Boolean).join(" · "), id: k.id })),
    springen: (x) => { setSaetze(false); setOffen(x.id); },
  });

  const fehler = liste.fehler || masch.fehler;
  if (fehler && (!liste.daten || !masch.daten)) {
    return <><h1 className="seitentitel">Kalkulation</h1>
      <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  }
  if (!liste.daten || !masch.daten) {
    return <><h1 className="seitentitel">Kalkulation</h1><div className="laedt">Wird geladen …</div></>;
  }

  if (saetze) {
    return <Stundensaetze maschinen={masch.daten} neu={masch.neu} zurueck={() => setSaetze(false)} />;
  }
  const eintrag = offen && liste.daten.find((k) => k.id === offen);
  if (eintrag) {
    return <Bearbeiten key={eintrag.id} eintrag={eintrag} maschinen={masch.daten}
      zurueck={() => { setOffen(null); liste.neu(); }} neu={liste.neu} oeffnen={setOffen} liste={liste.daten} />;
  }
  return <Liste liste={liste.daten} maschinen={masch.daten} oeffnen={setOffen}
    neu={() => { liste.neu(); masch.neu(); }} saetze={() => setSaetze(true)} />;
}

// ---------- Liste aller Kalkulationen ----------
function Liste({ liste, maschinen, oeffnen, neu, saetze }) {
  const [laeuft, setLaeuft] = useState(false);

  async function anlegen(beispiel) {
    setLaeuft(true);
    try {
      let daten = leereKalkulation();
      let masch = maschinen;
      if (beispiel) {
        // Die Stundensätze aus dem Gewatec-Beispiel anlegen, soweit sie fehlen
        for (const m of BEISPIEL_MASCHINEN) {
          if (!masch.some((x) => x.name === m.name)) await maschineSpeichern(m);
        }
        masch = await maschinenLaden();
        daten = beispielKalkulation(masch);
      }
      const id = await kalkulationSpeichern({ nr: beispiel ? "20225174" : naechsteNr(liste), daten });
      neu();
      oeffnen(id);
      gemerkt.reiter = beispiel ? "ergebnis" : "kopf";
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  }

  return (
    <>
      <h1 className="seitentitel">Kalkulation</h1>
      <div className="kalk-knoepfe">
        <button className="knopf knopf--haupt" id="kalk-neu" disabled={laeuft} onClick={() => anlegen(false)}>+ Neue Kalkulation</button>
        <button className="knopf" id="kalk-saetze" onClick={saetze}>Stundensätze der Maschinen ({maschinen.length})</button>
        {!liste.some((k) => k.nr === "20225174") &&
          <button className="knopf" id="kalk-beispiel" disabled={laeuft} onClick={() => anlegen(true)}>Beispiel aus Gewatec anlegen</button>}
      </div>
      {!liste.length
        ? <div className="karte karte--hinweis"><p>Noch keine Kalkulation. Mit „Beispiel aus Gewatec anlegen“ kommt die
            Kalkulation 20225174 mit allen Zahlen herein, zum Vergleichen mit dem Gewatec.</p></div>
        : <section className="karte kalk-rolle">
            <table className="tabelle kalk-liste">
              <thead><tr><th>Nr.</th><th>Kunde</th><th>Artikel</th><th>Staffeln</th><th className="rechts">Preis</th><th>Geändert</th></tr></thead>
              <tbody>
                {liste.map((k) => {
                  const d = k.daten || {};
                  const staffeln = (d.staffeln || []).filter((s) => z(s.menge) > 0);
                  const erste = staffeln.length ? staffelRechnen(d, staffeln[0], maschinen) : null;
                  return (
                    <tr key={k.id} data-kalk={k.id} className="kalk-liste__zeile" onClick={() => oeffnen(k.id)}>
                      <td><b>{k.nr || "–"}</b></td>
                      <td>{k.kunde || "–"}</td>
                      <td>{k.artikel || ""}{d.kopf && d.kopf.bezeichnung ? <span className="kalk-klein">{d.kopf.bezeichnung}</span> : null}</td>
                      <td>{staffeln.map((s) => chf(z(s.menge), 0)).join(" / ")}</td>
                      <td className="rechts">{erste ? chf(erste.angebot) : "–"}</td>
                      <td>{alt.datumZeitKurz ? alt.datumZeitKurz(k.geaendert_am) : ""}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </section>}
      <p className="hinweis">Testprogramm, nur für dich sichtbar. Gerechnet wird genau wie im Gewatec,
        aber mit beliebig vielen Staffelmengen.</p>
    </>
  );
}

// ---------- Eine Kalkulation bearbeiten ----------
function Bearbeiten({ eintrag, maschinen, zurueck, neu, oeffnen, liste }) {
  const [nr, setNr] = useState(eintrag.nr || "");
  const [k, setK] = useState(() => mitVorgaben(eintrag.daten));
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [stand, setStand] = useState("gespeichert");
  useGemerkt(gemerkt, { reiter });

  // Von selbst speichern, eine Sekunde nach der letzten Eingabe
  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) { erstes.current = false; return; }
    setStand("ungespeichert");
    const t = setTimeout(async () => {
      setStand("speichert");
      try { await kalkulationSpeichern({ id: eintrag.id, nr, daten: k }); setStand("gespeichert"); neu(); }
      catch (f) { setStand("fehler"); alt.meldung(alt.fehlertext(f), "fehler"); }
    }, 1000);
    return () => clearTimeout(t);
  }, [k, nr]);

  // Ein Feld irgendwo in der Kalkulation ändern: setze("kopf.kunde", wert)
  const setze = (pfad, wert) => setK((alt0) => {
    const neu0 = structuredClone(alt0);
    const teile = pfad.split(".");
    let o = neu0;
    teile.slice(0, -1).forEach((t) => { o = o[t]; });
    o[teile[teile.length - 1]] = wert;
    return neu0;
  });

  const staffeln = k.staffeln.filter((s) => z(s.menge) > 0);
  const rechnung = staffeln.map((s) => staffelRechnen(k, s, maschinen));

  async function kopieren() {
    try {
      const id = await kalkulationSpeichern({ nr: naechsteNr(liste), daten: structuredClone(k) });
      alt.meldung("Kopie angelegt.", "gut");
      neu(); oeffnen(id);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function loeschen() {
    const weg = await alt.loeschen({ titel: "Kalkulation löschen?", text: "Kalkulation " + (nr || "") + " wird gelöscht.",
      tabelle: "kalkulationen", id: eintrag.id, rueckText: "Kalkulation löschen" });
    if (weg) zurueck();
  }

  const Inhalt = { kopf: Kopf, material: Material, ags: Arbeitsgaenge, preis: Preis, ergebnis: Ergebnis, angebot: Angebot }[reiter] || Kopf;
  return (
    <>
      <button className="knopf knopf--klein kalk-zurueck" id="kalk-zurueck" onClick={zurueck}>← Alle Kalkulationen</button>
      <div className="kalk-kopf">
        <div>
          <h1 className="seitentitel">Kalkulation {nr}</h1>
          <div className="kalk-kopf__unter">{[k.kopf.kunde, k.kopf.artikel, k.kopf.bezeichnung].filter(Boolean).join(" · ") || "Noch ohne Kunde und Artikel"}</div>
        </div>
        <div className="kalk-kopf__rechts">
          <span className={"kalk-stand kalk-stand--" + stand} id="kalk-stand">
            {{ gespeichert: "Gespeichert", ungespeichert: "Wird gleich gespeichert …", speichert: "Speichert …", fehler: "Nicht gespeichert" }[stand]}
          </span>
          <button className="knopf knopf--klein" id="kalk-kopieren" onClick={kopieren}>Kopieren</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" id="kalk-loeschen" onClick={loeschen}>Löschen</button>
        </div>
      </div>

      {/* Immer sichtbar: was jede Staffel kostet */}
      <div className="kalk-band" id="kalk-band">
        {rechnung.length ? rechnung.map((r, i) => (
          <div className="kalk-band__staffel" key={i} data-staffel={i}>
            <span>{chf(r.menge, 0)} Stk</span>
            <b>{chf(r.angebot)}</b>
            <small>Selbstkosten {chf(r.selbst, 4)} · DB {chf(r.dbPct, 1)} %</small>
          </div>)) : <div className="kalk-band__leer">Noch keine Staffelmenge</div>}
      </div>

      <Reiter reiter={REITER} aktiv={reiter} waehlen={setReiter} merkmal="kalk-reiter" />
      <Uebergang key={reiter}>
        <div id="kalk-inhalt">
          <Inhalt k={k} setze={setze} setK={setK} nr={nr} setNr={setNr} maschinen={maschinen} rechnung={rechnung} />
        </div>
      </Uebergang>
    </>
  );
}

// Ältere oder unvollständige Daten mit den Feldern einer neuen ergänzen
function mitVorgaben(d) {
  const leer = leereKalkulation();
  const x = structuredClone(d || {});
  for (const t of ["kopf", "material", "preis", "angebot"]) x[t] = { ...leer[t], ...(x[t] || {}) };
  if (!Array.isArray(x.staffeln)) x.staffeln = leer.staffeln;
  if (!Array.isArray(x.ags)) x.ags = [];
  return x;
}

// Ein Eingabefeld; Zahlen als Text, damit Komma und Apostroph gehen
function F({ label, wert, setzen, einheit, id, text, mehrzeilig, hinweis, typ, platz }) {
  return (
    <label className="feld kalk-feld">
      <span>{label}{einheit ? <em> {einheit}</em> : null}</span>
      {mehrzeilig
        ? <textarea id={id} rows={3} value={wert || ""} onChange={(e) => setzen(e.target.value)} />
        : <input id={id} type={typ || "text"} inputMode={text || typ ? undefined : "decimal"} value={wert == null ? "" : wert}
            placeholder={platz} onChange={(e) => setzen(e.target.value)} />}
      {hinweis ? <span className="feldhinweis">{hinweis}</span> : null}
    </label>
  );
}

function Kopf({ k, setze, nr, setNr }) {
  const f = (name) => ({ wert: k.kopf[name], setzen: (w) => setze("kopf." + name, w) });
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Kunde und Artikel</h2>
        <F label="Kalkulation Nr." id="kalk-nr" text wert={nr} setzen={setNr} />
        <F label="Kunde" id="kalk-kunde" text {...f("kunde")} />
        <F label="Adresse" id="kalk-adresse" mehrzeilig {...f("adresse")} />
        <div className="kalk-reihe">
          <F label="Artikel-Code" id="kalk-artikel" text {...f("artikel")} />
          <F label="Zeichnung" id="kalk-zeichnung" text {...f("zeichnung")} />
          <F label="Index" id="kalk-index" text {...f("index")} />
        </div>
        <F label="Teilebezeichnung" id="kalk-bez" text {...f("bezeichnung")} />
      </section>
      <section className="karte">
        <h2>Anfrage und Bearbeitung</h2>
        <F label="Anfrage vom" id="kalk-anfrage" typ="date" {...f("anfrage")} />
        <F label="Ihr Zeichen" id="kalk-zeichen" text {...f("zeichen")} />
        <F label="Sachbearbeiter" id="kalk-sb" text {...f("sachbearbeiter")} platz={alt.personName ? "" : ""} />
      </section>
    </div>
  );
}

function Material({ k, setze, setK, rechnung }) {
  const m = k.material;
  const f = (name) => ({ wert: m[name], setzen: (w) => setze("material." + name, w) });
  const r0 = rechnung[0];
  return (
    <>
      <section className="karte">
        <div className="karte__kopf"><h2>Staffelmengen</h2></div>
        <p className="hinweis kalk-hinweis-oben">Jede Menge rechnet für sich. Lose: wie oft gerüstet wird, das zweite und
          jedes weitere Los mit der Zeit „Folgerüsten“.</p>
        <div className="kalk-staffeln" id="kalk-staffeln">
          {k.staffeln.map((s, i) => (
            <div className="kalk-staffel" key={i} data-staffel-zeile={i}>
              <F label={"Menge " + (i + 1)} einheit="Stk" id={"kalk-menge-" + i} wert={s.menge} setzen={(w) => setze("staffeln." + i + ".menge", w)} />
              <F label="Lose" id={"kalk-lose-" + i} wert={s.lose} setzen={(w) => setze("staffeln." + i + ".lose", w)} />
              {k.staffeln.length > 1 &&
                <button className="linkknopf linkknopf--gefahr" data-staffel-weg={i} title="Staffel entfernen"
                  onClick={() => setK((x) => ({ ...x, staffeln: x.staffeln.filter((_, j) => j !== i) }))}>Entfernen</button>}
            </div>))}
        </div>
        <button className="knopf knopf--klein" id="kalk-staffel-neu"
          onClick={() => setK((x) => ({ ...x, staffeln: [...x.staffeln, { menge: "", lose: "1" }] }))}>+ Staffel</button>
      </section>

      <section className="karte">
        <h2>Material</h2>
        <div className="kalk-reihe">
          <F label="Materialbezeichnung" id="kalk-mat" text {...f("bez")} />
          <F label="Werkstoff-Nr." id="kalk-matnr" text {...f("nr")} />
        </div>
        <div className="kalk-reihe">
          <F label="Materialpreis" einheit="CHF/kg" id="kalk-matpreis" {...f("preis")} />
          <F label="Material-Gemeinkosten" einheit="%" id="kalk-matgk" {...f("gk")} />
        </div>
        <div className="moduswahl kalk-modus">
          {[["hand", "Einsatzgewicht je Stück eintragen"], ["rechnen", "Aus Länge und Stangen rechnen"]].map(([w, t]) => (
            <button key={w} className={"moduswahl__knopf" + (m.modus === w ? " aktiv" : "")} data-matmodus={w}
              onClick={() => setze("material.modus", w)}>{t}</button>))}
        </div>
        {m.modus === "rechnen"
          ? <div className="kalk-reihe">
              <F label="Ø" einheit="mm" id="kalk-d" {...f("d")} />
              <F label="Länge je Teil mit Abstich" einheit="mm" id="kalk-laenge" {...f("laenge")} />
              <F label="Stange" einheit="mm" id="kalk-stange" {...f("stange")} />
              <F label="Reststück" einheit="mm" id="kalk-rest" {...f("rest")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>
          : <div className="kalk-reihe">
              <F label="Materialeinsatz" einheit="kg/Stk" id="kalk-einsatz" {...f("einsatz")} />
              <F label="Ø für Meter und Stangen" einheit="mm" id="kalk-d" {...f("d")} />
              <F label="Stange" einheit="mm" id="kalk-stange" {...f("stange")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>}
      </section>

      {rechnung.length > 0 &&
        <section className="karte kalk-rolle">
          <table className="tabelle kalk-tab" id="kalk-mat-tab">
            <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)}</th>)}</tr></thead>
            <tbody>
              <Zeile titel="kg gesamt" werte={rechnung.map((r) => chf(r.mat.kg, 1))} />
              <Zeile titel="Meter gesamt" werte={rechnung.map((r) => chf(r.mat.meter, 1))} />
              <Zeile titel="Stangen" werte={rechnung.map((r) => chf(r.mat.stangen, m.modus === "rechnen" ? 0 : 1))} />
              <Zeile titel="kg je Stück" werte={rechnung.map((r) => chf(r.mat.kgJeStk, 4))} />
              <Zeile titel="Materialkosten gesamt" einheit="CHF" werte={rechnung.map((r) => chf(r.mat.kosten))} />
              <Zeile titel="Material je Stück" einheit="CHF" fett werte={rechnung.map((r) => chf(r.matStk, 4))} />
            </tbody>
          </table>
          {r0 && r0.mat.kgJeM > 0 && <p className="hinweis">{chf(r0.mat.kgJeM, 3)} kg je Meter Stange.</p>}
        </section>}
    </>
  );
}

function Zeile({ titel, einheit, werte, fett, klein }) {
  return (
    <tr className={(fett ? "kalk-fett" : "") + (klein ? " kalk-blass" : "")}>
      <td>{titel}{einheit ? <span className="kalk-einheit"> {einheit}</span> : null}</td>
      {werte.map((w, i) => <td key={i} className="rechts">{w}</td>)}
    </tr>
  );
}

function Arbeitsgaenge({ k, setze, setK, maschinen, rechnung }) {
  const r0 = rechnung[0];
  const neu = (art) => setK((x) => ({ ...x, ags: [...x.ags, art === "extern"
    ? { key: schluessel(), bez: "", art: "extern", extern: "", externRuest: "" }
    : { key: schluessel(), bez: "", art: "intern", masch: (maschinen[0] || {}).id || "", te: "", erst: "", folge: "", fgk: "" }] }));
  // Jeder Arbeitsgang braucht einen festen Schlüssel fürs Ziehen
  const ags = k.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));

  return (
    <>
      {!maschinen.length && <div className="karte karte--hinweis"><p>Noch keine Stundensätze. Zuerst unter
        „Alle Kalkulationen“ → „Stundensätze der Maschinen“ eine Maschine anlegen.</p></div>}
      <ZiehListe id="kalk-ags" className="kalk-ags" darf={true}
        ordnen={(reihe) => setK((x) => {
          const mit = x.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));
          return { ...x, ags: reihe.map((key) => mit.find((a) => a.key === key)).filter(Boolean) };
        })}
        eintraege={ags.map((a, i) => {
          const r = r0 && r0.ags[i];
          const f = (name) => ({ wert: a[name], setzen: (w) => setze("ags." + i + "." + name, w) });
          return { key: a.key, inhalt:
            <div className={"kalk-ag" + (a.art === "extern" ? " kalk-ag--extern" : "")} data-ag={i}
              onPointerDown={(e) => { if (e.target.closest("input, select, textarea, button")) e.stopPropagation(); }}>
              <div className="kalk-ag__kopf">
                <span className="kalk-ag__pos">{(i + 1) * 10}</span>
                <input className="kalk-ag__bez" id={"kalk-ag-bez-" + i} value={a.bez} placeholder="Arbeitsgang wählen oder schreiben"
                  list={a.art === "extern" ? "kalk-ag-vorlagen-extern" : "kalk-ag-vorlagen"}
                  onChange={(e) => setze("ags." + i + ".bez", e.target.value)} />
                <span className="kalk-ag__art">{a.art === "extern" ? "Extern" : "Intern"}</span>
                <b className="kalk-ag__summe" title="Kosten je Stück bei der ersten Staffel">{r ? chf(r.kosten / r0.menge, 4) : "–"}</b>
                <button className="linkknopf linkknopf--gefahr" data-ag-weg={i}
                  onClick={() => setK((x) => ({ ...x, ags: x.ags.filter((_, j) => j !== i) }))}>Entfernen</button>
              </div>
              {a.art === "extern"
                ? <div className="kalk-reihe">
                    <F label="Lieferant" id={"kalk-ag-lief-" + i} text {...f("lieferant")} />
                    <label className="feld kalk-feld"><span>Kostensatz je</span>
                      <select id={"kalk-ag-je-" + i} value={a.je || "stk"} onChange={(e) => setze("ags." + i + ".je", e.target.value)}>
                        <option value="stk">Stück</option><option value="kg">kg</option>
                      </select>
                    </label>
                    <F label="Kostensatz" einheit={a.je === "kg" ? "CHF/kg" : "CHF/Stk"} id={"kalk-ag-ext-" + i} {...f("extern")} />
                    {a.je === "kg" && <F label="Gewicht je Stück" einheit="kg" id={"kalk-ag-kg-" + i} {...f("kgStk")}
                      platz={k.material.einsatz || ""} hinweis="Leer = Materialeinsatz je Stück" />}
                    <F label="Rüsten pauschal" einheit="CHF" id={"kalk-ag-extr-" + i} {...f("externRuest")} />
                  </div>
                : <div className="kalk-reihe">
                    <label className="feld kalk-feld"><span>Maschine</span>
                      <select id={"kalk-ag-m-" + i} value={a.masch || ""} onChange={(e) => setze("ags." + i + ".masch", e.target.value)}>
                        <option value="">– wählen –</option>
                        {maschinen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      {r && r.satz && <span className="feldhinweis">{chf(r.satz.eff)} CHF/h{r.satz.lauf ? " bei " + chf(r.satz.lauf, 1) + " Std/Tag" : ""}, Rüsten {chf(r.satz.ruest)} CHF/h</span>}
                    </label>
                    <F label="Laufzeit" einheit="Std/Tag" id={"kalk-ag-lt-" + i} {...f("laufTag")}
                      platz={(() => { const mm = maschinen.find((q) => q.id === a.masch); return mm && mm.daten && mm.daten.laufTag ? String(mm.daten.laufTag) : ""; })()} />
                    <F label="Stückzeit" einheit="Sek." id={"kalk-ag-te-" + i} {...f("te")} />
                    <F label="Erstrüsten" einheit="Std" id={"kalk-ag-er-" + i} {...f("erst")} />
                    <F label="Folgerüsten" einheit="Std" id={"kalk-ag-fr-" + i} {...f("folge")} />
                    <F label="FGK" einheit="%" id={"kalk-ag-fgk-" + i} {...f("fgk")} />
                  </div>}
              {r && !r.extern && (r.laufH > 0 || r.ruestChf > 0) &&
                <div className="kalk-ag__fuss">Fix {chf(r.fix / r0.menge, 4)} · Variabel {chf(r.var / r0.menge, 4)}
                  {" "}· Laufzeit {chf(r.laufH, 1)} h · Rüsten {chf(r.ruestChf)} CHF bei {chf(r0.menge, 0)} Stk</div>}
            </div> };
        })} />
      <datalist id="kalk-ag-vorlagen">{AG_VORLAGEN.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="kalk-ag-vorlagen-extern">{AG_VORLAGEN_EXTERN.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="kalk-knoepfe">
        <button className="knopf" id="kalk-ag-intern" onClick={() => neu("intern")}>+ Interner Arbeitsgang</button>
        <button className="knopf" id="kalk-ag-extern" onClick={() => neu("extern")}>+ Externer Arbeitsgang</button>
      </div>
      <p className="hinweis">Kosten = (Laufzeit × Stundensatz + Rüstzeit × Rüstsatz) × (1 + FGK). Am Griff links ziehen, um die Reihenfolge zu ändern.</p>
    </>
  );
}

const LAUFZEITEN = [8, 10, 12, 14, 16, 18, 20, 22, 24];

// Arbeitsgänge zur Auswahl, wie „Arbeitsgänge-Auswahl“ im Gewatec
// (Bildschirmfoto Patrick 27. Oktober 2026); freier Text geht auch
const AG_VORLAGEN = [
  "Material bereitstellen", "Maschine einrichten", "Erstteilprüfung", "Drehen komplett", "Waschen fettfrei",
  "Zwischenkontrolle", "Endkontrolle", "Versand/Einlagern", "100% auf Butzen kontrollieren", "Bohrung entgraten",
  "Bürsten", "Entgraten", "Fräskante entgraten", "Fremdteile und Späne entfernen", "Gewindesicherung auftragen",
  "Montieren", "Polieren", "Teile abpacken", "Querbohrung von Hand entgraten", "Sichtprüfung auf Blasenbildung (Nickel)",
  "Teile beschriften nach Zeichnung",
];
const AG_VORLAGEN_EXTERN = [
  "Einkauf Handelsteil", "ALTEF40 my", "Brünieren", "Chemisch-Vernickeln", "Elektropolieren", "Eloxieren", "Endurisieren",
  "Geomet 500", "Gleitlackbeschichten", "Harteloxieren", "Nickel-Achrolyte", "Verchromen", "Vergolden", "Vernickeln",
  "Verzinken", "Zink-Phosphatieren", "Bearbeiten nach Zeichnung", "Schleifen nach Zeichnung",
  "Centerless-Durchgangsschleifen nach Zeichnung", "Centerless-Einstechschleifen nach Zeichnung",
  "Richten und Schleifen nach Zeichnung", "Verzahnen nach Zeichnung", "Glasperlen", "Keramikperlenstrahlen",
  "Kugelstrahlen", "Polieren", "Honen", "Trowalisieren", "Sandstrahlen", "Chemisch entgraten", "Montieren nach Zeichnung",
  "Laserbeschriften", "Prägen nach Zeichnung", "Drehen nach Zeichnung", "Reinigen", "Beschichten gemäss Zeichnung",
  "Carbonitrieren < 0.4mm", "Einsatzhärten", "Einsatzhärten und Anlassen", "Einsatzhärten und Brünieren",
  "Glühen gemäss Zeichnung", "Härten und einölen", "Härten und Anlassen", "Härten und Entspannen", "Härten und Richten",
  "Induktiv Härten", "Karbonitrieren und Kugelstrahlen", "Nitrieren gemäss Zeichnung", "Nitrokarburieren",
  "Partiell Hf-Härten + Brünieren", "Plasma-Nitrieren gemäss Zeichnung", "Spannungsfrei glühen", "Tenifer Ma-Nikox",
  "Teniferieren gemäss Zeichnung", "Vakuumglühen", "Vergüten + Anlassen", "Vergüten und Brünieren",
];

let zaehler = 0;
function schluessel() { return "ag" + Date.now().toString(36) + (zaehler++); }

function Preis({ k, setze }) {
  const f = (name) => ({ wert: k.preis[name], setzen: (w) => setze("preis." + name, w) });
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Zuschläge</h2>
        <F label="Vw/Vt-Gemeinkosten" einheit="%" id="kalk-vwgk" {...f("vwgk")} />
        <div className="kalk-reihe">
          <F label="Transport" einheit="CHF/Stk" id="kalk-transport" {...f("transport")} />
          <F label="Verpackung" einheit="CHF/Stk" id="kalk-verpackung" {...f("verpackung")} />
        </div>
        <F label="Gewinn" einheit="%" id="kalk-gewinn" {...f("gewinn")} />
      </section>
      <section className="karte">
        <h2>Abzüge und Rundung</h2>
        <div className="kalk-reihe">
          <F label="Provision" einheit="%" id="kalk-prov" {...f("prov")} />
          <F label="Skonto" einheit="%" id="kalk-skonto" {...f("skonto")} />
          <F label="Rabatt" einheit="%" id="kalk-rabatt" {...f("rabatt")} />
        </div>
        <label className="feld kalk-feld"><span>Angebotspreis runden auf</span>
          <select id="kalk-rundung" value={k.preis.rundung || "0.01"} onChange={(e) => setze("preis.rundung", e.target.value)}>
            <option value="0.01">1 Rappen</option><option value="0.05">5 Rappen</option>
            <option value="0.1">10 Rappen</option><option value="1">1 Franken</option>
          </select>
        </label>
        <p className="hinweis">Verkaufspreis = (Selbstkosten + Transport + Verpackung) × (1 + Gewinn) ÷ (1 − Provision − Skonto − Rabatt).</p>
      </section>
    </div>
  );
}

// Wie der Knopf „Protokoll“ im Gewatec, mit einer Spalte je Staffel
function Ergebnis({ k, rechnung }) {
  if (!rechnung.length) return <div className="karte karte--hinweis"><p>Zuerst eine Staffelmenge eintragen.</p></div>;
  const R = (f, st) => rechnung.map((r) => chf(f(r), st));
  return (
    <section className="karte kalk-rolle">
      <table className="tabelle kalk-tab kalk-protokoll" id="kalk-protokoll">
        <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)} Stk<br /><small>{r.lose} {r.lose === 1 ? "Los" : "Lose"}</small></th>)}</tr></thead>
        <tbody>
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Material</td></tr>
          <Zeile titel="kg gesamt" werte={R((r) => r.mat.kg, 1)} klein />
          <Zeile titel="Materialkosten" einheit="CHF" werte={R((r) => r.mat.kosten)} />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Fertigung, ganze Menge in CHF</td></tr>
          {(k.ags || []).map((ag, i) => (
            <Zeile key={i} titel={ag.bez || (ag.art === "extern" ? "Extern" : "Arbeitsgang " + (i + 1))}
              werte={R((r) => r.ags[i].kosten)} />))}
          <Zeile titel="Laufzeit" einheit="h" werte={R((r) => r.laufH, 1)} klein />
          <Zeile titel="Rüsten ohne FGK" einheit="CHF" werte={R((r) => r.ruestStk * r.menge)} klein />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Je Stück in CHF</td></tr>
          <Zeile titel="Material" werte={R((r) => r.matStk, 4)} />
          <Zeile titel="Fertigung intern" werte={R((r) => r.internStk, 4)} />
          <Zeile titel="Fertigung extern" werte={R((r) => r.externStk, 4)} />
          <Zeile titel="Herstellkosten" werte={R((r) => r.herstell, 4)} fett />
          <Zeile titel="Selbstkosten" werte={R((r) => r.selbst, 4)} />
          <Zeile titel="Transport und Verpackung" werte={R((r) => r.fracht, 4)} klein />
          <Zeile titel="Verkaufspreis" werte={R((r) => r.vk, 4)} />
          <tr className="kalk-fett kalk-hervor"><td>Angebotspreis</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebot)}</td>)}</tr>
          <Zeile titel="Grenzkosten" werte={R((r) => r.grenz, 4)} klein />
          <Zeile titel="Deckungsbeitrag" werte={R((r) => r.db, 4)} />
          <Zeile titel="Deckungsbeitrag" einheit="%" werte={R((r) => r.dbPct, 1)} />
          <Zeile titel="Materialanteil" einheit="%" werte={R((r) => (r.angebot > 0 ? r.matStk / r.angebot * 100 : 0), 1)} klein />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Auftrag</td></tr>
          <Zeile titel="Gewinn" einheit="CHF" werte={R((r) => r.gewinnAuftrag)} />
          <tr className="kalk-fett kalk-hervor"><td>Umsatz CHF</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.umsatz)}</td>)}</tr>
        </tbody>
      </table>
    </section>
  );
}

function Angebot({ k, setze, nr, rechnung }) {
  const f = (name) => ({ wert: k.angebot[name], setzen: (w) => setze("angebot." + name, w) });
  const [laeuft, setLaeuft] = useState(false);
  async function pdf() {
    setLaeuft(true);
    try { const { angebotPdf } = await import("../daten/kalkulationPdf.js"); await angebotPdf(k, nr, rechnung); }
    catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
    setLaeuft(false);
  }
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Bedingungen</h2>
        <F label="Lieferzeit" id="kalk-lieferzeit" text {...f("lieferzeit")} />
        <F label="Lieferbedingung" id="kalk-lieferbed" text {...f("lieferbed")} />
        <F label="Zahlungsbedingung" id="kalk-zahlung" text {...f("zahlung")} />
        <F label="Schlusstext" id="kalk-gueltig" mehrzeilig {...f("gueltig")} />
        <button className="knopf knopf--haupt knopf--breit" id="kalk-pdf" disabled={laeuft || !rechnung.length} onClick={pdf}>
          {laeuft ? "PDF wird erstellt …" : "Angebot als PDF"}</button>
      </section>
      <section className="karte kalk-blatt" id="kalk-vorschau" aria-label="Vorschau des Angebots">
        <div className="kalk-blatt__band"><b>HOFER + CO</b><span>Hofer+Co Präzisionsdrehteile AG · Alte Bernstrasse 24 · CH-4573 Lohn-Ammannsegg</span></div>
        <div className="kalk-blatt__oben">
          <div><h3>Angebot</h3><div>Angebots-Nr. {nr}</div><div>Datum {heuteText()}</div>
            {k.kopf.sachbearbeiter && <div>Sachbearbeiter {k.kopf.sachbearbeiter}</div>}</div>
          <div className="kalk-blatt__an">{k.kopf.kunde}{k.kopf.adresse ? "\n" + k.kopf.adresse : ""}</div>
        </div>
        {k.kopf.anfrage && <p><b>Ihre Anfrage vom {datumText(k.kopf.anfrage)}</b></p>}
        <dl className="kalk-blatt__teil">
          <dt>Bezeichnung</dt><dd>{k.kopf.bezeichnung}</dd>
          <dt>Werkstoff</dt><dd>{k.material.bez}</dd>
          {k.material.nr && <><dt>Werkst. Nr.</dt><dd>{k.material.nr}</dd></>}
          <dt>Artikel-Code</dt><dd>{k.kopf.artikel}</dd>
          <dt>Zeichnung</dt><dd>{k.kopf.zeichnung}{k.kopf.index ? " / Index: " + k.kopf.index : ""}</dd>
        </dl>
        <table className="kalk-blatt__preise">
          <thead><tr><th>Pos</th><th className="rechts">Menge</th><th>ME</th><th className="rechts">Preis (exkl. MwSt.)</th><th className="rechts">Pro</th></tr></thead>
          <tbody>{rechnung.map((r, i) => <tr key={i}><td>{i + 1}</td><td className="rechts">{chf(r.menge, 0)}</td><td>Stk</td>
            <td className="rechts">{chf(r.angebot)} CHF</td><td className="rechts">1</td></tr>)}</tbody>
        </table>
        <dl className="kalk-blatt__teil">
          <dt>Lieferzeit</dt><dd>{k.angebot.lieferzeit}</dd>
          <dt>Lieferbedingung</dt><dd>{k.angebot.lieferbed}</dd>
          <dt>Zahlungsbedingung</dt><dd>{k.angebot.zahlung}</dd>
        </dl>
        <p className="kalk-blatt__text">{k.angebot.gueltig}</p>
      </section>
    </div>
  );
}

export function heuteText() { return datumText(new Date().toISOString().slice(0, 10)); }
export function datumText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? m[3] + "." + m[2] + "." + m[1] : iso || "";
}

// ---------- Stundensätze der Maschinen ----------
function Stundensaetze({ maschinen, neu, zurueck }) {
  const [offen, setOffen] = useState(null);
  async function anlegen() {
    try {
      const id = await maschineSpeichern({ name: "Neue Maschine", sort: maschinen.length + 1,
        daten: { ...BEISPIEL_MASCHINEN[0].daten, anschaffung: "", ruest: "" } });
      neu(); setOffen(id);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  return (
    <>
      <button className="knopf knopf--klein kalk-zurueck" id="kalk-zurueck" onClick={zurueck}>← Alle Kalkulationen</button>
      <h1 className="seitentitel">Stundensätze der Maschinen</h1>
      <p className="hinweis kalk-hinweis-oben">Wie im Gewatec unter Produktionsmittel → Stundensatz, aber jede Maschine
        nur einmal: Die Laufzeit am Tag trägst du beim Arbeitsgang ein, der Stundensatz passt sich an.</p>
      {maschinen.map((m) => (
        <MaschineKarte key={m.id} m={m} offen={offen === m.id} umschalten={() => setOffen(offen === m.id ? null : m.id)} neu={neu} />
      ))}
      <button className="knopf knopf--haupt" id="kalk-masch-neu" onClick={anlegen}>+ Maschine</button>
    </>
  );
}

function MaschineKarte({ m, offen, umschalten, neu }) {
  const [x, setX] = useState(() => ({ name: m.name, daten: { ...m.daten } }));
  const s = stundensatz(x);
  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) { erstes.current = false; return; }
    const t = setTimeout(() => {
      maschineSpeichern({ id: m.id, name: x.name, sort: m.sort, daten: x.daten }).then(neu,
        (f) => alt.meldung(alt.fehlertext(f), "fehler"));
    }, 1000);
    return () => clearTimeout(t);
  }, [x]);
  const f = (name) => ({ wert: x.daten[name], setzen: (w) => setX((v) => ({ ...v, daten: { ...v.daten, [name]: w } })) });
  async function loeschen() {
    const weg = await alt.loeschen({ titel: "Stundensatz löschen?", text: m.name + " wird gelöscht. Kalkulationen, die ihn brauchen, rechnen dort mit 0.",
      tabelle: "kalk_maschinen", id: m.id, rueckText: "Stundensatz löschen" });
    if (weg) neu();
  }
  return (
    <section className="karte kalk-masch" data-kmasch={m.id}>
      <button className="kalk-masch__kopf" onClick={umschalten} aria-expanded={offen}>
        <b>{x.name}</b>
        <span>{chf(s.eff)} CHF/h <small>fix {chf(s.fix)} · var {chf(s.var)} · Rüsten {chf(s.ruest)}</small></span>
      </button>
      {offen && <div className="kalk-masch__inhalt">
        <div className="kalk-reihe">
          <F label="Name" id={"kalk-mn-" + m.id} text wert={x.name} setzen={(w) => setX((v) => ({ ...v, name: w }))} />
          <div className="moduswahl kalk-modus">
            {[["rechnen", "Aus Grundlagen rechnen"], ["hand", "Satz von Hand"]].map(([w, t]) => (
              <button key={w} className={"moduswahl__knopf" + (x.daten.modus === w ? " aktiv" : "")} data-kmodus={w}
                onClick={() => setX((v) => ({ ...v, daten: { ...v.daten, modus: w } }))}>{t}</button>))}
          </div>
        </div>
        {x.daten.modus === "hand"
          ? <div className="kalk-reihe">
              <F label="Stundensatz fix" einheit="CHF/h" id={"kalk-mf-" + m.id} {...f("fix")} />
              <F label="Stundensatz variabel" einheit="CHF/h" id={"kalk-mv-" + m.id} {...f("var")} />
              <F label="Rüstsatz" einheit="CHF/h" id={"kalk-mr-" + m.id} {...f("ruest")} />
            </div>
          : <>
              <h3 className="kalk-unter">Maschine</h3>
              <div className="kalk-reihe">
                <F label="Anschaffung" einheit="CHF" id={"kalk-ma-" + m.id} {...f("anschaffung")} />
                <F label="Wiederbeschaffungsfaktor" id={"kalk-mw-" + m.id} {...f("wbf")} />
                <F label="Nutzungsdauer" einheit="Jahre" id={"kalk-mnd-" + m.id} {...f("nd")} />
                <F label="Zinssatz" einheit="%" id={"kalk-mz-" + m.id} {...f("zins")} />
                <F label="Raumanteil" einheit="m²" id={"kalk-mm2-" + m.id} {...f("m2")} />
                <F label="Miete" einheit="CHF/m²/Jahr" id={"kalk-mmi-" + m.id} {...f("miete")} />
              </div>
              <h3 className="kalk-unter">Zeit und Lohn</h3>
              <div className="kalk-reihe">
                <F label="Arbeitstage" einheit="je Jahr" id={"kalk-mt-" + m.id} {...f("tage")} />
                <F label="Arbeitszeit" einheit="Std/Tag" id={"kalk-maz-" + m.id} {...f("az")} />
                <F label="Laufzeit (Vorgabe)" einheit="Std/Tag" id={"kalk-mlt-" + m.id} {...f("laufTag")}
                  hinweis="Gilt, wenn beim Arbeitsgang keine Laufzeit steht" />
                <F label="Stundenlohn Bediener" einheit="CHF/h" id={"kalk-ml-" + m.id} {...f("lohn")} />
                <F label="Lohnanteil" einheit="%" id={"kalk-mla-" + m.id} {...f("lohnAnteil")} />
              </div>
              <h3 className="kalk-unter">Variable Kosten</h3>
              <div className="kalk-reihe">
                <F label="Strombedarf" einheit="kW" id={"kalk-mkw-" + m.id} {...f("kw")} />
                <F label="Strompreis" einheit="CHF/kWh" id={"kalk-msp-" + m.id} {...f("strompreis")} />
                <F label="Hilfsstoffe" einheit="CHF je Laufstunde" id={"kalk-mh-" + m.id} {...f("hilfsH")} />
                <F label="Werkzeugkosten" einheit="CHF je Laufstunde" id={"kalk-mwz-" + m.id} {...f("werkzeugH")} />
                <F label="Instandhaltung" einheit="% je Jahr" id={"kalk-mi-" + m.id} {...f("instand")} />
              </div>
              <F label="Rüstsatz von Hand" einheit="CHF/h" id={"kalk-mr-" + m.id} {...f("ruest")}
                hinweis={"Leer = Stundensatz (" + chf(s.eff) + " CHF/h). Im Gewatec „Realer Rüstsatz“."} />
              {s.teile && <table className="tabelle kalk-tab kalk-satz" id={"kalk-ms-" + m.id}>
                <tbody>
                  <Zeile titel="Maschinenstunden im Jahr" werte={[chf(s.stunden, 0)]} klein />
                  <Zeile titel="Abschreibung" einheit="CHF/Jahr" werte={[chf(s.teile.abschreibung)]} />
                  <Zeile titel="Zins auf halbe Anschaffung" einheit="CHF/Jahr" werte={[chf(s.teile.zins)]} />
                  <Zeile titel="Raum" einheit="CHF/Jahr" werte={[chf(s.teile.raum)]} />
                  <Zeile titel="Lohn" einheit="CHF/Jahr" werte={[chf(s.teile.lohn)]} />
                  <Zeile titel="Fix je Stunde" einheit="CHF/h" werte={[chf(s.fix)]} fett />
                  <Zeile titel="Strom" einheit="CHF/h" werte={[chf(s.teile.strom, 3)]} />
                  <Zeile titel="Hilfsstoffe" einheit="CHF/h" werte={[chf(s.teile.hilfs, 3)]} />
                  <Zeile titel="Werkzeug" einheit="CHF/h" werte={[chf(s.teile.werkzeug, 3)]} />
                  <Zeile titel="Instandhaltung" einheit="CHF/h" werte={[chf(s.teile.instand, 3)]} />
                  <Zeile titel="Variabel je Stunde" einheit="CHF/h" werte={[chf(s.var)]} fett />
                  <tr className="kalk-fett kalk-hervor"><td>Stundensatz bei {chf(s.lauf, 1)} Std/Tag</td><td className="rechts">{chf(s.eff)} CHF/h</td></tr>
                </tbody>
              </table>}
              {s.teile && <div className="kalk-rolle">
                <table className="tabelle kalk-tab kalk-satz" id={"kalk-mlauf-" + m.id}>
                  <thead><tr><th>Laufzeit Std/Tag</th>{LAUFZEITEN.map((h) => <th key={h} className="rechts">{h}</th>)}</tr></thead>
                  <tbody>
                    <Zeile titel="Fix" werte={LAUFZEITEN.map((h) => chf(stundensatz(x, h).fix))} />
                    <Zeile titel="Stundensatz" fett werte={LAUFZEITEN.map((h) => chf(stundensatz(x, h).eff))} />
                  </tbody>
                </table>
              </div>}
            </>}
        <button className="linkknopf linkknopf--gefahr" data-kmasch-weg={m.id} onClick={loeschen}>Diese Maschine löschen</button>
      </div>}
    </section>
  );
}
