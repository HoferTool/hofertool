// Zweiter Bau für die Backup-Datei der Planwand (src/teile/planwandArchiv.js,
// seit 1.22.0): dieselbe App als ein einziges Skript und eine einzige
// Gestaltung in dist/archiv/. Die App schreibt beides zusammen mit den
// Daten in eine HTML-Datei, die sich ohne Netz öffnen lässt. Eine Datei
// vom Rechner (file://) darf keine weiteren Skripte nachladen, darum
// alles in einem Stück. PDF- und Excel-Bibliotheken braucht die Planwand
// dort nicht, sie sind durch einen Platzhalter ersetzt (src/archiv/ohne.js).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const ohne = fileURLToPath(new URL("./src/archiv/ohne.js", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^(exceljs|xlsx|jszip)$/, replacement: ohne },
      { find: /^pdfjs-dist\/.*$/, replacement: ohne },
    ],
  },
  build: {
    outDir: "dist/archiv",
    emptyOutDir: true,
    target: "es2022",
    copyPublicDir: false,
    cssCodeSplit: false,
    // Schriften und Bilder der Gestaltung direkt hinein
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/main.jsx", import.meta.url)),
      output: {
        codeSplitting: false,
        entryFileNames: "archiv.js",
        assetFileNames: "archiv[extname]",
      },
    },
  },
});
