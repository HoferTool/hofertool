// =================================================================
//  QMS: Lieferantenbewertung je Jahr (seit 1.483.0, Wunsch Patrick
//  11. November 2026: „ich schicke jährlich nur Seite 1 mit der
//  Lieferantenliste, welche bewertet werden, und wir machen die
//  Bewertung hier“, „verarbeiten und graphisch darstellen“).
//
//  Ablauf: Seite 1 aus dem Gewatec (PDF oder Foto) einlesen → die App
//  schlägt die grössten Lieferanten bis 80 % der Bestellungen vor →
//  bewerten wie auf dem Gewatec-Blatt (5 Kriterien mit Smileys,
//  Punktzahl, Bemerkung, Datum, Visum) → Grafik über die Jahre und PDF.
//
//  Gespeichert: die Liste je Jahr in qma_texte „lieferanten:<Jahr>“
//  (felder: jahr, von, bis, druck, total, liste, auswahl), die Bewertung
//  am Lieferanten (qma_eintraege art lieferant) unter daten.verlauf[Jahr]
//  = { punkte, k: {t, p, b, q, r}, bemerkung, lieferungen, am, visum }.
//  Namen und Zahlen nur in der Datenbank.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { DiktatKnopf } from "../../teile/Diktat.jsx";
import { ARTEN, textSpeichern, eintragSpeichern, heute } from "../../daten/qmAlt.js";
import { LB_KRITERIEN, LB_STUFEN, lbAmpel, lbVorschlag, lbPunkte, lbListeLesen, lbAuswahlVorschlag } from "../../daten/lieferantenListe.js";
import { Schild } from "./Schild.jsx";

const e_ = (t) => alt.esc(t == null ? "" : String(t));
const datum = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");
const listeVon = (texte, j) => (texte["lieferanten:" + j] || {}).felder || null;
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöü]/g, "");

// Lieferant zur Nummer (oder zum Namen) aus der Gewatec-Liste
function eintragZu(alle, x) {
  const l = alle.filter((e) => e.art === "lieferant");
  return l.find((e) => x.nr && String(e.daten.nr || "") === String(x.nr))
    || l.find((e) => normName(e.titel) === normName(x.name)) || null;
}

function jahreVon(daten) {
  const j = new Set();
  for (const k of Object.keys(daten.texte)) if (/^lieferanten:\d{4}$/.test(k)) j.add(Number(k.slice(12)));
  for (const e of daten.eintraege) if (e.art === "lieferant") for (const k of Object.keys(e.daten.verlauf || {})) j.add(Number(k));
  return [...j].filter((x) => x > 2000).sort((a, b) => a - b);
}

// Werte des Jahres am Lieferanten speichern und Stand (letzte, punkte, Status) nachführen
export function mitJahr(d, jahr, v) {
  const verlauf = { ...(d.verlauf || {}), [jahr]: v };
  const jahre = Object.keys(verlauf).filter((j) => lbPunkte(verlauf[j]) > 0).map(Number).sort((a, b) => a - b);
  const lj = jahre[jahre.length - 1];
  const lv = lj ? verlauf[lj] : null;
  const punkte = lv ? lbPunkte(lv) : null;
  const daten = { ...d, verlauf, punkte, letzte: lv ? lv.am || lj + 1 + "-01-31" : d.letzte || null };
  const status = !punkte ? null : punkte < 60 ? "gesperrt" : punkte < 80 ? "beobachten" : "freigegeben";
  return { daten, status };
}

