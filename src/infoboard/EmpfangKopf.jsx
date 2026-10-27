// =================================================================
//  EMPFANG: DER KOPF
//  Am Empfang sehen Besucher den Bildschirm, darum ruhig und freundlich
//  statt technisch (Wunsch Patrick 26. Oktober 2026: „keine durch-
//  laufenden Animationen, die Solaranlagen-Daten sollen bleiben, das
//  Ganze harmonischer und freundlicher, nicht so technisch und
//  futuristisch“): helle Karte, Uhr, Logo und Wetter, darunter die
//  Solaranlage in wenigen grossen Zahlen, ohne Verlauf und ohne Wellen.
//  Alles steht still; die Werte kommen jede Minute neu.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";

const LOGO = import.meta.env.BASE_URL + "logo-empfang.png";
const zwei = (n) => String(n).padStart(2, "0");
const kwh = (z) => (z === null || z === undefined || z === "" ? null
  : alt.zahlText(Math.round(Number(z))) + " kWh");

function useJetzt() {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  return jetzt;
}

function useWetter() {
  const [w, setW] = useState(null);
  useEffect(() => {
    let gueltig = true;
    const holen = () => alt.holeWetter().then((x) => gueltig && setW(x), () => gueltig && setW(false));
    holen();
    const t = setInterval(holen, 30 * 60000);
    return () => { gueltig = false; clearInterval(t); };
  }, []);
  return w;
}

function useSolar() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let gueltig = true;
    const holen = () => alt.solarLaden().then((r) => gueltig && setS(r.length ? r[r.length - 1] : false),
      () => gueltig && setS(false));
    holen();
    const t = setInterval(() => { if (!document.hidden) holen(); }, 60000);
    return () => { gueltig = false; clearInterval(t); };
  }, []);
  return s;
}

// Kleine Sinnbilder, still und rund
const SONNE = <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="9" fill="currentColor" />
  {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => <rect key={g} x="22.5" y="3" width="3" height="8" rx="1.5"
    fill="currentColor" transform={"rotate(" + g + " 24 24)"} />)}</svg>;
const HAUS = <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 23 24 9l16 14v16a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"
  fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /><path d="M20 41V29h8v12" fill="none"
  stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /></svg>;
const BLATT = <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38C10 20 22 10 40 9c0 18-10 30-28 30z"
  fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /><path d="M12 37 30 19" fill="none"
  stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>;
const NETZ = <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M26 5 12 27h11l-3 16 16-23H25z" fill="none"
  stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /></svg>;

function Kachel({ art, zeichen, name, wert, unter }) {
  return (
    <div className={"ek-kachel ek-kachel--" + art}>
      <span className="ek-kachel__zeichen">{zeichen}</span>
      <span className="ek-kachel__text">
        <span className="ek-kachel__name">{name}</span>
        <span className="ek-kachel__wert">{wert}</span>
        {unter && <span className="ek-kachel__unter">{unter}</span>}
      </span>
    </div>
  );
}

