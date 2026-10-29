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
import { useMemo, useReducer, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { teilMerken } from "../teile/wiederherstellen.js";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { Saeulen, Balken, Kennzahl } from "../teile/Diagramm.jsx";
import { statistikLaden, statistikRechnen, werkzeugLaden, werkzeugRechnen, dauerText, stundenText, prozentText, kommaText,
  STUNDEN_VOLL, STUNDEN_MAX } from "../daten/statistik.js";

export const st = { reiter: "maschinen", zeitraum: "30", von: null, bis: null, maschine: null, artikel: null, suche: "", verlauf: [] };
const FELDER = Object.keys(st);
teilMerken("statistik", () => Object.fromEntries(FELDER.map((k) => [k, st[k]])),
  (z) => FELDER.forEach((k) => { if (k in z) st[k] = z[k]; }));

const ZEITRAEUME = [["7", "7 Tage"], ["30", "30 Tage"], ["90", "3 Monate"], ["365", "12 Monate"], ["frei", "Von – bis"]];
const REITER = [["maschinen", "Maschinen"], ["artikel", "Artikel"], ["werkzeug", "Werkzeug"]];
const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Erst ab diesem Tag sind die Zahlen verlässlich erfasst; Älteres zählt
// nie, auch wenn der Zeitraum weiter zurückreicht (Wunsch Patrick 23. Oktober 2026;
// seit 27. Oktober 2026 ab 26.10. statt 19.10.: „erst ab dem 26.10 geführt“)
export const STATISTIK_AB = "2026-10-26";

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

// Der heutige Tag zählt nie mit, weil die Stückzahlen oft erst im Lauf
// des Tages gemeldet werden (Wunsch Patrick 29. Oktober 2026)
function zeitraum() {
  const gestern = alt.plusTage(alt.isoDatum(new Date()), -1);
  let [von, bis] = [alt.plusTage(gestern, -((Number(st.zeitraum) || 30) - 1)), gestern];
  if (st.zeitraum === "frei" && st.von && st.bis) [von, bis] = st.von <= st.bis ? [st.von, st.bis] : [st.bis, st.von];
  if (bis > gestern) bis = gestern;
  if (von > bis) von = bis;
  return [von < STATISTIK_AB ? STATISTIK_AB : von, bis < STATISTIK_AB ? STATISTIK_AB : bis];
}

// Welche Maschinen zählen (seit 1.263.0, Wunsch Patrick 29. Oktober 2026:
// „wählen können, welche Maschinen berücksichtigt werden sollen“). Gemerkt
// je Person werden die abgewählten, damit neue Maschinen von selbst dabei sind.
const OHNE = "statistik_ohne_maschinen";
const ohneLesen = () => new Set(String((alt.einstellungWert && alt.einstellungWert(OHNE, "")) || "").split(",").filter(Boolean));

const quoteText = (q) => Number.isFinite(q) ? kommaText(q * 100) + " %" : "–";
const stk = (n) => alt.zahlText(Math.round(n || 0));
const stkText = (n) => stk(n) + " Stk";
const wochenende = (t) => { const w = alt.ausIso(t).getDay(); return w === 0 || w === 6; };
const tagLabel = (t) => alt.WT_KURZ[(alt.ausIso(t).getDay() + 6) % 7] + " " + alt.kurzDatum(t);

// Säulen je Tag; bei langen Zeiträumen je Woche, sonst wird es zu eng.
// Tage ohne gemeldete Stückzahl stehen blass und leer da und sagen das
// beim Antippen (seit 1.258.0), ausser beim Ausschuss (mitMeldung
// false). Mit nenner ist der Wert ein Anteil (Auslastung): je Woche
// dann Summe durch Summe, nicht die Anteile zusammengezählt.
function jeZeit(jeTag, feld, { nenner, mitMeldung = true } = {}) {
  const ohne = (t) => mitMeldung && !t.gemeldet;
  if (jeTag.length <= 62) {
    return jeTag.map((t) => {
      const n = nenner ? nenner(t) : 1;
      return { key: t.datum, label: alt.kurzDatum(t.datum), wert: ohne(t) || !n ? 0 : t[feld] / n,
        blass: wochenende(t.datum) || ohne(t), ohneMeldung: ohne(t), h: t.h, tipTag: tagLabel(t.datum) };
    });
  }
  const wochen = [];
  jeTag.forEach((t) => {
    const ws = alt.wochenStart(t.datum);
    let w = wochen[wochen.length - 1];
    if (!w || w.key !== ws) {
      w = { key: ws, label: "KW " + alt.kalenderwoche(ws), wert: 0, summe: 0, teiler: 0, h: 0, gemeldet: 0,
        tipTag: "Woche ab " + alt.kurzDatum(ws) };
      wochen.push(w);
    }
    if (ohne(t)) return;
    w.gemeldet++;
    w.summe += t[feld]; w.h += t.h;
    w.teiler += nenner ? nenner(t) : 0;
    w.wert = nenner ? (w.teiler ? w.summe / w.teiler : 0) : w.summe;
  });
  wochen.forEach((w) => { if (mitMeldung && !w.gemeldet) { w.blass = true; w.ohneMeldung = true; } });
  return wochen;
}

function mitTip(werte, f) {
  return werte.map((w) => ({ ...w, tip: w.ohneMeldung
    ? <><b>keine Stückzahl gemeldet</b><br />{w.tipTag}</>
    : <><b>{f(w.wert)}</b><br />{w.tipTag}</> }));
}

export default function Statistik({ auffrischen }) {
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const [von, bis] = zeitraum();
  const { daten, fehler } = useDaten(() => statistikLaden(von, bis), [auffrischen, von, bis]);
  const [ohne, setOhne] = useState(ohneLesen);
  const [wahlOffen, setWahlOffen] = useState(false);
  const alleM = daten ? daten.maschinen : [];
  const ohneHier = alleM.filter((m) => ohne.has(String(m.id))).length;
  const r = useMemo(() => (daten ? statistikRechnen(ohneHier
    ? { ...daten, maschinen: daten.maschinen.filter((m) => !ohne.has(String(m.id))) } : daten) : null), [daten, ohne]);
  const ohneSetzen = (neu) => {
    setOhne(neu);
    alt.einstellungSetzenWert(OHNE, [...neu].join(","));
  };
  const setze = (o) => { Object.assign(st, o); zeichnen(); };
  zeichnenAussen = zeichnen;

  // Strg + F sucht Maschinen und Artikel und öffnet sie (seit 1.169.0)
  useSeitenSuche({
    name: "Statistik", platzhalter: "Maschine oder HOCO Nr. …",
    eintraege: () => !r ? [] : [
      ...r.maschinen.map((m) => ({ gruppe: "Maschinen", zeichen: "⚙", titel: m.name,
        zeile: [m.typ, m.stk ? alt.zahlText(m.stk) + " Stk" : ""].filter(Boolean).join(" · "), maschine: m.id })),
      ...r.artikel.map((a) => ({ gruppe: "Artikel", zeichen: "▣", titel: a.hoco,
        zeile: a.stk ? alt.zahlText(a.stk) + " Stk" : "", artikel: a.hoco })),
    ],
    springen: (x) => oeffnen(x.maschine
      ? { reiter: "maschinen", maschine: x.maschine, artikel: null }
      : { reiter: "artikel", artikel: x.artikel, maschine: null }),
  });

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
          <input type="date" value={bis} min={von} max={alt.plusTage(alt.isoDatum(new Date()), -1)} data-stbis onChange={(e) => e.target.value && setze({ bis: e.target.value })} />
        </span>}
        <span className="klein st-zeit__text">{alt.kurzDatum(von)}{von.slice(0, 4)} – {alt.kurzDatum(bis)}{bis.slice(0, 4)}
          {r ? " · " + r.arbeitstage + " Arbeitstage" : ""}</span>
        {daten && daten.maschinen.length > 1 && <button className={"st-chip st-chip--wahl" + (ohneHier ? " st-chip--teil" : "")}
          id="st-wahl-knopf" aria-expanded={wahlOffen} onClick={() => setWahlOffen(!wahlOffen)}>
          Maschinen: {ohneHier ? (alleM.length - ohneHier) + " von " + alleM.length : "alle"} <span aria-hidden="true">{wahlOffen ? "▴" : "▾"}</span>
        </button>}
        <span className="klein st-zeit__text" id="st-ab">Gezählt wird erst ab {alt.kurzDatum(STATISTIK_AB)}{STATISTIK_AB.slice(0, 4)}, bis gestern (heute ist noch nicht fertig gemeldet).</span>
      </div>
      {wahlOffen && daten && <MaschinenWahl d={daten} ohne={ohne} setzen={ohneSetzen} zu={() => setWahlOffen(false)} />}
      {daten && ohneHier > 0 && ohneHier === alleM.length && <p className="qs-fehlt" id="st-keine">Keine Maschine gewählt. Oben bei „Maschinen“ mindestens eine einschalten.</p>}
      <Uebergang key={st.reiter}>
        {st.reiter === "werkzeug"
          ? <Werkzeug von={von} bis={bis} maschinen={daten ? daten.maschinen : null}
            nur={ohneHier ? new Set(alleM.filter((m) => !ohne.has(String(m.id))).map((m) => String(m.id))) : null} />
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
//  Wahl der Maschinen: Park → Typ → Maschine, je Stufe alle an oder aus
// ---------------------------------------------------------------
function Haken({ ids, ohne, setzen, children, className }) {
  const aus = ids.filter((id) => ohne.has(id)).length;
  const an = aus === 0, teil = aus > 0 && aus < ids.length;
  return (
    <label className={className}>
      <input type="checkbox" checked={an} ref={(el) => { if (el) el.indeterminate = teil; }}
        onChange={() => {
          // Teilweise an: ein Tipp schaltet alle ein, nicht aus
          const neu = new Set(ohne);
          ids.forEach((id) => (an ? neu.add(id) : neu.delete(id)));
          setzen(neu);
        }} />
      <span>{children}</span>
    </label>
  );
}

function MaschinenWahl({ d, ohne, setzen, zu }) {
  const typName = new Map((d.typen || []).map((t) => [t.id, t.name]));
  const parkName = new Map((d.parks || []).map((p) => [p.id, p.name]));
  // Reihenfolge der Planwand bleibt: Gruppen in der Folge ihrer ersten Maschine
  const parks = [];
  d.maschinen.forEach((m) => {
    let p = parks.find((x) => x.id === m.park_id);
    if (!p) parks.push(p = { id: m.park_id, name: parkName.get(m.park_id) || "Ohne Park", typen: [] });
    let t = p.typen.find((x) => x.id === m.type_id);
    if (!t) p.typen.push(t = { id: m.type_id, name: typName.get(m.type_id) || "Ohne Typ", maschinen: [] });
    t.maschinen.push(m);
  });
  const ids = (l) => l.map((m) => String(m.id));
  const alle = ids(d.maschinen);
  const an = alle.filter((id) => !ohne.has(id)).length;
  return (
    <div className="karte st-wahl" id="st-wahl">
      <div className="st-wahl__kopf">
        <b>Welche Maschinen zählen?</b>
        <button className="st-chip" data-stwahl="alle" onClick={() => setzen(new Set())}>Alle</button>
        <button className="st-chip" data-stwahl="keine" onClick={() => setzen(new Set([...ohne, ...alle]))}>Keine</button>
        <span className="klein">{an} von {alle.length} gewählt, wird gemerkt</span>
        <button className="knopf st-wahl__zu" data-stwahl="zu" onClick={zu}>Fertig</button>
      </div>
      <div className="st-wahl__parks">
        {parks.map((p) => {
          const pIds = ids(p.typen.flatMap((t) => t.maschinen));
          return (
            <div className="st-wahl__park" key={p.id || "ohne"}>
              <Haken ids={pIds} ohne={ohne} setzen={setzen} className="st-wahl__parkname">{p.name}</Haken>
              {p.typen.map((t) => (
                <div className="st-wahl__typ" key={t.id || "ohne"}>
                  {p.typen.length > 1 || t.maschinen.length > 1
                    ? <Haken ids={ids(t.maschinen)} ohne={ohne} setzen={setzen} className="st-wahl__typname">{t.name}</Haken> : null}
                  <div className="st-wahl__maschinen">
                    {t.maschinen.map((m) => (
                      <Haken key={m.id} ids={[String(m.id)]} ohne={ohne} setzen={setzen} className="st-wahl__m">
                        {alt.maschineZielText(m)}</Haken>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
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
        unter={z.stkOhneZeit ? stk(z.stkOhneZeit) + " Stk ohne Stückzeit nicht mitgezählt" : "Ø " + stundenText(z.hJeTag) + " je Maschine und Tag mit Stückzahl"} />
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
        unter={"Produktionszeit aus Stückzahl × Stückzeit, " + STUNDEN_VOLL + " h je Tag = 100 %, nur Tage mit gemeldeter Stückzahl. Antippen zeigt die Maschine."}>
        <Balken zeilen={liste.map((m) => ({ key: m.id, label: m.name, unter: m.typ, wert: m.auslastung || 0,
          text: <>{prozentText(m.auslastung)} <small>{stundenText(m.h)}</small></> }))}
          ziel={1} zielText="100 %" waehlen={(id) => oeffnen({ maschine: id })} />
      </Karte>
      <div className="st-zwei">
        <Karte id="st-ausstoss-tag" titel="Ausstoss pro Tag" unter="Alle Maschinen zusammen">
          <Saeulen werte={mitTip(jeZeit(g.jeTag, "stk"), stkText)} format={stk} />
        </Karte>
        <Karte id="st-zeit-tag" titel="Auslastung pro Tag" unter={"Maschinen mit gemeldeter Stückzahl, je Maschine " + STUNDEN_VOLL + " h = 100 %"}>
          <Saeulen werte={mitTip(jeZeit(g.jeTag, "h", { nenner: (t) => t.gemeldet * STUNDEN_VOLL }), prozentText)}
            format={prozentText} wertText={(p, w) => kommaText(w.h) + " h"}
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
          <Saeulen werte={mitTip(jeZeit(g.jeTag, "aus", { mitMeldung: false }), stkText)} format={stk} />
        </Karte>
      </div>
      <Karte id="st-maschinen-tabelle" titel="Alle Maschinen">
        <div className="st-tabelle-huelle">
          <table className="st-tabelle">
            <thead><tr><th>Maschine</th><th className="zahl">Ausstoss</th><th className="zahl">Ø Stk/Tag</th>
              <th className="zahl">Prod.-Zeit</th><th className="zahl" title="Nur Tage mit gemeldeter Stückzahl">Ø h/Tag</th><th className="zahl">Auslastung</th>
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

// Kräftige, klar verschiedene Farben, auf denen weisse Schrift gut lesbar ist
const ARTIKEL_FARBEN = ["#1f5fbf", "#d35400", "#2e7d32", "#7b3fa8", "#00838f", "#c62828", "#8d6e1f", "#ad1457"];

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
  // Je Tag die Aufträge mit HOCO Nr. in den Säulen (Wunsch Patrick
  // 29. Oktober 2026: „bei den Balken die Hoferartikel“; die FA Nr. nur
  // noch beim Antippen: „lass die FA Nr. weg, Artikel reicht mir, dafür
  // grösser“). Jeder Artikel hat seine eigene Farbe, damit man den
  // Auftragswechsel sieht („farbliche Unterschiede“).
  const jeTagAuftrag = {}, farbe = new Map();
  r.eintraege.filter((e) => e.mid === m.id).forEach((e) => {
    const k = e.jobId || "hoco:" + e.hoco;
    const fk = e.hoco || "ohne";
    if (!farbe.has(fk)) farbe.set(fk, ARTIKEL_FARBEN[farbe.size % ARTIKEL_FARBEN.length]);
    const l = (jeTagAuftrag[e.datum] = jeTagAuftrag[e.datum] || new Map());
    const j = r.jobVon.get(e.jobId) || {};
    const x = l.get(k) || { stk: 0, h: 0, farbe: farbe.get(fk), text: e.hoco || "ohne HOCO Nr.",
      lang: [e.hoco || "ohne HOCO Nr.", j.fa_nr ? "FA " + j.fa_nr : ""].filter(Boolean).join(" · ") };
    x.stk += e.stk; x.h += e.h || 0;
    l.set(k, x);
  });
  const mitAuftraegen = (werte, feld, f) => m.jeTag.length > 62 ? werte : werte.map((w) => {
    const l = [...(jeTagAuftrag[w.key] || new Map()).values()];
    if (!l.length || w.ohneMeldung) return w;
    return { ...w, teile: l.map((x) => ({ wert: x[feld], text: x.text, farbe: x.farbe })),
      tip: <><b>{f(w.wert)}</b> {w.tipTag}{l.map((x, i) => <span key={i} className="st-tip-auftrag"><br />{x.lang}: {f(x[feld])}</span>)}</> };
  });
  return (
    <>
      <div className="st-kopf">
        <ZurueckKnopf r={r} />
        <h2 className="st-kopf__titel" id="st-maschine-name">{m.name} <span className="klein">{m.typ}</span></h2>
      </div>
      <Kennzahlen z={m} mitAuslastung />
      <div className="st-zwei">
        <Karte id="st-ausstoss-tag" titel="Ausstoss pro Tag">
          <Saeulen werte={mitAuftraegen(mitTip(jeZeit(m.jeTag, "stk"), stkText), "stk", stkText)} format={stk} hoehe={300} />
        </Karte>
        <Karte id="st-zeit-tag" titel="Produktionszeit pro Tag" unter={STUNDEN_VOLL + " h = 100 % Auslastung"}>
          <Saeulen werte={mitAuftraegen(mitTip(jeZeit(m.jeTag, "h"), stundenText), "h", stundenText)} format={(h) => Math.round(h) + " h"} hoehe={300}
            wertText={(h) => kommaText(h) + " h"}
            ziel={m.jeTag.length <= 62 ? STUNDEN_VOLL : 0} zielText={STUNDEN_VOLL + " h"}
            deckel={m.jeTag.length <= 62 ? 24 : 0} />
        </Karte>
      </div>
      <Karte id="st-ausschuss-tag" titel="Ausschuss pro Tag" unter="Aus den Meldungen der Qualitätssicherung">
        <Saeulen werte={mitTip(jeZeit(m.jeTag, "aus", { mitMeldung: false }), stkText)} format={stk} />
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
function Werkzeug({ von, bis, maschinen, nur }) {
  const { daten: roh, fehler } = useDaten(() => werkzeugLaden(von, bis), [von, bis]);
  const nurText = nur ? [...nur].sort().join(",") : "";
  const w = useMemo(() => (roh && maschinen ? werkzeugRechnen(roh.positionen, roh.artikel, maschinen, von, bis, nur) : null),
    [roh, maschinen, nurText]);
  if (fehler && !w) return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  if (!w) return <div className="laedt">Wird geladen …</div>;
  const monatLabel = (m) => MONATE_KURZ[Number(m.slice(5, 7)) - 1] + " " + m.slice(2, 4);
  return (
    <>
      <p className="klein st-hinweis">Vorerst aus den Bestellungen: jede Position, die im Zeitraum bestellt wurde. Sobald die
        Einrichtblätter mit den Artikelnummern der Werkzeuge und dem Wechselprotokoll verknüpft sind, kommt der echte Verbrauch dazu.
        {nur && <b> Mit der Wahl der Maschinen zählen nur Positionen mit Ziel einer gewählten Maschine.</b>}</p>
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
