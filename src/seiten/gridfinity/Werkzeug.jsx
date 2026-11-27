// =================================================================
//  GRIDFINITY-WERKZEUG (seit 1.895.0, Wunsch Patrick 27. November 2026)
//  Links die Einstellungen, rechts die 3D-Vorschau, unten der Export als
//  STL (seit 1.905.0 nur noch STL, Wunsch Patrick). Die Einstellungen merkt sich das Gerät (localStorage
//  „hofer.gridfinity“), Strg + Z nimmt die letzte Änderung zurück.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { alt } from "../../bruecke.jsx";
import { useEntwurfZurueck } from "../../teile/lokalZurueck.js";
import Schublade, { SCHUBLADE_VORGABE, schubladePruefen } from "./Schublade.jsx";
import {
  BOX_VORGABE, PLATTE_VORGABE, boxPruefen, plattePruefen, boxMasse, platteMasse,
  boxNetz, platteNetz, verbinderNetz, distanzNetz, distanzPlan, distanzDruck, stlBinaer, netzeVereinen, GF,
  DRUCKER, aufteilen, stueckArten, stueckeVorschau, elementeLage, EINLAGE_Z,
} from "./geometrie.js";

const SPEICHER = "hofer.gridfinity";

// Der Einlagen Generator rechnet die Einlage (Taschen) für die Box. Er läuft
// dazu unsichtbar in einem eigenen Rahmen mit ?rechnen=1 (speichert dort
// nichts), einmal geladen für alle weiteren Einlagen.
let rechner = null;
function einlageRechner() {
  if (!rechner) rechner = new Promise((ok, fehler) => {
    const fr = document.createElement("iframe");
    fr.setAttribute("aria-hidden", "true"); fr.tabIndex = -1;
    fr.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;visibility:hidden;border:0";
    fr.src = import.meta.env.BASE_URL + "einlagen/index.html?rechnen=1";
    const uhr = setTimeout(() => { rechner = null; fehler(new Error("Einlagen Generator lädt nicht")); }, 30000);
    fr.onload = () => {
      clearTimeout(uhr);
      const w = fr.contentWindow;
      if (w && typeof w.einlageDreiecke === "function") ok(w);
      else { rechner = null; fehler(new Error("Einlagen Generator zu alt")); }
    };
    document.body.appendChild(fr);
  });
  return rechner;
}
const felderFuer = (L) => Math.max(1, Math.ceil((L + 0.5) / GF.raster - 1e-6));

function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (s && typeof s === "object") return {
      v: 2,
      art: ["platte", "schublade"].includes(s.art) ? s.art : "box",
      drucker: DRUCKER[s.drucker] ? s.drucker : "x1c",
      projekt: s.projekt && s.projekt.id ? { id: s.projekt.id, name: String(s.projekt.name || "") } : null,
      // Fassung 2 (1.906.0): Höhe einmal auf die Vorgabe 3 zurück (Patrick)
      box: { ...BOX_VORGABE, ...(s.box || {}), ...(s.v === 2 ? {} : { u: BOX_VORGABE.u }) },
      platte: { ...PLATTE_VORGABE, ...(s.platte || {}) },
      schublade: schubladePruefen(s.schublade),
    };
  } catch { /* privates Fenster: Vorgabe */ }
  return { v: 2, art: "box", drucker: "x1c", box: { ...BOX_VORGABE }, platte: { ...PLATTE_VORGABE }, schublade: { ...SCHUBLADE_VORGABE } };
}

// Name eines Elements in der Liste: „Wand 2“
const TYPNAME = { wand: "Wand", leiste: "Leiste", scoop: "Scoop" };
function elementName(e, i, alle) {
  return TYPNAME[e.typ] + " " + (alle.slice(0, i + 1).filter((o) => o.typ === e.typ).length);
}
const mm = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");

// Zahl mit − und + daneben: auf dem iPad leichter als Tippen
function Zahl({ titel, wert, setzen, min, max, schritt = 1, einheit, hinweis, name }) {
  const [text, setText] = useState(String(wert).replace(".", ","));
  useEffect(() => { setText(String(wert).replace(".", ",")); }, [wert]);
  const neu = (v) => {
    v = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
    setzen(v);
  };
  const uebernehmen = () => {
    const v = parseFloat(String(text).replace(",", "."));
    if (Number.isFinite(v)) neu(v); else setText(String(wert).replace(".", ","));
  };
  return (
    <label className="gfn-zahl">
      <span className="gfn-zahl__titel">{titel}</span>
      <span className="gfn-zahl__reihe">
        <button type="button" className="gfn-zahl__knopf" aria-label={titel + " kleiner"} disabled={wert <= min}
          onClick={(e) => { e.preventDefault(); neu(wert - schritt); }}>−</button>
        <input inputMode="decimal" value={text} data-gf={name}
          onChange={(e) => setText(e.target.value)} onBlur={uebernehmen}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); uebernehmen(); } }} />
        <button type="button" className="gfn-zahl__knopf" aria-label={titel + " grösser"} disabled={wert >= max}
          onClick={(e) => { e.preventDefault(); neu(wert + schritt); }}>+</button>
        {einheit && <span className="gfn-zahl__einheit">{einheit}</span>}
      </span>
      {hinweis && <span className="gfn-zahl__hinweis">{hinweis}</span>}
    </label>
  );
}

// Grösse der Magnete (Loch), Vorgabe nach Gridfinity 6,5 × 2,4 für Magnete 6 × 2
function MagnetMasse({ d, h, setD, setH }) {
  return (
    <div className="gfn-unter">
      <Zahl titel="Magnet Ø" name="magD" wert={d} setzen={setD} min={3} max={7} schritt={0.1} einheit="mm" />
      <Zahl titel="Magnet Höhe" name="magH" wert={h} setzen={setH} min={1} max={4} schritt={0.1} einheit="mm" />
    </div>
  );
}

function Schalter({ titel, an, setzen, name, text }) {
  return (
    <label className="gfn-schalter">
      <input type="checkbox" checked={an} data-gf={name} onChange={(e) => setzen(e.target.checked)} />
      <span><b>{titel}</b>{text && <small>{text}</small>}</span>
    </label>
  );
}

