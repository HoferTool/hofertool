// =================================================================
//  SEITE STATISTIK (1.159.0, Wunsch Patrick 23. Oktober 2026)
//  Produktionsdaten je Maschine und je Artikel (HOCO Nr.): Ausstoss
//  pro Tag, Produktionszeit in h, Auslastung (10 h am Tag = 100 %),
//  Übergangszeit vom Beenden bis zum Start des nächsten Auftrags, und
//  Werkzeugverbrauch, vorerst aus den Bestellungen, und Ausschuss aus
//  den Meldungen der Qualitätssicherung. Rechnen in
//  src/daten/statistik.js, Diagramme in src/teile/Diagramm.jsx.
//  Maschinen nur der eigenen Parks wie in der Produktion. Nicht für
//  Externe (Entscheid Patrick 23. Oktober 2026: „Externe nicht“) und
//  Dienst (seiteSichtbar).
// =================================================================
import { useMemo, useReducer } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { teilMerken } from "../teile/wiederherstellen.js";
import { Saeulen, Balken, Kennzahl } from "../teile/Diagramm.jsx";
import { statistikLaden, statistikRechnen, werkzeugLaden, dauerText, stundenText, prozentText, kommaText,
  STUNDEN_VOLL, STUNDEN_MAX } from "../daten/statistik.js";

export const st = { reiter: "maschinen", zeitraum: "30", von: null, bis: null, maschine: null, artikel: null, suche: "", verlauf: [] };
const FELDER = Object.keys(st);
teilMerken("statistik", () => Object.fromEntries(FELDER.map((k) => [k, st[k]])),
  (z) => FELDER.forEach((k) => { if (k in z) st[k] = z[k]; }));

const ZEITRAEUME = [["7", "7 Tage"], ["30", "30 Tage"], ["90", "3 Monate"], ["365", "12 Monate"], ["frei", "Von – bis"]];
const REITER = [["maschinen", "Maschinen"], ["artikel", "Artikel"], ["werkzeug", "Werkzeug"]];
const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Erst ab diesem Tag sind die Zahlen verlässlich erfasst; Älteres zählt
// nie, auch wenn der Zeitraum weiter zurückreicht (Wunsch Patrick 23. Oktober 2026)
export const STATISTIK_AB = "2026-10-19";

// Zurück geht genau dorthin, wo man herkam: von einem Artikel, der von
// einer Maschine aus geöffnet wurde, wieder zur Maschine, sonst zur Liste,
// und dort an dieselbe Stelle der Liste (Wunsch Patrick 23. Oktober 2026:
// „Man kommt von den Artikeln nicht zurück“)
const ansicht = () => ({ reiter: st.reiter, maschine: st.maschine, artikel: st.artikel, y: window.scrollY });
let zeichnenAussen = null;
function oeffnen(o) {
  st.verlauf = [...st.verlauf.slice(-19), ansicht()];
  Object.assign(st, o);
  zeichnenAussen && zeichnenAussen();
  // Wer weit unten in der Tabelle antippt, sieht sonst den Kopf mit
  // dem Zurück-Knopf nicht
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
function zurueckZiel() {
  const v = st.verlauf[st.verlauf.length - 1];
  if (v) return v;
  if (st.reiter === "artikel" && st.artikel) return { reiter: "artikel", maschine: st.maschine, artikel: null, y: 0 };
  if (st.reiter === "maschinen" && st.maschine) return { reiter: "maschinen", maschine: null, artikel: st.artikel, y: 0 };
  return null;
}
// Auch aus app.js mit Escape gerufen. true = eine Ebene zurück gegangen
export function statistikZurueck() {
  const z = zurueckZiel();
  if (!z) return false;
  if (st.verlauf.length) st.verlauf = st.verlauf.slice(0, -1);
  const { y, ...o } = z;
  Object.assign(st, o);
  if (zeichnenAussen) zeichnenAussen(); else alt.zeichneSeite();
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y || 0)));
  return true;
}
function zurueckText(r) {
  const z = zurueckZiel();
  if (!z) return "Zurück";
  if (z.reiter === "maschinen" && z.maschine) {
    const m = r.maschinen.find((x) => x.id === z.maschine);
    return "Zurück zu " + (m ? m.name : "der Maschine");
  }
  if (z.reiter === "artikel" && z.artikel) return "Zurück zu " + z.artikel;
  return z.reiter === "artikel" ? "Zurück zu allen Artikeln" : "Zurück zu allen Maschinen";
}

