// =================================================================
//  Auditplan (seit 1.467.0, Wunsch Patrick 10. November 2026: „unseren
//  Auditplan interaktiv integrieren“, nach FO_03_05_03_01_00 Auditplan
//  2026 bis 2029, dazu die Auditberichte der letzten Jahre)
//
//  Raster Bereich × Quartal wie im Excel. Jedes Audit ist ein Eintrag der
//  Liste Audits (qma_eintraege, art audit); im Plan steht es im Quartal
//  seines Datums, ohne Datum im Feld „Quartal“. Leeres Feld antippen sieht
//  ein Audit vor, ein Kärtchen öffnet es. Rot vorgesehen, blau terminiert,
//  grün durchgeführt, wie die Legende im Excel. Berichte (PDF) hängen am
//  Audit in der Ablage zeichnungen unter qm/audits/.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import {
  auditBereiche, auditQuartal, auditBereicheVonEintrag, auditExtern, statusVon, textSpeichern, eintragSpeichern, heute,
} from "../../daten/qmAlt.js";

const EXTERN = "Extern (SSC, Kunden)";
const ART_KURZ = { zert: "SSC", kunde: "Kunde", as: "AS", lieferant: "Lief." };

// Wie viele Jahre nebeneinander Platz haben
function jahreFuerBreite() {
  const b = typeof window === "undefined" ? 1400 : window.innerWidth;
  return b >= 1250 ? 4 : b >= 760 ? 2 : 1;
}

let gemerktAb = null;

