// Bauplan für die App. „npm run build" legt die fertige Website in
// dist/ ab, genau so, wie sie auf GitHub Pages liegt.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
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
      const liste = alle.filter((d) => d !== "./sw.js" && !d.endsWith(".ico"));
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

export default defineConfig({
  // Relative Pfade: Die App liegt auf GitHub Pages unter /hofertool/
  base: "./",
  plugins: [react(), offlineListe(), safariPruefen()],
  build: {
    outDir: "dist",
    // Die App wartet beim Start auf die Datenbank (await ganz oben)
    target: "es2022",
    // Das alte Programm ist ein grosser Block. Die Warnung dazu
    // hilft hier nicht weiter.
    chunkSizeWarningLimit: 4000,
  },
});
