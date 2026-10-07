// =================================================================
//  EINSTELLUNGEN · Notizbücher (nur Admins)
//  Ein gesperrtes Notizbuch ist auch für Admins zu. Hat jemand sein
//  Passwort vergessen, setzt ein Admin hier ein neues, ohne das alte
//  zu kennen, oder hebt die Sperre ganz auf (Wunsch Patrick
//  7. Oktober 2026). Das Buch geht dabei für den Admin nicht auf; die
//  Datenbank prüft das Admin-Recht (notizbuch_passwort_admin).
// =================================================================
import { useCallback, useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Gruppe } from "./teile.jsx";
import { buecherLaden, passwortAdmin, passwortText, fehltFunktion, fehltTabelle } from "../notizbuch/daten.js";

const SQL_FEHLT = "Das geht, sobald die Datei notizbuch-passwort.sql in Supabase ausgeführt ist.";

export default function Notizbuecher() {
  const [buecher, setBuecher] = useState(null);
  const [fehlt, setFehlt] = useState("");

  const laden = useCallback(async () => {
    try { setBuecher((await buecherLaden()) || []); }
    catch (e) {
      setBuecher([]);
      setFehlt(fehltTabelle(e) ? "Notizbücher sind noch nicht eingerichtet." : alt.fehlertext(e));
    }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const senden = async (b, neu, gut) => {
    try {
      const r = await passwortAdmin(b.id, neu);
      if (r !== "ok") { alt.meldung(passwortText(r) || "Nicht gespeichert.", "fehler"); return; }
      alt.meldung(gut, "gut");
      laden();
    } catch (f) {
      alt.meldung(fehltFunktion(f) ? SQL_FEHLT : alt.fehlertext(f), fehltFunktion(f) ? "warn" : "fehler");
    }
  };

  const neuesPasswort = async (b) => {
    const w = await alt.dialogFelder({
      titel: (b.gesperrt ? "Neues Passwort für „" : "„") + b.name + (b.gesperrt ? "“" : "“ sperren"),
      text: b.gesperrt ? "Das bisherige Passwort gilt danach nicht mehr. Gib das neue der Person, die das Buch braucht."
        : "Die Seiten sieht danach nur, wer das Passwort eingibt, auch kein Admin.",
      felder: [
        { name: "neu", label: "Neues Passwort", typ: "password", pflicht: true, hinweis: "Mindestens 4 Zeichen." },
        { name: "nochmals", label: "Passwort nochmals", typ: "password", pflicht: true }],
      bestaetigen: b.gesperrt ? "Speichern" : "Sperren" });
    if (!w) return;
    if (w.neu !== w.nochmals) { alt.meldung("Die beiden Passwörter sind nicht gleich.", "warn"); return; }
    if (w.neu.length < 4) { alt.meldung("Das Passwort braucht mindestens 4 Zeichen.", "warn"); return; }
    senden(b, w.neu, b.gesperrt ? "Neues Passwort gesetzt." : "Notizbuch gesperrt.");
  };

  const sperreWeg = async (b) => {
    const ok = await alt.nachfragen({ titel: "Sperre aufheben?",
      text: "„" + b.name + "“ ist danach für alle ohne Passwort offen.", bestaetigen: "Sperre aufheben" });
    if (ok) senden(b, "", "Sperre aufgehoben.");
  };

  return (
    <Gruppe titel="Notizbücher mit Passwort"
      text="Ein gesperrtes Notizbuch ist auch für Admins zu. Hat jemand das Passwort vergessen, setzt du hier ein neues, ohne das alte zu kennen, oder hebst die Sperre auf.">
      {fehlt && <p className="es-zeile__hinweis">{fehlt}</p>}
      {buecher === null && <p className="es-zeile__hinweis">Wird geladen …</p>}
      {buecher && !buecher.length && !fehlt && <p className="es-zeile__hinweis">Noch kein Notizbuch.</p>}
      {buecher && buecher.length > 0 &&
        <ul className="es-nb-liste">
          {buecher.map((b) => (
            <li key={b.id} className="es-nb" data-esnb={b.id}>
              <span className="es-nb__ruecken" style={{ background: b.farbe }} />
              <span className="es-nb__name">{b.name}</span>
              <span className={"es-nb__stand" + (b.gesperrt ? " zu" : "")}>{b.gesperrt ? "Gesperrt" : "Offen"}</span>
              <span className="es-nb__knoepfe">
                <button type="button" className="knopf" data-esnbneu="" onClick={() => neuesPasswort(b)}>
                  {b.gesperrt ? "Neues Passwort" : "Sperren"}</button>
                {b.gesperrt && <button type="button" className="knopf" data-esnbweg=""
                  onClick={() => sperreWeg(b)}>Sperre aufheben</button>}
              </span>
            </li>))}
        </ul>}
    </Gruppe>
  );
}
