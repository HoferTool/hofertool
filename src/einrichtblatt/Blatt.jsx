// =================================================================
//  EINRICHTBLATT IN DER APP
//  Das Blatt wird beim Öffnen aus den gespeicherten Angaben gezeichnet,
//  im Aussehen wie das bisherige Excel „Werkzeug-Protokoll“ des SW-20
//  (Wunsch Patrick, 12. Oktober 2026: „SW-20 als Vorlage, je Typ eine
//  Version“). Die Plätze kommen aus dem Aufbau des Typs (Produktion →
//  Maschinentypen), ihre Lage aus machine_types.blatt_aufbau; ohne
//  Aufbau ordnet die App sie nach Path.
//
//  Vor dem Blatt bestätigt man jedes Mal die Stammdaten der HOCO Nr.
//  oder korrigiert sie (Wunsch Patrick, 13. Oktober 2026).
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";
import { inDerAppDrucken } from "../teile/drucken.js";
import { blattLaden, blattSpeichern, blattIstGut, leeresBlatt, stammSpeichern, artikelBildSetzen,
  STAMM_FELDER, WASCHGEBINDE } from "./daten.js";
import { BILDER, NACHFRAGE, bildDaten, platzBild, eigeneBilder } from "./bilder.js";
import { eigenesBildHochladen, eigenesBildLoeschen } from "./daten.js";

// Eine Zeichnung aus der Bibliothek (eigene Daten im Code, kein fremdes Markup)
export function BildZeichnung({ schluessel, className }) {
  const b = bildDaten(schluessel);
  if (b && b.url) return <span className={"eba-svg eba-svg--foto " + (className || "")} data-bild={schluessel} title={b.name}>
    <img src={b.url} alt="" /></span>;
  return b ? <span className={"eba-svg " + (className || "")} data-bild={schluessel} title={b.name}
    dangerouslySetInnerHTML={{ __html: b.svg }} /> : null;
}

// Farben der Paths wie im Excel: Path 1 orange, 2 blau, 3 grün
const PFADFARBE = { 1: "#FFC000", 2: "#00B0F0", 3: "#00B050", 4: "#B4A7D6", 5: "#F4B183", 6: "#A9D18E" };
const SPALTEN = 6;

// Reihen des Blatts: je Reihe sechs Zellen mit Platz-Nr. oder null.
// Ab der dritten Reihe stehen links zwei Spalten lang der Kopf.
export function blattReihen(typ, paths) {
  const alle = [];
  [...paths].sort((a, b) => (a.nummer || 0) - (b.nummer || 0) || (a.sortierung || 0) - (b.sortierung || 0))
    .forEach((p) => (p.type_slots || []).forEach((s) => { if (s.tool_nr && !alle.includes(s.tool_nr)) alle.push(s.tool_nr); }));
  const vorgabe = typ && typ.blatt_aufbau && Array.isArray(typ.blatt_aufbau.reihen) ? typ.blatt_aufbau.reihen : null;
  let reihen;
  if (vorgabe) {
    reihen = vorgabe.map((r) => Array.from({ length: SPALTEN }, (_, i) => r[i] || null));
    // Plätze, die im Aufbau des Typs dazugekommen sind, hinten anhängen
    const drin = new Set(reihen.flat().filter(Boolean));
    const rest = alle.filter((n) => !drin.has(n));
    while (rest.length) reihen.push([null, null].concat(Array.from({ length: SPALTEN - 2 }, () => rest.shift() || null)));
  } else {
    const rest = alle.slice();
    reihen = [];
    for (let i = 0; i < 2; i++) reihen.push(Array.from({ length: SPALTEN }, () => rest.shift() || null));
    do { reihen.push([null, null].concat(Array.from({ length: SPALTEN - 2 }, () => rest.shift() || null))); }
    while (rest.length || reihen.length < 5);
  }
  return reihen;
}

function pfadVonPlatz(paths) {
  const k = {};
  paths.forEach((p) => (p.type_slots || []).forEach((s) => { if (s.tool_nr) k[s.tool_nr] = p; }));
  return k;
}

