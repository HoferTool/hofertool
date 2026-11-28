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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { ZiehListe } from "../teile/ZiehListe.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { auswahlDialog } from "../teile/Dialoge.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { materialZerlegen, werkstoffGenau } from "../daten/material.js";
import { naechsteNummer, nummernLaden, seitenweise } from "../daten/erp.js";
import { artikelAusKalkulation } from "./erp/KalkTab.jsx";
import { useSortierung, sortiert, sortPfeil } from "../teile/sortieren.js";
import {
  z, chf, stundensatz, staffelRechnen, leereKalkulation, kalkulationenLaden, kalkulationLaden, kalkVorschau, maschinenLaden,
  kalkulationSpeichern, maschineSpeichern, BEISPIEL_MASCHINEN, beispielKalkulation, START_MASCHINEN, startArbeitsplan, kostenstelleFuer, WAEHRUNGEN, kursHolen, PREISEINHEITEN, peWert, peText, EXTERN_NEBEN, FGK_DREHEN, SPEZ_GEWICHT, PREIS_JE_STAFFEL, preisInStaffeln, adresseVon, adresseZeilen, MAT_FORMEN,
} from "../daten/kalkulation.js";

// Nummer der Kalkulation: Jahr + laufende Nr., mit Startwert aus den
// Nummernkreisen des Test ERP (app_config.erp_nummern, Wunsch Patrick 25. November 2026)
// Ist die Liste noch nicht geladen (sie lädt still im Hintergrund), holt die Nummer sie selbst
const kalkNr = async (liste) => naechsteNummer(await nummernLaden().catch(() => ({})), "kalkulation",
  (liste && liste.length ? liste : await kalkulationenLaden()).map((k) => k.nr));

const REITER = [
  ["kopf", "Kopfdaten"], ["material", "Staffeln und Material"], ["ags", "Arbeitsgänge"],
  ["preis", "Preis"], ["ergebnis", "Ergebnis"], ["angebot", "Angebot"],
];

// Offene Kalkulation und Reiter bleiben beim Seitenwechsel und Neuladen
const gemerkt = { offen: null, reiter: "kopf", saetze: false, suche: "" };
teilMerken("kalkulation", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

// Escape: aus der Kalkulation oder den Stundensätzen zurück zur Liste
let zurueckFn = null;
// Die offene Kalkulation meldet hier, ob sie ungespeicherte Änderungen hat
let offeneKalk = null;
// Vor dem Verlassen einer geänderten Kalkulation fragen: true = weiter, false = bleiben
async function verlassenOk() {
  if (!offeneKalk || !offeneKalk.geaendert()) return true;
  const wahl = await auswahlDialog("Änderungen speichern?",
    [{ wert: "ja", text: "Speichern" }, { wert: "nein", text: "Nicht speichern" }],
    "Diese Kalkulation wurde geändert und ist noch nicht gespeichert.");
  if (wahl === "ja") return offeneKalk.speichern();
  return wahl === "nein";
}
export function kalkulationZurueck() { return zurueckFn ? zurueckFn() : false; }

export default function Kalkulation({ auffrischen }) {
  const [offen, setOffen] = useState(gemerkt.offen);
  const [saetze, setSaetze] = useState(gemerkt.saetze);
  useGemerkt(gemerkt, { offen, saetze });
  const liste = useDaten(kalkulationenLaden, [auffrischen]);
  const masch = useDaten(maschinenLaden, [auffrischen]);
  const zuRef = useRef(null);
  const zuFenster = useRef(null);
  const [fensterEl, setFensterEl] = useState(null);
  const listeRef = useRef(liste);
  listeRef.current = liste;
  // Seit 1.886.0 geht eine Kalkulation als Fenster auf (Wunsch Patrick 27. November 2026):
  // so lässt es sich verschieben und mit dem Fensterverwalter als eigenes Browserfenster
  // auf einen anderen Bildschirm ziehen. Jeder Weg zum Schliessen (X, Escape, daneben
  // tippen, Fensterleiste, eigenes Fenster) fragt vorher nach Ungespeichertem.
  useEffect(() => {
    if (!offen || !masch.daten) return undefined;
    const id = offen;
    let fertig = false;
    let zu = null;
    const pruefenZu = async () => { if (fertig) return; if (await verlassenOk()) zu && zu(); };
    // Das Fenster hat eine eigene React-Wurzel, die nur einmal zeichnet. Der Inhalt kommt
    // darum als Portal von hier, damit Maschinen und Liste frisch bleiben.
    zu = fensterOeffnen((z) => {
      zuFenster.current = z;
      return <div className="kalk-fenster" ref={(el) => { if (el) setFensterEl(el); }} />;
    }, () => { fertig = true; zuRef.current = null; zuFenster.current = null; setFensterEl(null); setOffen((v) => (v === id ? null : v)); listeRef.current.neu(); }, "kalk-huelle");
    const h = [...document.querySelectorAll(".dialog-huelle.kalk-huelle")].pop();
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || !h || !h.isConnected) return;
      const alle = [...document.querySelectorAll("body > .dialog-huelle")];
      if (alle[alle.length - 1] !== h) return;
      e.preventDefault(); e.stopImmediatePropagation(); pruefenZu();
    };
    const daneben = (e) => { if (e.target === h) { e.stopImmediatePropagation(); if (e.type === "click") pruefenZu(); } };
    if (h) {
      h.__hoferZu = pruefenZu;
      h.addEventListener("pointerdown", daneben, true);
      h.addEventListener("click", daneben, true);
    }
    window.addEventListener("keydown", taste, true);
    zuRef.current = pruefenZu;
    return () => {
      window.removeEventListener("keydown", taste, true);
      if (h) { h.removeEventListener("pointerdown", daneben, true); h.removeEventListener("click", daneben, true); }
      if (!fertig) { fertig = true; zu(); }
    };
  }, [offen, !!masch.daten]);

  zurueckFn = () => {
    if (saetze) { setSaetze(false); return true; }
    if (offen && zuRef.current) { zuRef.current(); return true; }
    return false;
  };
  useEffect(() => () => { zurueckFn = null; }, []);

  useSeitenSuche({
    name: "Kalkulation", platzhalter: "Nummer, Kunde oder Artikel …",
    eintraege: () => (liste.daten || []).map((k) => ({
      gruppe: "Kalkulationen", zeichen: "∑", titel: (k.nr || "ohne Nr.") + " · " + (k.kunde || "ohne Kunde"),
      zeile: [k.artikel, k.kopf && k.kopf.bezeichnung].filter(Boolean).join(" · "), id: k.id })),
    springen: async (x) => { if (!(await verlassenOk())) return; setSaetze(false); setOffen(x.id); },
  });

  const fehler = liste.fehler || masch.fehler;
  if (fehler && (!liste.daten || !masch.daten)) {
    return <><h1 className="seitentitel">Kalkulation</h1>
      <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  }
  if (!masch.daten) {
    return <><h1 className="seitentitel">Kalkulation</h1><div className="laedt">Wird geladen …</div></>;
  }

  if (saetze) {
    return <>{offen && fensterEl ? createPortal(<Offen key={offen} id={offen} maschinen={masch.daten}
      zurueck={() => zuFenster.current && zuFenster.current()} neu={liste.neu}
      oeffnen={(n) => { if (zuFenster.current) zuFenster.current(); setTimeout(() => setOffen(n)); }}
      liste={liste.daten || []} />, fensterEl) : null}
      <Stundensaetze maschinen={masch.daten} neu={masch.neu} zurueck={() => setSaetze(false)} /></>;
  }
  const fensterInhalt = offen && fensterEl ? createPortal(
    <Offen key={offen} id={offen} maschinen={masch.daten}
      zurueck={() => zuFenster.current && zuFenster.current()} neu={liste.neu}
      oeffnen={(n) => { if (zuFenster.current) zuFenster.current(); setTimeout(() => setOffen(n)); }}
      liste={liste.daten || []} />, fensterEl) : null;
  return <>{fensterInhalt}<Liste liste={liste.daten} maschinen={masch.daten}
    oeffnen={async (n) => { if (offen && !(await verlassenOk())) return; setOffen(n); }}
    neu={() => { liste.neu(); masch.neu(); }} saetze={() => setSaetze(true)} /></>;
}

// Die Liste hat nur Kopf und Vorschau (über 7'000 Kalkulationen aus WinKalk),
// darum holt eine geöffnete Kalkulation ihre ganzen Daten erst hier (seit 1.837.0)
function Offen({ id, zurueck, ...rest }) {
  const eintrag = useDaten(() => kalkulationLaden(id), [id]);
  const alle = <button className="knopf" onClick={zurueck}>← Alle</button>;
  if (eintrag.fehler) {
    return <><h1 className="seitentitel">Kalkulation</h1>
      <div className="karte karte--fehler"><p>{alt.fehlertext(eintrag.fehler)}</p>{alle}</div></>;
  }
  if (eintrag.daten === null && eintrag.laedt !== false) {
    return <><h1 className="seitentitel">Kalkulation</h1><div className="laedt">Wird geladen …</div></>;
  }
  if (!eintrag.daten) {
    return <><h1 className="seitentitel">Kalkulation</h1>
      <div className="karte karte--hinweis"><p>Kalkulation nicht gefunden.</p>{alle}</div></>;
  }
  return <Bearbeiten eintrag={eintrag.daten} zurueck={zurueck} {...rest} />;
}

// ---------- Liste aller Kalkulationen ----------
function Liste({ liste, maschinen, oeffnen, neu, saetze }) {
  const [laeuft, setLaeuft] = useState(false);
  // Suche in der Liste (Wunsch Patrick 27. Oktober 2026): alle Wörter müssen irgendwo im Kopf der Kalkulation stehen
  const [suche, setSuche] = useState(gemerkt.suche || "");
  useGemerkt(gemerkt, { suche });
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  // Liste erst mit Suchbegriff (Wunsch Patrick 26. November 2026): die Seite steht
  // sofort da, die über 7'000 Kalkulationen laden still im Hintergrund
  const gefunden = !woerter.length || !liste ? [] : liste.filter((k) => {
    const kopf = k.kopf || {};
    const text = [k.nr, k.kunde, k.artikel, ...Object.values(kopf)].filter((x) => typeof x === "string").join(" ").toLowerCase();
    return woerter.every((w) => text.includes(w));
  });
  // Spaltenkopf antippen sortiert alle Treffer, nicht nur die gezeigten 200 (seit 1.898.0)
  const [sort, sortKlick] = useSortierung();
  const kalkSortText = (k, i) => {
    const v = k.vorschau || {};
    return i === 0 ? k.nr || "" : i === 1 ? k.kunde || "" : i === 2 ? (k.artikel || "") + " " + ((k.kopf && k.kopf.bezeichnung) || "")
      : i === 3 ? String((v.mengen || [])[0] ?? "") : i === 4 ? (v.preis != null ? String(v.preis) : "")
      : k.geaendert_am ? String(Date.parse(k.geaendert_am) || "") : "";
  };
  const reihe = sortiert(gefunden, sort, kalkSortText);
  const KOPF = [["Nr."], ["Kunde"], ["Artikel"], ["Staffeln"], ["Preis", "rechts"], ["Geändert"]];

  async function anlegen(beispiel) {
    setLaeuft(true);
    try {
      let daten = leereKalkulation();
      let masch = maschinen;
      // Die Stundensätze, die der Start-Arbeitsplan braucht, anlegen, soweit sie fehlen
      const fehlt = BEISPIEL_MASCHINEN.filter((m) => (beispiel || START_MASCHINEN.includes(m.name))
        && !masch.some((x) => x.name === m.name));
      for (const m of fehlt) await maschineSpeichern(m);
      if (fehlt.length) masch = await maschinenLaden();
      if (beispiel) daten = beispielKalkulation(masch);
      else daten.ags = startArbeitsplan(masch);
      const id = await kalkulationSpeichern({ nr: beispiel ? "20225174" : await kalkNr(liste), daten });
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
        {liste && !liste.some((k) => k.nr === "20225174") &&
          <button className="knopf" id="kalk-beispiel" disabled={laeuft} onClick={() => anlegen(true)}>Beispiel aus Gewatec anlegen</button>}
      </div>
      {liste && !liste.length
        ? <div className="karte karte--hinweis"><p>Noch keine Kalkulation. Mit „Beispiel aus Gewatec anlegen“ kommt die
            Kalkulation 20225174 mit allen Zahlen herein, zum Vergleichen mit dem Gewatec.</p></div>
        : <section className="karte kalk-rolle">
            <input type="text" id="kalk-suche" className="kalk-suche" autoFocus value={suche} placeholder="Suchen: Nummer, Kunde, Artikel, Zeichnung, Bezeichnung …"
              onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && suche) { e.preventDefault(); setSuche(""); } }} />
            {!woerter.length ? <p className="hinweis" id="kalk-leer">Suchbegriff eintippen, dann erscheinen die Kalkulationen.</p> :
             !liste ? <p className="hinweis laedt" id="kalk-laedt">Kalkulationen werden geladen …</p> :
             !gefunden.length ? <p className="hinweis" id="kalk-nichts">Keine Kalkulation gefunden.</p> :
            <table className="tabelle kalk-liste">
              <thead><tr>{KOPF.map(([t, kl], i) => <th key={t} className={(kl ? kl + " " : "") + "erp-sortkopf" + (sort && sort.spalte === i ? " erp-sortkopf--an" : "")}
                data-erp-sort={i} title="Antippen sortiert" onClick={() => sortKlick(i)}>{t}{sortPfeil(sort, i)}</th>)}</tr></thead>
              <tbody>
                {reihe.slice(0, 200).map((k) => {
                  const v = k.vorschau || {};
                  return (
                    // Die Klassen je Zelle braucht das Handy: dort wird jede Zeile ein Kärtchen (seit 1.237.1)
                    <tr key={k.id} data-kalk={k.id} className="kalk-liste__zeile" onClick={() => oeffnen(k.id)}>
                      <td className="kalk-liste__nr"><b>{k.nr || "–"}</b></td>
                      <td className="kalk-liste__kunde">{k.kunde || "–"}</td>
                      <td className="kalk-liste__artikel">{k.artikel || ""}{k.kopf && k.kopf.bezeichnung ? <span className="kalk-klein">{k.kopf.bezeichnung}</span> : null}</td>
                      <td className="kalk-liste__staffeln">{(v.mengen || []).map((m) => chf(m, 0)).join(" / ")}</td>
                      <td className="rechts kalk-liste__preis">{v.preis != null ? chf(v.preis) + (v.waehrung && v.waehrung !== "CHF" ? " " + v.waehrung : "") + (v.pe > 1 ? " / " + peText(v.pe) : "") : "–"}</td>
                      <td className="kalk-liste__datum">{alt.datumZeitKurz ? alt.datumZeitKurz(k.geaendert_am) : ""}</td>
                    </tr>);
                })}
              </tbody>
            </table>}
            {gefunden.length > 200 && <p className="hinweis" id="kalk-mehr">200 von {gefunden.length.toLocaleString("de-CH").replace(/[’,]/g, "'")} gezeigt, Suche eingrenzen.</p>}
          </section>}
      <p className="hinweis">Testprogramm, nur für freigegebene Personen sichtbar. Gerechnet wird genau wie im Gewatec,
        aber mit beliebig vielen Staffelmengen.</p>
    </>
  );
}

