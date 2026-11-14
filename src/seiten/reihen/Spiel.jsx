// =================================================================
//  1×1 RIDER (seit 1.546.0, Wunsch Patrick 14. November 2026)
//  Reihen 1 bis 9 auf Tempo wie im Schultest: eine Aufgabe, 3 Sekunden
//  (einstellbar), dann kommt die nächste. Als Snowboard-Abfahrt in 3D:
//  das Tor mit der Aufgabe fährt auf den Fahrer zu, richtig = Sprung mit
//  Drehung, falsch = Sturz und die Lösung steht da. Punkte, Serien mit
//  Multiplikator, Levels mit Rängen und Ausrüstung, Tage am Stück,
//  Fehler gezielt üben. Nur für Patrick Ruch (Vermerk reihenSehen).
//  Läuft als Ebene über der ganzen App (Portal), damit auf iPad und
//  Handy die ganze Fläche fürs Spiel da ist.
// =================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { weltBauen } from "./welt.js";
import { reihenAllein } from "./allein.js";
import { TON, entsperren, tonAn } from "./ton.js";
import {
  REIHEN, ZEITEN, ANZAHLEN, SKINS, SERIEN_TEXT, standLaden, standSpeichern, levelAus, rang, skinVon,
  rundeBauen, antwortMerken, punkteFuer, multiplikator, fehlerListe, eintrag, tagZaehlen,
} from "./logik.js";
import "./reihen.css";

const zahl = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

