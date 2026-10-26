// =================================================================
//  INFOBOARD
//  Seite zum Gestalten des grossen Bildschirms (Samsung, zuerst 43, jetzt
//  50 Zoll, hochkant) und die Anzeige über den ganzen Bildschirm
//  (Wunsch Patrick 20. Oktober 2026). Links die Tafel genau wie am
//  Bildschirm, rechts Knöpfe für neue Dateien und Texte und für das
//  angetippte Teil: eine Datei (PDF, Bild, Video, Excel) oder Text wie
//  in Word (TextFeld.jsx; früher die Zeichenfläche, die alte Teile noch
//  zeigen). Seit 1.132.0 ohne Raster: Dateien auf die Tafel ziehen, frei
//  verschieben, an der Ecke vergrössern, oben drehen (Tafel.jsx).
//
//  Gestalten dürfen nur Admins (auch in der Datenbank). Gerätekonten
//  („Andere Nutzer“) sehen die Seite auch, damit man am Bildschirm
//  „Dieses Gerät ist das Infoboard“ einschalten kann: Dann geht die
//  Anzeige nach jedem Anmelden und Neuladen von selbst auf.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { Tafel } from "./Tafel.jsx";
import { istNacht } from "./Nacht.jsx";
import { textBearbeiten, wordLesen, sauber } from "./TextFeld.jsx";
import { aufbauLaden, aufbauSpeichern, aufbauOrdnen, dateiHochladen, dateiTyp, fehltTabelle, neueId,
  istInfoboardGeraet, infoboardGeraetSetzen, SEKUNDEN, verhaeltnisLesen, neuesTeil, TAFELN, tafelFarben } from "./daten.js";

// 0 = nicht von selbst blättern, die Seite wechselt nur beim Antippen
// (Wunsch Patrick 21. Oktober 2026).
const WECHSEL = [[0, "Nicht selber blättern"], [10, "alle 10 Sekunden"], [20, "alle 20 Sekunden"], [30, "alle 30 Sekunden"], [60, "jede Minute"], [120, "alle 2 Minuten"]];

export function infoboardSichtbar() {
  return !alt.istExtern() && (alt.istAdmin() || alt.istAndererNutzer());
}

export default function Infoboard() { return <Gestalten mass={TAFELN.haupt} />; }

// Der Bildschirm am Empfang, quer, 1920 × 1080 (Wunsch Patrick 26. Oktober
// 2026: „einen neuen Bereich, um das Empfangsdisplay zu gestalten“). Gleich
// wie das Infoboard, nur eigene Zeile in der Tabelle und eigenes Gerät.
export function Empfang() { return <Gestalten mass={TAFELN.empfang} />; }

