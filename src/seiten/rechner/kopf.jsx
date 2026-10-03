// =================================================================
//  VOR- UND NACHSPANN FÜR DIE MASCHINE
//  Gilt für alle Erzeuger (C-Achse, Gravur, DXF). Hier gehört hinein,
//  was die Maschine braucht und was der Rechner nicht wissen kann:
//  Programmnummer, Nullpunkt, C-Achse zuschalten, Frässpindel ein.
//
//  Die Angaben liegen hier, damit React-Reiter und die noch alten
//  Reiter (Gravur, DXF) dieselben Zeilen sehen. Das alte Programm
//  füllt sie beim Start aus den gespeicherten Einstellungen.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";

export const maschinenkopf = { vor: "", nach: "" };

const zeilen = (t) => (t || "").split(/\r?\n/).filter((z) => z.trim());
export const kopfZeilen = () => zeilen(maschinenkopf.vor);
export const fussZeilen = () => zeilen(maschinenkopf.nach);

// Die Textfelder. Gespeichert und neu gerechnet wird erst, wenn eine
// Weile nicht mehr getippt wurde, damit der G-Code nicht bei jedem
// Buchstaben neu entsteht.
export function KopfFelder({ geaendert }) {
  return (
    <details className="gc-kopf"><summary>Vor- und Nachspann für die Maschine</summary>
      <p className="klein">Diese Zeilen werden unverändert vor und nach dem erzeugten Teil eingesetzt.
        Hier gehört hinein, was von der Maschine abhängt: Programmkopf, Nullpunkt, C-Achse zuschalten,
        Frässpindel ein und aus. Die Angaben bleiben für alle Erzeuger gleich.</p>
      <KopfFeld teil="vor" label="Vorspann" zeilen={4} geaendert={geaendert}
        platzhalter={"z. B.\nM110 ( C-Achse ein )\nM80 S3000 ( Fraesspindel )"} />
      <KopfFeld teil="nach" label="Nachspann" zeilen={3} geaendert={geaendert}
        platzhalter={"z. B.\nM81 ( Fraesspindel aus )\nM111 ( C-Achse aus )"} />
    </details>
  );
}

function KopfFeld({ teil, label, zeilen: rows, platzhalter, geaendert }) {
  const taste = useRef(null);
  useEffect(() => () => clearTimeout(taste.current), []);
  return (
    <label className="feld"><span>{label}</span>
      <textarea data-gckopf={teil} rows={rows} placeholder={platzhalter} defaultValue={maschinenkopf[teil]}
        onChange={(e) => {
          const wert = e.target.value;
          clearTimeout(taste.current);
          taste.current = setTimeout(() => {
            maschinenkopf[teil] = wert;
            alt.einstellungSetzenWert("gckopf" + teil, wert);
            geaendert();
          }, 600);
        }} /></label>
  );
}
