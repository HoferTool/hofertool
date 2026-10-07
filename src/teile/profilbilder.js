// =================================================================
//  PROFILBILDER · alle grau, sehr helle mässig umgekehrt
//  Wunsch 7. Oktober 2026: Die Bilder der Personen von der Team-Seite
//  sind schwarzweiss, die der Konten teils farbig. Damit alle gleich
//  wirken, zeigt die App jedes Profilbild grau (CSS am Ende von
//  stil.css). Bilder mit viel Weiss (weisser Hintergrund, Logo auf
//  Weiss) leuchten neben den anderen; sie bekommen data-hell und
//  werden mässig umgekehrt, so dass man sie noch erkennt.
//  Geprüft wird beim Anzeigen, nicht beim Hochladen, damit auch die
//  schon gespeicherten Bilder mitmachen, ohne dass jemand sie neu
//  hochladen muss.
// =================================================================
const WAHL = "img.kopf__bild, img.geb-bild, img.profilbild-gross, img.login__kachel-bild";
// Anteil fast weisser Punkte, ab dem ein Bild als „viel Weiss“ gilt
const GRENZE = 0.4;
const ergebnis = new Map(); // Adresse → true/false, damit jedes Bild nur einmal gemessen wird

function messen(bild) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");
  ctx.drawImage(bild, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data; // wirft bei fremder Adresse ohne Freigabe
  let weiss = 0, alle = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue; // durchsichtig zählt nicht
    alle++;
    if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > 215) weiss++;
  }
  return alle > 0 && weiss / alle > GRENZE;
}

// Fremde Bilder (Supabase-Ablage) darf die Leinwand nur lesen, wenn sie
// mit Freigabe geladen sind. Dann eine Kopie mit Freigabe laden.
function messenMitFreigabe(adresse) {
  return new Promise((fertig) => {
    const kopie = new Image();
    kopie.crossOrigin = "anonymous";
    kopie.onload = () => { try { fertig(messen(kopie)); } catch (f) { fertig(false); } };
    kopie.onerror = () => fertig(false);
    kopie.src = adresse;
  });
}

function setzen(bild, hell) {
  if (hell) bild.setAttribute("data-hell", "");
  else bild.removeAttribute("data-hell");
}

async function pruefen(bild) {
  const adresse = bild.currentSrc || bild.src;
  if (!adresse || bild.dataset.geprueft === adresse) return;
  bild.dataset.geprueft = adresse;
  if (ergebnis.has(adresse)) { setzen(bild, ergebnis.get(adresse)); return; }
  let hell;
  try { hell = messen(bild); } catch (f) { hell = await messenMitFreigabe(adresse); }
  ergebnis.set(adresse, hell);
  if ((bild.currentSrc || bild.src) === adresse) setzen(bild, hell);
}

// „load“ steigt nicht auf, wird aber in der Fangphase gemeldet. So
// erwischt ein einziger Zuhörer jedes Profilbild, egal auf welcher Seite.
document.addEventListener("load", (e) => {
  const z = e.target;
  if (z && z.tagName === "IMG" && z.matches(WAHL)) pruefen(z);
}, true);
