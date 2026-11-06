// =================================================================
//  WERKZEUGWECHSEL ALS BLATT IN DER HISTORIE
//  Die Historie sieht beim Index und bei Star (SB, SR) aus wie ihr PDF
//  und lässt sich darin bearbeiten (Wunsch Patrick 29. Oktober 2026:
//  „Historie so, dass sie aussieht wie das PDF … anpassen können,
//  Stückzahl, Werkzeugwahl und so“):
//  - Feld antippen: dieses Werkzeug in diesem Wechsel dazu oder weg
//  - Datum/Stückzahl antippen: Stückzahl oder Notiz ändern
//  - Papierkorb beim Wechsel: ganz löschen, ohne Liste (Wunsch Patrick
//    29. Oktober 2026)
//  - Spalte bzw. Zeile „Neu“: Werkzeuge antippen, dann eintragen
//  Index: Werkzeuge untereinander je Revolver, sechs Wechsel je Blatt
//  nebeneinander, neuer FA mit roter Spaltenlinie. Star: wie das Blatt
//  „Plattenwechsel“, je Wechsel eine Zeile, je Werkzeug eine Spalte.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { wechselAendern } from "./Werkzeugwechsel.jsx";

const datum = (iso) => new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
const stkText = (n) => (n === null || n === undefined ? "—" : alt.zahlText(n));
// Visum: das eingetippte Kürzel, bei älteren Einträgen die Anfangsbuchstaben des Kontos
const visum = (r) => r.kuerzel || String(r.person || "").split(/[\s.]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
// So viele Wechsel des Blatts davor stehen blass vorne auf dem nächsten
const VORHER = 2;
const neueId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null);

// modell: { art: "index" | "star", gruppen: [{ name, farbe, werkzeuge }],
//   runden, laden(), spaltenJeBlatt }, je Werkzeug { key, tool_nr, path,
//   text, unter, farbe, schrift, passt(zeile) }
// aktionen: { eintragen(maschine, auftrag, liste), rundeLoeschen(maschine, runde),
//   nachrechnen(maschine, zeilen) } aus Werkzeugwechsel.jsx
export function WechselBlatt({ modell, maschine, auftrag, aktionen }) {
  const [runden, setRunden] = useState(modell.runden);
  const [neu, setNeu] = useState([]);
  const [laeuft, setLaeuft] = useState(false);
  const darf = alt.darfSchreiben();
  const werkzeuge = modell.gruppen.flatMap((g) => g.werkzeuge);
  const hat = (r, w) => r && r.zeilen && r.zeilen.find((z) => w.passt(z));

  const arbeit = async (fn) => {
    if (laeuft) return;
    setLaeuft(true);
    try { await fn(); setRunden(await modell.laden()); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  };

  // Ein Werkzeug in einem schon eingetragenen Wechsel dazu oder weg
  const umschalten = (r, w) => darf && arbeit(async () => {
    const z = hat(r, w);
    if (z) {
      const vorher = await alt.rueckSichern("tool_changes", { id: z.id });
      const d = await alt.db.from("tool_changes").delete().eq("id", z.id).select("id");
      if (d.error) throw d.error;
      if (d.data && d.data.length === 0) { alt.meldung("Nicht geändert: Dafür fehlt dir das Recht.", "warn"); return; }
      await aktionen.nachrechnen({ id: z.machine_id || maschine.id }, [z]);
      alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckRein("tool_changes", vorher));
      alt.meldung(w.tool_nr + " aus dem Wechsel vom " + datum(r.wann) + " genommen.");
    } else {
      const v = r.zeilen[0];
      const id = neueId();
      const zeile = Object.assign(id ? { id } : {}, {
        machine_id: v.machine_id || maschine.id, job_id: v.job_id || null,
        hoco_nr: v.hoco_nr || (auftrag && auftrag.job_number) || null,
        tool_nr: w.tool_nr, bezeichnung: w.path || null, stueckzahl: r.stk,
        notiz: v.notiz || null, kuerzel: v.kuerzel || null, gewechselt_am: v.gewechselt_am });
      await alt.einfuegenOhneUnbekannte("tool_changes", [zeile]);
      if (id) alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckWeg("tool_changes", { id }));
      alt.meldung(w.tool_nr + " zum Wechsel vom " + datum(r.wann) + " dazu.");
    }
  });

  const rundeWeg = (r) => darf && arbeit(() => aktionen.rundeLoeschen({ id: r.zeilen[0].machine_id || maschine.id }, r));

  // Stückzahl, Kürzel und Notiz eines Wechsels ändern
  const rundeBearbeiten = async (r) => {
    if (!darf || laeuft) return;
    await arbeit(async () => { await wechselAendern(r); });
  };

  const neuUmschalten = (w) => darf && setNeu((n) => (n.includes(w.key) ? n.filter((k) => k !== w.key) : n.concat(w.key)));
  const eintragen = () => arbeit(async () => {
    const liste = werkzeuge.filter((w) => neu.includes(w.key)).map((w) => ({ tool_nr: w.tool_nr, path: w.path || null }));
    if (await aktionen.eintragen(maschine, auftrag, liste)) setNeu([]);
  });

  const knopf = darf && (
    <div className="dialog__knoepfe wzb-knoepfe">
      <span className="klein">Feld antippen: Werkzeug dazu oder weg. Datum, Stück, Bemerkung oder Visum antippen: Stückzahl, Kürzel oder Notiz ändern. Papierkorb: Wechsel löschen.</span>
      <button className="knopf knopf--haupt" data-wzbeintragen="" disabled={!neu.length || laeuft} onClick={eintragen}>
        {neu.length ? "Neuen Wechsel eintragen · " + neu.length : "Neuen Wechsel eintragen"}</button>
    </div>);

  return modell.art === "index"
    ? <IndexBlatt {...{ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, auftrag, maschine }} knopf={knopf} />
    : <StarBlatt {...{ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, werkzeuge, auftrag, maschine }} knopf={knopf} />;
}

