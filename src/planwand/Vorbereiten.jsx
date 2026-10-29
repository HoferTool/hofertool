// =================================================================
//  VORBEREITEN (seit 1.272.0, Wunsch Patrick 29. Oktober 2026)
//  Knopf neben „Problem“ im Auftragsfenster: eine kurze Checkliste
//  fürs Rüsten, auch am Handy gut lesbar.
//    1. Material: was (Bezeichnung mit „rd“) und ob vorhanden, bestellt
//       oder nichts davon, mehr nicht
//    2. Spannmittel: ein einziger Punkt (Zange, Canon, Ladestange)
//    3. Werkzeuge der Reihe nach aus dem Einrichtblatt in der App:
//       T-Nr., HD und die drei Zeilen wie im Blatt (Lieferant, Artikel-Nr.,
//       Beschreibung)
//  Fortschritt, Länge, Hinweise und „Bereit“ wollte Patrick nicht.
//  Jedes Häkchen ist eine Zeile in auftrag_vorbereiten
//  (sql/vorbereiten.sql), damit alle sehen, was schon bereit ist.
//  Fehlt die Tabelle, gelten die Häkchen nur, solange das Fenster offen
//  ist. Externe bekommen sie auch (seit 1.272.2, Entscheid Patrick
//  29. Oktober 2026: „Extern ja“) und haken bei ihren Maschinen ab;
//  die Artikel dürfen sie nicht lesen, darum gilt für sie der Text,
//  der im Blatt gespeichert ist.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { blattSuchen, platzInGebrauch, artikelBezeichnung } from "../einrichtblatt/daten.js";
import { vorlageFuer, platzName, REVOLVER } from "../einrichtblatt/vorlagen.js";
import { alleBestellungenLesen } from "../daten/materialBestellung.js";
import { STICHTAG } from "../daten/material.js";

const TABELLE = "auftrag_vorbereiten";
const fehltTabelle = (f) => !!f && /auftrag_vorbereiten|does not exist|schema cache/i.test(String(f.message || f));

export function vorbereitenOeffnen(auftrag) {
  if (!auftrag || !auftrag.id) return;
  fensterOeffnen((zu) => <VorbereitenFenster auftrag={auftrag} zu={zu} />, null, "vorbereiten-huelle");
}

// Vorhanden, bestellt oder nichts davon, aus „Menge vorhanden oder
// bestellt“ im Auftrag. Eine Bestellnummer darin heisst bestellt, ausser
// sie stammt von vor dem Stichtag: das gilt wie in der Material-Übersicht
// als geliefert (STICHTAG in src/daten/material.js).
export function materialStand(j) {
  const menge = String((j && j.material_menge) || "").trim();
  if (!menge) return { art: "nichts", text: "nichts vorhanden oder bestellt" };
  const alt_ = !j.created_at || String(j.created_at).slice(0, 10) < STICHTAG;
  if (alleBestellungenLesen(menge).length && !alt_) {
    return { art: "bestellt", text: "bestellt" + (j.material_liefertermin ? ", kommt " + j.material_liefertermin : "") };
  }
  return { art: "vorhanden", text: "vorhanden" };
}

// Reihenfolge wie im Blatt gezählt: Revolver, dann die T-Nummer
function platzZahl(k) {
  const m = /^(?:R(\d)-)?T(\d+)$/.exec(k) || [];
  return [Number(m[1] || 0), Number(m[2] || 0)];
}
const platzSort = (a, b) => {
  const x = platzZahl(a), y = platzZahl(b);
  return x[0] - y[0] || x[1] - y[1] || String(a).localeCompare(String(b));
};

