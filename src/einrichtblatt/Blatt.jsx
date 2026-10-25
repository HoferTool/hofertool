// =================================================================
//  EINRICHTBLATT IN DER APP
//  Das Blatt wird beim Öffnen aus den gespeicherten Angaben gezeichnet,
//  im Aussehen wie das bisherige Excel „Werkzeug-Protokoll“ des Typs.
//  Jeder Typ hat seine Hofer-Version (vorlagen.js), abgeleitet aus
//  seinen bisherigen Excel-Blättern (Wunsch Patrick, 23. Oktober 2026:
//  „baue die Testseite für alle Maschinen, nicht nur SW-20“).
//
//  Im Bearbeiten füllt man den Kopf direkt im Blatt aus. Was zur HOCO
//  Nr. gehört, geht in die Stammdaten, Stückzeit und Laufzeit zur HOCO
//  Nr. und dem Typ, der Rest ans Blatt. Werkzeuge schreibt man nicht,
//  man wählt sie wie beim Bestellen (neu anlegen geht dort auch).
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";
import { inDerAppDrucken } from "../teile/drucken.js";
import { werkzeugWaehlen } from "../seiten/bestellungen/PositionFenster.jsx";
import { excelVorlesen, blattLaden, blattSpeichern, blattIstGut, leeresBlatt, stammSpeichern, typSpeichern, artikelBildSetzen,
  artikelHolen, STAMM_FELDER, WASCHGEBINDE, prgNummern } from "./daten.js";
import { bildDaten, platzBild, eigeneBilder, bildSchluesselVon } from "./bilder.js";
import { eigenesBildHochladen, eigenesBildLoeschen } from "./daten.js";
import { vorlageFuer, reihenMitRest, platzName, platzGruppe } from "./vorlagen.js";
import { TextBlatt, textBearbeiten } from "../infoboard/TextFeld.jsx";
import { ohneFa } from "./excelEinlesen.js";

// Ein hochgeladenes Bild aus der Bibliothek
export function BildZeichnung({ schluessel, className }) {
  const b = bildDaten(schluessel);
  return b && b.url ? <span className={"eba-svg eba-svg--foto " + (className || "")} data-bild={schluessel} title={b.name}>
    <img src={b.url} alt="" /></span> : null;
}

// Farben der Paths für Typen ohne eigene Farben in der Vorlage
const PFADFARBE = { 1: "#FFC000", 2: "#00B0F0", 3: "#00B050", 4: "#B4A7D6", 5: "#F4B183", 6: "#A9D18E" };
const GRAU = "#d0d0d0";

// Die Vorlage des Typs; beim SW-20 gilt ein Aufbau, den jemand beim Typ
// hinterlegt hat (machine_types.blatt_aufbau), wie bisher
export function blattVorlage(typ, paths) {
  const v = vorlageFuer(typ, paths);
  if (v.art === "sw" && typ && typ.blatt_aufbau && Array.isArray(typ.blatt_aufbau.reihen)) {
    v.reihen = typ.blatt_aufbau.reihen.map((r) => Array.from({ length: v.spalten }, (_, i) => r[i] || null));
  }
  return v;
}

function pfadVonPlatz(paths) {
  const k = {};
  paths.forEach((p) => (p.type_slots || []).forEach((s) => { if (s.tool_nr) k[s.tool_nr] = p; }));
  return k;
}

const heute = () => { const d = new Date(); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getFullYear()).slice(2); };
const leer = (w) => w === undefined || w === null ? "" : w;

// Wert eines Kopffelds, je nachdem, wo es gespeichert ist
function feldWert(f, d) {
  if (f.art === "fest") return d.blatt.hoco_nr;
  if (f.art === "stamm") return leer(d.teil[f.feld]);
  if (f.art === "typ") return leer(d.typDaten[f.feld]);
  if (f.art === "prg") {
    const pr = d.blatt.programme || {};
    return f.feld === "nr" ? (pr.nr !== undefined ? pr.nr : prgNummern(d.blatt)) : leer(pr[f.feld]);
  }
  if (f.art === "blatt") return leer(d.blatt[f.feld]);
  if (f.art === "kopf") return leer((d.blatt.kopf || {})[f.feld]);
  return "";
}

// So steht es auf dem Blatt
function feldText(f, w, d) {
  if (f.feld === "material") return [w, d.teil.material_groesse].filter(Boolean).join(" ");
  if (f.typVorne) return (d.typ.name || "") + (w ? "   " + w : "");
  if (f.einheit) {
    if (w === "" || isNaN(Number(w))) return w;
    return (f.feld === "stueckzeit_s" ? Math.round(Number(w) * 10) / 10 : w) + " " + f.einheit;
  }
  return w;
}