// ---------- Eine Kalkulation bearbeiten ----------
function Bearbeiten({ eintrag, maschinen, zurueck, neu, oeffnen, liste }) {
  const [nr, setNr] = useState(eintrag.nr || "");
  const [k, setK] = useState(() => mitVorgaben(eintrag.daten));
  // Jede geöffnete Kalkulation holt die Stammdaten frisch (gelöschte oder
  // geänderte Artikel und Arbeitspläne gelten sofort), Reiterwechsel nicht
  useState(() => { stammZeit = 0; return 0; });
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [stand, setStand] = useState("gespeichert");
  useGemerkt(gemerkt, { reiter });

  // Nicht mehr von selbst speichern (Wunsch Patrick 26. November 2026): Knopf
  // Speichern, und beim Schliessen fragt die App, ob gespeichert werden soll.
  const rechnungRef = useRef([]);
  const basis = useRef(JSON.stringify({ nr, k }));
  const geaendert = JSON.stringify({ nr, k }) !== basis.current;
  const zustand = useRef();
  // Kunde und Adresse immer aus dem Kundenstamm (Patrick 28. November 2026: „es
  // muss überall die Adresse sein aus dem Kundenstamm“). Alte Kalkulationen (aus
  // WinKalk) tragen eine eigene Kopie; beim Öffnen gilt still die aus dem Stamm,
  // ohne dass die Kalkulation als geändert gilt.
  const stammB = useErpStamm();
  const stammAbgeglichen = useRef(false);
  useEffect(() => {
    const p = kundeAusStamm(k.kopf, stammB.partner);
    if (!p) return;
    const soll = stammKopf(p, k.kopf);
    if (!Object.keys(soll).some((n) => String(k.kopf[n] || "") !== String(soll[n] || ""))) { stammAbgeglichen.current = true; return; }
    const still = !stammAbgeglichen.current && JSON.stringify({ nr, k }) === basis.current;
    stammAbgeglichen.current = true;
    const kopf = { ...k.kopf, ...soll }; delete kopf.adresse;
    const neu = { ...k, kopf };
    if (still) basis.current = JSON.stringify({ nr, k: neu });
    setK(neu);
  }, [stammB.partner, k.kopf.kunde_id, k.kopf.kundencode]);
  async function speichern() {
    const jetzt = JSON.stringify({ nr, k });
    setStand("speichert");
    try {
      await kalkulationSpeichern({ id: eintrag.id, nr, daten: k, vorschau: kalkVorschau(k, rechnungRef.current) });
      basis.current = jetzt; setStand("gespeichert"); return true;
    } catch (f) { setStand("fehler"); alt.meldung(alt.fehlertext(f), "fehler"); return false; }
  }
  zustand.current = { geaendert, speichern };
  useEffect(() => {
    offeneKalk = { geaendert: () => zustand.current.geaendert, speichern: () => zustand.current.speichern() };
    const warnen = (e) => { if (zustand.current.geaendert) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warnen);
    return () => { offeneKalk = null; window.removeEventListener("beforeunload", warnen); };
  }, []);
  const schliessen = async () => { if (await verlassenOk()) zurueck(); };

  // Ein Feld irgendwo in der Kalkulation ändern: setze("kopf.kunde", wert)
  const setze = (pfad, wert) => setK((alt0) => {
    const neu0 = structuredClone(alt0);
    const teile = pfad.split(".");
    let o = neu0;
    teile.slice(0, -1).forEach((t) => { if (o[t] == null) o[t] = {}; o = o[t]; });
    o[teile[teile.length - 1]] = wert;
    return neu0;
  });

  const staffeln = k.staffeln.filter((s) => z(s.menge) > 0);
  const rechnung = staffeln.map((s) => staffelRechnen(k, s, maschinen));
  rechnungRef.current = rechnung;

  async function kopieren() {
    if (!(await verlassenOk())) return;
    try {
      const id = await kalkulationSpeichern({ nr: await kalkNr(liste), daten: structuredClone(k), vorschau: kalkVorschau(k, rechnung) });
      alt.meldung("Kopie angelegt.", "gut");
      neu(); oeffnen(id);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function loeschen() {
    const weg = await alt.loeschen({ titel: "Kalkulation löschen?", text: "Kalkulation " + (nr || "") + " wird gelöscht.",
      tabelle: "kalkulationen", id: eintrag.id, rueckText: "Kalkulation löschen" });
    if (weg) { basis.current = JSON.stringify({ nr, k }); zurueck(); }
  }

  const Inhalt = { kopf: Kopf, material: Material, ags: Arbeitsgaenge, preis: Preis, ergebnis: Ergebnis, angebot: Angebot }[reiter] || Kopf;
  return (
    <div className="kalk-kompakt" onKeyDown={enterWeiter}>
      <div className="kalk-kopf">
        <div className="kalk-kopf__links">
          <button className="knopf knopf--klein kalk-zurueck" id="kalk-zurueck" onClick={schliessen}>← Alle</button>
          <h1 className="seitentitel">Kalkulation {nr}</h1>
          <div className="kalk-kopf__unter">{[k.kopf.kunde, k.kopf.artikel, k.kopf.bezeichnung].filter(Boolean).join(" · ") || "Noch ohne Kunde und Artikel"}</div>
        </div>
        <div className="kalk-kopf__rechts">
          <span className={"kalk-stand kalk-stand--" + (stand === "speichert" ? stand : geaendert ? "ungespeichert" : stand)} id="kalk-stand">
            {stand === "speichert" ? "Speichert …" : geaendert ? "Nicht gespeichert" : stand === "fehler" ? "Nicht gespeichert" : "Gespeichert"}
          </span>
          <button className={"knopf knopf--klein" + (geaendert ? " knopf--haupt" : "")} id="kalk-speichern"
            disabled={stand === "speichert"} onClick={speichern}>Speichern</button>
          <button className="knopf knopf--klein" id="kalk-erp-uebernehmen" title="Artikel, Preisliste und Arbeitsplan dieser Kalkulation ins Test ERP übernehmen" onClick={async () => {
            try { const r = await artikelAusKalkulation({ id: eintrag.id, nr, daten: k }, maschinen); if (r) { alt.meldung(r, "gut"); window.dispatchEvent(new Event("hofer-erp-neu")); } }
            catch (e) { alt.meldung(String(e?.message || e), "fehler"); }
          }}>Artikel und Arbeitsplan übernehmen</button>
          <button className="knopf knopf--klein" id="kalk-kopieren" onClick={kopieren}>Kopieren</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" id="kalk-loeschen" onClick={loeschen}>Löschen</button>
        </div>
      </div>

      {/* Immer sichtbar: was jede Staffel kostet */}
      <div className="kalk-band" id="kalk-band">
        {rechnung.length ? rechnung.map((r, i) => (
          <div className="kalk-band__staffel" key={i} data-staffel={i}>
            <span>{chf(r.menge, 0)} Stk</span>
            <b>{chf(r.angebotPe)}{r.waehrung !== "CHF" ? " " + r.waehrung : ""}{r.pe > 1 ? " / " + peText(r.pe) : ""}</b>
            <small>Selbstkosten {chf(r.selbstVerz, 4)} · DB {chf(r.dbPct, 1)} %</small>
          </div>)) : <div className="kalk-band__leer">Noch keine Staffelmenge</div>}
      </div>

      <Reiter reiter={REITER} aktiv={reiter} waehlen={setReiter} merkmal="kalk-reiter" />
      <Uebergang key={reiter}>
        <div id="kalk-inhalt">
          <Inhalt k={k} setze={setze} setK={setK} nr={nr} setNr={setNr} maschinen={maschinen} rechnung={rechnung} winkalk={eintrag.winkalk} liste={liste} eigeneId={eintrag.id} />
        </div>
      </Uebergang>
     </div>
  );
}

// Ältere oder unvollständige Daten mit den Feldern einer neuen ergänzen
// Enter springt wie Tab ins nächste Feld, Shift + Enter zurück; in den
// Tabellen je Staffel stehen die Felder Zeile für Zeile, also nach rechts
// (Wunsch Patrick 27. Oktober 2026). Mehrzeilige Felder behalten Enter.
function enterWeiter(e) {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!t.matches || !t.matches("input:not([type=checkbox]):not([type=radio]), select")) return;
  const felder = [...e.currentTarget.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")]
    .filter((x) => !x.disabled && !x.readOnly && x.offsetParent !== null);
  const i = felder.indexOf(t);
  const ziel = felder[i + (e.shiftKey ? -1 : 1)];
  if (i < 0 || !ziel) return;
  e.preventDefault();
  ziel.focus();
  if (ziel.select && ziel.tagName === "INPUT") ziel.select();
}

// Eine Tabelle, die genau den Bildschirm füllt: die Zeilen teilen sich die
// Höhe unter der Tabelle bis zum unteren Rand, so ist auf kleinen
// Bildschirmen nichts zu rollen und auf grossen wird es grösser
// (Patrick 27. Oktober 2026: „ich will nicht scrollen“, „kann grösser werden nach unten“)
function useBildschirmHoch() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return undefined;
    const passen = () => {
      const zeilen = t.querySelectorAll("tr").length || 1;
      const seite = document.scrollingElement;
      const setzen = (kz) => t.style.setProperty("--kz", kz + "px");
      // Zuerst gross schätzen, dann messen und verkleinern, bis die Seite
      // nicht mehr rollt: Schrift und Felder machen Zeilen oft höher als --kz
      const oben = t.getBoundingClientRect().top + window.scrollY;
      let kz = Math.max(12, Math.min(34, Math.floor((window.innerHeight - oben - 40) / zeilen)));
      setzen(kz);
      for (let i = 0; i < 25 && kz > 12; i++) {
        const zuViel = seite.scrollHeight - window.innerHeight;
        if (zuViel <= 0) break;
        kz = Math.max(12, kz - Math.max(1, Math.floor(zuViel / zeilen)));
        setzen(kz);
      }
    };
    passen();
    window.addEventListener("resize", passen);
    return () => window.removeEventListener("resize", passen);
  });
  return ref;
}

function mitVorgaben(d) {
  const leer = leereKalkulation();
  const x = structuredClone(d || {});
  for (const t of ["kopf", "material", "preis", "angebot"]) x[t] = { ...leer[t], ...(x[t] || {}) };
  if (!Array.isArray(x.staffeln)) x.staffeln = leer.staffeln;
  if (!Array.isArray(x.ags)) x.ags = [];
  // Feste Schlüssel, weil die Werte je Staffel daran hängen
  x.ags = x.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));
  return preisInStaffeln(x);
}

// Ein Eingabefeld; Zahlen als Text, damit Komma und Apostroph gehen
function F({ label, wert, setzen, einheit, id, text, mehrzeilig, hinweis, typ, platz, liste, breit, wahl, verlassen, gesperrt }) {
  return (
    <label className={"feld kalk-feld" + (breit ? " kalk-feld--breit" : "") + (wahl ? " kalk-feld--wahl" : "")}>
      <span>{label}{einheit ? <em> {einheit}</em> : null}</span>
      {mehrzeilig
        ? <textarea id={id} rows={3} value={wert || ""} onChange={(e) => setzen(e.target.value)} />
        : <input id={id} type={typ || "text"} inputMode={text || typ ? undefined : "decimal"} value={wert == null ? "" : wert} readOnly={gesperrt || undefined}
            placeholder={platz} list={liste} autoComplete={wahl ? "off" : undefined}
            onFocus={wahl ? () => wahl.auf(true) : undefined} onBlur={wahl || verlassen ? () => { if (wahl) setTimeout(() => wahl.auf(false), 200); if (verlassen) verlassen(); } : undefined}
            onKeyDown={wahl ? (e) => { if (e.key === "Escape" && wahl.offen) { e.preventDefault(); e.stopPropagation(); wahl.auf(false); } } : undefined}
            onChange={(e) => { setzen(e.target.value); if (wahl) wahl.auf(true); }} />}
      {wahl && wahl.offen && wahl.treffer.length > 0 && (
        <span className="kalk-wahl" data-kalk-wahl={id}>
          {wahl.treffer.map((t) => (
            <button type="button" key={t.id} className="kalk-wahl__zeile" data-kalk-wahl-id={t.id}
              onMouseDown={(e) => { e.preventDefault(); wahl.nehmen(t); wahl.auf(false); }}>
              <b>{t.titel}</b>{t.unter ? <small>{t.unter}</small> : null}
            </button>))}
        </span>)}
      {hinweis ? <span className="feldhinweis">{hinweis}</span> : null}
    </label>
  );
}

// Stammdaten aus dem Test ERP (Kunden, Artikel, Rohmaterial) zum Hineinziehen
// in die Kalkulation (Wunsch Patrick 25. November 2026: „bestehende
// Stammdaten hineinziehen können, wie Kunde, Artikel“). Einmal je Laden der
// Seite geholt; ohne Leserecht im ERP bleiben die Listen leer und man tippt
// wie bisher. Seit 1.946.1 frisch geholt, wenn der Vorrat älter als eine
// Minute ist oder im Test ERP etwas gespeichert wurde: vorher galt ein
// gelöschter Arbeitsplan bis zum Neuladen der Seite weiter (Patrick 28.
// November 2026: „sagst du immer noch, dass es den Artikel mit Arbeitsplan gibt“).
let stammVorrat = null;
let stammZeit = 0;
let stammLaedt = null;
if (typeof window !== "undefined") window.addEventListener("hofer-erp-neu", () => { stammZeit = 0; });
function useErpStamm() {
  const [st, setSt] = useState(stammVorrat || { partner: [], lieferanten: [], artikel: [], bed: [] });
  useEffect(() => {
    if (stammVorrat && Date.now() - stammZeit < 60000) return undefined;
    let weg = false;
    if (stammLaedt) { stammLaedt.then(() => { if (!weg && stammVorrat) setSt(stammVorrat); }); return () => { weg = true; }; }
    let fertig;
    stammLaedt = new Promise((r) => { fertig = r; });
    (async () => {
      try {
        // Seitenweise: der Server gibt höchstens 1'000 Zeilen je Abfrage. Mit
        // .limit(20000) fehlten so die meisten der über 2'000 Hofer-Artikel, und
        // ein bestehender Artikel wurde nicht gefunden (Patrick 28. November 2026)
        const ok = (data) => ({ data });
        const [p, a, b] = await Promise.all([
          seitenweise("erp_partner", "id, art, nr, name, aktiv, daten", (q) => q.in("art", ["kunde", "lieferant"])).then(ok, (error) => ({ error })),
          seitenweise("erp_artikel", "id, art, nr, idx, bezeichnung, zeichnung, kunde_id, aktiv, daten, arbeitsplan").then(ok, (error) => ({ error })),
          alt.db.from("erp_bedingungen").select("id, art, code, text").limit(500)]);
        const alle = p && !p.error && Array.isArray(p.data) ? p.data.filter((x) => x.aktiv !== false) : [];
        const neu = {
          bed: b && !b.error && Array.isArray(b.data) ? b.data : [],
          partner: alle.filter((x) => x.art === "kunde"),
          // Lieferanten für externe Arbeitsgänge (Wunsch Patrick 26. November 2026)
          lieferanten: alle.filter((x) => x.art === "lieferant"),
          artikel: a && !a.error && Array.isArray(a.data) ? a.data.filter((x) => x.aktiv !== false) : [] };
        stammVorrat = neu; stammZeit = Date.now();
        if (!weg) setSt(neu);
      } catch (e) { /* ohne Verbindung oder Recht: von Hand tippen */ }
      stammLaedt = null; fertig();
    })();
    return () => { weg = true; };
  }, []);
  return st;
}