async function werkzeugeLaden(auftrag) {
  const m = (alt.prod.maschinen || []).find((x) => x.id === auftrag.machine_id);
  const typId = m && m.type_id;
  if (!typId) return { liste: [], ohne: "Die Maschine hat keinen Typ." };
  const [blatt, typen] = await Promise.all([blattSuchen(auftrag.job_number, typId), alt.ladeTypen()]);
  if (!blatt) return { liste: [], ohne: "Für diese HOCO Nr. gibt es auf diesem Typ noch kein Einrichtblatt in der App." };
  let typ = (typen || []).find((t) => t.id === typId);
  // Ein eben erst angelegter Typ fehlt in der gemerkten Liste noch
  if (!typ) {
    try {
      const r = await alt.db.from("machine_types").select("id, name").eq("id", typId).limit(1);
      typ = (r.data || [])[0];
    } catch (f) { /* dann ohne Farben */ }
  }
  typ = typ || { name: "" };
  const vorlage = vorlageFuer(typ);
  const plaetze = blatt.plaetze || {};
  const keys = Object.keys(plaetze).filter((k) => platzInGebrauch(plaetze[k])).sort(platzSort);
  // Die Beschreibung immer frisch aus dem Artikel, wie im Blatt
  const ids = [...new Set(keys.map((k) => plaetze[k].article_id).filter(Boolean))];
  const artikel = {};
  if (ids.length) {
    try {
      const r = await alt.db.from("articles").select("id, name, description").in("id", ids);
      (r.data || []).forEach((a) => { artikel[a.id] = a; });
    } catch (f) { /* dann der Text aus dem Blatt */ }
  }
  const liste = keys.map((k) => {
    const p = plaetze[k];
    const a = p.article_id && !p.ungeprueft ? artikel[p.article_id] : null;
    // Die drei Zeilen wie im Blatt: Lieferant, Artikel-Nr., Beschreibung
    // (Patrick: „gleich alle drei Zeilen, sonst weiss ich nicht, was das
    // ist“); die Beschreibung nur bei hinterlegtem, geprüftem Artikel
    const beschreibung = a ? artikelBezeichnung(a) : (p.article_id && !p.ungeprueft ? p.bezeichnung || "" : "");
    // Fehlt die Beschreibung, steht dort, wofür es ist (Aufgabe und Mass
    // aus dem Blatt), damit jedes Werkzeug drei Zeilen hat (Patrick:
    // „jedes Werkzeug wie T200“)
    const wofuer = [p.taetigkeit, p.mass].filter(Boolean).join(" ");
    const zeilen = [p.hersteller || "", p.werkzeug || "", beschreibung || wofuer];
    const rev = /^R(\d)-/.exec(k);
    return {
      key: k, nr: platzName(k), revolver: rev ? rev[1] : "", zeilen, hd: !!p.hd,
      farbe: (vorlage.farben && vorlage.farben[k]) || vorlage.typFarbe || "#d9dee5",
    };
  });
  return { liste, gut: !!blatt.gut_am };
}

