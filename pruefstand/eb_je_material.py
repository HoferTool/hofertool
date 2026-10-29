# Einrichtblatt je Materialgrösse (1.272.0, Wunsch Patrick 29. Oktober 2026,
# SB-20C Nr. 120): auf der Seite der Maschine ein Blatt je Grösse anlegen;
# hat eine HOCO Nr. weder eigenes Blatt noch eigenes Excel, gilt das Blatt,
# dessen Merkmal im Material des Auftrags steht.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    hoco = pg.evaluate("""() => {
      const D = TEST.daten;
      D.einrichtblatt_app = [];
      D.app_config.push({ schluessel: 'eb_je_material', wert: JSON.stringify({ t1: [
        { name: 'Rohr 16.2 x 14.5', erkennen: ['16.2/14.5', 'Ø16'] }, { name: 'Rohr 12 x 11.2', erkennen: ['12/11.2'] }] }) });
      const t1 = new Set(D.machines.filter(m => m.type_id === 't1').map(m => m.id));
      const mitBlatt = new Set(D.hoco_type_data.filter(h => h.blatt_url).map(h => h.hoco_nr));
      const j = D.jobs.find(j => t1.has(j.machine_id) && j.job_number && j.job_number !== '10000-0301' && !mitBlatt.has(j.job_number));
      D.jobs.filter(x => x.job_number === j.job_number).forEach(x => { x.material_bez = 'CuNi12Zn24 Rohr 12/11.2'; });
      return j.job_number;
    }""")
    print("HOCO", hoco)

    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    park = pg.evaluate("TEST.daten.machines.find(m => m.id === 'm-l1').park_id")
    if pg.locator(f"[data-mpark='{park}']").count(): pg.locator(f"[data-mpark='{park}']").click(); pg.wait_for_timeout(500)
    pg.screenshot(path="/tmp/eb-je-park.png")
    pg.click("[data-mmaschine='m-l1']"); pg.wait_for_selector(".mseite-maschine"); pg.wait_for_timeout(900)
    k = pg.locator("#mseite-jematerial")
    pruefe(k.count() == 1 and "Rohr 16.2 x 14.5" in k.inner_text() and "noch nicht angelegt" in k.inner_text(), "Karte auf der Seite der Maschine")
    pg.screenshot(path="/tmp/eb-je-material.png")
    pg.click("[data-jm-oeffnen='Rohr 12 x 11.2']"); pg.wait_for_selector("[data-eba-speichern]"); pg.wait_for_timeout(500)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app")
    pruefe(len(b) == 1 and b[0]["hoco_nr"] == "Material Rohr 12 x 11.2" and b[0]["type_id"] == "t1", "Blatt gespeichert: %s" % [x.get("hoco_nr") for x in b])
    pruefe(pg.evaluate("TEST.daten.hoco_parts.some(h => String(h.hoco_nr).startsWith('Material'))") is False, "Keine Stammdaten für das Material-Blatt")
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)

    # Bei der HOCO Nr.: ohne eigenes Blatt kommt das Blatt der Materialgrösse
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(800)
    kunde, teil = hoco.split("-")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator(f"[data-bereich='{kunde[:5]}']").first.click(); pg.wait_for_timeout(600)
    pg.locator(f"[data-kunde='{kunde}']").click(); pg.wait_for_timeout(600)
    pg.locator(f"[data-hoco-auf='{hoco}']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_timeout(1500)
    pruefe(pg.locator("[data-eba-seite]").count() == 1 and "Material Rohr 12 x 11.2" in pg.inner_text(".eba-fenster"),
           "Einrichtblatt der HOCO Nr. zeigt das Blatt der Materialgrösse")
    pg.screenshot(path="/tmp/eb-je-material-hoco.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
