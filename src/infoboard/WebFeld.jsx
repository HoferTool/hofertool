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
//
//  Echtes Chrome-Fenster (amPc, nur Infoboard, Wunsch Patrick 29. Oktober
//  2026: „kannst du nicht den Browser anzeigen?“): die Anzeige zeigt nur
//  eine dunkle Fläche und meldet, wo auf dem Bildschirm sie in Pixeln
//  liegt (infoboard_fenster_melden, sql/infoboard-fenster.sql). Das
//  Programm skripte/infoboard-fenster.ps1 am Infoboard-PC liest das und
//  legt ein Chrome-Fenster ohne Rahmen darüber. So geht jede Seite, auch
//  gesperrte und solche mit Anmeldung.
//
//  Programmfenster (art "programm", Wunsch Patrick 29. Oktober 2026:
//  Livebild der Tapo-Kamera mit BlueStacks): dasselbe für ein beliebiges
//  Fenster am PC, gefunden am Titel. teil = { art: "programm", titel,
//  verknuepfung, schnitt: { oben, rechts, unten, links } }. Die Ränder
//  schneidet das Programm am PC weg (Leisten von BlueStacks, Knöpfe der
//  App), damit nur das Bild übrig bleibt.
// =================================================================
import { useEffect, useRef, useState } from "react";
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
        + "). Am Infoboard geht es trotzdem: hinzufügen und rechts das Häkchen „Als echtes Chrome-Fenster am Infoboard-PC“ setzen."
        + " Sonst stünde am Bildschirm nur ein Hinweis.",
      bestaetigen: "Trotzdem hinzufügen", abbrechen: "Abbrechen" });
    if (!ok) return null;
    feld.gesperrt = p.grund || "gesperrt";
  } else if (p.erreichbar === false && p.einbettbar !== null) {
    alt.meldung("Die Seite antwortet mit Fehler " + (p.status || "") + ". Bitte Adresse prüfen.", "warn");
  }
  return feld;
}

// Fenster zum Hinzufügen oder Ändern eines Programmfensters
export async function programmBearbeiten(t) {
  const s = (t && t.schnitt) || {};
  const w = await alt.dialogFelder({
    titel: t ? "Programmfenster ändern" : "Programmfenster hinzufügen",
    text: "Ein Fenster am Infoboard-PC, etwa BlueStacks mit der Tapo-App, kommt genau über dieses Feld. "
      + "Das Programm infoboard-fenster am PC muss laufen.",
    felder: [
      { name: "titel", label: "Titel des Fensters (ein Teil reicht)", wert: t ? t.titel : "BlueStacks", pflicht: true },
      { name: "verknuepfung", label: "Starten mit Verknüpfung auf dem Desktop", wert: t ? t.verknuepfung || "" : "Tapo",
        platzhalter: "z. B. Tapo", hinweis: "Name der Verknüpfung ohne .lnk. Ist das Fenster nicht offen, startet das Programm sie." },
      { name: "oben", label: "Oben abschneiden (Pixel)", wert: s.oben || 0 },
      { name: "rechts", label: "Rechts abschneiden (Pixel)", wert: s.rechts || 0 },
      { name: "unten", label: "Unten abschneiden (Pixel)", wert: s.unten || 0 },
      { name: "links", label: "Links abschneiden (Pixel)", wert: s.links || 0 },
    ],
    bestaetigen: t ? "Speichern" : "Hinzufügen",
  });
  if (!w) return null;
  const zahl = (v) => Math.max(0, Math.min(2000, Math.round(Number(String(v || 0).replace(",", ".")) || 0)));
  return { titel: String(w.titel || "").trim(), verknuepfung: String(w.verknuepfung || "").trim(),
    schnitt: { oben: zahl(w.oben), rechts: zahl(w.rechts), unten: zahl(w.unten), links: zahl(w.links) } };
}