const sek = (s) => (s ? String(Math.round(Number(s) * 10) / 10).replace(".", ".") + " Sek./Stk." : "");
const heute = () => { const d = new Date(); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getFullYear()).slice(2); };

// ---------------- Das Blatt selbst ----------------
export function BlattSeite({ typ, paths, teil, typDaten, blatt, bearbeiten, platzWahl, kopfWahl, aktiv, artikelBilder }) {
  const reihen = useMemo(() => blattReihen(typ, paths), [typ, paths]);
  const pfad = useMemo(() => pfadVonPlatz(paths), [paths]);
  const pfadeSortiert = [...paths].sort((a, b) => (a.nummer || 0) - (b.nummer || 0));
  const plaetze = blatt.plaetze || {};
  const programme = blatt.programme || {};
  const mitGeometrie = !!(typ.blatt_aufbau && typ.blatt_aufbau.geometrie) || !!blatt.geometrie;
  const kopfAb = 2;
  const kopfBis = reihen.length;
  const titelTyp = String(typ.name || "").replace(/-/g, "");

  const zelle = (nr, ri, si) => {
    const p = plaetze[nr] || {};
    const pf = pfad[nr];
    const farbe = pf ? PFADFARBE[pf.nummer] || "#ccc" : "#d0d0d0";
    const bild = platzBild(p, artikelBilder);
    return (
      <div key={nr} className={"eba-zelle eba-platz" + (bearbeiten ? " eba-platz--bearbeiten" : "") + (aktiv === nr ? " eba-platz--aktiv" : "")}
        style={{ gridRow: ri + 1, gridColumn: si + 1 }} data-platz={nr}
        onClick={bearbeiten ? () => platzWahl(nr) : undefined}>
        <div className="eba-tk" style={{ background: farbe }}>{nr}{p.hd && <span className="eba-hd" data-hd="">HD</span>}</div>
        <div className="eba-wert">{p.standzeit ? alt.zahlText(p.standzeit) : ""}</div>
        <div className="eba-tat">{p.taetigkeit || ""}</div>
        <div className="eba-mass">{p.mass || ""}</div>
        <div className="eba-bild">{bild ? <BildZeichnung schluessel={bild.schluessel} /> : null}</div>
        <div className="eba-her">{p.hersteller || ""}</div>
        <div className="eba-wz">{p.werkzeug || ""}</div>
      </div>
    );
  };

  const material = [teil.material, teil.material_groesse].filter(Boolean).join(" ");
  const stamm = (w) => (bearbeiten ? <span className="eba-stamm">{w || " "}</span> : w);
  return (
    <div className="eba-seite" data-eba-seite="">
      <div className="eba-titel"><span /><b>Werkzeug- Protokoll-{titelTyp}</b><span className="eba-datum">{heute()}</span></div>
      <div className="eba-raster" style={{ gridTemplateRows: "repeat(" + reihen.length + ", auto)" }}>
        {reihen.map((r, ri) => r.map((nr, si) => (nr ? zelle(nr, ri, si)
          : (ri >= kopfAb && si < 2) ? null
          : <div key={"l" + ri + "-" + si} className="eba-zelle eba-leer" style={{ gridRow: ri + 1, gridColumn: si + 1 }} />)))}
        <div className={"eba-zelle eba-kopf" + (bearbeiten ? " eba-kopf--bearbeiten" : "")}
          style={{ gridRow: (kopfAb + 1) + " / " + (kopfBis + 1), gridColumn: "1 / 3" }}
          data-eba-kopf="" onClick={bearbeiten ? kopfWahl : undefined}>
          {pfadeSortiert.map((p) => (
            <div key={p.id} className="eba-prg">
              <span style={{ background: PFADFARBE[p.nummer] || "#ccc" }}>Programm Path {p.nummer}:</span>
              <b>{programme[p.nummer] || ""}</b></div>))}
          {mitGeometrie && <div className="eba-prg"><span style={{ background: "#FF0000" }}>Geometriedaten:</span><b>{blatt.geometrie || ""}</b></div>}
          <table className="eba-tab"><tbody>
            <tr><th>Ho&amp;Co. Nr:</th><td>{blatt.hoco_nr}</td></tr>
            <tr><th>Artikel Bezeich:</th><td>{stamm(teil.bezeichnung)}</td></tr>
            <tr><th>Zeichnungs Nr:</th><td>{stamm(teil.zeichnungs_nr)}</td></tr>
            <tr><th>Index:</th><td>{stamm(teil.index_nr)}</td></tr>
            <tr><th>Autom.-Typ / Nr:</th><td>{typ.name}{blatt.maschine_nr ? "   " + blatt.maschine_nr : ""}</td></tr>
            <tr><th>Material:</th><td>{material}</td></tr>
            <tr><th>Prod.- Zeit:</th><td>{sek(typDaten.stueckzeit_s)}</td></tr>
            <tr><th>Waschgebinde:</th><td>{stamm(teil.waschgebinde)}</td></tr>
            <tr><th>Masch.- Laufzeit:</th><td>{typDaten.abend_stk ? typDaten.abend_stk + " Stk. am Abend" : ""}</td></tr>
          </tbody></table>
          {blatt.bemerkung && <div className="eba-bem">{blatt.bemerkung}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------- Ein Platz bearbeiten ----------------
let artikelGemerkt = null;
async function artikelLaden() {
  if (artikelGemerkt) return artikelGemerkt;
  const [a, l] = await Promise.all([
    alt.db.from("articles").select("id, article_number, name, supplier_id, is_active"),
    alt.db.from("suppliers").select("id, name"),
  ]);
  const lief = {}; (l.data || []).forEach((x) => { lief[x.id] = x.name; });
  artikelGemerkt = (a.data || []).filter((x) => x.is_active !== false)
    .map((x) => ({ id: x.id, nr: x.article_number || "", name: x.name || "", lieferant: lief[x.supplier_id] || "" }));
  return artikelGemerkt;
}

// Ein Fenster je Werkzeugplatz: Tätigkeit, Mass, Werkzeug als Artikel
// aus den Bestellungen (oder neu angelegt, dann schlägt ihn auch das
// Bestellen vor), Hersteller, HD ein oder aus, Standzeit wenn man will,
// und das Bild aus der Bibliothek. Das Bild merkt sich der Artikel
// (Wunsch Patrick, 13. Oktober 2026).
function PlatzFenster({ nr, pfad, wert, setzen, zu, artikelBilder, artikelBildNeu }) {
  const [p, setP] = useState(Object.assign({}, wert));
  const [artikel, setArtikel] = useState([]);
  const [suche, setSuche] = useState(false);
  const [bildWahl, setBildWahl] = useState(false);
  useEffect(() => { artikelLaden().then(setArtikel).catch(() => {}); }, []);
  const f = (feld) => (e) => setP(Object.assign({}, p, { [feld]: e.target.value }));
  const q = String(p.werkzeug || "").toLowerCase().trim();
  const treffer = suche && q.length >= 2
    ? artikel.filter((a) => (a.nr + " " + a.name + " " + a.lieferant).toLowerCase().includes(q)).slice(0, 6) : [];
  const nehmen = (a) => {
    setP(Object.assign({}, p, { werkzeug: a.nr, article_id: a.id, hersteller: a.lieferant || p.hersteller || "",
      bild: (artikelBilder[a.id] || p.bild || null) }));
    setSuche(false);
  };
  const neuerArtikel = async () => {
    setSuche(false);
    const a = await alt.artikelSchnellAnlegen(p.werkzeug || "");
    if (!a) return;
    artikelGemerkt = null;
    artikelLaden().then(setArtikel).catch(() => {});
    nehmen({ id: a.id, nr: a.article_number || "", name: a.name || "", lieferant: a.supplier_name || "" });
  };
  const artikelName = p.article_id && (artikel.find((a) => a.id === p.article_id) || {}).name;
  const bild = platzBild(p, Object.assign({}, artikelBilder, p.article_id && p.bild ? { [p.article_id]: p.bild } : {}));

  const fertig = async () => {
    const z = {};
    const sz = String(p.standzeit === undefined || p.standzeit === null ? "" : p.standzeit).replace(/'/g, "").trim();
    if (sz !== "" && !isNaN(Number(sz))) z.standzeit = Number(sz);
    ["taetigkeit", "mass", "hersteller", "werkzeug"].forEach((k) => { const w = String(p[k] || "").trim(); if (w) z[k] = w; });
    if (p.hd) z.hd = true;
    if (p.article_id && z.werkzeug) z.article_id = p.article_id;
    if (p.bild) z.bild = p.bild;
    // Am Artikel merken, damit jeder andere Platz mit diesem Artikel es bekommt
    if (z.article_id && p.bild && artikelBilder[z.article_id] !== p.bild) {
      try { await artikelBildSetzen(z.article_id, p.bild); artikelBildNeu(z.article_id, p.bild); }
      catch (x) { alt.meldung(alt.fehlertext(x), "warn"); }
    }
    setzen(z); zu();
  };
  return (
    <div className="eba-platzfenster" data-platzfenster={nr} onClick={(e) => e.stopPropagation()}>
      <div className="eba-pf-kopf"><b>{nr}{pfad ? " · " + pfad.name : ""}</b>
        <button className="knopf knopf--klein knopf--still" data-pf-zu="" onClick={zu}>✕</button></div>
      <div className="eba-pf-oben">
        <button className="eba-pf-bildknopf" data-pf-bild="" onClick={() => setBildWahl(!bildWahl)} title="Bild wählen">
          {bild ? <BildZeichnung schluessel={bild.schluessel} /> : <span className="eba-plus">Bild<br />wählen</span>}
          <small>{!bild ? "" : bild.art === "artikel" ? "vom Artikel" : bild.art === "vorschlag" ? "Vorschlag" : "gewählt"}</small>
        </button>
        <div className="eba-pf-felder">
          <label className="feld"><span>Tätigkeit</span><input data-pf="taetigkeit" value={p.taetigkeit || ""} onChange={f("taetigkeit")} /></label>
          <label className="feld"><span>Mass</span><input data-pf="mass" value={p.mass || ""} onChange={f("mass")} /></label>
        </div>
      </div>
      {bildWahl && <Bibliothek aktiv={bild && bild.schluessel}
        waehlen={(k) => { setP(Object.assign({}, p, { bild: k })); setBildWahl(false); }} />}
      <label className="feld eba-pf-such"><span>Werkzeug (Artikel){artikelName ? " · " + artikelName : ""}</span>
        <input data-pf="werkzeug" value={p.werkzeug || ""} placeholder="Artikel suchen oder Text"
          onChange={(e) => { setP(Object.assign({}, p, { werkzeug: e.target.value, article_id: null })); setSuche(true); }} />
        {suche && q.length >= 2 && <div className="eba-pf-liste">
          {treffer.map((a) => <button key={a.id} className="eba-pf-treffer" data-artikel={a.id} onClick={() => nehmen(a)}>
            <b>{a.nr}</b><span>{[a.name, a.lieferant].filter(Boolean).join(" · ")}</span></button>)}
          <button className="eba-pf-treffer eba-pf-frei" data-pf-neuartikel="" onClick={neuerArtikel}>+ „{p.werkzeug}“ als neuen Artikel anlegen</button>
          <button className="eba-pf-treffer eba-pf-frei" onClick={() => setSuche(false)}>„{p.werkzeug}“ nur als Text nehmen</button>
        </div>}
      </label>
      <label className="feld"><span>Hersteller</span><input data-pf="hersteller" value={p.hersteller || ""} onChange={f("hersteller")} /></label>
      <div className="eba-pf-zeile">
        <button className={"eba-pf-hd" + (p.hd ? " eba-pf-hd--an" : "")} data-pf="hd" aria-pressed={!!p.hd}
          onClick={() => setP(Object.assign({}, p, { hd: !p.hd }))}>HD {p.hd ? "ein" : "aus"}</button>
        <label className="feld"><span>Standzeit (Stk.), wenn bekannt</span>
          <input data-pf="standzeit" inputMode="numeric" placeholder="leer lassen"
            value={p.standzeit === undefined || p.standzeit === null ? "" : p.standzeit} onChange={f("standzeit")} /></label>
      </div>
      <div className="eba-pf-fuss">
        <button className="knopf knopf--klein" data-pf-leeren="" onClick={() => setP({})}>Platz leeren</button>
        <button className="knopf knopf--klein knopf--haupt" data-pf-ok="" onClick={fertig}>Übernehmen</button>
      </div>
    </div>
  );
}

// Auswahl der Bilder: nur Bilder, keine Beschriftung (Wunsch Patrick,
// 13. Oktober 2026). Beim Bohrer fragt ein kleines Fenster nach normal
// oder flach. Am Ende die eigenen, hochgeladenen Bilder und „+“.
function Bibliothek({ aktiv, waehlen }) {
  const [, neu] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const nehmen = async (k) => {
    const n = NACHFRAGE[k];
    if (!n) { waehlen(k); return; }
    const w = await alt.auswahlDialog(n.titel, n.wahl.map(([wert, text]) => ({ wert, text })));
    if (w) waehlen(w);
  };
  const hoch = async (e) => {
    const d = (e.target.files || [])[0];
    e.target.value = "";
    if (!d) return;
    setLaedt(true);
    try { const k = await eigenesBildHochladen(d); neu((x) => x + 1); waehlen(k); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaedt(false); }
  };
  const weg = async (b, ev) => {
    ev.stopPropagation();
    if (!(await alt.nachfragen({ titel: "Bild löschen", text: "Dieses Bild aus der Bibliothek löschen? Wo es schon verwendet ist, steht danach kein Bild mehr.", bestaetigen: "Löschen", gefahr: true }))) return;
    try { await eigenesBildLoeschen(b.id); neu((x) => x + 1); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const an = (k) => aktiv === k || (NACHFRAGE[k] && NACHFRAGE[k].wahl.some(([w]) => w === aktiv));
  return (
    <div className="eba-pf-bibliothek" data-pf-bibliothek="">
      {BILDER.filter((b) => !b[3]).map(([k, name]) => <button key={k} className={"eba-pf-bib" + (an(k) ? " eba-pf-bib--an" : "")}
        data-bib={k} title={name} onClick={() => nehmen(k)}><BildZeichnung schluessel={k} /></button>)}
      {eigeneBilder().map((b) => <button key={b.schluessel} className={"eba-pf-bib" + (aktiv === b.schluessel ? " eba-pf-bib--an" : "")}
        data-bib={b.schluessel} title={b.name} onClick={() => nehmen(b.schluessel)}><BildZeichnung schluessel={b.schluessel} />
        {darf && <span className="eba-pf-bib-weg" data-bib-weg={b.id} onClick={(ev) => weg(b, ev)}>✕</span>}</button>)}
      {darf && <label className="eba-pf-bib eba-pf-bib--hoch" title="Eigenes Bild hochladen">{laedt ? "…" : "+"}
        <input type="file" accept="image/*" hidden data-bib-hoch="" onChange={hoch} /></label>}
      <button className="eba-pf-bib eba-pf-bib--keins" data-bib="" title="Kein Bild" onClick={() => waehlen(null)}>—</button>
    </div>
  );
}

// ---------------- Das Fenster ----------------
function BlattFenster({ hocoNr, typId, zu, daten: start }) {
  const [daten, setDaten] = useState(start);
  const [bearbeiten, setBearbeiten] = useState(!start.blatt);
  const [entwurf, setEntwurf] = useState(start.blatt || leeresBlatt(hocoNr, typId));
  const [platz, setPlatz] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [artikelBilder, setArtikelBilder] = useState(start.artikelBilder || {});
  const seite = useRef(null);
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const { typ, paths, teil, typDaten } = daten;
  const excel = typDaten.blatt_url || null;
  const blatt = bearbeiten ? entwurf : (daten.blatt || entwurf);

  const neuLaden = async () => { const d = await blattLaden(hocoNr, typId); setDaten(d); setArtikelBilder(d.artikelBilder || {}); return d; };
  const speichern = async () => {
    setLaeuft(true);
    try {
      await blattSpeichern(entwurf, "Einrichtblatt " + hocoNr + " " + (typ.name || ""));
      const d = await neuLaden();
      setEntwurf(d.blatt || entwurf);
      setBearbeiten(false); setPlatz(null);
      alt.meldung("Einrichtblatt gespeichert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  const abbrechen = () => {
    if (!daten.blatt) { zu(); return; }
    setEntwurf(daten.blatt); setBearbeiten(false); setPlatz(null);
  };
  const kopf = async () => {
    const felder = [...paths].sort((a, b) => (a.nummer || 0) - (b.nummer || 0))
      .map((p) => ({ name: "prg" + p.nummer, label: "Programm Path " + p.nummer, wert: (entwurf.programme || {})[p.nummer] || "" }));
    if ((typ.blatt_aufbau && typ.blatt_aufbau.geometrie) || entwurf.geometrie) felder.push({ name: "geometrie", label: "Geometriedaten", wert: entwurf.geometrie || "" });
    felder.push({ name: "maschine_nr", label: "Nr. hinter dem Typ", wert: entwurf.maschine_nr || "", platzhalter: "z. B. Nr.122" });
    felder.push({ name: "bemerkung", label: "Weitere Angaben", typ: "textarea", wert: entwurf.bemerkung || "", platzhalter: "z. B. Abgreifen mit Schnabelzange Ø20.00" });
    const w = await alt.dialogFelder({ titel: "Kopf des Einrichtblatts", felder, bestaetigen: "Übernehmen" });
    if (!w) return;
    const programme = {};
    paths.forEach((p) => { const x = (w["prg" + p.nummer] || "").trim(); if (x) programme[p.nummer] = x; });
    setEntwurf(Object.assign({}, entwurf, { programme, geometrie: w.geometrie === undefined ? entwurf.geometrie : (w.geometrie || null),
      maschine_nr: w.maschine_nr || null, bemerkung: w.bemerkung || null }));
  };
  const stammAendern = async () => {
    if (await stammdatenBestaetigen(hocoNr, teil, true)) await neuLaden();
  };
  const gut = async () => {
    const ok = await alt.nachfragen({ titel: "Blatt ist gut",
      text: "Stimmt das Blatt? Dann wird das bisherige Excel-Einrichtblatt von " + hocoNr + " auf " + typ.name
        + " aus der Datenbank gelöscht, und die Aufgabe „HoferTool“ lädt dafür kein Excel mehr hoch.",
      bestaetigen: "Excel löschen", gefahr: true });
    if (!ok) return;
    setLaeuft(true);
    try { await blattIstGut(daten.blatt); await neuLaden(); alt.meldung("Das Excel ist gelöscht, es gilt das Blatt in der App.", "gut"); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  const drucken = () => {
    const k = seite.current && seite.current.querySelector("[data-eba-seite]");
    if (!k) return;
    const kopie = k.cloneNode(true);
    kopie.classList.add("eba-seite--druck");
    try { inDerAppDrucken([kopie], { quer: true, titel: "Einrichtblatt " + hocoNr + " " + (typ.name || ""), rand: "8mm" }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const platzSetzen = (nr, z) => {
    const plaetze = Object.assign({}, entwurf.plaetze || {});
    if (Object.keys(z).length) plaetze[nr] = z; else delete plaetze[nr];
    setEntwurf(Object.assign({}, entwurf, { plaetze }));
  };
  const pfad = pfadVonPlatz(paths);

  return (
    <div className="betrachter eba-fenster">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">Einrichtblatt {hocoNr} · {typ.name}</span>
        <div className="betrachter__knoepfe">
          {bearbeiten
            ? <>
                <span className="eba-hinweis">Grau hinterlegt: Stammdaten der HOCO Nr., gelten überall</span>
                <button className="knopf knopf--klein" data-eba-stamm="" onClick={stammAendern}>Stammdaten</button>
                <button className="knopf knopf--klein" data-eba-abbrechen="" onClick={abbrechen}>Abbrechen</button>
                <button className="knopf knopf--klein knopf--haupt" data-eba-speichern="" disabled={laeuft} onClick={speichern}>Speichern</button>
              </>
            : <>
                {darf && <button className="knopf knopf--klein" data-eba-bearbeiten="" onClick={() => { setEntwurf(daten.blatt); setBearbeiten(true); }}>Bearbeiten</button>}
                {excel && <button className="knopf knopf--klein" data-eba-excel="" onClick={() => dokZeigen({ art: "einrichtblatt", titel: "Excel " + hocoNr, adresse: excel })}>Excel ansehen</button>}
                {excel && darf && daten.blatt && <button className="knopf knopf--klein" data-eba-gut="" disabled={laeuft} onClick={gut}>Blatt ist gut</button>}
                <button className="knopf knopf--klein" data-eba-drucken="" onClick={drucken}>Drucken</button>
                <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
              </>}
        </div>
      </div>
      <div className="betrachter__buehne eba-buehne" ref={seite} onClick={() => setPlatz(null)}>
        <BlattSeite typ={typ} paths={paths} teil={teil} typDaten={typDaten} blatt={blatt}
          bearbeiten={bearbeiten} aktiv={platz} artikelBilder={artikelBilder} kopfWahl={(e) => { e.stopPropagation(); kopf(); }}
          platzWahl={(nr) => setTimeout(() => setPlatz(nr), 0)} />
        {bearbeiten && platz && <PlatzFenster key={platz} nr={platz} pfad={pfad[platz]}
          wert={(entwurf.plaetze || {})[platz] || {}} setzen={(z) => platzSetzen(platz, z)} zu={() => setPlatz(null)}
          artikelBilder={artikelBilder} artikelBildNeu={(id, b) => setArtikelBilder((x) => Object.assign({}, x, { [id]: b }))} />}
        {!paths.length && <div className="abruf-leer"><b>Für {typ.name} sind noch keine Werkzeugplätze angelegt.</b>
          <p>Unter Produktion → Maschinentypen → {typ.name} → Aufbau anlegen, etwa mit „Aufbau übernehmen“ vom SW-20.</p></div>}
      </div>
    </div>
  );
}

// Stammdaten der HOCO Nr. bestätigen oder korrigieren. Gibt true
// zurück, wenn bestätigt (geändert oder nicht), false bei Abbrechen.
export async function stammdatenBestaetigen(hocoNr, teil, nurAendern) {
  const t = teil || {};
  const felder = STAMM_FELDER.map(([f, label]) => (f === "waschgebinde"
    ? { name: f, label, wert: t[f] || "",
        auswahl: [["", "—"]].concat([...new Set(WASCHGEBINDE.concat(t[f] ? [t[f]] : []))].map((x) => [x, x])) }
    : { name: f, label, wert: t[f] || "" }));
  const w = await alt.dialogFelder({
    titel: (nurAendern ? "Stammdaten " : "Stimmen die Stammdaten? ") + hocoNr,
    text: nurAendern ? "Gilt für die HOCO Nr. auf allen Typen." : "Bitte prüfen und wenn nötig korrigieren oder ergänzen. Gilt für die HOCO Nr. auf allen Typen.",
    felder, bestaetigen: nurAendern ? "Speichern" : "Stimmt so" });
  if (!w) return false;
  try { if (await stammSpeichern(hocoNr, t, w)) alt.meldung("Stammdaten von " + hocoNr + " gespeichert.", "gut"); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return false; }
  return true;
}

// Öffnen: zuerst die Stammdaten bestätigen (wer schreiben darf), dann das Blatt
export async function einrichtblattAppOeffnen(hocoNr, typId) {
  let daten;
  try { daten = await blattLaden(hocoNr, typId); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  if (alt.darfSchreiben() && !alt.istExtern()) {
    if (!(await stammdatenBestaetigen(hocoNr, daten.teil, false))) return;
    try { daten = await blattLaden(hocoNr, typId); } catch (f) { /* dann mit dem Stand von eben */ }
  }
  fensterOeffnen((zu) => <BlattFenster hocoNr={hocoNr} typId={typId} daten={daten} zu={zu} />,
    null, "betrachter-huelle eba-huelle");
}

// Schild der Test-Fassung unter .../test/, damit niemand sie mit der
// Live-App verwechselt
if (typeof location !== "undefined" && /\/test\//.test(location.pathname)) {
  setTimeout(() => {
    if (document.querySelector(".vorschau-schild")) return;
    const s = document.createElement("div");
    s.className = "vorschau-schild";
    s.textContent = "Test: Einrichtblatt in der App";
    document.body.appendChild(s);
  }, 0);
}
