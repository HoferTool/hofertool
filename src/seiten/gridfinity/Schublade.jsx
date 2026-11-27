// =================================================================
//  GRIDFINITY: SCHUBLADE LAYOUTEN (seit 1.922.0, Wunsch Patrick
//  27. November 2026: „ein Tab, wo man visuell anschauen kann, wenn man
//  Masse für eine Schublade eingibt, dass man dann die ganze Schublade mit
//  Boxen und Einlagen layouten kann“)
//  Masse eingeben, das Raster der Grundplatte erscheint; Boxen (neu oder
//  aus gespeicherten Projekten) und Einlagen aus dem Einlagen Generator
//  aufs Raster setzen und mit der Maus schieben (rastet je Feld ein).
//  Draufsicht zum Schieben, 3D zum Anschauen. „Öffnen“ bringt ein Teil in
//  den Reiter Box bzw. die Grundplatte in den Reiter Grundplatte, dort
//  wird die STL gespeichert. Gespeichert wird das Layout mit dem Projekt.
// =================================================================
import { useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { GF, BOX_VORGABE, platteMasse, platteNetz, bloeckeNetz, EINLAGE_Z } from "./geometrie.js";

export const SCHUBLADE_VORGABE = { breite: 430, tiefe: 309, hoehe: 60, teile: [] };
const mm = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
const felderFuer = (L) => Math.max(1, Math.ceil((L + 0.5) / GF.raster - 1e-6));
const FARBE = { box: "#3f7fbf", einlage: "#c9852b" };

export function schubladePruefen(s) {
  const z = (v, a, b, std) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : std; };
  s = s && typeof s === "object" ? s : {};
  return {
    breite: z(s.breite, 42, 2000, 430), tiefe: z(s.tiefe, 42, 2000, 309), hoehe: z(s.hoehe, 10, 500, 60),
    teile: (Array.isArray(s.teile) ? s.teile : []).slice(0, 200).filter((t) => t && (t.typ === "box" || t.typ === "einlage")).map((t, k) => ({
      id: String(t.id || "t" + k), typ: t.typ, name: String(t.name || (t.typ === "box" ? "Box" : "Einlage")),
      nx: Math.round(z(t.nx, 1, 10, 1)), ny: Math.round(z(t.ny, 1, 10, 1)), u: Math.round(z(t.u, 1, 30, 3)),
      x: Math.round(z(t.x, 0, 60, 0)), y: Math.round(z(t.y, 0, 60, 0)),
      box: t.box && typeof t.box === "object" ? t.box : null,
      einlage: t.einlage && t.einlage.id ? { id: String(t.einlage.id), name: String(t.einlage.name || "") } : null,
    })),
  };
}

// Höhe einer Box über der Grundplatte (mit Stapelrand)
const teilHoehe = (t) => t.u * GF.einheit + ((t.box ? t.box.rand !== false : true) ? 4.4 : 0);
const ueberlappt = (a, b) => a.x < b.x + b.nx && b.x < a.x + a.nx && a.y < b.y + b.ny && b.y < a.y + a.ny;