export default function AuditPlan({ daten, neu, eintragDialog }) {
  const audits = daten.eintraege.filter((e) => e.art === "audit");
  const diesesJahr = Number(heute().slice(0, 4));
  const [anzahl, setAnzahl] = useState(jahreFuerBreite());
  const [ab, setAb] = useState(gemerktAb || diesesJahr);
  useEffect(() => {
    const f = () => setAnzahl(jahreFuerBreite());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const jahre = Array.from({ length: anzahl }, (_, i) => ab + i);
  const fruehestes = Math.min(diesesJahr, ...audits.map((e) => Number((auditQuartal(e) || "9999").slice(0, 4))));
  const schieben = (n) => { const x = Math.max(fruehestes, ab + n); gemerktAb = x; setAb(x); };

  const bereiche = auditBereiche();
  const zeilen = [EXTERN, ...bereiche];
  const imFeld = (zeile, q) => audits.filter((e) => auditQuartal(e) === q &&
    (zeile === EXTERN ? auditExtern(e) : auditBereicheVonEintrag(e).includes(zeile)));
  const ohnePlatz = audits.filter((e) => !auditQuartal(e) || (!auditExtern(e) && !auditBereicheVonEintrag(e).some((b) => bereiche.includes(b))));

  const vorsehen = (zeile, q) => {
    const extern = zeile === EXTERN;
    eintragDialog("audit", null, daten.eintraege, neu, {
      art: extern ? "zert" : zeile === "Arbeitssicherheit" ? "as" : "intern",
      titel: extern ? "Überwachungsaudit SSC / ISO 9001" : zeile === "Arbeitssicherheit" ? "Betriebsrundgang Arbeitssicherheit" : zeile,
      bereich: extern ? "" : zeile, quartal: q, _status: "vorgesehen",
    });
  };

  // Je Jahr: wie viele interne Audits vorgesehen und wie viele durch
  const stand = (j) => {
    const im = audits.filter((e) => (auditQuartal(e) || "").startsWith(j + "-") && !auditExtern(e));
    return { alle: im.length, durch: im.filter((e) => e.status === "durchgefuehrt").length };
  };

  return (
    <section className="karte" id="qma-auditplan">
      <div className="karte__kopf">
        <h2>Auditplan <span className="klein">QMS / AS-Audits</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-ap-frueher" disabled={ab <= fruehestes} onClick={() => schieben(-anzahl)}>◀ Früher</button>
          <button className="knopf" id="qma-ap-heute" onClick={() => { gemerktAb = diesesJahr; setAb(diesesJahr); }}>{diesesJahr}</button>
          <button className="knopf" id="qma-ap-spaeter" onClick={() => schieben(anzahl)}>Später ▶</button>
          <button className="knopf" id="qma-ap-bereiche" onClick={() => bereicheDialog(daten.texte, bereiche, neu)}>Bereiche ändern</button>
        </div>
      </div>
      <p className="hinweis">Leeres Feld antippen sieht dort ein Audit vor. Kärtchen antippen öffnet das Audit: Datum setzen = terminiert,
        Status „Durchgeführt“ und die Feststellungen eintragen, wenn es vorbei ist. 📄 = Bericht hinterlegt.</p>
      <div className="qma-ap-huelle">
        <table className="qma-ap" style={{ "--qma-ap-spalten": jahre.length * 4 }}>
          <thead>
            <tr><th rowSpan={2} className="qma-ap-bereich">Bereich</th>
              {jahre.map((j) => {
                const s = stand(j);
                return <th key={j} colSpan={4} className={"qma-ap-jahr" + (j === diesesJahr ? " qma-ap-jahr--jetzt" : "")}>
                  {j}{s.alle ? <span className="klein"> · {s.durch}/{s.alle} durch</span> : null}</th>;
              })}</tr>
            <tr>{jahre.map((j) => [1, 2, 3, 4].map((k) => <th key={j + "-" + k} className="qma-ap-q">Q{k}</th>))}</tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z} className={z === EXTERN ? "qma-ap-zeile--extern" : ""}>
                <th className="qma-ap-bereich" scope="row">{z}</th>
                {jahre.map((j) => [1, 2, 3, 4].map((k) => {
                  const q = j + "-Q" + k;
                  const drin = imFeld(z, q);
                  return (
                    <td key={q} className={"qma-ap-feld" + (k === 1 ? " qma-ap-feld--jahr" : "")} data-qmaap={z + "|" + q}
                      onClick={() => (drin.length ? null : vorsehen(z, q))} title={drin.length ? "" : "Audit vorsehen: " + z + ", " + q}>
                      {drin.map((e) => <Kaertchen key={e.id} e={e} oeffnen={() => eintragDialog("audit", e, daten.eintraege, neu)} />)}
                    </td>
                  );
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="qma-ap-legende klein">
        <span><i className="qma-ap-punkt qma-ap-punkt--vorgesehen" /> Audit vorgesehen</span>
        <span><i className="qma-ap-punkt qma-ap-punkt--geplant" /> Audit terminiert</span>
        <span><i className="qma-ap-punkt qma-ap-punkt--durchgefuehrt" /> durchgeführt und abgeschlossen</span>
        <span><b>SSC</b> / <b>Kunde</b> = extern · <b>AS</b> = Arbeitssicherheit</span>
      </div>
      {ohnePlatz.length > 0 && <p className="klein qma-ap-ohne">Ohne Platz im Plan (kein Quartal oder Bereich):{" "}
        {ohnePlatz.map((e, i) => <span key={e.id}>{i ? ", " : ""}<a href="#" onClick={(ev) => { ev.preventDefault(); eintragDialog("audit", e, daten.eintraege, neu); }}>{e.titel}</a></span>)}</p>}
    </section>
  );
}

function Kaertchen({ e, oeffnen }) {
  const d = e.daten || {};
  const s = statusVon("audit", e.status);
  const spaet = e.status !== "durchgefuehrt" && e.faellig && e.faellig < heute();
  const kurz = ART_KURZ[d.art];
  return (
    <button className={"qma-ap-karte qma-ap-karte--" + e.status + (spaet ? " qma-ap-karte--spaet" : "")} data-qmaapkarte={e.id}
      title={(e.titel || "") + " · " + s.text + (d.datum ? " · " + alt.kurzDatum(d.datum) : "") + (spaet ? " · überfällig" : "")}
      onClick={(ev) => { ev.stopPropagation(); oeffnen(); }}>
      {e.status === "durchgefuehrt" ? "✓" : e.status === "geplant" ? "◷" : "●"}
      {d.datum ? <span> {d.datum.slice(8, 10)}.{d.datum.slice(5, 7)}.</span> : null}
      {kurz ? <b> {kurz}</b> : null}
      {d.bericht_url ? " 📄" : ""}
    </button>
  );
}

async function bereicheDialog(texte, bereiche, neu) {
  const w = await alt.dialogFelder({
    titel: "Bereiche im Auditplan",
    felder: [{ name: "liste", label: "Ein Bereich je Zeile, in der Reihenfolge des Plans. Audits mit einem anderen Namen stehen dann unter dem Plan.",
      typ: "textarea", zeilen: 14, wert: bereiche.join("\n") }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const liste = w.liste.split("\n").map((x) => x.trim()).filter(Boolean);
  try {
    await textSpeichern("auditplan", { gruppe: "einstellung", titel: "Auditplan", felder: { ...((texte.auditplan && texte.auditplan.felder) || {}), bereiche: liste } }, "Ändern: Bereiche Auditplan");
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Bericht (PDF oder Bild) an ein Audit hängen
export async function berichtHochladen(e, alle, neu) {
  const datei = await new Promise((fertig) => {
    const f = document.createElement("input");
    f.type = "file"; f.accept = "application/pdf,.pdf,image/*";
    f.onchange = () => fertig(f.files && f.files[0]);
    f.click();
  });
  if (!datei) return;
  const name = String(datei.name || "bericht.pdf").normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
  const pfad = "qm/audits/" + e.id + "/" + Date.now() + "-" + name;
  try {
    const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei, { contentType: datei.type || "application/pdf", upsert: false });
    if (up.error) throw up.error;
    const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
    await eintragSpeichern("audit", e, { ...e.daten, bericht_url: url, bericht_pfad: pfad, bericht_name: datei.name }, e.status, alle);
    alt.meldung("Bericht hinterlegt.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}
