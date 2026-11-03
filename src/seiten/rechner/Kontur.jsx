// =================================================================
//  RECHNER → KONTUR (seit 1.355.0, Wunsch Patrick 3. November 2026:
//  „Drehkontur aufzeichnen, NC-Code generieren, Plattenradius
//  eingerechnet, nicht mit G41/G42“, „wie bei Siemens / Index V Pro“)
//  Die Kontur entsteht Element für Element wie im Konturrechner von
//  ShopTurn: Gerade oder Bogen, dazwischen Radius oder Fase, und die
//  Grafik zeichnet bei jeder Eingabe mit. Mit „Zeichnen“ setzt ein
//  Klick in die Grafik den nächsten Punkt. Gerechnet wird in kontur.js.
//  Die Kontur bleibt am Konto (Einstellung „kontur“), benannte
//  Konturen in „konturliste“.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { konturRechnen, bahnRechnen, ncProgramm, bogenWinkel, SPITZEN } from "./kontur.js";

const VORGABE = {
  startX: "0", startZ: "0",
  elemente: [
    { art: "gerade", x: "10", z: "", w: "", ueb: "F", uw: "0.3" },
    { art: "gerade", x: "", z: "8", w: "", ueb: "R", uw: "0.5" },
    { art: "gerade", x: "16", z: "", w: "", ueb: "F", uw: "0.3" },
    { art: "gerade", x: "", z: "14", w: "", ueb: "", uw: "" },
  ],
  rn: "0.2", seite: "aussen", spitze: "ur", f: "0.03", abstand: "0.5", g2g3Tauschen: false,
};

let gemerkt = null;
function laden() {
  if (gemerkt) return gemerkt;
  try {
    const t = alt.einstellungWert && alt.einstellungWert("kontur", "");
    if (t) gemerkt = { ...VORGABE, ...JSON.parse(t) };
  } catch (e) { /* kaputter Eintrag: Vorgabe */ }
  if (!gemerkt) gemerkt = JSON.parse(JSON.stringify(VORGABE));
  return gemerkt;
}

const neuesElement = (art) => ({ art, x: "", z: "", w: "", r: art === "bogen" ? "1" : "", dreh: "cw", ueb: "", uw: "" });

