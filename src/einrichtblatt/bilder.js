// =================================================================
//  BILDER DER WERKZEUGE
//  Nur Bilder, die jemand in der App hochlädt (Tabelle eb_bilder,
//  Schlüssel „eigen:<id>“). Gezeichnete Bilder und Vorschläge nach der
//  Tätigkeit gibt es nicht mehr (Patrick, 15. Oktober 2026: „mach es so,
//  dass nirgends Bilder kommen“); die Zeichnungen liegen im Git-Verlauf.
//
//  Ein gewähltes Bild hängt am Artikel (Tabelle artikel_bild) oder am
//  Spezialwerkzeug (eb_spezial): wo dieser Artikel oder dieses Werkzeug
//  wieder gebraucht wird, kommt das Bild von selbst. Ohne beides merkt
//  sich nur der Platz sein Bild.
// =================================================================

let EIGENE = {};
// Die hochgeladenen Bilder: [{ id, name, url }]
export function eigeneBilderSetzen(liste) {
  EIGENE = Object.fromEntries((liste || []).map((b) => ["eigen:" + b.id, { name: b.name || "Eigenes Bild", url: b.url, id: b.id }]));
}
export const eigeneBilder = () => Object.entries(EIGENE).map(([k, b]) => Object.assign({ schluessel: k }, b));
export const bildDaten = (k) => EIGENE[k] || null;

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
