// =================================================================
//  ALLE EXCEL-EINRICHTBLÄTTER EINES TYPS EINLESEN
//  Einmal für die bestehenden Blätter (Wunsch Patrick, 12. Oktober
//  2026: „alle Einrichtblätter lesen für jetzt, die neuen erstellen wir
//  im Tool“). Läuft im Browser der Reihe nach, damit die Datenbank nicht
//  mit Hunderten gleichzeitigen Anfragen überrollt wird. Blätter, die
//  schon in der App sind, bleiben unverändert. Das Excel bleibt, bis
//  jemand beim einzelnen Blatt „Blatt ist gut“ drückt.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { ausExcelEinlesen, tabelleFehlt } from "./daten.js";
import { einrichtblattAppOeffnen } from "./Blatt.jsx";

function EinlesenFenster({ typ, liste, zu }) {
  const [stand, setStand] = useState({ fertig: 0, ergebnisse: [], laeuft: true });
  const stopp = useRef(false);
  useEffect(() => {
    (async () => {
      const artikel = {};
      const ergebnisse = [];
      for (let i = 0; i < liste.length; i++) {
        if (stopp.current) break;
        const z = liste[i];
        let e;
        try { e = await ausExcelEinlesen(z.hoco_nr, typ, z.blatt_url, { artikel }); }
        catch (f) { e = { ok: false, hoco: z.hoco_nr, hinweise: [alt.fehlertext(f)] }; }
        ergebnisse.push(e);
        setStand({ fertig: i + 1, ergebnisse: ergebnisse.slice(), laeuft: true });
        // Ohne die Tabelle (SQL nicht ausgeführt) scheitern alle gleich
        if (!e.ok && tabelleFehlt(e.hinweise[0])) break;
      }
      setStand((s) => Object.assign({}, s, { laeuft: false }));
    })();
    return () => { stopp.current = true; };
  }, []);
  const neu = stand.ergebnisse.filter((e) => e.ok && !e.schon).length;
  const schon = stand.ergebnisse.filter((e) => e.schon).length;
  const fehler = stand.ergebnisse.filter((e) => !e.ok).length;
  const pruefen = stand.ergebnisse.filter((e) => !e.schon && e.hinweise.length);
  return (
    <div className="dialog eba-einlesen" data-eba-einlesen="">
      <h2>Einrichtblätter {typ.name} einlesen</h2>
      <p>{stand.laeuft ? "Läuft … " : "Fertig. "}{alt.zahlText(stand.fertig)} von {alt.zahlText(liste.length)}
        {" · "}neu {alt.zahlText(neu)} · schon in der App {alt.zahlText(schon)} · Fehler {alt.zahlText(fehler)}</p>
      <div className="eba-balken"><span style={{ width: (liste.length ? 100 * stand.fertig / liste.length : 100) + "%" }} /></div>
      {pruefen.length > 0 && <>
        <p className="klein">Bitte anschauen (antippen öffnet das Blatt):</p>
        <ul className="eba-einlesen-liste">
          {pruefen.map((e) => <li key={e.hoco} data-eba-hinweis={e.hoco}>
            <button className="linkknopf" onClick={() => einrichtblattAppOeffnen(e.hoco, typ.id)}>{e.hoco}</button>
            {" "}{e.hinweise.join(" · ")}</li>)}
        </ul></>}
      <div className="dialog__knoepfe">
        {stand.laeuft
          ? <button className="knopf" data-eba-stopp="" onClick={() => { stopp.current = true; }}>Anhalten</button>
          : <button className="knopf knopf--haupt" data-zu="" onClick={zu}>Schliessen</button>}
      </div>
    </div>
  );
}

export async function alleEinlesen(typ) {
  const r = await alt.db.from("hoco_type_data").select("hoco_nr, blatt_url").eq("type_id", typ.id);
  if (r.error) throw r.error;
  const liste = (r.data || []).filter((z) => z.hoco_nr && /\.(xlsx|xlsm)(\?|#|$)/i.test(String(z.blatt_url || "")))
    .sort((a, b) => String(a.hoco_nr).localeCompare(String(b.hoco_nr)));
  if (!liste.length) { alt.meldung("Für " + typ.name + " ist kein Excel-Einrichtblatt hinterlegt.", "warn"); return; }
  const ok = await alt.nachfragen({ titel: "Einrichtblätter einlesen",
    text: alt.zahlText(liste.length) + " Excel-Einrichtblätter von " + typ.name + " werden in die App übernommen. "
      + "Blätter, die schon in der App sind, bleiben. Die Excel-Dateien bleiben, bis beim Blatt „Blatt ist gut“ gedrückt wird.",
    bestaetigen: "Einlesen" });
  if (!ok) return;
  fensterOeffnen((zu) => <EinlesenFenster typ={typ} liste={liste} zu={zu} />);
}
