// =================================================================
//  NC-PRO → HOFER CAM: Verbindung zu den einzelnen Werkzeugen
//  Jeder Reiter (Kontur, Bohren / Fräsen, Entgraten, C-Achse, Gravur,
//  DXF) meldet hier sein gerade erzeugtes Programm, damit Hofer Cam es
//  holen kann, und bekommt den Knopf „In Hofer Cam“, der es als neue
//  Bearbeitung ans Ende des Programms hängt (seit 1.394.0).
// =================================================================
import { useEffect } from "react";
import { alt } from "../../bruecke.jsx";

export const CAM_ARTEN = [
  ["kontur", "Drehen (Kontur)"], ["bohren", "Bohren / Fräsen"], ["entgraten", "Entgraten"],
  ["cachse", "C-Achse"], ["gravur", "Gravur"], ["dxf", "DXF"], ["frei", "Freie Bearbeitung"],
];
export const artName = (a) => (CAM_ARTEN.find(([w]) => w === a) || [, "Bearbeitung"])[1];

// Zuletzt erzeugtes Programm je Reiter (nur solange die App offen ist)
export const aktuell = {};

// Das Programm von Hofer Cam liegt hier, damit es Reiterwechsel
// übersteht und die anderen Reiter etwas anhängen können
export const camProgramm = { maschine: "", prg: "", name: "", hoco: "", bearb: [] };
let zaehler = 0;
export const neueId = () => "b" + Date.now().toString(36) + (zaehler++);

export function bearbeitungAnhaengen(art, nc, titel) {
  const b = { id: neueId(), art, titel: titel || "", t: "", s: "", nc: nc || "" };
  camProgramm.bearb = [...(camProgramm.bearb || []), b];
  return camProgramm.bearb.length;
}

export function InCamKnopf({ art, nc, titel, klein }) {
  useEffect(() => { aktuell[art] = { nc, titel: titel || "" }; }, [art, nc, titel]);
  return (
    <button className={klein ? "linkknopf" : "knopf knopf--klein"} data-incam={art}
      title="Dieses Programm als neue Bearbeitung ans Programm in Hofer Cam hängen"
      onClick={() => {
        const nr = bearbeitungAnhaengen(art, nc, titel);
        alt.meldung("In Hofer Cam als Bearbeitung " + nr + " eingefügt.", "gut");
      }}>➜ In Hofer Cam</button>
  );
}