// Treffer für ein Suchfeld: jedes Wort muss irgendwo vorkommen, Bindestriche
// und Punkte zählen nicht
function stammTreffer(liste, text, felder, max = 8) {
  const norm = (x) => String(x || "").toLowerCase().replace(/[-.\s]/g, "");
  const woerter = String(text || "").toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  if (!woerter.length) return [];
  const aus = [];
  for (const x of liste) {
    const t = felder(x).map(norm).join(" ");
    if (woerter.every((w) => t.includes(w))) { aus.push(x); if (aus.length >= max) break; }
  }
  return aus;
}

function useWahl(treffer, nehmen) {
  const [offen, auf] = useState(false);
  return { offen, auf, treffer, nehmen };
}

// Lieferant eines externen Arbeitsgangs aus den Stammdaten des Test ERP
// hineinziehen (Wunsch Patrick 26. November 2026: „bei externen den
// Lieferant hineinziehen können, jetzt ist nur ein Textfeld da“). Eigene
// Komponente, weil die Arbeitsgänge in einer Schleife stehen. Tippen von
// Hand bleibt möglich.
function LieferantFeld({ id, wert, setzen, nimm }) {
  const stamm = useErpStamm();
  const wahl = useWahl(stammTreffer(stamm.lieferanten, wert, (p) => [p.nr, p.name]).map((p) => ({
    id: p.id, titel: p.name, unter: [p.nr, partnerAdresse(p).ort].filter(Boolean).join(" · "), p })), (t) => nimm(t.p));
  return <F label="Lieferant" id={id} text wahl={wahl} wert={wert} setzen={setzen}
    platz={stamm.lieferanten.length ? "Name oder Nr. tippen, Vorschlag wählen" : undefined} />;
}

// Adresse eines Partners für die Felder der Kalkulation
function partnerAdresse(p) {
  const d = (p && p.daten) || {};
  const ad = d.adresse || {};
  return { zusatz: ad.name2 || "", strasse: ad.strasse || "", land: ad.land || "", plz: ad.plz || "", ort: ad.ort || "" };
}

// Liefer- und Zahlungsbedingung sowie Versand eines Kunden aus den
// Stammdaten des Test ERP (Wunsch Patrick 25. November 2026: „Liefer-,
// Zahlungsbedingung und ähnliches kommen über den Kunden-Code“). Leere
// Angaben im Kunden lassen das Feld der Kalkulation, wie es ist.
function partnerBedingungen(p, bed) {
  const d = (p && p.daten) || {};
  const text = (id) => { const b = (bed || []).find((x) => x.id === id || x.code === id); return b ? b.text : ""; };
  const aus = {};
  const lb = text(d.liefer); if (lb) aus.lieferbed = lb;
  const zb = text(d.zahlung); if (zb) aus.zahlung = zb;
  if (d.versand && typeof d.versand === "string") aus.versand = d.versand;
  return aus;
}

function Kopf({ k, setze, setK, nr, setNr, maschinen, liste, eigeneId }) {
  const f = (name) => ({ wert: k.kopf[name], setzen: (w) => setze("kopf." + name, w) });
  // Adresse in einzelnen Feldern; ein alter Block `adresse` wird beim ersten
  // Ändern in die Felder übernommen und fällt dann weg
  const adr = adresseVon(k.kopf);
  const a = (name) => ({ wert: adr[name], setzen: (w) => setK((x) => {
    const kopf = { ...x.kopf, ...adresseVon(x.kopf), [name]: w };
    delete kopf.adresse;
    return { ...x, kopf };
  }) });
  const stamm = useErpStamm();
  const kundeSetzen = (p) => setK((x) => {
    const kopf = { ...x.kopf, kunde: p.name || "", kunde_id: p.id, kundencode: p.nr || "", ...partnerAdresse(p) };
    delete kopf.adresse;
    return { ...x, kopf, angebot: { ...(x.angebot || {}), ...partnerBedingungen(p, stamm.bed) } };
  });
  // Kunden-Code: genau eine bekannte Nr. getippt übernimmt den Kunden gleich
  const codeSetzen = (w) => {
    setze("kopf.kundencode", w);
    const t = String(w || "").trim();
    const p = t.length >= 5 ? stamm.partner.find((x) => String(x.nr) === t) : null;
    if (p && p.id !== k.kopf.kunde_id) kundeSetzen(p);
  };
  const codeWahl = useWahl(stammTreffer(stamm.partner, k.kopf.kundencode, (p) => [p.nr, p.name]).map((p) => ({
    id: p.id, titel: p.nr + " " + p.name, unter: partnerAdresse(p).ort, p })), (t) => kundeSetzen(t.p));
  const kundeWahl = useWahl(stammTreffer(stamm.partner, k.kopf.kunde, (p) => [p.nr, p.name]).map((p) => ({
    id: p.id, titel: p.name, unter: [p.nr, partnerAdresse(p).ort].filter(Boolean).join(" · "), p })), (t) => kundeSetzen(t.p));
  const hofer = stamm.artikel.filter((x) => x.art === "hofer");
  const imStamm = kundeAusStamm(k.kopf, stamm.partner);
  const artikelSetzen = (a) => {
    const d = a.daten || {};
    const roh = d.rohmaterial_id ? stamm.artikel.find((x) => x.id === d.rohmaterial_id) : null;
    const matBez = roh ? (roh.bezeichnung || roh.nr) : (d.material || "");
    const kunde = a.kunde_id ? stamm.partner.find((p) => p.id === a.kunde_id) : null;
    setK((x) => {
      // Der Artikel-Code ist Master: ein anderer Artikel ersetzt alle Felder,
      // derselbe füllt nur Leeres nicht mit Leerem auf (Wunsch Patrick 25. November 2026)
      const neu = x.kopf.artikel_id !== a.id;
      const wert = (w, alt0) => (w || (neu ? "" : alt0 || ""));
      const kopf = { ...x.kopf, artikel: a.nr || "", index: wert(a.idx, x.kopf.index), zeichnung: wert(a.zeichnung, x.kopf.zeichnung),
        ident: wert(d.ident, x.kopf.ident), bezeichnung: wert(a.bezeichnung, x.kopf.bezeichnung), artikel_id: a.id };
      let angebot = x.angebot;
      if (kunde) {
        Object.assign(kopf, { kunde: kunde.name || "", kunde_id: kunde.id, kundencode: kunde.nr || "", ...partnerAdresse(kunde) }); delete kopf.adresse;
        angebot = { ...(x.angebot || {}), ...partnerBedingungen(kunde, stamm.bed) };
      }
      let material = x.material;
      if (matBez && (neu || !String(x.material.bez || "").trim())) {
        const w = werkstoffGenau(matBez); const t = materialZerlegen(matBez);
        material = { ...x.material, bez: matBez, nr: (w && w.nr) || x.material.nr, d: t && t.d ? String(t.d) : x.material.d };
      }
      return { ...x, kopf, material, angebot };
    });
  };
  // Getippter Artikel-Code, der genau einer HOCO Nr. im Test ERP entspricht,
  // übernimmt den Artikel gleich; ein anderer Code löst die Verknüpfung
  const artikelCodeSetzen = (w) => {
    const t = String(w || "").trim();
    const a = t ? hofer.find((x) => String(x.nr) === t) : null;
    if (a) { if (a.id !== k.kopf.artikel_id) { artikelSetzen(a); return; } setze("kopf.artikel", w); return; }
    setK((x) => { const kopf = { ...x.kopf, artikel: w }; if (kopf.artikel_id) delete kopf.artikel_id; return { ...x, kopf }; });
  };
  // Auch Artikel, die es nur in früheren Kalkulationen gibt, werden
  // vorgeschlagen (Wunsch Patrick 28. November 2026: „bestehende Artikel aus
  // den Stammdaten oder Kalkulationen soll er erkennen“)
  const kalkArtikel = kalkArtikelListe(liste, hofer, eigeneId);
  const artikelWahl = useWahl(stammTreffer(hofer, k.kopf.artikel, (a) => [a.nr, a.idx, a.bezeichnung, a.zeichnung, (a.daten || {}).ident])
    .map((a) => ({ id: a.id, titel: a.nr + (a.idx ? " Ind. " + a.idx : ""), unter: [a.bezeichnung, a.zeichnung].filter(Boolean).join(" · "), a }))
    .concat(stammTreffer(kalkArtikel, k.kopf.artikel, (x) => [x.nr, x.kopf.bezeichnung, x.kopf.zeichnung, x.kopf.ident], 5)
      .map((x) => ({ id: "kk-" + x.nr, titel: x.nr + (x.kopf.index ? " Ind. " + x.kopf.index : ""),
        unter: ["aus Kalkulation " + (x.kalkNr || ""), x.kopf.bezeichnung].filter(Boolean).join(" · "), kk: x }))),
  (t) => (t.a ? artikelSetzen(t.a) : kalkArtikelSetzen(t.kk)));
  // Artikel aus einer früheren Kalkulation: Code sofort, Bezeichnung, Zeichnung,
  // Index und Ident aus deren Kopf (die Liste hat ihn meist schon, sonst nachladen)
  const kalkArtikelSetzen = async (kk) => {
    const setzeKopf = (q) => setK((x) => {
      const kopf = { ...x.kopf, artikel: kk.nr, bezeichnung: q.bezeichnung || "", zeichnung: q.zeichnung || "", index: q.index || "", ident: q.ident || "" };
      delete kopf.artikel_id;
      return { ...x, kopf };
    });
    setzeKopf(kk.kopf || {});
    if (kk.kopf && (kk.kopf.bezeichnung || kk.kopf.zeichnung)) return;
    try { const e = await kalkulationLaden(kk.id); if (e && e.daten && e.daten.kopf) setzeKopf(e.daten.kopf); } catch (f) { /* bleibt beim Code */ }
  };
  // Ist der Artikel-Code eine bekannte HOCO Nr., kommt das Material des
  // jüngsten Auftrags von selbst, solange noch keins eingetragen ist
  // (Wunsch Patrick 27. Oktober 2026)
  const [matHinweis, setMatHinweis] = useState("");
  const artikel = (k.kopf.artikel || "").trim();
  const matLeer = !String(k.material.bez || "").trim();
  // Wechselt der Artikel-Code von Hand, kommt das Material neu, auch wenn
  // schon eines dasteht (Master); beim Öffnen bleibt das gespeicherte
  const artikelVorher = useRef(artikel);
  const geaendert = artikelVorher.current !== artikel;
  const mitErp = !!k.kopf.artikel_id;
  useEffect(() => {
    if (!/^\d{4,6}-\d{3,4}$/.test(artikel) || mitErp || !(matLeer || geaendert)) return undefined;
    let weg = false;
    const zeit = setTimeout(async () => {
      try {
        const r = await alt.db.from("jobs").select("material_bez, planned_from").eq("job_number", artikel)
          .not("material_bez", "is", null).order("planned_from", { ascending: false }).limit(1);
        const bez = r && !r.error && r.data && r.data[0] ? String(r.data[0].material_bez || "").trim() : "";
        if (weg || !bez) return;
        artikelVorher.current = artikel;
        setze("material.bez", bez);
        const w = werkstoffGenau(bez);
        if (w && w.nr) setze("material.nr", w.nr);
        const t = materialZerlegen(bez);
        if (t && t.d) setze("material.d", String(t.d));
        setMatHinweis("Material aus HOCO Nr. " + artikel + " übernommen: " + bez);
      } catch (e) { /* ohne Verbindung bleibt das Feld leer */ }
    }, 500);
    return () => { weg = true; clearTimeout(zeit); };
  }, [artikel, matLeer, mitErp]);
  // Länge Fertigteil aus den Stammdaten der HOCO Nr., nur wenn das Feld leer ist:
  // so rechnet „Aus Länge und Stange“ gleich, wie im Gewatec mit Länge + Abstich.
  const laengeLeer = !String((k.material || {}).laenge || "").trim();
  useEffect(() => {
    if (!/^\d{4,6}-\d{3,4}$/.test(artikel) || !laengeLeer) return undefined;
    let weg = false;
    const zeit = setTimeout(async () => {
      try {
        const r = await alt.db.from("hoco_parts").select("teil_laenge_mm").eq("hoco_nr", artikel).maybeSingle();
        const l = r && !r.error && r.data ? Number(r.data.teil_laenge_mm) : 0;
        if (weg || !(l > 0)) return;
        setze("material.laenge", String(l));
        setMatHinweis("Länge Fertigteil " + String(l) + " mm aus HOCO Nr. " + artikel + " übernommen.");
      } catch (e) { /* ohne Verbindung bleibt das Feld leer */ }
    }, 600);
    return () => { weg = true; clearTimeout(zeit); };
  }, [artikel, laengeLeer]);
  // Bestehender Artikel erkannt: zeigen, welche Kalkulationen es schon gibt,
  // und fragen, ob ein bestehender Arbeitsplan übernommen werden soll (Wunsch
  // Patrick 28. November 2026). Gefragt wird nur, wenn der Artikel-Code
  // während der Arbeit wechselt, nicht schon beim Öffnen einer Kalkulation.
  const code = artikel.toLowerCase();
  const stammA = code ? hofer.find((x) => String(x.nr || "").trim().toLowerCase() === code) : null;
  const stammAp = stammA && Array.isArray(stammA.arbeitsplan) ? stammA.arbeitsplan.filter((g) => g && (g.bez || g.maschine)) : [];
  const fruehere = code ? (liste || []).filter((x) => x.id !== eigeneId && String(x.artikel || "").trim().toLowerCase() === code) : [];
  const gefragtFuer = useRef(artikel);
  const apFragen = async () => {
    const opt = [];
    if (stammAp.length) opt.push({ wert: "stamm", text: "Arbeitsplan aus den Stammdaten (" + stammAp.length + " Arbeitsgänge)" });
    fruehere.slice(0, 10).forEach((x) => opt.push({ wert: "k:" + x.id,
      text: "Aus Kalkulation " + (x.nr || "ohne Nr.") + (x.kunde ? " · " + x.kunde : "") + (x.geaendert_am ? " · " + datumText(String(x.geaendert_am).slice(0, 10)) : "") }));
    if (!opt.length) return;
    opt.push({ wert: "nein", text: "Nein, Arbeitsplan selbst erfassen" });
    const w = await auswahlDialog("Bestehenden Arbeitsplan übernehmen?", opt,
      "Den Artikel " + artikel + " gibt es schon." + (k.ags.length ? " Die " + k.ags.length + " Arbeitsgänge dieser Kalkulation werden dabei ersetzt." : ""), true);
    if (!w || w === "nein") return;
    let ags = null;
    if (w === "stamm") ags = agsAusArbeitsplan(stammAp, maschinen || [], stamm.lieferanten);
    else {
      try {
        const e = await kalkulationLaden(w.slice(2));
        ags = ((e && e.daten && e.daten.ags) || []).map((g) => ({ ...structuredClone(g), key: schluessel() }));
      } catch (f) { alt.meldung("Kalkulation konnte nicht geladen werden: " + alt.fehlertext(f), "fehler"); return; }
    }
    if (!ags) return;
    setK((x) => ({ ...x, ags }));
    alt.meldung(ags.length + " Arbeitsgänge übernommen. Bitte im Reiter Arbeitsgänge prüfen.", "gut");
  };
  // Gefragt wird erst beim Verlassen des Feldes, nicht schon beim Tippen: sonst
  // kam bei der ersten Ziffer „1“ gleich die Frage zum Artikel 1 (Wunsch Patrick
  // 28. November 2026: „erst, wenn ich ins nächste Feld klicke“)
  // Höchste Artikel-Nr. des gewählten Kunden aus Stammdaten und Kalkulationen,
  // damit man die nächste freie sieht (Wunsch Patrick 28. November 2026)
  const hoechste = artikelZaehler(k.kopf, hofer, liste, eigeneId);
  const frage = useRef(null);
  frage.current = { artikel, n: stammAp.length + fruehere.length, apFragen };
  const artikelVerlassen = () => setTimeout(() => {
    const f = frage.current;
    if (!f || !f.artikel || gefragtFuer.current === f.artikel || !f.n) return;
    gefragtFuer.current = f.artikel;
    f.apFragen();
  }, 250);

  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Kunde und Artikel</h2>
        <F label="Kalkulation Nr." id="kalk-nr" text wert={nr} setzen={setNr} />
        <F label="Kunden-Code" id="kalk-kundecode" text platz={stamm.partner.length ? "Kunden-Nr., z. B. 10804" : undefined} wahl={codeWahl} wert={k.kopf.kundencode} setzen={codeSetzen} />
        {k.kopf.kunde && <p className="hinweis kalk-kunde-kurz" id="kalk-kunde-kurz">{k.kopf.kunde}{k.kopf.ort ? ", " + k.kopf.ort : ""}</p>}
        <F label="Artikel-Code" id="kalk-artikel" text platz={hofer.length ? "HOCO Nr. oder Bezeichnung tippen" : undefined} wahl={artikelWahl} wert={k.kopf.artikel} setzen={artikelCodeSetzen} verlassen={artikelVerlassen} />
        {hoechste && (artikelWahl.offen || !artikel) && <p className="hinweis" id="kalk-hoechste">
          {hoechste.nr ? <>Höchste Artikel-Nr. bei {k.kopf.kunde || "diesem Kunden"}: <b>{hoechste.nr}</b> ({hoechste.wo}). </> : <>Noch keine Artikel-Nr. bei {k.kopf.kunde || "diesem Kunden"}. </>}
          Nächste frei: <b>{hoechste.naechste}</b>{" "}
          <button type="button" className="knopf knopf--klein" id="kalk-naechste" onMouseDown={(e) => { e.preventDefault(); artikelCodeSetzen(hoechste.naechste); }}>übernehmen</button></p>}
        {matHinweis && <p className="hinweis" id="kalk-mat-hinweis">{matHinweis}</p>}
        {(stammA || fruehere.length > 0) && <div className="hinweis kalk-artikel-da" id="kalk-artikel-da">
          {stammA && <p>Artikel {stammA.nr}{stammA.idx ? " Ind. " + stammA.idx : ""} ist in den Stammdaten
            {stammAp.length ? ", Arbeitsplan mit " + stammAp.length + " Arbeitsgängen" : ", ohne Arbeitsplan"}.</p>}
          {fruehere.length > 0 && <><p>{fruehere.length === 1 ? "Schon 1 Kalkulation" : "Schon " + fruehere.length + " Kalkulationen"} mit diesem Artikel:</p>
            <ul className="kalk-artikel-da__liste">{fruehere.slice(0, 20).map((x) => (
              <li key={x.id} data-kalk-frueher={x.id}><b>{x.nr || "ohne Nr."}</b>{x.kunde ? " · " + x.kunde : ""}
                {x.geaendert_am ? " · " + datumText(String(x.geaendert_am).slice(0, 10)) : ""}
                {x.vorschau && x.vorschau.preis != null ? " · " + chf(x.vorschau.preis) + " " + (x.vorschau.waehrung || "CHF") + (x.vorschau.pe > 1 ? " / " + x.vorschau.pe + " Stk" : "") : ""}</li>))}
            </ul></>}
          {(stammAp.length > 0 || fruehere.length > 0) && <button type="button" className="knopf knopf--klein" id="kalk-ap-uebernehmen" onClick={apFragen}>Arbeitsplan übernehmen …</button>}
        </div>}
        <F label="Zeichnung" id="kalk-zeichnung" text {...f("zeichnung")} />
        <F label="Kunden Ident-Nr." id="kalk-ident" text {...f("ident")} />
        <F label="Index" id="kalk-index" text {...f("index")} />
        <F label="Teilebezeichnung" id="kalk-bez" text {...f("bezeichnung")} />
      </section>
      <div className="kalk-spalte">
      <section className="karte">
        <h2>Anfrage und Bearbeitung</h2>
        {/* Anfragenummer des Kunden (Wunsch Patrick 28. November 2026) */}
        <F label="Anfrage-Nr." id="kalk-anfrage-nr" text {...f("anfrage_nr")} />
        <F label="Anfrage vom" id="kalk-anfrage" typ="date" {...f("anfrage")} />
        <F label="Ihr Zeichen" id="kalk-zeichen" text {...f("zeichen")} />
        {/* Kundenanfrage und Zeichnung als Dokumente hineinziehen, antippen zeigt sie (Wunsch Patrick 28. November 2026) */}
        <KalkDokumente k={k} setK={setK} />
      </section>
      {/* Kunde und Anschrift rechts unten: links nur, was man zur Eingabe braucht (Wunsch Patrick 28. November 2026) */}
      <section className="karte">
        <h2>Kunde und Anschrift</h2>
        {imStamm && <p className="hinweis" id="kalk-adr-stamm">Aus dem Kundenstamm ({imStamm.nr}). Ändern im Test ERP unter Stammdaten → Kunden.</p>}
        <F label="Kunde" id="kalk-kunde" text platz={stamm.partner.length ? "Name oder Nr. tippen, Vorschlag wählen" : undefined} wahl={imStamm ? undefined : kundeWahl} gesperrt={!!imStamm} {...f("kunde")} />
        <F label="Zusatz" id="kalk-adr-zusatz" text platz="Abteilung, z. Hd. …" gesperrt={!!(imStamm && partnerAdresse(imStamm).zusatz)} {...a("zusatz")} />
        <F label="Strasse" id="kalk-adr-strasse" text gesperrt={!!imStamm} {...a("strasse")} />
        <F label="Land" id="kalk-adr-land" text platz="CH" gesperrt={!!imStamm} {...a("land")} />
        <F label="PLZ" id="kalk-adr-plz" text gesperrt={!!imStamm} {...a("plz")} />
        <F label="Ort" id="kalk-adr-ort" text gesperrt={!!imStamm} {...a("ort")} />
      </section>
      </div>
    </div>
  );
}

