// HOFERTIME: persönlicher Stempel-Link für die Kurzbefehle am iPhone
// (Wunsch Patrick 19. November 2026: „Zeit erfassen, sobald ich im WLAN
// hoferco bin, und stoppen, wenn ich weg bin“). Eine Webseite sieht das
// WLAN nicht; die Automation der Kurzbefehle ruft beim Verbinden den Link
// Kommen und beim Trennen den Link Gehen auf (Server-Funktion zeit-wlan).
// Der Schlüssel steht nur einmal hier, gespeichert ist nur sein
// Fingerabdruck (sql/hofertime-13-wlan.sql).
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

const ADRESSE = "https://lzhqwbxfwqamauntehof.supabase.co/functions/v1/zeit-wlan";

async function kopieren(text) {
  try { await navigator.clipboard.writeText(text); alt.meldung("Kopiert.", "gut"); }
  catch { alt.meldung("Kopieren ging nicht. Link lange drücken und kopieren.", "warn"); }
}

function Fenster({ zu }) {
  const [stand, setStand] = useState(null); // null lädt, false keiner, Datum
  const [schluessel, setSchluessel] = useState("");

  const laden = () => alt.db.rpc("zeit_link_stand").then((r) => setStand(r.error ? false : (r.data || false)), () => setStand(false));
  useEffect(() => { laden(); }, []);

  async function erstellen() {
    if (stand && !await alt.nachfragen({ titel: "Neuen Link erstellen?", text: "Der bisherige Link geht danach nicht mehr. In den Kurzbefehlen beide Links ersetzen.", bestaetigen: "Neu erstellen" })) return;
    const r = await alt.db.rpc("zeit_link_erstellen");
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    setSchluessel(String(r.data)); laden();
  }
  async function abschalten() {
    if (!await alt.nachfragen({ titel: "Link abschalten?", text: "Das iPhone stempelt danach nicht mehr von selbst.", bestaetigen: "Abschalten", gefahr: true })) return;
    const r = await alt.db.rpc("zeit_link_loeschen");
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    setSchluessel(""); laden();
  }

  const link = (art) => ADRESSE + "?art=" + art + "&s=" + schluessel;
  return (
    <div className="dialog ze-wlan" role="dialog" aria-modal="true" id="ze-wlan">
      <button className="dialog__x" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2>Stempeln über WLAN</h2>
      <p className="klein">Die App Kurzbefehle am iPhone ruft beim Verbinden mit dem WLAN den Link Kommen auf und beim
        Trennen den Link Gehen. Ist das WLAN nur kurz weg (unter 10 Minuten), fällt das Gehen wieder weg.</p>
      <p id="ze-wlan-stand">{stand === null ? "Wird geladen …"
        : stand ? "Link aktiv seit " + alt.datumZeitKurz(stand) + "." : "Noch kein Link."}</p>
      {schluessel && <div className="ze-wlan__links" id="ze-wlan-links">
        <p><b>Nur jetzt sichtbar.</b> Beide Links in die Kurzbefehle kopieren. Wer den Link hat, kann für dich stempeln.</p>
        {["kommen", "gehen"].map((art) => (
          <div key={art} className="ze-wlan__link">
            <b>{art === "kommen" ? "Kommen" : "Gehen"}</b>
            <code data-ze-wlan-link={art}>{link(art)}</code>
            <button className="knopf knopf--klein" onClick={() => kopieren(link(art))}>Kopieren</button>
          </div>))}
      </div>}
      <div className="dialog__knoepfe">
        {stand && <button className="knopf knopf--gefahr" id="ze-wlan-aus" onClick={abschalten}>Abschalten</button>}
        <button className="knopf" onClick={zu}>Schliessen</button>
        <button className="knopf knopf--haupt" id="ze-wlan-neu" onClick={erstellen}>{stand ? "Neuen Link erstellen" : "Link erstellen"}</button>
      </div>
    </div>);
}

export function wlanOeffnen() {
  fensterOeffnen((zu) => <Fenster zu={zu} />);
}
