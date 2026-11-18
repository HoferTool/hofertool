// Bauplan für die App. „npm run build" legt die fertige Website in
// dist/ ab, genau so, wie sie auf GitHub Pages liegt.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

// Schreibt nach dem Bauen die Liste aller Dateien in den Service
// Worker. So hat das Tablet nach dem ersten Besuch alles beisammen
// und startet auch ohne Netz, nicht erst nach dem zweiten Besuch.
function offlineListe() {
  let ziel = "dist";
  return {
    name: "hofer-offline-liste",
    apply: "build",
    configResolved(c) { ziel = c.build.outDir; },
    closeBundle() {
      hofertimeSeite(ziel);
      const alle = [];
      const sammeln = (ordner) => {
        for (const n of readdirSync(ordner)) {
          const p = join(ordner, n);
          if (statSync(p).isDirectory()) sammeln(p);
          else alle.push("./" + relative(ziel, p).split("\\").join("/"));
        }
      };
      sammeln(ziel);
      // Grosse Symbole und der Service Worker selbst gehören nicht hinein
      // Bilder für Meldungen beim Anmelden braucht das Tablet nicht offline
      const liste = alle.filter((d) => d !== "./sw.js" && !d.endsWith(".ico") && !d.startsWith("./meldungen/")
        // Erklärvideos sind gross und werden nur bei Bedarf geladen
        && !d.startsWith("./hilfe/")
        // Die Texterkennung (13 MB) holt das Gerät erst beim ersten Foto
        && !d.startsWith("./tesseract/")
        // OpenCascade für die STEP-Ansicht in HOFER2DTO3D (8 MB) nur bei Bedarf
        && !d.startsWith("./occt/")
        // Zeichentabellen (1.7 MB) braucht kaum ein PDF, nur asiatische Schriften
        && !d.startsWith("./pdfjs/cmaps/"));
      const sw = join(ziel, "sw.js");
      const text = readFileSync(sw, "utf8");
      // Die Fassung ergibt sich aus den Dateinamen: Ändert sich etwas,
      // ändert sich der Name, und die alte Ablage wird weggeräumt.
      let summe = 0;
      for (const d of liste) for (const z of d) summe = (summe * 31 + z.charCodeAt(0)) >>> 0;
      writeFileSync(sw, text
        .replace("self.__DATEIEN__", JSON.stringify(liste))
        .replace("__FASSUNG__", summe.toString(36)));
    },
  };
}

// HOFERTIME als eigene App (seit 1.627.1, Patrick 18. November 2026: „im
// Chrome heisst es In App öffnen, das ist aber ja das HoferTool“, „iPhone
// auch“): dist/hofertime/index.html ist dieselbe Seite wie die App, aber
// mit <base href="../"> (alle Dateien kommen weiter aus dem Hauptordner)
// und eigenem Manifest mit Bereich hofertime/. So sehen Chrome und Safari
// eine eigene App mit eigenem Namen und eigener Adresse.
function hofertimeSeite(ziel) {
  let html = readFileSync(join(ziel, "index.html"), "utf8");
  html = html
    .replace("<head>", '<head>\n<base href="../">')
    .replace('href="./app.webmanifest"', 'href="./hofertime/app.webmanifest"')
    // Eigenes Symbol mit Uhr (Wunsch Patrick 18. November 2026: „ich will das HOFERTIME-Icon“)
    .replace('href="./favicon.ico"', 'href="./hofertime/hofertime.ico"')
    .replace(/href="\.\/icon-192\.png"/g, 'href="./hofertime/icon-192.png"')
    .replace("<title>Hofer Tool</title>", '<title>HOFERTIME</title>\n<meta name="apple-mobile-web-app-title" content="HOFERTIME">');
  if (!html.includes('<base href="../">') || !html.includes("hofertime/app.webmanifest")) throw new Error("HOFERTIME-Seite liess sich nicht bauen");
  mkdirSync(join(ziel, "hofertime"), { recursive: true });
  writeFileSync(join(ziel, "hofertime", "index.html"), html);
}