function IndexBlatt({ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, auftrag, maschine, knopf }) {
  const je = modell.spaltenJeBlatt;
  const spalten = runden.concat(darf ? [{ neu: true, job: auftrag.id, fa: auftrag.fa_nr || "" }] : []);
  const anzahl = Math.max(1, Math.ceil(spalten.length / je));
  const [seite, setSeite] = useState(null);
  const s = seite === null ? anzahl - 1 : Math.min(seite, anzahl - 1);
  const aufBlatt = spalten.slice(s * je, (s + 1) * je);
  while (aufBlatt.length < je) aufBlatt.push(null);
  // Ab Blatt 2 stehen vorne blass die letzten zwei Wechsel des Blatts davor,
  // damit man sieht, was vorher gemacht wurde, ohne zu blättern (Wunsch
  // Patrick 6. November 2026); nur zum Ansehen, das PDF druckt sie nicht
  const vor = s > 0 ? spalten.slice(Math.max(0, s * je - VORHER), s * je) : [];
  const zeige = vor.concat(aufBlatt);
  const istVor = (i) => i < vor.length;
  const neuerFa = (c) => { const i = spalten.indexOf(c); return i > 0 && c && (spalten[i - 1].job || "") !== (c.job || ""); };
  const faText = (c) => (c.fa ? "FA " + c.fa : "anderer Auftrag");
  const kl = (c, i) => "wzb-sp" + (c && c.neu ? " wzb-sp--neu" : "") + (c && neuerFa(c) ? " wzb-sp--fa" : "")
    + (istVor(i) ? " wzb-sp--vor" : "") + (vor.length && i === vor.length ? " wzb-sp--ab" : "");
  // Vorherige Wechsel lassen sich hier nicht antippen
  const aktiv = (c, i) => c && !istVor(i);

  return (<>
    <div className="wzb-titel">
      <span>Werkstück: <strong>{auftrag.job_number}</strong></span>
      <span className="wzb-gross">Werkzeugwechselprotokoll</span>
      <span>{maschine.name}{maschine.machine_number ? " · " + maschine.machine_number : ""}</span>
      <span className="wzb-blaettern">
        <button className="knopf knopf--klein knopf--still" data-wzbzurueck="" disabled={s === 0} onClick={() => setSeite(s - 1)}>◀</button>
        <span data-wzbblatt="">Blatt {s + 1} von {anzahl}</span>
        <button className="knopf knopf--klein knopf--still" data-wzbweiter="" disabled={s >= anzahl - 1} onClick={() => setSeite(s + 1)}>▶</button>
      </span>
    </div>
    <div className="wzb-rollen">
      <table className="wzb-tabelle wzb-index">
        <colgroup><col className="wzb-nr" /><col className="wzb-wz" />{zeige.map((c, i) => <col key={i} className="wzb-sp" />)}</colgroup>
        <thead>
          <tr className="wzb-falabel"><th colSpan="2"></th>{zeige.map((c, i) => (
            <th key={i} className={kl(c, i)}>{c && (neuerFa(c) ? <span className="wzb-neufa" data-wzbneufa="">Neuer {faText(c)}</span>
              : (i === 0 ? <span className="wzb-fa">{faText(c)}</span> : null))}</th>))}</tr>
          <tr><th>T-Nr</th><th className="wzb-links">Werkzeug</th>{zeige.map((c, i) => (
            <th key={i} className={kl(c, i) + (aktiv(c, i) && !c.neu && darf ? " wzb-tipp" : "")} data-wzbrunde={aktiv(c, i) && !c.neu ? "" : undefined}
              data-wzbvor={istVor(i) ? "" : undefined} onClick={aktiv(c, i) && !c.neu ? () => rundeBearbeiten(c) : undefined}>
              {!c ? "Dat. / Stückz." : c.neu ? "Neu" : <>{datum(c.wann)}<br /><b>{stkText(c.stk)}</b>
                {c.kuerzel && <><br /><small data-wzkuerzel="">{c.kuerzel}</small></>}</>}</th>))}</tr>
          {darf && <tr className="wzb-wegzeile"><th colSpan="2"></th>{zeige.map((c, i) => (
            <th key={i} className={kl(c, i)}>{aktiv(c, i) && !c.neu && <button type="button" className="wz-weg" data-wzbweg=""
              title="Wechsel löschen" aria-label={"Wechsel vom " + datum(c.wann) + " löschen"} onClick={() => rundeWeg(c)}><Eimer /></button>}</th>))}</tr>}
        </thead>
        <tbody>{modell.gruppen.map((g) => [
          <tr key={g.name} className="wzb-gruppe"><th colSpan={2 + zeige.length} style={{ background: g.farbe }}>{g.name}</th></tr>,
          ...g.werkzeuge.map((w) => (
            <tr key={w.key} data-wzbplatz={w.key}>
              <td className="wzb-nr">{w.anzeige || w.tool_nr}</td>
              <td className="wzb-wz"><strong>{w.text}</strong>{w.unter && <small> {w.unter}</small>}</td>
              {zeige.map((c, i) => (
                <td key={i} className={kl(c, i) + (aktiv(c, i) && darf ? " wzb-tipp" : "")}
                  onClick={!aktiv(c, i) ? undefined : c.neu ? () => neuUmschalten(w) : () => umschalten(c, w)}>
                  {c && (c.neu ? (neu.includes(w.key) ? <span className="wzb-haken">✓</span> : "")
                    : hat(c, w) ? <span className="wzb-x" data-wzbx="">X</span> : "")}</td>))}
            </tr>)),
        ])}</tbody>
      </table>
    </div>
    {knopf}
  </>);
}