// Ein Eingabefeld im Kopf
function KopfEingabe({ f, wert, aendern, d }) {
  const id = f.art + ":" + f.feld;
  if (f.art === "fest") return <span>{wert}</span>;
  if (f.auswahl === "waschgebinde") {
    const liste = [...new Set(WASCHGEBINDE.concat(wert ? [wert] : []))];
    return <select className="eba-ein" data-eba-feld={id} value={wert} onChange={(e) => aendern(f, e.target.value)}>
      <option value="">—</option>{liste.map((x) => <option key={x} value={x}>{x}</option>)}</select>;
  }
  const feld = <input className="eba-ein" data-eba-feld={id} value={wert} inputMode={f.zahl ? "decimal" : undefined}
    placeholder={f.platzhalter || ""} onChange={(e) => aendern(f, e.target.value)} />;
  if (f.feld === "material") {
    return <span className="eba-ein-zwei">{feld}
      <input className="eba-ein eba-ein--kurz" data-eba-feld="stamm:material_groesse" placeholder="Mass"
        value={leer(d.teil.material_groesse)} onChange={(e) => aendern({ art: "stamm", feld: "material_groesse" }, e.target.value)} /></span>;
  }
  if (f.typVorne) return <span className="eba-ein-zwei"><span>{d.typ.name}</span>{feld}</span>;
  if (f.einheit) return <span className="eba-ein-zwei">{feld}<small>{f.einheit}</small></span>;
  return feld;
}