// Das iPad an der Maschine hat Safari 16.1. Der kennt in Suchmustern
// keinen Rückblick (?<! und ?<=) und startet dann die ganze App nicht
// (6. Oktober 2026). Darum bricht das Bauen ab, wenn einer drinsteht.
function safariPruefen() {
  return {
    name: "hofer-safari-16",
    apply: "build",
    generateBundle(_o, bundle) {
      for (const [name, teil] of Object.entries(bundle)) {
        const code = teil.type === "chunk" ? teil.code : "";
        if (/\(\?<[=!]/.test(code)) {
          this.error(name + ": Suchmuster mit Rückblick (?<! oder ?<=). "
            + "Safari 16 auf dem iPad startet damit nicht. Bitte ohne schreiben.");
        }
      }
    },
  };
}

// Die Bilddecoder von pdf.js (JPEG 2000, JBIG2, Farbprofile) sind
// WebAssembly und werden zur Laufzeit nachgeladen. Ohne sie bleiben
// eingescannte Seiten weiss (Patrick 29. Oktober 2026: Rechnung „in der
// App weiss und leer, im neuen Tab erscheint sie“). Sie liegen unter
// pdfjs/ neben der App, auch für den Offline-Betrieb.
function pdfjsWasm() {
  const quelle = "node_modules/pdfjs-dist/wasm/";
  return {
    name: "hofer-pdfjs-wasm",
    apply: "build",
    generateBundle() {
      for (const n of ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm"]) {
        this.emitFile({ type: "asset", fileName: "pdfjs/" + n, source: readFileSync(quelle + n) });
      }
      // Standardschriften und Zeichentabellen: PDFs mit nicht eingebetteter
      // Schrift (Arial, Helvetica …) zeigten sonst nur Kästchen statt Text
      // (Patrick 10. November 2026, Titelblatt Star). Aus der eigenen
      // Website, damit es auch offline und hinter Blockern geht.
      for (const ordner of ["standard_fonts", "cmaps"]) {
        const von = "node_modules/pdfjs-dist/" + ordner + "/";
        for (const n of readdirSync(von)) {
          this.emitFile({ type: "asset", fileName: "pdfjs/" + ordner + "/" + n, source: readFileSync(von + n) });
        }
      }
    },
  };
}

// Texterkennung (Tesseract) aus der eigenen Website statt von jsdelivr
// (Patrick 3. November 2026: „Visitenkarten-Erkennung funktioniert immer
// noch nicht“). Brave und andere Blocker sperren das Nachladen von
// fremden Adressen gern, dann blieb die Erkennung beim Laden hängen.
// Nur die LSTM-Kerne (die App nimmt nur diese Erkennung) und die
// deutschen Sprachdaten 4.0.0_best_int (1,3 MB).
function tesseractDateien() {
  const dateien = [
    ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
    ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
    ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
    ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
    ["node_modules/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz", "sprache/deu.traineddata.gz"],
  ];
  return {
    name: "hofer-tesseract",
    apply: "build",
    generateBundle() {
      for (const [von, nach] of dateien) this.emitFile({ type: "asset", fileName: "tesseract/" + nach, source: readFileSync(von) });
    },
  };
}

// OpenCascade (occt-import-js) für die 3D-Ansicht der STEP-Dateien in
// HOFER2DTO3D aus der eigenen Website, aus demselben Grund wie die
// Texterkennung. Der Worker sucht das wasm neben sich.
function occtDateien() {
  const dateien = ["occt-import-js.js", "occt-import-js.wasm", "occt-import-js-worker.js"];
  return {
    name: "hofer-occt",
    apply: "build",
    generateBundle() {
      for (const d of dateien) this.emitFile({ type: "asset", fileName: "occt/" + d, source: readFileSync("node_modules/occt-import-js/dist/" + d) });
    },
  };
}

export default defineConfig({
  // Relative Pfade: Die App liegt auf GitHub Pages unter /hofertool/
  base: "./",
  plugins: [react(), pdfjsWasm(), tesseractDateien(), occtDateien(), offlineListe(), safariPruefen()],
  build: {
    outDir: "dist",
    // Die App wartet beim Start auf die Datenbank (await ganz oben)
    target: "es2022",
    // Das alte Programm ist ein grosser Block. Die Warnung dazu
    // hilft hier nicht weiter.
    chunkSizeWarningLimit: 4000,
  },
});