export function ProgrammFlaeche({ feld, bearbeiten }) {
  if (!feld.titel) return null;
  const s = feld.schnitt || {};
  return (
    <div className="ib-web-pc" data-ibwebpc={feld.id} data-programm={feld.titel}
      data-verknuepfung={feld.verknuepfung || ""}
      data-schnitt={[s.oben || 0, s.rechts || 0, s.unten || 0, s.links || 0].join(",")}>
      {bearbeiten && <><strong>{feld.titel}</strong><span>Programmfenster am Infoboard-PC</span></>}
    </div>
  );
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
  if (feld.amPc) {
    return (
      <div className="ib-web-pc" data-ibwebpc={feld.id} data-adresse={feld.adresse}
        data-neuladen={feld.neuLaden || 0} data-zoom={feld.zoom || 100}>
        {bearbeiten && <><strong>{host}</strong><span>Chrome-Fenster am Infoboard-PC</span></>}
      </div>
    );
  }
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

// Meldet je Minute und nach jeder Änderung, wo die Chrome-Fenster hin
// sollen. Eine leere Liste (Nacht, Anzeige zu) lässt das Programm am PC
// die Fenster schliessen; bleibt die Meldung länger aus, tut es das auch.
const MELDEN_MS = 60000;
function fensterLesen(huelle) {
  const f = window.devicePixelRatio || 1;
  // Oberkante des Inhalts auf dem Bildschirm: im Vollbild 0, sonst unter
  // der Leiste des Browsers
  const x0 = window.screenX + (window.outerWidth - window.innerWidth) / 2;
  const y0 = window.screenY + Math.max(0, window.outerHeight - window.innerHeight);
  return [...huelle.querySelectorAll("[data-ibwebpc]")].map((el) => {
    const r = el.getBoundingClientRect();
    if (el.dataset.programm) {
      const [oben, rechts, unten, links] = (el.dataset.schnitt || "").split(",").map((z) => Number(z) || 0);
      return { id: el.dataset.ibwebpc, programm: el.dataset.programm, verknuepfung: el.dataset.verknuepfung || "",
        schnitt: { oben, rechts, unten, links }, f,
        x: Math.round((x0 + r.left) * f), y: Math.round((y0 + r.top) * f),
        w: Math.round(r.width * f), h: Math.round(r.height * f) };
    }
    return { id: el.dataset.ibwebpc, adresse: el.dataset.adresse,
      neuLaden: Number(el.dataset.neuladen) || 0, zoom: Number(el.dataset.zoom) || 100, f,
      x: Math.round((x0 + r.left) * f), y: Math.round((y0 + r.top) * f),
      w: Math.round(r.width * f), h: Math.round(r.height * f) };
  }).filter((w) => w.w > 20 && w.h > 20 && (w.adresse || w.programm));
}

export function useFensterMelden(board, huelle, abh) {
  const zuletzt = useRef("");
  useEffect(() => {
    if (!board || !huelle) return;
    const senden = (liste, immer) => {
      const text = JSON.stringify(liste);
      if (!immer && text === zuletzt.current) return;
      zuletzt.current = text;
      Promise.resolve(alt.db.rpc("infoboard_fenster_melden", { p_board: board, p_fenster: liste })).then(() => {}, () => {});
    };
    const jetzt = (immer) => senden(fensterLesen(huelle), immer);
    // Kurz warten, bis die Tafel eingepasst ist
    const t1 = setTimeout(() => jetzt(false), 1500);
    const uhr = setInterval(() => jetzt(true), MELDEN_MS);
    const groesse = () => jetzt(false);
    window.addEventListener("resize", groesse);
    return () => { clearTimeout(t1); clearInterval(uhr); window.removeEventListener("resize", groesse); };
  }, [board, huelle, ...abh]);
  // Anzeige zu: Fenster weg
  useEffect(() => () => {
    if (board) Promise.resolve(alt.db.rpc("infoboard_fenster_melden", { p_board: board, p_fenster: [] })).then(() => {}, () => {});
  }, [board]);
}
