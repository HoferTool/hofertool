// =================================================================
//  EINSTELLUNGEN → FARBEN UND MATERIAL
//  Welche Balkenfarbe für welches Material steht (mit Kürzel auf dem
//  Balken) und die Werkstofferkennung: jede Materialbezeichnung aus
//  den Aufträgen mit der erkannten Gruppe, von Hand korrigierbar.
// =================================================================
import { useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe } from "./teile.jsx";
import { kategorienListe, dichtenLaden, dichtenSpeichern, eigeneDichten, werkstoffAnzeige } from "../daten/material.js";

export default function Farben() {
  return (
    <>
      <Gruppe titel="Farben und Material"
        text={"Hier stehen die verwendeten Farben. Neue Farbe: unter „Weitere Farben“ bei einer freien Farbe das Material eintragen. Nur Farben mit einem Material "
          + "erscheinen im Auftragsfenster, neue Farben gibt es nur hier. Das Kürzel steht auf dem Balken, "
          + "mehrere Angaben mit Schrägstrich, zum Beispiel E/N. Gespeichert wird beim Verlassen des Felds."}>
        <div id="farbliste"><FarbListe /></div>
      </Gruppe>
      <Gruppe titel="Werkstofferkennung"
        text={"Gleiche Werkstoffe stehen zusammen, ohne Mengen und Lieferanten. Nicht erkannte stehen oben: einmal zuordnen, die App merkt es sich."}>
        <div id="werkstoffliste"><Werkstoffe /></div>
      </Gruppe>
      <Gruppe titel="Faktor (Dichte) für kg"
        text={"Ein Faktor je Farbe, immer der höchste Wert der Werkstoffe darin, damit sicher genug bestellt wird. Damit rechnet die App Stangen in kg um: im Materialrechner der Planwand, bei der Mat. info. und auf der Seite Material. "
          + "In g/cm³, mit Komma. Leer heisst Vorgabe (grau). Gespeichert wird beim Verlassen des Felds."}>
        <div id="dichteliste"><Dichten /></div>
      </Gruppe>
    </>
  );
}

// ---------- Farben ----------

async function farbenLaden() {
  await alt.farbzuteilungLaden();
  // Eine Kopie: Die Felder starten mit dem gespeicherten Stand
  return JSON.parse(JSON.stringify(alt.FARBZUTEILUNG || {}));
}

function FarbListe() {
  const { daten: zuteilung, neu } = useDaten(farbenLaden, []);
  if (!zuteilung) return <div className="laedt">Wird geladen …</div>;
  return <FarbZeilen zuteilung={zuteilung} neu={neu} />;
}

// Nur die Farben, die ein Material haben, also verwendet werden (Wunsch
// Patrick 15. Oktober 2026). Die übrigen kommen erst mit „Weitere
// Farben“, denn nur dort lässt sich eine neue Farbe anlegen. Welche
// gezeigt werden, steht beim Öffnen fest: Wer ein Material löscht oder
// einträgt, behält die Zeile vor Augen, bis der Reiter neu geladen ist.
function FarbZeilen({ zuteilung, neu }) {
  const [verwendet] = useState(() => new Set(Object.keys(zuteilung)
    .filter((k) => String(zuteilung[k].material || "").trim())));
  const [alle, setAlle] = useState(() => verwendet.size === 0);
  const liste = alt.PLANFARBEN.map((f, nr) => ({ f, nr }))
    .filter(({ f }) => alle || verwendet.has(f.wert));
  const weitere = alt.PLANFARBEN.length - verwendet.size;
  return (
    <>
      <div className="farbzeilen">
        {liste.map(({ f, nr }) => (
          // Der Schlüssel bleibt nach dem Speichern gleich: Wer schon im
          // nächsten Feld tippt, verliert sonst, was er dort eingibt
          <FarbZeile key={f.wert} f={f} nr={nr}
            zu={zuteilung[f.wert] || {}} gespeichert={neu} />
        ))}
      </div>
      {weitere > 0 && verwendet.size > 0 && (
        <button type="button" className="knopf knopf--klein farb-weitere" data-farben-weitere
          onClick={() => setAlle(!alle)}>
          {alle ? "Nur verwendete Farben" : "Weitere Farben (" + weitere + ")"}
        </button>
      )}
    </>
  );
}

