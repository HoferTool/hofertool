// =================================================================
//  INFOBOARD
//  Seite zum Gestalten des grossen Bildschirms (Samsung, zuerst 43, jetzt
//  50 Zoll, hochkant) und die Anzeige über den ganzen Bildschirm
//  (Wunsch Patrick 20. Oktober 2026). Links die Tafel genau wie am
//  Bildschirm, rechts je Reihe „3 × A4“, „A3 + A4“ oder „A4 + A3“ und was im
//  angetippten Bereich steht: eine Datei (PDF, Bild, Video) oder eine
//  Fläche zum Zeichnen und Schreiben. Dateien lassen sich auch direkt auf
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
import { aufbauLaden, aufbauSpeichern, aufbauOrdnen, dateiHochladen, dateiTyp, fehltTabelle, neueId,
  istInfoboardGeraet, infoboardGeraetSetzen, SEKUNDEN } from "./daten.js";

const REIHEN = ["oben", "Mitte", "unten"];
const SPALTE = ["links", "Mitte", "rechts"];
const WECHSEL = [[10, "10 Sekunden"], [20, "20 Sekunden"], [30, "30 Sekunden"], [60, "1 Minute"], [120, "2 Minuten"]];

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
    if (!dateiTyp(d.name, d.type)) { alt.meldung("Nur PDF, Bilder oder Videos.", "warn"); return; }
    setLaedt(d.name);
    try {
      const neu = await dateiHochladen(d);
      const id = neueId();
      await feldSetzen(feld.id, { id, art: "datei", datei: neu, sekunden: feld.sekunden || SEKUNDEN });
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

  const skizzeSetzen = () => {
    if (!wahl) return;
    const id = neueId();
    feldSetzen(wahl.feld.id, { id, art: "skizze" });
    setGewaehlt(id);
  };

  const leeren = async () => {
    if (!wahl || wahl.feld.art === "leer") return;
    const ok = await alt.nachfragen({ titel: "Bereich leeren?",
      text: wahl.feld.art === "skizze" ? "Die Zeichenfläche und alles darauf verschwindet vom Infoboard."
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

  const inhaltText = (f) => f.art === "skizze" ? "Zeichenfläche"
    : f.art === "datei" && f.datei ? ({ pdf: "PDF", bild: "Bild", video: "Video" }[f.datei.typ] || "Datei") + ": " + (f.datei.name || "")
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
            ablegen={admin && !laedt ? ablegen : null} />
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
                  {wahl.feld.art !== "skizze" &&
                    <button type="button" className="knopf knopf--still" data-ib="skizze" onClick={skizzeSetzen}>
                      Zeichenfläche</button>}
                  {wahl.feld.art !== "leer" &&
                    <button type="button" className="knopf knopf--gefahr" data-ib="leeren" onClick={leeren}>
                      Leeren</button>}
                </div>
                <input ref={datei} type="file" hidden accept="application/pdf,image/*,video/*" onChange={dateiGewaehlt} />
                {wahl.feld.art === "datei" && wahl.feld.datei && wahl.feld.datei.typ === "pdf" &&
                  <label className="feld">Mehrere Seiten wechseln alle
                    <select value={wahl.feld.sekunden || SEKUNDEN} data-ib="sekunden"
                      onChange={(e) => feldSetzen(wahl.feld.id, { ...wahl.feld, sekunden: Number(e.target.value) })}>
                      {WECHSEL.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
                    </select></label>}
                <p className="klein">PDF, Bild oder Video. Ein PDF zeigt die ganze Seite; antippen am Bildschirm zeigt die nächste.</p>
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
  // Vollbild geht nur nach einem Tipp; beim Start von selbst läuft der
  // Browser am Bildschirm ohnehin über die ganze Fläche
  if (vonHand && huelle.requestFullscreen) huelle.requestFullscreen().catch(() => {});
}

export function infoboardSchliessen() {
  if (!offen) return;
  const { huelle, wurzel } = offen;
  offen = null;
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