// Dokumente der Kalkulation (k.dokumente [{ art: "anfrage" | "zeichnung", name,
// pfad, url, typ }]) in der Ablage zeichnungen/erp/kalkulation/. Hineinziehen
// oder „+ Datei“; antippen zeigt sie im Betrachter.
const DOK_ARTEN = [["anfrage", "Kundenanfrage"], ["zeichnung", "Zeichnung"]];
function KalkDokumente({ k, setK }) {
  const [laedt, setLaedt] = useState("");
  const [ueber, setUeber] = useState("");
  const hatDateien = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));
  const doks = Array.isArray(k.dokumente) ? k.dokumente : [];
  async function hochladen(art, dateien) {
    if (!dateien.length) return;
    setLaedt(art);
    try {
      const neu = [];
      for (const d of dateien) {
        const endung = ((d.name || "").match(/\.([a-z0-9]+)$/i) || [, (d.type || "").split("/")[1] || "bin"])[1].toLowerCase();
        const pfad = "erp/kalkulation/" + art + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + endung;
        const r = await alt.zeitlimit(alt.db.storage.from("zeichnungen").upload(pfad, d,
          { contentType: d.type || "application/octet-stream", upsert: false }), 120000, "Dokument hochladen");
        if (r.error) throw r.error;
        neu.push({ art, name: d.name || "Dokument", pfad, typ: d.type || "", url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl });
      }
      setK((x) => ({ ...x, dokumente: [...(Array.isArray(x.dokumente) ? x.dokumente : []), ...neu] }));
      alt.meldung(neu.length === 1 ? "Dokument abgelegt. Mit Speichern sichern." : neu.length + " Dokumente abgelegt. Mit Speichern sichern.", "gut");
    } catch (f) { alt.meldung("Dokument nicht hochgeladen: " + alt.fehlertext(f), "fehler"); }
    setLaedt("");
  }
  const ansehen = (d) => alt.betrachter(d.url, d.name, /pdf/i.test(d.typ || "") || /\.pdf$/i.test(d.name || ""));
  async function weg(d) {
    const w = await auswahlDialog("Dokument entfernen?", [{ wert: "ja", text: "Entfernen" }], d.name);
    if (w !== "ja") return;
    setK((x) => ({ ...x, dokumente: (x.dokumente || []).filter((y) => y.pfad !== d.pfad) }));
  }
  return (
    <div className="kalk-doks">
      {DOK_ARTEN.map(([art, titel]) => {
        const liste = doks.filter((d) => d.art === art);
        return (
          // Eigenes Ablegen je Zeile: der allgemeine Helfer wirkt nur im
          // Hauptfenster, die Kalkulation läuft aber im eigenen Browserfenster
          // (Patrick 28. November 2026: „hineinziehen geht nicht“)
          <div key={art} className={"kalk-dok" + (ueber === art ? " kalk-dok--ueber" : "")} data-kalk-dok={art}
            onDragEnter={(e) => { if (hatDateien(e)) { e.preventDefault(); setUeber(art); } }}
            onDragOver={(e) => { if (hatDateien(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (ueber !== art) setUeber(art); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setUeber(""); }}
            onDrop={(e) => { if (!hatDateien(e)) return; e.preventDefault(); e.stopPropagation(); setUeber(""); hochladen(art, [...e.dataTransfer.files]); }}>
            <span className="kalk-dok__titel">{titel}</span>
            <div className="kalk-dok__liste">
              {liste.map((d) => (
                <span key={d.pfad} className="kalk-dok__datei">
                  <button type="button" className="knopf knopf--klein knopf--still" data-kalk-dok-ansehen={d.pfad} title="Ansehen" onClick={() => ansehen(d)}>{/pdf/i.test(d.typ || d.name) ? "📄" : "🖼"} {d.name}</button>
                  <button type="button" className="knopf knopf--klein knopf--still" title="Entfernen" onClick={() => weg(d)}>✕</button>
                </span>))}
              <label className="knopf knopf--klein kalk-dok__neu">
                {laedt === art ? "Lädt …" : liste.length ? "+ weitere" : "+ Datei hineinziehen oder wählen"}
                <input type="file" multiple hidden accept=".pdf,image/*,.tif,.tiff" data-kalk-dok-datei={art}
                  onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; hochladen(art, f); }} />
              </label>
            </div>
          </div>);
      })}
    </div>
  );
}