function VorbereitenFenster({ auftrag, zu }) {
  const [wz, setWz] = useState(null);
  const [haken, setHaken] = useState({});
  const [ohneTabelle, setOhneTabelle] = useState(false);
  // Externe sehen ohnehin nur Aufträge ihrer Maschinen (auch in der Datenbank)
  const darf = alt.darfSchreiben() || alt.istExtern();
  const mat = materialStand(auftrag);

  const hakenLaden = async () => {
    try {
      const r = await alt.db.from(TABELLE).select("punkt").eq("job_id", auftrag.id);
      if (r.error) throw r.error;
      const h = {};
      (r.data || []).forEach((z) => { h[z.punkt] = true; });
      setHaken(h);
    } catch (f) { if (fehltTabelle(f)) setOhneTabelle(true); }
  };

  useEffect(() => {
    let weg = false;
    werkzeugeLaden(auftrag).then((w) => { if (!weg) setWz(w); })
      .catch((f) => { if (!weg) setWz({ liste: [], ohne: alt.fehlertext(f) }); });
    hakenLaden();
    // Was an einem anderen Gerät abgehakt wird, kommt von selbst dazu
    const t = setInterval(() => { if (!document.hidden) hakenLaden(); }, 15000);
    return () => { weg = true; clearInterval(t); };
  }, []);

  const umschalten = async (punkt) => {
    if (!darf) return;
    const an = !haken[punkt];
    setHaken((h) => Object.assign({}, h, { [punkt]: an }));
    if (ohneTabelle) return;
    try {
      const r = an
        ? await alt.db.from(TABELLE).insert({ job_id: auftrag.id, punkt })
        : await alt.db.from(TABELLE).delete().eq("job_id", auftrag.id).eq("punkt", punkt);
      // Schon abgehakt (anderes Gerät war schneller): gilt trotzdem
      if (r.error && !/duplicate|23505/i.test(String(r.error.message || r.error.code))) throw r.error;
    } catch (f) {
      if (fehltTabelle(f)) { setOhneTabelle(true); return; }
      setHaken((h) => Object.assign({}, h, { [punkt]: !an }));
      alt.meldung("Häkchen nicht gespeichert: " + alt.fehlertext(f), "fehler");
    }
  };

  const Punkt = ({ id, children, klasse }) => (
    <li className={"vb-punkt" + (haken[id] ? " vb-punkt--ok" : "") + (klasse ? " " + klasse : "")}>
      <button type="button" className="vb-haken" data-vb={id} aria-pressed={!!haken[id]} disabled={!darf}
        onClick={() => umschalten(id)}>{haken[id] ? "✓" : ""}</button>
      <div className="vb-text" onClick={() => umschalten(id)}>{children}</div>
    </li>
  );

  let revolver = null;
  return (
    <div className="dialog vorbereiten" id="vorbereiten">
      <div className="vb-kopf">
        <div><h2>Vorbereiten · {auftrag.job_number}</h2>
          <span className="klein">{auftrag.maschine || ""}{auftrag.fa_nr ? " · FA " + auftrag.fa_nr : ""}
            {auftrag.target_quantity ? " · " + alt.zahlText(auftrag.target_quantity) + " Stk" : ""}</span></div>
        <button type="button" className="dialog__schliessen-inline" title="Schliessen" aria-label="Schliessen"
          data-zu="" onClick={zu}>✕</button>
      </div>
      {ohneTabelle && <p className="klein vb-hinweis">Die Häkchen werden noch nicht gespeichert (Datenbank fehlt).</p>}
      <div className="vb-rolle">
        <h3>Material</h3>
        <ul>
          <Punkt id="material">
            <b>{auftrag.material_bez || "kein Material eingetragen"}</b>
            <span className={"vb-mat vb-mat--" + mat.art} data-vb-mat={mat.art}>{mat.text}</span>
          </Punkt>
        </ul>
        <h3>Spannmittel</h3>
        <ul>
          <Punkt id="spannmittel">Spannmittel bereit <span className="vb-klein">Zange, Canon, Ladestange</span></Punkt>
        </ul>
        <h3>Werkzeuge {wz && wz.liste.length ? <span>{wz.liste.length}</span> : null}</h3>
        {wz === null
          ? <p className="klein vb-hinweis">Lädt …</p>
          : !wz.liste.length
          ? <p className="klein vb-hinweis" id="vb-ohne-blatt">{wz.ohne || "Im Einrichtblatt steht kein Werkzeug."}</p>
          : <>
              {!wz.gut && <p className="klein vb-hinweis" id="vb-nicht-ok">Einrichtblatt noch nicht mit „EB OK“ bestätigt.</p>}
              <ul>
                {wz.liste.map((w) => {
                  const titel = w.revolver && w.revolver !== revolver
                    ? <li className="vb-revolver" key={"r" + w.revolver}>Revolver {w.revolver}</li> : null;
                  revolver = w.revolver;
                  const farbe = (REVOLVER.find(([r]) => r === w.revolver) || [])[1] || w.farbe;
                  return [titel,
                    <Punkt key={w.key} id={"wz:" + w.key} klasse="vb-wz">
                      <span className="vb-tnr" style={{ background: farbe }}>{w.nr}</span>
                      <span className="vb-bez">
                        {w.zeilen[0] && <span className="vb-her">{w.zeilen[0]}</span>}
                        {w.zeilen[1] && <span className="vb-wznr">{w.zeilen[1]}{w.hd && <span className="vb-hd">HD</span>}</span>}
                        {!w.zeilen[1] && w.hd && <span className="vb-hd">HD</span>}
                        {w.zeilen[2] && <span className="vb-beschr">{w.zeilen[2]}</span>}
                      </span>
                    </Punkt>];
                })}
              </ul>
            </>}
      </div>
    </div>
  );
}