function StarBlatt({ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, werkzeuge, auftrag, maschine, knopf }) {
  return (<>
    <div className="wzb-titel">
      <span>Werkstück: <strong>{auftrag.job_number}</strong></span>
      <span className="wzb-gross">Werkzeugwechsel {maschine.name}</span>
    </div>
    <div className="wzb-rollen">
      <table className="wzb-tabelle wzb-star">
        <thead><tr><th className="wzb-dat">Datum:</th><th className="wzb-stk">Stück:</th>
          {werkzeuge.map((w) => <th key={w.key} className="wzb-wzk" style={{ background: w.farbe, color: w.schrift }}><span>{w.text}</span></th>)}
          <th className="wzb-links">Bemerkung:</th><th className="wzb-vis">Visum:</th>{darf && <th aria-label="Löschen"></th>}</tr></thead>
        <tbody>
          {runden.map((r) => (
            <tr key={r.schluessel}>
              <td className={"wzb-dat" + (darf ? " wzb-tipp" : "")} data-wzbrunde="" onClick={() => rundeBearbeiten(r)}>{datum(r.wann)}</td>
              <td className={"wzb-stk" + (darf ? " wzb-tipp" : "")} onClick={() => rundeBearbeiten(r)}>{stkText(r.stk)}</td>
              {werkzeuge.map((w) => (
                <td key={w.key} className={"wzb-x-zelle" + (darf ? " wzb-tipp" : "")} onClick={() => umschalten(r, w)}>
                  {hat(r, w) ? <span className="wzb-x" data-wzbx="">X</span> : ""}</td>))}
              <td className={"wzb-links klein" + (darf ? " wzb-tipp" : "")} onClick={() => rundeBearbeiten(r)}>{(r.zeilen[0] && r.zeilen[0].notiz) || ""}</td>
              <td className={"wzb-vis" + (darf ? " wzb-tipp" : "")} data-wzkuerzel="" data-wzbwer="" onClick={() => rundeBearbeiten(r)}>{visum(r)}</td>
              {darf && <td className="wzb-weg"><button type="button" className="wz-weg" data-wzbweg="" title="Wechsel löschen"
                aria-label={"Wechsel vom " + datum(r.wann) + " löschen"} onClick={() => rundeWeg(r)}><Eimer /></button></td>}
            </tr>))}
          {darf && <tr className="wzb-neu">
            <td colSpan="2"><b>Neu</b></td>
            {werkzeuge.map((w) => (
              <td key={w.key} className="wzb-x-zelle wzb-tipp" data-wzbneu={w.key} onClick={() => neuUmschalten(w)}>
                {neu.includes(w.key) ? <span className="wzb-haken">✓</span> : ""}</td>))}
            <td colSpan="3"></td>
          </tr>}
        </tbody>
      </table>
    </div>
    {!runden.length && <p className="hinweis">Für diese HOCO Nr. ist noch kein Wechsel eingetragen.</p>}
    {knopf}
  </>);
}

// Papierkorb zum direkten Löschen eines Wechsels
function Eimer() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>);
}
