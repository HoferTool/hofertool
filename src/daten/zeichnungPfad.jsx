// =================================================================
//  PFAD DER ZEICHNUNG AUF DEM LAUFWERK
//  Der Pool-Rechner (skripte/zeichnungen.ps1) schreibt beim Hochladen
//  in hoco_parts.zeichnung_quelle, woher die Zeichnung kommt. Der
//  Browser darf keine Datei vom Laufwerk öffnen, darum bietet die App
//  den Pfad zum Kopieren an: Windows-Taste + R, Strg + V, Enter öffnet
//  sie im PDF-Programm (Wunsch Patrick, 9. Oktober 2026).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";

const gemerkt = new Map();   // Adresse → Promise<Pfad oder null>

// Pfad zur Adresse einer Zeichnung, nur solange die Adresse noch die
// ist, die der Pool-Rechner hochgeladen hat (von Hand ersetzt: keiner)
export function zeichnungPfad(adresse) {
  if (!adresse || !/^https?:/i.test(adresse) || !alt.db) return Promise.resolve(null);
  if (!gemerkt.has(adresse)) {
    gemerkt.set(adresse, (async () => {
      try {
        const r = await alt.db.from("hoco_parts").select("zeichnung_quelle")
          .eq("zeichnung_url", adresse).limit(1);
        const q = r && !r.error && r.data && r.data[0] && r.data[0].zeichnung_quelle;
        return q && q.pfad && q.url === adresse ? String(q.pfad) : null;
      } catch (_) { return null; }   // Spalte fehlt noch: einfach kein Pfad
    })());
  }
  return gemerkt.get(adresse);
}

// Auf Handy und iPad nützt ein Laufwerkspfad nichts. Nicht an der
// Berührung erkennen: ein Windows-PC mit Touchscreen soll ihn haben.
// Ein iPad meldet sich als Mac, hat aber Berührungspunkte.
function ohneLaufwerk() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua)
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
    || (alt.isMobil && alt.isMobil());
}

export function usePfad(adresse) {
  const [pfad, setPfad] = useState(null);
  useEffect(() => {
    let weg = false;
    setPfad(null);
    if (ohneLaufwerk()) return;
    zeichnungPfad(adresse).then((p) => { if (!weg) setPfad(p); });
    return () => { weg = true; };
  }, [adresse]);
  return pfad;
}

export async function pfadKopieren(pfad) {
  let ok = false;
  try { await navigator.clipboard.writeText(pfad); ok = true; } catch (_) {
    // Ohne Zugriff auf die Zwischenablage (alter Browser, kein https)
    const feld = document.createElement("textarea");
    feld.value = pfad; feld.style.position = "fixed"; feld.style.opacity = "0";
    document.body.appendChild(feld); feld.select();
    try { ok = document.execCommand("copy"); } catch (_) { }
    feld.remove();
  }
  if (ok) alt.meldung("Pfad kopiert. Zum Öffnen: Windows-Taste + R, Strg + V, Enter.", "gut");
  else alt.meldung("Kopieren ging nicht. Pfad: " + pfad, "warn");
}

// Kleines Kopier-Zeichen, etwa neben „Zeichnung“ im Auftragsfenster
export function PfadKopieren({ adresse }) {
  const pfad = usePfad(adresse);
  if (!pfad) return null;
  return <button type="button" className="pfad-kopieren" data-pfadkopieren="" title={"Pfad kopieren: " + pfad}
    aria-label="Pfad der Zeichnung kopieren" onClick={() => pfadKopieren(pfad)}>
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg></button>;
}