export default function Werkzeug() {
  const [stand, setStand] = useState(laden);
  useEntwurfZurueck(stand, setStand, true, alt.meldung);
  useEffect(() => { try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch { /* egal */ } }, [stand]);

  // Fächer-Elemente: gewählt und, während gezogen wird, der Zwischenstand
  // (erst beim Loslassen gespeichert, sonst füllt jede Bewegung Strg + Z)
  const [gewaehlt, setGewaehlt] = useState(-1);
  const [zug, setZug] = useState(null);
  const [menue, setMenue] = useState(false);
  const boxFest = boxPruefen(stand.box), platte = plattePruefen(stand.platte);
  const box = zug ? boxPruefen({ ...stand.box, elemente: zug }) : boxFest;
  const b = (k) => (v) => setStand((s) => ({ ...s, box: { ...s.box, [k]: v } }));
  // Unterteilungen sind eine Vorlage: sie setzen die Elemente neu
  const bRaster = (k) => (v) => { setGewaehlt(-1); setStand((s) => ({ ...s, box: { ...s.box, [k]: v, elemente: null } })); };
  const elementeSetzen = (liste) => setStand((s) => ({ ...s, box: { ...s.box, elemente: liste } }));
  // ---------- Projekte (seit 1.916.0, Patrick: „mache noch einen Speicher
  // für Projekte“): Tabelle gridfinity_projekte (sql/gridfinity-projekte.sql),
  // damit ein Projekt an jedem Gerät wieder aufgeht ----------
  const [projekte, setProjekte] = useState(null);
  const [liste, setListe] = useState(false);
  const projekt = stand.projekt && stand.projekt.id ? stand.projekt : null;
  const [projektName, setProjektName] = useState(projekt ? projekt.name : "");
  const tabFehlt = (e) => /gridfinity_projekte/.test(e.message || "") && /exist|schema cache/i.test(e.message || "");
  async function projekteLaden() {
    const { data, error } = await alt.db.from("gridfinity_projekte").select("id, name, geaendert_am").order("geaendert_am", { ascending: false }).limit(300);
    if (error) { setProjekte([]); if (!tabFehlt(error)) alt.meldung("Projekte nicht geladen: " + alt.fehlertext(error), "fehler"); return; }
    setProjekte(data || []);
  }
  useEffect(() => { projekteLaden(); }, []);
  async function projektSpeichern(alsNeu = false) {
    const name = projektName.trim() || ({ box: "Box ", platte: "Grundplatte ", schublade: "Schublade " }[stand.art] || "") + new Date().toLocaleDateString("de-CH");
    const daten = { art: stand.art, drucker: stand.drucker, box: stand.box, platte: stand.platte, schublade: stand.schublade };
    let antwort = null;
    if (projekt && !alsNeu) antwort = await alt.db.from("gridfinity_projekte").update({ name, daten }).eq("id", projekt.id).select("id, name").maybeSingle();
    if (!antwort || (!antwort.error && !antwort.data)) antwort = await alt.db.from("gridfinity_projekte").insert({ name, daten }).select("id, name").single();
    if (antwort.error) {
      alt.meldung(tabFehlt(antwort.error) ? "Projekte gehen noch nicht: die Tabelle fehlt (sql/gridfinity-projekte.sql)." : "Nicht gespeichert: " + alt.fehlertext(antwort.error), "fehler");
      return;
    }
    setProjektName(antwort.data.name);
    setStand((s) => ({ ...s, projekt: { id: antwort.data.id, name: antwort.data.name } }));
    alt.meldung("Projekt „" + antwort.data.name + "“ gespeichert.", "gut");
    projekteLaden();
  }
  async function projektOeffnen(x) {
    const { data, error } = await alt.db.from("gridfinity_projekte").select("id, name, daten").eq("id", x.id).maybeSingle();
    if (error || !data) { alt.meldung("Projekt nicht gefunden.", "fehler"); return; }
    const d = data.daten || {};
    setGewaehlt(-1); setZug(null); setListe(false); setProjektName(data.name);
    setStand((s) => ({
      ...s, v: 2, art: ["platte", "schublade"].includes(d.art) ? d.art : "box", drucker: DRUCKER[d.drucker] ? d.drucker : s.drucker,
      box: { ...BOX_VORGABE, ...(d.box || {}) }, platte: { ...PLATTE_VORGABE, ...(d.platte || {}) },
      schublade: schubladePruefen(d.schublade),
      projekt: { id: data.id, name: data.name },
    }));
  }
  async function projektLoeschen(x) {
    const ok = await alt.nachfragen({ titel: "Löschen", text: "Projekt „" + x.name + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const { error } = await alt.db.from("gridfinity_projekte").delete().eq("id", x.id);
    if (error) { alt.meldung("Nicht gelöscht: " + alt.fehlertext(error), "fehler"); return; }
    if (projekt && projekt.id === x.id) setStand((s) => ({ ...s, projekt: null }));
    projekteLaden();
  }
  function projektNeu() {
    setGewaehlt(-1); setProjektName("");
    setStand((s) => ({ ...s, projekt: null, box: { ...BOX_VORGABE }, platte: { ...PLATTE_VORGABE }, schublade: { ...SCHUBLADE_VORGABE } }));
  }
  // Aus dem Reiter Schublade: ein Teil im Reiter Box, die Grundplatte im
  // Reiter Grundplatte öffnen (dort wird die STL gespeichert)
  function ausSchublade(w) {
    setGewaehlt(-1); setZug(null);
    if (w.art === "platte") {
      setStand((s) => ({ ...s, art: "platte", platte: { ...s.platte, art: "schublade", breite: w.breite, tiefe: w.tiefe, distanz: true } }));
      return;
    }
    const t = w.teil;
    const neu = t.box ? { ...BOX_VORGABE, ...t.box, nx: t.nx, ny: t.ny }
      : { ...BOX_VORGABE, nx: t.nx, ny: t.ny, u: t.u, einlage: t.einlage || null, elemente: t.einlage ? [] : null };
    setStand((s) => ({ ...s, art: "box", box: neu }));
  }

  const lage = useMemo(() => (stand.art === "box" ? elementeLage(box) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand.art, JSON.stringify(box)]);
  const sel = gewaehlt >= 0 && gewaehlt < box.elemente.length ? box.elemente[gewaehlt] : null;

  // Ziehen in der Vorschau: start und punkt in mm (Boxmitte = 0)
  function elementZiehen(i, art, start, punkt) {
    const L = elementeLage(boxFest), e = boxFest.elemente[i];
    if (!e) return;
    const quer = e.a === "x" ? L.iw : L.id, laengs = e.a === "x" ? L.id : L.iw;
    const lv = (pt) => (e.a === "x" ? { u: pt.y + L.id / 2, v: pt.x + L.iw / 2 } : { u: pt.x + L.iw / 2, v: pt.y + L.id / 2 });
    const a0 = lv(start), a1 = lv(punkt);
    // Einrasten: an andere Elemente gleicher Richtung, Aussenwand, sonst 0.5 mm
    const rasten = (wert, ziele, weit) => {
      let best = Math.round(wert * 2) / 2, d = weit;
      for (const z of ziele) if (Math.abs(z - wert) < d) { d = Math.abs(z - wert); best = z; }
      return best;
    };
    const anderQ = boxFest.elemente.filter((o, k) => k !== i && o.a === e.a).map((o) => o.p * quer);
    const anderL = boxFest.elemente.filter((o) => o.a !== e.a && o.typ === "wand").map((o) => o.p * laengs);
    const n = { ...e };
    if (art === "mitte") {
      n.p = rasten(e.p * quer + (a1.v - a0.v), [...anderQ, ...(e.typ === "wand" ? [] : [0, quer])], 2) / quer;
      // längs verschieben, Länge bleibt; Enden rasten an Querwänden und Rand
      const len = (e.bis - e.von) * laengs;
      let von = Math.min(laengs - len, Math.max(0, e.von * laengs + (a1.u - a0.u)));
      const vonR = rasten(von, [0, ...anderL], 3), bisR = rasten(von + len, [laengs, ...anderL], 3);
      von = Math.abs(vonR - von) <= Math.abs(bisR - (von + len)) ? vonR : bisR - len;
      von = Math.min(laengs - len, Math.max(0, von));
      n.von = von / laengs; n.bis = (von + len) / laengs;
    } else {
      const u = Math.min(laengs, Math.max(0, rasten(a1.u, [0, laengs, ...anderL], 3))) / laengs;
      if (art === "von") n.von = Math.min(u, e.bis - 0.03); else n.bis = Math.max(u, e.von + 0.03);
    }
    setZug(boxFest.elemente.map((o, k) => (k === i ? n : o)));
  }
  function loslassen() {
    // nur speichern, wenn sich etwas bewegt hat (sonst leerer Strg-Z-Schritt)
    setZug((z) => { if (z && JSON.stringify(z) !== JSON.stringify(boxFest.elemente)) elementeSetzen(z); return null; });
  }
  function hinzufuegen(typ) {
    setMenue(false);
    const el = boxFest.elemente;
    let neu;
    if (typ === "wand") {
      // in die grösste Lücke zwischen den Längswänden
      const ps = [0, ...el.filter((o) => o.typ === "wand" && o.a === "x").map((o) => o.p), 1].sort((x, y) => x - y);
      let p = 0.5, luecke = 0;
      for (let k = 1; k < ps.length; k++) if (ps[k] - ps[k - 1] > luecke) { luecke = ps[k] - ps[k - 1]; p = (ps[k] + ps[k - 1]) / 2; }
      neu = { typ, a: "x", p, von: 0, bis: 1, s: 1 };
    } else {
      // Scoop vorne an ein Fach, Leiste hinten an ein Fach, wo noch keine ist
      const s0 = typ === "scoop" ? 1 : -1;
      const quer = el.filter((o) => o.typ === "wand" && o.a === "y").map((o) => o.p);
      const orte = typ === "scoop" ? [0, ...quer] : [1, ...quer];
      const p = orte.find((q) => !el.some((o) => o.typ === typ && o.a === "y" && o.s === s0 && Math.abs(o.p - q) < 1e-4)) ?? 0.5;
      neu = { typ, a: "y", p, von: 0, bis: 1, s: s0 };
    }
    elementeSetzen([...boxFest.elemente, neu]);
    setGewaehlt(boxFest.elemente.length);
  }
  function elementAendern(aenderung) {
    if (!sel) return;
    elementeSetzen(boxFest.elemente.map((o, k) => (k === gewaehlt ? { ...o, ...aenderung } : o)));
  }
  async function elementLoeschen() {
    if (!sel) return;
    const ok = await alt.nachfragen({ titel: "Löschen", text: elementName(sel, gewaehlt, boxFest.elemente) + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    elementeSetzen(boxFest.elemente.filter((o, k) => k !== gewaehlt));
    setGewaehlt(-1);
  }
  const p = (k) => (v) => setStand((s) => ({ ...s, platte: { ...s.platte, [k]: v } }));

  const drucker = DRUCKER[stand.drucker] ? stand.drucker : "x1c", bett = DRUCKER[drucker];
  // Grundplatte nach Drucker in Stücke teilen (nur ohne festen Rand möglich)
  const teilbar = stand.art === "platte" && (platte.art === "felder" || platte.distanz);
  const pmRoh = platteMasse(platte);
  const teilung = teilbar ? aufteilen(pmRoh.nx, pmRoh.ny, drucker) : null;
  const geteilt = !!(teilung && teilung.geteilt);

  // ---------- Einlage als Inhalt der Box (seit 1.919.0, Patrick wählte
  // „Einlage als Inhalt einer Box“): gespeicherte Einlage aus dem Einlagen
  // Generator, ihre Taschen kommen in den Boden der Box ----------
  const [einlagen, setEinlagen] = useState(null);
  const [einlageGeo, setEinlageGeo] = useState(null);
  const [einlageText, setEinlageText] = useState("");
  const einlageId = boxFest.einlage && boxFest.einlage.id;
  const bmFest = boxMasse(boxFest);
  useEffect(() => {
    if (!einlageId || stand.art !== "box") { setEinlageGeo(null); setEinlageText(""); return undefined; }
    let weg = false;
    (async () => {
      setEinlageText("Einlage wird gerechnet …");
      const { data, error } = await alt.db.from("einlagen").select("id, name, daten").eq("id", einlageId).maybeSingle();
      if (weg) return;
      if (error || !data || !data.daten || !data.daten.base) { setEinlageGeo(null); setEinlageText("Die Einlage gibt es nicht mehr."); return; }
      try {
        const w = await einlageRechner();
        const B = data.daten.base;
        // knapp kleiner als die Box aussen, damit sich keine Flächen decken
        const g = w.einlageDreiecke(data.daten, Math.min(B.W, bmFest.W - 0.2), Math.min(B.H, bmFest.D - 0.2));
        if (weg) return;
        setEinlageGeo({ id: data.id, tris: g.tris, W: g.W, H: g.H, T: g.T, roh: { W: B.W, H: B.H, T: B.T } });
        setEinlageText("");
      } catch (f) { if (!weg) { setEinlageGeo(null); setEinlageText("Einlage nicht gerechnet: " + (f.message || f)); } }
    })();
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einlageId, stand.art, bmFest.W, bmFest.D]);
  async function einlagenLaden() {
    const { data, error } = await alt.db.from("einlagen").select("id, name, geaendert_am").order("geaendert_am", { ascending: false }).limit(300);
    setEinlagen(error ? [] : data || []);
  }
  async function einlageWaehlen(x) {
    const { data, error } = await alt.db.from("einlagen").select("id, name, daten").eq("id", x.id).maybeSingle();
    if (error || !data || !data.daten || !data.daten.base) { alt.meldung("Einlage nicht gefunden.", "fehler"); return; }
    const B = data.daten.base;
    const nx = Math.min(10, felderFuer(B.W)), ny = Math.min(10, felderFuer(B.H));
    // Höhe in 7-mm-Einheiten: Einlage ganz drin, mit Stapelrand 1 mm Luft
    const u = Math.min(30, Math.max(1, Math.ceil((EINLAGE_Z + (+B.T || 0) + (stand.box.rand !== false ? 1 : 0)) / GF.einheit - 1e-6)));
    setEinlagen(null); setGewaehlt(-1);
    setStand((s) => ({ ...s, box: { ...s.box, nx, ny, u, einlage: { id: data.id, name: data.name } } }));
  }

  const netz = useMemo(() => {
    try {
      if (stand.art === "schublade") return null;
      if (stand.art === "box") return boxNetz(box, einlageGeo && box.einlage && einlageGeo.id === box.einlage.id ? einlageGeo : null);
      return geteilt ? stueckeVorschau(platte, teilung) : platteNetz(platte);
    }
    catch (f) { alt.fehlerMerken && alt.fehlerMerken("Gridfinity", String(f)); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stand.art, drucker, einlageGeo, JSON.stringify(stand.art === "box" ? box : platte)]);

  // Distanzstücke an ihrem Platz, nur für die Vorschau (grau)
  const distanzPlatz = useMemo(() => (stand.art !== "platte" ? null : geteilt
    ? distanzNetz(platte, teilung, drucker)
    : distanzNetz(platte, null, drucker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand.art, drucker, JSON.stringify(platte)]);
  const bm = boxMasse(box), pm = platteMasse(platte);
  const dp = distanzPlan(platte, drucker);
  const dateiName = stand.art === "box"
    ? `gridfinity-box-${box.nx}x${box.ny}x${box.u}` + (boxFest.einlage
      ? "-" + boxFest.einlage.name.toLowerCase().replace(/[^a-z0-9äöü]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
      : box.fx * box.fy > 1 ? `-${box.fx}x${box.fy}faecher` : "")
    : `gridfinity-platte-${pm.nx}x${pm.ny}` + (platte.art === "schublade" ? `-${Math.round(pm.W)}x${Math.round(pm.D)}mm` : "");
  const breit = stand.art === "box" ? bm.W : pm.W, tief = stand.art === "box" ? bm.D : pm.D;
  const passt = (w, d) => (w <= bett.a && d <= bett.b) || (w <= bett.b && d <= bett.a);
  const zuGross = !geteilt && !passt(breit, tief);
  const arten = geteilt ? stueckArten(teilung) : [];
  // Klammern: je Schnitt eine je Feld entlang des Stosses
  const klammern = geteilt ? (teilung.xs.length - 1) * pm.ny + (teilung.ys.length - 1) * pm.nx : 0;

  function speichern(verbinder = false, stueck = null) {
    const format = "stl";
    let nz, name;
    if (stueck) {
      nz = platteNetz({ ...platte, art: "felder", nx: stueck.nx, ny: stueck.ny, anschluss: true });
      name = `gridfinity-platte-${stueck.nx}x${stueck.ny}-stueck`;
    } else if (verbinder === "distanz") {
      // jeder Klotz ein eigenes Teil in der Datei, nicht mit der Platte verbunden
      nz = distanzDruck(platte, drucker); if (!nz.length) return;
      name = `gridfinity-distanz-${Math.round(platte.breite)}x${Math.round(platte.tiefe)}mm`;
    } else if (verbinder) { nz = verbinderNetz(platte); name = "gridfinity-klammer"; }
    else { nz = netz; name = dateiName; }
    if (!nz) return;
    // Mehrere Teile (Distanzstücke) als ein STL; im Slicer „In Objekte teilen“
    if (Array.isArray(nz)) nz = netzeVereinen(nz);
    const daten = stlBinaer(nz, name);
    const blob = new Blob([daten], { type: "model/stl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + "." + format;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    alt.meldung(`${name}.${format} gespeichert.`, "gut");
  }

  // Projekt und Drucker stehen in jedem Reiter zuoberst
  const kopfTeil = <>
          <section className="gfn-gruppe" data-gf-projekt>
            <div className="gfn-kopf">
              <h3>Projekt</h3>
              <button type="button" className="gfn-hinzu__knopf" data-gf-projekte-knopf aria-expanded={liste}
                onClick={() => { setListe((l) => !l); projekteLaden(); }}>Projekte{projekte && projekte.length ? " (" + projekte.length + ")" : ""}</button>
            </div>
            <label className="gfn-feld">
              <span>Name</span>
              <input value={projektName} data-gf-projektname placeholder="z. B. Schublade Drehbank 3" onChange={(e) => setProjektName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); projektSpeichern(); } }} />
            </label>
            <div className="gfn-elementknoepfe">
              <button type="button" className="knopf knopf--haupt" data-gf-projekt-speichern onClick={() => projektSpeichern()}>{projekt ? "Speichern" : "Als Projekt speichern"}</button>
              {projekt && <button type="button" className="knopf" data-gf-projekt-kopie onClick={() => projektSpeichern(true)}>Als neues</button>}
              <button type="button" className="knopf" data-gf-projekt-neu onClick={projektNeu}>Neu</button>
            </div>
            {projekt && <p className="gfn-text">Offen: {projekt.name}. Änderungen erst mit „Speichern“ im Projekt.</p>}
            {liste && <ul className="gfn-liste" data-gf-projektliste>
              {(projekte || []).map((x) => (
                <li key={x.id} className="gfn-projektzeile">
                  <button type="button" data-gf-projekt-oeffnen={x.name} className={projekt && projekt.id === x.id ? "aktiv" : ""} onClick={() => projektOeffnen(x)}>
                    <b>{x.name}</b><span>{x.geaendert_am ? alt.datumZeitKurz(x.geaendert_am) : ""}</span>
                  </button>
                  <button type="button" className="gfn-weg" aria-label={"Projekt " + x.name + " löschen"} data-gf-projekt-loeschen={x.name} onClick={() => projektLoeschen(x)}>✕</button>
                </li>
              ))}
              {projekte && !projekte.length && <li className="gfn-text">Noch keine Projekte gespeichert.</li>}
            </ul>}
          </section>
          {/* Drucker zuoberst (Patrick: „nimm die Drucker-Wahl hoch zur Grösse“) */}
          <section className="gfn-gruppe" data-gf-druckerwahl>
              <h3>Drucker</h3>
              <div className="gfn-wahl gfn-wahl--klein">
                {Object.entries(DRUCKER).map(([w, d]) => (
                  <button key={w} type="button" data-gf-drucker={w}
                    className={"gfn-wahl__knopf" + (drucker === w ? " aktiv" : "")}
                    onClick={() => setStand((s) => ({ ...s, drucker: w }))}>{d.name.replace("Bambu Lab ", "")}</button>
                ))}
              </div>
              <p className="gfn-text">Nutzbar {bett.a} × {bett.b} mm.</p>
          </section>
  </>;

  // Alles auf einen Bildschirm (Patrick: „dass man alles direkt sieht und
  // nicht nach unten scrollen muss“): die Höhe ab Oberkante des Rasters bis
  // zum unteren Rand als CSS-Variable, Einstellungen rollen dann für sich
  const werkRef = useRef(null);
  useEffect(() => {
    const el = werkRef.current;
    if (!el) return undefined;
    const messen = () => {
      const r = el.querySelector(".gfn-raster");
      if (!r) return;
      // Platz unter dem Werkzeug (Rand der Seite) mitrechnen, sonst rollt die Seite doch
      let h = Math.max(460, Math.floor(window.innerHeight - r.getBoundingClientRect().top - window.scrollY - 8));
      el.style.setProperty("--gfn-h", h + "px");
      // was danach noch übersteht (Rand der Seite), abziehen
      const ueber = document.documentElement.scrollHeight - window.innerHeight;
      if (ueber > 0 && ueber < 120) el.style.setProperty("--gfn-h", Math.max(460, h - ueber) + "px");
    };
    messen();
    window.addEventListener("resize", messen);
    const ro = new ResizeObserver(messen); ro.observe(document.body);
    return () => { window.removeEventListener("resize", messen); ro.disconnect(); };
  }, [stand.art]);

  return (
    <div className="gfn-werkzeug" ref={werkRef}>
      <div className="gfn-wahl" role="tablist">
        {[["box", "Box"], ["platte", "Grundplatte"], ["schublade", "Schublade"]].map(([w, t]) => (
          <button key={w} role="tab" aria-selected={stand.art === w} data-gf-art={w}
            className={"gfn-wahl__knopf" + (stand.art === w ? " aktiv" : "")}
            onClick={() => setStand((s) => ({ ...s, art: w }))}>{t}</button>
        ))}
      </div>

      {stand.art === "schublade" ? <Schublade sch={stand.schublade} kopf={kopfTeil} oeffnen={ausSchublade} Vorschau={Vorschau} Zahl={Zahl}
        setSch={(v) => setStand((s) => ({ ...s, schublade: v }))} /> :
      <div className="gfn-raster">
        <div className="gfn-einstellungen"><div className="gfn-spalten">
          {kopfTeil}
          {stand.art === "box" ? <>
            <section className="gfn-gruppe">
              <h3>Grösse</h3>
              <Zahl titel="Breite" name="nx" wert={box.nx} setzen={b("nx")} min={1} max={10} einheit="Felder" hinweis={mm(bm.W) + " mm"} />
              <Zahl titel="Tiefe" name="ny" wert={box.ny} setzen={b("ny")} min={1} max={10} einheit="Felder" hinweis={mm(bm.D) + " mm"} />
              <Zahl titel="Höhe" name="u" wert={box.u} setzen={b("u")} min={1} max={30} einheit="× 7 mm" hinweis={mm(bm.H) + " mm" + (box.rand ? " + Stapelrand" : "")} />
            </section>
            <section className="gfn-gruppe" data-gf-einlagegruppe>
              <div className="gfn-kopf">
                <h3>Einlage</h3>
                <button type="button" className="gfn-hinzu__knopf" data-gf-einlage-knopf aria-expanded={!!einlagen}
                  onClick={() => (einlagen ? setEinlagen(null) : einlagenLaden())}>{boxFest.einlage ? "Andere Einlage" : "Einlage einsetzen"}</button>
              </div>
              {boxFest.einlage ? <>
                <p className="gfn-text" data-gf-einlage>
                  <b>{boxFest.einlage.name}</b>{einlageGeo && einlageGeo.id === boxFest.einlage.id
                    ? <> · {mm(einlageGeo.roh.W)} × {mm(einlageGeo.roh.H)} mm, {mm(einlageGeo.roh.T)} mm hoch. Die Taschen sind im Boden der Box.</> : null}
                </p>
                {einlageGeo && einlageGeo.id === boxFest.einlage.id && (einlageGeo.roh.W > bmFest.W + 0.01 || einlageGeo.roh.H > bmFest.D + 0.01) &&
                  <p className="gfn-text gfn-warnung" data-gf-einlage-gross>Die Einlage ist grösser als die Box und wird am Rand abgeschnitten.</p>}
                {einlageGeo && einlageGeo.id === boxFest.einlage.id && EINLAGE_Z + einlageGeo.roh.T > bmFest.H - (boxFest.rand ? 1 : 0) + 0.01 &&
                  <p className="gfn-text gfn-warnung">Die Einlage ist höher als die Box: Höhe vergrössern.</p>}
                {einlageText && <p className="gfn-text">{einlageText}</p>}
                <button type="button" className="knopf" data-gf-einlage-weg onClick={() => setStand((s) => ({ ...s, box: { ...s.box, einlage: null } }))}>Einlage herausnehmen</button>
              </> : <p className="gfn-text">Eine gespeicherte Einlage aus dem Einlagen Generator in die Box setzen. Ihre Werkzeugtaschen kommen in den Boden.</p>}
              {einlagen && <ul className="gfn-liste" data-gf-einlageliste>
                {einlagen.map((x) => (
                  <li key={x.id}><button type="button" data-gf-einlage-wahl={x.name} onClick={() => einlageWaehlen(x)}>
                    <b>{x.name}</b><span>{x.geaendert_am ? alt.datumZeitKurz(x.geaendert_am) : ""}</span>
                  </button></li>
                ))}
                {!einlagen.length && <li className="gfn-text">Noch keine Einlagen im Einlagen Generator gespeichert.</li>}
              </ul>}
            </section>
            {!boxFest.einlage && <>
            <section className="gfn-gruppe">
              <h3>Fächer als Vorlage</h3>
              {/* Vorlage wie im Gridfinity-Generator; setzt die Elemente neu */}
              <Zahl titel="Unterteilungen Breite" name="fx" wert={box.fx} setzen={bRaster("fx")} min={1} max={20} />
              <Zahl titel="Unterteilungen Tiefe" name="fy" wert={box.fy} setzen={bRaster("fy")} min={1} max={20} />
              <button type="button" className="knopf" data-gf-jefeld
                onClick={() => { setGewaehlt(-1); setStand((s) => ({ ...s, box: { ...s.box, fx: box.nx, fy: box.ny, elemente: null } })); }}>Ein Fach je Feld</button>
            </section>
            <section className="gfn-gruppe" data-gf-elemente>
              <div className="gfn-kopf">
                <h3>Elemente</h3>
                <div className="gfn-hinzu">
                  <button type="button" className="gfn-hinzu__knopf" data-gf-hinzu-knopf aria-expanded={menue}
                    onClick={() => setMenue((m) => !m)}>Hinzufügen +</button>
                  {menue && <div className="gfn-menue" role="menu">
                    {[["wand", "Wand", "▯"], ["leiste", "Leiste", "◹"], ["scoop", "Scoop", "◢"]].map(([t, n, z]) => (
                      <button key={t} type="button" role="menuitem" data-gf-hinzu={t} onClick={() => hinzufuegen(t)}><span aria-hidden>{z}</span> {n}</button>
                    ))}
                  </div>}
                </div>
              </div>
              <p className="gfn-text">In der Vorschau anklicken und mit der Maus ziehen. An einem Ende ziehen ändert die Länge. Rastet an Wänden ein.</p>
              <ul className="gfn-liste">
                {box.elemente.map((e, i) => (
                  <li key={i}>
                    <button type="button" data-gf-element={i} className={i === gewaehlt ? "aktiv" : ""} onClick={() => setGewaehlt(i === gewaehlt ? -1 : i)}>
                      <b>{elementName(e, i, box.elemente)}</b>
                      <span>{e.a === "x" ? "längs, " + mm(e.p * lage.iw) + " mm von links" : "quer, " + mm(e.p * lage.id) + " mm von vorne"}, {mm((e.bis - e.von) * (e.a === "x" ? lage.id : lage.iw))} lang</span>
                    </button>
                  </li>
                ))}
                {!box.elemente.length && <li className="gfn-text">Keine Elemente: ein grosses Fach.</li>}
              </ul>
              {sel && <div className="gfn-elementknoepfe">
                <button type="button" className="knopf" data-gf-drehen onClick={() => elementAendern({ a: sel.a === "x" ? "y" : "x" })}>Drehen</button>
                {sel.typ !== "wand" && <button type="button" className="knopf" data-gf-seite onClick={() => elementAendern({ s: -sel.s })}>Seite wechseln</button>}
                <button type="button" className="knopf" data-gf-loeschen onClick={elementLoeschen}>Löschen</button>
              </div>}
            </section>
            </>}
            <section className="gfn-gruppe">
              <h3>Ausführung</h3>
              <Schalter titel="Stapelrand" name="rand" an={box.rand} setzen={b("rand")} text="Boxen lassen sich aufeinander stellen" />
              <Schalter titel="Magnetlöcher" name="magnete" an={box.magnete} setzen={b("magnete")} text="Vier je Feld unten in den Füssen" />
              {box.magnete && <MagnetMasse d={box.magD} h={box.magH} setD={b("magD")} setH={b("magH")} />}
              <Zahl titel="Wand" name="wand" wert={box.wand} setzen={b("wand")} min={0.8} max={3} schritt={0.2} einheit="mm" />
              <Zahl titel="Boden" name="boden" wert={box.boden} setzen={b("boden")} min={0.6} max={5} schritt={0.2} einheit="mm" />
            </section>
          </> : <>
            <section className="gfn-gruppe">
              <h3>Grösse</h3>
              <div className="gfn-wahl gfn-wahl--klein">
                {[["felder", "Anzahl Felder"], ["schublade", "Schublade ausmessen"]].map(([w, t]) => (
                  <button key={w} type="button" data-gf-platte={w}
                    className={"gfn-wahl__knopf" + (platte.art === w ? " aktiv" : "")} onClick={() => p("art")(w)}>{t}</button>
                ))}
              </div>
              {platte.art === "felder" ? <>
                <Zahl titel="Breite" name="pnx" wert={platte.nx} setzen={p("nx")} min={1} max={20} einheit="Felder" hinweis={mm(pm.W) + " mm"} />
                <Zahl titel="Tiefe" name="pny" wert={platte.ny} setzen={p("ny")} min={1} max={20} einheit="Felder" hinweis={mm(pm.D) + " mm"} />
              </> : <>
                <Zahl titel="Schublade innen breit" name="breite" wert={platte.breite} setzen={p("breite")} min={42} max={1000} schritt={1} einheit="mm" />
                <Zahl titel="Schublade innen tief" name="tiefe" wert={platte.tiefe} setzen={p("tiefe")} min={42} max={1000} schritt={1} einheit="mm" />
                {platte.distanz ? <p className="gfn-text" data-gf-felder>
                  Passt {pm.nx} × {pm.ny} Felder ({mm(pm.W)} × {mm(pm.D)} mm), Platte ohne Rand.
                </p> : <p className="gfn-text" data-gf-felder>
                  Passt {pm.nx} × {pm.ny} Felder, Rand ringsum {mm((pm.W - pm.nx * GF.raster) / 2)} / {mm((pm.D - pm.ny * GF.raster) / 2)} mm (0,5 mm Luft zur Schublade).
                </p>}
              </>}
            </section>
            <section className="gfn-gruppe">
              <h3>Ausführung</h3>
              <Schalter titel="Magnetlöcher" name="pmagnete" an={platte.magnete} setzen={p("magnete")} text="Feld bleibt offen, in jeder Ecke ein Sockel mit Loch" />
              {platte.magnete && <MagnetMasse d={platte.magD} h={platte.magH} setD={p("magD")} setH={p("magH")} />}
              <Schalter titel="Anschliessbar" name="anschluss" an={platte.anschluss} setzen={p("anschluss")} text="Wie im Gridfinity-Generator: Schienen am Rand, Platten mit Klammern verbinden" />
              {platte.anschluss && (platte.art === "schublade" && !platte.distanz
                ? <p className="gfn-text gfn-warnung" data-gf-verbinder>Geht beim Schubladenmass nur mit „Distanzstücke statt Rand“, sonst liegt ein Rand zwischen den Platten.</p>
                : <p className="gfn-text" data-gf-verbinder>
                  Eine Klammer je Feld am Stoss: {pm.nx} an der Seite mit {pm.nx} Feldern, {pm.ny} an der Seite mit {pm.ny} Feldern. Platten nebeneinander legen, Klammer von oben über beide Schienen drücken.
                </p>)}
              <p className="gfn-text">Höhe {mm(pm.H)} mm</p>
            </section>
            {platte.art === "schublade" && <section className="gfn-gruppe" data-gf-distanzgruppe>
              {/* Eigene Option (Patrick: „die Leisten dürfen nicht direkt an der
                  Grundplatte angeschlossen sein, eigene Option“): lose Klötze,
                  eigene Datei, die Platte selbst bleibt ohne sie. */}
              <h3>Distanzstücke</h3>
              <Schalter titel="Distanzstücke machen" name="distanz" an={platte.distanz} setzen={p("distanz")} text="Lose Teile füllen den Rest der Schublade, nicht mit der Platte verbunden. Die Platte wird dafür ohne Rand gemacht." />
              {platte.distanz && <div className="gfn-wahl gfn-wahl--klein">
                {[["ecken", "Nur Ecken"], ["rand", "Ganzer Rand"]].map(([w, t]) => (
                  <button key={w} type="button" data-gf-distanzart={w}
                    className={"gfn-wahl__knopf" + (platte.distanzArt === w ? " aktiv" : "")} onClick={() => p("distanzArt")(w)}>{t}</button>
                ))}
              </div>}
              {platte.distanz && dp.teile.length > 0 &&
                <Zahl titel="Winkel Schenkel" name="schenkel" wert={Math.min(platte.schenkel, dp.schenkelMax)} setzen={p("schenkel")} min={20} max={dp.schenkelMax} schritt={5} einheit="mm" hinweis={"höchstens " + dp.schenkelMax + " mm"} />}
              {platte.distanz && <p className="gfn-text" data-gf-distanz>{dp.teile.length
                ? <>{dp.teile.filter((t) => t.art === "winkel").length} lose Winkel für die Ecken{dp.teile.some((t) => t.art === "leiste")
                  ? <>, dazu {dp.teile.filter((t) => t.art === "leiste").length} Leisten dazwischen ({[...new Set(dp.teile.filter((t) => t.art === "leiste").map((t) => mm(t.lang)))].join(" / ")} mm lang, höchstens {dp.leisteMax} mm)</> : null}.
                  {" "}{[dp.gx, dp.gy].filter((x) => x).map(mm).join(" / ")} mm dick, Höhe {mm(pm.H)} mm. Eigene Datei, jedes Teil einzeln.</>
                : <>Kein Distanzstück nötig, der Rest ist kleiner als 1 mm.</>}</p>}
              {platte.distanz && dp.teile.length > 0 &&
                <button className="knopf" data-gf-export="distanz" onClick={() => speichern("distanz")}>Distanzstücke STL</button>}
            </section>}
            <section className="gfn-gruppe" data-gf-druckergruppe>
              <h3>Aufteilen</h3>
              {!geteilt && passt(pm.W, pm.D) && <p className="gfn-text">Passt in einem Stück auf den {bett.name}.</p>}
              {geteilt ? <div data-gf-stuecke>
                <p className="gfn-text">Zu gross für ein Mal: {teilung.stuecke.length} Stücke, mit {klammern} Klammern verbunden.</p>
                {arten.map((a) => (
                  <div key={a.nx + "x" + a.ny} className="gfn-stueck">
                    <span>{a.anzahl} × {a.nx} × {a.ny} Felder</span>
                    <button className="knopf" data-gf-stueck={a.nx + "x" + a.ny} onClick={() => speichern(false, a)}>STL</button>
                  </div>
                ))}
              </div> : !teilbar && !passt(pm.W, pm.D)
                ? <p className="gfn-text gfn-warnung" data-gf-teilhinweis>Zu gross für diesen Drucker. Mit Rand kann nicht geteilt werden: „Distanzstücke machen“ einschalten, dann wird aufgeteilt.</p>
                : null}
            </section>
          </>}
        </div></div>

        <div className="gfn-vorschau">
          <Vorschau netz={netz} extra={distanzPlatz}
            griffe={stand.art === "box" && lage && !boxFest.einlage ? lage.teile : null} gewaehlt={gewaehlt}
            waehlen={setGewaehlt} ziehen={elementZiehen} loslassen={loslassen} />
          <div className="gfn-fuss">
            <div className="gfn-masse" data-gf-masse>
              <b>{mm(breit)} × {mm(tief)} × {mm(netz ? netz.max[2] - netz.min[2] : 0)} mm</b>
              {zuGross && <span className="gfn-warnung" data-gf-warnung>Grösser als {bett.a} × {bett.b} mm: passt nicht auf den {bett.name}.</span>}
              {geteilt && <span className="gfn-text" data-gf-geteilt>Vorschau zeigt die {teilung.stuecke.length} Stücke auseinander gezogen.</span>}
            </div>
            <div className="gfn-export">
              {!geteilt && <>
                <button className="knopf knopf--haupt" data-gf-export="haupt" disabled={!netz} onClick={() => speichern()}>STL speichern</button>
              </>}
              {stand.art === "platte" && (pm.anschluss || geteilt) &&
                <button className="knopf" data-gf-export="verbinder" onClick={() => speichern(true)}>Klammer STL</button>}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ---------- 3D-Vorschau ----------
function Vorschau({ netz, extra, griffe, gewaehlt, waehlen, ziehen, loslassen }) {
  const flaeche = useRef(null);
  // Rückrufe in einer Ref, damit die Maus-Behandlung nur einmal angemeldet wird
  const cb = useRef({});
  cb.current = { griffe, waehlen, ziehen, loslassen };
  const welt = useRef(null);
  const ersteAnsicht = useRef(true);

  useEffect(() => {
    const el = flaeche.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.textContent = "3D-Ansicht geht auf diesem Gerät nicht. Speichern geht trotzdem."; return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000);
    kamera.up.set(0, 0, 1);
    szene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const licht = new THREE.DirectionalLight(0xffffff, 1.6);
    licht.position.set(-1, -2, 3);
    kamera.add(licht); szene.add(kamera);
    const steuer = new OrbitControls(kamera, renderer.domElement);
    steuer.enableDamping = true;
    let lauf = 0;
    const malen = () => { lauf = requestAnimationFrame(malen); steuer.update(); renderer.render(szene, kamera); };
    malen();
    const groesse = () => {
      const b = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(b, h, false);
      renderer.domElement.style.width = b + "px"; renderer.domElement.style.height = h + "px";
      kamera.aspect = b / h; kamera.updateProjectionMatrix();
    };
    groesse();
    const ro = new ResizeObserver(groesse); ro.observe(el);
    welt.current = { renderer, szene, kamera, steuer, teil: null, raster: null, griffe: null };

    // Fächer-Elemente anklicken und ziehen (Patrick: „wie bei Gridfinity mit
    // Drag and Drop“). Läuft vor OrbitControls (Capture), damit ein Griff
    // an einem Element nicht die Ansicht dreht.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), punkt = new THREE.Vector3();
    const strahl = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, kamera);
    };
    const treffer = (ev) => {
      const w = welt.current;
      if (!w || !w.griffe || !cb.current.griffe) return null;
      strahl(ev);
      return ray.intersectObjects(w.griffe.children.filter((o) => o.userData.i >= 0), false)[0] || null;
    };
    let zieh = null, unten = null;
    const runter = (ev) => {
      unten = { x: ev.clientX, y: ev.clientY };
      const h = treffer(ev);
      if (!h) return;
      const i = h.object.userData.i, g = cb.current.griffe[i];
      const z0 = welt.current.griffe.position.z;
      const p = { x: h.point.x, y: h.point.y };
      const laengsX = h.object.userData.a === "y";
      const u = laengsX ? p.x : p.y, u0 = laengsX ? g.x0 : g.y0, u1 = laengsX ? g.x1 : g.y1;
      const greif = Math.min(8, (u1 - u0) / 4);
      const art = u - u0 < greif ? "von" : u1 - u < greif ? "bis" : "mitte";
      zieh = { i, art, start: p, ebene: new THREE.Plane(new THREE.Vector3(0, 0, 1), -(h.point.z)), z0 };
      ev.stopImmediatePropagation(); ev.preventDefault();
      steuer.enabled = false;
      try { renderer.domElement.setPointerCapture(ev.pointerId); } catch { /* egal */ }
      cb.current.waehlen(i);
    };
    const bewegen = (ev) => {
      if (!zieh) {
        if (ev.buttons) return;
        const h = treffer(ev);
        renderer.domElement.style.cursor = h ? "grab" : "";
        return;
      }
      strahl(ev);
      if (ray.ray.intersectPlane(zieh.ebene, punkt)) cb.current.ziehen(zieh.i, zieh.art, zieh.start, { x: punkt.x, y: punkt.y });
      renderer.domElement.style.cursor = "grabbing";
    };
    const hoch = (ev) => {
      if (zieh) {
        zieh = null; steuer.enabled = true; cb.current.loslassen();
        renderer.domElement.style.cursor = "grab";
      } else if (unten && Math.hypot(ev.clientX - unten.x, ev.clientY - unten.y) < 4 && cb.current.griffe) {
        cb.current.waehlen(-1);   // Klick ins Leere hebt die Wahl auf
      }
      unten = null;
    };
    renderer.domElement.addEventListener("pointerdown", runter, true);
    renderer.domElement.addEventListener("pointermove", bewegen);
    renderer.domElement.addEventListener("pointerup", hoch);
    renderer.domElement.addEventListener("pointercancel", hoch);
    return () => {
      cancelAnimationFrame(lauf); ro.disconnect(); steuer.dispose();
      const w = welt.current;
      if (w && w.teil) { w.teil.geometry.dispose(); w.teil.material.dispose(); }
      renderer.dispose(); renderer.domElement.remove();
      welt.current = null;
    };
  }, []);

  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    if (w.teil) { w.szene.remove(w.teil); w.teil.geometry.dispose(); w.teil.material.dispose(); w.teil = null; }
    if (w.raster) { w.szene.remove(w.raster); w.raster = null; }
    if (w.extra) { w.szene.remove(w.extra); w.extra.geometry.dispose(); w.extra.material.dispose(); w.extra = null; }
    if (!netz) return;
    if (extra) {
      const ge = new THREE.BufferGeometry();
      ge.setAttribute("position", new THREE.BufferAttribute(extra.pos, 3));
      ge.setIndex(new THREE.BufferAttribute(extra.tri, 1));
      const fe = ge.toNonIndexed(); ge.dispose(); fe.computeVertexNormals();
      w.extra = new THREE.Mesh(fe, new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.7 }));
      w.szene.add(w.extra);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(netz.pos, 3));
    g.setIndex(new THREE.BufferAttribute(netz.tri, 1));
    const flach = g.toNonIndexed(); g.dispose();
    flach.computeVertexNormals();
    const teil = new THREE.Mesh(flach, new THREE.MeshStandardMaterial({ color: 0x3f7fbf, roughness: 0.55, metalness: 0.05 }));
    teil.position.z = -netz.min[2];
    w.szene.add(teil); w.teil = teil;
    // Raster 42 mm als Boden, damit die Grösse sichtbar ist
    const mx = extra ? [Math.max(netz.max[0], extra.max[0]) - Math.min(netz.min[0], extra.min[0]), Math.max(netz.max[1], extra.max[1]) - Math.min(netz.min[1], extra.min[1])] : [netz.max[0] - netz.min[0], netz.max[1] - netz.min[1]];
    const gross = Math.max(mx[0], mx[1]);
    const felder = Math.ceil(gross / GF.raster) + 2;
    const raster = new THREE.GridHelper(felder * GF.raster, felder, 0x8a99a8, 0xc3ccd5);
    raster.rotation.x = Math.PI / 2; raster.position.z = -0.05;
    w.szene.add(raster); w.raster = raster;
    if (ersteAnsicht.current || w.groesse !== Math.round(gross)) {
      // Kamera schräg von vorne oben, ganzes Teil im Bild
      const h = netz.max[2] - netz.min[2];
      const d = Math.max(gross, h) * 1.45 + 30;
      w.kamera.position.set(d * 0.55, -d * 0.85, d * 0.75);
      w.steuer.target.set(0, 0, h / 3);
      w.steuer.update();
      ersteAnsicht.current = false; w.groesse = Math.round(gross);
    }
  }, [netz, extra]);

  // Griffe: unsichtbare Kästen zum Anklicken, das gewählte Element orange
  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    if (w.griffe) {
      w.szene.remove(w.griffe);
      w.griffe.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      w.griffe = null;
    }
    if (!griffe || !netz) return;
    const gruppe = new THREE.Group();
    gruppe.position.z = -netz.min[2];
    griffe.forEach((g, i) => {
      const dx = Math.max(g.x1 - g.x0, 2.5), dy = Math.max(g.y1 - g.y0, 2.5), dz = Math.max(g.z1 - g.z0, 1);
      const an = i === gewaehlt;
      const m = new THREE.Mesh(new THREE.BoxGeometry(dx + 0.3, dy + 0.3, dz + 0.3),
        new THREE.MeshStandardMaterial({ color: 0xe8b04a, transparent: true, opacity: an ? 0.85 : 0, depthWrite: an, roughness: 0.6 }));
      m.position.set((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, (g.z0 + g.z1) / 2);
      m.userData = { i, a: g.a };
      gruppe.add(m);
      if (an) {
        // Punkte an den Enden: dort ziehen ändert die Länge
        for (const e of [0, 1]) {
          const k = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd2453a }));
          k.position.set(g.a === "y" ? (e ? g.x1 : g.x0) : (g.x0 + g.x1) / 2, g.a === "y" ? (g.y0 + g.y1) / 2 : (e ? g.y1 : g.y0), g.z1 + 1);
          k.userData = { i: -1 };
          gruppe.add(k);
        }
      }
    });
    w.szene.add(gruppe); w.griffe = gruppe;
  }, [griffe, gewaehlt, netz]);

  return <div className="gfn-3d" ref={flaeche} data-gf-3d />;
}