function Gestalten({ mass }) {
  const admin = alt.istAdmin();
  const [aufbau, setAufbau] = useState(null);
  const [fehler, setFehler] = useState("");
  const [gewaehlt, setGewaehlt] = useState(null);
  const [laedt, setLaedt] = useState("");
  const [geraet, setGeraet] = useState(() => istInfoboardGeraet(mass));
  const datei = useRef(null);
  // Wohin „Datei wählen“ die Datei legt: neues Teil oder dieses ersetzen
  const dateiZiel = useRef(null);
  const stand = useRef(null);
  stand.current = aufbau;

  useEffect(() => {
    aufbauLaden(mass.id).then((d) => setAufbau(d.aufbau), (e) => {
      setFehler(fehltTabelle(e) ? "Das Infoboard braucht noch die Datei infoboard.sql in Supabase." : alt.fehlertext(e));
      setAufbau(aufbauOrdnen(null));
    });
  }, [mass]);

  if (!aufbau) return <section className="karte"><p className="hinweis">{mass.name} wird geladen …</p></section>;

  // Immer vom neusten Stand aus ändern: mehrere Dateien auf einmal kommen
  // nacheinander an, jede soll die vorherigen behalten
  const aendern = async (machen) => {
    const vorher = stand.current;
    const neu = { ...vorher, frei: true, teile: machen(vorher.teile) };
    stand.current = neu;
    setAufbau(neu);
    try { await aufbauSpeichern(neu, mass.id); setFehler(""); }
    catch (e) {
      stand.current = vorher; setAufbau(vorher);
      alt.meldung("Nicht gespeichert: " + (fehltTabelle(e) ? "infoboard.sql fehlt in Supabase." : alt.fehlertext(e)), "fehler");
    }
  };
  // Farben nur im Aufbau, die Teile bleiben, wie sie sind
  const ganzSetzen = async (patch) => {
    const vorher = stand.current;
    const neu = { ...vorher, ...patch };
    stand.current = neu; setAufbau(neu);
    try { await aufbauSpeichern(neu, mass.id); }
    catch (e) { stand.current = vorher; setAufbau(vorher); alt.meldung("Nicht gespeichert: " + alt.fehlertext(e), "fehler"); }
  };
  const farbenSetzen = (farben) => ganzSetzen({ farben });
  const logoSetzen = (logo) => ganzSetzen({ logo });
  const teilAendern = (id, patch) => aendern((teile) => teile.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const wahl = aufbau.teile.find((t) => t.id === gewaehlt) || null;

  // Dateien auf die Tafel legen: über „Datei hinzufügen …“ oder vom
  // Computer an die gewünschte Stelle gezogen. Ersetzt ein Teil seine
  // Datei, bleiben Platz und Breite, die Höhe passt sich dem Inhalt an.
  const dateienAblegen = async (dateien, mitte, ersetzen) => {
    for (const d of dateien) {
      const typ = dateiTyp(d.name, d.type);
      if (!typ) { alt.meldung("Nur PDF, Bilder, Videos, Excel oder Word (.docx).", "warn"); continue; }
      setLaedt(d.name);
      try {
        let feld;
        if (typ === "word") feld = { art: "text", html: sauber(await wordLesen(d)) };
        else {
          const [neu, v] = await Promise.all([dateiHochladen(d), verhaeltnisLesen(d, typ)]);
          feld = { art: "datei", datei: neu, sekunden: ersetzen ? ersetzen.sekunden ?? SEKUNDEN : SEKUNDEN, verhaeltnis: v };
        }
        const v = feld.verhaeltnis || Math.SQRT2;
        delete feld.verhaeltnis;
        const id = neueId();
        if (ersetzen) {
          await aendern((teile) => teile.map((t) => (t.id === ersetzen.id
            ? { ...feld, id, x: t.x, y: t.y, w: t.w, h: Math.round(t.w * v), drehung: t.drehung } : t)));
          ersetzen = null;
        } else {
          const t = neuesTeil({ ...feld, id }, v, mitte, mass);
          await aendern((teile) => [...teile, t]);
          // Mehrere Dateien auf einmal: leicht versetzt, nicht genau übereinander
          if (mitte) mitte = { x: mitte.x + 40, y: mitte.y + 40 };
        }
        setGewaehlt(id);
      } catch (f) { alt.meldung("Hochladen ging nicht: " + alt.fehlertext(f), "fehler"); }
      finally { setLaedt(""); }
    }
  };

  const dateiGewaehlt = (e) => {
    const d = Array.from(e.target.files || []);
    e.target.value = "";
    if (d.length) dateienAblegen(d, null, dateiZiel.current);
  };
  const dateiWaehlen = (ersetzen) => { dateiZiel.current = ersetzen || null; datei.current && datei.current.click(); };

  // Text wie in Word (Wunsch Patrick 20. Oktober 2026). Neu ein A4 in der Mitte.
  // Text ohne Hintergrund (Wunsch Patrick 26. Oktober 2026): frei auf der
  // Tafel, ohne weisses Blatt, zuerst breit und flach wie eine Zeile
  const textOeffnen = async (t, ohneGrund) => {
    const frei = t ? !!t.ohneGrund : !!ohneGrund;
    const v = t ? t.h / t.w : frei ? 0.25 : Math.SQRT2;
    const format = v < 1 ? "a3" : "a4";
    const html = await textBearbeiten({ html: t && t.art === "text" ? t.html : "", format,
      seitenVerhaeltnis: v, titel: t ? "Text bearbeiten" : "Neuer Text", ohneGrund: frei, grund: tafelFarben(mass, aufbau).grund });
    if (html == null) return;
    if (t && t.art === "text") { await teilAendern(t.id, { html }); return; }
    const neu = neuesTeil({ id: neueId(), art: "text", html, ...(frei ? { ohneGrund: true } : {}) }, v, null, mass);
    await aendern((teile) => [...teile, neu]);
    setGewaehlt(neu.id);
  };

  const entfernen = async () => {
    if (!wahl) return;
    const ok = await alt.nachfragen({ titel: "Vom " + mass.name + " entfernen?",
      text: wahl.art === "skizze" ? "Die Zeichenfläche und alles darauf verschwindet vom Infoboard."
        : wahl.art === "text" ? "Der Text verschwindet vom Infoboard."
        : "Die Datei verschwindet vom Infoboard.", bestaetigen: "Entfernen", gefahr: true });
    if (!ok) return;
    if (wahl.art === "skizze") {
      alt.db.from("infoboard_skizzen").delete().eq("bereich", wahl.id).then(() => {}, () => {});
    }
    await aendern((teile) => teile.filter((t) => t.id !== wahl.id));
    setGewaehlt(null);
  };

  // Reihenfolge: was hinten in der Liste steht, liegt oben
  const ebene = (nachVorne) => wahl && aendern((teile) => {
    const rest = teile.filter((t) => t.id !== wahl.id);
    return nachVorne ? [...rest, wahl] : [wahl, ...rest];
  });

  // Ein Gerät ist höchstens ein Bildschirm
  const geraetUmschalten = (an) => {
    if (an) for (const t of Object.values(TAFELN)) infoboardGeraetSetzen(false, t);
    infoboardGeraetSetzen(an, mass); setGeraet(an);
  };

  const inhaltText = (f) => f.art === "skizze" ? "Zeichenfläche" : f.art === "text" ? "Text"
    : f.art === "datei" && f.datei ? ({ pdf: "PDF", bild: "Bild", video: "Video", excel: "Excel" }[f.datei.typ] || "Datei") + ": " + (f.datei.name || "")
    : "Leer";

  return (
    <section className={"karte ib-gestalten ib-gestalten--" + mass.id}>
      <div className="ib-gestalten__kopf">
        <h2>{mass.id === "empfang" ? "Empfang" : "Infoboard"}</h2>
        {mass.id === "empfang" && <span className="klein">Bildschirm quer, genau 1920 × 1080 Punkte</span>}
        <button type="button" className="knopf" data-ib="anzeige" onClick={() => infoboardOeffnen(true, mass)}>
          Anzeige öffnen</button>
      </div>
      {fehler && <p className="hinweis">{fehler}</p>}
      <div className="ib-gestalten__teile">
        <div className="ib-gestalten__vorschau">
          <Tafel mass={mass} aufbau={aufbau} bearbeiten={admin} gewaehlt={gewaehlt} waehlen={setGewaehlt}
            teilAendern={admin ? teilAendern : null} logoSetzen={admin ? logoSetzen : null}
            ablegen={admin && !laedt ? (dateien, punkt) => dateienAblegen(dateien, punkt, null) : null}
            doppelt={admin ? (id) => { const t = aufbau.teile.find((x) => x.id === id); if (t && t.art === "text") textOeffnen(t); } : null} />
        </div>
        <div className="ib-gestalten__seite">
          {admin && <>
            <div className="ib-wahl__knoepfe">
              <button type="button" className="knopf knopf--haupt" data-ib="neu-datei" disabled={!!laedt}
                onClick={() => dateiWaehlen(null)}>{laedt ? "Lädt " + laedt + " …" : "Datei hinzufügen …"}</button>
              <button type="button" className="knopf" data-ib="neu-text" onClick={() => textOeffnen(null, false)}>
                Text hinzufügen</button>
              <button type="button" className="knopf" data-ib="neu-text-frei" onClick={() => textOeffnen(null, true)}>
                Text ohne Hintergrund</button>
            </div>
            <input ref={datei} type="file" hidden multiple onChange={dateiGewaehlt}
              accept="application/pdf,image/*,video/*,.xlsx,.xlsm,.xls,.ods,.docx" />
            {mass.ruhig && <Farben mass={mass} aufbau={aufbau} setzen={farbenSetzen} />}
            {mass.ruhig && <p className="klein">Das Logo im Kopf lässt sich mit der Maus an eine andere Stelle ziehen.
              {aufbau.logo && <> <button type="button" className="knopf knopf--still" data-ib="logo-zurueck"
                onClick={() => logoSetzen(null)}>Logo zurück in die Mitte</button></>}</p>}
            {!wahl && <p className="klein">Dateien vom Computer einfach auf die Tafel ziehen, dorthin, wo sie hin sollen.
              Antippen wählt ein Teil: ziehen verschiebt es, die Ecke unten rechts ändert die Grösse,
              der runde Griff oben dreht es.</p>}
            {wahl &&
              <div className="ib-wahl" data-ibwahl={wahl.id}>
                <h3>{inhaltText(wahl)}</h3>
                <p className="klein ib-wahl__mass">{Math.round(wahl.w)} × {Math.round(wahl.h)} Punkte
                  {wahl.drehung ? " · gedreht um " + wahl.drehung + "°" : ""}</p>
                <div className="ib-wahl__knoepfe">
                  {wahl.art === "text"
                    ? <button type="button" className="knopf" data-ib="text" onClick={() => textOeffnen(wahl)}>Text bearbeiten</button>
                    : wahl.art === "datei" &&
                      <button type="button" className="knopf" data-ib="datei" disabled={!!laedt}
                        onClick={() => dateiWaehlen(wahl)}>Andere Datei …</button>}
                  {wahl.drehung ? <button type="button" className="knopf knopf--still" data-ib="gerade"
                    onClick={() => teilAendern(wahl.id, { drehung: 0 })}>Gerade stellen</button> : null}
                  <button type="button" className="knopf knopf--still" data-ib="vorne" onClick={() => ebene(true)}>Nach vorne</button>
                  <button type="button" className="knopf knopf--still" data-ib="hinten" onClick={() => ebene(false)}>Nach hinten</button>
                  <button type="button" className="knopf knopf--gefahr" data-ib="leeren" onClick={entfernen}>Entfernen</button>
                </div>
                {wahl.art === "text" &&
                  <label className="ib-geraet">
                    <input type="checkbox" checked={!!wahl.ohneGrund} data-ib="ohne-grund"
                      onChange={(e) => teilAendern(wahl.id, { ohneGrund: e.target.checked })} />
                    <span>Ohne Hintergrund<small>Nur der Text, ohne weisses Blatt und ohne Rand. Breite und Höhe
                      lassen sich an der Ecke frei ziehen, die Schrift richtet sich nach der Breite.</small></span>
                  </label>}
                <Drehung key={wahl.id} wert={wahl.drehung || 0} setzen={(g) => teilAendern(wahl.id, { drehung: g })} />
                {wahl.art === "datei" && wahl.datei && (wahl.datei.typ === "pdf" || wahl.datei.typ === "excel") &&
                  <label className="feld">Mehrere Seiten wechseln
                    <select value={wahl.sekunden ?? SEKUNDEN} data-ib="sekunden"
                      onChange={(e) => teilAendern(wahl.id, { sekunden: Number(e.target.value) })}>
                      {WECHSEL.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
                    </select></label>}
                <p className="klein">PDF, Bild, Video oder Excel. PDF und Excel zeigen die ganze Seite wie ausgedruckt;
                  antippen am Bildschirm zeigt die nächste. Eine Word-Datei wird zu Text, den man danach noch ändern kann.
                  Doppelklick auf einen Text öffnet ihn.</p>
              </div>}
          </>}
          <label className="ib-geraet">
            <input type="checkbox" checked={geraet} data-ib="geraet" onChange={(e) => geraetUmschalten(e.target.checked)} />
            <span>{mass.id === "empfang" ? "Dieses Gerät ist der Bildschirm am Empfang" : "Dieses Gerät ist der Infoboard-Bildschirm"}<small>Nach dem Anmelden und nach jedem Neuladen geht die Anzeige
              von selbst über den ganzen Bildschirm auf.</small></span>
          </label>
        </div>
      </div>
    </section>
  );
}

// Farben von Kopf und Hintergrund am Empfang (Wunsch Patrick 26. Oktober
// 2026: „ich möchte es einstellen können“). Der Farbwähler meldet beim
// Ziehen laufend, darum zeigt die Tafel sofort und gespeichert wird kurz
// nach dem letzten Zug.
function Farben({ mass, aufbau, setzen }) {
  const jetzt = tafelFarben(mass, aufbau);
  const uhr = useRef(null);
  useEffect(() => () => clearTimeout(uhr.current), []);
  const neu = (patch, sofort) => {
    const f = { ...jetzt, ...patch };
    document.querySelectorAll(".ib-gestalten--" + mass.id + " .ib-blatt").forEach((b) => {
      b.style.background = f.grund;
      const k = b.querySelector(".ek"); if (k) k.style.background = f.kopf;
    });
    clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setzen(f), sofort ? 0 : 400);
  };
  const vorgabe = !aufbau.farben;
  return (
    <div className="ib-farben">
      <label className="ib-farbe">Kopf
        <input type="color" value={jetzt.kopf} data-ib="farbe-kopf" onChange={(e) => neu({ kopf: e.target.value })} /></label>
      <label className="ib-farbe">Hintergrund
        <input type="color" value={jetzt.grund} data-ib="farbe-grund" onChange={(e) => neu({ grund: e.target.value })} /></label>
      <button type="button" className="knopf knopf--still" data-ib="farben-tauschen"
        onClick={() => neu({ kopf: jetzt.grund, grund: jetzt.kopf }, true)}>Tauschen</button>
      {!vorgabe && <button type="button" className="knopf knopf--still" data-ib="farben-vorgabe"
        onClick={() => { clearTimeout(uhr.current); setzen(null); }}>Wie am Anfang</button>}
    </div>
  );
}

// Drehen auch mit einem Schieber: der runde Griff kann beim Rand der
// Tafel ausserhalb liegen. Gespeichert wird kurz nach dem letzten Zug.
function Drehung({ wert, setzen }) {
  const [g, setG] = useState(wert > 180 ? wert - 360 : wert);
  const uhr = useRef(null);
  useEffect(() => { setG(wert > 180 ? wert - 360 : wert); }, [wert]);
  useEffect(() => () => clearTimeout(uhr.current), []);
  const neu = (x) => {
    setG(x);
    clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setzen(((x % 360) + 360) % 360), 400);
  };
  return (
    <label className="feld ib-drehung">Drehung: {g}°
      <input type="range" min="-180" max="180" step="1" value={g} data-ib="drehung"
        onChange={(e) => neu(Number(e.target.value))} />
    </label>
  );
}

