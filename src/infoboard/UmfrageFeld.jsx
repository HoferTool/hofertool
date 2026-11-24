// =================================================================
//  UMFRAGE AUF DER ANZEIGE (seit 1.762.0)
//
//  Wunsch Patrick 24. November 2026: „man soll Umfragen direkt auf die
//  Anzeige reinmachen können, also Infoboard“. Teil { art: "umfrage",
//  umfrage } auf Infoboard, Empfang oder Pausenraum: Frage, Vorschläge
//  mit Balken und Zahl der Stimmen, daneben gross der QR-Code zum
//  Abstimmen mit dem Handy (public/abstimmen/). Nie Namen: gelesen wird
//  über umfrage_qr_lesen, das nur Zahlen gibt. Frisch alle 30 Sekunden.
// =================================================================

import { useEffect, useMemo, useState } from "react";
import { alt } from "../bruecke.jsx";
import { abstimmAdresse } from "../seiten/start/Umfragen.jsx";

const TAKT = 30000;

function useQr(adresse) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let aus = false;
    import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(adresse);
      qr.make();
      if (!aus) setSvg(qr.createSvgTag({ cellSize: 8, margin: 1, scalable: true }));
    }, () => {});
    return () => { aus = true; };
  }, [adresse]);
  return svg;
}

export function UmfrageFlaeche({ feld, breite, hoehe }) {
  const [u, setU] = useState(undefined);
  useEffect(() => {
    let aus = false;
    const holen = async () => {
      try {
        const { data, error } = await alt.db.rpc("umfrage_qr_lesen", { p_umfrage: feld.umfrage });
        if (!aus && !error) setU(data || null);
      } catch (f) { /* nächste Runde */ }
    };
    holen();
    const t = setInterval(holen, TAKT + Math.random() * 5000);
    return () => { aus = true; clearInterval(t); };
  }, [feld.umfrage]);
  const adresse = useMemo(() => abstimmAdresse(feld.umfrage), [feld.umfrage]);
  const svg = useQr(adresse);
  const quer = breite > hoehe * 1.15;
  // Schrift aus der kleineren Seite, damit es auf jeder Grösse passt
  const s = Math.max(10, Math.min(breite, hoehe) / 16);
  // QR-Code so gross wie möglich, er muss von weitem lesbar sein
  const qrGross = Math.round(quer ? Math.min(hoehe * 0.72, breite * 0.4) : Math.min(breite * 0.6, hoehe * 0.38));

  if (u === undefined) return <div className="ib-umf hell-bleibt" />;
  if (!u) return <div className="ib-umf hell-bleibt" style={{ fontSize: s }}><p className="ib-umf__leer">Umfrage nicht gefunden.</p></div>;
  const max = Math.max(1, ...u.vorschlaege.map((v) => v.stimmen));
  return (
    <div className={"ib-umf hell-bleibt" + (quer ? " ib-umf--quer" : "")} style={{ fontSize: s }} data-ib-umfrage={u.id}>
      <div className="ib-umf__text">
        <div className="ib-umf__marke">Umfrage{u.offen ? "" : " · geschlossen"}</div>
        <h3 className="ib-umf__titel">{u.titel}</h3>
        {u.beschreibung && <p className="ib-umf__beschr">{u.beschreibung}</p>}
        <ol className="ib-umf__liste">
          {u.vorschlaege.map((v) => (
            <li key={v.id}>
              <div className="ib-umf__zeile"><span>{v.text}</span><b>{v.stimmen}</b></div>
              <div className="ib-umf__balken"><i style={{ width: (100 * v.stimmen / max) + "%" }} /></div>
            </li>))}
        </ol>
        <div className="ib-umf__leute">{u.leute === 1 ? "1 Person hat abgestimmt" : alt.zahlText(u.leute) + " Personen haben abgestimmt"}</div>
      </div>
      {u.offen &&
        <div className="ib-umf__qr">
          <div className="ib-umf__code" style={{ width: qrGross, height: qrGross }} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="ib-umf__scan">Mit dem Handy scannen und abstimmen</div>
        </div>}
    </div>
  );
}

// Wahl beim Gestalten: offene Umfragen; gewählt wird sie gleich per QR erreichbar
export async function umfrageWaehlen() {
  const { data, error } = await alt.db.from("umfragen").select("id, titel, offen, qr")
    .eq("offen", true).order("sort", { ascending: true }).order("erstellt_am", { ascending: false });
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return null; }
  if (!data || !data.length) { alt.meldung("Keine offene Umfrage. Lege zuerst auf der Startseite eine an.", "warn"); return null; }
  const id = data.length === 1 ? data[0].id
    : await alt.auswahlDialog("Welche Umfrage?", data.map((u) => ({ wert: u.id, text: u.titel })));
  if (!id) return null;
  const u = data.find((x) => x.id === id);
  if (!u.qr) {
    const r = await alt.db.from("umfragen").update({ qr: true }).eq("id", id);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return null; }
  }
  return { umfrage: id, titel: u.titel };
}