export default function Lieferanten({ daten, neu }) {
  const jahre = jahreVon(daten);
  // null = immer das neuste Jahr, auch wenn gerade eines dazukam
  const [jahr, setJahr] = useState(null);
  const j = jahre.includes(jahr) ? jahr : jahre[jahre.length - 1];
  const lief = daten.eintraege.filter((e) => e.art === "lieferant");
  const datei = useRef(null);

  const zeilen = !j ? [] : lief.map((e) => ({ e, v: (e.daten.verlauf || {})[j] || null, vv: (e.daten.verlauf || {})[j - 1] || null }))
    .filter((x) => x.v || (listeVon(daten.texte, j) || {}).auswahl?.includes(String(x.e.daten.nr || "")))
    .sort((a, b) => (lbPunkte(b.v) || 0) - (lbPunkte(a.v) || 0));
  const liste = j ? listeVon(daten.texte, j) : null;
  const anteil = (e) => ((liste && liste.liste) || []).find((x) => x.nr === String(e.daten.nr || "")) || {};

  return (
    <section className="karte" id="qma-lb">
      <div className="karte__kopf">
        <h2>Bewertung je Jahr <span className="klein">Auswahl aus dem Gewatec</span></h2>
        <button className="knopf knopf--haupt" id="qma-lb-einlesen" onClick={() => datei.current && datei.current.click()}>Gewatec-Liste einlesen</button>
        <input ref={datei} type="file" accept="application/pdf,image/*" hidden data-ablegen="direkt" id="qma-lb-datei"
          onChange={(ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (f) lbEinlesen(f, daten, neu); }} />
      </div>
      <p className="hinweis">Anfang Jahr Seite 1 „Auswahl Lieferanten zur periodischen Bewertung“ aus dem Gewatec als PDF oder Foto einlesen.
        Die App schlägt die grössten Lieferanten bis 80 % der Bestellungen vor, bewertet wird hier wie auf dem Gewatec-Blatt.</p>
      {!jahre.length ? <p className="hinweis" id="qma-lb-leer">Noch keine Bewertung eingelesen.</p> : <>
        <Verlauf lief={lief} jahre={jahre} />
        <div className="qm-filter" role="group">
          {jahre.map((x) => <button key={x} className={"knopf knopf--klein" + (x === j ? " knopf--haupt" : "")} data-qmalbjahr={x} onClick={() => setJahr(x)}>{x}</button>)}
        </div>
        <div className="qma-lb__jahr">
          <b>Bewertung {j}</b>
          {liste && liste.von && <span className="klein">Bestellungen {datum(liste.von)} bis {datum(liste.bis)}{liste.total ? " · " + liste.total + " Bestellungen" : ""}</span>}
          <span className="qma-lb__knoepfe">
            <button className="knopf knopf--klein" id="qma-lb-bewerten" onClick={() => lbBewerten(j, daten, neu)}>Bewerten</button>
            {liste && <button className="knopf knopf--klein" id="qma-lb-auswahl" onClick={() => auswahlOeffnen(liste, daten, neu, false)}>Auswahl ändern</button>}
            <button className="knopf knopf--klein" id="qma-lb-pdf" onClick={() => lbPdfZeigen(j, daten)}>📄 PDF</button>
          </span>
        </div>
        <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle qma-lb__tabelle" id="qma-lb-tabelle">
          <thead><tr><th>Lieferant</th><th>Anteil</th><th>Lief.</th>{LB_KRITERIEN.map(([k, t]) => <th key={k} title={t} className="qma-lb__k">{t.slice(0, 4)}.</th>)}<th>Punkte</th><th>{j - 1}</th><th>Bemerkung</th></tr></thead>
          <tbody>{zeilen.map(({ e, v, vv }) => {
            const p = lbPunkte(v), a = lbAmpel(p), pv = lbPunkte(vv);
            return <tr key={e.id} data-qmalbzeile={e.daten.nr || e.id}>
              <td><b>{e.titel}</b>{e.daten.nr ? <span className="klein"> {e.daten.nr}</span> : null}</td>
              <td className="qm-nowrap">{anteil(e).anteil != null ? anteil(e).anteil.toFixed(1) + " %" : ""}</td>
              <td>{(v && v.lieferungen) || ""}</td>
              {LB_KRITERIEN.map(([k]) => { const w = Number(((v || {}).k || {})[k]); return <td key={k} className={"qma-lb__k qma-lb__s" + (w || 0)}>{w ? LB_STUFEN[w - 1][1] : ""}</td>; })}
              <td>{p ? <Schild ton={a[0]}>{p}</Schild> : <span className="klein">offen</span>}</td>
              <td className="qm-nowrap klein">{pv ? pv + (p ? " (" + (p - pv >= 0 ? "+" : "") + (p - pv) + ")" : "") : ""}</td>
              <td className="qma-lb__bem">{(v && v.bemerkung) || ""}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <Kriterien lief={lief} jahre={jahre} />
      </>}
    </section>
  );
}

// Linien je Lieferant über die Jahre, Hintergrund wie die Ampel des Blatts
const FARBEN = ["#1f5fa8", "#d9822b", "#2e9e4f", "#8e44ad", "#c0392b", "#16a085", "#7f8c8d", "#b8860b", "#e84393", "#2c3e50", "#6c5ce7", "#00a8cc"];
function Verlauf({ lief, jahre }) {
  const [hell, setHell] = useState(null);
  const reihen = lief.map((e) => ({ e, p: jahre.map((j) => lbPunkte((e.daten.verlauf || {})[j]) || null) }))
    .filter((r) => r.p.some((x) => x)).sort((a, b) => (b.p[b.p.length - 1] || 0) - (a.p[a.p.length - 1] || 0));
  if (!reihen.length) return null;
  const B = 640, H = 230, L = 34, R = 26, O = 10, U = 24;
  const lo = Math.min(60, ...reihen.flatMap((r) => r.p.filter(Boolean))) - 5;
  const x = (i) => L + (jahre.length < 2 ? (B - L - R) / 2 : (i * (B - L - R)) / (jahre.length - 1));
  const y = (p) => O + ((100 - p) * (H - O - U)) / (100 - lo);
  const band = (a, b, f) => <rect x={L} y={y(Math.min(b, 100))} width={B - L - R} height={Math.max(0, y(Math.max(a, lo)) - y(Math.min(b, 100)))} fill={f} />;
  return (
    <div className="qma-lb__grafik" id="qma-lb-grafik">
      <svg viewBox={"0 0 " + B + " " + H} role="img" aria-label="Punktzahl der Lieferanten über die Jahre">
        {band(lo, 60, "rgba(211,51,51,.10)")}{band(60, 80, "rgba(229,179,0,.13)")}{band(80, 100, "rgba(46,158,79,.10)")}
        {[60, 70, 80, 90, 100].filter((p) => p >= lo).map((p) => <g key={p}><line x1={L} x2={B - R} y1={y(p)} y2={y(p)} className="qma-lb__achse" /><text x={L - 5} y={y(p) + 4} textAnchor="end" className="qma-lb__txt">{p}</text></g>)}
        {jahre.map((j, i) => <text key={j} x={x(i)} y={H - 6} textAnchor="middle" className="qma-lb__txt">{j}</text>)}
        {reihen.map((r, n) => {
          const f = FARBEN[n % FARBEN.length], an = hell == null || hell === r.e.id;
          const pkt = r.p.map((p, i) => (p ? [x(i), y(p)] : null));
          const pfad = pkt.map((q, i) => (q ? (i && pkt[i - 1] ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1) : "")).join(" ");
          return <g key={r.e.id} opacity={an ? 1 : 0.15} onMouseEnter={() => setHell(r.e.id)} onMouseLeave={() => setHell(null)}>
            <path d={pfad} fill="none" stroke={f} strokeWidth={hell === r.e.id ? 3.5 : 2} />
            {pkt.map((q, i) => q && <circle key={i} cx={q[0]} cy={q[1]} r={3.5} fill={f}><title>{r.e.titel + " " + jahre[i] + ": " + r.p[i]}</title></circle>)}
          </g>;
        })}
      </svg>
      <div className="qma-lb__legende">
        {reihen.map((r, n) => <button key={r.e.id} type="button" className={"qma-lb__leg" + (hell === r.e.id ? " qma-lb__leg--an" : "")}
          onMouseEnter={() => setHell(r.e.id)} onMouseLeave={() => setHell(null)} onClick={() => setHell(hell === r.e.id ? null : r.e.id)}>
          <i style={{ background: FARBEN[n % FARBEN.length] }} />{r.e.titel}</button>)}
      </div>
    </div>
  );
}

// Mittelwert je Kriterium und Jahr: wo es hakt
function Kriterien({ lief, jahre }) {
  const mittel = (j, k) => {
    const w = lief.map((e) => Number((((e.daten.verlauf || {})[j] || {}).k || {})[k])).filter((x) => x > 0);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  };
  if (!jahre.some((j) => LB_KRITERIEN.some(([k]) => mittel(j, k)))) return null;
  return (
    <div className="qm-tabelle-huelle"><table className="tabelle qma-lb__mittel" id="qma-lb-kriterien">
      <thead><tr><th>Kriterien im Schnitt (1–5)</th>{jahre.map((j) => <th key={j}>{j}</th>)}</tr></thead>
      <tbody>{LB_KRITERIEN.map(([k, t]) => <tr key={k}><td>{t}</td>{jahre.map((j) => {
        const m = mittel(j, k);
        return <td key={j} className={"qma-lb__s" + (m ? Math.round(m) : 0)}>{m ? m.toFixed(1) : ""}</td>;
      })}</tr>)}</tbody>
    </table></div>
  );
}

// ---------- Einlesen ----------
async function zeilenAusDatei(f) {
  if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) {
    const { pdfjs } = await import("../../teile/PdfAnsicht.jsx");
    const { zeilenAusStuecken } = await import("../../daten/kreditoren.js");
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const s = await doc.getPage(1);
    return zeilenAusStuecken((await s.getTextContent()).items);
  }
  const { mitTexterkennung } = await import("../../daten/bestellFoto.js");
  const r = await mitTexterkennung(null, (w) => w.recognize(f));
  return String((r && r.data && r.data.text) || "").split(/\n/);
}

export async function lbEinlesen(f, daten, neu) {
  alt.meldung("Liste wird gelesen …");
  let g;
  try {
    g = lbListeLesen(await zeilenAusDatei(f));
  } catch (x) {
    alt.fehlerMerken("Lieferantenliste lesen", String((x && x.message) || x));
    alt.meldung("Die Datei liess sich nicht lesen.", "fehler");
    return;
  }
  if (!g.liste.length) { alt.meldung("Keine Lieferanten gefunden. Ist es Seite 1 der Gewatec-Liste mit Text (nicht nur Bild)?", "warn"); return; }
  if (!g.jahr) g.jahr = new Date().getFullYear() - 1;
  const vorher = listeVon(daten.texte, g.jahr);
  g.auswahl = vorher && vorher.auswahl ? vorher.auswahl : lbAuswahlVorschlag(g.liste);
  g.datei = f.name;
  auswahlOeffnen(g, daten, neu, true);
}

function auswahlOeffnen(g, daten, neu, neuGelesen) {
  fensterOeffnen((zu) => <Auswahl g={g} daten={daten} neu={neu} zu={zu} neuGelesen={neuGelesen} />, null, "qma-ck-huelle");
}

function Auswahl({ g, daten, neu, zu, neuGelesen }) {
  const [jahr, setJahr] = useState(g.jahr);
  const [wahl, setWahl] = useState(() => new Set(g.auswahl || []));
  const [arbeitet, setArbeitet] = useState(false);
  let summe = 0;
  for (const x of g.liste) if (wahl.has(x.nr)) summe += Number(x.anteil) || 0;
  const umschalten = (nr) => setWahl((s) => { const n = new Set(s); n.has(nr) ? n.delete(nr) : n.add(nr); return n; });
  const uebernehmen = async () => {
    setArbeitet(true);
    try {
      const auswahl = g.liste.filter((x) => wahl.has(x.nr)).map((x) => x.nr);
      await textSpeichern("lieferanten:" + jahr, { gruppe: "lieferanten", titel: "Lieferantenbewertung " + jahr, norm: "8.4",
        felder: { jahr, von: g.von, bis: g.bis, druck: g.druck, total: g.total, liste: g.liste, auswahl, datei: g.datei || null } },
      "Lieferantenliste " + jahr);
      // Fehlende Lieferanten anlegen, damit sie bewertet werden können
      const alle = [...daten.eintraege];
      for (const x of g.liste.filter((y) => wahl.has(y.nr))) {
        const e = eintragZu(alle, x);
        if (e) { if (!e.daten.nr) await eintragSpeichern("lieferant", e, { ...e.daten, nr: x.nr }, e.status, alle); continue; }
        const id = await eintragSpeichern("lieferant", null, { titel: x.name, nr: x.nr }, "freigegeben", alle);
        alle.push({ id, art: "lieferant", titel: x.name, nr: 0, daten: { titel: x.name, nr: x.nr } });
      }
      zu();
      neu();
      alt.meldung(auswahl.length + " Lieferanten für " + jahr + " ausgewählt.", "gut");
      const { data } = await alt.db.from("qma_eintraege").select("*");
      const felder = { ...g, jahr, auswahl };
      lbBewerten(jahr, { texte: { ...daten.texte, ["lieferanten:" + jahr]: { felder } }, eintraege: data || alle }, neu);
    } catch (x) {
      alt.meldung(alt.fehlertext(x), "fehler");
      setArbeitet(false);
    }
  };
  return (
    <div className="dialog dialog--breit qma-ck qma-lb-auswahl" id="qma-lb-auswahl">
      <div className="blatt__kopf qma-ck__kopf">
        <h2>Lieferanten für die Bewertung <span className="klein">{g.von ? "Bestellungen " + datum(g.von) + " bis " + datum(g.bis) : ""}</span></h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="qma-ck__rolle">
        <div className="qma-ck__felder">
          <label>Bewertungsjahr<input type="number" value={jahr} data-qmalbfeld="jahr" onChange={(ev) => setJahr(Number(ev.target.value) || jahr)} /></label>
        </div>
        {neuGelesen && <p className="hinweis">{g.liste.length} Lieferanten gelesen. Vorgeschlagen sind die grössten bis 80 % der Bestellungen; Häkchen setzen oder wegnehmen.</p>}
        <ul className="qma-lb-wahl">
          {g.liste.map((x) => <li key={x.nr}><label>
            <input type="checkbox" checked={wahl.has(x.nr)} data-qmalbwahl={x.nr} onChange={() => umschalten(x.nr)} />
            <span className="qma-lb-wahl__name">{x.name} <span className="klein">{x.nr}</span></span>
            <span className="klein qm-nowrap">{x.anteil != null ? x.anteil.toFixed(2) + " %" : ""}{x.best ? " · " + x.best + " Best." : ""}</span>
          </label></li>)}
        </ul>
      </div>
      <div className="qma-ck__fuss">
        <span className="klein" id="qma-lb-summe">{wahl.size} ausgewählt · {summe.toFixed(1)} % der Bestellungen</span>
        <button className="knopf knopf--haupt" id="qma-lb-uebernehmen" disabled={arbeitet || !wahl.size} onClick={uebernehmen}>Übernehmen und bewerten</button>
      </div>
    </div>
  );
}

// ---------- Bewerten ----------
let jetztSpeichern = null;
export function lbBewerten(jahr, daten, neu) {
  fensterOeffnen((zu) => <Bewerten jahr={jahr} daten={daten} zu={zu} />,
    () => { if (jetztSpeichern) jetztSpeichern(); jetztSpeichern = null; neu(); }, "qma-ck-huelle");
}

function Bewerten({ jahr, daten, zu }) {
  const liste = listeVon(daten.texte, jahr) || { liste: [], auswahl: [] };
  const [lief] = useState(() => {
    const l = daten.eintraege.filter((e) => e.art === "lieferant");
    const gewaehlt = (liste.auswahl || []).map((nr) => l.find((e) => String(e.daten.nr || "") === nr)).filter(Boolean);
    const schon = l.filter((e) => (e.daten.verlauf || {})[jahr] && !gewaehlt.includes(e));
    return [...gewaehlt, ...schon];
  });
  const p = alt.profil || {};
  const visum = String(p.kuerzel || p.full_name || "").trim();
  const [werte, setWerte] = useState(() => Object.fromEntries(lief.map((e) => [e.id, { k: {}, ...((e.daten.verlauf || {})[jahr] || {}) }])));
  const [stand, setStand] = useState("");
  const offen = useRef(new Set());
  const aktuell = useRef(werte);
  const uhr = useRef(null);
  aktuell.current = werte;

  const speichern = async () => {
    clearTimeout(uhr.current); uhr.current = null; jetztSpeichern = null;
    const ids = [...offen.current]; offen.current.clear();
    try {
      for (const id of ids) {
        const e = lief.find((x) => x.id === id);
        const { data } = await alt.db.from("qma_eintraege").select("daten,status").eq("id", id);
        const d0 = (data && data[0] && data[0].daten) || e.daten;
        const { daten: d, status } = mitJahr(d0, jahr, aktuell.current[id]);
        const zeile = { daten: d, faellig: ARTEN.lieferant.faellig(d), geaendert_am: new Date().toISOString() };
        if (status) zeile.status = status;
        const { error } = await alt.db.from("qma_eintraege").update(zeile).eq("id", id);
        if (error) throw error;
      }
      setStand("gespeichert");
    } catch (x) {
      setStand("nicht gespeichert");
      alt.meldung(alt.fehlertext(x), "fehler");
    }
  };
  const aendern = (id, f) => {
    setWerte((w) => {
      const v0 = w[id] || { k: {} };
      const v = { ...v0, ...f(v0) };
      if (!v.am) v.am = heute();
      if (!v.visum && visum) v.visum = visum;
      return { ...w, [id]: v };
    });
    offen.current.add(id);
    setStand("…");
    clearTimeout(uhr.current);
    uhr.current = setTimeout(speichern, 800);
    jetztSpeichern = speichern;
  };
  useEffect(() => () => clearTimeout(uhr.current), []);
  const fertig = lief.filter((e) => lbPunkte(werte[e.id]) > 0).length;

  return (
    <div className="dialog dialog--breit qma-ck qma-lb-bew" id="qma-lb-bew">
      <div className="blatt__kopf qma-ck__kopf">
        <h2>Lieferantenbewertung {jahr} <span className="klein">{liste.von ? "Periode " + datum(liste.von) + " bis " + datum(liste.bis) : ""}</span></h2>
        <span className="klein qma-ck__stand" id="qma-lb-stand">{fertig} / {lief.length} bewertet{stand ? " · " + stand : ""}</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="qma-ck__rolle">
        <p className="klein">20–60 Lieferant sperren · 60–80 Massnahme erforderlich · 80–100 keine Massnahme erforderlich. Die Punktzahl schlägt die App aus den Smileys vor, überschreiben geht.</p>
        {!lief.length && <p className="hinweis">Keine Lieferanten ausgewählt. Zuerst die Gewatec-Liste einlesen.</p>}
        {lief.map((e) => {
          const v = werte[e.id] || { k: {} };
          const vor = lbVorschlag(v.k), pk = lbPunkte(v), a = lbAmpel(pk);
          const x = (liste.liste || []).find((y) => y.nr === String(e.daten.nr || "")) || {};
          return (
            <section key={e.id} className={"qma-lb-karte" + (a ? " qma-lb-karte--" + a[0] : "")} data-qmalbkarte={e.daten.nr || e.id}>
              <h3>{e.titel} <span className="klein">{e.daten.nr || ""}{x.anteil != null ? " · " + x.anteil.toFixed(1) + " % der Bestellungen" : ""}</span></h3>
              <div className="qma-lb-karte__k">
                {LB_KRITERIEN.map(([k, t]) => <div key={k} className="qma-lb-krit" role="group" aria-label={t}>
                  <span>{t}</span>
                  <span className="qma-lb-smileys">{LB_STUFEN.map(([w, s, txt]) => <button key={w} type="button" title={txt}
                    className={"qma-lb-smiley qma-lb__s" + w + (Number(v.k[k]) === w ? " qma-lb-smiley--an" : "")} data-qmalbk={k + w}
                    onClick={() => aendern(e.id, (v0) => ({ k: { ...v0.k, [k]: Number(v0.k[k]) === w ? null : w } }))}>{s}</button>)}</span>
                </div>)}
              </div>
              <div className="qma-ck__felder">
                <label>Punktzahl / 100<input inputMode="numeric" value={v.punkte || ""} placeholder={vor ? "Vorschlag " + vor : ""} data-qmalbpunkte={e.daten.nr || e.id}
                  onChange={(ev) => aendern(e.id, () => ({ punkte: Number(ev.target.value.replace(/\D/g, "").slice(0, 3)) || null }))} /></label>
                <label>Lieferungen<input inputMode="numeric" value={v.lieferungen || ""} onChange={(ev) => aendern(e.id, () => ({ lieferungen: Number(ev.target.value.replace(/\D/g, "")) || null }))} /></label>
                <label>Bewertet am<input type="date" value={v.am || ""} onChange={(ev) => aendern(e.id, () => ({ am: ev.target.value }))} /></label>
                <label>Visum<input value={v.visum || ""} onChange={(ev) => aendern(e.id, () => ({ visum: ev.target.value }))} /></label>
              </div>
              {a && <div className="klein"><Schild ton={a[0]}>{pk}</Schild> {a[1]}</div>}
              <div className="qma-ck__textfeld">
                <textarea rows={2} value={v.bemerkung || ""} placeholder="Bemerkung, z.B. Preise gut, Termine hie und da unpünktlich …" data-qmalbbem={e.daten.nr || e.id}
                  onChange={(ev) => aendern(e.id, () => ({ bemerkung: ev.target.value }))} />
                <DiktatKnopf wert={v.bemerkung || ""} setzen={(t) => aendern(e.id, () => ({ bemerkung: t }))} />
              </div>
            </section>
          );
        })}
      </div>
      <div className="qma-ck__fuss">
        <span className="klein">Speichert von selbst.</span>
        <button className="knopf" onClick={async () => { if (jetztSpeichern) await jetztSpeichern(); lbPdfZeigen(jahr, null, lief, werte, liste); }}>📄 PDF</button>
      </div>
    </div>
  );
}

// ---------- PDF für den Auditor ----------
export function lbHtml(jahr, zeilen, liste) {
  let h = "<div class='ck-titel'><div><h1>Lieferantenbewertung " + e_(jahr) + "</h1><div class='ck-unter'>ISO 9001:2026 Kapitel 8.4 · Auswahl nach Anzahl Bestellungen (Gewatec)</div></div>"
    + "<div class='ck-firma'>Hofer + Co<br>Präzisionsdrehteile</div></div>";
  if (liste && liste.von) h += "<p class='ck-klein'>Bestellungen vom " + e_(datum(liste.von)) + " bis " + e_(datum(liste.bis))
    + (liste.total ? ", total " + e_(liste.total) : "") + ". Bewertet werden die grössten Lieferanten bis rund 80 % der Bestellungen.</p>";
  h += "<p class='ck-klein'>Kriterien je 1 (sehr schlecht) bis 5 (sehr gut). Punktzahl 20–60 Lieferant sperren, 60–80 Massnahme erforderlich, 80–100 keine Massnahme erforderlich.</p>";
  h += "<table><thead><tr><th>Lieferant</th><th>Anteil</th><th>Lief.</th>" + LB_KRITERIEN.map(([, t]) => "<th>" + e_(t.slice(0, 5)) + ".</th>").join("")
    + "<th>Punkte</th><th>Beurteilung</th></tr></thead><tbody>";
  for (const z of zeilen) {
    const p = lbPunkte(z.v), a = lbAmpel(p);
    h += "<tr><td><b>" + e_(z.titel) + "</b> " + e_(z.nr || "") + "</td><td class='ck-nw'>" + (z.anteil != null ? z.anteil.toFixed(1) + " %" : "") + "</td><td>" + e_((z.v || {}).lieferungen || "")
      + "</td>" + LB_KRITERIEN.map(([k]) => "<td>" + e_(((z.v || {}).k || {})[k] || "") + "</td>").join("")
      + "<td class='ck-nw ck-" + (a ? a[0] : "grau") + "'>" + (p || "–") + "</td><td class='ck-klein'>" + e_(a ? a[1] : "nicht bewertet") + "</td></tr>";
  }
  h += "</tbody></table><h2>Bemerkungen</h2><table><thead><tr><th>Lieferant</th><th>Bemerkung</th><th>Bewertet am</th><th>Visum</th></tr></thead><tbody>"
    + zeilen.map((z) => "<tr><td>" + e_(z.titel) + "</td><td>" + e_((z.v || {}).bemerkung || "").replace(/\n/g, "<br>") + "</td><td class='ck-nw'>"
      + e_(datum((z.v || {}).am)) + "</td><td>" + e_((z.v || {}).visum || "") + "</td></tr>").join("") + "</tbody></table>";
  return h;
}

export async function lbPdfZeigen(jahr, daten, lief0, werte, liste0) {
  try {
    const liste = liste0 || (daten ? listeVon(daten.texte, jahr) : null) || {};
    const lief = lief0 || daten.eintraege.filter((e) => e.art === "lieferant" && ((e.daten.verlauf || {})[jahr] || (liste.auswahl || []).includes(String(e.daten.nr || ""))));
    const zeilen = lief.map((e) => {
      const x = (liste.liste || []).find((y) => y.nr === String(e.daten.nr || "")) || {};
      return { titel: e.titel, nr: e.daten.nr, anteil: x.anteil, v: werte ? werte[e.id] : (e.daten.verlauf || {})[jahr] };
    }).sort((a, b) => (b.anteil || 0) - (a.anteil || 0));
    alt.meldung("PDF wird erstellt …");
    const { pdfAusHtml } = await import("./checklistePdf.js");
    const blob = await pdfAusHtml(lbHtml(jahr, zeilen, liste), "Lieferantenbewertung " + jahr);
    alt.betrachter(URL.createObjectURL(blob), "Lieferantenbewertung " + jahr, true);
  } catch (x) {
    alt.meldung(alt.fehlertext(x), "fehler");
  }
}
