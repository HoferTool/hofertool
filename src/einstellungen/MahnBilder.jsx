// =================================================================
//  EINSTELLUNGEN → SYMBOLE → BILDER IM PAD MODE (nur Admins)
//  Das Bild, das im Pad neben einer fehlenden Stückzeit oder einer
//  heute noch fehlenden Stückzahl blinkt (Wunsch Patrick, 12. Oktober
//  2026). Gespeichert in app_config.pad_mahnbilder, siehe
//  daten/mahnbilder.js; im Repository stehen keine Bilder von Leuten.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { zuschneiden } from "../teile/Zuschnitt.jsx";
import { Gruppe } from "./teile.jsx";
import { MAHN_ARTEN, mahnKonfLesen, mahnKonfSpeichern, mahnBilder } from "../daten/mahnbilder.js";

async function bildWaehlen() {
  const eingabe = document.createElement("input");
  eingabe.type = "file";
  eingabe.accept = "image/*";
  const datei = await new Promise((fertig) => {
    eingabe.onchange = () => fertig((eingabe.files || [])[0] || null);
    eingabe.click();
  });
  if (!datei) return null;
  return zuschneiden(datei, { kante: 160, ganz: true, format: "image/jpeg", alsText: true });
}

export default function MahnBilder() {
  const [konf, setKonf] = useState(null);
  const [bilder, setBilder] = useState({});
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  const laden = async () => {
    try { setKonf(await mahnKonfLesen()); setBilder(await mahnBilder()); }
    catch (f) { setKonf({}); }
  };
  useEffect(() => { laden(); }, []);

  const setzen = async (art, wert, text) => {
    setBeschaeftigt(true);
    try {
      const neu = { ...konf };
      if (wert) neu[art] = wert; else delete neu[art];
      await mahnKonfSpeichern(neu);
      await laden();
      alt.meldung(text, "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setBeschaeftigt(false); }
  };

  if (!konf) return null;
  return (
    <Gruppe titel="Bilder im Pad Mode" id="mahnbilder"
      text={"Fehlt im Pad die Stückzeit oder wurde heute noch keine Stückzahl gemeldet, blinkt die Kachel "
        + "und zeigt dieses Bild. Auf dem Tablet erscheint ein neues Bild nach „Neu laden“."}>
      <div className="sym-liste">
        {MAHN_ARTEN.map(([art, name]) => (
          <div className="sym-zeile" key={art} data-mahnbild={art}>
            <button type="button" className="sym-bild" title="Bild wählen" disabled={beschaeftigt}
              onClick={async () => {
                const b = await bildWaehlen();
                if (b) setzen(art, { bild: b }, "Bild gespeichert.");
              }}>
              {bilder[art] ? <img src={bilder[art]} alt="" /> : <span>Bild wählen</span>}</button>
            <span className="mahnbild-name">{name}</span>
            {(konf[art]) && <button type="button" className="knopf knopf--klein knopf--gefahr" disabled={beschaeftigt}
              onClick={() => setzen(art, null, "Bild entfernt.")}>Entfernen</button>}
          </div>
        ))}
      </div>
    </Gruppe>
  );
}
