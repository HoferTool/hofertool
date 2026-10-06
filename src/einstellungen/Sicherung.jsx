// =================================================================
//  EINSTELLUNGEN · Sicherung
//  Wunsch Patrick, 6. Oktober 2026: „man soll den Pfad angeben können,
//  wo sie abgespeichert werden, und es soll einfach möglich sein, dass
//  man es reinspielen kann und alles wieder so ist wie beim letzten
//  Sichern“.
//
//  Gesichert wird nicht vom Browser aus, sondern von der Aufgabe
//  „Hofer Sicherung“ (skripte/sicherung.ps1) auf dem Rechner im
//  Betrieb: Nur der kommt an den Ordner auf dem Netzlaufwerk. Die App
//  und das Programm reden über drei Einträge in app_config:
//    sicherung          Speicherort, Uhrzeit, wie lange behalten (Admin)
//    sicherung_auftrag  „Jetzt sichern“ oder „Zurückspielen“ (Admin)
//    sicherung_status   was das Programm meldet: letzte Sicherung,
//                       Liste der Dateien im Ordner, Ergebnis des
//                       letzten Auftrags (Dienstkonto)
//  Das Programm schaut alle fünf Minuten nach, darum dauert ein
//  Auftrag bis zu fünf Minuten, bis er beginnt.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile } from "./teile.jsx";

const SCHLUESSEL = ["sicherung", "sicherung_auftrag", "sicherung_status"];

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

async function laden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
    .in("schluessel", SCHLUESSEL), 6000, "Sicherung");
  if (r && r.error) throw r.error;
  const werte = {};
  ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = jsonOder(x.wert, null); });
  return werte;
}

// Offen = angefordert, aber noch nicht erledigt gemeldet, und nicht
// älter als zwei Tage (dann gilt er auch in der Datenbank nicht mehr)
function auftragOffen(auftrag, status) {
  if (!auftrag || !auftrag.id) return false;
  if (status && status.auftrag && status.auftrag.id === auftrag.id) return false;
  return Date.now() - new Date(auftrag.zeit).getTime() < 2 * 86400000;
}

// „Hofer-Sicherung-2026-10-06-1900.jsonl.gz“ → Datum der Sicherung
function wannAusName(name, ersatz) {
  const m = /(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)/.exec(name || "");
  if (!m) return ersatz ? new Date(ersatz) : null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}
function datumText(d) {
  if (!d || isNaN(d)) return "–";
  const z = (n) => String(n).padStart(2, "0");
  return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + ", " + z(d.getHours()) + ":" + z(d.getMinutes()) + " Uhr";
}
function mbText(mb) {
  if (mb === undefined || mb === null) return "";
  return mb < 1 ? Math.max(1, Math.round(mb * 1024)) + " KB" : String(mb).replace(".", ",") + " MB";
}

export default function Sicherung() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(laden, [auffrischen]);
  // Solange ein Auftrag läuft, alle 10 Sekunden nachsehen, sonst jede Minute
  const offen = daten && auftragOffen(daten.sicherung_auftrag, daten.sicherung_status);
  useEffect(() => {
    const t = setInterval(() => setAuffrischen((n) => n + 1), offen ? 10000 : 60000);
    return () => clearInterval(t);
  }, [offen]);

  if (!daten) {
    return (
      <Gruppe titel="Sicherung" id="si">
        {fehler ? <p className="hinweis">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>}
      </Gruppe>
    );
  }
  return <SicherungInhalt werte={daten} offen={offen} neu={() => setAuffrischen((n) => n + 1)} />;
}

