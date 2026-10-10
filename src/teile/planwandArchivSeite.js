// =================================================================
//  PLANWAND-ARCHIV · die Seite in der Datei
//
//  Die Datei enthält die echte App (eigener Bau in dist/archiv/, siehe
//  vite.archiv.config.js: ein einziges Skript, ohne PDF- und
//  Excel-Bibliotheken) samt Gestaltung und dazu die Daten der Planwand.
//  So sieht sie genau aus wie der Reiter Planwand, mit Höhe, Tagen,
//  Zeitregler, Scrollen, Vorschau und Suche (Wunsch Patrick,
//  10. Oktober 2026: „genau gleich wie der Reiter Planwand, statt Pad
//  Mode oben: Backup vom Datum (offline)“). Sie braucht kein Netz und
//  keine Anmeldung, Doppelklick im Ordner öffnet sie im Browser.
//
//  Die Uhr der Seite steht auf dem Zeitpunkt des Backups: „Heute“, die
//  rote Linie und der Zeitregler zeigen den Tag, an dem es gemacht wurde.
// =================================================================

const zwei = (n) => String(n).padStart(2, "0");

// Text darf nirgends ein „</script“ enthalten, sonst endet das Skript dort
const imSkript = (t) => String(t).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

// Zeichen, die in JSON erlaubt sind, in einem Skript aber nicht überall
const ZEILENTRENNER = new RegExp(String.fromCharCode(0x2028), "g");
const ABSATZTRENNER = new RegExp(String.fromCharCode(0x2029), "g");

// Die beiden Teile des Archiv-Baus holen (liegen neben der App)
let teile = null;
export async function archivTeileHolen() {
  if (teile) return teile;
  const holen = async (name) => {
    const r = await fetch(new URL("./archiv/" + name, document.baseURI), { cache: "no-store" });
    if (!r.ok) throw new Error("Teil der Backup-Datei fehlt: archiv/" + name + " (" + r.status + ")");
    return r.text();
  };
  // Das Logo oben links ist eine Maske aus logo.png: als Daten mit hinein
  const logo = fetch(new URL("./logo.png", document.baseURI)).then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b ? new Promise((ok) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = () => ok(""); l.readAsDataURL(b); }) : ""))
    .catch(() => "");
  const [js, css, logoDaten] = await Promise.all([holen("archiv.js"), holen("archiv.css"), logo]);
  teile = { js, css, logo: logoDaten };
  return teile;
}

export async function archivSeite(paket) {
  const { js, css, logo } = await archivTeileHolen();
  const d = new Date(paket.erstellt);
  const standText = zwei(d.getDate()) + "." + zwei(d.getMonth() + 1) + "." + d.getFullYear()
    + ", " + zwei(d.getHours()) + ":" + zwei(d.getMinutes());
  const archiv = Object.assign({}, paket, { standText });
  const daten = JSON.stringify(archiv).replace(/</g, "\\u003c")
    .replace(ZEILENTRENNER, "\\u2028").replace(ABSATZTRENNER, "\\u2029");
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Planwand Backup ${standText}</title>
<style>${css.replace(/<\/(style)/gi, "<\\/$1")}</style>
${logo ? `<style>.kopf__logo--maske { -webkit-mask: url("${logo}") left center / contain no-repeat; mask: url("${logo}") left center / contain no-repeat; }</style>` : ""}
</head>
<body>
<div id="boot" class="boot">Wird gestartet …</div>
<div id="root" hidden></div>
<script>
window.HOFER_ARCHIV = ${daten};
// Die Uhr der Seite läuft ab dem Zeitpunkt des Backups
(function () {
  var Echt = Date, ab = Echt.now(), ziel = Echt.parse(window.HOFER_ARCHIV.erstellt);
  function jetzt() { return ziel + (Echt.now() - ab); }
  function D() {
    if (!new.target) return new Echt(jetzt()).toString();
    return arguments.length ? Reflect.construct(Echt, Array.prototype.slice.call(arguments), new.target) : new Echt(jetzt());
  }
  D.prototype = Echt.prototype;
  D.now = jetzt; D.parse = Echt.parse; D.UTC = Echt.UTC;
  window.Date = D;
})();
</script>
<script type="module">${imSkript(js)}</script>
</body>
</html>
`;
}