function Material({ k, setze, setK, rechnung, winkalk }) {
  const [matJe, setMatJe] = useState(false);
  const m = k.material;
  const f = (name) => ({ wert: m[name], setzen: (w) => setze("material." + name, w) });
  const r0 = rechnung[0];
  // Masse je Körper wie in der Einsatzgewichtsberechnung des Gewatec (Wunsch Patrick 26. November 2026)
  const form = m.form || "rund";
  const masse = form === "vierkant" ? <><F label="a" einheit="mm" id="kalk-d" {...f("d")} /><F label="b" einheit="mm" id="kalk-b" platz="= a" {...f("b")} /></>
    : form === "sechskant" ? <F label="s Schlüsselweite" einheit="mm" id="kalk-d" {...f("d")} />
    : form === "rohr" ? <><F label="Ø aussen" einheit="mm" id="kalk-d" {...f("d")} /><F label="Ø innen" einheit="mm" id="kalk-di" {...f("di")} /></>
    : <F label="Ø" einheit="mm" id="kalk-d" {...f("d")} />;
  // Alles je Preiseinheit wie oben bei „Preis pro“ gewählt (Wunsch Patrick 26. November 2026)
  const pe = peWert(k.preis.pe);
  // Rohmaterial aus den Stammdaten des Test ERP wählen
  const stamm = useErpStamm();
  const roh = stamm.artikel.filter((x) => x.art === "rohmaterial");
  const matWahl = useWahl(stammTreffer(roh, m.bez, (a) => [a.nr, a.bezeichnung]).map((a) => ({
    id: a.id, titel: a.bezeichnung || a.nr, unter: a.bezeichnung && a.bezeichnung !== a.nr ? a.nr : "", a })), (t) => {
    const bez = t.a.bezeichnung || t.a.nr;
    const w = werkstoffGenau(bez); const z = materialZerlegen(bez);
    setK((x) => ({ ...x, material: { ...x.material, bez, nr: (w && w.nr) || x.material.nr, d: z && z.d ? String(z.d) : x.material.d } }));
  });
  const matZeigen = matJe || k.staffeln.some((s) => Object.values(s.mat || {}).some((v) => String(v ?? "").trim()));
  return (
    <>
      {/* Staffeln nebeneinander, Lose darunter, damit nichts rollt
          (Wunsch Patrick 27. Oktober 2026) */}
      <section className="karte kalk-rolle">
        <h2>Staffelmengen <small className="kalk-einheit">Lose: wie oft gerüstet wird, jedes weitere Los mit „Folgerüsten“</small> <button type="button" className="linkknopf" id="kalk-matje"
          onClick={() => setMatJe((x) => !x)}>{matZeigen ? "▾" : "▸"} Material je Staffel</button></h2>
        {/* Preis pro 1, 100 oder 1000 Stk (Wunsch Patrick 21. November 2026),
            seit 1.844.0 vorne bei den Staffeln (Wunsch Patrick 25. November 2026);
            Angebots- und Zielpreis gelten dann für diese Menge */}
        <table className="kalk-tab kalk-eng kalk-staffeltab" id="kalk-staffeln">
          <tbody>
            <tr><td><label className="kalk-mini kalk-pe-vorne"><span>Preis pro</span>           <select id="kalk-pe" value={String(peWert(k.preis.pe))} onChange={(e) => setze("preis.pe", e.target.value)}>             {PREISEINHEITEN.map((x) => <option key={x} value={String(x)}>{peText(x)}</option>)}           </select>         </label></td>{k.staffeln.map((s, i) => <th key={i} className="rechts" data-staffel-zeile={i}>Staffel {i + 1}
              {k.staffeln.length > 1 && <button className="linkknopf linkknopf--gefahr kalk-staffel-weg" data-staffel-weg={i} title="Staffel entfernen"
                onClick={() => setK((x) => ({ ...x, staffeln: x.staffeln.filter((_, j) => j !== i) }))}>✕</button>}</th>)}
              <td rowSpan={matZeigen ? 6 : 3}><button className="knopf knopf--klein" id="kalk-staffel-neu"
                onClick={() => setK((x) => ({ ...x, staffeln: [...x.staffeln, { menge: "", lose: "1", preis: { ...((x.staffeln[0] || {}).preis || {}) } }] }))}>+ Staffel</button></td></tr>
            <tr><td>Menge <span className="kalk-einheit">Stk</span></td>{k.staffeln.map((s, i) => (
              <td key={i} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-menge-" + i}
                value={s.menge || ""} onChange={(e) => setze("staffeln." + i + ".menge", e.target.value)} /></td>))}</tr>
            <tr><td>Lose</td>{k.staffeln.map((s, i) => (
              <td key={i} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-lose-" + i}
                value={s.lose || ""} onChange={(e) => setze("staffeln." + i + ".lose", e.target.value)} /></td>))}</tr>
            {/* Material je Staffel wie im Gewatec, leer = Wert beim Material unten;
                nur aufgeklappt oder wenn eine Staffel eigene Werte hat, damit nichts rollt */}
            {matZeigen && [["preis", "Materialpreis", "CHF/kg", "kalk-smatpreis-"], ["gk", "Mat.-GK", "%", "kalk-smatgk-"], ["gkPausch", "Mat.-GK pauschal", "CHF", "kalk-smatgkp-"]].map(([n, t, e, id]) => (
              <tr key={n}><td>{t} <span className="kalk-einheit">{e}</span></td>{k.staffeln.map((s, i) => (
                <td key={i} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={id + i}
                  placeholder={String((k.material || {})[n] ?? "")}
                  value={(s.mat || {})[n] || ""} onChange={(e2) => setze("staffeln." + i + ".mat." + n, e2.target.value)} /></td>))}</tr>))}
          </tbody>
        </table>
      </section>

      <section className="karte">
        <div className="kalk-mat-kopf">
          <h2>Material</h2>
          <div className="moduswahl kalk-modus">
            {[["rechnen", "Aus Länge und Stange rechnen"], ["hand", "Einsatzgewicht je Stück eintragen"]].map(([w, t]) => (
              <button key={w} className={"moduswahl__knopf" + (m.modus === w ? " aktiv" : "")} data-matmodus={w}
                onClick={() => setze("material.modus", w)}>{t}</button>))}
          </div>
          <div className="moduswahl kalk-modus" id="kalk-form">
          {MAT_FORMEN.map(([w, t]) => (
            <button key={w} className={"moduswahl__knopf" + ((m.form || "rund") === w ? " aktiv" : "")} data-matform={w}
              onClick={() => setze("material.form", w)}>{t}</button>))}
          </div>
        </div>
        <div className="kalk-reihe">
          <F label="Materialbezeichnung" id="kalk-mat" text breit wahl={matWahl} {...f("bez")} />
          <F label="Werkstoff-Nr." id="kalk-matnr" text {...f("nr")} />
          <F label="Fertiggewicht" einheit="kg/Stk" id="kalk-fertig" {...f("fertig")} />
          <F label="Spänepreis" einheit="CHF/kg" id="kalk-spanpreis" {...f("spanPreis")} />
        </div>
        <div className="kalk-reihe">
          <F label="Materialpreis" einheit="CHF/kg" id="kalk-matpreis" {...f("preis")} />
          <F label="Material-Gemeinkosten" einheit="%" id="kalk-matgk" {...f("gk")} />
          <F label="Material-Gemeinkosten pauschal" einheit="CHF" id="kalk-matgkp" {...f("gkPausch")} />
          <F label="Ausschuss" einheit="%" id="kalk-ausschuss" platz="0" {...f("ausschuss")} />
        </div>
        <div className="kalk-reihe">
          <F label="Abmessung" id="kalk-abmessung" text platz="Stange Ø 12.7 x 73.5 geschliffen" {...f("abmessung")} />
          <label className="feld kalk-feld"><span>Spezifisches Gewicht von</span>
            <select id="kalk-spez" value={(SPEZ_GEWICHT.find(([, w]) => z(w) === z(m.dichte)) || [""])[0]}
              onChange={(e) => { const x = SPEZ_GEWICHT.find(([n]) => n === e.target.value); if (x) setze("material.dichte", x[1]); }}>
              <option value="">– eigener Wert –</option>
              {SPEZ_GEWICHT.map(([n, w]) => <option key={n} value={n}>{n} ({w})</option>)}
            </select>
          </label>
        </div>
        {m.modus === "rechnen"
          ? <div className="kalk-reihe">
              {masse}
              <F label="Länge Fertigteil" einheit="mm" id="kalk-laenge" {...f("laenge")} />
              <F label="Abstechbreite" einheit="mm" id="kalk-abstich" {...f("abstich")} />
              <F label="Plandrehzugabe" einheit="mm" id="kalk-plan" {...f("plan")} />
              <F label="Stangenlänge" einheit="mm" id="kalk-stange" platz="3000" {...f("stange")} />
              <F label="Reststück" einheit="mm" id="kalk-rest" {...f("rest")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>
          : <div className="kalk-reihe">
              <F label="Materialeinsatz" einheit="kg/Stk" id="kalk-einsatz" {...f("einsatz")} />
              {masse}
              <F label="Stangenlänge" einheit="mm" id="kalk-stange" platz="3000" {...f("stange")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>}
      </section>

      {rechnung.length > 0 &&
        <section className="karte kalk-rolle">
          <table className="tabelle kalk-tab kalk-eng" id="kalk-mat-tab">
            <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)}</th>)}</tr></thead>
            <tbody>
              <Zeile titel="kg gesamt" werte={rechnung.map((r) => chf(r.mat.kg, 1))} />
              <Zeile titel="Meter gesamt" werte={rechnung.map((r) => chf(r.mat.meter, 1))} />
              <Zeile titel="Stangen" werte={rechnung.map((r) => chf(r.mat.stangen, 1))} />
              {m.modus === "rechnen" && <>
                <Zeile titel="Stück je Stange" werte={rechnung.map((r) => chf(r.mat.jeStange, 0))} />
                <Zeile titel="Rest je Stange" einheit="mm" werte={rechnung.map((r) => chf(r.mat.restStange, 1))} />
                <Zeile titel="Stangengewicht" einheit="kg" werte={rechnung.map((r) => chf(r.mat.stangeKg, 4))} />
                <Zeile titel="Einsatz je Stück inkl. Ausschuss" einheit="kg" werte={rechnung.map((r) => chf(r.mat.einsatzKg, 4))} />
              </>}
              {m.modus !== "rechnen" && <Zeile titel="kg je Stück" werte={rechnung.map((r) => chf(r.mat.kgJeStk, 4))} />}
              <Zeile titel="Mat-Kosten = kg gesamt × Preis" einheit="CHF" werte={rechnung.map((r) => chf(r.mat.roh))} klein />
              {z(m.fertig) > 0 && <>
                <Zeile titel="Fertiggewicht gesamt" einheit="kg" werte={rechnung.map((r) => chf(r.mat.fertigKg, 1))} />
                <Zeile titel="Späne gesamt = kg gesamt − Fertiggewicht" einheit="kg" werte={rechnung.map((r) => chf(r.mat.spaeneKg, 1))} />
                <Zeile titel="Späne je Stück" einheit="kg" werte={rechnung.map((r) => chf(r.mat.spaeneJeStk, 4))} />
                {z(m.spanPreis) > 0 && <Zeile titel="Spänegutschrift = Späne × Spänepreis" einheit="CHF" werte={rechnung.map((r) => chf(-r.mat.gutschrift))} />}
              </>}
              <Zeile titel={z(m.fertig) > 0 && z(m.spanPreis) > 0 ? "Materialkosten mit GK, abzüglich Späne" : "Materialkosten mit Gemeinkosten"} einheit="CHF" werte={rechnung.map((r) => chf(r.mat.kosten))} />
              <Zeile titel={"Material je " + peText(pe)} einheit="CHF" fett werte={rechnung.map((r) => chf(r.matStk * pe, 4))} />
            </tbody>
          </table>
          {r0 && (r0.mat.ausschuss > 0 || r0.mat.kgJeM > 0) && <p className="hinweis" id="kalk-ausschuss-hinweis">
            {r0.mat.ausschuss > 0 && <>{m.modus === "rechnen" ? "Einsatz, kg, Meter und Stangen" : "kg, Meter und Stangen"} inkl. {chf(r0.mat.ausschuss, z(m.ausschuss) % 1 ? 1 : 0)} % Ausschuss. </>}
            {r0.mat.kgJeM > 0 && <>{chf(r0.mat.kgJeM, 3)} kg je Meter Stange.</>}</p>}
        </section>}
      <GewatecMaterial winkalk={winkalk} />
    </>
  );
}

