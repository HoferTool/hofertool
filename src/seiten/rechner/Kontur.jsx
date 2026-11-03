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
import { fensterOeffnen } from "../../teile/Fenster.jsx";
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
  const [gespeichert, setGespeichert] = useState(null);
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

  // Als Textdatei, etwa für den USB-Stick an der Maschine
  const herunterladen = () => {
    const name = (k.name || "kontur").replace(/[^\w.-]+/g, "_");
    const url = URL.createObjectURL(new Blob([code.replace(/\n/g, "\r\n") + "\r\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = name + ".nc"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Ende der Kontur, damit ein Klick beim Zeichnen weiss, von wo aus
  const ende = kontur.segmente.length ? kontur.segmente[kontur.segmente.length - 1].b
    : { z: Number(k.startZ) || 0, r: (Number(k.startX) || 0) / 2 };
  const punktSetzen = (z, r, genau) => {
    const el = neuesElement("gerade");
    // Mit der Maus: fast waagrecht oder senkrecht gilt als genau waagrecht
    // oder senkrecht. Eingetippte Werte gelten so, wie sie sind.
    const dz = z - ende.z, dr = r - ende.r;
    if (!genau && Math.abs(dr) > 1e-6 && Math.abs(dz) / Math.abs(dr) > 12) r = ende.r;
    if (!genau && Math.abs(dz) > 1e-6 && Math.abs(dr) / Math.abs(dz) > 12) z = ende.z;
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
            <div className="karte__kopf"><h2>Kontur</h2><Konturliste k={k} aendern={aendern} code={code} gespeichert={gespeichert} setGespeichert={setGespeichert} /></div>
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
              {zeichnen ? " · Klick setzt den nächsten Punkt (Raster 0,1 mm), Tab springt in X und Z" : " · Klick auf ein Element wählt es"}
            </p>
            {fehler.length > 0 && <div className="kt-fehler" id="kt-fehler">{fehler.map((f) => <div key={f}>{f}</div>)}</div>}
          </section>

          <section className="karte">
            <div className="karte__kopf"><h2>NC-Programm</h2>
              <span className="kt-dateien">
                <button className="linkknopf" id="kt-datei" onClick={herunterladen}>Als Datei</button>
                <button className="linkknopf" id="kt-kopieren" onClick={kopieren}>Kopieren</button></span></div>
            {gespeichert && (gespeichert.nc === code
              ? <p className="klein" id="kt-stand">Gespeichert als „{gespeichert.name}“ am {alt.datumZeitKurz(gespeichert.geaendert_am)}.</p>
              : <p className="kt-fehler" id="kt-stand">Geändert seit dem Speichern als „{gespeichert.name}“. Nochmals „Speichern“, damit das neue Programm gilt.
                {" "}<button className="linkknopf" id="kt-alt" onClick={() => fensterOeffnen((zu) => (
                  <div className="dialog"><h2>Gespeichertes Programm „{gespeichert.name}“</h2>
                    <pre className="gcode">{gespeichert.nc}</pre>
                    <div className="dialog__knoepfe"><button className="knopf" onClick={zu}>Schliessen</button></div></div>))}>
                  Gespeichertes ansehen</button></p>)}
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

// Gespeicherte Konturen samt erzeugtem NC-Programm in der Tabelle
// „konturen“ (seit 1.356.0, sql/konturen.sql), für alle ausser Externen
// und Dienst an jedem Gerät. Ohne Tabelle bleibt es beim Konto.
const TABELLE = "konturen";
const ohneTabelle = (e) => e && /konturen|relation|schema cache|PGRST205|42P01/i.test((e.message || "") + (e.code || ""));

async function leuteNamen(ids) {
  const leute = {};
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return leute;
  const { data } = await alt.db.from("profiles").select("id, full_name, email").in("id", u);
  (data || []).forEach((p) => { leute[p.id] = p.full_name || p.email || ""; });
  return leute;
}

function ListeFenster({ zeilen, zu, oeffnen, loeschen }) {
  const [suche, setSuche] = useState("");
  const [liste, setListe] = useState(zeilen);
  const w = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const passend = liste.filter((z) => w.every((x) => (z.name + " " + (z.wer || "")).toLowerCase().includes(x)));
  return (
    <div className="dialog kt-liste-fenster"><h2>Gespeicherte Konturen</h2>
      <input type="text" data-fokus placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} id="kt-suche" />
      <div className="kt-gespeichert">
        {passend.length === 0 && <p className="klein">Keine Kontur gefunden.</p>}
        {passend.map((z) => (
          <div key={z.id} className="kt-gesp" data-ktgesp={z.name}>
            <button className="kt-gesp__name" onClick={() => { oeffnen(z); zu(); }}>
              <b>{z.name}</b>
              <span className="klein">{z.geaendert_am ? alt.datumZeitKurz(z.geaendert_am) : ""}{z.wer ? " · " + z.wer : ""}</span>
            </button>
            <button className="kt-weg" title="Löschen" data-ktgespweg={z.name}
              onClick={async () => { if (await loeschen(z)) setListe((l) => l.filter((x) => x.id !== z.id)); }}>✕</button>
          </div>
        ))}
      </div>
      <div className="dialog__knoepfe"><button className="knopf knopf--still" onClick={zu}>Schliessen</button></div>
    </div>
  );
}

function Konturliste({ k, aendern, code, gespeichert, setGespeichert }) {
  const kontoListe = () => { try { return JSON.parse(alt.einstellungWert("konturliste", "[]")) || []; } catch (e) { return []; } };
  const daten = () => { const d = { ...k }; delete d.name; return d; };

  const sichern = async () => {
    const w = await alt.dialogFelder({ titel: "Kontur speichern",
      text: "Gespeichert wird die Kontur mit dem jetzt erzeugten NC-Programm, für alle sichtbar.",
      felder: [{ name: "name", label: "Name, z. B. HOCO Nr.", pflicht: true, wert: k.name || "" }], bestaetigen: "Speichern" });
    if (!w) return;
    const name = w.name.trim();
    const { data: da, error: fl } = await alt.db.from(TABELLE).select("id, name, geaendert_am, geaendert_von").ilike("name", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (fl && ohneTabelle(fl)) {
      // Ohne Tabelle: wie bisher am Konto
      const liste = kontoListe().filter((x) => x.name !== name);
      alt.einstellungSetzenWert("konturliste", JSON.stringify([...liste, { ...k, name, nc: code }]));
      aendern({ name });
      alt.meldung("Kontur „" + name + "“ an deinem Konto gespeichert.", "gut");
      return;
    }
    // Zwei Personen an zwei PCs (Frage Patrick 3. November 2026): Hat
    // jemand dieselbe Kontur gespeichert, seit sie hier geöffnet wurde,
    // fragt Speichern nach, statt still zu überschreiben.
    const vonAnderem = da && da.name === k.name && gespeichert && gespeichert.id === da.id
      && gespeichert.geaendert_am !== da.geaendert_am;
    if (da && (da.name !== k.name || !gespeichert || gespeichert.id !== da.id || vonAnderem)) {
      let wer = "";
      if (vonAnderem) { const l = await leuteNamen([da.geaendert_von]); wer = l[da.geaendert_von] || "Jemand"; }
      const text = vonAnderem
        ? wer + " hat „" + da.name + "“ am " + alt.datumZeitKurz(da.geaendert_am) + " gespeichert, nachdem du sie geöffnet hast. Mit deiner Fassung überschreiben?"
        : "„" + da.name + "“ gibt es schon. Überschreiben?";
      if (!(await alt.nachfragen({ titel: vonAnderem ? "Inzwischen geändert" : "Schon vorhanden", text, bestaetigen: "Überschreiben" }))) return;
    }
    const zeile = { name, daten: daten(), nc: code };
    const r = da ? await alt.db.from(TABELLE).update(zeile).eq("id", da.id).select("id, name, nc, geaendert_am").single()
      : await alt.db.from(TABELLE).insert(zeile).select("id, name, nc, geaendert_am").single();
    if (r.error) { alt.meldung("Speichern ging nicht: " + (r.error.message || r.error), "fehler"); return; }
    aendern({ name });
    setGespeichert(r.data);
    alt.meldung("Kontur „" + name + "“ mit NC-Programm gespeichert.", "gut");
  };

  const oeffnen = async () => {
    const { data, error } = await alt.db.from(TABELLE).select("id, name, daten, nc, geaendert_am, geaendert_von")
      .order("geaendert_am", { ascending: false }).limit(500);
    let zeilen;
    if (error) {
      if (!ohneTabelle(error)) { alt.meldung("Laden ging nicht: " + (error.message || error), "fehler"); return; }
      zeilen = kontoListe().map((x, i) => ({ id: "konto" + i, name: x.name, daten: x, nc: x.nc || "", konto: true }));
    } else {
      const leute = await leuteNamen(data.map((x) => x.geaendert_von));
      zeilen = data.map((x) => ({ ...x, wer: leute[x.geaendert_von] || "" }));
    }
    if (!zeilen.length) { alt.meldung("Noch keine Kontur gespeichert.", "warn"); return; }
    fensterOeffnen((zu) => (
      <ListeFenster zeilen={zeilen} zu={zu}
        oeffnen={(z) => { aendern({ ...VORGABE, ...z.daten, name: z.name }); setGespeichert(z.konto ? null : z); }}
        loeschen={async (z) => {
          if (!(await alt.nachfragen({ titel: "Kontur löschen", text: "„" + z.name + "“ löschen?", bestaetigen: "Löschen", gefahr: true }))) return false;
          if (z.konto) {
            alt.einstellungSetzenWert("konturliste", JSON.stringify(kontoListe().filter((x) => x.name !== z.name)));
          } else {
            const r = await alt.db.from(TABELLE).delete().eq("id", z.id);
            if (r.error) { alt.meldung("Löschen ging nicht: " + (r.error.message || r.error), "fehler"); return false; }
          }
          if (gespeichert && gespeichert.id === z.id) setGespeichert(null);
          return true;
        }} />
    ));
  };

  const leeren = async () => {
    if (!(await alt.nachfragen({ titel: "Neue Kontur", text: "Die Elemente leeren?", bestaetigen: "Leeren" }))) return;
    aendern({ name: "", startX: "0", startZ: "0", elemente: [] });
    setGespeichert(null);
  };
  return (
    <div className="kt-dateien">
      {k.name && <span className="klein" id="kt-name">{k.name}</span>}
      <button className="linkknopf" id="kt-neu" onClick={leeren}>Neu</button>
      <button className="linkknopf" id="kt-oeffnen" onClick={oeffnen}>Öffnen</button>
      <button className="linkknopf" id="kt-speichern" onClick={sichern}>Speichern</button>
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
  // Beim Zeichnen die Werte auch eintippen (Wunsch Patrick 3. November
  // 2026: „in die X- und Z-Werte springen können mit Tab“, „bei der
  // Endpunkt-Anzeige“): Tab öffnet die Felder X und Z direkt an der
  // Anzeige bei der Maus, wie im CAD. Bis man tippt, laufen die Werte
  // mit der Maus mit; Tab wechselt X ↔ Z, Enter setzt den Punkt genau,
  // Escape schliesst die Felder.
  const [dyn, setDyn] = useState(null);       // { x, z, getippt } oder null
  const feldX = useRef(null), feldZ = useRef(null);
  const letzteMaus = useRef(null);
  if (maus) letzteMaus.current = maus;
  const zahlFeld = (n) => String(Math.round(n * 1000) / 1000);
  const dynOeffnen = (p) => {
    const q = p || ende;
    fokusX.current = true;
    setDyn({ x: zahlFeld(q.r * 2), z: zahlFeld(q.z), getippt: false });
  };
  // Erst nach dem Zeichnen der Felder hineinspringen, sonst geht der
  // Fokus ins Leere, wenn React noch nicht so weit ist
  const fokusX = useRef(false);
  useEffect(() => {
    if (dyn && fokusX.current && feldX.current) { fokusX.current = false; feldX.current.focus(); feldX.current.select(); }
  }, [dyn]);
  useEffect(() => { if (!zeichnen) setDyn(null); }, [zeichnen]);
  useEffect(() => {
    if (!zeichnen) return undefined;
    const taste = (e) => {
      if (e.key !== "Tab") return;
      const t = e.target;
      if (t && t.closest && t.closest(".kt-dyn")) return;   // in den Feldern selbst
      // Über der Grafik gilt Tab immer der Zeichnung, sonst nur, wenn
      // nicht gerade in einem anderen Feld geschrieben wird
      if (!maus && t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      dynOeffnen(maus);
    };
    document.addEventListener("keydown", taste, true);
    return () => document.removeEventListener("keydown", taste, true);
  }, [zeichnen, maus, ende.z, ende.r]);
  useEffect(() => {
    if (dyn && !dyn.getippt && maus) setDyn((d) => d && !d.getippt ? { ...d, x: zahlFeld(maus.r * 2), z: zahlFeld(maus.z) } : d);
  }, [maus]);
  const eingabeSetzen = () => {
    const x = dyn.x.trim() === "" ? null : Number(dyn.x.replace(",", "."));
    const z = dyn.z.trim() === "" ? null : Number(dyn.z.replace(",", "."));
    if ((x === null && z === null) || Number.isNaN(x) || Number.isNaN(z)) { alt.meldung("X oder Z eingeben.", "warn"); return; }
    punktSetzen(z === null ? ende.z : z, x === null ? ende.r : x / 2, true);
    fokusX.current = true;
    setDyn({ x: "", z: "", getippt: false, nach: { z: z === null ? ende.z : z, r: x === null ? ende.r : x / 2 } });
  };
  const dynTaste = (e) => {
    if (e.key === "Enter") { e.preventDefault(); eingabeSetzen(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDyn(null); }
    else if (e.key === "Tab") {
      e.preventDefault(); e.stopPropagation();
      const nach = e.target === feldX.current ? feldZ.current : feldX.current;
      if (nach) { nach.focus(); nach.select(); }
    }
  };
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
      <div className="kt-bildrahmen">
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
      {zeichnen && dyn && (() => {
        // Verlässt die Maus die Grafik (etwa zum Feld hin), bleiben die
        // Felder an der letzten Stelle, statt zum Konturende zu springen
        const ort = (dyn.getippt && dyn.ort) || maus || letzteMaus.current || ende;
        const lx = Math.min(78, Number(X(ort)) / B * 100), ly = Math.min(80, Number(Y(ort)) / H * 100);
        return (
          <div className="kt-dyn" style={{ left: lx + "%", top: ly + "%" }} onKeyDown={dynTaste}
            onClick={(e) => e.stopPropagation()}>
            <label><span>X Ø</span>
              <input ref={feldX} type="text" inputMode="decimal" id="kt-ein-x" value={dyn.x} placeholder="gleich"
                onChange={(e) => setDyn({ ...dyn, x: e.target.value, getippt: true, ort })} /></label>
            <label><span>Z</span>
              <input ref={feldZ} type="text" inputMode="decimal" id="kt-ein-z" value={dyn.z} placeholder="gleich"
                onChange={(e) => setDyn({ ...dyn, z: e.target.value, getippt: true, ort })} /></label>
            <button className="kt-dyn__ok" id="kt-ein-setzen" title="Punkt setzen (Enter)" onClick={eingabeSetzen}>↵</button>
          </div>
        );
      })()}
      </div>
      {zeichnen && (
        <div className="kt-eingabe">
          <span className="klein">Tab: X und Z eintippen · Enter setzt den Punkt · Escape schliesst</span>
          {!dyn && <button className="knopf knopf--klein" id="kt-ein-auf" onClick={() => dynOeffnen(null)}>⌨ Punkt eintippen</button>}
        </div>
      )}
    </div>
  );
}