function SicherungInhalt({ werte, offen, neu }) {
  const admin = alt.istAdmin();
  const konf = werte.sicherung || {};
  const status = werte.sicherung_status;
  const auftrag = werte.sicherung_auftrag;
  const [pfad, setPfad] = useState(konf.pfad || "");
  const [stunde, setStunde] = useState(konf.stunde ?? 18);
  const [behalten, setBehalten] = useState(konf.behalten || 30);

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "sicherung",
      wert: JSON.stringify({ pfad: pfad.trim(), stunde: Number(stunde), behalten: Number(behalten) }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung(pfad.trim() ? "Gespeichert. Die nächste Sicherung kommt in diesen Ordner." : "Gespeichert.", "gut");
    neu();
  };

  const auftragGeben = async (art, datei) => {
    const p = alt.profil || {};
    const neuerAuftrag = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), art,
      zeit: new Date().toISOString(), von: p.full_name || p.email || "" };
    if (datei) neuerAuftrag.datei = datei;
    const r = await alt.db.from("app_config").upsert([{ schluessel: "sicherung_auftrag", wert: JSON.stringify(neuerAuftrag) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    neu();
  };

  const jetztSichern = () => {
    if (!konf.pfad) { alt.meldung("Zuerst einen Speicherort eintragen und speichern.", "warn"); return; }
    auftragGeben("sichern");
  };

  const zurueckspielen = async (eintrag) => {
    const wann = datumText(wannAusName(eintrag.d, eintrag.z));
    const ok = await alt.nachfragen({ titel: "Sicherung zurückspielen?",
      text: "Alle Daten der App werden auf den Stand vom " + wann + " gesetzt. Was seither eingetragen "
        + "oder geändert wurde, ist danach weg. Vorher sichert der Rechner den heutigen Stand, "
        + "so lässt er sich wieder zurückholen.",
      bestaetigen: "Zurückspielen", gefahr: true });
    if (!ok) return;
    auftragGeben("zurueck", eintrag.d);
  };

  // ---------- Was das Programm meldet ----------
  let meldezeile;
  if (!status) {
    meldezeile = <span className="gedaempft">Die Aufgabe „Hofer Sicherung“ hat sich noch nicht gemeldet.</span>;
  } else {
    const minuten = (Date.now() - new Date(status.zeit).getTime()) / 60000;
    const l = status.letzte;
    meldezeile = <>
      <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
      {l ? "Letzte Sicherung " + datumText(new Date(l.zeit)) + " · " + alt.zahlText(l.zeilen || 0) + " Einträge · "
        + alt.zahlText(l.dateien || 0) + " Dateien" : "Noch keine Sicherung"}
      {status.rechner && <span className="gedaempft"> · Rechner {status.rechner}</span>}
      {minuten >= 15 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
      {status.fehler && <div className="klein si-fehler" id="si-fehler">{status.fehler}</div>}
    </>;
  }

  // ---------- Laufender oder letzter Auftrag ----------
  let auftragZeile = null;
  if (offen) {
    auftragZeile = <div className="si-auftrag si-auftrag--laeuft" id="si-auftrag">
      <span className="si-dreher" aria-hidden="true" />
      {auftrag.art === "zurueck"
        ? "Zurückspielen von " + datumText(wannAusName(auftrag.datei)) + " ist angefordert."
        : "Sicherung ist angefordert."}
      {" Der Rechner beginnt innert fünf Minuten damit."}
    </div>;
  } else if (status && status.auftrag && auftrag && status.auftrag.id === auftrag.id
             && Date.now() - new Date(status.auftrag.zeit).getTime() < 86400000) {
    auftragZeile = <div className={"si-auftrag " + (status.auftrag.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="si-auftrag">
      {status.auftrag.ok ? "✓ " : "Nicht geklappt: "}{status.auftrag.text}
      {status.auftrag.ok && status.auftrag.art === "zurueck" && " Andere Geräte mit Strg + F5 neu laden."}
    </div>;
  }

  const liste = (status && status.liste) || [];

  return (
    <>
      <Gruppe titel="Sicherung" id="si"
        text={"Einmal am Tag sichert der Rechner im Betrieb alle Daten der App und alle hochgeladenen Dateien "
          + "in diesen Ordner. Passwörter und PINs sind nicht dabei, sie bleiben, wie sie sind."}>
        <Zeile titel="Speicherort" text="Als \\Server\Freigabe\… eintragen, nicht mit Laufwerksbuchstaben wie Z:.">
          <input type="text" id="si-pfad" aria-label="Speicherort der Sicherung"
            placeholder={"\\\\Server\\Sicherungen\\Hofer Tool"} value={pfad} disabled={!admin}
            onChange={(e) => setPfad(e.target.value)} />
        </Zeile>
        <Zeile titel="Täglich ab" text="Sobald der Rechner nach dieser Uhrzeit läuft. War er aus, holt er es nach.">
          <select id="si-stunde" value={stunde} disabled={!admin} onChange={(e) => setStunde(e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 Uhr</option>)}
          </select>
        </Zeile>
        <Zeile titel="Behalten" text="Ältere Sicherungen werden gelöscht, die neuesten drei bleiben immer.">
          <select id="si-behalten" value={behalten} disabled={!admin} onChange={(e) => setBehalten(e.target.value)}>
            {[7, 14, 30, 60, 90, 180, 365].map((t) => <option key={t} value={t}>{t} Tage</option>)}
          </select>
        </Zeile>
        <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
          <div id="si-stand" className="dokpfad-stand">{meldezeile}</div>
          {admin && <button className="knopf knopf--klein" id="si-jetzt" disabled={offen}
            onClick={jetztSichern}>Jetzt sichern</button>}
          {admin && <button className="knopf knopf--klein knopf--haupt" id="si-speichern"
            onClick={speichern}>Speichern</button>}
        </div>
        {auftragZeile}
      </Gruppe>

      <Gruppe titel="Zurückspielen" id="si-zurueck"
        text="Setzt alle Daten der App auf den Stand einer Sicherung zurück. Fehlende Dateien kommen aus dem Ordner wieder dazu.">
        {liste.length
          ? <div className="tabellenrolle"><table className="tabelle es-tabelle" id="si-liste">
              <thead><tr><th>Stand vom</th><th>Grösse</th><th /></tr></thead>
              <tbody>{liste.map((x) => (
                <tr key={x.d}>
                  <td>{datumText(wannAusName(x.d, x.z))}
                    {/vor-Zurueckspielen/.test(x.d) && <span className="marke si-marke">vor dem Zurückspielen</span>}</td>
                  <td className="nowrap">{mbText(x.mb)}</td>
                  <td className="si-knopfzelle">{admin && <button className="knopf knopf--klein si-zurueckknopf"
                    disabled={offen} onClick={() => zurueckspielen(x)}>Zurückspielen</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          : <p className="es-leer">{status ? "Im Ordner liegt noch keine Sicherung." : "Noch keine Sicherung gemeldet."}</p>}
      </Gruppe>
    </>
  );
}