function ZurueckKnopf({ r }) {
  return (
    <button className="knopf knopf--haupt st-zurueck" data-stzurueck onClick={statistikZurueck}>
      <span aria-hidden="true">←</span> {zurueckText(r)}
    </button>
  );
}

function zeitraum() {
  const heute = alt.isoDatum(new Date());
  let [von, bis] = [alt.plusTage(heute, -((Number(st.zeitraum) || 30) - 1)), heute];
  if (st.zeitraum === "frei" && st.von && st.bis) [von, bis] = st.von <= st.bis ? [st.von, st.bis] : [st.bis, st.von];
  return [von < STATISTIK_AB ? STATISTIK_AB : von, bis < STATISTIK_AB ? STATISTIK_AB : bis];
}

const quoteText = (q) => Number.isFinite(q) ? kommaText(q * 100) + " %" : "–";
const stk = (n) => alt.zahlText(Math.round(n || 0));
const stkText = (n) => stk(n) + " Stk";
const wochenende = (t) => { const w = alt.ausIso(t).getDay(); return w === 0 || w === 6; };
const tagLabel = (t) => alt.WT_KURZ[(alt.ausIso(t).getDay() + 6) % 7] + " " + alt.kurzDatum(t);

// Säulen je Tag; bei langen Zeiträumen je Woche, sonst wird es zu eng
function jeZeit(jeTag, feld) {
  if (jeTag.length <= 62) {
    return jeTag.map((t) => ({ key: t.datum, label: alt.kurzDatum(t.datum), wert: t[feld], blass: wochenende(t.datum),
      tipTag: tagLabel(t.datum) }));
  }
  const wochen = [];
  jeTag.forEach((t) => {
    const ws = alt.wochenStart(t.datum);
    let w = wochen[wochen.length - 1];
    if (!w || w.key !== ws) { w = { key: ws, label: "KW " + alt.kalenderwoche(ws), wert: 0, tipTag: "Woche ab " + alt.kurzDatum(ws) }; wochen.push(w); }
    w.wert += t[feld];
  });
  return wochen;
}

function mitTip(werte, f) {
  return werte.map((w) => ({ ...w, tip: <><b>{f(w.wert)}</b><br />{w.tipTag}</> }));
}

export default function Statistik({ auffrischen }) {
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const [von, bis] = zeitraum();
  const { daten, fehler } = useDaten(() => statistikLaden(von, bis), [auffrischen, von, bis]);
  const r = useMemo(() => (daten ? statistikRechnen(daten) : null), [daten]);
  const setze = (o) => { Object.assign(st, o); zeichnen(); };
  zeichnenAussen = zeichnen;

  return (
    <>
      <h1 className="seitentitel">Statistik</h1>
      <Reiter reiter={REITER} aktiv={st.reiter} waehlen={(w) => setze({ reiter: w, verlauf: [] })} merkmal="streiter" seite="statistik" />
      <div className="st-zeit" id="st-zeit">
        {ZEITRAEUME.map(([w, t]) => (
          <button key={w} className={"st-chip" + (st.zeitraum === w ? " aktiv" : "")} data-stzeit={w}
            onClick={() => setze(w === "frei" ? { zeitraum: w, von: st.von || von, bis: st.bis || bis } : { zeitraum: w })}>{t}</button>
        ))}
        {st.zeitraum === "frei" && <span className="st-frei">
          <input type="date" value={von} min={STATISTIK_AB} max={bis} data-stvon onChange={(e) => e.target.value && setze({ von: e.target.value })} />
          <span>bis</span>
          <input type="date" value={bis} min={von} data-stbis onChange={(e) => e.target.value && setze({ bis: e.target.value })} />
        </span>}
        <span className="klein st-zeit__text">{alt.kurzDatum(von)}{von.slice(0, 4)} – {alt.kurzDatum(bis)}{bis.slice(0, 4)}
          {r ? " · " + r.arbeitstage + " Arbeitstage" : ""}</span>
        <span className="klein st-zeit__text" id="st-ab">Gezählt wird erst ab {alt.kurzDatum(STATISTIK_AB)}{STATISTIK_AB.slice(0, 4)}.</span>
      </div>
      <Uebergang key={st.reiter}>
        {st.reiter === "werkzeug"
          ? <Werkzeug von={von} bis={bis} maschinen={daten ? daten.maschinen : null} />
          : fehler && !r
            ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
            : !r
              ? <div className="laedt">Wird geladen …</div>
              : st.reiter === "artikel"
                ? <Artikel r={r} setze={setze} />
                : <Maschinen r={r} setze={setze} />}
      </Uebergang>
    </>
  );
}

