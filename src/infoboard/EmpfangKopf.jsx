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
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";

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

export default function EmpfangKopf({ hoehe, breite, top, left }) {
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
      <Kachel art="eigen" zeichen={HAUS} name="Selbst gebraucht" wert={anteil + " %"}
        unter="von der Sonne" />
      <Kachel art="netz" zeichen={NETZ} name={netz > 0 ? "Vom Netz" : "Ins Netz"} wert={alt.solarKw(Math.abs(netz))} />
    </>;
  }

  return (
    <div className="ek" data-ib="empfang-kopf" style={{ height: hoehe, width: breite, top, left }}>
      <div className="ek__oben">
        <div className="ek__zeit">
          <div className="ek__uhr">{zwei(jetzt.getHours())}:{zwei(jetzt.getMinutes())}</div>
          <div className="ek__datum">{jetzt.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <div className="ek__logo" role="img" aria-label="Hofer + Co."
          style={{ WebkitMaskImage: "url(" + alt.LOGO_WEISS + ")", maskImage: "url(" + alt.LOGO_WEISS + ")" }} />
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