export default function Kontur() {
  const [k, setK] = useState(laden);
  const [wahl, setWahl] = useState(-1);
  const [zeichnen, setZeichnen] = useState(false);
  const speichern = useRef(null);

  const aendern = (neu) => {
    const ganz = { ...k, ...neu };
    gemerkt = ganz;
    setK(ganz);
    clearTimeout(speichern.current);
    speichern.current = setTimeout(() => {
      try { alt.einstellungSetzenWert("kontur", JSON.stringify(ganz)); } catch (e) { /* ohne Konto nur hier */ }
    }, 800);
  };
  useEffect(() => () => clearTimeout(speichern.current), []);
  const elementAendern = (i, neu) => aendern({ elemente: k.elemente.map((e, j) => (j === i ? { ...e, ...neu } : e)) });
  const elementWeg = (i) => { aendern({ elemente: k.elemente.filter((_, j) => j !== i) }); setWahl(-1); };
  const elementDazu = (art) => {
    const neu = [...k.elemente];
    const wo = wahl >= 0 && wahl < neu.length ? wahl + 1 : neu.length;
    neu.splice(wo, 0, neuesElement(art));
    aendern({ elemente: neu });
    setWahl(wo);
  };

  const rn = Number(String(k.rn).replace(",", ".")) || 0;
  const seite = k.seite === "innen" ? -1 : 1;
  const spitze = SPITZEN.find((s) => s.id === k.spitze) || SPITZEN[8];
  const kontur = useMemo(() => konturRechnen(k), [k]);
  const bahn = useMemo(() => bahnRechnen(kontur.segmente, rn, seite, spitze), [kontur, rn, seite, spitze]);
  const code = useMemo(() => ncProgramm(k, kontur.fehler.length || bahn.fehler.length ? [] : bahn.bahn), [k, kontur, bahn]);
  const fehler = [...kontur.fehler, ...bahn.fehler];

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(code); alt.meldung("Programm kopiert."); }
    catch (f) { alt.meldung("Kopieren nicht möglich. Bitte von Hand markieren.", "warn"); }
  };

  // Ende der Kontur, damit ein Klick beim Zeichnen weiss, von wo aus
  const ende = kontur.segmente.length ? kontur.segmente[kontur.segmente.length - 1].b
    : { z: Number(k.startZ) || 0, r: (Number(k.startX) || 0) / 2 };
  const punktSetzen = (z, r) => {
    const el = neuesElement("gerade");
    // Fast waagrecht oder senkrecht gilt als genau waagrecht oder senkrecht
    const dz = z - ende.z, dr = r - ende.r;
    if (Math.abs(dr) > 1e-6 && Math.abs(dz) / Math.abs(dr) > 12) r = ende.r;
    if (Math.abs(dz) > 1e-6 && Math.abs(dr) / Math.abs(dz) > 12) z = ende.z;
    if (Math.abs(r - ende.r) > 1e-6) el.x = zahlKurz(r * 2);
    if (Math.abs(z - ende.z) > 1e-6) el.z = zahlKurz(z);
    if (!el.x && !el.z) return;
    aendern({ elemente: [...k.elemente, el] });
    setWahl(k.elemente.length);
  };

  return (
    <div className="kt">
      <div className="kt-raster">
        <div>
          <section className="karte">
            <div className="karte__kopf"><h2>Kontur</h2><Konturliste k={k} aendern={aendern} /></div>
            <div className="kt-start">
              <span className="kt-nr">S</span><b>Start</b>
              <Zahl label="X Ø" wert={k.startX} setze={(v) => aendern({ startX: v })} name="startX" />
              <Zahl label="Z" wert={k.startZ} setze={(v) => aendern({ startZ: v })} name="startZ" />
            </div>
            <div className="kt-liste">
              {k.elemente.map((el, i) => (
                <Element key={i} i={i} el={el} an={wahl === i} letztes={i === k.elemente.length - 1}
                  waehlen={() => setWahl(i)} aendern={(neu) => elementAendern(i, neu)} weg={() => elementWeg(i)} />
              ))}
            </div>
            <div className="kt-dazu">
              <button className="knopf knopf--klein" data-kt="gerade" onClick={() => elementDazu("gerade")}>+ Gerade</button>
              <button className="knopf knopf--klein" data-kt="bogen" onClick={() => elementDazu("bogen")}>+ Bogen</button>
              {wahl >= 0 && <span className="klein">kommt nach Element {wahl + 1}</span>}
            </div>
            <p className="klein">Leeres X oder Z heisst: bleibt gleich. Winkel zur Z-Achse: 0° nach rechts,
              90° nach oben, −90° nach unten, 45° schräg hoch; dann reicht X oder Z.
              Radius oder Fase steht am Ende eines Elements, zum nächsten hin.</p>
          </section>

          <section className="karte">
            <h2>Werkzeug</h2>
            <div className="moduswahl">
              {[["aussen", "Aussenkontur"], ["innen", "Innenkontur"]].map(([w, t]) => (
                <button key={w} className={"moduswahl__knopf" + (k.seite === w ? " aktiv" : "")} data-ktseite={w}
                  onClick={() => aendern({ seite: w, spitze: w === "innen" ? "or" : "ur" })}>{t}</button>
              ))}
            </div>
            <div className="kt-werkzeug">
              <div className="kt-felder">
                <Zahl label="Schneidenradius (Platte) in mm" wert={k.rn} setze={(v) => aendern({ rn: v })} name="rn" breit />
                <Zahl label="Vorschub F" wert={k.f} setze={(v) => aendern({ f: v })} name="f" breit />
                <Zahl label="Abstand Anfahren / Wegfahren" wert={k.abstand} setze={(v) => aendern({ abstand: v })} name="abstand" breit />
              </div>
              <div>
                <span className="kt-titel">Schneidenlage</span>
                <div className="kt-lage" role="group" aria-label="Schneidenlage">
                  {SPITZEN.map((s) => (
                    <button key={s.id} data-ktspitze={s.id} className={"kt-lage__knopf" + (k.spitze === s.id ? " aktiv" : "")}
                      title={s.id === "m" ? "Schneidenmitte" : "Gedachte Spitze hier"} onClick={() => aendern({ spitze: s.id })}>
                      <svg viewBox="-12 -12 24 24" width="34" height="34" aria-hidden="true">
                        <circle r="6" className="kt-lage__platte" />
                        <circle cx={s.z * 6} cy={-s.r * 6} r="2.6" className="kt-lage__punkt" />
                      </svg>
                    </button>
                  ))}
                </div>
                <span className="klein">Der Punkt, auf den das Werkzeug vermessen ist (gedachte Spitze).
                  Star aussen: unten rechts.</span>
              </div>
            </div>
            <label className="schalter"><input type="checkbox" id="kt-tausch" checked={!!k.g2g3Tauschen}
              onChange={(e) => aendern({ g2g3Tauschen: e.target.checked })} />
              <span>G2 und G3 tauschen (Bogen im Uhrzeigersinn in der Grafik = {k.g2g3Tauschen ? "G3" : "G2"})</span></label>
          </section>
        </div>

        <div>
          <section className="karte">
            <div className="karte__kopf"><h2>Grafik</h2>
              <button className={"knopf knopf--klein" + (zeichnen ? " knopf--haupt" : "")} id="kt-zeichnen"
                onClick={() => setZeichnen((z) => !z)}>{zeichnen ? "Zeichnen beenden" : "✎ Zeichnen"}</button></div>
            <Grafik kontur={kontur} bahn={bahn} k={k} wahl={wahl} setWahl={setWahl} zeichnen={zeichnen}
              punktSetzen={punktSetzen} ende={ende} />
            <p className="klein">
              <span className="kt-leg kt-leg--kontur" /> Fertigkontur
              <span className="kt-leg kt-leg--bahn" /> programmierte Bahn (gedachte Spitze)
              <span className="kt-leg kt-leg--mitte" /> Schneidenmitte
              {zeichnen ? " · Klick setzt den nächsten Punkt (Raster 0,1 mm)" : " · Klick auf ein Element wählt es"}
            </p>
            {fehler.length > 0 && <div className="kt-fehler" id="kt-fehler">{fehler.map((f) => <div key={f}>{f}</div>)}</div>}
          </section>

          <section className="karte">
            <div className="karte__kopf"><h2>NC-Programm</h2>
              <button className="linkknopf" id="kt-kopieren" onClick={kopieren}>Kopieren</button></div>
            <pre className="gcode" id="kt-code">{code}</pre>
            <p className="hinweis">Fanuc-Schreibweise wie an den Star, X im Durchmesser. Der Schneidenradius ist in die
              Punkte eingerechnet, darum ohne G41/G42 und mit Schneidenradius 0 im Werkzeugkorrekturspeicher fahren.
              Werkzeugaufruf, Drehzahl und Kühlung fehlen bewusst. Vor dem ersten Lauf am Simulator prüfen.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

const zahlKurz = (n) => String(Math.round(n * 1000) / 1000);

// Zahlenfeld mit Komma oder Punkt; meldet bei jeder Eingabe, damit die
// Grafik gleich mitzeichnet
function Zahl({ label, wert, setze, name, breit }) {
  return (
    <label className={"kt-zahl" + (breit ? " kt-zahl--breit" : "")}><span>{label}</span>
      <input type="text" inputMode="decimal" data-ktfeld={name} value={wert ?? ""}
        onChange={(e) => setze(e.target.value)} /></label>
  );
}

function Element({ i, el, an, letztes, waehlen, aendern, weg }) {
  return (
    <div className={"kt-el" + (an ? " kt-el--an" : "")} data-ktel={i} onFocus={waehlen} onClick={waehlen}>
      <span className="kt-nr">{i + 1}</span>
      <select value={el.art} data-ktfeld="art" onChange={(e) => aendern({ art: e.target.value, r: e.target.value === "bogen" && !el.r ? "1" : el.r })}>
        <option value="gerade">Gerade</option><option value="bogen">Bogen</option>
      </select>
      <Zahl label="X Ø" wert={el.x} setze={(v) => aendern({ x: v })} name="x" />
      <Zahl label="Z" wert={el.z} setze={(v) => aendern({ z: v })} name="z" />
      {el.art === "bogen" ? (
        <>
          <Zahl label="R" wert={el.r} setze={(v) => aendern({ r: v })} name="r" />
          <button className="kt-dreh" data-ktfeld="dreh" title="Drehrichtung in der Grafik"
            onClick={() => aendern({ dreh: el.dreh === "ccw" ? "cw" : "ccw" })}>
            {el.dreh === "ccw" ? "↺ gegen Uhrzeiger" : "↻ Uhrzeiger"}</button>
        </>
      ) : (
        <Zahl label="Winkel °" wert={el.w} setze={(v) => aendern({ w: v })} name="w" />
      )}
      {!letztes && (
        <span className="kt-ueb">
          <select value={el.ueb || ""} data-ktfeld="ueb" onChange={(e) => aendern({ ueb: e.target.value })} title="Übergang zum nächsten Element">
            <option value="">kein Übergang</option><option value="R">Radius</option><option value="F">Fase</option>
          </select>
          {el.ueb && <input type="text" inputMode="decimal" data-ktfeld="uw" value={el.uw ?? ""} placeholder="mm"
            onChange={(e) => aendern({ uw: e.target.value })} />}
        </span>
      )}
      <button className="kt-weg" title="Element löschen" data-ktweg={i} onClick={(e) => { e.stopPropagation(); weg(); }}>✕</button>
    </div>
  );
}

// Benannte Konturen am Konto
function Konturliste({ k, aendern }) {
  const [liste, setListe] = useState(() => {
    try { return JSON.parse(alt.einstellungWert("konturliste", "[]")) || []; } catch (e) { return []; }
  });
  const ablegen = (neu) => { setListe(neu); alt.einstellungSetzenWert("konturliste", JSON.stringify(neu)); };
  const sichern = async () => {
    const w = await alt.dialogFelder({ titel: "Kontur speichern",
      felder: [{ name: "name", label: "Name, z. B. HOCO Nr.", pflicht: true, wert: k.name || "" }], bestaetigen: "Speichern" });
    if (!w) return;
    const name = w.name.trim();
    const daten = { ...k, name };
    aendern({ name });
    ablegen([...liste.filter((x) => x.name !== name), daten].sort((a, b) => a.name.localeCompare(b.name, "de")));
    alt.meldung("Kontur „" + name + "“ gespeichert.", "gut");
  };
  const oeffnen = async () => {
    if (!liste.length) { alt.meldung("Noch keine Kontur gespeichert.", "warn"); return; }
    const w = await alt.auswahlDialog("Kontur öffnen", liste.map((x) => ({ wert: x.name, text: x.name })));
    if (!w) return;
    const x = liste.find((y) => y.name === w);
    if (x) aendern({ ...VORGABE, ...x });
  };
  const loeschen = async () => {
    if (!k.name || !liste.some((x) => x.name === k.name)) { alt.meldung("Diese Kontur ist nicht gespeichert.", "warn"); return; }
    if (!(await alt.nachfragen({ titel: "Kontur löschen", text: "„" + k.name + "“ löschen?", bestaetigen: "Löschen", gefahr: true }))) return;
    ablegen(liste.filter((x) => x.name !== k.name));
  };
  const leeren = async () => {
    if (!(await alt.nachfragen({ titel: "Neue Kontur", text: "Die Elemente leeren?", bestaetigen: "Leeren" }))) return;
    aendern({ name: "", startX: "0", startZ: "0", elemente: [] });
  };
  return (
    <div className="kt-dateien">
      {k.name && <span className="klein">{k.name}</span>}
      <button className="linkknopf" id="kt-neu" onClick={leeren}>Neu</button>
      <button className="linkknopf" id="kt-oeffnen" onClick={oeffnen}>Öffnen</button>
      <button className="linkknopf" id="kt-speichern" onClick={sichern}>Speichern</button>
      {k.name && liste.some((x) => x.name === k.name) && <button className="linkknopf linkknopf--gefahr" onClick={loeschen}>Löschen</button>}
    </div>
  );
}

// -----------------------------------------------------------------
//  Grafik: Z nach rechts, X nach oben, Mittellinie unten (aussen)
// -----------------------------------------------------------------
const B = 640, H = 380, RAND = 34;

function punkteVon(segs) {
  const p = [];
  for (const s of segs) {
    p.push(s.a, s.b);
    if (s.t === "A") {
      const w = bogenWinkel(s), wa = Math.atan2(s.a.r - s.c.r, s.a.z - s.c.z);
      for (let i = 1; i < 12; i++) {
        const t = wa + (s.ccw ? 1 : -1) * w * i / 12;
        p.push({ z: s.c.z + s.R * Math.cos(t), r: s.c.r + s.R * Math.sin(t) });
      }
    }
  }
  return p;
}

function Grafik({ kontur, bahn, k, wahl, setWahl, zeichnen, punktSetzen, ende }) {
  const [maus, setMaus] = useState(null);
  const svg = useRef(null);
  const alle = [...punkteVon(kontur.segmente), ...punkteVon(bahn.bahn),
    { z: Number(k.startZ) || 0, r: (Number(k.startX) || 0) / 2 }];
  let zmin = Math.min(...alle.map((p) => p.z)), zmax = Math.max(...alle.map((p) => p.z));
  let rmin = Math.min(0, ...alle.map((p) => p.r)), rmax = Math.max(...alle.map((p) => p.r));
  // Beim Zeichnen etwas Platz nach rechts und oben lassen
  if (zeichnen) { zmax += Math.max(4, (zmax - zmin) * 0.4); rmax += Math.max(2, (rmax - rmin) * 0.3); }
  if (zmax - zmin < 4) zmax = zmin + 4;
  if (rmax - rmin < 2) rmax = rmin + 2;
  const s = Math.min((B - 2 * RAND) / (zmax - zmin), (H - 2 * RAND) / (rmax - rmin));
  const ox = RAND + ((B - 2 * RAND) - (zmax - zmin) * s) / 2;
  const oy = H - RAND - ((H - 2 * RAND) - (rmax - rmin) * s) / 2;
  const X = (p) => (ox + (p.z - zmin) * s).toFixed(2);
  const Y = (p) => (oy - (p.r - rmin) * s).toFixed(2);
  const pt = (p) => X(p) + " " + Y(p);
  const pfad = (segs) => segs.map((g, i) => (i === 0 || Math.hypot(g.a.z - segs[i - 1].b.z, g.a.r - segs[i - 1].b.r) > 1e-6 ? "M" + pt(g.a) : "")
    + (g.t === "L" ? " L" + pt(g.b)
      : ` A${(g.R * s).toFixed(2)} ${(g.R * s).toFixed(2)} 0 ${bogenWinkel(g) > Math.PI ? 1 : 0} ${g.ccw ? 0 : 1} ${pt(g.b)}`)).join(" ");
  const einzeln = (g) => "M" + pt(g.a) + (g.t === "L" ? " L" + pt(g.b)
    : ` A${(g.R * s).toFixed(2)} ${(g.R * s).toFixed(2)} 0 ${bogenWinkel(g) > Math.PI ? 1 : 0} ${g.ccw ? 0 : 1} ${pt(g.b)}`);

  const segs = kontur.segmente;
  const innen = k.seite === "innen";
  const material = segs.length ? pfad(segs) + ` L${X(segs[segs.length - 1].b)} ${Y({ r: innen ? rmax : 0 })}`
    + ` L${X(segs[0].a)} ${Y({ r: innen ? rmax : 0 })} Z` : "";

  const weltpunkt = (e) => {
    const m = svg.current.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const raster = 0.1;
    const z = Math.round((zmin + (q.x - ox) / s) / raster) * raster;
    const r = Math.max(0, Math.round((rmin + (oy - q.y) / s) / (raster / 2)) * (raster / 2));
    return { z, r };
  };
  const zahl = (n) => (Math.round(n * 1000) / 1000).toLocaleString("de-CH");

  return (
    <div className={"kt-bildfeld" + (zeichnen ? " kt-bildfeld--zeichnen" : "")}>
      <svg ref={svg} viewBox={`0 0 ${B} ${H}`} className="kt-bild" id="kt-bild"
        onMouseMove={(e) => zeichnen && setMaus(weltpunkt(e))} onMouseLeave={() => setMaus(null)}
        onClick={(e) => { if (!zeichnen) return; const p = weltpunkt(e); if (p) punktSetzen(p.z, p.r); }}>
        <line x1={RAND / 2} x2={B - RAND / 2} y1={Y({ r: 0 })} y2={Y({ r: 0 })} className="kt-achse" />
        <text x={B - RAND / 2} y={Number(Y({ r: 0 })) - 4} textAnchor="end" className="kt-text">Mitte</text>
        <line x1={X({ z: 0 })} x2={X({ z: 0 })} y1={RAND / 3} y2={H - RAND / 3} className="kt-null" />
        <text x={Number(X({ z: 0 })) + 4} y={RAND / 3 + 10} className="kt-text">Z0</text>
        {material && <path d={material} className="kt-material" />}
        {segs.map((g, i) => (
          <path key={i} d={einzeln(g)} data-ktseg={g.nr}
            className={"kt-kontur" + (g.nr - 1 === wahl ? " kt-kontur--an" : "")}
            onClick={(e) => { if (zeichnen) return; e.stopPropagation(); setWahl(g.nr - 1); }} />
        ))}
        {bahn.mitte.length > 0 && Number(k.rn) > 0 && <path d={pfad(bahn.mitte)} className="kt-mitte" />}
        {bahn.bahn.length > 0 && <path d={pfad(bahn.bahn)} className="kt-bahn" />}
        {segs.filter((g) => !g.uebergang).map((g) => (
          <text key={"n" + g.nr} x={(Number(X(g.a)) + Number(X(g.b))) / 2 + 5} y={(Number(Y(g.a)) + Number(Y(g.b))) / 2 - 5}
            className="kt-elnr">{g.nr}</text>
        ))}
        <circle cx={X({ z: Number(k.startZ) || 0 })} cy={Y({ r: (Number(k.startX) || 0) / 2 })} r="4" className="kt-startpunkt" />
        {zeichnen && maus && (
          <>
            <line x1={X(ende)} y1={Y(ende)} x2={X(maus)} y2={Y(maus)} className="kt-gummi" />
            <circle cx={X(maus)} cy={Y(maus)} r="3.5" className="kt-startpunkt" />
            <text x={Number(X(maus)) + 8} y={Number(Y(maus)) - 8} className="kt-text kt-text--maus">
              X{zahl(maus.r * 2)} Z{zahl(maus.z)}</text>
          </>
        )}
      </svg>
    </div>
  );
}
