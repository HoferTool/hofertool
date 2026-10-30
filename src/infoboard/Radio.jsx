// =================================================================
//  RADIO IM PAUSENRAUM
//  Sender zum Antippen unter Kalender und Geburtstagen (Wunsch Patrick
//  30. Oktober 2026). Radio spielt über <audio>, ein YouTube-Kanal wie
//  Titans of CNC läuft als eingebettete Liste seiner Videos unter der
//  Leiste. Es spielt immer nur eines: ein neuer Sender löst den
//  alten ab, nochmal antippen hält an. Die Liste kommt aus
//  src/daten/radio.js (app_config.radio_sender).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { senderLaden, istVideo, videoEinbetten } from "../daten/radio.js";

const NEU_MS = 10 * 60 * 1000;
const LAUT_SCHRITT = 0.1;
const LAUT_MERKEN = "hofer.radio.lautstaerke";
const GROSS_MERKEN = "hofer.radio.gross";

function lautGemerkt() {
  try { const n = Number(localStorage.getItem(LAUT_MERKEN)); return n > 0 && n <= 1 ? n : 0.6; } catch (f) { return 0.6; }
}

function grossGemerkt() {
  try { return localStorage.getItem(GROSS_MERKEN) !== "0"; } catch (f) { return true; }
}