// Materialrechnung, wie sie im Gewatec (WinKalk) gespeichert war, nur zum Ansehen.
// Wunsch Patrick 25. November 2026: „ich will sehen wie gerechnet wurde“.
function GewatecMaterial({ winkalk }) {
  const st = (winkalk?.staffeln || []).filter((s) => Number(s?.Stueckzahl) > 0);
  if (!st.length) return null;
  const kopf = winkalk.kopf || {};
  const n = (s, f) => { const v = Number(s?.[f]); return isFinite(v) ? v : null; };
  const kgStk = (s) => n(s, "Stueckzahl") ? n(s, "EinsatzKilogramm") / n(s, "Stueckzahl") : null;
  const mJe = (s) => n(s, "AnzahlStangen") ? n(s, "EinsatzMeter") / n(s, "AnzahlStangen") : null;
  const zeile = (titel, werte, extra) => <Zeile titel={titel} werte={werte} {...extra} />;
  const s0 = st[0];
  const einsatz = Number(kopf.MaterialEinsatz), fertig = Number(kopf.Fertiggewicht);
  return (
    <section className="karte kalk-rolle" id="kalk-gewatec-mat">
      <h3>So hat Gewatec gerechnet</h3>
      <p className="hinweis">Werte aus dem Gewatec, nur zum Ansehen. {kopf.MatTextZeile1 ? <>Material: <b>{kopf.MatTextZeile1}</b>. </> : null}
        {einsatz > 0 && <>Einsatz {chf(einsatz, 4)} kg/Stk. </>}{fertig > 0 && <>Fertiggewicht {chf(fertig, 4)} kg/Stk.</>}</p>
      <table className="tabelle kalk-tab kalk-eng">
        <thead><tr><th>Menge</th>{st.map((s, i) => <th key={i} className="rechts">{chf(n(s, "Stueckzahl"), 0)}</th>)}</tr></thead>
        <tbody>
          {zeile("Fertigungslose", st.map((s) => chf(n(s, "FertigungsLose"), 0)))}
          {zeile("Stangen", st.map((s) => chf(n(s, "AnzahlStangen"), 2)))}
          {zeile("Einsatz Meter", st.map((s) => chf(n(s, "EinsatzMeter"), 2)))}
          {zeile("Meter je Stange", st.map((s) => chf(mJe(s), 3)), { klein: true })}
          {zeile("Einsatz kg", st.map((s) => chf(n(s, "EinsatzKilogramm"), 2)))}
          {zeile("kg je Stück = kg ÷ Menge", st.map((s) => chf(kgStk(s), 4)))}
          {zeile("Materialpreis CHF/kg", st.map((s) => chf(n(s, "Materialpreis"), 4)))}
          {zeile("Einzelkosten je Stück", st.map((s) => chf(n(s, "MaterialEinzelkosten"), 4)))}
          {zeile("Mat.-GK %", st.map((s) => chf(n(s, "MaterialGemeinkosten"), 2)))}
          {zeile("Mat.-GK pauschal CHF", st.map((s) => chf(n(s, "MaterialkostenGemPauschal"), 2)))}
          {zeile("Material gesamt je Stück", st.map((s) => chf(n(s, "MaterialGesamtkosten1") ?? n(s, "MaterialGesamtkosten2"), 4)), { fett: true })}
        </tbody>
      </table>
      <p className="hinweis" id="kalk-gewatec-formel">Staffel 1: {chf(n(s0, "EinsatzKilogramm"), 2)} kg ÷ {chf(n(s0, "Stueckzahl"), 0)} Stk = {chf(kgStk(s0), 4)} kg/Stk × {chf(n(s0, "Materialpreis"), 2)} CHF/kg = {chf(kgStk(s0) * n(s0, "Materialpreis"), 4)} CHF/Stk</p>
    </section>
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
  // Kosten je Preiseinheit wie bei „Preis pro“ gewählt (Wunsch Patrick 26. November 2026)
  const pe = peWert(k.preis.pe);
  // Aufgeklappte Arbeitsgänge; zugeklappt steht jeder als eine Zeile wie im Gewatec (Wunsch Patrick 27. Oktober 2026)
  const [auf, setAuf] = useState(() => new Set());
  const umschalten = (key) => setAuf((x) => { const n = new Set(x); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const neu = (art) => {
    const key = schluessel();
    setAuf((x) => new Set(x).add(key));
    setK((x) => ({ ...x, ags: [...x.ags, art === "extern"
      ? { key, bez: "", art: "extern", je: "stk", extern: "", ruestPausch: "" }
      : { key, bez: "", art: "intern", masch: "", te: "", erst: "", folge: "", fgk: "" }] }));
  };
  // Jeder Arbeitsgang braucht einen festen Schlüssel fürs Ziehen
  const ags = k.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));

  return (
    <>
      {!maschinen.length && <div className="karte karte--hinweis"><p>Noch keine Stundensätze. Zuerst unter
        „Alle Kalkulationen“ → „Stundensätze der Maschinen“ eine Maschine anlegen.</p></div>}
      {/* Die Liste „Fertigungslose je Staffel“ über den Arbeitsgängen ist seit 1.237.2 weg:
          die Lose stehen schon in den Tabellen je Staffel der Arbeitsgänge (Wunsch Patrick 27. Oktober 2026) */}
      <div className="kalk-ag-titel" aria-hidden="true">
        <span></span><span>AG</span><span>Bezeichnung</span><span>Maschine / Lieferant</span><span className="rechts">te Sek.</span>
        <span className="rechts">tr Std</span><span className="rechts">FGK</span><span className="rechts">CHF/{peText(pe)}</span><span></span>
      </div>
      <ZiehListe id="kalk-ags" className="kalk-ags" darf={true}
        ordnen={(reihe) => setK((x) => {
          const mit = x.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));
          return { ...x, ags: reihe.map((key) => mit.find((a) => a.key === key)).filter(Boolean) };
        })}
        eintraege={ags.map((a, i) => {
          const r = r0 && r0.ags[i];
          const f = (name) => ({ wert: a[name], setzen: (w) => setze("ags." + i + "." + name, w) });
          const offen = auf.has(a.key);
          const ext = a.art === "extern";
          const mm = !ext && maschinen.find((q) => q.id === a.masch);
          const ruest = [a.erst, a.folge].filter((x) => String(x || "").trim()).join(" / ");
          return { key: a.key, inhalt:
            <div className={"kalk-ag" + (ext ? " kalk-ag--extern" : "") + (offen ? " kalk-ag--auf" : "")} data-ag={i}
              onPointerDown={(e) => { if (e.target.closest("input, select, textarea, button")) e.stopPropagation(); }}>
              <div className="kalk-ag__kopf" onClick={(e) => { if (!e.target.closest("input, select, button")) umschalten(a.key); }}>
                <button className="kalk-ag__auf" data-ag-auf={i} aria-expanded={offen} title={offen ? "Zuklappen" : "Aufklappen"}
                  onClick={() => umschalten(a.key)}>{offen ? "▴" : "▾"}</button>
                <span className="kalk-ag__pos">{(i + 1) * 10}</span>
                <input className="kalk-ag__bez" id={"kalk-ag-bez-" + i} value={a.bez} placeholder="Arbeitsgang wählen oder schreiben"
                  list={a.art === "extern" ? "kalk-ag-vorlagen-extern" : "kalk-ag-vorlagen"}
                  onChange={(e) => {
                    const t = e.target.value;
                    setze("ags." + i + ".bez", t);
                    // Drehen hat im Gewatec 56 % FGK, vorbelegt solange das Feld leer ist (Wunsch Patrick 27. Oktober 2026)
                    if (a.art !== "extern" && /^drehen/i.test(t) && !String(a.fgk || "").trim()) setze("ags." + i + ".fgk", FGK_DREHEN);
                    // Kostenstelle aus dem Namen; eine selbst gewählte Maschine bleibt (Wunsch Patrick 25. November 2026)
                    if (a.art !== "extern") {
                      const ks = kostenstelleFuer(t, maschinen);
                      const kids = START_MASCHINEN.map((n) => kostenstelleFuer(n, maschinen)).filter(Boolean);
                      if (ks && ks !== a.masch && (!a.masch || kids.includes(a.masch))) setze("ags." + i + ".masch", ks);
                    }
                  }} />
                <span className="kalk-ag__ort">{ext ? <><i>Extern</i> {a.lieferant || ""}</> : (mm ? mm.name : <i>keine Maschine</i>)}</span>
                <span className="kalk-ag__zahl">{ext ? (a.extern ? chf(z(a.extern), 2) + " /" + ({ stk: "Stk", "100stk": "100", "1000stk": "1000", kg: "kg" }[a.je || "stk"]) : "") : (a.te || "")}</span>
                <span className="kalk-ag__zahl">{ext ? "" : ruest}</span>
                <span className="kalk-ag__zahl">{ext || !String(a.fgk || "").trim() ? "" : a.fgk + " %"}</span>
                <b className="kalk-ag__summe" title={"Kosten je " + peText(pe) + " bei der ersten Staffel"}>{r ? chf(r.kosten / r0.menge * pe, 4) : "–"}</b>
                <button className="kalk-ag__weg" data-ag-weg={i} title="Arbeitsgang entfernen"
                  onClick={() => setK((x) => ({ ...x, ags: x.ags.filter((_, j) => j !== i) }))}>✕</button>
              </div>
              {offen && (ext
                ? <div className="kalk-extern">
                    <div className="kalk-reihe">
                      <LieferantFeld id={"kalk-ag-lief-" + i} wert={a.lieferant} setzen={(w) => setK((x) => ({ ...x, ags: x.ags.map((g, j) => j === i ? { ...g, lieferant: w, lieferant_id: undefined } : g) }))}
                        nimm={(p) => setK((x) => ({ ...x, ags: x.ags.map((g, j) => j === i ? { ...g, lieferant: p.name, lieferant_id: p.id, lieferant_nr: p.nr } : g) }))} />
                      <label className="feld kalk-feld"><span>Kostensatz je</span>
                        <select id={"kalk-ag-je-" + i} value={a.je || "stk"} onChange={(e) => setze("ags." + i + ".je", e.target.value)}>
                          <option value="stk">1 Stk</option><option value="100stk">100 Stk</option>
                          <option value="1000stk">1000 Stk</option><option value="kg">kg</option>
                        </select>
                      </label>
                      <F label="Kostensatz" einheit="CHF" id={"kalk-ag-ext-" + i} {...f("extern")} />
                      <F label="Gewicht je Stück" einheit="kg" id={"kalk-ag-kg-" + i} {...f("kgStk")}
                        platz={r ? chf(r.kgStk, 4) : ""} hinweis="Leer = Materialeinsatz je Stück" />
                    </div>
                    <div className="kalk-reihe">
                      <F label="Postensatz pauschal" einheit="CHF" id={"kalk-ag-posten-" + i} {...f("posten")} />
                      <F label="bis" einheit="kg" id={"kalk-ag-postenbis-" + i} {...f("postenBis")}
                        hinweis="Postensatz statt Kostensatz bis zu diesem Gewicht, leer = immer" />
                    </div>
                    <table className="kalk-extern__neben">
                      <thead><tr><th></th><th>CHF je Stk</th><th>CHF pauschal</th><th></th></tr></thead>
                      <tbody>{EXTERN_NEBEN.map(([n, titel, verr]) => (
                        <tr key={n}><td>{titel}</td>
                          <td><input type="text" inputMode="decimal" id={"kalk-ag-" + n + "stk-" + i} value={a[n + "Stk"] || ""}
                            onChange={(e) => setze("ags." + i + "." + n + "Stk", e.target.value)} /></td>
                          <td><input type="text" inputMode="decimal" id={"kalk-ag-" + n + "p-" + i}
                            value={(n === "ruest" && a.ruestPausch == null ? a.externRuest : a[n + "Pausch"]) || ""}
                            onChange={(e) => setze("ags." + i + "." + n + "Pausch", e.target.value)} /></td>
                          <td>{verr && <label className="kalk-haken"><input type="checkbox" id={"kalk-ag-" + n + "v-" + i}
                            checked={a[n + "Verr"] !== false} onChange={(e) => setze("ags." + i + "." + n + "Verr", e.target.checked)} /> Verrechnen</label>}</td>
                        </tr>))}</tbody>
                    </table>
                    <ExternJeStaffel a={a} i={i} k={k} setK={setK} rechnung={rechnung} />
                  </div>
                : <div className="kalk-reihe">
                    <label className="feld kalk-feld"><span>Maschine</span>
                      <select id={"kalk-ag-m-" + i} value={a.masch || ""} onChange={(e) => setze("ags." + i + ".masch", e.target.value)}>
                        <option value="">– wählen –</option>
                        {/* „Nicht mehr vorhanden“ (seit 1.918.0) nur, wenn sie hier schon steht: alte Kalkulationen rechnen weiter */}
                        {maschinen.filter((m) => !(m.daten && m.daten.weg) || m.id === a.masch)
                          .map((m) => <option key={m.id} value={m.id}>{m.name}{m.daten && m.daten.weg ? " (nicht mehr vorhanden)" : ""}</option>)}
                      </select>
                      {r && r.satz && <span className="feldhinweis">{chf(r.satz.eff)} CHF/h{r.satz.lauf ? " bei " + chf(r.satz.lauf, 1) + " Std/Tag" : ""}, Rüsten {chf(r.satz.ruest)} CHF/h</span>}
                    </label>
                    <F label="Laufzeit" einheit="Std/Tag" id={"kalk-ag-lt-" + i} {...f("laufTag")}
                      platz={(() => { const mm = maschinen.find((q) => q.id === a.masch); return mm && mm.daten && mm.daten.laufTag ? String(mm.daten.laufTag) : ""; })()} />
                    <F label="Stückzeit" einheit="Sek." id={"kalk-ag-te-" + i} {...f("te")} />
                    <F label="Erstrüsten" einheit="Std" id={"kalk-ag-er-" + i} {...f("erst")} />
                    <F label="Folgerüsten" einheit="Std" id={"kalk-ag-fr-" + i} {...f("folge")} />
                    <F label="FGK" einheit="%" id={"kalk-ag-fgk-" + i} {...f("fgk")} />
                    <label className="kalk-haken kalk-multi"><input type="checkbox" id={"kalk-ag-multi-" + i} checked={!!a.multi}
                      onChange={(e) => setze("ags." + i + ".multi", e.target.checked)} /> Multimaschinell: je Staffel eigene Werte</label>
                    {a.multi && <JeStaffel a={a} i={i} k={k} setK={setK} maschinen={maschinen} rechnung={rechnung} />}
                  </div>)}
              {offen && r && !r.extern && (r.laufH > 0 || r.ruestChf > 0) &&
                <div className="kalk-ag__fuss">Fix {chf(r.fix / r0.menge * pe, 4)} · Variabel {chf(r.var / r0.menge * pe, 4)} CHF/{peText(pe)}
                  {" "}· Laufzeit {chf(r.laufH, 1)} h · Rüsten {chf(r.ruestChf)} CHF bei {chf(r0.menge, 0)} Stk</div>}
            </div> };
        })} />
      <datalist id="kalk-ag-vorlagen">{AG_VORLAGEN.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="kalk-ag-vorlagen-extern">{AG_VORLAGEN_EXTERN.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="kalk-knoepfe">
        <button className="knopf" id="kalk-ag-intern" onClick={() => neu("intern")}>+ Interner Arbeitsgang</button>
        <button className="knopf" id="kalk-ag-extern" onClick={() => neu("extern")}>+ Externer Arbeitsgang</button>
      </div>
      <p className="hinweis">Kosten = (Laufzeit × Stundensatz + Rüstzeit × Rüstsatz) × (1 + FGK). Zeile antippen klappt den Arbeitsgang auf, am Griff links ziehen ändert die Reihenfolge.</p>
    </>
  );
}

const LAUFZEITEN = [8, 10, 12, 14, 16, 18, 20, 22, 24];

// Arbeitsgänge zur Auswahl, wie „Arbeitsgänge-Auswahl“ im Gewatec
// (Bildschirmfoto Patrick 27. Oktober 2026); freier Text geht auch
// Lieferbedingungen wie im Gewatec (Kürzel, Text), Bild Patrick 27. Oktober 2026
const LIEFERBEDINGUNGEN = [
  ["ABH", "abgeholt"], ["DDP", "DDP Schwanden"], ["EXW D", "ab Werk"], ["EXW E", "ex works"],
  ["EXWEXV", "ab Werk, exkl. Verpackung"], ["EXWEXVT", "ab Werk, exkl. Verpackung/Transport"],
  ["EXWIV", "ab Werk, inkl. Verpackung"], ["EXWSPEZ", "Packing and Delivery not included"], ["F", "franko"],
  ["FCAL", "FCA Lohn-Ammannsegg, packing included"], ["FD", "franko Domizil"], ["FDIV", "franko Domizil, inkl. Verpackung"],
  ["FDIVT", "franko Domizil inkl. Verpackung/Transport"], ["FDZ", "franko Domizil verzollt"],
  ["FGW", "franko Galvano Wullimann, inkl. Verpackung"], ["fHIV", "frei Haus, incl. Verpackung"],
  ["FRH", "Frei Haus, inkl. Verpackung"], ["FRHIVTZ", "Frei Haus, inkl. Verpackung, Transpotkosten und Verzollung"],
  ["LIECHTI", "an Liechti AG - Niederwangen"], ["SCHM", "an Härterei Schmid AG - 4657 Dulliken"],
  ["SPFUX", "Abgh: SpediFux"], ["WBC", "an WBC Härterei AG - Bubikon"],
];

// Versandbedingungen wie im Gewatec, Bild Patrick 27. Oktober 2026
const VERSANDBEDINGUNGEN = [
  ["ABG", "abgeholt"], ["ABGKU", "abgeholt im Auftrag Kunde"], ["CDOM", "per Cargo Domicile"],
  ["COBI", "an Cobianchi AG-3672 Oberdiessbach"], ["DHL", "per DHL"], ["DHL EXP", "per DHL Express"],
  ["EGGER", "via E. Egger, St. Gallen"], ["EMBRU", "an: Embru Werke AG - 8630 Rüti ZH"], ["FEDEX", "per FedEX"],
  ["Ferag", "abgeholt per Camion Ferag"], ["GONDR", "per Gondrand AG, Basel"], ["LGI", "via LGI Logistics"],
  ["LIECHT", "an Liechti AG, 3172 Niederwangen"], ["LÜ", "Lieferung überbracht"],
  ["MICHEL", "an Adrian Michel AG - 5046 Schmiedrued-Walde"], ["PLANZER", "via Planzer Trasporti SA, 6934 Bioggio"],
  ["PODHDP", "per Post/DHL/DPD"], ["POST", "per Post"], ["POSTEXP", "per Post-Express"], ["POSTPRIO", "per Post-Priority"],
  ["POSTURG", "Post Urgent"], ["RERO", "an RERO Waldenburg"], ["Schenker", "via Schenker Storen, Schönenwerd"],
  ["SCHM", "an:Härterei Schmid AG-4657 Dulliken"], ["SPFUX", "per SpediFux"],
  ["TECHNOLAC", "an Technolac, Riedmatt 6, 6373 Ennetbürgen"], ["TNT", "per TNT economy express"],
  ["Tribo", "per Cargo Domizile an Tribo Tech AG"], ["UPS", "per UPS"], ["UPS EXP", "per UPS Express"],
  ["UPS EXPS", "per UPS Express Saver"], ["UPS STAND", "per UPS Standard"], ["USM", "Lieferung an USM Münsingen"],
  ["WBC", "an WBC Härterei, 8608 Bubikon"], ["WULL", "an Galvano Wullimann, 2545 Selzach"],
];

// Zahlungsbedingungen wie im Gewatec, Bild Patrick 27. Oktober 2026
const ZAHLUNGSBEDINGUNGEN = [
  ["10", "10 Tage netto"], ["10230", "10 Tage 2.00% Skonto, 30 Tage netto"], ["10245", "10 Tage 2.00% Skonto, 45 Tage netto"],
  ["10260", "10 Tage 2.00% Skonto, 60 Tage netto"], ["10330", "10 Tage 3.00% Skonto, 30 Tage netto"],
  ["10530", "10 Tage 5.00% Skonto, 30 Tage netto"], ["14230", "14 Tage 2.00% Skonto, 30 Tage netto"],
  ["14330", "14 Tage 3.00% Skonto, 30 Tage netto"], ["14330260", "14 Tage 3% Skonto, 30 Tage 2% Skonto, 60 Tage netto"],
  ["14360", "14 Tage 3.00% Skonto, 60 Tage netto"], ["15", "15 Tage netto"], ["15230", "15 Tage 2.00% Skonto, 30 Tage netto"],
  ["15245", "15 Tage 2.00% Skonto, 45 Tage netto"], ["20445", "20 Tage 4.00% Skonto 45 Tage netto"],
  ["3 x 1/3", "1/3 bei Auftragserteilung, 1/3 bei Lieferung, 1/3 30 Tage netto"], ["30", "30 Tage netto"],
  ["30245", "30 Tage 2.00% Skonto, 45 Tage netto"], ["30260", "30 Tage 2.00% Skonto, 60 Tage netto"],
  ["30360", "30 Tage 3.00% Skonto, 60 Tage netto"], ["30day", "Payment within 30 days"], ["60", "60 Tage netto"],
  ["60290", "60 Tage 2.00% Skonto, 90 Tage netto"], ["6M", "Innert 6 Monaten ab Rechnungsdatum"], ["BAR", "Barzahlung"],
  ["NACH", "per Nachnahme"], ["SOFORT", "Sofort nach Erhalt der Rechnung"], ["VOR", "Lieferung gegen Vorauszahlung"],
];

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
// Multimaschinell: je Staffel eine Zeile mit Laufzeit, Stückzeit,
// Rüsten und FGK; leer gelassen gilt der Wert des Arbeitsgangs darüber
function JeStaffel({ a, i, k, setK, maschinen, rechnung }) {
  const idx = k.staffeln.map((s, j) => (z(s.menge) > 0 ? j : -1)).filter((j) => j >= 0);
  if (!idx.length) return <p className="hinweis">Zuerst unter „Staffeln und Material“ eine Menge eintragen.</p>;
  const setzen = (j, name, wert) => setK((x) => {
    const staffeln = x.staffeln.map((s, n) => (n !== j ? s
      : { ...s, ag: { ...(s.ag || {}), [a.key]: { ...((s.ag || {})[a.key] || {}), [name]: wert } } }));
    return { ...x, staffeln };
  });
  // Aufbau wie die Maske im Gewatec: je Staffel eine Spalte, Werte untereinander
  const spalten = idx.map((j, n) => ({ j, menge: rechnung[n] ? rechnung[n].menge : z(k.staffeln[j].menge),
    eigen: ((k.staffeln[j].ag || {})[a.key]) || {}, r: rechnung[n] && rechnung[n].ags[i] }));
  const feld = (name) => spalten.map(({ j, eigen }) => (
    <td key={j} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ag-s" + j + "-" + name + "-" + i}
      placeholder={a[name] || ""} value={eigen[name] || ""} onChange={(e) => setzen(j, name, e.target.value)} /></td>));
  const pe = peWert(k.preis.pe);
  const wert = (fn, st) => spalten.map(({ j, r, menge }) => <td key={j} className="rechts">{r && menge ? chf(fn(r, menge), st) : "–"}</td>);
  return (
    <div className="kalk-jestaffel kalk-rolle">
      <table className="kalk-tab">
        <tbody>
          <tr className="kalk-fett"><td>Menge</td>{spalten.map(({ j, menge }) => <td key={j} className="rechts">{chf(menge, 0)} Stk</td>)}</tr>
          <tr><td>Fertigungslose</td>{spalten.map(({ j, r }, n) => <td key={j} className="rechts">{rechnung[n] ? rechnung[n].lose : "–"}</td>)}</tr>
          <tr><td>Auslastung <span className="kalk-einheit">Std/Tag</span></td>{feld("laufTag")}</tr>
          <tr className="kalk-blass"><td>Stundensatz fix</td>{wert((r) => r.satz.fix)}</tr>
          <tr className="kalk-blass"><td>Stundensatz var</td>{wert((r) => r.satz.var)}</tr>
          <tr className="kalk-blass"><td>Stundensatz eff</td>{wert((r) => r.satz.eff)}</tr>
          <tr><td>Zeit je Stück <span className="kalk-einheit">Sek.</span></td>{feld("te")}</tr>
          <tr className="kalk-blass"><td>Rüstsatz</td>{wert((r) => r.satz.ruest)}</tr>
          <tr><td>Rüstzeit Erstrüsten <span className="kalk-einheit">Std</span></td>{feld("erst")}</tr>
          <tr><td>Rüstzeit Folgerüsten <span className="kalk-einheit">Std</span></td>{feld("folge")}</tr>
          <tr><td>FGK <span className="kalk-einheit">%</span></td>{feld("fgk")}</tr>
          <tr><td>Fixkosten <span className="kalk-einheit">CHF/{peText(pe)}</span></td>{wert((r, m) => r.fix / m * pe, 4)}</tr>
          <tr><td>Varkosten <span className="kalk-einheit">CHF/{peText(pe)}</span></td>{wert((r, m) => r.var / m * pe, 4)}</tr>
          <tr className="kalk-fett kalk-hervor"><td>Vollkosten <span className="kalk-einheit">CHF/{peText(pe)}</span></td>{wert((r, m) => r.kosten / m * pe, 4)}</tr>
        </tbody>
      </table>
    </div>
  );
}

// Externer Arbeitsgang wie im Gewatec: Kostensatz je Staffel (leer = Satz
// oben), darunter Gewicht und Einzelkosten je Staffel
function ExternJeStaffel({ a, i, k, setK, rechnung }) {
  const idx = k.staffeln.map((s, j) => (z(s.menge) > 0 ? j : -1)).filter((j) => j >= 0);
  if (!idx.length) return null;
  const setzen = (j, wert) => setK((x) => ({ ...x, staffeln: x.staffeln.map((s, n) => (n !== j ? s
    : { ...s, ag: { ...(s.ag || {}), [a.key]: { ...((s.ag || {})[a.key] || {}), extern: wert } } })) }));
  const sp = idx.map((j, n) => ({ j, r: rechnung[n] && rechnung[n].ags[i], menge: rechnung[n] ? rechnung[n].menge : 0,
    eigen: ((k.staffeln[j].ag || {})[a.key]) || {} }));
  const pe = peWert(k.preis.pe);
  return (
    <div className="kalk-jestaffel kalk-rolle">
      <table className="kalk-tab">
        <tbody>
          <tr className="kalk-fett"><td>Stückzahl</td>{sp.map(({ j, menge }) => <td key={j} className="rechts">{chf(menge, 0)}</td>)}</tr>
          <tr><td>Fertigungslose</td>{sp.map(({ j }, n) => <td key={j} className="rechts">{rechnung[n] ? rechnung[n].lose : "–"}</td>)}</tr>
          <tr className="kalk-blass"><td>Gewicht <span className="kalk-einheit">kg</span></td>{sp.map(({ j, r }) => <td key={j} className="rechts">{r ? chf(r.gewicht, 2) : "–"}</td>)}</tr>
          <tr><td>Kostensatz <span className="kalk-einheit">CHF</span></td>{sp.map(({ j, eigen }) => (
            <td key={j} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ag-s" + j + "-extern-" + i}
              placeholder={a.extern || ""} value={eigen.extern || ""} onChange={(e) => setzen(j, e.target.value)} /></td>))}</tr>
          <tr className="kalk-fett kalk-hervor"><td>Einzelkosten <span className="kalk-einheit">CHF/{peText(pe)}</span></td>{sp.map(({ j, r }) => (
            <td key={j} className="rechts">{r ? chf(r.einzel * pe, 4) + (r.posten ? " (Posten)" : "") : "–"}</td>))}</tr>
        </tbody>
      </table>
    </div>
  );
}

function schluessel() { return "ag" + Date.now().toString(36) + (zaehler++); }

function Preis({ k, setze, setK, rechnung }) {
  const f = (name) => ({ wert: k.preis[name], setzen: (w) => setze("preis." + name, w) });
  // Lieferlose, Angebots- und Zielpreis gehören zur Staffel, wie im Gewatec
  // je Stückzahl; die Staffeln mit Menge in derselben Reihenfolge wie rechnung
  const staffelIdx = k.staffeln.map((s, i) => (z(s.menge) > 0 ? i : -1)).filter((i) => i >= 0);
  const R = (fn, st) => rechnung.map((r) => chf(fn(r), st));
  // Beträge je Stück erscheinen je Preiseinheit (Wunsch Patrick 26. November 2026)
  const pe = peWert(k.preis.pe);
  const proE = "CHF/" + peText(pe);
  const RP = (fn, st) => rechnung.map((r) => chf(fn(r) * pe, st));
  const w = WAEHRUNGEN.includes(k.preis.waehrung) ? k.preis.waehrung : "CHF";
  const [holt, setHolt] = useState(false);
  async function kurs(waehrung) {
    setHolt(true);
    try {
      const x = await kursHolen(waehrung);
      setze("preis.kurs", String(x.kurs)); setze("preis.kursDatum", x.datum || ""); setze("preis.kursQuelle", x.quelle || "");
    } catch (e) { alt.meldung("Wechselkurs nicht erhalten. Den Faktor von Hand eintragen.", "warn"); }
    setHolt(false);
  }
  // Die erste Staffel gibt die weiteren vor: wer dort noch gleich war wie
  // die erste, bekommt den neuen Wert mit, eigene Werte bleiben
  const preisStaffel = (i, name, wert) => setK((x) => {
    const st = x.staffeln.map((s) => ({ ...s, preis: { ...(s.preis || {}) } }));
    const vorher = st[staffelIdx[i]].preis[name] || "";
    st[staffelIdx[i]].preis[name] = wert;
    if (i === 0) staffelIdx.slice(1).forEach((j) => { if ((st[j].preis[name] || "") === vorher) st[j].preis[name] = wert; });
    return { ...x, staffeln: st };
  });
  const E = (name) => {
    const [, titel, einheit] = PREIS_JE_STAFFEL.find(([n]) => n === name);
    return (
      <tr key={name} className="kalk-eingabe"><td>{titel} <span className="kalk-einheit">{einheit}</span></td>
        {rechnung.map((r, i) => {
          const eigen = (k.staffeln[staffelIdx[i]].preis || {})[name] || "";
          const erst = (k.staffeln[staffelIdx[0]].preis || {})[name] || "";
          return <td key={i} className={"rechts" + (i > 0 && eigen !== erst ? " kalk-eigen" : "")}>
            <input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ps" + i + "-" + name}
              value={eigen} onChange={(e) => preisStaffel(i, name, e.target.value)} /></td>;
        })}</tr>);
  };
  const hochRef = useBildschirmHoch();
  const SF = (name, i, id, platz) => (
    <td key={id} className="rechts"><input className="kalk-zelle" type="text" id={id} inputMode="decimal" placeholder={platz} value={k.staffeln[staffelIdx[i]][name] || ""}
      onChange={(e) => setze("staffeln." + staffelIdx[i] + "." + name, e.target.value)} /></td>);
  return (
    <>
      {/* Alles Gemeinsame in einer Zeile, damit der Reiter ohne Rollen
          Platz hat (Wunsch Patrick 27. Oktober 2026) */}
      <div className="kalk-preis-leiste">
        <label className="kalk-mini"><span>Runden auf</span>
          <select id="kalk-rundung" value={k.preis.rundung || "0.01"} onChange={(e) => setze("preis.rundung", e.target.value)}>
            <option value="0.01">1 Rappen</option><option value="0.05">5 Rappen</option>
            <option value="0.1">10 Rappen</option><option value="1">1 Franken</option>
          </select>
        </label>
        <label className="kalk-mini"><span>Währung</span>
          <select id="kalk-waehrung" value={w} onChange={(e) => { setze("preis.waehrung", e.target.value); if (e.target.value !== "CHF") kurs(e.target.value); }}>
            {WAEHRUNGEN.map((x) => <option key={x} value={x}>{x === "USD" ? "USD (Dollar)" : x}</option>)}
          </select>
        </label>
        {w !== "CHF" && <>
          <label className="kalk-mini"><span>1 CHF = {w}</span>
            <input type="text" inputMode="decimal" id="kalk-kurs" value={k.preis.kurs || ""} onChange={(e) => setze("preis.kurs", e.target.value)} />
          </label>
          <button className="knopf knopf--klein" id="kalk-kurs-holen" disabled={holt} onClick={() => kurs(w)}>Aktuellen Kurs holen</button>
          <span className="kalk-einheit">{holt ? "Kurs wird geholt …" : k.preis.kursDatum
            ? "Kurs vom " + datumText(k.preis.kursDatum) + (k.preis.kursQuelle ? " (" + k.preis.kursQuelle + ")" : "")
            : "Von Hand eingetragen."}</span>
        </>}
      </div>
      {!rechnung.length && <div className="karte karte--hinweis"><p>Zuerst eine Staffelmenge eintragen.</p></div>}
      {/* Eine Tabelle untereinander in der Reihenfolge der Rechnung:
          Eingaben je Staffel direkt bei dem, was sie ergeben (Wunsch
          Patrick 27. Oktober 2026: „alles untereinander, ohne Scrollen“) */}
      {rechnung.length > 0 &&
        <section className="karte kalk-rolle kalk-preis-karte" id="kalk-preis-jestaffel">
          <table ref={hochRef} className="tabelle kalk-tab kalk-protokoll kalk-eng kalk-enger" id="kalk-preistab">
            <thead><tr><th>Stückzahl <small className="kalk-einheit">die erste Staffel füllt die weiteren gleich aus</small></th>
              {rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)} Stk</th>)}</tr></thead>
            <tbody>
              <Zeile titel="Herstellkosten" einheit={proE} werte={RP((r) => r.herstell, 4)} />
              {E("sek")}{E("vwgk")}
              <Zeile titel="Selbstkosten" einheit={proE} werte={RP((r) => r.selbst, 4)} />
              {E("zinsPct")}{E("zinsMonate")}
              <Zeile titel="Selbstkosten verzinst" einheit={proE} werte={RP((r) => r.selbstVerz, 4)} fett />
              <tr><td>Anzahl Lieferlose</td>{rechnung.map((r, i) => SF("lieferlose", i, "kalk-lieferlose-" + i, "1"))}</tr>
              {E("transport")}{E("transPct")}{E("transPausch")}
              <Zeile titel="Transportkosten gesamt" einheit={proE} werte={RP((r) => r.transport, 4)} />
              {E("verpackung")}{E("verpPct")}{E("verpPausch")}
              <Zeile titel="Verpackungskosten gesamt" einheit={proE} werte={RP((r) => r.verpackung, 4)} />
              {E("gewinn")}{E("prov")}{E("skonto")}{E("rabatt")}
              <Zeile titel="Grenzkosten GK" einheit={proE} werte={RP((r) => r.grenz, 4)} klein />
              <Zeile titel="Marge VK" einheit="CHF" werte={R((r) => r.margeVk, 4)} />
              <Zeile titel="Verkaufspreis VK" einheit={proE} werte={RP((r) => r.vk, 4)} fett />
              <tr><td>Angebotspreis <span className="kalk-einheit">{w}/{peText(k.preis.pe)}</span> <small>leer = VK gerundet</small></td>{rechnung.map((r, i) => SF("angebot", i, "kalk-angebot-" + i, chf(Math.round(r.vk * r.faktor * r.pe / (z(k.preis.rundung) || 0.01)) * (z(k.preis.rundung) || 0.01))))}</tr>
              <tr><td>Zielpreis <span className="kalk-einheit">{w}/{peText(k.preis.pe)}</span></td>{rechnung.map((r, i) => SF("ziel", i, "kalk-ziel-" + i))}</tr>
              <tr className="kalk-fett kalk-hervor"><td>Angebotspreis gilt <span className="kalk-einheit">{w}/{peText(k.preis.pe)}</span></td>{rechnung.map((r, i) => <td key={i} className="rechts" data-kalk-gilt={i}>{chf(r.angebotPe)}</td>)}</tr>
              {/* nur mit Zielpreis, spart sonst eine Zeile */}
              {rechnung.some((r) => r.ziel > 0) &&
                <Zeile titel="Abstand zum Zielpreis" einheit={w + "/" + peText(k.preis.pe)} werte={rechnung.map((r) => (r.zielPe > 0 ? chf(r.angebotPe - r.zielPe, 4) : "–"))} klein />}
            </tbody>
          </table>
        </section>}
    </>
  );
}

