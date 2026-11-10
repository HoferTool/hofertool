// =================================================================
//  QM alternativ: das schlanke Handbuch. Feste Abschnitte (Text in
//  qma_texte) und die Prozesse als Landkarte mit je einer Karte:
//  Zweck, Wer, Auslöser, Ablauf, Ergebnis, Nachweis, Kennzahl, Risiken.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { ABSCHNITTE, PROZESS_GRUPPEN, PROZESS_FELDER, textSpeichern, textLoeschen } from "../../daten/qmAlt.js";
import { blattDrucken, absatz } from "./drucken.js";

export default function Handbuch({ daten, neu }) {
  const { texte } = daten;
  const prozesse = Object.values(texte).filter((t) => String(t.schluessel).startsWith("prozess:"))
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const stand = Object.values(texte).map((t) => t.geaendert_am).filter(Boolean).sort().pop();

  return (<>
    <section className="karte" id="qma-prozesse">
      <div className="karte__kopf">
        <h2>Prozesslandkarte <span className="klein">ISO 4.4</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-hb-drucken" onClick={() => handbuchDrucken(texte, prozesse)}>Drucken / PDF</button>
          <button className="knopf knopf--haupt" id="qma-neu-prozess" onClick={() => prozessDialog(null, prozesse, neu)}>+ Prozess</button>
        </div>
      </div>
      <p className="hinweis">Antippen öffnet den Prozess. Je Prozess nur, was jemand Neues wissen muss, und wo der Nachweis im HoferTool liegt.
        {stand ? " Zuletzt geändert " + alt.datumZeitKurz(stand) + "." : ""}</p>
      <div className="qma-landkarte">
        {PROZESS_GRUPPEN.map(([g, text]) => (
          <div key={g} className={"qma-band qma-band--" + g} data-qmagruppe={g}>
            <div className="qma-band__titel">{text}</div>
            <div className="qma-band__reihe">
              {prozesse.filter((p) => (p.gruppe || "kern") === g).map((p) => (
                <button key={p.schluessel} className="qma-prozess" data-qmaprozess={p.schluessel}
                  onClick={() => prozessDialog(p, prozesse, neu)}>
                  <b>{p.titel}</b>
                  {p.norm ? <span className="klein">ISO {p.norm}</span> : null}
                  {p.felder && p.felder.verantwortlich ? <span className="klein">{p.felder.verantwortlich}</span> : null}
                </button>))}
              {!prozesse.some((p) => (p.gruppe || "kern") === g) && <span className="klein">noch keiner</span>}
            </div>
          </div>))}
      </div>
    </section>

    <section className="karte" id="qma-abschnitte">
      <div className="karte__kopf"><h2>Handbuch</h2></div>
      <p className="hinweis">Kurz und ehrlich. Antippen zum Bearbeiten. Ist ein Abschnitt leer, zeigt das Cockpit ihn als fehlend.</p>
      {ABSCHNITTE.map((a) => {
        const t = texte[a.k];
        const leer = !(t && String(t.inhalt || "").trim());
        return (
          <div key={a.k} className={"qma-abschnitt" + (leer ? " qma-abschnitt--leer" : "")} data-qmaabschnitt={a.k}
            onClick={() => abschnittDialog(a, t, neu)}>
            <div className="qma-abschnitt__kopf"><h3>{a.titel}</h3><span className="klein">ISO {a.norm}</span></div>
            {leer ? <p className="klein">{a.hilfe} <b>Noch leer.</b></p> : <div className="qm-umbruch">{t.inhalt}</div>}
          </div>);
      })}
    </section>
  </>);
}

async function abschnittDialog(a, t, neu) {
  const w = await alt.dialogFelder({
    titel: a.titel + " (ISO " + a.norm + ")",
    felder: [{ name: "inhalt", label: a.hilfe, typ: "textarea", zeilen: 14, wert: (t && t.inhalt) || "" }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  try {
    await textSpeichern(a.k, { gruppe: "handbuch", titel: a.titel, norm: a.norm, inhalt: w.inhalt.trim() || null }, "Ändern: " + a.titel);
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function prozessDialog(p, prozesse, neu) {
  const f = (p && p.felder) || {};
  const w = await alt.dialogFelder({
    titel: p ? "Prozess: " + p.titel : "Neuer Prozess",
    felder: [
      { name: "titel", label: "Name", pflicht: true, wert: (p && p.titel) || "" },
      { name: "gruppe", label: "Gruppe", auswahl: PROZESS_GRUPPEN, wert: (p && p.gruppe) || "kern" },
      { name: "norm", label: "Normbezug ISO 9001", wert: (p && p.norm) || "", platzhalter: "8.5" },
      ...PROZESS_FELDER.map((x) => ({ name: x.k, label: x.text, typ: x.lang ? "textarea" : "text", zeilen: x.lang ? 6 : undefined, wert: f[x.k] || "" })),
      { name: "sort", label: "Reihenfolge", typ: "number", wert: (p && p.sort) || (Math.max(0, ...prozesse.map((x) => x.sort || 0)) + 10) },
      ...(p ? [{ name: "weg", label: "Diesen Prozess löschen", typ: "haken", wert: false }] : []),
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  try {
    if (p && w.weg) {
      const ok = await alt.nachfragen({ titel: "Prozess löschen", text: "„" + p.titel + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
      if (!ok) return;
      await textLoeschen(p.schluessel, "Löschen: " + p.titel);
      alt.meldung("Gelöscht."); neu(); return;
    }
    const schluessel = p ? p.schluessel : "prozess:" + Date.now().toString(36);
    const felder = {};
    for (const x of PROZESS_FELDER) felder[x.k] = String(w[x.k] || "").trim() || null;
    await textSpeichern(schluessel, { gruppe: w.gruppe, titel: w.titel.trim(), norm: w.norm.trim() || null, felder, sort: Number(w.sort) || 0 },
      (p ? "Ändern: " : "Neu: ") + w.titel.trim());
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f2) { alt.meldung(alt.fehlertext(f2), "fehler"); }
}

function handbuchDrucken(texte, prozesse) {
  const e = alt.esc;
  let h = `<h1>Managementhandbuch Hofer + Co</h1><div class="kopf">ISO 9001 · Stand ${e(alt.kurzDatum(new Date()))} · aus dem HoferTool</div>`;
  for (const a of ABSCHNITTE) {
    h += `<h2>${e(a.titel)} <span class="norm">ISO ${e(a.norm)}</span></h2>${absatz(texte[a.k] && texte[a.k].inhalt)}`;
  }
  h += `<h2>Prozesse <span class="norm">ISO 4.4</span></h2>`;
  for (const [g, gt] of PROZESS_GRUPPEN) {
    const liste = prozesse.filter((p) => (p.gruppe || "kern") === g);
    if (!liste.length) continue;
    h += `<h3>${e(gt)}</h3>`;
    for (const p of liste) {
      h += `<table><tr><th colspan="2">${e(p.titel)}${p.norm ? ` <span class="norm">ISO ${e(p.norm)}</span>` : ""}</th></tr>`;
      for (const x of PROZESS_FELDER) h += `<tr><td style="width:28%">${e(x.text)}</td><td class="text">${e((p.felder || {})[x.k] || "–")}</td></tr>`;
      h += `</table>`;
    }
  }
  blattDrucken("Managementhandbuch", h);
}
