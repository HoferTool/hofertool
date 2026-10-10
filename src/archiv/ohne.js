// Platzhalter für PDF- und Excel-Bibliotheken in der Backup-Datei der
// Planwand (vite.archiv.config.js): Dort gibt es keine Zeichnungen und
// Einrichtblätter, und die Datei bleibt so klein.
const fehlt = () => { throw new Error("In der Backup-Datei gibt es keine Dokumente."); };
export default new Proxy(fehlt, { get: () => fehlt });
export const GlobalWorkerOptions = {};
export const getDocument = fehlt;