export default function Spiel() {
  const canvasRef = useRef(null), weltRef = useRef(null);
  const [stand, setStand] = useState(() => standLaden());
  const standRef = useRef(stand); standRef.current = stand;
  const [schirm, setSchirm] = useState("menu");     // menu | zaehlen | fahrt | ende
  const [panel, setPanel] = useState(null);         // reihen | garage | null
  const [pause, setPause] = useState(false);
  const [zaehler, setZaehler] = useState(3);
  const [frage, setFrage] = useState(null);
  const [eingabe, setEingabe] = useState("");
  const [rueck, setRueck] = useState(null);         // {art: gut|schlecht, text, punkte}
  const [toast, setToast] = useState(null);
  const [lauf, setLauf] = useState(null);           // Werte der laufenden Runde
  const [ergebnis, setErgebnis] = useState(null);
  const [kein3d, setKein3d] = useState(false);
  const balkenRef = useRef(null);
  const r = useRef({});                             // Zeit und Ablauf ohne neu zeichnen

  const einst = stand.einst;
  const lv = levelAus(stand.xp);
  const skin = skinVon(stand.skin);

  // ---------- 3D-Welt ----------
  useEffect(() => {
    let w = null;
    try { w = weltBauen(canvasRef.current); } catch (e) { setKein3d(true); }
    weltRef.current = w;
    if (w) w.skin(skinVon(standRef.current.skin));
    document.body.classList.add("rr-offen");
    return () => { document.body.classList.remove("rr-offen"); if (w) w.zerstoeren(); weltRef.current = null; clearTimeout(r.current.warte); };
  }, []);
  useEffect(() => { if (weltRef.current) weltRef.current.skin(skin); }, [skin]);
  // Wo zwischen Aufgabe und Zifferblock Platz für den Fahrer ist
  useEffect(() => {
    if (schirm !== "fahrt") { if (weltRef.current) weltRef.current.frei(0, 0); return; }
    const messen = () => {
      const c = canvasRef.current, w = weltRef.current; if (!c || !w) return;
      const cr = c.getBoundingClientRect(), fr = document.querySelector(".rr-frage"), zf = document.querySelector("[data-rr-ziffern]");
      const oben = fr ? fr.getBoundingClientRect().bottom - cr.top : 0;
      let unten = cr.height;
      if (zf) { const z = zf.getBoundingClientRect(), mitte = cr.left + cr.width / 2; if (z.left < mitte && z.right > mitte) unten = z.top - cr.top; }
      w.frei(oben, unten);
    };
    const z1 = setTimeout(messen, 60), z2 = setTimeout(messen, 400);
    window.addEventListener("resize", messen);
    return () => { clearTimeout(z1); clearTimeout(z2); window.removeEventListener("resize", messen); };
  }, [schirm]);
  useEffect(() => { tonAn(einst.ton); }, [einst.ton]);

  const aendern = (fn) => setStand((s) => { const n = structuredClone(s); fn(n); standSpeichern(n, false); return n; });
  const einstSetzen = (teil) => aendern((s) => Object.assign(s.einst, teil));

  // ---------- Ablauf einer Runde ----------
  const naechste = useCallback(() => {
    const R = r.current;
    R.i++;
    if (R.i >= R.fragen.length) { beenden(); return; }
    const f = R.fragen[R.i];
    R.frage = f; R.eingabe = ""; R.start = performance.now(); R.pausiert = 0; R.offen = true;
    setFrage(f); setEingabe(""); setRueck(null);
    setLauf({ nr: R.i + 1, von: R.fragen.length, punkte: R.punkte, serie: R.serie, richtig: R.richtig });
    if (weltRef.current) weltRef.current.tor(f.a + " × " + f.b, R.zeit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const antworten = useCallback((richtig, zeitAus) => {
    const R = r.current;
    if (!R.offen) return;
    R.offen = false;
    const f = R.frage, ms = performance.now() - R.start - R.pausiert;
    const s = standRef.current;
    antwortMerken(s, f, richtig, ms);
    if (richtig) {
      const { punkte } = punkteFuer(ms, R.zeit, R.serie);
      R.serie++; R.richtig++; R.punkte += punkte; R.zeiten.push(ms);
      R.besteSerie = Math.max(R.besteSerie, R.serie);
      TON.richtig(R.serie);
      if (weltRef.current) weltRef.current.richtig(f.a + " × " + f.b + " = " + f.loesung, R.serie);
      const text = ms < 1000 ? "BLITZ!" : ms < 1800 ? "SCHNELL!" : "RICHTIG!";
      setRueck({ art: "gut", text, punkte });
      if (SERIEN_TEXT[R.serie]) { TON.serie(); setToast({ text: SERIEN_TEXT[R.serie], id: Date.now() }); }
      R.warte = setTimeout(naechste, 700);
    } else {
      R.fehler.push(f); R.serie = 0;
      TON.falsch();
      if (weltRef.current) weltRef.current.falsch(f.a + " × " + f.b + " = " + f.loesung);
      setRueck({ art: "schlecht", text: zeitAus ? "ZEIT UM!" : "AUTSCH!", loesung: f.a + " × " + f.b + " = " + f.loesung });
      R.warte = setTimeout(naechste, 1900);
    }
    setLauf({ nr: R.i + 1, von: R.fragen.length, punkte: R.punkte, serie: R.serie, richtig: R.richtig });
  }, [naechste]);

  // Zeitbalken und Zeit um, ohne React jedes Bild neu zu zeichnen
  useEffect(() => {
    if (schirm !== "fahrt") return;
    let raf = 0, letzterTick = -1;
    const lauf = () => {
      raf = requestAnimationFrame(lauf);
      const R = r.current;
      if (!R.offen || !R.zeit) { if (balkenRef.current && !R.zeit) balkenRef.current.style.transform = "scaleX(1)"; return; }
      if (R.pausiertSeit) return;
      const rest = 1 - (performance.now() - R.start - R.pausiert) / (R.zeit * 1000);
      if (balkenRef.current) {
        balkenRef.current.style.transform = "scaleX(" + Math.max(0, rest) + ")";
        balkenRef.current.dataset.knapp = rest < 0.34 ? "1" : "";
      }
      const sek = Math.ceil(rest * R.zeit);
      if (rest < 0.34 && sek !== letzterTick) { letzterTick = sek; TON.tick(); }
      if (rest <= 0) antworten(false, true);
    };
    raf = requestAnimationFrame(lauf);
    return () => cancelAnimationFrame(raf);
  }, [schirm, antworten]);

  function starten(nurFehler) {
    entsperren();
    const s = standRef.current;
    const reihen = s.einst.reihen.length ? s.einst.reihen : REIHEN;
    r.current = {
      fragen: rundeBauen(s, reihen, s.einst.anzahl, nurFehler), i: -1, zeit: s.einst.zeit, nurFehler,
      punkte: 0, serie: 0, besteSerie: 0, richtig: 0, fehler: [], zeiten: [], offen: false, lvVorher: levelAus(s.xp).level,
    };
    setPanel(null); setErgebnis(null); setPause(false); setRueck(null); setToast(null);
    if (weltRef.current) { weltRef.current.modus("fahrt"); weltRef.current.serie(0); }
    setSchirm("zaehlen");
    let n = 3; setZaehler(3); TON.zaehlen(false);
    const takt = () => {
      n--;
      if (n > 0) { setZaehler(n); TON.zaehlen(false); r.current.warte = setTimeout(takt, 650); }
      else if (n === 0) { setZaehler("LOS!"); TON.zaehlen(true); r.current.warte = setTimeout(takt, 500); }
      else { setSchirm("fahrt"); naechste(); }
    };
    r.current.warte = setTimeout(takt, 650);
  }

  function beenden() {
    const R = r.current;
    R.offen = false;
    const s = structuredClone(standRef.current);
    // antwortMerken schrieb in standRef.current; die Kopie hat alles
    const anzahl = R.fragen.length, quote = anzahl ? R.richtig / anzahl : 0;
    // Fürs Mitfahren gibt es immer 20 XP, damit auch eine schwache Runde etwas bringt
    const xp = Math.round(R.punkte / 10) + 20 + (quote === 1 ? 50 : 0);
    const vorher = levelAus(s.xp).level;
    s.xp += xp; s.runden++; s.richtigTotal += R.richtig;
    const neuRekord = R.punkte > s.punkteRekord;
    s.punkteRekord = Math.max(s.punkteRekord, R.punkte);
    s.serieRekord = Math.max(s.serieRekord, R.besteSerie);
    const schnitt = R.zeiten.length ? R.zeiten.reduce((a, b) => a + b, 0) / R.zeiten.length : 0;
    tagZaehlen(s);
    standSpeichern(s, true);
    setStand(s);
    const nachher = levelAus(s.xp).level;
    const neueSkins = SKINS.filter((k) => k.ab > vorher && k.ab <= nachher);
    setErgebnis({
      anzahl, richtig: R.richtig, quote, punkte: R.punkte, xp, besteSerie: R.besteSerie, schnitt, neuRekord,
      levelUp: nachher > vorher ? nachher : 0, neueSkins, fehler: R.fehler,
      sterne: quote === 1 ? 3 : quote >= 0.85 ? 2 : quote >= 0.6 ? 1 : 0,
    });
    if (weltRef.current) weltRef.current.modus("ende");
    setSchirm("ende"); setFrage(null); setRueck(null);
    TON.sieg(); if (nachher > vorher) setTimeout(() => TON.levelUp(), 1300);
  }

  const pausieren = useCallback((w) => {
    const R = r.current;
    if (w && !R.pausiertSeit) R.pausiertSeit = performance.now();
    if (!w && R.pausiertSeit) { R.pausiert += performance.now() - R.pausiertSeit; R.pausiertSeit = 0; }
    setPause(w);
    if (weltRef.current) weltRef.current.pause(w);
  }, []);

  function abbrechen() {
    clearTimeout(r.current.warte); r.current.offen = false; r.current.pausiertSeit = 0;
    setPause(false); if (weltRef.current) { weltRef.current.pause(false); weltRef.current.modus("menu"); }
    setSchirm("menu"); setFrage(null); setRueck(null); setToast(null);
  }

  // ---------- Eingabe ----------
  const taste = useCallback((d) => {
    const R = r.current;
    if (!R.offen || R.pausiertSeit) return;
    if (d === "weg") { R.eingabe = R.eingabe.slice(0, -1); setEingabe(R.eingabe); TON.taste(); return; }
    if (d === "ok") { if (R.eingabe) antworten(Number(R.eingabe) === R.frage.loesung, false); return; }
    if (R.eingabe.length >= 3) return;
    R.eingabe += d; setEingabe(R.eingabe); TON.taste();
    const l = String(R.frage.loesung);
    // Stimmt die Zahl, gleich weiter; hat sie so viele Ziffern wie die
    // Lösung und stimmt nicht, ist sie falsch. Wie aufschreiben: kein OK nötig.
    if (Number(R.eingabe) === R.frage.loesung) antworten(true, false);
    else if (R.eingabe.length >= l.length) antworten(false, false);
  }, [antworten]);

  // Tastatur am Computer; Escape geht Schritt für Schritt zurück
  useEffect(() => {
    const k = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (schirm === "fahrt" || schirm === "zaehlen") { if (schirm === "fahrt") pausieren(!r.current.pausiertSeit); else abbrechen(); }
        else if (panel) setPanel(null);
        else if (schirm === "ende") abbrechen();
        else if (!reihenAllein) location.hash = "#/dashboard";
        return;
      }
      if (schirm !== "fahrt") { if (e.key === "Enter" && schirm === "menu" && !panel) { e.preventDefault(); starten(false); } return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); taste(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); taste("weg"); }
      else if (e.key === "Enter") { e.preventDefault(); taste("ok"); }
      else if (e.key === "p" || e.key === "P") pausieren(!r.current.pausiertSeit);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });
  // Wechselt das iPad den Tab oder geht der Bildschirm aus: Pause
  useEffect(() => {
    const v = () => { if (document.hidden && schirm === "fahrt") pausieren(true); };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [schirm, pausieren]);

  useEffect(() => { if (!toast) return; const z = setTimeout(() => setToast(null), 1400); return () => clearTimeout(z); }, [toast]);

  const fehlerZahl = useMemo(() => fehlerListe(stand).length, [stand]);

  const inhalt = (
    <div className={"rr hell-bleibt rr--" + schirm + (pause ? " rr--pause" : "")} data-rr={schirm}>
      <canvas ref={canvasRef} className="rr-welt" />
      {kein3d && <div className="rr-welt rr-welt--ersatz" />}

      {schirm === "menu" && (
        <Menue stand={stand} lv={lv} einst={einst} einstSetzen={einstSetzen} fehlerZahl={fehlerZahl}
          starten={starten} panel={panel} setPanel={setPanel} skin={skin}
          skinWaehlen={(id) => aendern((s) => { s.skin = id; })} />
      )}

      {schirm === "zaehlen" && <div className="rr-zaehler" key={zaehler}>{zaehler}</div>}

      {schirm === "fahrt" && frage && lauf && (
        <>
          <div className="rr-hud">
            <button className="rr-rund" data-rr-pause onPointerDown={(e) => { e.preventDefault(); pausieren(true); }} aria-label="Pause">⏸</button>
            <div className="rr-fortschritt"><b>{lauf.nr}</b> / {lauf.von}</div>
            <div className="rr-punkte" key={lauf.punkte}>{zahl(lauf.punkte)}<small>PUNKTE</small></div>
          </div>
          <div className="rr-mitte">
            {lauf.serie >= 2 && (
              <div className={"rr-serie" + (lauf.serie >= 5 ? " rr-serie--feuer" : "")} key={"s" + lauf.serie}>
                🔥 {lauf.serie} {multiplikator(lauf.serie) > 1 && <b>×{multiplikator(lauf.serie)}</b>}
              </div>
            )}
            <div className={"rr-frage" + (rueck ? " rr-frage--" + rueck.art : "")} key={"f" + lauf.nr}>
              <div className="rr-frage__text" data-rr-frage>{frage.a} × {frage.b}</div>
              <div className="rr-zeit"><i ref={balkenRef} /></div>
              <div className="rr-antwort" data-rr-antwort>{rueck && rueck.art === "schlecht" ? rueck.loesung : (eingabe || " ")}</div>
            </div>
            {rueck && <div className={"rr-rueck rr-rueck--" + rueck.art} key={"r" + lauf.nr}>{rueck.text}{rueck.punkte ? <b>+{zahl(rueck.punkte)}</b> : null}</div>}
            {toast && <div className="rr-toast" key={toast.id}>{toast.text}</div>}
          </div>
          <Ziffern taste={taste} />
          {pause && (
            <div className="rr-pause">
              <div className="rr-karte">
                <h2>PAUSE</h2>
                <button className="rr-knopf rr-knopf--gross" onClick={() => pausieren(false)}>▶ Weiter</button>
                <button className="rr-knopf rr-knopf--grau" onClick={abbrechen}>Runde beenden</button>
              </div>
            </div>
          )}
        </>
      )}

      {schirm === "ende" && ergebnis && (
        <Ende e={ergebnis} stand={stand} lv={lv} nochmal={() => starten(r.current.nurFehler)}
          fehlerUeben={() => starten(true)} menue={abbrechen} />
      )}
    </div>
  );
  return createPortal(inhalt, document.body);
}

function Ziffern({ taste }) {
  const tippen = (d) => (e) => { e.preventDefault(); taste(d); };
  return (
    <div className="rr-ziffern" data-rr-ziffern>
      {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
        <button key={d} className="rr-ziffer" data-rr-ziffer={d} onPointerDown={tippen(d)}>{d}</button>
      ))}
      <button className="rr-ziffer rr-ziffer--weg" data-rr-ziffer="weg" onPointerDown={tippen("weg")} aria-label="Löschen">⌫</button>
      <button className="rr-ziffer" data-rr-ziffer="0" onPointerDown={tippen("0")}>0</button>
      <button className="rr-ziffer rr-ziffer--ok" data-rr-ziffer="ok" onPointerDown={tippen("ok")}>OK</button>
    </div>
  );
}

