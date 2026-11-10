// =================================================================
//  QM alternativ: Kompetenzmatrix (wer kann was) und darunter die
//  Schulungen. Nutzen im Alltag: man sieht sofort, wo Wissen nur an
//  einer Person hängt (rot) und wer wen vertreten kann.
//  Gespeichert in qma_texte unter "matrix":
//    felder = { personen: [{id, name}], faehigkeiten: [{id, name}],
//               werte: { "<person>|<fähigkeit>": 0..3 } }
// =================================================================
import { alt } from "../../bruecke.jsx";
import { textSpeichern } from "../../daten/qmAlt.js";

const STUFEN = ["–", "lernt", "selbständig", "kann schulen"];
const neuId = () => Math.random().toString(36).slice(2, 9);

export default function Kompetenz({ daten, neu, liste }) {
  const m = (daten.texte.matrix && daten.texte.matrix.felder) || {};
  const personen = m.personen || [];
  const faehig = m.faehigkeiten || [];
  const werte = m.werte || {};

  async function speichern(neuM, text) {
    try { await textSpeichern("matrix", { gruppe: "kompetenz", titel: "Kompetenzmatrix", norm: "7.2", felder: neuM }, text); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  const mit = (x) => ({ personen, faehigkeiten: faehig, werte, ...x });

  async function dazu(was) {
    const w = await alt.dialogFelder({ titel: was === "p" ? "Person dazu" : "Fähigkeit dazu",
      felder: [{ name: "name", label: was === "p" ? "Name oder Kürzel" : "Fähigkeit", pflicht: true,
        platzhalter: was === "p" ? "" : "Star programmieren, Keyence messen …" }], bestaetigen: "Dazu" });
    if (!w) return;
    const x = { id: neuId(), name: w.name.trim() };
    speichern(was === "p" ? mit({ personen: [...personen, x] }) : mit({ faehigkeiten: [...faehig, x] }), "Kompetenzmatrix: " + x.name);
  }

  async function umbenennen(was, x) {
    const w = await alt.dialogFelder({ titel: x.name, felder: [
      { name: "name", label: "Name", wert: x.name, pflicht: true },
      { name: "weg", label: "Aus der Matrix löschen", typ: "haken", wert: false }], bestaetigen: "Speichern" });
    if (!w) return;
    const liste = was === "p" ? personen : faehig;
    const neuL = w.weg ? liste.filter((y) => y.id !== x.id) : liste.map((y) => (y.id === x.id ? { ...y, name: w.name.trim() } : y));
    speichern(was === "p" ? mit({ personen: neuL }) : mit({ faehigkeiten: neuL }), "Kompetenzmatrix: " + x.name);
  }

  async function ausHoferTool() {
    const { data, error } = await alt.db.from("profiles").select("full_name, role, andere_nutzer, is_active");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const da = new Set(personen.map((p) => p.name.toLowerCase()));
    const dazuL = (data || []).filter((p) => p.full_name && p.is_active !== false && !p.andere_nutzer
      && !["extern", "dienst", "planwand"].includes(p.role) && !da.has(p.full_name.toLowerCase()))
      .map((p) => ({ id: neuId(), name: p.full_name })).sort((a, b) => a.name.localeCompare(b.name));
    if (!dazuL.length) { alt.meldung("Alle Personen sind schon da."); return; }
    speichern(mit({ personen: [...personen, ...dazuL] }), "Kompetenzmatrix: Personen");
  }

  const klick = (p, f) => {
    const k = p.id + "|" + f.id;
    const n = ((werte[k] || 0) + 1) % 4;
    speichern(mit({ werte: { ...werte, [k]: n } }), "Kompetenz " + p.name + ": " + f.name);
  };

  return (<>
    <section className="karte" id="qma-matrix">
      <div className="karte__kopf">
        <h2>Kompetenzmatrix <span className="klein">ISO 7.2</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-personen-tool" onClick={ausHoferTool}>Personen aus dem HoferTool</button>
          <button className="knopf" id="qma-neu-person" onClick={() => dazu("p")}>+ Person</button>
          <button className="knopf knopf--haupt" id="qma-neu-faehigkeit" onClick={() => dazu("f")}>+ Fähigkeit</button>
        </div>
      </div>
      <p className="hinweis">Feld antippen: – → lernt → selbständig → kann schulen. Rot heisst: höchstens eine Person kann es selbständig, das ist ein Risiko bei Ferien oder Krankheit.</p>
      {!personen.length || !faehig.length
        ? <p className="hinweis" id="qma-matrix-leer">Zuerst Personen und Fähigkeiten dazunehmen.</p>
        : <div className="qm-tabelle-huelle"><table className="tabelle qma-matrix">
            <thead><tr><th>Fähigkeit</th>
              {personen.map((p) => <th key={p.id} className="qma-matrix__person" onClick={() => umbenennen("p", p)} title="antippen zum Ändern">{p.name}</th>)}
              <th>selbständig</th></tr></thead>
            <tbody>
              {faehig.map((f) => {
                const n = personen.filter((p) => (werte[p.id + "|" + f.id] || 0) >= 2).length;
                return (
                  <tr key={f.id} data-qmafaehig={f.id}>
                    <th className="qma-matrix__faehig" onClick={() => umbenennen("f", f)}>{f.name}</th>
                    {personen.map((p) => {
                      const s = werte[p.id + "|" + f.id] || 0;
                      return <td key={p.id} className={"qma-stufe qma-stufe--" + s} data-qmazelle={p.id + "|" + f.id}
                        title={STUFEN[s]} onClick={() => klick(p, f)}>{["", "◔", "◑", "●"][s]}</td>;
                    })}
                    <td className={n <= 1 ? "qm-spaet" : ""}>{n}</td>
                  </tr>);
              })}
            </tbody>
          </table></div>}
      <p className="klein">◔ lernt · ◑ selbständig · ● kann schulen</p>
    </section>
    {liste}
  </>);
}