// ---------- Anzeige über den ganzen Bildschirm ----------
let offen = null;

export function infoboardOeffnen(vonHand, mass = TAFELN.haupt) {
  if (offen) return;
  const huelle = document.createElement("div");
  huelle.className = "ib-voll ib-voll--" + mass.id;
  huelle.id = "infoboard";
  document.body.appendChild(huelle);
  document.body.classList.add("ib-offen");
  const wurzel = createRoot(huelle);
  offen = { huelle, wurzel };
  wurzel.render(<Anzeige huelle={huelle} mass={mass} />);
  // Vollbild erlaubt der Browser nur nach einem Tipp oder Klick. Beim Start
  // von selbst (Konto Infoboard, Bildschirm-Gerät) holt darum der erste
  // Tipp, Klick oder Tastendruck irgendwo das Vollbild nach, damit Adress-
  // leiste und Bildlaufleiste verschwinden wie bei „Anzeige öffnen“
  // (Wunsch Patrick 21. Oktober 2026). Klappt es schon ohne, umso besser.
  vollbild(huelle);
  if (!vonHand) {
    const nachholen = () => { if (offen && offen.huelle === huelle) vollbild(huelle); };
    for (const art of ["pointerdown", "keydown", "touchend"]) document.addEventListener(art, nachholen, true);
    offen.weg = () => { for (const art of ["pointerdown", "keydown", "touchend"]) document.removeEventListener(art, nachholen, true); };
  }
}