// ---------------- Das Blatt selbst ----------------
// Immer genau ein A4 quer, am Bildschirm wie auf dem Papier. Alle Reihen
// gleich hoch, jedes Werkzeugfeld bei allen Typen gleich aufgebaut
// (Wunsch Patrick, 24. Oktober 2026): Platz mit HD und Standzeit, zwei
// Zeilen Aufgabe („Bohren“ / „Ø 3.50“), Platz fürs Bild, Lieferant und
// Artikel-Nr. Was nicht passt, wird abgeschnitten statt das Blatt zu
// sprengen. Der Kopf nimmt so viel Platz, wie der Typ Angaben hat, der
// Rest darunter gehört den Bemerkungen.
// teil und typDaten sind im Bearbeiten die Entwürfe; aendern(f, wert)
// ändert ein Kopffeld
export function BlattSeite({ typ, paths, teil, typDaten, blatt, bearbeiten, platzWahl, aendern, aktiv, artikelBilder }) {
  const vorlage = useMemo(() => blattVorlage(typ, paths), [typ, paths]);
  const reihen = useMemo(() => reihenMitRest(vorlage, blatt.plaetze), [vorlage, blatt.plaetze]);
  const pfad = useMemo(() => pfadVonPlatz(paths), [paths]);
  const plaetze = blatt.plaetze || {};
  const { kopfAb, kopfBreite } = vorlage;
  const d = { blatt, teil, typDaten, typ };
  // Geometriedaten nur, wo die Vorlage sie hat oder schon etwas steht
  const felder = vorlage.felder.filter((f) => f.feld !== "geometrie" || vorlage.art === "sw" || blatt.geometrie);
  // Die FA Nr. gehört nicht mehr ins Blatt, auch nicht in die Bemerkung
  const bemerkung = ohneFa(blatt.bemerkung);

  // Star wie im Excel: Plätze in Gebrauch in der Farbe des Typs, leere grau
  const inGebrauch = (p) => ["taetigkeit", "mass", "werkzeug", "hersteller", "standzeit", "hd", "geo"].some((k) => p[k]);
  const farbeVon = (nr) => (vorlage.farben && vorlage.farben[nr])
    || (vorlage.typFarbe ? (inGebrauch(plaetze[nr] || {}) ? vorlage.typFarbe : GRAU)
      : pfad[nr] ? PFADFARBE[pfad[nr].nummer] || GRAU : GRAU);
  const zelle = (nr, ri, si) => {
    const p = plaetze[nr] || {};
    const bild = platzBild(p, artikelBilder);
    return (
      <div key={nr} className={"eba-zelle eba-platz" + (bearbeiten ? " eba-platz--bearbeiten" : "") + (aktiv === nr ? " eba-platz--aktiv" : "")}
        style={{ gridRow: ri + 1, gridColumn: si + 1 }} data-platz={nr}
        onClick={bearbeiten ? () => platzWahl(nr) : undefined}>
        <div className="eba-tk" style={{ background: farbeVon(nr), "--eba-schrift": vorlage.schrift }}>
          {p.standzeit ? <span className="eba-tk-links"><span className="eba-wert">{alt.zahlText(p.standzeit)}</span></span> : null}
          <b>{platzName(nr)}</b>
          {p.hd && <span className="eba-tk-rechts"><span className="eba-hd" data-hd="">HD</span></span>}</div>
        <div className="eba-tat">{p.taetigkeit || ""}</div>
        <div className="eba-mass">{p.mass || ""}</div>
        {/* Geo-Offset nur, wo nötig: steht über dem Bild, das Bild wird
            kleiner oder fällt ganz weg (Wunsch Patrick, 24. Oktober 2026) */}
        <div className={"eba-bild" + (p.geo ? " eba-bild--geo" : "")}>
          {p.geo ? <span className="eba-geo" data-geo="">{p.geo}</span> : null}
          {bild && !p.ohneBild ? <BildZeichnung schluessel={bild.schluessel} /> : null}</div>
        <div className="eba-her">{p.hersteller || ""}</div>
        <div className={"eba-wz" + (bearbeiten && p.werkzeug && !p.article_id ? " eba-wz--frei" : "")}>{p.werkzeug || ""}</div>
      </div>
    );
  };

  const zeile = (f) => {
    const w = feldWert(f, d);
    const inhalt = bearbeiten ? <KopfEingabe f={f} wert={w} aendern={aendern} d={d} /> : feldText(f, w, d);
    if (f.farbe) return <div key={f.art + f.feld} className="eba-prg"><span style={{ background: f.farbe }}>{f.label}</span><b>{inhalt}</b></div>;
    return <div key={f.art + f.feld} className="eba-kz" data-eba-zeile={f.feld}><span>{f.label}</span><b>{inhalt}</b></div>;
  };
  return (
    <div className="eba-seite" data-eba-seite="" data-eba-vorlage={vorlage.art}>
      <div className="eba-titel"><span /><b>{vorlage.titel}</b><span className="eba-datum">{heute()}</span></div>
      <div className="eba-raster" style={{ gridTemplateRows: "repeat(" + reihen.length + ", minmax(0, 1fr))",
        gridTemplateColumns: vorlage.breiten || "repeat(" + vorlage.spalten + ", minmax(0, 1fr))" }}>
        {reihen.map((r, ri) => r.map((nr, si) => (nr ? zelle(nr, ri, si)
          : (ri >= kopfAb && si < kopfBreite) ? null
          : <div key={"l" + ri + "-" + si} className="eba-zelle eba-leer" style={{ gridRow: ri + 1, gridColumn: si + 1 }} />)))}
        <div className={"eba-zelle eba-kopf" + (kopfBreite < 2 ? " eba-kopf--schmal" : "") + (bearbeiten ? " eba-kopf--bearbeiten" : "")}
          style={{ gridRow: (kopfAb + 1) + " / " + (reihen.length + 1), gridColumn: "1 / " + (kopfBreite + 1) }}
          data-eba-kopf="" onClick={(e) => e.stopPropagation()}>
          {felder.filter((f) => f.farbe).length > 0 && <div className="eba-prgs">{felder.filter((f) => f.farbe).map(zeile)}</div>}
          {/* Die Revolver stehen im Index-Excel über dem Kopf */}
          {vorlage.legende && <div className="eba-legende">{vorlage.legende.map(([t, f]) =>
            <span key={t} style={{ background: f, "--eba-schrift": vorlage.schrift }}>{t}</span>)}</div>}
          <div className="eba-tab">{felder.filter((f) => !f.farbe).map(zeile)}</div>
          {bearbeiten
            ? <textarea className="eba-ein eba-bem-ein" data-eba-feld="blatt:bemerkung" placeholder="Bemerkungen, z. B. Abgreifen mit Schnabelzange"
                value={leer(blatt.bemerkung)} onChange={(e) => aendern({ art: "blatt", feld: "bemerkung" }, e.target.value)} />
            : <div className="eba-bem" data-eba-bem="">{bemerkung}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------- Ein Platz bearbeiten ----------------
// Ein Fenster je Werkzeugplatz: Tätigkeit, Mass, HD, Standzeit und das
// Werkzeug. Das Werkzeug wird nur gewählt, nicht geschrieben, im selben
// Fenster wie beim Bestellen, mit dem Knopf „Spezialwerkzeuge“ (Wunsch
// Patrick, 23. Oktober 2026). Der Hersteller ist der Lieferant des
// Artikels. Das Bild merkt sich der Artikel (Wunsch Patrick,
// 13. Oktober 2026).
function PlatzFenster({ nr, titel, wert, setzen, zu, artikelBilder, artikelBildNeu }) {
  const [p, setP] = useState(Object.assign({}, wert));
  const [artikel, setArtikel] = useState(null);
  const [bildWahl, setBildWahl] = useState(false);
  const [bildGewaehlt, setBildGewaehlt] = useState(false);
  useEffect(() => { if (wert.article_id) artikelHolen(wert.article_id).then(setArtikel); }, []);
  const f = (feld) => (e) => setP(Object.assign({}, p, { [feld]: e.target.value }));
  const merkKey = bildSchluesselVon(p);
  const bild = platzBild(p, Object.assign({}, artikelBilder, merkKey && bildGewaehlt ? { [merkKey]: p.bild } : {}));

  const waehlen = async () => {
    const a = await werkzeugWaehlen({ suche: p.article_id ? "" : (p.werkzeug || ""), spezial: !!(artikel && artikel.spezial) });
    if (!a) return;
    setArtikel(a);
    setP(Object.assign({}, p, { article_id: a.id, werkzeug: a.article_number || a.name || "", hersteller: a.supplier_name || "",
      spezial_id: null, bild: artikelBilder[a.id] || p.bild || null }));
  };
  const fertig = async () => {
    const z = {};
    const sz = String(leer(p.standzeit)).replace(/'/g, "").trim();
    if (sz !== "" && !isNaN(Number(sz))) z.standzeit = Number(sz);
    ["taetigkeit", "mass", "hersteller", "werkzeug"].forEach((k) => { const w = String(p[k] || "").trim(); if (w) z[k] = w; });
    if (p.hd) z.hd = true;
    const geo = String(p.geo || "").replace(/\s+$/, "");
    if (geo.trim()) z.geo = geo;
    if (p.ohneBild) z.ohneBild = true;
    if (p.article_id && z.werkzeug) z.article_id = p.article_id;
    if (p.bild) z.bild = p.bild;
    // Am Artikel merken, sobald jemand ein Bild wählt: jeder andere Platz
    // damit bekommt es von selbst
    if (z.article_id && bildGewaehlt && (artikelBilder[z.article_id] || null) !== (p.bild || null)) {
      try { await artikelBildSetzen(z.article_id, p.bild || null); artikelBildNeu(z.article_id, p.bild || null); }
      catch (x) { alt.meldung(alt.fehlertext(x), "warn"); }
    }
    setzen(z); zu();
  };
  return (
    <div className="eba-platzfenster" data-platzfenster={nr} onClick={(e) => e.stopPropagation()}>
      <div className="eba-pf-kopf"><b>{platzName(nr)}{titel ? " · " + titel : ""}</b>
        <button className="knopf knopf--klein knopf--still" data-pf-zu="" onClick={zu}>✕</button></div>
      <div className="eba-pf-oben">
        <button className="eba-pf-bildknopf" data-pf-bild="" onClick={() => setBildWahl(!bildWahl)} title="Bild wählen">
          {bild ? <BildZeichnung schluessel={bild.schluessel} /> : <span className="eba-plus">Bild<br />wählen</span>}
          <small>{!bild ? "" : bild.art === "gemerkt" ? "gemerkt" : "gewählt"}</small>
        </button>
        <div className="eba-pf-felder">
          <label className="feld"><span>Tätigkeit</span><input data-pf="taetigkeit" value={p.taetigkeit || ""} onChange={f("taetigkeit")} /></label>
          <label className="feld"><span>Mass</span><input data-pf="mass" value={p.mass || ""} onChange={f("mass")} /></label>
        </div>
      </div>
      {bildWahl && <Bibliothek aktiv={bild && bild.schluessel}
        waehlen={(k) => { setP(Object.assign({}, p, { bild: k })); setBildWahl(false); setBildGewaehlt(true); }} />}
      <div className="eba-pf-werkzeug" data-pf-werkzeug="">
        <span className="eba-pf-titel">Werkzeug</span>
        {p.article_id
          ? <div className="eba-pf-artikel"><b>{p.werkzeug}</b>
              <span>{[artikel && artikel.spezial ? "Spezialwerkzeug" : "", artikel && artikel.name, p.hersteller].filter(Boolean).join(" · ")}</span></div>
          : p.werkzeug
            ? <div className="eba-pf-artikel eba-pf-artikel--frei" data-pf-frei=""><b>„{p.werkzeug}“</b>
                <span>Aus dem Excel{p.hersteller ? ", " + p.hersteller : ""}. Bitte das Werkzeug wählen.</span></div>
            : <div className="eba-pf-artikel"><span>Noch kein Werkzeug</span></div>}
        <div className="eba-pf-wknoepfe">
          <button className="knopf knopf--klein" data-pf-waehlen="" onClick={waehlen}>{p.werkzeug ? "Anderes Werkzeug wählen" : "Werkzeug wählen"}</button>
          {p.werkzeug && <button className="knopf knopf--klein knopf--still" data-pf-wzweg=""
            onClick={() => setP(Object.assign({}, p, { werkzeug: "", hersteller: "", article_id: null, spezial_id: null }))}>Entfernen</button>}
        </div>
      </div>
      <label className="feld"><span>Geo-Offset, nur wenn nötig (steht über dem Bild)</span>
        <textarea data-pf="geo" rows={2} value={p.geo || ""} onChange={f("geo")} placeholder="z. B. X 0.12  Z -0.05" /></label>
      <label className="eba-pf-check"><input type="checkbox" data-pf="ohneBild" checked={!!p.ohneBild}
        onChange={(e) => setP(Object.assign({}, p, { ohneBild: e.target.checked }))} /> Kein Bild auf dem Blatt</label>
      <div className="eba-pf-zeile">
        <button className={"eba-pf-hd" + (p.hd ? " eba-pf-hd--an" : "")} data-pf="hd" aria-pressed={!!p.hd}
          onClick={() => setP(Object.assign({}, p, { hd: !p.hd }))}>HD {p.hd ? "ein" : "aus"}</button>
        <label className="feld"><span>Standzeit (Stk.), wenn bekannt</span>
          <input data-pf="standzeit" inputMode="numeric" placeholder="leer lassen"
            value={leer(p.standzeit)} onChange={f("standzeit")} /></label>
      </div>
      <div className="eba-pf-fuss">
        <button className="knopf knopf--klein" data-pf-leeren="" onClick={() => setP({})}>Platz leeren</button>
        <button className="knopf knopf--klein knopf--haupt" data-pf-ok="" onClick={fertig}>Übernehmen</button>
      </div>
    </div>
  );
}

// Auswahl der Bilder: nur hochgeladene Bilder ohne Beschriftung, dazu
// „+“ zum Hochladen und „—“ für kein Bild (Wunsch Patrick, 13. und
// 15. Oktober 2026)
function Bibliothek({ aktiv, waehlen }) {
  const [, neu] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const darf = alt.darfSchreiben() && !alt.istExtern();
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
  return (
    <div className="eba-pf-bibliothek" data-pf-bibliothek="">
      {eigeneBilder().map((b) => <button key={b.schluessel} className={"eba-pf-bib" + (aktiv === b.schluessel ? " eba-pf-bib--an" : "")}
        data-bib={b.schluessel} title={b.name} onClick={() => waehlen(b.schluessel)}><BildZeichnung schluessel={b.schluessel} />
        {darf && <span className="eba-pf-bib-weg" data-bib-weg={b.id} onClick={(ev) => weg(b, ev)}>✕</span>}</button>)}
      {darf && <label className="eba-pf-bib eba-pf-bib--hoch" title="Eigenes Bild hochladen">{laedt ? "…" : "+"}
        <input type="file" accept="image/*" hidden data-bib-hoch="" onChange={hoch} /></label>}
      <button className="eba-pf-bib eba-pf-bib--keins" data-bib="" title="Kein Bild" onClick={() => waehlen(null)}>—</button>
    </div>
  );
}

// ---------------- Weitere Seiten ----------------
// Hinter dem Werkzeugblatt beliebig viele Seiten, unten wie die Blätter
// in Excel, je mit Namen und hoch oder quer, Inhalt wie in Word: Text,
// Tabellen (auch aus Excel hineinkopiert, etwa Geo-Offset-Daten) und
// Bilder (Wunsch Patrick, 24. Oktober 2026). Im Pad nur zum Lesen.
const A4 = [794, 1123];
function seitenMass(seite) { return seite && seite.quer ? [A4[1], A4[0]] : A4; }

function ZusatzSeite({ seite, bearbeiten, inhaltBearbeiten }) {
  const [w, h] = seitenMass(seite);
  return (
    <div className={"eba-zseite" + (bearbeiten ? " eba-zseite--bearbeiten" : "")} data-eba-zseite=""
      style={{ width: w, height: h }} onClick={bearbeiten ? inhaltBearbeiten : undefined}
      title={bearbeiten ? "Antippen, um den Inhalt zu bearbeiten" : undefined}>
      <TextBlatt html={seite.html || ""} format={seite.quer ? "a4q" : "a4"} breite={w} hoehe={h} />
      {bearbeiten && !seite.html && <div className="eba-zseite-leer">Antippen und schreiben, Tabellen aus Excel
        hineinkopieren oder Bilder einfügen</div>}
    </div>
  );
}

// Unten die Reiter: das Werkzeugblatt und die weiteren Seiten
function SeitenReiter({ seiten, aktiv, waehlen, bearbeiten, neu }) {
  if (!seiten.length && !bearbeiten) return null;
  return (
    <div className="eba-reiter" data-eba-reiter="">
      <button className={"eba-reiter__r" + (aktiv === 0 ? " eba-reiter__r--an" : "")} data-eba-seite-nr="0"
        onClick={() => waehlen(0)}>Werkzeuge</button>
      {seiten.map((x, i) => (
        <button key={i} className={"eba-reiter__r" + (aktiv === i + 1 ? " eba-reiter__r--an" : "")}
          data-eba-seite-nr={i + 1} onClick={() => waehlen(i + 1)}>{x.name || "Seite " + (i + 2)}</button>))}
      {bearbeiten && <button className="eba-reiter__r eba-reiter__neu" data-eba-seite-neu="" onClick={neu}>+ Seite</button>}
    </div>
  );
}

// ---------------- Das Fenster ----------------
// nurLesen: im Pad Mode und für alle ohne Schreibrecht
// Beim Bearbeiten fällt die FA-Zeile aus der Bemerkung gleich weg
function entwurfVon(b) {
  return b.bemerkung && ohneFa(b.bemerkung) !== b.bemerkung ? Object.assign({}, b, { bemerkung: ohneFa(b.bemerkung) || null }) : b;
}

function BlattFenster({ hocoNr, typId, zu, daten: start, nurLesen, gleichBearbeiten }) {
  const [daten, setDaten] = useState(start);
  const darf = !nurLesen && alt.darfSchreiben() && !alt.istExtern();
  const [bearbeiten, setBearbeiten] = useState(darf && (!start.blatt || !!gleichBearbeiten));
  const [entwurf, setEntwurf] = useState(() => entwurfVon(start.blatt || leeresBlatt(hocoNr, typId)));
  const [teilE, setTeilE] = useState(Object.assign({}, start.teil));
  const [typE, setTypE] = useState(Object.assign({}, start.typDaten));
  const [platz, setPlatz] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [seiteNr, setSeiteNr] = useState(0);
  const [artikelBilder, setArtikelBilder] = useState(start.artikelBilder || {});
  // Was beim Bearbeiten aus dem Excel vorgelesen wurde: { liest } oder { hinweise }
  const [vorgelesen, setVorgelesen] = useState(null);
  const seite = useRef(null);
  const { typ, paths, teil, typDaten } = daten;
  const excel = typDaten.blatt_url || null;
  const blatt = bearbeiten ? entwurf : (daten.blatt || entwurf);
  const seiten = Array.isArray(blatt.seiten) ? blatt.seiten : [];
  const zseite = seiteNr > 0 ? seiten[seiteNr - 1] : null;
  const vorlage = useMemo(() => blattVorlage(typ, paths), [typ, paths]);
  const hatPlaetze = vorlage.reihen.some((r) => r.some(Boolean)) || Object.keys(blatt.plaetze || {}).length > 0;
  useEffect(() => { if (seiteNr > seiten.length) setSeiteNr(seiten.length); }, [seiten.length]);
  // Das Blatt füllt den Platz, so gross es geht (Wunsch Patrick 25. Oktober
  // 2026: „etwas grösser, die Schrift ist nicht lesbar“). Am Handy bleibt
  // es in echter Grösse und rollt, verkleinert wäre es nicht lesbar.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = seite.current;
    if (!el || zseite) return undefined;
    const rechnen = () => {
      const k = Math.min((el.clientWidth - 28) / 1123, (el.clientHeight - 28) / 794);
      setZoom(k > 0 && (k >= 1 || el.clientWidth >= 800) ? Math.round(k * 100) / 100 : 1);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!zseite]);

  // Beim Bearbeiten versucht die App zuerst selbst, das Blatt aus dem
  // Excel zu füllen, man passt danach nur noch an (Wunsch Patrick,
  // 25. Oktober 2026: „kurz selber versuchen, dann passen wir es so an,
  // dass es stimmt“). Nur solange in der App noch kein Werkzeug steht,
  // und nur in leere Felder; gespeichert wird erst mit Speichern.
  const vorlesen = async (d) => {
    const url = d.typDaten && d.typDaten.blatt_url;
    if (!url || /\.(pdf|xls)(\?|#|$)/i.test(String(url))) return;   // nur .xlsx und .xlsm lassen sich lesen
    if (d.blatt && Object.keys(d.blatt.plaetze || {}).length) return;
    setVorgelesen({ liest: true });
    try {
      const v = await excelVorlesen(hocoNr, d.typ, url);
      const leer0 = (x) => x === undefined || x === null || x === "" || (typeof x === "object" && !Object.keys(x).length);
      setEntwurf((b) => {
        const n = Object.assign({}, b);
        Object.entries(v.blatt).forEach(([k, w]) => { if (leer0(n[k]) && !leer0(w)) n[k] = w; });
        return n;
      });
      setTeilE((t) => {
        const n = Object.assign({}, t);
        STAMM_FELDER.forEach(([f]) => { if (f !== "material_groesse" && v.stamm[f] && leer0(n[f])) n[f] = v.stamm[f]; });
        return n;
      });
      setTypE((t) => {
        const n = Object.assign({}, t);
        ["stueckzeit_s", "abend_stk"].forEach((f) => { if (v.typDaten[f] && leer0(n[f])) n[f] = v.typDaten[f]; });
        return n;
      });
      setVorgelesen({ hinweise: v.hinweise });
    } catch (f) {
      setVorgelesen({ fehler: alt.fehlertext(f) });
    }
  };
  useEffect(() => { if (bearbeiten) vorlesen(start); }, []);

  const neuLaden = async () => { const d = await blattLaden(hocoNr, typId); setDaten(d); setArtikelBilder(d.artikelBilder || {}); return d; };
  const anfangen = (d) => {
    setEntwurf(entwurfVon(d.blatt || leeresBlatt(hocoNr, typId)));
    setTeilE(Object.assign({}, d.teil)); setTypE(Object.assign({}, d.typDaten));
  };
  const speichern = async () => {
    setLaeuft(true);
    try {
      await blattSpeichern(entwurf, "Einrichtblatt " + hocoNr + " " + (typ.name || ""));
      await stammSpeichern(hocoNr, teil, Object.fromEntries(STAMM_FELDER.map(([f]) => [f, leer(teilE[f])])));
      await typSpeichern(hocoNr, typId, typDaten, typE);
      const d = await neuLaden();
      anfangen(d);
      setBearbeiten(false); setPlatz(null); setVorgelesen(null);
      alt.meldung("Einrichtblatt gespeichert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  const abbrechen = () => {
    if (!daten.blatt) { zu(); return; }
    anfangen(daten); setBearbeiten(false); setPlatz(null); setVorgelesen(null);
  };
  // Ein Kopffeld ändern, dort, wo es hingehört
  const aendern = (f, w) => {
    if (f.art === "stamm") setTeilE((t) => Object.assign({}, t, { [f.feld]: w }));
    else if (f.art === "typ") setTypE((t) => Object.assign({}, t, { [f.feld]: w }));
    else if (f.art === "prg") setEntwurf((b) => {
      const pr = Object.assign({}, b.programme || {});
      if (String(w).trim()) pr[f.feld] = w; else delete pr[f.feld];
      return Object.assign({}, b, { programme: pr });
    });
    else if (f.art === "kopf") setEntwurf((b) => {
      const k = Object.assign({}, b.kopf || {});
      if (String(w).trim()) k[f.feld] = w; else delete k[f.feld];
      return Object.assign({}, b, { kopf: k });
    });
    else if (f.art === "blatt") setEntwurf((b) => Object.assign({}, b, { [f.feld]: String(w).trim() ? w : null }));
  };
  // Erst nach „EB OK“ (bis 1.177.0 „Blatt ist gut“) zeigt der Pad Mode das Blatt aus der App
  // (Wunsch Patrick, 24. Oktober 2026); ein Excel dazu wird gelöscht
  const gut = async () => {
    const ok = await alt.nachfragen({ titel: "EB OK",
      text: excel
        ? "Stimmt das Blatt? Dann gilt es ab jetzt auch im Pad Mode. Das bisherige Excel-Einrichtblatt von " + hocoNr + " auf "
          + typ.name + " wird aus der Datenbank gelöscht, und die Aufgabe „HoferTool“ lädt dafür kein Excel mehr hoch."
        : "Stimmt das Blatt? Dann gilt es ab jetzt auch im Pad Mode.",
      bestaetigen: excel ? "EB OK, Excel löschen" : "EB OK", gefahr: !!excel });
    if (!ok) return;
    setLaeuft(true);
    try {
      await blattIstGut(daten.blatt); await neuLaden();
      alt.meldung(excel ? "Das Excel ist gelöscht, es gilt das Blatt in der App." : "Das Blatt gilt jetzt auch im Pad Mode.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  const drucken = () => {
    const k = seite.current && seite.current.querySelector(zseite ? "[data-eba-zseite]" : "[data-eba-seite]");
    if (!k) return;
    const kopie = k.cloneNode(true);
    kopie.classList.add(zseite ? "eba-zseite--druck" : "eba-seite--druck");
    if (zseite) kopie.classList.toggle("eba-zseite--quer", !!zseite.quer);
    try { inDerAppDrucken([kopie], { quer: zseite ? !!zseite.quer : true, titel: "Einrichtblatt " + hocoNr + " " + (typ.name || ""), rand: zseite ? "0" : "8mm" }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const platzSetzen = (nr, z) => {
    const plaetze = Object.assign({}, entwurf.plaetze || {});
    if (Object.keys(z).length) plaetze[nr] = z; else delete plaetze[nr];
    setEntwurf(Object.assign({}, entwurf, { plaetze }));
  };
  const seitenSetzen = (liste) => setEntwurf((b) => Object.assign({}, b, { seiten: liste }));
  const seiteAendern = (i, z) => seitenSetzen(seiten.map((x, j) => (j === i ? Object.assign({}, x, z) : x)));
  const neueSeite = () => {
    seitenSetzen(seiten.concat([{ name: "Seite " + (seiten.length + 2), quer: false, html: "" }]));
    setSeiteNr(seiten.length + 1);
  };
  const seiteWeg = async (i) => {
    if (!(await alt.nachfragen({ titel: "Seite löschen", text: "Die Seite „" + (seiten[i].name || "") + "“ löschen?",
      bestaetigen: "Löschen", gefahr: true }))) return;
    seitenSetzen(seiten.filter((_, j) => j !== i)); setSeiteNr(i);
  };
  const inhaltBearbeiten = async (i) => {
    const x = seiten[i];
    const [w, h] = seitenMass(x);
    const html = await textBearbeiten({ html: x.html || "", format: x.quer ? "a4q" : "a4", seitenVerhaeltnis: h / w,
      titel: (x.name || "Seite") + " · " + hocoNr });
    if (html !== null) seiteAendern(i, { html });
  };
  const pfad = pfadVonPlatz(paths);
  const platzTitel = (nr) => platzGruppe(nr) || (pfad[nr] ? pfad[nr].name : "");

  return (
    <div className="betrachter eba-fenster">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">Einrichtblatt {hocoNr} · {typ.name}
          {daten.blatt && !daten.blatt.gut_am && <span className="eba-offen" data-eba-offen=""> noch nicht bestätigt</span>}</span>
        <div className="betrachter__knoepfe">
          {bearbeiten
            ? <>
                <span className="eba-hinweis">{zseite ? "Seite antippen zum Schreiben" : "Kopf direkt ausfüllen, Platz antippen für Werkzeug"}</span>
                <button className="knopf knopf--klein" data-eba-abbrechen="" onClick={abbrechen}>Abbrechen</button>
                <button className="knopf knopf--klein knopf--haupt" data-eba-speichern="" disabled={laeuft} onClick={speichern}>Speichern</button>
              </>
            : <>
                {darf && <button className="knopf knopf--klein" data-eba-bearbeiten="" onClick={() => { anfangen(daten); setBearbeiten(true); vorlesen(daten); }}>Bearbeiten</button>}
                {excel && !nurLesen && <button className="knopf knopf--klein" data-eba-excel="" onClick={() => dokZeigen({ art: "einrichtblatt", titel: "Excel " + hocoNr, adresse: excel })}>Excel ansehen</button>}
                {darf && daten.blatt && !daten.blatt.gut_am && <button className="knopf knopf--klein" data-eba-gut="" disabled={laeuft} onClick={gut}>EB OK</button>}
                <button className="knopf knopf--klein" data-eba-drucken="" onClick={drucken}>Drucken</button>
                <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
              </>}
        </div>
      </div>
      {bearbeiten && vorgelesen && <div className={"eba-vorgelesen" + (vorgelesen.fehler ? " eba-vorgelesen--fehler" : "")} data-eba-vorgelesen="">
        {vorgelesen.liest ? <span>Lese das Excel …</span>
          : vorgelesen.fehler ? <span>Excel nicht gelesen: {vorgelesen.fehler}</span>
          : <span><b>Aus dem Excel vorgelesen.</b> Bitte prüfen und anpassen, dann Speichern.
              {vorgelesen.hinweise.length > 0 && <> Achtung: {vorgelesen.hinweise.join(" · ")}</>}</span>}
        {!vorgelesen.liest && <button className="linkknopf" data-eba-vorgelesen-zu="" onClick={() => setVorgelesen(null)}>✕</button>}
      </div>}
      <div className="betrachter__buehne eba-buehne" ref={seite} onClick={() => setPlatz(null)}>
        {zseite && bearbeiten && <div className="eba-zseite-leiste" onClick={(e) => e.stopPropagation()}>
          <label>Name <input className="eba-zseite-name" data-eba-seite-name="" value={zseite.name || ""}
            onChange={(e) => seiteAendern(seiteNr - 1, { name: e.target.value })} /></label>
          <span className="eba-zseite-format">
            <button className={"knopf knopf--klein" + (!zseite.quer ? " knopf--haupt" : "")} data-eba-seite-hoch=""
              onClick={() => seiteAendern(seiteNr - 1, { quer: false })}>Hochformat</button>
            <button className={"knopf knopf--klein" + (zseite.quer ? " knopf--haupt" : "")} data-eba-seite-quer=""
              onClick={() => seiteAendern(seiteNr - 1, { quer: true })}>Querformat</button></span>
          <button className="knopf knopf--klein" data-eba-seite-inhalt="" onClick={() => inhaltBearbeiten(seiteNr - 1)}>Inhalt bearbeiten</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" data-eba-seite-weg="" onClick={() => seiteWeg(seiteNr - 1)}>Seite löschen</button>
        </div>}
        {zseite
          ? <ZusatzSeite seite={zseite} bearbeiten={bearbeiten} inhaltBearbeiten={() => inhaltBearbeiten(seiteNr - 1)} />
          : <div className="eba-zoom" style={{ zoom }}><BlattSeite typ={typ} paths={paths} teil={bearbeiten ? teilE : teil} typDaten={bearbeiten ? typE : typDaten} blatt={blatt}
              bearbeiten={bearbeiten} aktiv={platz} artikelBilder={artikelBilder} aendern={aendern}
              platzWahl={(nr) => setTimeout(() => setPlatz(nr), 0)} /></div>}
        {bearbeiten && platz && !zseite && <PlatzFenster key={platz} nr={platz} titel={platzTitel(platz)}
          wert={(entwurf.plaetze || {})[platz] || {}} setzen={(z) => platzSetzen(platz, z)} zu={() => setPlatz(null)}
          artikelBilder={artikelBilder} artikelBildNeu={(id, b) => setArtikelBilder((x) => Object.assign({}, x, { [id]: b }))} />}
        {!hatPlaetze && !zseite && <div className="abruf-leer"><b>Für {typ.name} sind noch keine Werkzeugplätze angelegt.</b>
          <p>Unter Maschinen → Typen → {typ.name} → Aufbau anlegen.</p></div>}
      </div>
      <SeitenReiter seiten={seiten} aktiv={seiteNr} waehlen={setSeiteNr} bearbeiten={bearbeiten} neu={neueSeite} />
    </div>
  );
}

// Öffnen: gleich das Blatt. Den Kopf samt Stammdaten füllt man direkt
// darin aus. { nurLesen } im Pad Mode, { bearbeiten } gleich zum Ändern
// (Produktion → Infos zum Richten)
export async function einrichtblattAppOeffnen(hocoNr, typId, { nurLesen, bearbeiten } = {}) {
  let daten;
  try { daten = await blattLaden(hocoNr, typId); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <BlattFenster hocoNr={hocoNr} typId={typId} daten={daten} zu={zu}
    nurLesen={!!nurLesen} gleichBearbeiten={!!bearbeiten} />,
    null, "betrachter-huelle eba-huelle");
}

// Nur das Werkzeugblatt, eingepasst in den Platz darum (Bildschirmschoner
// im Pad Mode)
export function BlattAnzeige({ hocoNr, typId }) {
  const [daten, setDaten] = useState(null);
  const [k, setK] = useState(1);
  const platz = useRef(null);
  useEffect(() => {
    let weg = false;
    blattLaden(hocoNr, typId).then((d) => { if (!weg) setDaten(d); }).catch(() => {});
    return () => { weg = true; };
  }, [hocoNr, typId]);
  useEffect(() => {
    const el = platz.current;
    if (!el) return undefined;
    const rechnen = () => setK(Math.min(el.clientWidth / 1123, el.clientHeight / 794) || 1);
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [daten]);
  if (!daten || !daten.blatt) return <div className="pdfansicht__laden">Einrichtblatt wird geladen …</div>;
  return (
    <div className="eba-anzeige" ref={platz} data-eba-anzeige="">
      <div style={{ width: 1123 * k, height: 794 * k }}>
        <div style={{ transform: "scale(" + k + ")", transformOrigin: "top left", width: 1123 }}>
          <BlattSeite typ={daten.typ} paths={daten.paths} teil={daten.teil} typDaten={daten.typDaten} blatt={daten.blatt}
            artikelBilder={daten.artikelBilder || {}} />
        </div>
      </div>
    </div>
  );
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
