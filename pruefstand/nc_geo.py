# GEO-OFFSET aus der NC-Datei (4…) ins Einrichtblatt der SW (1.276.0):
# Seite 2 „GEO-OFFSET“ mit dem Text aus nc_geo, Ordner im Fenster „⚙ Typ“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
NC = "%\nO4234 (GEO 10000-0301)\nG10 L2 P1 X0 Z-12.5\nG10 L2 P2 X1.25 Z0 <test>\n%"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""(nc) => {
      const D = TEST.daten;
      D.machine_types.find(t => t.id === 't1').name = 'SW-20';
      D.machine_types.forEach(t => { t.nc_ordner = null; });
      D.einrichtblatt_app = [{ hoco_nr: '10000-0301', type_id: 't1', programme: { 1: 'Ø1234', 2: 'Ø2234', 3: 'Ø3234' },
        geometrie: 'Ø4234', kopf: {}, seiten: [], plaetze: { T100: { taetigkeit: 'Abstechen' } }, gut_am: '2026-10-28T08:00:00Z' }];
      D.nc_geo = [{ type_id: 't1', nr: '4234', datei: 'O4234.NC', inhalt: nc, geaendert: '2026-10-29T10:00:00Z' },
                  { type_id: 't1', nr: '4999', datei: '4999', inhalt: 'anderes', geaendert: null }];
      D.artikel_bild = []; D.eb_bilder = [];
      let h = D.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1');
      if (!h) { h = { hoco_nr: '10000-0301', type_id: 't1' }; D.hoco_type_data.push(h); }
      h.blatt_url = 'https://x.supabase.co/storage/v1/object/public/zeichnungen/eb.xlsx';
    }""", NC)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector("[data-eba-seite-nr='1']", timeout=5000)
    reiter = pg.locator("[data-eba-seite-nr='1']")
    pruefe("Seite 2 heisst GEO-OFFSET", reiter.inner_text().strip() == "GEO-OFFSET")
    reiter.click(); pg.wait_for_timeout(400)
    t = pg.inner_text("[data-eba-zseite]")
    pruefe("Überschrift GEO-OFFSET", t.strip().startswith("GEO-OFFSET"))
    pruefe("Text der NC-Datei Zeile für Zeile", "G10 L2 P1 X0 Z-12.5\nG10 L2 P2 X1.25 Z0 <test>" in t)
    pruefe("Nicht das andere Programm", "anderes" not in t)
    pg.screenshot(path="/tmp/claude-0/nc_geo_blatt.png")
    # Speichern übernimmt die Seite ins Blatt
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(600)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pruefe("Gespeichert als Seite 2", len(b["seiten"]) == 1 and b["seiten"][0]["name"] == "GEO-OFFSET" and b["seiten"][0]["nc"]["nr"] == "4234")
    # Neue Fassung der Datei ersetzt die Seite, solange nicht von Hand geändert
    pg.evaluate("TEST.daten.nc_geo[0].inhalt = 'O4234\\nNEU'")
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector("[data-eba-seite-nr='1']")
    pg.click("[data-eba-seite-nr='1']"); pg.wait_for_timeout(300)
    pruefe("Neue Fassung der Datei", "NEU" in pg.inner_text("[data-eba-zseite]"))
    # Von Hand geänderte Seite bleibt
    pg.evaluate("""() => { const b = TEST.daten.einrichtblatt_app[0]; b.seiten = [{ name: 'GEO-OFFSET', quer: false, html: '<p>von Hand</p>' }]; }""")
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector("[data-eba-seite-nr='1']")
    pg.click("[data-eba-seite-nr='1']"); pg.wait_for_timeout(300)
    pruefe("Von Hand bleibt", "von Hand" in pg.inner_text("[data-eba-zseite]") and pg.locator("[data-eba-seite-nr='2']").count() == 0)
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)

    # Ordner im Fenster „⚙ Typ“ (nur SW)
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    park = pg.evaluate("TEST.daten.machines.find(m => m.type_id === 't1').park_id")
    if pg.locator(f"[data-mpark='{park}']").count(): pg.locator(f"[data-mpark='{park}']").click(); pg.wait_for_timeout(500)
    pg.click("[data-mtyp-einst='t1']"); pg.wait_for_selector("#typ-fenster"); pg.wait_for_timeout(600)
    pruefe("Zeile Ordner NC-Programme", "nicht eingetragen" in pg.inner_text("#typ-nc"))
    pg.click("#typ-bearbeiten"); pg.wait_for_selector(".dialog:has-text('Ordner NC-Programme')")
    pg.locator(".dialog:has-text('Ordner NC-Programme') input").last.fill('"\\\\Hof-chso-app01\\cimco$\\Nc-Base\\Star_SW-20"')
    pg.locator(".dialog:has-text('Ordner NC-Programme') [data-ja]").click(); pg.wait_for_timeout(900)
    o = pg.evaluate("TEST.daten.machine_types.find(t => t.id === 't1').nc_ordner")
    pruefe("Ordner gespeichert ohne Anführungszeichen: %s" % o, o == "\\\\Hof-chso-app01\\cimco$\\Nc-Base\\Star_SW-20")
    pg.wait_for_timeout(500)
    print(pg.inner_text("#typ-nc"))
    pruefe("Zeile zeigt Ordner und Anzahl", "Star_SW-20" in pg.inner_text("#typ-nc") and "2 Geometrie" in pg.inner_text("#typ-nc"))
    pg.screenshot(path="/tmp/claude-0/nc_geo_typ.png")
    br.close()
print("Fehler:", fehler or "keine")
