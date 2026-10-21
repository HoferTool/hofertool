// =================================================================
//  INFOBOARD
//  Seite zum Gestalten des grossen Bildschirms (Samsung, zuerst 43, jetzt
//  50 Zoll, hochkant) und die Anzeige über den ganzen Bildschirm
//  (Wunsch Patrick 20. Oktober 2026). Links die Tafel genau wie am
//  Bildschirm, rechts je Reihe „3 × A4“, „A3 + A4“ oder „A4 + A3“ und was im
//  angetippten Bereich steht: eine Datei (PDF, Bild, Video) oder Text
//  wie in Word (TextFeld.jsx; früher die Zeichenfläche, die alte Felder
//  noch zeigen). Dateien lassen sich auch direkt auf
//  ein Feld ziehen, Felder aufeinander gezogen tauschen den Inhalt.
//
//  Gestalten dürfen nur Admins (auch in der Datenbank). Gerätekonten
//  („Andere Nutzer“) sehen die Seite auch, damit man am Bildschirm
//  „Dieses Gerät ist das Infoboard“ einschalten kann: Dann geht die
//  Anzeige nach jedem Anmelden und Neuladen von selbst auf.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { Tafel, felderLage } from "./Tafel.jsx";
import { textBearbeiten, wordLesen, sauber } from "./TextFeld.jsx";
import { aufbauLaden, aufbauSpeichern, aufbauOrdnen, dateiHochladen, dateiTyp, fehltTabelle, neueId,
  istInfoboardGeraet, infoboardGeraetSetzen, SEKUNDEN } from "./daten.js";

const REIHEN = ["oben", "Mitte", "unten"];
const SPALTE = ["links", "Mitte", "rechts"];
// 0 = nicht von selbst blättern, die Seite wechselt nur beim Antippen
// (Wunsch Patrick 21. Oktober 2026).
const WECHSEL = [[0, "Nicht selber blättern"], [10, "alle 10 Sekunden"], [20, "alle 20 Sekunden"], [30, "alle 30 Sekunden"], [60, "jede Minute"], [120, "alle 2 Minuten"]];

export function infoboardSichtbar() {
  return !alt.istExtern() && (alt.istAdmin() || alt.istAndererNutzer());
}