function LevelAnzeige({ stand, lv }) {
  return (
    <div className="rr-level">
      <div className="rr-level__zahl"><small>LEVEL</small>{lv.level}</div>
      <div className="rr-level__rest">
        <b>{rang(lv.level)}</b>
        <div className="rr-xp"><i style={{ width: Math.round(lv.anteil * 100) + "%" }} /></div>
        <small>{zahl(stand.xp - lv.von)} / {zahl(lv.bis - lv.von)} XP</small>
      </div>
    </div>
  );
}

function Menue({ stand, lv, einst, einstSetzen, fehlerZahl, starten, panel, setPanel, skin, skinWaehlen }) {
  const reihe = (n) => {
    const da = einst.reihen.includes(n);
    einstSetzen({ reihen: da ? einst.reihen.filter((x) => x !== n) : einst.reihen.concat(n).sort() });
  };
  const alle = einst.reihen.length === 9;
  return (
    <>
      <div className="rr-oben">
        <LevelAnzeige stand={stand} lv={lv} />
        <div className="rr-oben__rechts">
          {stand.tage.serie > 0 && <div className="rr-chip" title="Tage am Stück">🔥 {stand.tage.serie} {stand.tage.serie === 1 ? "Tag" : "Tage"}</div>}
          <button className="rr-rund" onClick={() => einstSetzen({ ton: !einst.ton })} aria-label="Ton">{einst.ton ? "🔊" : "🔇"}</button>
          {!reihenAllein && <button className="rr-rund" data-rr-zu onClick={() => { location.hash = "#/dashboard"; }} aria-label="Schliessen">✕</button>}
        </div>
      </div>
      <div className="rr-menue">
        <h1 className="rr-titel">BESER<br /><span>REIHEN</span> LERNEN</h1>
        <div className="rr-rekorde">
          <span>🏆 {zahl(stand.punkteRekord)}</span><span>⚡ Serie {stand.serieRekord}</span><span>🏂 {stand.runden} Runden</span>
        </div>
        <button className="rr-knopf rr-knopf--gross rr-los" data-rr-los onClick={() => starten(false)}>LOS GEHT'S!</button>
        <div className="rr-wahl">
          <div className="rr-wahl__titel">Reihen</div>
          <div className="rr-chips">
            {REIHEN.map((n) => (
              <button key={n} className={"rr-wahlknopf" + (einst.reihen.includes(n) ? " an" : "")} data-rr-reihe={n} onClick={() => reihe(n)}>{n}er</button>
            ))}
            <button className={"rr-wahlknopf" + (alle ? " an" : "")} onClick={() => einstSetzen({ reihen: alle ? [] : REIHEN.slice() })}>Alle</button>
          </div>
          <div className="rr-wahl__titel">Zeit pro Aufgabe</div>
          <div className="rr-chips">
            {ZEITEN.map((z) => (
              <button key={z} className={"rr-wahlknopf" + (einst.zeit === z ? " an" : "")} data-rr-zeit={z} onClick={() => einstSetzen({ zeit: z })}>{z ? z + " s" : "∞ Üben"}</button>
            ))}
          </div>
          <div className="rr-wahl__titel">Aufgaben</div>
          <div className="rr-chips">
            {ANZAHLEN.map((n) => (
              <button key={n} className={"rr-wahlknopf" + (einst.anzahl === n ? " an" : "")} data-rr-anzahl={n} onClick={() => einstSetzen({ anzahl: n })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="rr-reihe-knoepfe">
          <button className="rr-knopf rr-knopf--rot" data-rr-fehler disabled={!fehlerZahl} onClick={() => starten(true)}>
            🎯 Fehler-Training{fehlerZahl ? " (" + fehlerZahl + ")" : ""}
          </button>
          <button className="rr-knopf rr-knopf--blau" onClick={() => setPanel("reihen")}>📊 Meine Reihen</button>
          <button className="rr-knopf rr-knopf--schwarz" data-rr-garage onClick={() => setPanel("garage")}>🏂 Garage</button>
        </div>
      </div>
      {panel === "reihen" && <MeineReihen stand={stand} zu={() => setPanel(null)} />}
      {panel === "garage" && <Garage lv={lv} skin={skin} waehlen={skinWaehlen} zu={() => setPanel(null)} />}
    </>
  );
}

function stufe(e) {
  if (!e.r && !e.f) return "neu";
  if (e.m >= 4.5) return "top";
  if (e.m >= 3) return "gut";
  if (e.m >= 1) return "mittel";
  return "schwach";
}

function MeineReihen({ stand, zu }) {
  return (
    <div className="rr-panel" onClick={zu}>
      <div className="rr-karte rr-karte--breit" onClick={(e) => e.stopPropagation()}>
        <button className="rr-rund rr-karte__zu" onClick={zu}>✕</button>
        <h2>Meine Reihen</h2>
        <p className="rr-klein">Grün = sitzt, Orange = fast, Rot = üben. Schnell richtig zählt doppelt.</p>
        <div className="rr-raster">
          {REIHEN.map((rr) => {
            const felder = Array.from({ length: 10 }, (_, i) => eintrag(stand, i + 1, rr));
            const gut = felder.filter((e) => e.m >= 3).length;
            return (
              <div className="rr-raster__zeile" key={rr}>
                <div className="rr-raster__kopf">{rr}er<small>{gut * 10}%</small></div>
                {felder.map((e, i) => (
                  <div key={i} className={"rr-feld rr-feld--" + stufe(e)} title={(i + 1) + " × " + rr + " = " + (i + 1) * rr}>
                    <b>{(i + 1) * rr}</b><small>{i + 1}×{rr}</small>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function farbe(hex) { return "#" + hex.toString(16).padStart(6, "0"); }

function Garage({ lv, skin, waehlen, zu }) {
  return (
    <div className="rr-panel" onClick={zu}>
      <div className="rr-karte rr-karte--breit" onClick={(e) => e.stopPropagation()}>
        <button className="rr-rund rr-karte__zu" onClick={zu}>✕</button>
        <h2>Garage</h2>
        <p className="rr-klein">Neue Ausrüstung gibt es mit jedem Level. Du bist Level {lv.level}.</p>
        <div className="rr-skins">
          {SKINS.map((k) => {
            const frei = lv.level >= k.ab;
            return (
              <button key={k.id} data-rr-skin={k.id} className={"rr-skin" + (k.id === skin.id ? " an" : "") + (frei ? "" : " zu")}
                disabled={!frei} onClick={() => waehlen(k.id)}>
                <span className="rr-skin__bild">
                  <i style={{ background: farbe(k.helm) }} /><i style={{ background: farbe(k.jacke) }} /><i style={{ background: farbe(k.hose) }} />
                  <i className="rr-skin__brett" style={{ background: "linear-gradient(90deg," + farbe(k.brett) + " 35%," + farbe(k.brett2) + " 35% 65%," + farbe(k.brett) + " 65%)" }} />
                </span>
                <b>{k.name}</b>
                <small>{frei ? (k.id === skin.id ? "Gewählt" : "Wählen") : "🔒 ab Level " + k.ab}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Ende({ e, stand, lv, nochmal, fehlerUeben, menue }) {
  const titel = e.quote >= 0.9 ? "VICTORY!" : e.quote >= 0.7 ? "STARK GEFAHREN!" : "WEITER SO!";
  return (
    <div className="rr-ende">
      <div className="rr-karte rr-karte--ende">
        <div className="rr-ende__platz">{e.quote >= 0.9 ? "#1" : e.quote >= 0.7 ? "TOP 3" : "TOP 10"}</div>
        <h2 className="rr-ende__titel" data-rr-ende>{titel}</h2>
        <div className="rr-sterne">{[0, 1, 2].map((i) => <span key={i} className={i < e.sterne ? "an" : ""} style={{ animationDelay: (0.3 + i * 0.25) + "s" }}>★</span>)}</div>
        {e.neuRekord && e.punkte > 0 && <div className="rr-rekord">🏆 NEUER REKORD!</div>}
        <div className="rr-werte">
          <div><b>{e.richtig}/{e.anzahl}</b><small>richtig</small></div>
          <div><b>{zahl(e.punkte)}</b><small>Punkte</small></div>
          <div><b>{e.besteSerie}</b><small>beste Serie</small></div>
          <div><b>{e.schnitt ? (e.schnitt / 1000).toFixed(1) + " s" : "–"}</b><small>Ø Zeit</small></div>
        </div>
        <div className="rr-xpzeile">+{zahl(e.xp)} XP</div>
        <LevelAnzeige stand={stand} lv={lv} />
        {e.levelUp > 0 && <div className="rr-levelup">LEVEL UP! Level {e.levelUp} · {rang(e.levelUp)}</div>}
        {e.neueSkins.length > 0 && <div className="rr-neu">Neu in der Garage: {e.neueSkins.map((k) => k.name).join(", ")}</div>}
        {e.fehler.length > 0 && (
          <div className="rr-fehlerliste">
            <small>Diese üben wir noch:</small>
            <div>{[...new Map(e.fehler.map((f) => [f.a + "x" + f.b, f])).values()].map((f) => <span key={f.a + "x" + f.b}>{f.a} × {f.b} = <b>{f.loesung}</b></span>)}</div>
          </div>
        )}
        <div className="rr-ende__knoepfe">
          <button className="rr-knopf rr-knopf--gross" data-rr-nochmal onClick={nochmal}>NOCHMAL!</button>
          {e.fehler.length > 0 && <button className="rr-knopf rr-knopf--rot" onClick={fehlerUeben}>🎯 Fehler üben</button>}
          <button className="rr-knopf rr-knopf--grau" onClick={menue}>Menü</button>
        </div>
      </div>
    </div>
  );
}
