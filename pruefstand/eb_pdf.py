# Einrichtblätter als PDF (1.200.0, seit 1.205.0 nur mit EB OK): Ordner wählen, alle Blätter aus der
# App als PDF je Typ-Ordner, geändertes Blatt überschreibt seine Datei,
# lässt sie sich nicht überschreiben, kommt eine V-Nummer daneben.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

ORDNER = """
(() => {
  const dateien = new Map();      // Pfad 'Typ/Name' -> { daten, zeit }
  window.ORDNER = dateien;
  window.GESPERRT = new Set();    // Pfade, die „offen“ sind und nicht überschrieben werden
  const datei = (pfad, name) => ({ kind: 'file', name,
    getFile: async () => { const d = dateien.get(pfad); if (!d) throw new DOMException('weg', 'NotFoundError');
      return new File([d.daten], name, { lastModified: d.zeit }); },
    createWritable: async () => { if (window.GESPERRT.has(pfad)) throw new DOMException('offen', 'NoModificationAllowedError');
      const teile = [];
      return { write: async (x) => { teile.push(x); }, abort: async () => {},
        close: async () => { dateien.set(pfad, { daten: new Uint8Array(await new Blob(teile).arrayBuffer()), zeit: Date.now() }); } }; },
  });
  const ordner = (vor, name) => ({ kind: 'directory', name,
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (n, o) => { const p = vor + n; if (!dateien.has(p)) { if (!(o && o.create)) throw new DOMException('weg', 'NotFoundError');
      dateien.set(p, { daten: new Uint8Array(0), zeit: Date.now() }); } return datei(p, n); },
    getDirectoryHandle: async (n) => ordner(vor + n + '/', n),
    removeEntry: async (n) => { dateien.delete(vor + n); },
    entries: async function* () {},
  });
  window.showDirectoryPicker = async () => ordner('', 'EB Sicherung');
})();
"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.add_init_script(ORDNER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const D = TEST.daten;
      D.machine_types.find(t => t.id === 't2').name = 'Index C100';
      D.einrichtblatt_app = [
        { id: 'b1', hoco_nr: '10000-0301', type_id: 't1', programme: { 1: 'O1301' }, plaetze: { T100: { taetigkeit: 'Plandrehen', werkzeug: 'Wendeplatte' } },
          kopf: {}, seiten: [{ name: 'Geo Offset', quer: false, html: '<p>Geo Offset X 1.234</p>' }], gut_am: '2026-10-20T10:00:00Z', geaendert_am: '2026-10-20T10:00:00Z' },
        { id: 'b2', hoco_nr: '10000-0302', type_id: 't2', programme: {}, plaetze: {}, kopf: {}, seiten: [], gut_am: '2026-10-21T10:00:00Z', geaendert_am: '2026-10-21T10:00:00Z' },
        { id: 'b3', hoco_nr: '10000-0303', type_id: 't1', programme: {}, plaetze: {}, kopf: {}, seiten: [], gut_am: null, geaendert_am: '2026-10-21T10:00:00Z' },
      ];
      D.artikel_bild = D.artikel_bild || []; D.eb_bilder = D.eb_bilder || [];
    }""")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_selector("#ebp-ordner"); pg.wait_for_timeout(300)
    pruefe("Sicherung und Archiv bleiben", pg.locator("#si").count() == 1 and pg.locator("#pa").count() == 1)
    pruefe("Noch kein Ordner", "Noch kein Ordner gewählt" in pg.inner_text("#ebp"))
    pg.click("#ebp-ordner"); pg.wait_for_timeout(600)
    k = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'eb_pdf').wert)")
    pruefe("Dieses Gerät mit Ordner gespeichert", k["geraet"]["ordner"] == "EB Sicherung")

    pg.click("#ebp-jetzt")
    pg.wait_for_selector("#ebp-auftrag.si-auftrag--gut, #ebp-auftrag.si-auftrag--fehler", timeout=60000)
    print("Ergebnis:", pg.inner_text("#ebp-auftrag"))
    namen = pg.evaluate("[...window.ORDNER.keys()].sort()"); print("Ordner:", namen)
    t1 = pg.evaluate("TEST.daten.machine_types.find(t => t.id === 't1').name")
    n1 = t1 + "/10000-0301 " + t1 + ".pdf"
    pruefe("Je Typ ein Ordner mit PDF", n1 in namen and "Index C100/10000-0302 Index C100.pdf" in namen)
    pruefe("Ohne EB OK kein PDF", not any("10000-0303" in n for n in namen))
    kopf = pg.evaluate("n => String.fromCharCode(...window.ORDNER.get(n).daten.slice(0, 5))", n1)
    pruefe("Ist ein PDF", kopf == "%PDF-")
    roh = bytes(pg.evaluate("n => [...window.ORDNER.get(n).daten]", n1))
    pruefe("Zwei Seiten (Blatt und Geo Offset)", roh.count(b"/Type /Page\n") + roh.count(b"/Type /Page ") + roh.count(b"/Type /Page>") >= 2 or roh.count(b"/Type /Page") - roh.count(b"/Type /Pages") == 2)
    st = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'eb_pdf_status').wert)"); print("Stand:", st)
    pruefe("Stand 2 von 2", st["gesichert"] == 2 and st["gesamt"] == 2 and not st.get("fehler"))
    pruefe("Anzeige", "2 von 2" in pg.inner_text("#ebp-stand"))

    # Nichts geändert: nichts neu
    z0 = pg.evaluate("n => window.ORDNER.get(n).zeit", n1)
    pg.wait_for_timeout(20)
    pg.click("#ebp-jetzt"); pg.wait_for_timeout(1500)
    pruefe("Unverändert: schon aktuell", "schon aktuell" in pg.inner_text("#ebp-auftrag") and pg.evaluate("n => window.ORDNER.get(n).zeit", n1) == z0)

    # Geändert: überschreibt dieselbe Datei
    pg.evaluate("() => { TEST.daten.einrichtblatt_app[0].geaendert_am = '2026-10-26T10:00:00Z'; }")
    pg.click("#ebp-jetzt"); pg.wait_for_timeout(4000)
    namen2 = pg.evaluate("[...window.ORDNER.keys()].sort()")
    pruefe("Überschrieben, keine V-Nummer", namen2 == namen and pg.evaluate("n => window.ORDNER.get(n).zeit", n1) > z0)

    # Datei offen: V2 daneben, dann V3
    pg.evaluate("n => window.GESPERRT.add(n)", n1)
    pg.evaluate("() => { TEST.daten.einrichtblatt_app[0].geaendert_am = '2026-10-26T11:00:00Z'; }")
    pg.click("#ebp-jetzt"); pg.wait_for_timeout(4000)
    pg.evaluate("() => { TEST.daten.einrichtblatt_app[0].geaendert_am = '2026-10-26T12:00:00Z'; }")
    pg.click("#ebp-jetzt"); pg.wait_for_timeout(4000)
    namen3 = pg.evaluate("[...window.ORDNER.keys()].sort()"); print("Ordner:", namen3)
    pruefe("Gesperrt: V2 und V3", (t1 + "/10000-0301 " + t1 + " V2.pdf") in namen3 and (t1 + "/10000-0301 " + t1 + " V3.pdf") in namen3)
    pruefe("Keine Fehler auf der Seite", not f)
    if f: print(f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
