// =================================================================
//  STECKDOSEN
//  Hombli-Steckdosen anzeigen und schalten (Wunsch Patrick 29. Oktober
//  2026: „können wir die ins hofer app anzeigen?“, „auch schalten“).
//  Die App fragt nur die Server-Funktion steckdosen; die Zugangscodes
//  von Tuya (Cloud hinter Hombli und Smart Life) liegen nur dort.
//  Schalten nur mit Schreibrecht, nicht für Externe und Dienst.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";

// Alle 15 Sekunden nachsehen, solange die Seite offen und sichtbar ist,
// damit auch Schalten von Hand oder in Smart Life bald zu sehen ist
const TAKT_MS = 15000;

async function anfrage(body) {
  const { data, error } = await alt.zeitlimit(
    alt.db.functions.invoke("steckdosen", { body: body || {} }), 20000, "Steckdosen");
  if (error) {
    let text = error.message;
    try { const j = await error.context.json(); if (j && j.fehler) text = j.fehler; } catch { /* Text bleibt */ }
    if (/not found|404/i.test(text)) text = "Die Server-Funktion „steckdosen“ ist noch nicht eingerichtet.";
    throw new Error(text);
  }
  return data;
}

export default function Steckdosen() {
  const [takt, setTakt] = useState(0);
  const { daten, fehler, neu } = useDaten(() => anfrage(), [takt]);
  const [wartet, setWartet] = useState({});

  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setTakt((x) => x + 1); }, TAKT_MS);
    return () => clearInterval(t);
  }, []);

  const liste = daten && daten.geraete;
  useSeitenSuche({
    name: "Steckdosen", platzhalter: "Steckdose …",
    eintraege: () => (liste || []).map((g) => ({ gruppe: "Steckdosen", zeichen: "🔌", titel: g.name,
      zeile: g.online ? (g.schalter.some((s) => s.an) ? "ein" : "aus") : "nicht erreichbar", id: g.id })),
    springen: (x) => hinzeigen('[data-steckdose="' + x.id + '"]'),
  });

  const schalten = async (g, s) => {
    const k = g.id + s.code;
    setWartet((w) => ({ ...w, [k]: true }));
    try {
      const r = await anfrage({ aktion: "schalten", id: g.id, code: s.code, an: !s.an });
      if (r && r.fehler) throw new Error(r.fehler);
      alt.meldung(g.name + (s.an ? " ausgeschaltet." : " eingeschaltet."), "gut");
      neu();
    } catch (e) {
      alt.meldung("Schalten ging nicht: " + e.message, "fehler");
    } finally {
      setWartet((w) => { const n = { ...w }; delete n[k]; return n; });
    }
  };

  let inhalt;
  if (daten && daten.fehler === "einrichten") {
    inhalt = <div className="karte" id="sd-einrichten"><p>{daten.text} Sobald sie eingetragen sind, erscheinen hier die Steckdosen.</p></div>;
  } else if (fehler && !liste) {
    inhalt = <div className="karte karte--fehler"><p>{fehler.message || alt.fehlertext(fehler)}</p></div>;
  } else if (!liste) {
    inhalt = <div className="laedt">Wird geladen …</div>;
  } else if (!liste.length) {
    inhalt = <p className="hinweis">Keine Steckdosen gefunden. Sind sie in Smart Life und ist Smart Life auf iot.tuya.com verbunden?</p>;
  } else {
    inhalt = <div className="sd-raster">
      {liste.map((g) => <div key={g.id} data-steckdose={g.id}
        className={"karte sd-karte" + (!g.online ? " sd-karte--weg" : g.schalter.some((s) => s.an) ? " sd-karte--an" : "")}>
        <div className="sd-name">{g.name}</div>
        <div className="sd-info klein">
          {!g.online ? "nicht erreichbar" : g.watt != null ? alt.zahlText(Math.round(g.watt)) + " W" : ""}
        </div>
        <div className="sd-schalter">
          {g.schalter.map((s) => {
            const busy = !!wartet[g.id + s.code];
            return <button key={s.code} data-sdcode={s.code}
              className={"sd-knopf" + (s.an ? " sd-knopf--an" : "")}
              disabled={!daten.darfSchalten || !g.online || busy}
              title={daten.darfSchalten ? (s.an ? "Ausschalten" : "Einschalten") : "Schalten nur mit Schreibrecht"}
              onClick={() => schalten(g, s)}>
              {g.schalter.length > 1 ? schalterName(s.code) + ": " : ""}{busy ? "…" : s.an ? "Ein" : "Aus"}
            </button>;
          })}
          {!g.schalter.length && <span className="klein">kein Schalter</span>}
        </div>
      </div>)}
    </div>;
  }

  return (
    <>
      <h1 className="seitentitel">Steckdosen</h1>
      {fehler && liste && <p className="hinweis">Letzte Abfrage ging nicht: {fehler.message}</p>}
      {inhalt}
    </>
  );
}

function schalterName(code) {
  const m = /^switch_(usb)?(\d+)$/.exec(code);
  if (!m) return "Schalter";
  return (m[1] ? "USB " : "Dose ") + m[2];
}