// Wie der Knopf „Protokoll“ im Gewatec, mit einer Spalte je Staffel
function Ergebnis({ k, rechnung }) {
  const hochRef = useBildschirmHoch();
  if (!rechnung.length) return <div className="karte karte--hinweis"><p>Zuerst eine Staffelmenge eintragen.</p></div>;
  const R = (f, st) => rechnung.map((r) => chf(f(r), st));
  // Werte je Stück je Preiseinheit wie bei „Preis pro“ (Wunsch Patrick 26. November 2026)
  const pe = peWert(k.preis.pe);
  const RP = (f, st) => rechnung.map((r) => chf(f(r) * pe, st));
  return (
    <section className="karte kalk-rolle kalk-preis-karte">
      <table ref={hochRef} className="tabelle kalk-tab kalk-protokoll kalk-eng kalk-enger" id="kalk-protokoll">
        <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)} Stk <small>· {r.lose} {r.lose === 1 ? "Los" : "Lose"}</small></th>)}</tr></thead>
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
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Je {peText(pe)} in CHF</td></tr>
          <Zeile titel="Material" werte={RP((r) => r.matStk, 4)} />
          <Zeile titel="Fertigung intern" werte={RP((r) => r.internStk, 4)} />
          <Zeile titel="Fertigung extern" werte={RP((r) => r.externStk, 4)} />
          <Zeile titel="Herstellkosten" werte={RP((r) => r.herstell, 4)} fett />
          <Zeile titel="Selbstkosten" werte={RP((r) => r.selbst, 4)} />
          {rechnung.some((r) => r.zins) && <Zeile titel="Selbstkosten verzinst" werte={RP((r) => r.selbstVerz, 4)} />}
          <Zeile titel="Transport und Verpackung" werte={RP((r) => r.fracht, 4)} klein />
          <Zeile titel="Verkaufspreis" werte={RP((r) => r.vk, 4)} />
          <tr className="kalk-fett kalk-hervor"><td>Angebotspreis CHF</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebot * pe, r.waehrung !== "CHF" ? 4 : 2)}</td>)}</tr>
          {rechnung[0].waehrung !== "CHF" && <tr className="kalk-fett"><td>Angebotspreis {rechnung[0].waehrung}</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebotPe)}</td>)}</tr>}
          <Zeile titel="Grenzkosten" werte={RP((r) => r.grenz, 4)} klein />
          <Zeile titel="Deckungsbeitrag" werte={RP((r) => r.db, 4)} />
          <Zeile titel="Deckungsbeitrag" einheit="%" werte={R((r) => r.dbPct, 1)} />
          <Zeile titel="Materialanteil" einheit="%" werte={R((r) => (r.angebot > 0 ? r.matStk / r.angebot * 100 : 0), 1)} klein />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Auftrag</td></tr>
          <Zeile titel="Gewinn" einheit="CHF" werte={R((r) => r.gewinnAuftrag)} />
          <tr className="kalk-fett kalk-hervor"><td>Umsatz CHF</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.umsatz)}</td>)}</tr>
          {rechnung[0].waehrung !== "CHF" && <tr className="kalk-fett"><td>Umsatz {rechnung[0].waehrung}</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.umsatzAus)}</td>)}</tr>}
        </tbody>
      </table>
    </section>
  );
}