export default function Infoboard() {
  const admin = alt.istAdmin();
  const [aufbau, setAufbau] = useState(null);
  const [fehler, setFehler] = useState("");
  const [gewaehlt, setGewaehlt] = useState(null);
  const [laedt, setLaedt] = useState("");
  const [geraet, setGeraet] = useState(istInfoboardGeraet);
  const datei = useRef(null);

  useEffect(() => {
    aufbauLaden().then((d) => setAufbau(d.aufbau), (e) => {
      setFehler(fehltTabelle(e) ? "Das Infoboard braucht noch die Datei infoboard.sql in Supabase." : alt.fehlertext(e));
      setAufbau(aufbauOrdnen(null));
    });
  }, []);

  if (!aufbau) return <section className="karte"><p className="hinweis">Infoboard wird geladen …</p></section>;

  const aendern = async (neu) => {
    const vorher = aufbau;
    setAufbau(neu);
    try { await aufbauSpeichern(neu); setFehler(""); }
    catch (e) {
      setAufbau(vorher);
      alt.meldung("Nicht gespeichert: " + (fehltTabelle(e) ? "infoboard.sql fehlt in Supabase." : alt.fehlertext(e)), "fehler");
    }
  };

  const lage = felderLage(aufbau);
  const wahl = lage.find((l) => l.feld.id === gewaehlt) || null;

  const feldSetzen = (id, neu) => aendern({ reihen: aufbau.reihen.map((r) => ({ ...r,
    felder: r.felder.map((f) => (f.id === id ? neu : f)) })) });

  const formatSetzen = (ri, format) => {
    if (aufbau.reihen[ri].format === format) return;
    aendern({ reihen: aufbau.reihen.map((r, i) => (i === ri ? { ...r, format } : r)) });
  };

  // Eine Datei in ein Feld legen: über „Datei wählen …“ oder vom
  // Computer direkt auf das Feld gezogen (Wunsch Patrick 20. Oktober 2026)
  const dateiInFeld = async (feld, d) => {
    if (!d || !feld) return;
    const typ = dateiTyp(d.name, d.type);
    if (!typ) { alt.meldung("Nur PDF, Bilder, Videos, Excel oder Word (.docx).", "warn"); return; }
    setLaedt(d.name);
    try {
      if (typ === "word") {
        // Word wird Text auf der Tafel, danach mit „Text bearbeiten“ änderbar
        const html = sauber(await wordLesen(d));
        const id = feld.art === "text" ? feld.id : neueId();
        await feldSetzen(feld.id, { id, art: "text", html });
        setGewaehlt(id);
        return;
      }
      const neu = await dateiHochladen(d);
      const id = neueId();
      await feldSetzen(feld.id, { id, art: "datei", datei: neu, sekunden: feld.sekunden ?? SEKUNDEN });
      setGewaehlt(id);
    } catch (f) { alt.meldung("Hochladen ging nicht: " + alt.fehlertext(f), "fehler"); }
    finally { setLaedt(""); }
  };

  const dateiGewaehlt = (e) => {
    const d = e.target.files && e.target.files[0];
    e.target.value = "";
    if (wahl) dateiInFeld(wahl.feld, d);
  };

  // Zwei Felder tauschen ihren Inhalt. Die Felder behalten ihre Kennung,
  // so wandert eine Zeichenfläche samt allem darauf mit.
  const tauschen = (vonId, nachId) => {
    if (!vonId || vonId === nachId) return;
    const alle = aufbau.reihen.flatMap((r) => r.felder);
    const von = alle.find((f) => f.id === vonId), nach = alle.find((f) => f.id === nachId);
    if (!von || !nach) return;
    aendern({ reihen: aufbau.reihen.map((r) => ({ ...r,
      felder: r.felder.map((f) => (f.id === vonId ? nach : f.id === nachId ? von : f)) })) });
    setGewaehlt(vonId);
  };

  const ablegen = (feld, d) => {
    if (d.datei) dateiInFeld(feld, d.datei);
    else tauschen(d.feldId, feld.id);
  };

  // Text wie in Word statt der Zeichenfläche (Wunsch Patrick 20. Oktober
  // 2026). Bestehende Zeichenflächen bleiben, neue gibt es nicht mehr.
  const textOeffnen = async (l) => {
    if (!l) return;
    const html = await textBearbeiten({ html: l.feld.art === "text" ? l.feld.html : "", format: l.format,
      seitenVerhaeltnis: l.height / l.width,
      titel: "Text · Reihe " + REIHEN[l.reihe] + " · " + (l.breit === 2 ? "A3" : "A4 " + SPALTE[l.spalte]) });
    if (html == null) return;
    const id = l.feld.art === "text" ? l.feld.id : neueId();
    await feldSetzen(l.feld.id, { id, art: "text", html });
    setGewaehlt(id);
  };

  const leeren = async () => {
    if (!wahl || wahl.feld.art === "leer") return;
    const ok = await alt.nachfragen({ titel: "Bereich leeren?",
      text: wahl.feld.art === "skizze" ? "Die Zeichenfläche und alles darauf verschwindet vom Infoboard."
        : wahl.feld.art === "text" ? "Der Text verschwindet vom Infoboard."
        : "Die Datei verschwindet vom Infoboard.", bestaetigen: "Leeren", gefahr: true });
    if (!ok) return;
    const id = neueId();
    if (wahl.feld.art === "skizze") {
      alt.db.from("infoboard_skizzen").delete().eq("bereich", wahl.feld.id).then(() => {}, () => {});
    }
    await feldSetzen(wahl.feld.id, { id, art: "leer" });
    setGewaehlt(id);
  };

  const geraetUmschalten = (an) => { infoboardGeraetSetzen(an); setGeraet(an); };

  const inhaltText = (f) => f.art === "skizze" ? "Zeichenfläche" : f.art === "text" ? "Text"
    : f.art === "datei" && f.datei ? ({ pdf: "PDF", bild: "Bild", video: "Video", excel: "Excel" }[f.datei.typ] || "Datei") + ": " + (f.datei.name || "")
    : "Leer";

  return (
    <section className="karte ib-gestalten">
      <div className="ib-gestalten__kopf">
        <h2>Infoboard</h2>
        <button type="button" className="knopf" data-ib="anzeige" onClick={() => infoboardOeffnen(true)}>
          Anzeige öffnen</button>
      </div>
      {fehler && <p className="hinweis">{fehler}</p>}
      <div className="ib-gestalten__teile">
        <div className="ib-gestalten__vorschau">
          <Tafel aufbau={aufbau} bearbeiten={admin} gewaehlt={gewaehlt} waehlen={setGewaehlt}
            ablegen={admin && !laedt ? ablegen : null}
            doppelt={admin ? (id) => { const l = lage.find((x) => x.feld.id === id); if (l && l.feld.art === "text") textOeffnen(l); } : null} />
        </div>
        <div className="ib-gestalten__seite">
          {admin && <>
            {REIHEN.map((name, ri) => (
              <div key={name} className="ib-reihe">
                <span className="ib-reihe__name">Reihe {name}</span>
                <div className="ib-umschalter">
                  {[["a4", "3 × A4"], ["a3l", "A3 + A4"], ["a3r", "A4 + A3"]].map(([w, t]) => (
                    <button key={w} type="button" data-ibformat={ri + "-" + w}
                      className={"ib-umschalter__knopf" + (aufbau.reihen[ri].format === w ? " aktiv" : "")}
                      onClick={() => formatSetzen(ri, w)}>{t}</button>
                  ))}
                </div>
              </div>
            ))}
            {!wahl && <p className="klein">Tippe links auf einen Bereich, um ihn zu füllen. Du kannst auch eine Datei vom Computer direkt auf einen Bereich ziehen oder einen Bereich auf einen anderen ziehen, dann tauschen die beiden.</p>}
            {laedt && <p className="klein">Lädt {laedt} …</p>}
            {wahl &&
              <div className="ib-wahl" data-ibwahl={wahl.reihe + "-" + wahl.platz}>
                <h3>{"Reihe " + REIHEN[wahl.reihe] + " · " + (wahl.breit === 2 ? "A3 " + (wahl.spalte === 0 ? "links" : "rechts") : "A4 " + SPALTE[wahl.spalte])}</h3>
                <p className="ib-wahl__inhalt">{inhaltText(wahl.feld)}</p>
                <div className="ib-wahl__knoepfe">
                  <button type="button" className="knopf" data-ib="datei" disabled={!!laedt}
                    onClick={() => datei.current && datei.current.click()}>
                    {laedt ? "Lädt " + laedt + " …" : wahl.feld.art === "datei" ? "Andere Datei …" : "Datei wählen …"}</button>
                  <button type="button" className="knopf knopf--still" data-ib="text" onClick={() => textOeffnen(wahl)}>
                    {wahl.feld.art === "text" ? "Text bearbeiten" : "Text schreiben"}</button>
                  {wahl.feld.art !== "leer" &&
                    <button type="button" className="knopf knopf--gefahr" data-ib="leeren" onClick={leeren}>
                      Leeren</button>}
                </div>
                <input ref={datei} type="file" hidden onChange={dateiGewaehlt}
                  accept="application/pdf,image/*,video/*,.xlsx,.xlsm,.xls,.ods,.docx" />
                {wahl.feld.art === "datei" && wahl.feld.datei && (wahl.feld.datei.typ === "pdf" || wahl.feld.datei.typ === "excel") &&
                  <label className="feld">Mehrere Seiten wechseln
                    <select value={wahl.feld.sekunden ?? SEKUNDEN} data-ib="sekunden"
                      onChange={(e) => feldSetzen(wahl.feld.id, { ...wahl.feld, sekunden: Number(e.target.value) })}>
                      {WECHSEL.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
                    </select></label>}
                <p className="klein">PDF, Bild, Video oder Excel. PDF und Excel zeigen die ganze Seite wie ausgedruckt;
                  antippen am Bildschirm zeigt die nächste. Eine Word-Datei wird zu Text, den man danach noch ändern kann.
                  Doppelklick auf ein Textfeld öffnet es.</p>
              </div>}
          </>}
          <label className="ib-geraet">
            <input type="checkbox" checked={geraet} data-ib="geraet" onChange={(e) => geraetUmschalten(e.target.checked)} />
            <span>Dieses Gerät ist der Infoboard-Bildschirm<small>Nach dem Anmelden und nach jedem Neuladen geht die Anzeige
              von selbst über den ganzen Bildschirm auf.</small></span>
          </label>
        </div>
      </div>
    </section>
  );
}

// ---------- Anzeige über den ganzen Bildschirm ----------
let offen = null;

export function infoboardOeffnen(vonHand) {
  if (offen) return;
  const huelle = document.createElement("div");
  huelle.className = "ib-voll";
  huelle.id = "infoboard";
  document.body.appendChild(huelle);
  document.body.classList.add("ib-offen");
  const wurzel = createRoot(huelle);
  offen = { huelle, wurzel };
  wurzel.render(<Anzeige huelle={huelle} />);
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

function Anzeige({ huelle }) {
  const [aufbau, setAufbau] = useState(null);
  const [fehler, setFehler] = useState("");
  const [zu, setZu] = useState(false);
  const stand = useRef("");

  useEffect(() => {
    let gueltig = true;
    const holen = () => aufbauLaden().then((d) => {
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
  };

  return (
    <div className="ib-voll__innen" onPointerDown={kopfTipp}>
      {aufbau && <Tafel aufbau={aufbau} grossZiel={huelle} />}
      {fehler && <div className="ib-voll__fehler">{fehler}</div>}
      {zu && <button type="button" className="ib-voll__zu" data-ib="schliessen"
        onClick={() => infoboardSchliessen()}>Schliessen</button>}
    </div>
  );
}
