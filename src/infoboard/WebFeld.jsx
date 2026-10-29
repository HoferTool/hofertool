// =================================================================
//  INFOBOARD: WEBSEITE
//  Eine Webseite als Teil auf der Tafel (Wunsch Patrick 29. Oktober
//  2026: „im Infoboard auch Webseiten anzeigen“), als eingebetteter
//  Rahmen (iframe). teil = { art: "web", adresse, zoom, neuLaden, gesperrt }
//
//  Viele Seiten (Google, Facebook, die meisten Banken und Zeitungen)
//  verbieten das Einbetten. Der Browser verrät das der App nicht, er
//  zeigt nur ein graues Feld. Darum fragt die App beim Hinzufügen die
//  Server-Funktion webseite-pruefen; ist die Seite gesperrt, steht am
//  Bildschirm ein sauberer Hinweis statt des grauen Felds. Ohne die
//  Funktion (oder ohne Netz) zeigt sie die Seite einfach.
//
//  Die Seite ist meist für einen breiten Bildschirm gemacht, darum
//  „Darstellung“: bei 50 % ist der Rahmen doppelt so breit und wird auf
//  die Hälfte verkleinert, man sieht also mehr von der Seite.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";

export const NEU_LADEN = [[0, "Nie von selbst"], [1, "jede Minute"], [5, "alle 5 Minuten"],
  [15, "alle 15 Minuten"], [60, "jede Stunde"]];
const ZOOM = [[25, "25 % (sehr viel von der Seite)"], [50, "50 %"], [75, "75 %"], [100, "100 % (wie im Browser)"],
  [150, "150 % (gross)"], [200, "200 %"]];

// http-Seiten lädt der Browser auf unserer https-Seite nicht, darum https
export function adresseOrdnen(text) {
  let a = String(text || "").trim();
  if (!a) return "";
  if (!/^[a-z]+:\/\//i.test(a)) a = "https://" + a;
  a = a.replace(/^http:\/\//i, "https://");
  try {
    const u = new URL(a);
    return u.protocol === "https:" ? u.href : "";
  } catch { return ""; }
}

// { einbettbar: true | false | null, grund }
async function pruefen(adresse) {
  try {
    const r = await alt.zeitlimit(alt.db.functions.invoke("webseite-pruefen", { body: { adresse } }), 12000, "Webseite prüfen");
    if (r.error || !r.data) return { einbettbar: null };
    return r.data;
  } catch { return { einbettbar: null }; }
}

// Fenster zum Hinzufügen oder Ändern. Ergibt die Felder des Teils oder null.
export async function webBearbeiten(t) {
  const w = await alt.dialogFelder({
    titel: t ? "Webseite ändern" : "Webseite hinzufügen",
    text: "Viele grosse Seiten (Google, Facebook, YouTube-Startseite …) lassen sich nicht einbetten. Die App prüft das gleich.",
    felder: [
      { name: "adresse", label: "Adresse", wert: t ? t.adresse : "", platzhalter: "z. B. www.meteoschweiz.admin.ch", pflicht: true },
      { name: "zoom", label: "Darstellung", wert: t ? t.zoom || 100 : 50, auswahl: ZOOM,
        hinweis: "Kleiner zeigt mehr von der Seite." },
      { name: "neuLaden", label: "Neu laden", wert: t ? t.neuLaden || 0 : 15, auswahl: NEU_LADEN },
    ],
    bestaetigen: t ? "Speichern" : "Hinzufügen",
  });
  if (!w) return null;
  const adresse = adresseOrdnen(w.adresse);
  if (!adresse) { alt.meldung("Das ist keine gültige Adresse.", "warn"); return null; }
  const feld = { adresse, zoom: Number(w.zoom) || 100, neuLaden: Number(w.neuLaden) || 0, gesperrt: "" };
  const p = await pruefen(adresse);
  if (p.einbettbar === false) {
    const ok = await alt.nachfragen({
      titel: "Seite lässt sich nicht einbetten",
      text: "Diese Seite verbietet es, in einer anderen Seite angezeigt zu werden (" + (p.grund || "gesperrt")
        + "). Am Bildschirm stünde nur ein Hinweis. Alternative: ein Bildschirmfoto oder PDF der Seite als Datei hinzufügen.",
      bestaetigen: "Trotzdem hinzufügen", abbrechen: "Abbrechen" });
    if (!ok) return null;
    feld.gesperrt = p.grund || "gesperrt";
  } else if (p.erreichbar === false && p.einbettbar !== null) {
    alt.meldung("Die Seite antwortet mit Fehler " + (p.status || "") + ". Bitte Adresse prüfen.", "warn");
  }
  return feld;
}

export function WebFlaeche({ feld, bearbeiten }) {
  const [runde, setRunde] = useState(0);
  const minuten = feld.neuLaden || 0;
  useEffect(() => {
    if (!minuten || bearbeiten) return;
    const uhr = setInterval(() => setRunde((r) => r + 1), minuten * 60000);
    return () => clearInterval(uhr);
  }, [minuten, bearbeiten]);
  let host = feld.adresse;
  try { host = new URL(feld.adresse).host; } catch { /* bleibt */ }
  if (!feld.adresse) return null;
  if (feld.gesperrt) {
    return (
      <div className="ib-web-gesperrt" data-ibweb="gesperrt">
        <strong>{host}</strong>
        <span>Diese Webseite lässt sich nicht im Infoboard anzeigen.</span>
      </div>
    );
  }
  const k = (feld.zoom || 100) / 100;
  return (
    <div className="ib-web">
      <iframe key={runde} src={feld.adresse} title={host} data-ibweb="rahmen"
        referrerPolicy="no-referrer" loading="eager"
        // Die Seite darf nicht die ganze App wegnavigieren (Kiosk)
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        style={{ width: 100 / k + "%", height: 100 / k + "%", transform: "scale(" + k + ")" }} />
    </div>
  );
}
