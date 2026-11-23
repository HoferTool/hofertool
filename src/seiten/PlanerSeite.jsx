// =================================================================
//  PLANER ALS UNTERPUNKT DER PLANWAND (seit 1.736.0, nur neuer Look)
//  Wunsch Patrick 23. November 2026: „nimm den planer aus planwand und
//  mach es als unterreiter bei planwand“. Im neuen Look steht der Planer
//  im Menü unter Planwand und erscheint als normale Seite mit Leiste,
//  statt im eigenen Tab. Inhalt und Daten wie bisher aus src/pad/Planer.jsx.
// =================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import Planer, { planerSichtLaden } from "../pad/Planer.jsx";

export default function PlanerSeite() {
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState("");
  const lebt = useRef(true);
  const laden = useCallback(async () => {
    try {
      const neu = await planerSichtLaden();
      if (lebt.current) { setD(neu); setFehler(""); }
    } catch (e) {
      if (lebt.current) setFehler(String((e && e.message) || e));
    }
  }, []);
  useEffect(() => {
    lebt.current = true;
    laden();
    // Still auffrischen, solange die Seite offen ist (wie die Todos der Leiste)
    const t = setInterval(() => { if (!document.hidden) laden(); }, 3 * 60 * 1000);
    const sicht = () => { if (!document.hidden) laden(); };
    document.addEventListener("visibilitychange", sicht);
    return () => { lebt.current = false; clearInterval(t); document.removeEventListener("visibilitychange", sicht); };
  }, [laden]);
  return (
    <div className="pl-seite" id="pl-seite">
      {d ? <Planer d={d} neu={laden} eingebettet />
        : <p className="pl-seite__laden">{fehler ? "Planer konnte nicht laden: " + fehler : "Planer wird geladen …"}</p>}
    </div>
  );
}