function FarbZeile({ f, nr, zu, gespeichert }) {
  const [material, setMaterial] = useState(zu.material || "");
  const [kuerzel, setKuerzel] = useState(zu.buchstabe || "");
  // Was zuletzt gespeichert ist. Unverändert verlassen speichert nicht.
  const gemerkt = useRef({ m: zu.material || "", k: zu.buchstabe || "" });

  // Gespeichert wird beim Verlassen des Felds, wie bisher (change)
  const speichern = async (mat, kue) => {
    const m = mat.trim(), k = kue.trim();
    if (m === gemerkt.current.m && k === gemerkt.current.k) return;
    if (!m) {
      // Ohne Material verschwindet die Farbe aus der Auswahl, das
      // Kürzel mit ihr
      await alt.db.from("farb_material").delete().eq("farbe", f.wert);
      alt.meldung("Farbe wird nicht mehr angeboten.");
      setKuerzel("");
      gemerkt.current = { m: "", k: "" };
    } else {
      const { error } = await alt.db.from("farb_material").upsert({
        farbe: f.wert, material: m, buchstabe: k || null, sortierung: nr });
      if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
      alt.meldung("Gespeichert.");
      gemerkt.current = { m, k };
    }
    gespeichert();
  };

  return (
    <div className={"farbzeile" + (material.trim() ? " farbzeile--belegt" : "")}>
      <span className="farbzeile__punkt" style={{ background: f.hex, color: f.schrift }}>{zu.buchstabe || ""}</span>
      <span className="farbzeile__name">{f.name}</span>
      <input type="text" className="farbzeile__material" data-fmat={f.wert} value={material} placeholder="Material"
        onChange={(e) => setMaterial(e.target.value)} onBlur={() => speichern(material, kuerzel)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <input type="text" className="farbzeile__kuerzel" data-fkuerzel={f.wert} value={kuerzel} placeholder="Kürzel"
        onChange={(e) => setKuerzel(e.target.value)} onBlur={() => speichern(material, kuerzel)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </div>
  );
}

// ---------- Werkstofferkennung ----------

async function werkstoffeLaden() {
  const alle = [];
  for (let von = 0; von < 20000; von += 1000) {
    const r = await alt.zeitlimit(alt.db.from("jobs").select("material_bez")
      .not("material_bez", "is", null).range(von, von + 999), 10000, "Werkstoffe");
    if (r.error) throw r.error;
    alle.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  // Je Werkstoff einmal, mit Anzahl: zuerst je Bezeichnung ohne Masse,
  // dann Gleiches zusammen (gleiche Werkstoffnummer oder gleicher Name
  // ohne Mengen und Lieferanten, Wunsch Patrick 17. Oktober 2026)
  const jeKern = new Map();
  alle.forEach(({ material_bez: b }) => {
    const k = alt.werkstoffKern(b);
    if (!k || k.length < 2) return;
    const s = alt.werkstoffSchluessel(b);
    const e = jeKern.get(s) || { beispiel: b, n: 0 };
    e.n++; jeKern.set(s, e);
  });
  const jeWerkstoff = new Map();
  jeKern.forEach((e) => {
    const a = werkstoffAnzeige(e.beispiel);
    const w = jeWerkstoff.get(a.schluessel) || { titel: a.titel, beispiele: [], n: 0, oben: e };
    w.beispiele.push(e.beispiel);
    w.n += e.n;
    if (e.n > w.oben.n) w.oben = e;
    jeWerkstoff.set(a.schluessel, w);
  });
  // Erkannt wie die häufigste Schreibweise; nicht Erkanntes zuerst,
  // sonst die häufigsten oben
  return [...jeWerkstoff.values()].map((w) => Object.assign(w, { beispiel: w.oben.beispiel, g: alt.werkstoffErkennen(w.oben.beispiel) }))
    .sort((a, b) => (a.g ? 1 : 0) - (b.g ? 1 : 0) || b.n - a.n);
}

function Werkstoffe() {
  const { daten: zeilen, fehler, neu } = useDaten(werkstoffeLaden, []);
  if (fehler && !zeilen) return <p className="hinweis">{alt.fehlertext(fehler)}</p>;
  if (!zeilen) return <div className="laedt">Wird geladen …</div>;
  const gruppen = alt.WERKSTOFFGRUPPEN;
  const offen = zeilen.filter((z) => !z.g).length;

  // Für alle Schreibweisen dieses Werkstoffs
  const zuordnen = async (beispiele, gruppe) => {
    try {
      for (const bez of beispiele) await alt.werkstoffZuordnen(bez, gruppe || null);
      alt.meldung(gruppe ? "Zugeordnet." : "Zuordnung entfernt.");
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <>
      <p className="es-zahlen">{zeilen.length} Werkstoffe · {offen
        ? <span className="es-marke es-marke--warn">{offen} nicht erkannt</span>
        : <span className="es-marke es-marke--gut">alle erkannt</span>}</p>
      <div className="tabellenrolle"><table className="tabelle ws-tabelle">
        <thead><tr><th>Werkstoff</th><th className="rechts">Aufträge</th><th>Gruppe</th><th>Von Hand</th></tr></thead>
        <tbody>{zeilen.map((z) => (
          <tr key={z.beispiel} className={z.g ? undefined : "ws-offen"}>
            <td><strong>{z.titel}</strong></td>
            <td className="rechts">{z.n}</td>
            <td>{z.g
              ? <><span className="ws-farbe" style={{ background: alt.farbeVon(z.g.farbe).hex }} />
                  {z.g.name}</>
              : <span className="gedaempft">nicht erkannt</span>}</td>
            <td>
              <select data-werkstoff={z.beispiel} value={z.g && z.g.gelernt ? z.g.key : ""}
                onChange={(e) => zuordnen(z.beispiele, e.target.value)}>
                <option value="">{z.g && !z.g.gelernt ? "automatisch" : "— nicht zugeordnet —"}</option>
                {Object.keys(gruppen).map((k) => <option key={k} value={k}>{gruppen[k].name}</option>)}
              </select>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

// ---------- Faktor (Dichte) je Farbe ----------
// Wunsch Patrick 16. Oktober 2026: „Der Faktor soll in den Einstellungen
// bei Material eingebbar sein“; seit 1.92.0 nur noch einer je Farbe
// (Kategorie), nicht je Werkstoffnummer (Wunsch Patrick 17. Oktober
// 2026). Gespeichert in app_config.material_dichte, nur was von der
// Vorgabe abweicht.

async function dichtenHolen() {
  await dichtenLaden(true);
  return { liste: kategorienListe(), eigene: eigeneDichten() };
}

function Dichten() {
  const { daten } = useDaten(dichtenHolen, []);
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  return (
    <div className="tabellenrolle"><table className="tabelle dichte-tabelle">
      <thead><tr><th>Farbe</th><th>Höchster Wert bei</th><th className="rechts">Faktor g/cm³</th></tr></thead>
      <tbody>{daten.liste.map((z) => <DichteZeile key={z.wert} z={z} eigen={daten.eigene[z.wert]} />)}</tbody>
    </table></div>
  );
}

const komma = (n) => String(n).replace(".", ",");

function DichteZeile({ z, eigen }) {
  const [wert, setWert] = useState(eigen ? komma(eigen) : "");
  const gemerkt = useRef(eigen ? komma(eigen) : "");
  const speichern = async () => {
    const t = wert.trim();
    if (t === gemerkt.current) return;
    const n = Number(t.replace(",", "."));
    if (t && !(n > 0 && n < 30)) { alt.meldung("Bitte eine Zahl wie 7,9 eintragen.", "warn"); return; }
    try {
      await dichtenLaden(true);
      const neu = eigeneDichten();
      if (t) neu[z.wert] = n; else delete neu[z.wert];
      await dichtenSpeichern(neu);
      gemerkt.current = t;
      alt.meldung(t ? "Faktor gespeichert." : "Wieder Normwert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <tr>
      <td><span className="ws-farbe" style={{ background: alt.farbeVon(z.farbe).hex }} /><strong>{z.name}</strong></td>
      <td className="gedaempft">{z.hoechster}</td>
      <td className="rechts">
        <input type="text" inputMode="decimal" className="dichte-feld" data-dichte={z.wert} value={wert}
          placeholder={komma(z.standard)} onChange={(e) => setWert(e.target.value)} onBlur={speichern}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </td>
    </tr>
  );
}
