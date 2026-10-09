// =================================================================
//  DRUCKEN AUS DER APP HERAUS
//  Zeichnung, WBG, Einrichtblatt und Fotos werden direkt aus der
//  laufenden Seite gedruckt: Der Inhalt kommt in einen eigenen
//  Bereich, alles andere wird nur für den Druck ausgeblendet, dann
//  window.print(). Vorher lief der Druck über ein unsichtbares Fenster
//  oder einen verborgenen Rahmen mit der PDF. Safari auf dem iPad
//  meldet so einen Rahmen nie als geladen und druckt ihn auch nicht,
//  und als App auf dem Startbildschirm öffnet er keine neuen Fenster:
//  Der Knopf „Drucken“ im Pad tat darum nichts (Patrick, 9. Oktober
//  2026). Auf diesem Weg braucht es weder Fenster noch Rahmen.
// =================================================================

// elemente: fertige DOM-Knoten (je Seite einer, mit break-after: page
// bis auf den letzten). quer wählt das Papier, titel steht im Druck-
// dialog und als Dateiname beim Speichern als PDF.
export function inDerAppDrucken(elemente, { quer, titel, rand } = {}) {
  const vorher = document.getElementById("druckdatei");
  if (vorher) vorher.remove();
  const bereich = document.createElement("div");
  bereich.id = "druckdatei";
  const stil = document.createElement("style");
  stil.textContent = "@page{size:A4 " + (quer ? "landscape" : "portrait") + ";margin:" + (rand || "0") + "}";
  bereich.appendChild(stil);
  for (const e of elemente) bereich.appendChild(e);
  document.body.appendChild(bereich);
  document.body.classList.add("nur-datei-drucken");
  const alterTitel = document.title;
  if (titel) document.title = titel;

  let fertig = false;
  const aufraeumen = () => {
    if (fertig) return;
    fertig = true;
    window.removeEventListener("afterprint", aufraeumen);
    document.body.classList.remove("nur-datei-drucken");
    bereich.remove();
    document.title = alterTitel;
  };
  window.addEventListener("afterprint", aufraeumen);

  // Bilder abwarten, sonst fehlen sie auf dem Papier
  const bilder = [...bereich.querySelectorAll("img")];
  Promise.all(bilder.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))))
    .then(() => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 50))))
    .then(() => {
      try { window.focus(); window.print(); }
      catch (f) { aufraeumen(); throw f; }
      // Safari meldet „afterprint“ nicht immer; nach einer Weile
      // räumt die App von selbst auf.
      setTimeout(aufraeumen, 120000);
    });
}

// Seiten einer PDF als Bilder, 150 Punkte je Zoll: scharf genug für A4,
// klein genug fürs Tablet. Jede Seite ein <img>, bereit für inDerAppDrucken.
export async function pdfSeitenAlsBilder(lib, daten) {
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  const doc = await aufgabe.promise;
  const bilder = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const seite = await doc.getPage(i);
      const v = seite.getViewport({ scale: 150 / 72 });
      const c = document.createElement("canvas");
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      await seite.render({ canvasContext: c.getContext("2d"), viewport: v, canvas: c }).promise;
      const img = document.createElement("img");
      img.src = c.toDataURL("image/jpeg", 0.92);
      img.className = "druckdatei__seite" + (v.width > v.height ? " druckdatei__seite--quer" : "");
      img.alt = "Seite " + i;
      bilder.push(img);
    }
  } finally { aufgabe.destroy(); }
  return bilder;
}
