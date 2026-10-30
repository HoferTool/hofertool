// =================================================================
//  EIERZÄHLER IM PAUSENRAUM
//  Kachel-Inhalt { art: "eier" } (Wunsch Patrick 30. Oktober 2026: „eine
//  Kachel für den Eierzähler, damit wir die täglich gelegten Eier
//  eintragen können“). Gross für den Finger: Tag wählen (heute, mit den
//  Pfeilen auch frühere Tage, wenn man es vergessen hat), mit − und +
//  die Zahl ändern. Gespeichert wird von selbst kurz nach dem letzten
//  Tipp, damit jeder Tipp nicht einzeln zur Datenbank geht. Rechts die
//  letzten 14 Tage und die Summen.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { eierLaden, eierSpeichern, tagText } from "../daten/eier.js";

const WARTEN_MS = 900;
const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const zahl = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

function tagPlus(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function tagName(d) {
  const heute = tagText(new Date());
  const t = tagText(d);
  if (t === heute) return "Heute";
  if (t === tagText(tagPlus(new Date(), -1))) return "Gestern";
  return WOCHENTAG[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + ".";
}

export default function Eier({ breite, hoehe }) {
  const [tage, setTage] = useState(null);
  const [fehler, setFehler] = useState("");
  const [tag, setTag] = useState(() => new Date());
  const [stand, setStand] = useState("");   // "" | "wartet" | "speichert" | "gut" | "fehler"
  const offen = useRef(null);               // { datum, anzahl, t }

  useEffect(() => {
    let gueltig = true;
    eierLaden().then((t) => { if (gueltig) setTage(t); })
      .catch((e) => { if (gueltig) setFehler(alt.fehlertext ? alt.fehlertext(e) : String(e.message || e)); });
    return () => { gueltig = false; };
  }, []);

  const jetztSpeichern = async () => {
    const o = offen.current;
    if (!o) return;
    clearTimeout(o.t);
    offen.current = null;
    setStand("speichert");
    try { await eierSpeichern(o.datum, o.anzahl); setStand("gut"); }
    catch (e) { setStand("fehler"); alt.meldung("Eier nicht gespeichert: " + (alt.fehlertext ? alt.fehlertext(e) : e.message), "fehler"); }
  };
  // Beim Schliessen der Kachel nichts verlieren
  useEffect(() => () => { if (offen.current) jetztSpeichern(); }, []);

  const datum = tagText(tag);
  const anzahl = tage ? tage[datum] || 0 : 0;

  const aendern = (d) => {
    if (!tage) return;
    const neu = Math.max(0, Math.min(10000, anzahl + d));
    if (neu === anzahl) return;
    setTage((t) => ({ ...t, [datum]: neu }));
    if (offen.current && offen.current.datum !== datum) jetztSpeichern();
    if (offen.current) clearTimeout(offen.current.t);
    offen.current = { datum, anzahl: neu, t: setTimeout(jetztSpeichern, WARTEN_MS) };
    setStand("wartet");
  };

  const tagWechseln = (n) => {
    const neu = tagPlus(tag, n);
    if (tagText(neu) > tagText(new Date())) return;
    if (offen.current) jetztSpeichern();
    setTag(neu); setStand("");
  };

  if (fehler) return <div className="ib-leer" data-eier="fehler">Eierzähler geht noch nicht: {fehler}</div>;
  if (!tage) return <div className="ib-leer">Lädt …</div>;

  // Summen
  const heute = new Date();
  const summe = (von) => Object.entries(tage).reduce((s, [d, n]) => (d >= von && d <= tagText(heute) ? s + n : s), 0);
  const mo = tagPlus(heute, -((heute.getDay() + 6) % 7));
  const summen = [
    ["Diese Woche", summe(tagText(mo))],
    ["Dieser Monat", summe(tagText(new Date(heute.getFullYear(), heute.getMonth(), 1)))],
    ["Dieses Jahr", summe(heute.getFullYear() + "-01-01")],
  ];
  const letzte = Array.from({ length: 14 }, (_, i) => tagPlus(heute, i - 13));
  const max = Math.max(1, ...letzte.map((d) => tage[tagText(d)] || 0));
  const k = Math.min(breite / 1800, hoehe / 860);

  return (
    <div className="pr-eier" data-eier="feld" style={{ fontSize: 20 * Math.max(0.6, k) }}>
      <section className="pr-eier__eingabe">
        <div className="pr-eier__tag">
          <button type="button" data-eier="zurueck" onClick={() => tagWechseln(-1)} aria-label="Tag davor">‹</button>
          <span data-eier="tag">{tagName(tag)}</span>
          <button type="button" data-eier="vor" onClick={() => tagWechseln(1)} aria-label="Tag danach"
            disabled={datum >= tagText(new Date())}>›</button>
        </div>
        <div className="pr-eier__zahl">
          <button type="button" className="pr-eier__knopf" data-eier="minus" onClick={() => aendern(-1)} disabled={!anzahl}>−</button>
          <span className="pr-eier__wert" data-eier="wert">{zahl(anzahl)}<small>🥚 Eier</small></span>
          <button type="button" className="pr-eier__knopf pr-eier__knopf--plus" data-eier="plus" onClick={() => aendern(1)}>+</button>
        </div>
        <div className="pr-eier__mehr">
          <button type="button" data-eier="plus5" onClick={() => aendern(5)}>+5</button>
          <button type="button" data-eier="plus10" onClick={() => aendern(10)}>+10</button>
        </div>
        <p className="pr-eier__stand" data-eier="stand">
          {stand === "wartet" || stand === "speichert" ? "wird gespeichert …"
            : stand === "gut" ? "✓ gespeichert" : stand === "fehler" ? "nicht gespeichert, nochmal tippen" : " "}</p>
      </section>
      <section className="pr-eier__uebersicht">
        <div className="pr-eier__summen">
          {summen.map(([n, s]) => <div key={n}><b data-eier={"summe-" + n}>{zahl(s)}</b><span>{n}</span></div>)}
        </div>
        <div className="pr-eier__saeulen" data-eier="saeulen">
          {letzte.map((d) => {
            const n = tage[tagText(d)] || 0;
            const an = tagText(d) === datum;
            return (
              <button type="button" key={tagText(d)} className={"pr-eier__saeule" + (an ? " pr-eier__saeule--an" : "")}
                onClick={() => { if (offen.current) jetztSpeichern(); setTag(d); setStand(""); }}>
                <span className="pr-eier__n">{n || ""}</span>
                <span className="pr-eier__balken" style={{ height: (n / max) * 100 + "%" }} />
                <span className="pr-eier__wt">{WOCHENTAG[d.getDay()]}<br />{d.getDate()}.</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
