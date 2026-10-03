// Reiterleiste oben auf einer Seite und der sanfte Eintritt beim
// Wechsel, wie bei den alten Seiten.
import { useLayoutEffect, useRef } from "react";
import { alt } from "../bruecke.jsx";

// reiter: Liste von [wert, text]. merkmal: Name des data-Attributs,
// über das der Prüfstand und alte Verweise die Knöpfe finden.
export function Reiter({ reiter, aktiv, waehlen, merkmal }) {
  return (
    <div className="reiter">
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