function Angebot({ k, setze, nr, rechnung, maschinen, liste, eigeneId }) {
  const f = (name) => ({ wert: k.angebot[name], setzen: (w) => setze("angebot." + name, w) });
  const [laeuft, setLaeuft] = useState(false);
  async function pdf() {
    setLaeuft(true);
    // Seit 1.935.0 wie das Angebot aus dem Gewatec, als Druckblatt im
    // eigenen Fenster (Drucken → „Als PDF speichern“), gleich wie die
    // übrigen Formulare
    try {
      const { angebotDrucken } = await import("./erp/formulare.js");
      angebotDrucken({ k, nr, datumText, adresse: [k.kopf.kunde, ...adresseZeilen(k.kopf)].filter(Boolean).join("\n"),
        zeilen: angebotZeilen(rechnung) });
    }
    catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
    setLaeuft(false);
  }
  // Sammelangebot (Wunsch Patrick 28. November 2026): alle Kalkulationen mit
  // derselben Sammelnummer bzw. demselben Text werden Positionen eines Angebots.
  // Kunde, Anfrage und Bedingungen kommen aus dieser Kalkulation, diese selbst
  // zählt mit ihrem aktuellen (auch ungespeicherten) Stand.
  const sammel = String(k.kopf.sammel || "").trim();
  const andere = sammel ? (liste || []).filter((x) => x.id !== eigeneId && String(kopfAusListe(x).sammel || "").trim().toLowerCase() === sammel.toLowerCase()) : [];
  async function sammelPdf() {
    setLaeuft(true);
    try {
      const teile = [{ k, nr, zeilen: angebotZeilen(rechnung) }];
      for (const x of andere) {
        const e = await kalkulationLaden(x.id);
        if (!e || !e.daten) continue;
        const kk = mitVorgaben(e.daten);
        const r = kk.staffeln.filter((st) => z(st.menge) > 0).map((st) => staffelRechnen(kk, st, maschinen || []));
        teile.push({ k: kk, nr: e.nr, zeilen: angebotZeilen(r) });
      }
      teile.sort((a, b) => String(a.nr || "").localeCompare(String(b.nr || "")));
      const { angebotDrucken } = await import("./erp/formulare.js");
      angebotDrucken({ k, nr, datumText, adresse: [k.kopf.kunde, ...adresseZeilen(k.kopf)].filter(Boolean).join("\n"),
        zeilen: angebotZeilen(rechnung), teile, sammel });
    } catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
    setLaeuft(false);
  }
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Bedingungen</h2>
        <F label="Lieferzeit" id="kalk-lieferzeit" text {...f("lieferzeit")} />
        <F label="Lieferbedingung" id="kalk-lieferbed" text liste="kalk-lieferbed-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("lieferbed")} />
        <datalist id="kalk-lieferbed-liste">{LIEFERBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Versandbedingung" id="kalk-versand" text liste="kalk-versand-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("versand")} />
        <datalist id="kalk-versand-liste">{VERSANDBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Zahlungsbedingung" id="kalk-zahlung" text liste="kalk-zahlung-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("zahlung")} />
        <datalist id="kalk-zahlung-liste">{ZAHLUNGSBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Schlusstext" id="kalk-gueltig" mehrzeilig {...f("gueltig")} />
        <button className="knopf knopf--haupt knopf--breit" id="kalk-pdf" disabled={laeuft || !rechnung.length} onClick={pdf}>
          {laeuft ? "Angebot wird erstellt …" : "Angebot drucken / PDF"}</button>
        <F label="Sammelangebot" id="kalk-sammel" text platz="Sammelnummer oder Text, gleich bei allen Kalkulationen" wert={k.kopf.sammel} setzen={(w) => setze("kopf.sammel", w)} />
        {sammel && <div className="hinweis" id="kalk-sammel-info">
          <p>{andere.length ? "Zusammen mit " + andere.length + (andere.length === 1 ? " weiteren Kalkulation" : " weiteren Kalkulationen") + ":"
            : "Noch keine andere Kalkulation mit „" + sammel + "“. Gespeicherte Kalkulationen mit demselben Eintrag kommen dazu."}</p>
          {andere.length > 0 && <ul className="kalk-artikel-da__liste">{andere.map((x) => (
            <li key={x.id} data-kalk-sammel={x.id}><b>{x.nr || "ohne Nr."}</b>{x.artikel ? " · " + x.artikel : ""}{kopfAusListe(x).bezeichnung ? " · " + kopfAusListe(x).bezeichnung : ""}</li>))}</ul>}
          <button className="knopf knopf--breit" id="kalk-sammel-pdf" disabled={laeuft || !rechnung.length} onClick={sammelPdf}>
            Sammelangebot drucken / PDF ({andere.length + 1} {andere.length ? "Positionen" : "Position"})</button>
        </div>}
      </section>
      <section className="karte kalk-blatt" id="kalk-vorschau" aria-label="Vorschau des Angebots">
        <div className="kalk-blatt__band"><b>HOFER + CO</b><span>Hofer+Co Präzisionsdrehteile AG · Alte Bernstrasse 24 · CH-4573 Lohn-Ammannsegg</span></div>
        <div className="kalk-blatt__oben">
          <div><h3>Angebot</h3><div>Angebots-Nr. {nr}</div><div>Datum {heuteText()}</div>
            </div>
          <div className="kalk-blatt__an">{[k.kopf.kunde, ...adresseZeilen(k.kopf)].filter(Boolean).join("\n")}</div>
        </div>
        {(k.kopf.anfrage || k.kopf.anfrage_nr) && <p><b>Ihre Anfrage{k.kopf.anfrage_nr ? " Nr. " + k.kopf.anfrage_nr : ""}{k.kopf.anfrage ? " vom " + datumText(k.kopf.anfrage) : ""}</b></p>}
        <dl className="kalk-blatt__teil">
          <dt>Bezeichnung</dt><dd>{k.kopf.bezeichnung}</dd>
          <dt>Werkstoff</dt><dd>{k.material.bez}</dd>
          {k.material.nr && <><dt>Werkst. Nr.</dt><dd>{k.material.nr}</dd></>}
          <dt>Artikel-Code</dt><dd>{k.kopf.artikel}</dd>
          <dt>Zeichnung</dt><dd>{k.kopf.zeichnung}{k.kopf.index ? " / Index: " + k.kopf.index : ""}</dd>
          {k.kopf.ident && <><dt>Kunden Ident-Nr.</dt><dd>{k.kopf.ident}</dd></>}
        </dl>
        <table className="kalk-blatt__preise">
          <thead><tr><th>Pos</th><th className="rechts">Menge</th><th>ME</th><th className="rechts">Preis (exkl. MwSt.)</th><th className="rechts">Pro</th></tr></thead>
          <tbody>{rechnung.map((r, i) => <tr key={i}><td>{i + 1}</td><td className="rechts">{chf(r.menge, 0)}</td><td>Stk</td>
            <td className="rechts">{chf(r.angebotPe)} {r.waehrung}</td><td className="rechts">{chf(r.pe, 0)}</td></tr>)}</tbody>
        </table>
        <dl className="kalk-blatt__teil">
          <dt>Lieferzeit</dt><dd>{k.angebot.lieferzeit}</dd>
          <dt>Lieferbedingung</dt><dd>{k.angebot.lieferbed}</dd>
          {k.angebot.versand && <><dt>Versandbedingung</dt><dd>{k.angebot.versand}</dd></>}
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
      {/* Nicht mehr vorhandene Maschinen unten */}
      {[...maschinen].sort((a, b) => !!(a.daten && a.daten.weg) - !!(b.daten && b.daten.weg)).map((m) => (
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
    const weg = await alt.loeschen({ titel: "Stundensatz löschen?", text: m.name + " wird gelöscht. Kalkulationen, die ihn brauchen, rechnen dort mit 0. Gibt es die Maschine nur nicht mehr, besser „Nicht mehr vorhanden“ anhaken.",
      tabelle: "kalk_maschinen", id: m.id, rueckText: "Stundensatz löschen" });
    if (weg) neu();
  }
  return (
    <section className="karte kalk-masch" data-kmasch={m.id}>
      <button className={"kalk-masch__kopf" + (x.daten.weg ? " kalk-masch--weg" : "")} onClick={umschalten} aria-expanded={offen}>
        <b>{x.name}{x.daten.weg ? " · nicht mehr vorhanden" : ""}</b>
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
        {/* Statt löschen (seit 1.918.0, Patrick 27. November 2026: Maschinen, die wir nicht mehr haben):
            Sätze bleiben, alte Kalkulationen rechnen weiter, für neue Arbeitsgänge nicht mehr wählbar */}
        <label className="feld-haken kalk-masch-weg" data-kmasch-nichtmehr={m.id}>
          <input type="checkbox" checked={!!x.daten.weg} onChange={(e) => setX((v) => ({ ...v, daten: { ...v.daten, weg: e.target.checked } }))} />
          <span>Nicht mehr vorhanden (alte Kalkulationen rechnen weiter, für neue nicht mehr wählbar)</span></label>
        <button className="linkknopf linkknopf--gefahr" data-kmasch-weg={m.id} onClick={loeschen}>Diese Maschine löschen</button>
      </div>}
    </section>
  );
}

// Artikel-Codes aus früheren Kalkulationen, die es (noch) nicht in den
// Stammdaten gibt; je Code die jüngste Kalkulation (Liste ist neu zuerst)
function kalkArtikelListe(liste, hofer, eigeneId) {
  const imStamm = new Set(hofer.map((a) => String(a.nr || "").trim().toLowerCase()));
  const je = new Map();
  for (const x of liste || []) {
    const nr = String(x.artikel || "").trim();
    const n = nr.toLowerCase();
    if (!nr || x.id === eigeneId || imStamm.has(n) || je.has(n)) continue;
    je.set(n, { nr, kopf: kopfAusListe(x), kalkNr: x.nr, id: x.id });
  }
  return [...je.values()];
}

// Arbeitsplan eines Hofer-Artikels (Stammdaten) als Arbeitsgänge der
// Kalkulation: Maschine über den Namen der Stundensätze, extern mit Lieferant
function agsAusArbeitsplan(ap, maschinen, lieferanten) {
  const norm = (x) => String(x || "").trim().toLowerCase();
  return ap.map((g) => {
    const key = schluessel();
    if (g.extern || g.lieferant_nr) {
      const l = (lieferanten || []).find((p) => g.lieferant_nr && String(p.nr) === String(g.lieferant_nr))
        || (lieferanten || []).find((p) => norm(p.name) && norm(p.name) === norm(g.maschine));
      return { key, bez: g.bez || "", art: "extern", je: "stk", extern: "", ruestPausch: "",
        lieferant: l ? l.name : g.maschine || "", ...(l ? { lieferant_id: l.id, lieferant_nr: l.nr } : {}) };
    }
    const m = maschinen.find((x) => norm(x.name) && norm(x.name) === norm(g.maschine));
    return { key, bez: g.bez || "", art: "intern", masch: m ? m.id : "", te: g.te != null && g.te !== "" ? String(g.te) : "",
      erst: g.ruest != null && g.ruest !== "" ? String(g.ruest) : "", folge: "", fgk: "" };
  });
}

// Kopf einer Kalkulation aus der Liste (sie holt nur daten->kopf als „kopf“)
function kopfAusListe(x) { return (x && (x.kopf || (x.daten && x.daten.kopf))) || {}; }

function angebotZeilen(rechnung) {
  return rechnung.map((r) => ({ menge: chf(r.menge, 0), preis: chf(r.angebotPe), waehrung: r.waehrung, pe: chf(r.pe || 1, 0) }));
}

// Höchste Artikel-Nr. (Muster Kunden-Nr.-laufende Nr., z. B. 10332-0706) eines
// Kunden in den Stammdaten und in den übrigen Kalkulationen, dazu die nächste
function artikelZaehler(kopf, hofer, liste, eigeneId) {
  const code = String(kopf.kundencode || "").trim();
  const kid = kopf.kunde_id;
  const kname = String(kopf.kunde || "").trim().toLowerCase();
  if (!code && !kid && !kname) return null;
  const treffer = [];
  const nimm = (nr, wo) => {
    const m = /^(\d{4,6})-(\d{1,5})$/.exec(String(nr || "").trim());
    if (m && (!code || m[1] === code)) treffer.push({ nr: m[0], vor: m[1], lauf: Number(m[2]), stellen: m[2].length, wo });
  };
  for (const a of hofer) {
    if ((kid && a.kunde_id === kid) || (code && String(a.nr || "").startsWith(code + "-"))) nimm(a.nr, "Stammdaten");
  }
  for (const x of liste || []) {
    if (x.id === eigeneId || !x.artikel) continue;
    const q = kopfAusListe(x);
    const passt = (code && (String(q.kundencode || "").trim() === code || String(x.artikel).startsWith(code + "-")))
      || (kname && String(x.kunde || "").trim().toLowerCase() === kname);
    if (passt) nimm(x.artikel, "Kalkulation " + (x.nr || ""));
  }
  if (!treffer.length) return code ? { nr: "", wo: "", naechste: code + "-0001" } : null;
  treffer.sort((a, b) => b.lauf - a.lauf);
  const h = treffer[0];
  return { nr: h.nr, wo: h.wo, naechste: h.vor + "-" + String(h.lauf + 1).padStart(h.stellen, "0") };
}

// Kunde der Kalkulation im Kundenstamm: über den Kunden-Code, sonst die
// gemerkte Verknüpfung. Ein getippter Code ohne Treffer löst nichts aus, damit
// man ihn frei ändern kann.
function kundeAusStamm(kopf, partner) {
  if (!partner || !partner.length) return null;
  const code = String(kopf.kundencode || "").trim();
  if (code) return partner.find((p) => String(p.nr) === code) || null;
  return kopf.kunde_id ? partner.find((p) => p.id === kopf.kunde_id) || null : null;
}
function stammKopf(p, kopf) {
  const ad = partnerAdresse(p);
  return { kunde: p.name || "", kunde_id: p.id, kundencode: p.nr || "", ...ad, zusatz: ad.zusatz || kopf.zusatz || "" };
}
