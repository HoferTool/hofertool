// =================================================================
//  EINSTELLUNGEN · Sicherung
//  Seit 111.109.0 macht die App die Sicherung selbst, ohne Programm auf
//  einem Rechner (Wunsch Patrick, 8. Oktober 2026): eine ZIP-Datei mit
//  allen Daten und allen hochgeladenen Dateien in einen Ordner, den man
//  auf diesem Gerät einmal wählt. Zeichnungen und Einrichtblätter sind
//  seit 111.116.0 nicht dabei (Wunsch Patrick, 8. Oktober 2026), die holt
//  die Aufgabe „HoferTool“ aus den Ordnern am Pool-Rechner. Ablauf und
//  Format in src/teile/sicherung.js.
//
//  In app_config:
//    sicherung         Uhrzeit, wie lange behalten, welches Gerät sichert,
//                      mit welchem Konto ausser Admins (konto, etwa das
//                      Planwand-Konto auf dem Pool-Rechner, sql/sicherung-konto.sql)
//    sicherung_status  letzte Sicherung, Fehler, Liste der Dateien im Ordner
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile } from "./teile.jsx";
import {
  kannOrdner, geraetId, geraetName, ordnerHolen, ordnerWaehlen, ordnerErlaubt, ordnerListe,
  konfLaden, konfSpeichern, sichernUndMelden, sicherungLaeuft, wannAusName, sicherungKopf, zurueckspielen, ohneZaehlen,
} from "../teile/sicherung.js";

function datumText(d) {
  if (!d || isNaN(d)) return "–";
  const z = (n) => String(n).padStart(2, "0");
  return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + ", " + z(d.getHours()) + ":" + z(d.getMinutes()) + " Uhr";
}
// „ohne 250 Zeichnungen, 1 Einrichtblatt und 470 alte Dateien“ (leer, wenn nichts ausgelassen wurde)
function ohneText(z, e, a) {
  const teile = [];
  if (z) teile.push(z === 1 ? "1 Zeichnung" : alt.zahlText(z) + " Zeichnungen");
  if (e) teile.push(e === 1 ? "1 Einrichtblatt" : alt.zahlText(e) + " Einrichtblätter");
  if (a) teile.push(a === 1 ? "1 alte Datei" : alt.zahlText(a) + " alte Dateien");
  return teile.length > 2 ? teile.slice(0, -1).join(", ") + " und " + teile[teile.length - 1] : teile.join(" und ");
}
function mbText(mb) {
  if (mb === undefined || mb === null) return "";
  return mb < 1 ? Math.max(1, Math.round(mb * 1024)) + " KB" : String(mb).replace(".", ",") + " MB";
}