// ---------------------------------------------------------------
//  Gemeinsame Teile
// ---------------------------------------------------------------
function Kennzahlen({ z, mitAuslastung }) {
  return (
    <div className="dg-kennzahlen">
      <Kennzahl id="st-k-ausstoss" titel="Ausstoss" wert={stkText(z.stk)}
        unter={(z.produktionsTage ? "Ø " + stk(z.stkJeTag) + " Stk pro Produktionstag" : "keine Stückzahlen")
          + (z.stkStart ? " · " + stk(z.stkStart) + " Stk Startmengen nicht gezählt" : "")} />
      <Kennzahl id="st-k-zeit" titel="Produktionszeit" wert={stundenText(z.h)}
        unter={z.stkOhneZeit ? stk(z.stkOhneZeit) + " Stk ohne Stückzeit nicht mitgezählt" : "Ø " + stundenText(z.hJeTag) + " pro Arbeitstag"} />
      {mitAuslastung && <Kennzahl id="st-k-auslastung" titel="Auslastung" wert={prozentText(z.auslastung)}
        unter={STUNDEN_VOLL + " h am Tag = 100 %, höchstens " + STUNDEN_MAX + " h"} />}
      <Kennzahl id="st-k-ausschuss" titel="Ausschuss" wert={stkText(z.ausschuss)}
        unter={z.ausschussMeldungen.length ? quoteText(z.ausschussQuote) + " vom Ausstoss · " + z.ausschussMeldungen.length
          + (z.ausschussMeldungen.length === 1 ? " Meldung" : " Meldungen") : "keine Meldung der QS"} />
      <Kennzahl id="st-k-uebergang" titel="Ø Übergang" wert={z.uebergaenge.length ? dauerText(z.uebergangMittel) : "–"}
        unter={z.uebergaenge.length ? z.uebergaenge.length + " Auftragswechsel, ohne Wochenende" : "kein Auftragswechsel"} />
    </div>
  );
}

function Karte({ titel, unter, children, id }) {
  return (
    <div className="karte st-karte" id={id}>
      <h2 className="st-karte__titel">{titel}</h2>
      {unter && <p className="klein st-karte__unter">{unter}</p>}
      {children}
    </div>
  );
}