function vollbild(el) {
  try {
    if (document.fullscreenElement) return;
    const f = el.requestFullscreen || el.webkitRequestFullscreen;
    const p = f && f.call(el);
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* ohne Tipp verweigert, der nächste Tipp versucht es wieder */ }
}

export function infoboardSchliessen() {
  if (!offen) return;
  const { huelle, wurzel, weg } = offen;
  offen = null;
  if (weg) weg();
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (f) { /* egal */ }
  wurzel.unmount();
  huelle.remove();
  document.body.classList.remove("ib-offen");
}

const NACHSEHEN_MS = 30000;
const WACH_MS = 60000;

// Zeigt, wie fein der Browser des Bildschirms zeichnet: meldet er bei
// einem 4K-Bildschirm nur 1080 Punkte mit Faktor 1, vergrössert das
// Display selbst und die App kann nicht schärfer werden
function aufloesungText() {
  const f = window.devicePixelRatio || 1;
  const s = window.screen || {};
  return "Browser " + window.innerWidth + " × " + window.innerHeight + ", Faktor " +
    Math.round(f * 100) / 100 + " = " + Math.round(window.innerWidth * f) + " × " +
    Math.round(window.innerHeight * f) + " Pixel · Bildschirm " + (s.width || "?") + " × " + (s.height || "?");
}

