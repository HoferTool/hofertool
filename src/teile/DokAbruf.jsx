// =================================================================
//  DOKUMENTE AUF ABRUF — WBG und Zeichnung beim Öffnen nachschauen
//
//  Wunsch Patrick 8. Oktober 2026: Wer eine WBG oder eine Zeichnung
//  öffnet, soll die neueste aus dem Ordner bekommen, ohne Knopf in den
//  Einstellungen und ohne dass der Pool-Rechner alle fünf Minuten alles
//  durchsucht. Darum legt die App eine Anfrage in dok_abruf an.
//  dokumente-abruf.ps1 auf dem Pool-Rechner schaut alle zwei Sekunden
//  nach, leert für eine WBG den Pool-Ordner (lädt alle WBGs hoch und
//  löscht sie dort), sucht für eine Zeichnung die PDF der HOCO Nr. im
//  Zeichnungs-Ordner (nur lesen) und trägt das Ergebnis ein.
//
//  Liegt schon eine Datei in der App, ist sie sofort zu sehen, und im
//  Kopf steht, dass nachgeschaut wird. Kommt eine neuere, wechselt die
//  Anzeige. Ist nichts da: „Keine WBG vorhanden“.
//
//  Ohne sql/dok-abruf.sql oder wenn der Rechner nicht lauscht (er
//  meldet sich alle 30 Sekunden unter app_config.dok_abruf_status),
//  zeigt die App einfach, was schon da ist, ohne zu warten.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { Betrachter } from "./Betrachter.jsx";
import { istExcel } from "./excelLesen.js";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Lauscht der Rechner? Kurz gemerkt, damit das Pad nicht bei jedem
// Tipp nachfragt.
let lauschtGemerkt = { zeit: 0, wert: false };
async function rechnerLauscht() {
  if (Date.now() - lauschtGemerkt.zeit < 20000) return lauschtGemerkt.wert;
  let wert = false;
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert")
      .eq("schluessel", "dok_abruf_status").maybeSingle(), 6000, "Abruf");
    const st = r && r.data && r.data.wert ? JSON.parse(r.data.wert) : null;
    wert = !!(st && st.gesehen && Date.now() - new Date(st.gesehen).getTime() < 90000);
  } catch (f) { /* dann eben nicht */ }
  lauschtGemerkt = { zeit: Date.now(), wert };
  return wert;
}

// Dieselbe Anfrage kurz hintereinander (Pad: öffnen, schliessen,
// nochmals öffnen) geht nur einmal an den Rechner
const laufend = new Map();

// Ergebnis: { ergebnis: "neu" | "da" | "gleich" | "keines" | "aus" | "zeit", adresse, meldung }
export function dokAbrufen({ art, hoco, auftragId, fa }) {
  const schluessel = art + "|" + (art === "wbg" ? auftragId || hoco : hoco);
  const da = laufend.get(schluessel);
  if (da && Date.now() - da.zeit < 30000) return da.versprechen;
  const versprechen = abrufen({ art, hoco, auftragId, fa });
  laufend.set(schluessel, { zeit: Date.now(), versprechen });
  // Ein Fehlschlag soll beim nächsten Öffnen neu versucht werden
  versprechen.then((e) => { if (e.ergebnis === "aus" || e.ergebnis === "zeit") laufend.delete(schluessel); });
  return versprechen;
}

async function abrufen({ art, hoco, auftragId, fa }) {
  if (!(await rechnerLauscht())) return { ergebnis: "aus" };
  let id;
  try {
    const r = await alt.zeitlimit(alt.db.from("dok_abruf").insert([{ art, hoco_nr: hoco || null,
      auftrag_id: auftragId || null, fa_nr: fa || null }]).select("id").single(), 8000, "Abruf");
    if (r.error || !r.data) return { ergebnis: "aus" };
    id = r.data.id;
  } catch (f) { return { ergebnis: "aus" }; }
  const start = Date.now();
  while (true) {
    await pause(1000);
    let z = null;
    try {
      const r = await alt.db.from("dok_abruf").select("angefangen, erledigt, ergebnis, adresse, meldung")
        .eq("id", id).maybeSingle();
      z = r && r.data;
    } catch (f) { /* gleich nochmals */ }
    if (z && z.erledigt) return { ergebnis: z.ergebnis || "keines", adresse: z.adresse || "", meldung: z.meldung || "" };
    // Nicht angefangen: Der Rechner lauscht doch nicht (eben ausgeschaltet)
    if (!(z && z.angefangen) && Date.now() - start > 15000) return { ergebnis: "aus" };
    // Ein voller Pool-Ordner kann dauern, aber nicht ewig
    if (Date.now() - start > 180000) return { ergebnis: "zeit" };
  }
}

// Ansehen mit Nachschauen. art "wbg" braucht den Auftrag (auftragId,
// hoco, fa), "zeichnung" die HOCO Nr. „neu(adresse)“ meldet dem
// Aufrufer eine neue Datei, auch wenn das Fenster schon zu ist.
export function dokZeigen({ art, titel, adresse, hoco, auftragId, fa, neu }) {
  fensterOeffnen((zu) => <AbrufAnsicht art={art} titel={titel} start={adresse || ""} hoco={hoco}
    auftragId={auftragId} fa={fa} neu={neu} zu={zu} />, null, "betrachter-huelle");
}

const istBild = (a) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(a || ""));
const artDerDatei = (a) => (istExcel(a) ? "excel" : istBild(a) ? "bild" : "pdf");

function AbrufAnsicht({ art, titel, start, hoco, auftragId, fa, neu, zu }) {
  const [adresse, setAdresse] = useState(start);
  const [suche, setSuche] = useState(true);
  const [grund, setGrund] = useState("");
  const [hinweis, setHinweis] = useState("");
  const name = art === "wbg" ? "WBG" : "Zeichnung";

  useEffect(() => {
    let weg = false;
    dokAbrufen({ art, hoco, auftragId, fa }).then((e) => {
      const kam = e.adresse && e.adresse !== start;
      if (kam && neu) { try { neu(e.adresse); } catch (f) { /* Anzeige zählt mehr */ } }
      if (weg) return;
      if (kam) {
        setAdresse(e.adresse);
        if (start) setHinweis("Neuere " + name + " aus dem Ordner");
      }
      if (!e.adresse && !start) {
        setGrund(e.ergebnis === "aus" ? "Der Rechner mit dem Ordner antwortet gerade nicht."
          : e.ergebnis === "zeit" ? "Der Rechner mit dem Ordner hat nicht rechtzeitig geantwortet."
          : e.meldung || "");
      }
      setSuche(false);
    });
    return () => { weg = true; };
  }, []);

  if (adresse) {
    return <Betrachter key={adresse} adresse={adresse} titel={titel} art={artDerDatei(adresse)} zu={zu}
      hinweis={suche ? <><span className="si-dreher" aria-hidden="true" /> Schaue im Ordner nach Neuerem …</> : hinweis} />;
  }
  return (
    <div className="betrachter">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">{titel || ""}</span>
        <div className="betrachter__knoepfe">
          <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
        </div>
      </div>
      <div className="betrachter__buehne">
        {suche
          ? <div className="abruf-leer" data-abruf="suche"><span className="si-dreher" aria-hidden="true" />
              Schaue im Ordner nach der {name} …</div>
          : <div className="abruf-leer" data-abruf="keines"><b>Keine {name} vorhanden</b>
              {grund && <span className="klein">{grund}</span>}</div>}
      </div>
    </div>
  );
}
