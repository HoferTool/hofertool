// Reiterleiste oben auf einer Seite und der sanfte Eintritt beim
// Wechsel, wie bei den alten Seiten.
import { useEffect, useLayoutEffect, useRef } from "react";
import { alt } from "../bruecke.jsx";
import { reiterMelden, reiterAbmelden } from "../huelle/unterreiter.js";

// reiter: Liste von [wert, text]. merkmal: Name des data-Attributs,
// über das der Prüfstand und alte Verweise die Knöpfe finden.
// seite: Pfad der Seite; dann zeigt die Seitenleiste den gewählten
// Reiter mit und kann ihn wechseln (src/huelle/unterreiter.js).
export function Reiter({ reiter, aktiv, waehlen, merkmal, seite }) {
  // waehlen ist oft bei jedem Zeichnen neu; die Leiste ruft immer den neuesten
  const waehlenRef = useRef(waehlen);
  waehlenRef.current = waehlen;
  const melder = useRef((w) => waehlenRef.current(w)).current;
  useEffect(() => { if (seite) reiterMelden(seite, aktiv, melder); }, [seite, aktiv, melder]);
  useEffect(() => () => { if (seite) reiterAbmelden(seite, melder); }, [seite, melder]);
  return (
    <div className={"reiter" + (seite ? " reiter--seite" : "")}>
      {reiter.map(([wert, text]) => (
        <button key={wert} className={"reiter__knopf" + (aktiv === wert ? " aktiv" : "")}
          {...{ ["data-" + merkmal]: wert }} onClick={() => waehlen(wert)}>{text}</button>
      ))}
    </div>
  );
}

export function Uebergang({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => { alt.reiterUebergang(ref.current); }, []);
  return <div ref={ref}>{children}</div>;
}
