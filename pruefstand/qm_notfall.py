# QMS-Notfallplan (1.484.0, Wunsch Patrick 11. November 2026): jeden Tag das
# ganze QMS als PDF mit Ordnern in einen gewählten Ordner. Der Ordner ist hier
# im Browser nachgebaut, die Inhalte sind erfunden.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("QM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

ORDNER = """
(() => {
  const dateien = new Map(), ordnerSet = new Set();
  window.ORDNER = dateien; window.ORDNER_D = ordnerSet;
  ['QMS 2026-09-01/', 'QMS 2026-09-02/', 'QMS 2026-09-03/', 'QMS 2026-09-04/', 'Anderes/'].forEach((x) => ordnerSet.add(x));
  dateien.set('QMS 2026-09-02/alt.pdf', { daten: new Uint8Array(1) });
  const datei = (pfad, name) => ({ kind: 'file', name,
    getFile: async () => new File([(dateien.get(pfad) || {}).daten || new Uint8Array(0)], name),
    createWritable: async () => { const t = []; return { write: async (x) => { t.push(x); }, abort: async () => {},
      close: async () => { dateien.set(pfad, { daten: new Uint8Array(await new Blob(t).arrayBuffer()) }); } }; } });
  const ordner = (vor, name) => ({ kind: 'directory', name,
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (n, o) => { const p = vor + n; if (!dateien.has(p)) { if (!(o && o.create)) throw new DOMException('weg', 'NotFoundError');
      dateien.set(p, { daten: new Uint8Array(0) }); } return datei(p, n); },
    getDirectoryHandle: async (n, o) => { const p = vor + n + '/'; if (!ordnerSet.has(p)) { if (!(o && o.create)) throw new DOMException('weg', 'NotFoundError'); ordnerSet.add(p); } return ordner(p, n); },
    removeEntry: async (n, o) => { const p = vor + n; if (dateien.delete(p)) return; if (!ordnerSet.has(p + '/')) throw new DOMException('weg', 'NotFoundError');
      for (const k of [...dateien.keys()]) if (k.startsWith(p + '/')) dateien.delete(k);
      for (const k of [...ordnerSet]) if (k.startsWith(p + '/')) ordnerSet.delete(k); },
    entries: async function* () {
      const kinder = new Set();
      for (const k of ordnerSet) if (k.startsWith(vor) && k !== vor) { const r = k.slice(vor.length).split('/')[0]; if (!kinder.has(r)) { kinder.add(r); yield [r, { kind: 'directory', name: r }]; } }
    },
  });
  window.showDirectoryPicker = async () => ordner('', 'QMS Kopie');
})();
"""