// gross = Lage der ganzen Tafel von der Leiste aus gesehen
// ({oben, links, breite, hoehe} in Punkten der Tafel), dorthin geht ein
// Video, wenn es gross läuft
export default function Radio({ style, className = "", videoHoehe = 560, gross = null }) {
  const [sender, setSender] = useState(null);
  const [an, setAn] = useState(null);       // id des laufenden Senders
  const [stand, setStand] = useState("");   // "laedt" | "spielt" | "fehler"
  const [laut, setLaut] = useState(lautGemerkt);
  const [grossAn, setGrossAn] = useState(grossGemerkt);
  const ton = useRef(null);

  useEffect(() => {
    let gueltig = true;
    const holen = () => senderLaden().then((l) => { if (gueltig) setSender(l); });
    holen();
    const t = setInterval(() => { if (!document.hidden) holen(); }, NEU_MS);
    return () => { gueltig = false; clearInterval(t); };
  }, []);

  useEffect(() => { if (ton.current) ton.current.volume = laut; }, [laut]);

  // Beim Verlassen der Anzeige (Nacht, Schliessen) verstummt alles
  useEffect(() => () => { const a = ton.current; if (a) { a.pause(); a.removeAttribute("src"); } }, []);

  const laufend = (sender || []).find((s) => s.id === an) || null;

  const anhalten = () => {
    const a = ton.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setAn(null); setStand("");
  };

  const waehlen = (s) => {
    if (an === s.id) { anhalten(); return; }
    const a = ton.current;
    if (a) { a.pause(); a.removeAttribute("src"); }
    setAn(s.id);
    if (istVideo(s)) { setStand("spielt"); return; }
    setStand("laedt");
    // Ein Sender ist ein Strom ohne Ende: immer frisch verbinden, damit
    // nach einer Pause nicht der alte Puffer weiterspielt
    a.src = s.adresse + (s.adresse.includes("?") ? "&" : "?") + "t=" + Date.now();
    a.volume = laut;
    a.play().catch(() => setStand("fehler"));
  };

  const lautAendern = (d) => setLaut((l) => {
    const n = Math.round(Math.min(1, Math.max(0.1, l + d)) * 10) / 10;
    try { localStorage.setItem(LAUT_MERKEN, String(n)); } catch (f) { /* egal */ }
    return n;
  });

  const grossSetzen = (an) => {
    setGrossAn(an);
    try { localStorage.setItem(GROSS_MERKEN, an ? "1" : "0"); } catch (f) { /* egal */ }
  };

  const video = istVideo(laufend) ? videoEinbetten(laufend) : null;
  const istGross = !!(video && gross && grossAn);
  useEffect(() => { if (istVideo(laufend) && !video) setStand("fehler"); }, [laufend, video]);

  // Die Tafel soll Tipps hier nicht als „Anzeige antippen“ verstehen
  const halten = (e) => e.stopPropagation();

  // Flach und breit in einer Reihe (Wunsch Patrick 30. Oktober 2026:
  // „möglichst breit und nicht hoch“): Sender nebeneinander, rechts
  // Lautstärke und Stopp; der Stand steht im gewählten Knopf
  const standText = (s) => (an !== s.id ? null : stand === "laedt" ? "verbinde …"
    : stand === "fehler" ? "nicht erreichbar" : istVideo(s) ? (gross && grossAn ? "läuft gross" : "läuft unten") : "läuft");

  return (
    <section className={"pr-radio " + className} data-ib="radio" style={style}
      onPointerDown={halten} onClick={halten}>
      <div className="pr-radio__sender">
        {(sender || []).map((s) => (
          <button key={s.id} data-radio-sender={s.id}
            className={"pr-radio__knopf" + (an === s.id ? " pr-radio__knopf--an" : "")
              + (an === s.id && stand === "fehler" ? " pr-radio__knopf--fehler" : "")
              + (istVideo(s) ? " pr-radio__knopf--video" : "")}
            onClick={() => waehlen(s)}>
            {/* Zeichen nur bei Videos und beim laufenden Sender, damit mehr
                Namen in die Reihe passen */}
            {(istVideo(s) || (an === s.id && stand === "spielt")) && (
              <span className="pr-radio__zeichen">{s.art === "srf" ? "📺" : s.art === "youtube" ? "▶" : "🔊"}</span>)}
            <span className="pr-radio__name">{s.name}
              {standText(s) && <small className="pr-radio__stand" data-radio="stand">{standText(s)}</small>}</span>
          </button>
        ))}
        {sender && !sender.length && <p className="pr-radio__leer">Keine Sender eingetragen (Einstellungen → Allgemein).</p>}
      </div>
      {laufend && !istVideo(laufend) && (
        <span className="pr-radio__laut">
          <button className="pr-radio__rund" data-radio="leiser" onClick={() => lautAendern(-LAUT_SCHRITT)} aria-label="Leiser" title={"Lautstärke " + Math.round(laut * 100) + " %"}>−</button>
          <button className="pr-radio__rund" data-radio="lauter" onClick={() => lautAendern(LAUT_SCHRITT)} aria-label="Lauter">+</button>
        </span>
      )}
      {video && gross && !istGross && (
        <button className="pr-radio__stopp" data-radio="groesser" onClick={() => grossSetzen(true)}>⛶ Grösser</button>)}
      {laufend && <button className="pr-radio__stopp" data-radio="stopp" onClick={anhalten}>■ Stopp</button>}
      {/* Die Leiste ist zu flach für ein Video. Gross (Vorgabe, Wunsch
          Patrick 30. Oktober 2026: „mach das Bild bei Livestream
          grösser“) füllt es die ganze Tafel, 1920 × 1080 ist genau 16:9;
          „Kleiner“ legt es unter die Leiste über die Teile der Tafel.
          Stopp oder nochmal antippen blendet aus */}
      {video && (
        <div className={"pr-radio__video" + (istGross ? " pr-radio__video--gross" : "")} data-radio="videofeld"
          style={istGross ? { top: gross.oben, left: gross.links, width: gross.breite, height: gross.hoehe } : { height: videoHoehe }}>
          <iframe key={laufend.id} src={video} title={laufend.name} data-radio="video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          {istGross && (
            <div className="pr-radio__videoleiste">
              {/* Die Leiste liegt darunter: andere Videos direkt hier wählen */}
              {(sender || []).filter((s) => istVideo(s) && s.id !== an).map((s) => (
                <button key={s.id} data-radio-video={s.id} onClick={() => waehlen(s)}>
                  {s.art === "srf" ? "📺 " : "▶ "}{s.name}</button>
              ))}
              <button data-radio="kleiner" onClick={() => grossSetzen(false)}>Kleiner</button>
              <button data-radio="stopp-gross" onClick={anhalten}>■ Stopp</button>
            </div>
          )}
        </div>
      )}
      <audio ref={ton} preload="none"
        onPlaying={() => setStand("spielt")} onWaiting={() => setStand((s) => (s === "spielt" ? "laedt" : s))}
        onError={() => { if (ton.current && ton.current.getAttribute("src")) setStand("fehler"); }} />
    </section>
  );
}
