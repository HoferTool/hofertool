// =================================================================
//  QM alternativ: Handbuch und Managementbewertung zum Drucken oder als
//  PDF speichern (Drucken → „Als PDF speichern“). Ein eigenes Fenster mit
//  schlichtem Blatt, damit das Audit etwas in der Hand hat.
// =================================================================
import { alt } from "../../bruecke.jsx";

const STIL = `
  body { font: 11pt/1.45 Arial, sans-serif; color: #111; margin: 18mm 16mm; }
  h1 { font-size: 18pt; margin: 0 0 2mm; } h2 { font-size: 13pt; margin: 8mm 0 2mm; border-bottom: 1px solid #999; }
  h3 { font-size: 11pt; margin: 5mm 0 1mm; } .norm { color: #666; font-weight: normal; font-size: 9pt; }
  p, .text { white-space: pre-wrap; margin: 0 0 2mm; } table { border-collapse: collapse; width: 100%; margin: 2mm 0; }
  td, th { border: 1px solid #bbb; padding: 3px 6px; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #eee; } .kopf { color: #555; font-size: 9pt; margin-bottom: 6mm; }
  @page { size: A4; margin: 0; }`;

export function blattDrucken(titel, html) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alt.meldung("Der Browser hat das Fenster gesperrt. Pop-ups für diese Seite erlauben.", "warn"); return; }
  w.document.open();
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${alt.esc(titel)}</title><style>${STIL}</style></head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* Fenster schon zu */ } }, 300);
}

export const absatz = (t) => `<div class="text">${alt.esc(t || "–")}</div>`;