function Anzeige({ huelle, mass }) {
  const [aufbau, setAufbau] = useState(null);
  // Rand um die Tafel in derselben Farbe wie ihr Hintergrund
  useEffect(() => { if (mass.ruhig) huelle.style.background = tafelFarben(mass, aufbau).grund; }, [aufbau, mass, huelle]);
  const [fehler, setFehler] = useState("");
  const [zu, setZu] = useState(false);
  const stand = useRef("");
  // Bildschirmschoner (Nacht.jsx): nachts und sonntags unter dem Kopf
  // Hühner statt Dokumente. Ein Tipp darunter holt sie für eine Minute.
  const [nacht, setNacht] = useState(istNacht);
  const [wachBis, setWachBis] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setNacht(istNacht());
      setWachBis((w) => (w && Date.now() > w ? 0 : w));
    }, 15000);
    return () => clearInterval(t);
  }, []);
  const schoner = nacht && !wachBis;

  useEffect(() => {
    let gueltig = true;
    const holen = () => aufbauLaden(mass.id).then((d) => {
      if (!gueltig) return;
      setFehler("");
      if (d.stand !== stand.current || !stand.current) { stand.current = d.stand; setAufbau(d.aufbau); }
    }, (e) => {
      if (!gueltig) return;
      setFehler(fehltTabelle(e) ? "infoboard.sql fehlt in Supabase." : alt.fehlertext(e));
      setAufbau((a) => a || aufbauOrdnen(null));
    });
    holen();
    // Was jemand in der App ändert, kommt so von selbst auf den Bildschirm
    const t = setInterval(() => { if (!document.hidden) holen(); }, NACHSEHEN_MS);
    return () => { gueltig = false; clearInterval(t); };
  }, []);

  // Escape schliesst, solange kein Fenster offen ist
  useEffect(() => {
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".dialog-huelle, .pad-skizze-gross")) return;
      // Vor allen anderen, sonst fragt Escape darunter „Abmelden?“
      e.preventDefault(); e.stopPropagation();
      infoboardSchliessen();
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, []);

  // Ein Tipp auf den Kopf zeigt kurz den Knopf zum Schliessen; ein
  // fester Knopf würde am Bildschirm im Gang zu oft gedrückt
  useEffect(() => {
    if (!zu) return;
    const t = setTimeout(() => setZu(false), 6000);
    return () => clearTimeout(t);
  }, [zu]);

  const kopfTipp = (e) => {
    const r = huelle.getBoundingClientRect();
    if (e.clientY - r.top < r.height * 0.2) setZu(true);
    else if (schoner) setWachBis(Date.now() + WACH_MS);
  };

  return (
    <div className="ib-voll__innen" onPointerDown={kopfTipp}>
      {aufbau && <Tafel mass={mass} aufbau={aufbau} grossZiel={huelle} nacht={schoner} />}
      {fehler && <div className="ib-voll__fehler">{fehler}</div>}
      {zu && <button type="button" className="ib-voll__zu" data-ib="schliessen"
        onClick={() => infoboardSchliessen()}>Schliessen</button>}
      {zu && <div className="ib-voll__aufloesung">{aufloesungText()}</div>}
    </div>
  );
}
