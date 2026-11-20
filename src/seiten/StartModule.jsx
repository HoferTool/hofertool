// =================================================================
//  NEUE STARTSEITE „WAS WILLST DU MACHEN?“ (Vorschau #/startneu)
//  1.670.0 Module mit allen Seiten, seit 1.671.0 Aufgaben ohne Menü
//  (Wunsch Patrick 20. November 2026: „man soll nicht Menüs haben von
//  Anfang an … nur das bieten, was man braucht“, „eine App auf dem
//  Handy, PC oder wo auch immer“). Die Aufgaben und ihre Leiste stehen
//  in src/huelle/Aufgaben.jsx. Darunter „Heute“ mit den Karten der
//  bisherigen Startseite.
// =================================================================
import { alt } from "../bruecke.jsx";
import Start from "./Start.jsx";
import { sichtbareAufgaben, aufgabeStarten } from "../huelle/Aufgaben.jsx";

export function Aufgabenwahl() {
  const liste = sichtbareAufgaben();
  return (
    <section className="sm-wahl" id="sm-module">
      <h2 className="sm-wahl__frage">Was willst du machen?</h2>
      <div className="sm-wahl__raster">
        {liste.map((a) => (
          <button key={a.id} type="button" className="sm-aufgabe" data-modul={a.id}
            style={{ "--sm-farbe": a.farbe }} onClick={() => aufgabeStarten(a)}>
            <span className="sm-aufgabe__zeichen" aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: alt.SYM[a.zeichen] || "" }} />
            <span className="sm-aufgabe__titel">{a.titel}</span>
            <span className="sm-aufgabe__frage">{a.frage}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function StartModule({ auffrischen }) {
  return (
    <>
      <div className="sm-vorschau" id="sm-vorschau">
        <span><b>Testseite</b> · Aufgaben statt Menü. Die richtige Startseite bleibt, bis du übernimmst.</span>
        <a className="knopf knopf--klein" href="#/dashboard">Zur jetzigen Startseite</a>
      </div>
      <Start auffrischen={auffrischen} module={<Aufgabenwahl />} />
    </>
  );
}