// Das Logo lässt sich beim Gestalten mit der Maus verschieben (Wunsch
// Patrick 26. Oktober 2026: „ich will das Logo verschieben können“).
// Gespeichert wird nur der Versatz in Punkten der Tafel, erst beim Loslassen;
// k ist der Massstab der Vorschau, damit das Logo genau dem Zeiger folgt.
function Logo({ lage, setzen, k }) {
  const [zug, setZug] = useState(null);
  const [rad, setRad] = useState(null);
  const start = useRef(null);
  const bild = useRef(null);
  const uhr = useRef(null);
  const x = zug ? zug.x : (lage && lage.x) || 0, y = zug ? zug.y : (lage && lage.y) || 0;
  const s = rad ?? ((lage && lage.s) || 1);
  const aktuell = useRef(null);
  aktuell.current = { x, y, s, lage, setzen };
  useEffect(() => { setRad(null); }, [lage && lage.s]);
  // Mausrad auf dem Logo zoomt (Wunsch Patrick 26. Oktober 2026: „kann ich
  // es auch zoomen?“). Eigener Hörer, weil React das Rad nur passiv meldet
  // und die Seite sonst mitrollt; gespeichert kurz nach dem letzten Dreh.
  useEffect(() => {
    const el = bild.current;
    if (!el || !setzen) return undefined;
    const drehen = (e) => {
      e.preventDefault();
      const a = aktuell.current;
      const neu = logoGroesse(a.s * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
      setRad(neu);
      clearTimeout(uhr.current);
      uhr.current = setTimeout(() => a.setzen({ ...(a.lage || {}), x: a.x, y: a.y, s: neu }), 400);
    };
    el.addEventListener("wheel", drehen, { passive: false });
    return () => { el.removeEventListener("wheel", drehen); clearTimeout(uhr.current); };
  }, [setzen]);
  const greifen = (e) => {
    if (!setzen || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    start.current = { mx: e.clientX, my: e.clientY, x, y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setZug({ x, y });
  };
  const ziehen = (e) => {
    const st = start.current; if (!st) return;
    setZug({ x: Math.round(st.x + (e.clientX - st.mx) / (k || 1)), y: Math.round(st.y + (e.clientY - st.my) / (k || 1)) });
  };
  const loslassen = () => {
    const st = start.current; start.current = null;
    if (st && zug && (zug.x !== st.x || zug.y !== st.y)) setzen({ ...(lage || {}), x: zug.x, y: zug.y, s });
    setZug(null);
  };
  const t = (x || y ? "translate(" + x + "px, " + y + "px)" : "") + (s !== 1 ? " scale(" + s + ")" : "");
  return <img ref={bild} className={"ek__logo" + (setzen ? " ek__logo--ziehbar" : "")} src={LOGO} alt="Hofer + Co."
    draggable={false} data-ib="logo" style={t ? { transform: t } : undefined}
    onPointerDown={greifen} onPointerMove={ziehen} onPointerUp={loslassen} onPointerCancel={loslassen} />;
}

// Grösse des Logos: 30 % bis 250 % der Vorgabe
export const logoGroesse = (s) => Math.round(Math.min(2.5, Math.max(0.3, s)) * 100) / 100;

export default function EmpfangKopf({ hoehe, breite, top, left, farbe, logo, logoSetzen, k }) {
  const jetzt = useJetzt();
  const wetter = useWetter();
  const solar = useSolar();
  const fei = alt.naechsterFeiertag();

  let kacheln = null;
  if (solar) {
    const prod = Number(solar.produktion_w) || 0, verb = Number(solar.verbrauch_w) || 0;
    const netz = Number(solar.netz_w) || 0;
    const anteil = verb > 0 ? Math.round((Math.max(0, Math.min(prod, verb)) / verb) * 100) : 0;
    kacheln = <>
      <Kachel art="sonne" zeichen={SONNE} name="Sonnenstrom jetzt" wert={alt.solarKw(prod)} />
      <Kachel art="tag" zeichen={BLATT} name="Heute erzeugt" wert={kwh(solar.ertrag_tag_kwh) || "–"} />
      <Kachel art="eigen" zeichen={HAUS} name="Selbst erzeugt" wert={anteil + " %"} />
      <Kachel art="netz" zeichen={NETZ} name={netz > 0 ? "Vom Netz" : "Ins Netz"} wert={alt.solarKw(Math.abs(netz))} />
    </>;
  }

  return (
    <div className="ek" data-ib="empfang-kopf" style={{ height: hoehe, width: breite, top, left, background: farbe }}>
      <div className="ek__oben">
        <div className="ek__zeit">
          <div className="ek__uhr">{zwei(jetzt.getHours())}:{zwei(jetzt.getMinutes())}</div>
          <div className="ek__datum">{jetzt.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        {/* Das Logo in seinen Farben, blau mit grauer Schrift, freigestellt und
            rund dreimal so fein wie gezeigt (Wunsch Patrick 26. Oktober 2026:
            „nimm dieses Logo“) */}
        <Logo lage={logo} setzen={logoSetzen} k={k} />
        <div className="ek__wetter">
          {wetter && <>
            <div className="ek__grad">{wetter.temperatur}°</div>
            <div className="ek__wettertext">{wetter.text}<br /><span>{alt.ORT.name} · {wetter.tief}° bis {wetter.hoch}°</span></div>
          </>}
          {wetter === false && fei && <div className="ek__wettertext"><span>{fei.tage === 0 ? "Heute ist " + fei.name
            : fei.tage === 1 ? "Morgen ist " + fei.name : fei.name + " in " + fei.tage + " Tagen"}</span></div>}
        </div>
      </div>
      <div className="ek__solar">
        <div className="ek__solartitel"><span className="ek__solarsonne">{SONNE}</span>Unsere Solaranlage</div>
        <div className="ek__kacheln">
          {kacheln || <span className="ek__leise">{solar === null ? "Werte werden geladen …" : "Gerade keine Werte"}</span>}
        </div>
      </div>
    </div>
  );
}