export default function Schublade({ sch: roh, setSch, oeffnen, Vorschau, Zahl, kopf }) {
  const sch = schubladePruefen(roh);
  const pm = platteMasse({ art: "schublade", breite: sch.breite, tiefe: sch.tiefe, distanz: true, magnete: false });
  const [gewaehlt, setGewaehlt] = useState(null);
  const [ansicht, setAnsicht] = useState("oben");
  const [liste, setListe] = useState(null);   // {art: "projekt"|"einlage", eintraege}
  const [zug, setZug] = useState(null);       // Teile während des Ziehens
  const teile = zug || sch.teile;
  const sel = teile.find((t) => t.id === gewaehlt) || null;
  const setzen = (aenderung) => setSch({ ...sch, ...aenderung });
  const teileSetzen = (neu) => setzen({ teile: neu });

  // Teil im Raster? kollidiert? zu hoch?
  const raus = (t) => t.x + t.nx > pm.nx || t.y + t.ny > pm.ny;
  const stoss = (t) => teile.some((o) => o.id !== t.id && ueberlappt(t, o));
  const zuHoch = (t) => pm.H + teilHoehe(t) > sch.hoehe + 0.01;
  const belegt = teile.reduce((s, t) => s + t.nx * t.ny, 0);

  // erste freie Stelle für ein neues Teil
  function freiePlatz(nx, ny) {
    for (let y = 0; y + ny <= pm.ny; y++) for (let x = 0; x + nx <= pm.nx; x++) {
      const p = { x, y, nx, ny };
      if (!teile.some((o) => ueberlappt(p, o))) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  function neuesTeil(t) {
    const p = freiePlatz(t.nx, t.ny);
    const neu = { id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...t, ...p };
    teileSetzen([...sch.teile, neu]);
    setGewaehlt(neu.id); setListe(null);
  }
  async function listeOeffnen(art) {
    if (liste && liste.art === art) { setListe(null); return; }
    const q = art === "projekt"
      ? alt.db.from("gridfinity_projekte").select("id, name, daten").order("geaendert_am", { ascending: false }).limit(300)
      : alt.db.from("einlagen").select("id, name, geaendert_am").order("geaendert_am", { ascending: false }).limit(300);
    const { data, error } = await q;
    let e = error ? [] : data || [];
    if (art === "projekt") e = e.filter((x) => x.daten && x.daten.art === "box" && x.daten.box);
    setListe({ art, eintraege: e });
  }
  async function einlageNehmen(x) {
    const { data, error } = await alt.db.from("einlagen").select("id, name, daten").eq("id", x.id).maybeSingle();
    if (error || !data || !data.daten || !data.daten.base) { alt.meldung("Einlage nicht gefunden.", "fehler"); return; }
    const B = data.daten.base;
    const u = Math.min(30, Math.max(1, Math.ceil((EINLAGE_Z + (+B.T || 0) + 1) / GF.einheit - 1e-6)));
    neuesTeil({ typ: "einlage", name: data.name, nx: Math.min(10, felderFuer(B.W)), ny: Math.min(10, felderFuer(B.H)), u,
      einlage: { id: data.id, name: data.name }, box: null });
  }
  function projektNehmen(x) {
    const b = { ...BOX_VORGABE, ...x.daten.box };
    neuesTeil({ typ: b.einlage ? "einlage" : "box", name: x.name, nx: b.nx, ny: b.ny, u: b.u, box: b, einlage: b.einlage || null });
  }
  function teilAendern(a) { teileSetzen(sch.teile.map((t) => (t.id === gewaehlt ? { ...t, ...a } : t))); }
  async function teilLoeschen() {
    if (!sel) return;
    const ok = await alt.nachfragen({ titel: "Löschen", text: "„" + sel.name + "“ wird aus der Schublade genommen.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    teileSetzen(sch.teile.filter((t) => t.id !== gewaehlt)); setGewaehlt(null);
  }

  // ---------- Draufsicht: SVG in mm, vorne unten ----------
  const svg = useRef(null);
  const rand = 6;
  const ox = (sch.breite - pm.W) / 2, oy = (sch.tiefe - pm.D) / 2;   // Raster mittig in der Schublade
  const zx = (i) => ox + i * GF.raster, zy = (j) => sch.tiefe - oy - j * GF.raster;   // Feldecke → SVG
  const punktZuFeld = (ev) => {
    const r = svg.current.getBoundingClientRect();
    const vb = svg.current.viewBox.baseVal;
    const sx = vb.x + (ev.clientX - r.left) / r.width * vb.width, sy = vb.y + (ev.clientY - r.top) / r.height * vb.height;
    return { fx: (sx - ox) / GF.raster, fy: (sch.tiefe - oy - sy) / GF.raster };
  };
  const ziehen = useRef(null), zugRef = useRef(null);
  function runter(ev, t) {
    ev.preventDefault(); ev.stopPropagation();
    setGewaehlt(t.id);
    const p = punktZuFeld(ev);
    ziehen.current = { id: t.id, dx: p.fx - t.x, dy: p.fy - t.y, start: sch.teile };
    try { svg.current.setPointerCapture(ev.pointerId); } catch { /* egal */ }
  }
  function bewegen(ev) {
    const z = ziehen.current;
    if (!z) return;
    const p = punktZuFeld(ev);
    const neu = z.start.map((t) => {
      if (t.id !== z.id) return t;
      const x = Math.min(Math.max(0, pm.nx - t.nx), Math.max(0, Math.round(p.fx - z.dx)));
      const y = Math.min(Math.max(0, pm.ny - t.ny), Math.max(0, Math.round(p.fy - z.dy)));
      return { ...t, x, y };
    });
    zugRef.current = neu; setZug(neu);
  }
  function hoch() {
    if (!ziehen.current) return;
    ziehen.current = null;
    // erst beim Loslassen speichern, und nur wenn sich etwas bewegt hat
    const z = zugRef.current; zugRef.current = null;
    if (z && JSON.stringify(z) !== JSON.stringify(sch.teile)) teileSetzen(z);
    setZug(null);
  }

  // ---------- 3D: Grundplatte plus Klötze für die Teile ----------
  const netz = useMemo(() => (ansicht === "3d" ? platteNetz({ art: "schublade", breite: sch.breite, tiefe: sch.tiefe, distanz: true }) : null),
    [ansicht, sch.breite, sch.tiefe]);
  const bloecke = useMemo(() => {
    if (ansicht !== "3d" || !teile.length) return null;
    const x0 = -pm.W / 2, y0 = -pm.D / 2;
    return bloeckeNetz(teile.map((t) => ({
      x0: x0 + t.x * GF.raster + 0.25, y0: y0 + t.y * GF.raster + 0.25, z0: pm.H,
      x1: x0 + (t.x + t.nx) * GF.raster - 0.25, y1: y0 + (t.y + t.ny) * GF.raster - 0.25, z1: pm.H + teilHoehe(t),
    })));
  }, [ansicht, JSON.stringify(teile), pm.W, pm.D, pm.H]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gfn-raster" data-gf-schublade>
      <div className="gfn-einstellungen">
        {kopf}
        <section className="gfn-gruppe">
          <h3>Schublade innen</h3>
          <Zahl titel="Breite" name="sbreite" wert={sch.breite} setzen={(v) => setzen({ breite: v })} min={42} max={2000} einheit="mm" />
          <Zahl titel="Tiefe" name="stiefe" wert={sch.tiefe} setzen={(v) => setzen({ tiefe: v })} min={42} max={2000} einheit="mm" />
          <Zahl titel="Höhe" name="shoehe" wert={sch.hoehe} setzen={(v) => setzen({ hoehe: v })} min={10} max={500} einheit="mm" />
          <p className="gfn-text" data-gf-sraster>Raster {pm.nx} × {pm.ny} Felder ({mm(pm.W)} × {mm(pm.D)} mm), belegt {belegt} von {pm.nx * pm.ny}.</p>
          <button type="button" className="knopf" data-gf-splatte onClick={() => oeffnen({ art: "platte", breite: sch.breite, tiefe: sch.tiefe })}>Grundplatte dazu öffnen</button>
        </section>
        <section className="gfn-gruppe">
          <div className="gfn-kopf">
            <h3>Teile</h3>
            <div className="gfn-hinzu">
              <button type="button" className="gfn-hinzu__knopf" data-gf-shinzu aria-expanded={liste && liste.art === "menue"}
                onClick={() => setListe((l) => (l && l.art === "menue" ? null : { art: "menue" }))}>Hinzufügen +</button>
              {liste && liste.art === "menue" && <div className="gfn-menue" role="menu">
                <button type="button" role="menuitem" data-gf-sneu="box" onClick={() => neuesTeil({ typ: "box", name: "Box", nx: 1, ny: 1, u: 3, box: null, einlage: null })}>▯ Neue Box</button>
                <button type="button" role="menuitem" data-gf-sneu="projekt" onClick={() => listeOeffnen("projekt")}>▤ Gespeicherte Box</button>
                <button type="button" role="menuitem" data-gf-sneu="einlage" onClick={() => listeOeffnen("einlage")}>◫ Einlage</button>
              </div>}
            </div>
          </div>
          {liste && liste.art !== "menue" && <ul className="gfn-liste" data-gf-swahl>
            {liste.eintraege.map((x) => (
              <li key={x.id}><button type="button" data-gf-swahl-name={x.name} onClick={() => (liste.art === "projekt" ? projektNehmen(x) : einlageNehmen(x))}>
                <b>{x.name}</b><span>{liste.art === "projekt" ? x.daten.box.nx + " × " + x.daten.box.ny + " × " + x.daten.box.u : "Einlage"}</span>
              </button></li>
            ))}
            {!liste.eintraege.length && <li className="gfn-text">{liste.art === "projekt" ? "Noch keine Box als Projekt gespeichert." : "Noch keine Einlagen gespeichert."}</li>}
          </ul>}
          <p className="gfn-text">In der Draufsicht ziehen, rastet je Feld ein.</p>
          <ul className="gfn-liste">
            {teile.map((t) => (
              <li key={t.id}><button type="button" data-gf-steil={t.name} className={t.id === gewaehlt ? "aktiv" : ""} onClick={() => setGewaehlt(t.id === gewaehlt ? null : t.id)}>
                <b>{t.name}</b>
                <span>{t.nx} × {t.ny} × {t.u}{raus(t) ? " · ragt hinaus" : stoss(t) ? " · überlappt" : zuHoch(t) ? " · zu hoch" : ""}</span>
              </button></li>
            ))}
            {!teile.length && <li className="gfn-text">Noch leer. Mit „Hinzufügen“ Boxen und Einlagen hineinlegen.</li>}
          </ul>
          {sel && <div data-gf-sgewaehlt>
            {sel.typ === "box" && !sel.box && <>
              <Zahl titel="Breite" name="snx" wert={sel.nx} setzen={(v) => teilAendern({ nx: v })} min={1} max={10} einheit="Felder" />
              <Zahl titel="Tiefe" name="sny" wert={sel.ny} setzen={(v) => teilAendern({ ny: v })} min={1} max={10} einheit="Felder" />
              <Zahl titel="Höhe" name="su" wert={sel.u} setzen={(v) => teilAendern({ u: v })} min={1} max={30} einheit="× 7 mm" />
            </>}
            <p className="gfn-text">Höhe mit Platte {mm(pm.H + teilHoehe(sel))} mm{zuHoch(sel) ? <b className="gfn-warnung"> · höher als die Schublade</b> : null}</p>
            <div className="gfn-elementknoepfe">
              <button type="button" className="knopf" data-gf-sdrehen onClick={() => teilAendern({ nx: sel.ny, ny: sel.nx })}>Drehen</button>
              <button type="button" className="knopf" data-gf-soeffnen onClick={() => oeffnen({ art: "box", teil: sel })}>Im Reiter Box öffnen</button>
              <button type="button" className="knopf" data-gf-sloeschen onClick={teilLoeschen}>Löschen</button>
            </div>
          </div>}
        </section>
      </div>

      <div className="gfn-vorschau">
        <div className="gfn-wahl gfn-wahl--klein">
          {[["oben", "Draufsicht"], ["3d", "3D"]].map(([w, t]) => (
            <button key={w} type="button" data-gf-sansicht={w} className={"gfn-wahl__knopf" + (ansicht === w ? " aktiv" : "")} onClick={() => setAnsicht(w)}>{t}</button>
          ))}
        </div>
        {ansicht === "3d" ? <Vorschau netz={netz} extra={bloecke} /> :
          <svg ref={svg} className="gfn-oben" data-gf-oben viewBox={`${-rand} ${-rand} ${sch.breite + 2 * rand} ${sch.tiefe + 2 * rand + 12}`}
            onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} onPointerDown={() => setGewaehlt(null)}>
            <rect x={0} y={0} width={sch.breite} height={sch.tiefe} rx={3} className="gfn-oben__lade" />
            <text x={sch.breite / 2} y={sch.tiefe + 14} textAnchor="middle" className="gfn-oben__vorne">vorne</text>
            {Array.from({ length: pm.nx * pm.ny }, (_, k) => {
              const i = k % pm.nx, j = Math.floor(k / pm.nx);
              return <rect key={k} x={zx(i) + 1} y={zy(j + 1) + 1} width={GF.raster - 2} height={GF.raster - 2} rx={4} className="gfn-oben__feld" />;
            })}
            {teile.map((t) => {
              const fehler = raus(t) || stoss(t) || zuHoch(t);
              const w = t.nx * GF.raster - 1, h = t.ny * GF.raster - 1;
              return (
                <g key={t.id} data-gf-sblock={t.name} transform={`translate(${zx(t.x) + 0.5} ${zy(t.y + t.ny) + 0.5})`}
                  onPointerDown={(ev) => runter(ev, t)} style={{ cursor: "grab" }}>
                  <rect width={w} height={h} rx={3.75} fill={FARBE[t.typ]} fillOpacity={0.85}
                    stroke={fehler ? "#d2453a" : t.id === gewaehlt ? "#e8b04a" : "#1e3c5a"} strokeWidth={fehler || t.id === gewaehlt ? 3 : 1} />
                  <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle" className="gfn-oben__text"
                    style={{ fontSize: Math.min(12, w / Math.max(4, t.name.length) * 1.6) }}>{t.name}</text>
                  <text x={w / 2} y={h / 2 + 13} textAnchor="middle" className="gfn-oben__klein">{t.nx}×{t.ny}×{t.u}</text>
                </g>
              );
            })}
          </svg>}
        <div className="gfn-fuss">
          <div className="gfn-masse"><b>Schublade {mm(sch.breite)} × {mm(sch.tiefe)} × {mm(sch.hoehe)} mm</b>
            <span className="gfn-text">{teile.length} Teile, {pm.nx * pm.ny - belegt} Felder frei</span></div>
        </div>
      </div>
    </div>
  );
}