export default function Sicherung() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(konfLaden, [auffrischen]);
  useEffect(() => {
    const t = setInterval(() => setAuffrischen((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (!daten) {
    return (
      <Gruppe titel="Sicherung" id="si">
        {fehler ? <p className="hinweis">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>}
      </Gruppe>
    );
  }
  return <SicherungInhalt konf={daten.konf} status={daten.status} neu={() => setAuffrischen((n) => n + 1)} />;
}

function SicherungInhalt({ konf, status, neu }) {
  const admin = alt.istAdmin();
  const [stunde, setStunde] = useState(konf.stunde ?? 18);
  const [behalten, setBehalten] = useState(konf.behalten || 30);
  const [konto, setKonto] = useState(konf.konto || "");
  const [konten, setKonten] = useState([]);
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [liste, setListe] = useState(null);
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const dateiFeld = useRef(null);
  const hier = konf.geraet && konf.geraet.id === geraetId();

  // Ordner dieses Geräts und, wenn freigegeben, seine Sicherungen
  const ordnerLesen = async (h) => {
    const s = await ordnerErlaubt(h, false);
    setGriff(h); setErlaubt(s);
    if (s === "granted") { try { setListe(await ordnerListe(h)); } catch (f) { setListe(null); } }
  };
  useEffect(() => { if (kannOrdner) ordnerHolen().then(ordnerLesen); }, []);
  // Konten ohne Admin, die die tägliche Sicherung machen dürfen
  useEffect(() => {
    Promise.resolve(alt.db.from("profiles").select("id, full_name, email, role, is_active").order("full_name"))
      .then((r) => setKonten(((r && r.data) || []).filter((p) => p.role !== "admin" && p.is_active !== false)))
      .catch(() => {});
  }, []);

  const speichern = async (extra) => {
    const neuKonf = Object.assign({}, konf, { stunde: Number(stunde), behalten: Number(behalten), konto: konto || null }, extra || {});
    delete neuKonf.pfad;
    await konfSpeichern(neuKonf);
    return neuKonf;
  };

  // Ordner wählen macht dieses Gerät zum Sicherungsgerät
  const ordnerNeu = async () => {
    let h;
    try { h = await ordnerWaehlen(); } catch (f) { return null; }
    try {
      await speichern({ geraet: { id: geraetId(), name: geraetName(), ordner: h.name } });
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return null; }
    await ordnerLesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät macht jetzt die Sicherungen.", "gut");
    neu();
    return h;
  };

  // Freigabe holen (braucht den Klick), sonst Ordner wählen. Nur „Ordner
  // wählen“ macht ein Gerät zum Sicherungsgerät; „Jetzt sichern“ an einem
  // anderen Computer schreibt bloss dort hin (der Pool-Rechner bleibt es).
  const ordnerBereit = async () => {
    if (griff && (await ordnerErlaubt(griff, true)) === "granted") return griff;
    if (!konf.geraet) return ordnerNeu();
    let h;
    try { h = await ordnerWaehlen(); } catch (f) { return null; }
    await ordnerLesen(h);
    return h;
  };

  const jetztSichern = async () => {
    if (sicherungLaeuft()) return;
    const h = await ordnerBereit();
    if (!h) return;
    setErgebnis(null); setArbeit("Sicherung beginnt …");
    try {
      const l = await sichernUndMelden(h, "manuell", setArbeit, Number(behalten));
      const ohne = ohneText(l.ohneZeichnungen, l.ohneEinrichtblaetter, l.ohneAlt);
      setErgebnis({ ok: true, text: "Gesichert: " + l.datei + " (" + mbText(l.mb) + ", " + alt.zahlText(l.zeilen) + " Einträge, "
        + alt.zahlText(l.dateien) + " Dateien" + (l.fehlt ? ", " + l.fehlt + " Dateien nicht lesbar" : "")
        + (ohne ? ", ohne " + ohne : "") + ")" });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    await ordnerLesen(h);
    neu();
  };

  const einspielen = async (datei) => {
    let kopf;
    try { kopf = (await sicherungKopf(datei)).kopf; }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
    const wann = datumText(new Date(kopf.erstellt));
    const oz = ohneZaehlen(kopf.ausgelassen);
    const ohne = ohneText(oz.zeichnungen, oz.einrichtblaetter, oz.alt);
    const ok = await alt.nachfragen({ titel: "Sicherung zurückspielen?",
      text: "Alle Daten der App werden auf den Stand vom " + wann + " gesetzt. Was seither eingetragen oder geändert "
        + "wurde, ist danach weg." + (griff && erlaubt === "granted" ? " Vorher wird der heutige Stand in den Ordner gesichert." : "")
        + (ohne ? " Nicht in der Sicherung: " + ohne + "; Zeichnungen und Einrichtblätter kommen aus den Ordnern am Pool-Rechner." : ""),
      bestaetigen: "Zurückspielen", gefahr: true });
    if (!ok) return;
    setErgebnis(null);
    try {
      let vorher = null;
      if (griff && (await ordnerErlaubt(griff, true)) === "granted") {
        setArbeit("Heutiger Stand wird zuerst gesichert …");
        vorher = await sichernUndMelden(griff, "vorher", setArbeit, Number(behalten));
      }
      const r = await zurueckspielen(datei, setArbeit);
      setErgebnis({ ok: true, zurueck: true, text: "Zurückgespielt: " + alt.zahlText(r.zeilen || 0) + " Einträge in " + (r.tabellen || 0)
        + " Tabellen" + (r.dateien ? ", " + r.dateien + " Dateien wieder hochgeladen" : "")
        + (r.dateienFehlt ? ", " + r.dateienFehlt + " Dateien nicht möglich" : "")
        + (r.ohneKonto ? ", " + r.ohneKonto + " Person(en) ohne Anmeldekonto weggelassen" : "")
        + (vorher ? ". Der Stand davor liegt in " + vorher.datei : "") + "."
        + (ohneFehltText(r) ? " " + ohneFehltText(r) : "") });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    if (griff) await ordnerLesen(griff);
  };

  // Zeichnungen und Einrichtblätter, die weder in der Sicherung noch in der Ablage sind
  const ohneFehltText = (r) => {
    const t = ohneText(r.ohneZeichnungen, r.ohneEinrichtblaetter);
    return t ? "Nicht in der Sicherung und in der Ablage nicht mehr da: " + t
      + ". Sie müssen aus den Ordnern am Pool-Rechner neu hochgeladen werden." : "";
  };

  const ausOrdner = async (name) => {
    try { einspielen(await (await griff.getFileHandle(name)).getFile()); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  // ---------- Stand ----------
  const l = status && status.letzte;
  const ordnerText = konf.geraet
    ? "Ordner „" + (konf.geraet.ordner || "?") + "“ auf " + (hier ? "diesem Gerät" : konf.geraet.name || "einem anderen Gerät")
    : "Noch kein Ordner gewählt";
  const meldezeile = <>
    <span className={"dokpfad-punkt " + (l && Date.now() - new Date(l.zeit).getTime() < 36 * 3600000 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
    {l ? "Letzte Sicherung " + datumText(new Date(l.zeit)) + " · " + alt.zahlText(l.zeilen || 0) + " Einträge · "
      + alt.zahlText(l.dateien || 0) + " Dateien" + (l.mb ? " · " + mbText(l.mb) : "")
      + (ohneText(l.ohneZeichnungen, l.ohneEinrichtblaetter, l.ohneAlt) ? " · ohne " + ohneText(l.ohneZeichnungen, l.ohneEinrichtblaetter, l.ohneAlt) : "")
      : "Noch keine Sicherung"}
    {status && status.fehler && <div className="klein si-fehler" id="si-fehler">{status.fehler}</div>}
  </>;
  const zeilen = liste || (status && status.liste) || [];

  return (
    <>
      <Gruppe titel="Sicherung" id="si"
        text={"Die App sichert alle Daten und alle hochgeladenen Dateien (WBGs, Bilder, Notizbuch-Seiten) in eine einzige "
          + "Datei im gewählten Ordner, einmal am Tag ab der eingestellten Uhrzeit. Dafür muss die App auf dem Gerät mit "
          + "dem Ordner offen sein, mit einem Admin oder dem Konto unten angemeldet; war sie zu, holt sie es beim nächsten "
          + "Öffnen nach. "
          + "Nicht dabei: Zeichnungen und Einrichtblätter (die liegen in den Ordnern am Pool-Rechner, und die Aufgabe "
          + "„HoferTool“ lädt sie von dort hoch), alte Dateien, die nirgends mehr gebraucht werden, Passwörter und PINs."}>
        <Zeile titel="Speicherort" text={ordnerText}>
          {kannOrdner
            ? admin && <button className="knopf knopf--klein" id="si-ordner" onClick={ordnerNeu}>
                {griff && hier ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
            : <span className="klein gedaempft">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
        </Zeile>
        {hier && griff && erlaubt !== "granted" && <p className="hinweis klein" id="si-freigabe">
          Der Browser braucht die Erlaubnis für den Ordner nochmals. Einmal auf „Jetzt sichern“ drücken und „Zulassen“ wählen,
          am besten „Bei jedem Besuch zulassen“.</p>}
        <Zeile titel="Täglich ab" text="Sobald die App nach dieser Uhrzeit offen ist.">
          <select id="si-stunde" value={stunde} disabled={!admin} onChange={(e) => setStunde(e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 Uhr</option>)}
          </select>
        </Zeile>
        <Zeile titel="Sichern auch als" text="Konto ohne Admin, das auf dem Sicherungsgerät angemeldet ist, etwa Planwand auf dem Pool-Rechner.">
          <select id="si-konto" value={konto} disabled={!admin} onChange={(e) => setKonto(e.target.value)}>
            <option value="">nur Admins</option>
            {konten.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </Zeile>
        <Zeile titel="Behalten" text="Ältere Sicherungen werden im Ordner gelöscht, die neuesten drei bleiben immer.">
          <select id="si-behalten" value={behalten} disabled={!admin} onChange={(e) => setBehalten(e.target.value)}>
            {[7, 14, 30, 60, 90, 180, 365].map((t) => <option key={t} value={t}>{t} Tage</option>)}
          </select>
        </Zeile>
        <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
          <div id="si-stand" className="dokpfad-stand">{meldezeile}</div>
          {admin && kannOrdner && <button className="knopf knopf--klein" id="si-jetzt" disabled={!!arbeit}
            onClick={jetztSichern}>Jetzt sichern</button>}
          {admin && <button className="knopf knopf--klein knopf--haupt" id="si-speichern"
            onClick={async () => { try { await speichern(); alt.meldung("Gespeichert.", "gut"); neu(); }
              catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); } }}>Speichern</button>}
        </div>
        {arbeit && <div className="si-auftrag si-auftrag--laeuft" id="si-auftrag">
          <span className="si-dreher" aria-hidden="true" />{arbeit} Bitte die App offen lassen.</div>}
        {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="si-auftrag">
          {ergebnis.ok ? "✓ " : "Nicht geklappt: "}{ergebnis.text}
          {ergebnis.zurueck && <> <button className="knopf knopf--klein" onClick={() => location.reload()}>Neu laden</button></>}
        </div>}
      </Gruppe>

      <Gruppe titel="Zurückspielen" id="si-zurueck"
        text={"Setzt alle Daten der App auf den Stand einer Sicherung zurück. Fehlende Dateien kommen aus der Sicherung wieder hoch; "
          + "Zeichnungen und Einrichtblätter sind nicht darin, die kommen aus den Ordnern am Pool-Rechner."}
        aktionen={admin && <>
          <button className="knopf knopf--klein" id="si-datei" disabled={!!arbeit}
            onClick={() => dateiFeld.current && dateiFeld.current.click()}>Datei wählen …</button>
          <input ref={dateiFeld} type="file" hidden accept=".zip,application/zip"
            onChange={(e) => { const d = e.target.files && e.target.files[0]; e.target.value = ""; if (d) einspielen(d); }} />
        </>}>
        {zeilen.length
          ? <div className="tabellenrolle"><table className="tabelle es-tabelle" id="si-liste">
              <thead><tr><th>Stand vom</th><th>Grösse</th><th /></tr></thead>
              <tbody>{zeilen.map((x) => (
                <tr key={x.d}>
                  <td>{datumText(wannAusName(x.d, x.z))}
                    {/vor-Zurueckspielen/.test(x.d) && <span className="marke si-marke">vor dem Zurückspielen</span>}</td>
                  <td className="nowrap">{mbText(x.mb)}</td>
                  <td className="si-knopfzelle">{admin && liste && <button className="knopf knopf--klein si-zurueckknopf"
                    disabled={!!arbeit} onClick={() => ausOrdner(x.d)}>Zurückspielen</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          : <p className="es-leer">Im Ordner liegt noch keine Sicherung. Mit „Datei wählen …“ lässt sich jede Sicherungsdatei zurückspielen.</p>}
      </Gruppe>
    </>
  );
}
