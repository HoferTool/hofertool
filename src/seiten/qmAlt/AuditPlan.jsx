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
import { qmDatum,
  auditBereiche, auditQuartal, auditBereicheVonEintrag, auditExtern, berichteZuteilen, statusVon, textSpeichern, eintragSpeichern, heute,
  checklisteFuer,
} from "../../daten/qmAlt.js";
import { checklisteOeffnen, checklistenVerwalten } from "./Checkliste.jsx";
import { externVerarbeiten } from "./berichtVerarbeiten.js";

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
  const [alleNaechsten, setAlleNaechsten] = useState(false);
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

  // Seit 1.469.0: je Bereich mit Checkliste das nächste offene Audit (oder
  // eines, dessen Checkliste schon angefangen ist) mit Knopf zum Durchführen
  const mitCk = audits.filter((e) => checklisteFuer(daten.texte, e) &&
    (e.status !== "durchgefuehrt" || (e.daten.checkliste && !e.daten.checkliste.abgeschlossen_am)));
  const naechste = [];
  const ordnung = (e) => (e.daten.checkliste ? "0" : "1") + (e.daten.datum || (auditQuartal(e) || "9999") + "-99");
  for (const e of [...mitCk].sort((a, b) => ordnung(a).localeCompare(ordnung(b)))) {
    const b = checklisteFuer(daten.texte, e).bereich;
    if (!naechste.some((x) => x.b === b)) naechste.push({ b, e });
  }

  return (
    <section className="karte" id="qma-auditplan">
      <div className="karte__kopf">
        <h2>Auditplan <span className="klein">QMS / AS-Audits</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-ap-frueher" disabled={ab <= fruehestes} onClick={() => schieben(-anzahl)}>◀ Früher</button>
          <button className="knopf" id="qma-ap-heute" onClick={() => { gemerktAb = diesesJahr; setAb(diesesJahr); }}>{diesesJahr}</button>
          <button className="knopf" id="qma-ap-spaeter" onClick={() => schieben(anzahl)}>Später ▶</button>
          <button className="knopf" id="qma-ap-berichte" onClick={() => berichteZuordnen(daten.eintraege, neu)}>📎 Berichte zuordnen</button>
 <button className="knopf" id="qma-ap-checklisten" onClick={() => checklistenVerwalten(daten.texte, neu)}>☑ Checklisten</button>
          <button className="knopf" id="qma-ap-bereiche" onClick={() => bereicheDialog(daten.texte, bereiche, neu)}>Bereiche ändern</button>
        </div>
      </div>
      <p className="hinweis">Leeres Feld antippen sieht dort ein Audit vor. Kärtchen antippen öffnet das Audit: Datum setzen = terminiert,
        Status „Durchgeführt“ und die Feststellungen eintragen, wenn es vorbei ist. Kärtchen mit 📄 öffnen gleich den Bericht,
        ⓘ daneben die Angaben zum Audit. „Berichte zuordnen“ hängt mehrere Berichte auf einmal an.</p>
      {/* Seit 1.473.0 hat jeder Bereich eine Checkliste: oben nur die drei
          nächsten (angefangene zuerst), der Rest aufklappbar */}
      {naechste.slice(0, alleNaechsten ? naechste.length : 3).map(({ b, e }) => {
        const q = e.daten.datum ? qmDatum(e.daten.datum) : (auditQuartal(e) || "").replace("-", " ");
        const spaet = e.faellig && e.faellig < heute();
        const angefangen = e.daten.checkliste && !e.daten.checkliste.abgeschlossen_am;
        return (
          <div key={b} className="qma-ck-naechste" data-qmacknaechste={e.id}>
            <span>☑ <b>Nächstes Audit {b}</b> · {e.titel} · {q}{spaet ? <span className="qm-spaet"> · überfällig</span> : null}</span>
            <button className="knopf knopf--haupt" data-qmackstart={e.id}
              onClick={() => checklisteOeffnen(e, daten.texte, daten.eintraege, neu)}>
              {angefangen ? "Audit weiterführen" : "Audit mit Checkliste durchführen"}</button>
          </div>
        );
      })}
      {naechste.length > 3 && <button className="knopf knopf--still knopf--klein" id="qma-ck-naechste-alle"
        onClick={() => setAlleNaechsten(!alleNaechsten)}>{alleNaechsten ? "Weniger zeigen" : "Alle " + naechste.length + " nächsten Audits mit Checkliste zeigen"}</button>}
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

// Seit 1.468.0 (Wunsch Patrick 10. November 2026: „Auditberichte direkt mit
// dem Auditplan verknüpfen, dass ich direkt auf den Bericht komme, aktuelle
// Information beibehalten“): mit Bericht öffnet das Kärtchen gleich den
// Bericht, das ⓘ daneben die Angaben zum Audit wie bisher.
function Kaertchen({ e, oeffnen }) {
  const d = e.daten || {};
  const s = statusVon("audit", e.status);
  const spaet = e.status !== "durchgefuehrt" && e.faellig && e.faellig < heute();
  const kurz = ART_KURZ[d.art];
  const titel = (e.titel || "") + " · " + s.text + (d.datum ? " · " + qmDatum(d.datum) : "") + (spaet ? " · überfällig" : "");
  const inhalt = <>
    {e.status === "durchgefuehrt" ? "✓" : e.status === "geplant" ? "◷" : "●"}
    {d.datum ? <span> {qmDatum(d.datum)}</span> : null}
    {kurz ? <b> {kurz}</b> : null}
  </>;
  const klasse = "qma-ap-karte qma-ap-karte--" + e.status + (spaet ? " qma-ap-karte--spaet" : "");
  if (!d.bericht_url) {
    return <button className={klasse} data-qmaapkarte={e.id} title={titel}
      onClick={(ev) => { ev.stopPropagation(); oeffnen(); }}>{inhalt}</button>;
  }
  return (
    <span className={klasse + " qma-ap-karte--bericht"} onClick={(ev) => ev.stopPropagation()}>
      <button className="qma-ap-karte__bericht" data-qmaapkarte={e.id} data-qmaapbericht={e.id} title={"Bericht öffnen: " + titel}
        onClick={() => berichtZeigen(e)}>{inhalt} 📄</button>
      <button className="qma-ap-karte__info" data-qmaapinfo={e.id} title={"Angaben zum Audit: " + titel} aria-label="Angaben zum Audit"
        onClick={() => oeffnen()}>ⓘ</button>
    </span>
  );
}

export function berichtZeigen(e) {
  const url = e.daten.bericht_url;
  alt.betrachter(url, "Auditbericht " + (e.titel || "") + (e.daten.datum ? " " + qmDatum(e.daten.datum) : ""), !/\.(png|jpe?g|webp|gif)$/i.test(url));
}

// Mehrere Berichte auf einmal: die App ordnet jede Datei ihrem Audit zu
// (gleicher Dateiname wie beim Audit vermerkt, sonst gleiches Datum im
// Namen und die meisten gleichen Wörter), zeigt die Zuordnung und lädt
// erst nach „Hochladen“. Vorhandene Angaben am Audit bleiben.
async function berichteZuordnen(alle, neu) {
  const dateien = await new Promise((fertig) => {
    const f = document.createElement("input");
    f.type = "file"; f.multiple = true; f.accept = "application/pdf,.pdf,image/*";
    f.onchange = () => fertig(Array.from(f.files || []));
    f.click();
  });
  if (!dateien.length) return;
  const audits = alle.filter((e) => e.art === "audit");
  const zu = berichteZuteilen(dateien.map((d) => d.name), audits);
  const gefunden = dateien.map((d, i) => ({ d, e: zu[i] })).filter((x) => x.e);
  const ohne = dateien.filter((d, i) => !zu[i]);
  const zeile = (x) => "• " + x.d.name + " → " + (x.e.titel || "") + (x.e.daten.datum ? " (" + qmDatum(x.e.daten.datum) + ")" : "") +
    (x.e.daten.bericht_url ? " · ersetzt den bisherigen Bericht" : "");
  const ok = await alt.nachfragen({
    titel: "Berichte zuordnen",
    text: <span className="qma-ap-zuordnung">
      {gefunden.length ? gefunden.length + " Bericht(e) gefunden:" : "Keine Datei passt zu einem Audit."}
      {gefunden.map((x, i) => <span key={"g" + i} className="qma-ap-zuordnung__zeile" data-qmaapzu={x.e.id}>{zeile(x)}</span>)}
      {ohne.length ? <span className="qma-ap-zuordnung__ohne">Ohne passendes Audit (beim Audit einzeln mit 📎 anhängen):</span> : null}
      {ohne.map((d, i) => <span key={"o" + i} className="qma-ap-zuordnung__zeile">• {d.name}</span>)}
    </span>,
    bestaetigen: gefunden.length ? "Hochladen" : "Schliessen",
  });
  if (!ok || !gefunden.length) return;
  let n = 0;
  const texte = [];
  for (const x of gefunden) {
    try { const t = await berichtAblegen(x.e, x.d, alle); if (t) texte.push(t); n++; } catch (f) { alt.meldung(x.d.name + ": " + alt.fehlertext(f), "fehler"); }
  }
  alt.meldung(n + " Bericht(e) hinterlegt." + (texte.length ? " " + texte.join(" ") : ""), n ? "gut" : "fehler");
  neu();
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
  try {
    const t = await berichtAblegen(e, datei, alle);
    alt.meldung("Bericht hinterlegt." + (t ? " " + t : ""), "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Datei in die Ablage legen, gibt die Angaben für das Audit zurück
export async function berichtDateiAblegen(e, datei) {
  const name = String(datei.name || "bericht.pdf").normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
  const pfad = "qm/audits/" + e.id + "/" + Date.now() + "-" + name;
  const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei, { contentType: datei.type || "application/pdf", upsert: false });
  if (up.error) throw up.error;
  const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
  return { bericht_url: url, bericht_pfad: pfad, bericht_name: datei.name };
}

// Seit 1.482.0 liest die App einen externen Bericht gleich mit
// (berichtVerarbeiten.js); gibt den Text dazu zurück, sonst leer.
async function berichtAblegen(e, datei, alle) {
  const b = await berichtDateiAblegen(e, datei);
  const v = await externVerarbeiten(e, { ...e.daten, ...b }, datei, alle);
  await eintragSpeichern("audit", e, v ? v.daten : { ...e.daten, ...b }, v ? v.status : e.status, alle);
  return v ? v.text : "";
}
