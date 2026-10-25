// =================================================================
//  BILDER DER WERKZEUGE
//  Die Sinnbilder der Norm (sinnbilder.js, seit 1.184.0, Wunsch Patrick
//  25. Oktober 2026) und Bilder, die jemand in der App hochlädt (Tabelle
//  eb_bilder, Schlüssel „eigen:<id>“). Vorschläge nach der Tätigkeit gibt
//  es weiterhin nicht (Patrick, 15. Oktober 2026: „mach es so, dass
//  nirgends Bilder kommen“); ein Sinnbild kommt nur von Hand oder beim
//  Einlesen dort, wo das Excel ein Bild hatte.
//
//  Ein gewähltes Bild hängt am Artikel (Tabelle artikel_bild) oder am
//  Spezialwerkzeug (eb_spezial): wo dieser Artikel oder dieses Werkzeug
//  wieder gebraucht wird, kommt das Bild von selbst. Ohne beides merkt
//  sich nur der Platz sein Bild.
// =================================================================

import { SINNBILDER } from "./sinnbilder.js";

const NORM = Object.fromEntries(SINNBILDER.map(([k, name, svg]) => [k, { name, svg }]));
export const sinnbilder = () => SINNBILDER.map(([k, name, svg]) => ({ schluessel: k, name, svg }));

let EIGENE = {};
// Die hochgeladenen Bilder: [{ id, name, url }]
export function eigeneBilderSetzen(liste) {
  EIGENE = Object.fromEntries((liste || []).map((b) => ["eigen:" + b.id, { name: b.name || "Eigenes Bild", url: b.url, id: b.id }]));
}
export const eigeneBilder = () => Object.entries(EIGENE).map(([k, b]) => Object.assign({ schluessel: k }, b));
export const bildDaten = (k) => NORM[k] || EIGENE[k] || null;

// Woran sich das Bild merkt: Artikel oder Spezialwerkzeug („s:<id>“)
export const bildSchluesselVon = (p) => (p && p.article_id) || (p && p.spezial_id ? "s:" + p.spezial_id : null);

// Welches Bild der Platz zeigt: das des Artikels oder Spezialwerkzeugs,
// sonst das eigene. art sagt, woher es kommt.
export function platzBild(p, gemerkt) {
  if (!p) return null;
  const k = bildSchluesselVon(p);
  const a = k && gemerkt && gemerkt[k];
  if (a && bildDaten(a)) return { schluessel: a, art: "gemerkt" };
  if (p.bild && bildDaten(p.bild)) return { schluessel: p.bild, art: "platz" };
  return null;
}