function Uebergaenge({ liste, r, ohneMaschine }) {
  if (!liste.length) return <p className="klein dg-leer">Im Zeitraum kein Wechsel von einem beendeten zum nächsten laufenden Auftrag.</p>;
  return (
    <div className="st-tabelle-huelle">
      <table className="st-tabelle" id="st-uebergaenge">
        <thead><tr><th>Datum</th>{!ohneMaschine && <th>Maschine</th>}<th>Fertig</th><th>Läuft</th><th className="zahl">Übergang</th></tr></thead>
        <tbody>
          {liste.slice(0, 60).map((u) => {
            const m = r.maschineVon.get(u.mid);
            return (
              <tr key={u.neuId + u.vorherId} data-stuebergang={u.neuId}>
                <td>{alt.kurzDatum(u.datum)}</td>
                {!ohneMaschine && <td>{m ? alt.maschineZielText(m) : ""}</td>}
                <td>{u.vorher || "–"} <span className="klein">{uhr(u.ende)}</span></td>
                <td>{u.neu || "–"} <span className="klein">{uhr(u.start)}</span></td>
                <td className="zahl"><b>{dauerText(u.ms)}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {liste.length > 60 && <p className="klein">Die neusten 60 von {liste.length}.</p>}
    </div>
  );
}

function AusschussListe({ liste, r, ohneMaschine }) {
  if (!liste.length) return <p className="klein dg-leer">Im Zeitraum kein Ausschuss gemeldet.</p>;
  return (
    <div className="st-tabelle-huelle">
      <table className="st-tabelle" id="st-ausschuss-liste">
        <thead><tr><th>Gemeldet</th>{!ohneMaschine && <th>Maschine</th>}<th>HOCO Nr.</th><th className="zahl">Stück</th><th>Notiz</th><th>Wer</th></tr></thead>
        <tbody>
          {liste.slice(0, 60).map((a) => {
            const m = r.maschineVon.get(a.mid);
            return (
              <tr key={a.id} data-stausschuss={a.id}>
                <td>{uhr(a.zeit)}</td>
                {!ohneMaschine && <td>{m ? alt.maschineZielText(m) : ""}</td>}
                <td>{a.hoco || "–"}</td>
                <td className="zahl"><b>{stk(a.stk)}</b></td>
                <td>{a.notiz}</td>
                <td>{a.wer}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {liste.length > 60 && <p className="klein">Die neusten 60 von {liste.length}.</p>}
    </div>
  );
}

function AusschussFehlt({ r }) {
  return r.ausschussFehlt
    ? <p className="qs-fehlt">Die Datenbank führt den Ausschuss noch nicht. Bitte sql/qs-ausschuss.sql ausführen.</p> : null;
}

function uhr(zeit) {
  const d = new Date(zeit);
  if (isNaN(d)) return "";
  return alt.kurzDatum(alt.isoDatum(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ---------------------------------------------------------------
//  Reiter Maschinen
// ---------------------------------------------------------------
function Maschinen({ r, setze }) {
  const gewaehlt = st.maschine && r.maschinen.find((m) => m.id === st.maschine);
  if (gewaehlt) return <EineMaschine m={gewaehlt} r={r} setze={setze} />;
  const g = r.gesamt;
  // Reihenfolge wie auf der Planwand (Wunsch Patrick 24. Oktober 2026)
  const liste = r.maschinen;
  return (
    <>
      <Kennzahlen z={g} mitAuslastung />
      <Karte id="st-auslastung" titel="Auslastung je Maschine"
        unter={"Produktionszeit aus Stückzahl × Stückzeit, " + STUNDEN_VOLL + " h je Arbeitstag = 100 %. Antippen zeigt die Maschine."}>
        <Balken zeilen={liste.map((m) => ({ key: m.id, label: m.name, unter: m.typ, wert: m.auslastung || 0,
          text: <>{prozentText(m.auslastung)} <small>{stundenText(m.h)}</small></> }))}
          ziel={1} zielText="100 %" waehlen={(id) => oeffnen({ maschine: id })} />
      </Karte>
      <div className="st-zwei">
        <Karte id="st-ausstoss-tag" titel="Ausstoss pro Tag" unter="Alle Maschinen zusammen">
          <Saeulen werte={mitTip(jeZeit(g.jeTag, "stk"), stkText)} format={stk} />
        </Karte>
        <Karte id="st-zeit-tag" titel="Auslastung pro Tag" unter={"Alle " + r.maschinen.length + " Maschinen zusammen, 100 % = " + r.maschinen.length * STUNDEN_VOLL + " h"}>
          <Saeulen werte={mitTip(jeZeit(g.jeTag.map((t) => ({ ...t, p: r.maschinen.length ? t.h / (r.maschinen.length * STUNDEN_VOLL) : 0 })), "p"),
            prozentText)} format={prozentText} wertText={(p) => kommaText(p * r.maschinen.length * STUNDEN_VOLL) + " h"}
            ziel={g.jeTag.length <= 62 ? 1 : 0} zielText="100 %" />
        </Karte>
      </div>
      <AusschussFehlt r={r} />
      <div className="st-zwei">
        <Karte id="st-ausschuss-maschinen" titel="Ausschuss je Maschine" unter="Aus den Meldungen der Qualitätssicherung, Quote = Anteil am Ausstoss">
          <Balken zeilen={r.maschinen.filter((m) => m.ausschuss)
            .map((m) => ({ key: m.id, label: m.name, wert: m.ausschuss,
              text: <>{stkText(m.ausschuss)} <small>{quoteText(m.ausschussQuote)}</small></> }))}
            waehlen={(id) => oeffnen({ maschine: id })} />
        </Karte>
        <Karte id="st-ausschuss-tag" titel="Ausschuss pro Tag" unter="Alle Maschinen zusammen">
          <Saeulen werte={mitTip(jeZeit(g.jeTag, "aus"), stkText)} format={stk} />
        </Karte>
      </div>
      <Karte id="st-maschinen-tabelle" titel="Alle Maschinen">
        <div className="st-tabelle-huelle">
          <table className="st-tabelle">
            <thead><tr><th>Maschine</th><th className="zahl">Ausstoss</th><th className="zahl">Ø Stk/Tag</th>
              <th className="zahl">Prod.-Zeit</th><th className="zahl">Ø h/Arbeitstag</th><th className="zahl">Auslastung</th>
              <th className="zahl">Ausschuss</th><th className="zahl">Quote</th>
              <th className="zahl">Wechsel</th><th className="zahl">Ø Übergang</th></tr></thead>
            <tbody>
              {liste.map((m) => (
                <tr key={m.id} className="st-klick" data-stmaschine={m.id} onClick={() => oeffnen({ maschine: m.id })}>
                  <td><b>{m.name}</b> <span className="klein">{m.typ}</span></td>
                  <td className="zahl">{stk(m.stk)}</td>
                  <td className="zahl">{m.produktionsTage ? stk(m.stkJeTag) : "–"}</td>
                  <td className="zahl">{stundenText(m.h)}{m.stkOhneZeit ? <span className="st-warn" title={stk(m.stkOhneZeit) + " Stk ohne Stückzeit"}> *</span> : null}</td>
                  <td className="zahl">{stundenText(m.hJeTag)}</td>
                  <td className="zahl"><b>{prozentText(m.auslastung)}</b></td>
                  <td className="zahl">{m.ausschuss ? stk(m.ausschuss) : "–"}</td>
                  <td className="zahl">{m.ausschuss ? quoteText(m.ausschussQuote) : "–"}</td>
                  <td className="zahl">{m.uebergaenge.length || "–"}</td>
                  <td className="zahl">{m.uebergaenge.length ? dauerText(m.uebergangMittel) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {liste.some((m) => m.stkOhneZeit) && <p className="klein">* Ein Teil der Stück hat keine Stückzeit und fehlt in der Produktionszeit.
          Die Stückzeit kommt beim Beenden eines Auftrags oder über Art. Info im Pad Mode.</p>}
        {g.stkStart > 0 && <p className="klein" id="st-startmengen">Nicht gezählt: der erste Zählerstand von Aufträgen, die schon vor dem
          ersten Eintrag liefen (Stand seit Beginn, kein Tagesausstoss), und Einträge mit mehr Stunden, als seit dem letzten Eintrag Zeit war.
          Eine Maschine zählt höchstens {STUNDEN_MAX} h am Tag.</p>}
      </Karte>
      <Karte id="st-wechsel" titel="Übergänge von Auftrag zu Auftrag"
        unter="Vom Beenden eines Auftrags, bis der nächste auf derselben Maschine läuft (Rüsten eingeschlossen). Samstag und Sonntag zählen nicht.">
        <Uebergaenge liste={g.uebergaenge} r={r} />
      </Karte>
    </>
  );
}

function EineMaschine({ m, r, setze }) {
  // Artikel auf dieser Maschine
  const jeArtikel = {};
  r.eintraege.forEach((e) => {
    if (e.mid !== m.id) return;
    const k = e.hoco || "ohne HOCO Nr.";
    const z = (jeArtikel[k] = jeArtikel[k] || { stk: 0, h: 0 });
    z.stk += e.stk; z.h += e.h || 0;
  });
  const artikel = Object.entries(jeArtikel).sort((a, b) => b[1].stk - a[1].stk);
  return (
    <>
      <div className="st-kopf">
        <ZurueckKnopf r={r} />
        <h2 className="st-kopf__titel" id="st-maschine-name">{m.name} <span className="klein">{m.typ}</span></h2>
      </div>
      <Kennzahlen z={m} mitAuslastung />
      <div className="st-zwei">
        <Karte id="st-ausstoss-tag" titel="Ausstoss pro Tag">
          <Saeulen werte={mitTip(jeZeit(m.jeTag, "stk"), stkText)} format={stk} />
        </Karte>
        <Karte id="st-zeit-tag" titel="Produktionszeit pro Tag" unter={STUNDEN_VOLL + " h = 100 % Auslastung"}>
          <Saeulen werte={mitTip(jeZeit(m.jeTag, "h"), stundenText)} format={(h) => Math.round(h) + " h"}
            wertText={(h) => kommaText(h) + " h"}
            ziel={m.jeTag.length <= 62 ? STUNDEN_VOLL : 0} zielText={STUNDEN_VOLL + " h"}
            deckel={m.jeTag.length <= 62 ? 24 : 0} />
        </Karte>
      </div>
      <Karte id="st-ausschuss-tag" titel="Ausschuss pro Tag" unter="Aus den Meldungen der Qualitätssicherung">
        <Saeulen werte={mitTip(jeZeit(m.jeTag, "aus"), stkText)} format={stk} />
        <AusschussListe liste={m.ausschussMeldungen} r={r} ohneMaschine />
      </Karte>
      <Karte id="st-maschine-artikel" titel="Artikel auf dieser Maschine" unter="Antippen zeigt den Artikel.">
        <Balken zeilen={artikel.map(([k, z]) => ({ key: k, label: k, wert: z.stk,
          text: <>{stkText(z.stk)} <small>{stundenText(z.h)}</small></> }))}
          waehlen={(k) => { if (k !== "ohne HOCO Nr.") oeffnen({ reiter: "artikel", artikel: k }); }} />
      </Karte>
      <Karte id="st-wechsel" titel="Übergänge von Auftrag zu Auftrag" unter="Samstag und Sonntag zählen nicht.">
        <Uebergaenge liste={m.uebergaenge} r={r} ohneMaschine />
      </Karte>
    </>
  );
}

// ---------------------------------------------------------------
//  Reiter Artikel
// ---------------------------------------------------------------
function Artikel({ r, setze }) {
  const gewaehlt = st.artikel && r.artikel.find((a) => a.hoco === st.artikel);
  if (gewaehlt) return <EinArtikel a={gewaehlt} r={r} setze={setze} />;
  const such = st.suche.trim().toLowerCase().replace(/\s+/g, "");
  const liste = r.artikel.filter((a) => !such || a.hoco.toLowerCase().includes(such));
  const name = (mid) => { const m = r.maschineVon.get(mid); return m ? alt.maschineZielText(m) : ""; };
  return (
    <>
      <Kennzahlen z={r.gesamt} />
      <Karte id="st-artikel-top" titel="Ausstoss je Artikel" unter={liste.length > 15 ? "Die 15 grössten. Antippen zeigt den Artikel." : "Antippen zeigt den Artikel."}>
        <Balken zeilen={liste.slice(0, 15).map((a) => ({ key: a.hoco, label: a.hoco, wert: a.stk,
          text: <>{stkText(a.stk)} <small>{stundenText(a.h)}</small></> }))} waehlen={(k) => oeffnen({ artikel: k })} />
      </Karte>
      <Karte id="st-artikel-tabelle" titel="Alle Artikel">
        <input className="st-suche" placeholder="HOCO Nr. suchen" value={st.suche} data-stsuche
          onChange={(e) => setze({ suche: e.target.value })} />
        <div className="st-tabelle-huelle">
          <table className="st-tabelle">
            <thead><tr><th>HOCO Nr.</th><th className="zahl">Ausstoss</th><th className="zahl">Ø Stk/Tag</th>
              <th className="zahl">Stückzeit</th><th className="zahl">Prod.-Zeit</th><th>Maschinen</th>
              <th className="zahl">Ausschuss</th><th className="zahl">Quote</th>
              <th className="zahl">Aufträge</th><th className="zahl">Ø Übergang</th></tr></thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.hoco} className="st-klick" data-startikel={a.hoco} onClick={() => oeffnen({ artikel: a.hoco })}>
                  <td><b>{a.hoco}</b></td>
                  <td className="zahl">{stk(a.stk)}</td>
                  <td className="zahl">{a.produktionsTage ? stk(a.stkJeTag) : "–"}</td>
                  <td className="zahl">{a.stueckzeiten.length ? a.stueckzeiten.map((s) => alt.zahlText(s) + " s").join(" / ") : "–"}</td>
                  <td className="zahl">{stundenText(a.h)}</td>
                  <td>{a.maschinen.map(name).join(", ")}</td>
                  <td className="zahl">{a.ausschuss ? stk(a.ausschuss) : "–"}</td>
                  <td className="zahl">{a.ausschuss && a.stk ? quoteText(a.ausschussQuote) : "–"}</td>
                  <td className="zahl">{a.auftraege || "–"}</td>
                  <td className="zahl">{a.uebergaenge.length ? dauerText(a.uebergangMittel) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!liste.length && <p className="klein dg-leer">Keine Stückzahlen im Zeitraum.</p>}
        </div>
      </Karte>
    </>
  );
}

function EinArtikel({ a, r, setze }) {
  const jeMaschine = {};
  r.eintraege.forEach((e) => {
    if (e.hoco !== a.hoco) return;
    const z = (jeMaschine[e.mid] = jeMaschine[e.mid] || { stk: 0, h: 0, tage: new Set() });
    z.stk += e.stk; z.h += e.h || 0; if (e.stk) z.tage.add(e.datum);
  });
  const platz = new Map(r.maschinen.map((m, i) => [m.id, i]));
  const zeilen = Object.entries(jeMaschine).sort((x, y) => (platz.get(x[0]) ?? 1e6) - (platz.get(y[0]) ?? 1e6));
  return (
    <>
      <div className="st-kopf">
        <ZurueckKnopf r={r} />
        <h2 className="st-kopf__titel" id="st-artikel-name">{a.hoco}</h2>
        {a.stueckzeiten.length > 0 && <span className="klein">Stückzeit {a.stueckzeiten.map((s) => alt.zahlText(s) + " s").join(" / ")}</span>}
      </div>
      <Kennzahlen z={a} />
      <Karte id="st-ausstoss-tag" titel="Ausstoss pro Tag">
        <Saeulen werte={mitTip(jeZeit(a.jeTag, "stk"), stkText)} format={stk} />
      </Karte>
      <Karte id="st-artikel-maschinen" titel="Auf welchen Maschinen" unter="Ø Stück je Tag, an dem die Maschine diesen Artikel machte. Antippen zeigt die Maschine.">
        <Balken zeilen={zeilen.map(([mid, z]) => {
          const m = r.maschineVon.get(mid);
          return { key: mid, label: m ? alt.maschineZielText(m) : "Maschine", wert: z.stk,
            text: <>{stkText(z.stk)} <small>Ø {stk(z.tage.size ? z.stk / z.tage.size : 0)}/Tag · {stundenText(z.h)}</small></> };
        })} waehlen={(mid) => oeffnen({ reiter: "maschinen", maschine: mid })} />
      </Karte>
      <Karte id="st-artikel-ausschuss" titel="Ausschuss" unter="Aus den Meldungen der Qualitätssicherung">
        <AusschussListe liste={a.ausschussMeldungen} r={r} />
      </Karte>
      <Karte id="st-wechsel" titel="Übergänge auf diesen Artikel" unter="Vom Beenden des vorherigen Auftrags, bis dieser Artikel lief. Samstag und Sonntag zählen nicht.">
        <Uebergaenge liste={a.uebergaenge} r={r} />
      </Karte>
    </>
  );
}

// ---------------------------------------------------------------
//  Reiter Werkzeug
// ---------------------------------------------------------------
function Werkzeug({ von, bis, maschinen }) {
  const { daten: w, fehler } = useDaten(() => (maschinen ? werkzeugLaden(von, bis, maschinen) : new Promise(() => {})),
    [von, bis, maschinen]);
  if (fehler && !w) return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  if (!w) return <div className="laedt">Wird geladen …</div>;
  const monatLabel = (m) => MONATE_KURZ[Number(m.slice(5, 7)) - 1] + " " + m.slice(2, 4);
  return (
    <>
      <p className="klein st-hinweis">Vorerst aus den Bestellungen: jede Position, die im Zeitraum bestellt wurde. Sobald die
        Einrichtblätter mit den Artikelnummern der Werkzeuge und dem Wechselprotokoll verknüpft sind, kommt der echte Verbrauch dazu.</p>
      <div className="dg-kennzahlen">
        <Kennzahl id="st-k-positionen" titel="Bestellpositionen" wert={alt.zahlText(w.positionen)} />
        <Kennzahl id="st-k-stueck" titel="Bestellte Menge" wert={stkText(w.stk)} />
        <Kennzahl id="st-k-artikel" titel="Verschiedene Artikel" wert={alt.zahlText(w.artikel.length)} />
      </div>
      <div className="st-zwei">
        <Karte id="st-wz-monat" titel="Bestellte Menge je Monat">
          <Saeulen werte={w.monate.map((m) => ({ key: m.monat, label: monatLabel(m.monat), wert: m.stk,
            tip: <><b>{stkText(m.stk)}</b><br />{m.pos} Positionen · {monatLabel(m.monat)}</> }))} format={stk} />
        </Karte>
        <Karte id="st-wz-maschinen" titel="Je Maschine" unter="Positionen mit Ziel Maschine">
          <Balken zeilen={w.maschinen.map((m) => ({ key: m.id, label: m.name, wert: m.stk,
            text: <>{stkText(m.stk)} <small>{m.pos} Pos.</small></> }))} />
        </Karte>
      </div>
      <Karte id="st-wz-artikel" titel="Je Artikel">
        <div className="st-tabelle-huelle">
          <table className="st-tabelle">
            <thead><tr><th>Artikel</th><th>Bezeichnung</th><th className="zahl">Menge</th><th className="zahl">Positionen</th><th>Maschinen</th></tr></thead>
            <tbody>
              {w.artikel.map((a) => (
                <tr key={a.id} data-stwz={a.id}>
                  <td><b>{a.nr || "–"}</b>{a.spezial && <span className="st-marke">Spezial</span>}</td>
                  <td>{a.name}</td>
                  <td className="zahl">{stk(a.stk)} {a.einheit}</td>
                  <td className="zahl">{a.pos}</td>
                  <td>{a.maschinen.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!w.artikel.length && <p className="klein dg-leer">Im Zeitraum nichts bestellt.</p>}
        </div>
      </Karte>
    </>
  );
}
