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

// iPad und iPhone (ein iPad meldet sich als Macintosh mit Fingern).
// Dort öffnet window.print() in der App auf dem Startbildschirm keinen
// Druckdialog (Patrick, 9. Oktober 2026: „der Button ladet kurz, dann
// wieder normal, aber kein Fenster“). Der Weg, der dort geht, ist das
// Teilen-Fenster mit der Datei: Darin steht „Drucken“, wie bei der
// Bestellmail (navigator.share mit der PDF).
export function istAppleFinger() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

// Die Datei selbst ins Teilen-Fenster des iPads geben. Gibt true zurück,
// wenn das Fenster aufging (auch wenn danach abgebrochen wurde), false,
// wenn das Gerät es nicht kann; dann druckt der Aufrufer anders.
// Muss direkt aus dem Tipp heraus aufgerufen werden, ohne Warten.
export function perTeilenDrucken(blob, name, titel) {
  if (!istAppleFinger() || !navigator.canShare || !navigator.share) return false;
  let datei;
  try { datei = new File([blob], name, { type: blob.type || "application/octet-stream" }); }
  catch (f) { return false; }
  if (!navigator.canShare({ files: [datei] })) return false;
  navigator.share({ files: [datei], title: titel || name }).catch(() => { /* abgebrochen */ });
  return true;
}

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
