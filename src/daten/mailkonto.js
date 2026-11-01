// =================================================================
//  MAILKONTO: DIREKT SENDEN ÜBER MICROSOFT 365 (seit 1.323.0)
//  Wunsch Patrick 31. Oktober 2026: Ferien sollen von selbst in Outlook
//  stehen, Bestell-PDFs gleich rausgehen, über das gemeinsame Konto
//  programmierung@hoferco.ch.
//
//  Gesendet wird nur auf dem Server (supabase/functions/mail-senden),
//  der die Zugangsdaten der App-Anmeldung bei Microsoft aus mail_konto
//  liest (sql/mailkonto.sql). Die App sieht den geheimen Schlüssel nie.
//  Ist kein Konto eingerichtet oder fehlt das SQL, bleibt alles wie
//  vorher: Ferien und Bestellungen als .eml-Entwurf für Outlook.
// =================================================================
import { alt } from "../bruecke.jsx";

let stand = null, standZeit = 0;

// { aktiv, absender, name }; eine Minute gemerkt
export async function mailStatus(neu) {
  if (!neu && stand && Date.now() - standZeit < 60000) return stand;
  try {
    const r = await alt.zeitlimit(alt.db.rpc("mail_konto_status"), 6000, "Mailkonto");
    const z = (!r.error && Array.isArray(r.data) ? r.data[0] : r.data) || {};
    stand = { aktiv: !!z.aktiv, absender: z.absender || "", name: z.name || "" };
  } catch (f) {
    stand = { aktiv: false, absender: "", name: "" };
  }
  standZeit = Date.now();
  return stand;
}
export const mailAktiv = async () => (await mailStatus()).aktiv;
export function mailStatusVergessen() { stand = null; }

// Schickt an die Server-Funktion; wirft einen Fehler mit deutschem Text
export async function mailSenden(daten) {
  const r = await alt.zeitlimit(alt.db.functions.invoke("mail-senden", { body: daten }), 60000, "Mail senden");
  if (r.error) {
    let text = r.error.message || String(r.error);
    try { const j = r.error.context && await r.error.context.json(); if (j && j.fehler) text = j.fehler; } catch (f) { /* Text bleibt */ }
    throw new Error(text);
  }
  if (r.data && r.data.fehler) throw new Error(r.data.fehler);
  return r.data || {};
}

export async function kontoLesen() {
  const r = await alt.db.rpc("mail_konto_lesen");
  if (r.error) throw r.error;
  return (Array.isArray(r.data) ? r.data[0] : r.data) || null;
}

export async function kontoSetzen({ mandant, clientId, geheimnis, absender, name }) {
  const r = await alt.db.rpc("mail_konto_setzen", { p_mandant: mandant, p_client_id: clientId,
    p_geheimnis: geheimnis || null, p_absender: absender, p_name: name });
  if (r.error) throw r.error;
  mailStatusVergessen();
}

// Das Bestellblatt läuft in einem eigenen Fenster ohne Zugang zur
// Anmeldung; es ruft über window.opener diese Funktion auf
if (typeof window !== "undefined") {
  window.hoferMailStatus = () => mailStatus(true);
  window.hoferMailSenden = (daten) => mailSenden(daten);
}