VERMERK = """;
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { qmSehen: true };
TEST.daten.qma_texte = [
  { schluessel: 'unternehmen', titel: 'Unternehmen', inhalt: 'Wir drehen Teile.' },
  { schluessel: 'prozess:p1', gruppe: 'kern', titel: 'Fertigen', norm: '8.5', felder: { nr: '02_04', zweck: 'Teile herstellen', ablauf: 'Rüsten\\nProduzieren' } },
  { schluessel: 'organigramm', titel: 'Organigramm', felder: { personen: [{ bereich: 'GL', name: 'Erika Muster', rolle: 'GL' }] } },
  { schluessel: 'checkliste:Produktion', gruppe: 'checkliste', titel: 'Produktion', felder: { fragen: [{ id: 'f1', norm: '8.5', thema: 'Lenkung', frage: 'Ist das Blatt aktuell?', nachweis: 'EB', varianten: [{ frage: 'Wer prüft das Blatt?', nachweis: 'EB OK' }] }] } },
  { schluessel: 'lieferanten:2025', gruppe: 'lieferanten', titel: 'Lieferantenbewertung 2025', felder: { jahr: 2025, liste: [{ nr: '20001', name: 'Alpha Stahl AG', anteil: 30 }], auswahl: ['20001'] } },
];
TEST.daten.qma_eintraege = [
  { id: 'a1', art: 'abweichung', nr: 1, titel: 'Mass zu gross', status: 'offen', faellig: '2026-12-01', daten: { titel: 'Mass zu gross', quelle: 'kunde', ursache: 'Werkzeug verschlissen' } },
  { id: 'au1', art: 'audit', nr: 1, titel: 'Produktion', status: 'durchgefuehrt', daten: { titel: 'Produktion', art: 'intern', datum: '2026-05-04', bereich: 'Produktion',
    bericht_url: 'http://127.0.0.1:%PORT%/fake-bericht.pdf', bericht_name: 'Bericht.pdf' } },
  { id: 'b1', art: 'bewertung', nr: 1, titel: 'Managementbewertung 2025', status: 'freigegeben', daten: { jahr: 2025, titel: 'Managementbewertung 2025', bericht_url: 'http://127.0.0.1:%PORT%/fake-mb.pdf' } },
  { id: 'l1', art: 'lieferant', nr: 1, titel: 'Alpha Stahl AG', status: 'freigegeben', daten: { titel: 'Alpha Stahl AG', nr: '20001', punkte: 92,
    verlauf: { '2025': { punkte: 92, k: { t: 5, p: 4, b: 5, q: 4, r: 5 }, bemerkung: 'Gut', am: '2026-02-18' } } } },
];
""".replace("%PORT%", str(PORT))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.add_init_script(ORDNER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + VERMERK))
    pg.route("**/fake-bericht.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=b"%PDF-1.4 BERICHT"))
    pg.route("**/fake-mb.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=b"%PDF-1.4 MB"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/qmalt", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_selector("#qma-notfall", timeout=15000)
    pruefe("Noch keine Kopie" in pg.inner_text("#qma-notfall-stand"), "Karte im Cockpit, noch nichts abgelegt")
    pg.click("#qma-notfall-ordner"); pg.wait_for_timeout(600)
    k = pg.evaluate("JSON.parse((TEST.daten.app_config.find(x => x.schluessel === 'qms_pdf') || {}).wert || '{}')")
    pruefe(k.get("geraet", {}).get("ordner") == "QMS Kopie", "Gerät mit Ordner gespeichert")
    pg.click("#qma-notfall-jetzt")
    pg.wait_for_selector("#qma-notfall-auftrag.si-auftrag--gut, #qma-notfall-auftrag.si-auftrag--fehler", timeout=120000)
    txt = pg.inner_text("#qma-notfall-auftrag"); print("   ", txt)
    pruefe("✓" in txt, "abgelegt ohne Fehler")
    namen = pg.evaluate("[...ORDNER.keys()].sort()")
    heute = pg.evaluate("(() => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); })()")
    tag = "QMS " + heute + "/"
    for n in ["00 Notfallplan und Inhalt.pdf", "01 Handbuch/Managementhandbuch.pdf", "01 Handbuch/Organigramm.pdf",
              "01 Handbuch/Prozesse/Ebene 02 Prozesse/02_04 Fertigen.pdf", "02 Listen/01 Abweichungen und Verbesserungen.pdf",
              "03 Kompetenzen/Kompetenzmatrix und Schulungen.pdf", "04 Audits/Auditplan.pdf", "04 Audits/Checklisten/Produktion.pdf",
              "04 Audits/Berichte 2026/2026-05-04 Internes Audit Produktion.pdf", "05 Managementbewertung/Managementbewertung 2025.pdf",
              "06 Lieferanten/Lieferantenbewertung 2025.pdf", "06 Lieferanten/Lieferanten.pdf"]:
        pruefe(tag + n in namen, "Datei " + n)
    kopf = pg.evaluate("(p) => String.fromCharCode(...ORDNER.get(p).daten.slice(0, 5))", tag + "02 Listen/01 Abweichungen und Verbesserungen.pdf")
    pruefe(kopf == "%PDF-", "gezeichnetes PDF ist ein PDF")
    gr = pg.evaluate("(p) => ORDNER.get(p).daten.length", tag + "04 Audits/Berichte 2026/2026-05-04 Internes Audit Produktion.pdf")
    pruefe(gr == len(b"%PDF-1.4 BERICHT"), "Auditbericht unverändert kopiert")
    d = pg.evaluate("[...ORDNER_D].filter(x => /^[^/]+\\/$/.test(x)).sort()")
    pruefe("QMS 2026-09-01/" not in d and "QMS 2026-09-02/" not in d and "QMS 2026-09-04/" in d and "QMS 2026-09-03/" in d and "Anderes/" in d,
           "alte Tagesordner gelöscht, die neusten drei und andere Ordner bleiben: %s" % d)
    pruefe(not any(x.startswith("QMS 2026-09-02/") for x in namen), "Dateien im gelöschten Ordner weg")
    s = pg.evaluate("JSON.parse((TEST.daten.app_config.find(x => x.schluessel === 'qms_pdf_status') || {}).wert || '{}')")
    pruefe(s.get("tag") == heute and s.get("dateien", 0) >= 12 and not s.get("fehler"), "Stand gemeldet: %s" % {k: s.get(k) for k in ("tag", "dateien", "fehler")})
    pg.wait_for_timeout(500)
    pruefe("Zuletzt" in pg.inner_text("#qma-notfall-stand"), "Stand in der Karte")
    if os.environ.get("QM_PDF"):
        for nm in ["00 Notfallplan und Inhalt.pdf", "02 Listen/01 Abweichungen und Verbesserungen.pdf"]:
            b = pg.evaluate("(p) => [...ORDNER.get(p).daten]", tag + nm)
            open(os.path.join(BILD, nm.split("/")[-1]), "wb").write(bytes(b))
    pg.locator("#qma-notfall").screenshot(path=BILD + "/qma-notfall.png")
    # Zweimal am selben Tag: von vorne, nichts doppelt
    n1 = len([x for x in namen if x.startswith(tag)])
    pg.click("#qma-notfall-jetzt")
    pg.wait_for_selector("#qma-notfall-auftrag.si-auftrag--laeuft", timeout=10000)
    pg.wait_for_selector("#qma-notfall-auftrag.si-auftrag--gut", timeout=120000)
    n2 = pg.evaluate("(t) => [...ORDNER.keys()].filter(x => x.startsWith(t)).length", tag)
    pruefe(n1 == n2, "zweites Ablegen am selben Tag ersetzt den Ordner (%s / %s)" % (n1, n2))
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
