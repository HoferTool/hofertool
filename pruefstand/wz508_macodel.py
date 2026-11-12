# Macodel im Park Multitasking: Knöpfe zu den 508 Werkzeugen (seit 1.501.0)
import time, os, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
tmp = tempfile.mkdtemp()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 820}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""TEST.daten.machine_types.push({ id: 't-mac', name: 'Macodel' });
      TEST.daten.machines.push({ id: 'm-401', park_id: TEST.daten.machine_parks[1].id, name: 'W&M 508MT2', machine_number: '401', sort_order: 99, is_active: true, type_id: 't-mac' });""")
    pg.evaluate("document.getElementById('pad-knopf').click()")
    pg.wait_for_selector("#pad [data-padwo='parks']"); pg.click("#pad [data-padwo='parks']")
    mt = pg.evaluate('TEST.daten.machine_parks[1].id'); pg.click(f"#pad [data-park='{mt}']")
    pg.wait_for_timeout(800)
    if pg.is_visible("#pad [data-padtyp='t-mac']"): pg.click("#pad [data-padtyp='t-mac']")
    pg.wait_for_selector("#pad [data-maschine='m-401']")
    pruefe("Kachel 508 Werkzeuge im Park Multitasking", pg.is_visible("#pad [data-wz508-park]"))
    pg.wait_for_timeout(1200); pg.screenshot(path=os.path.join(tmp, "park.png"))
    pg.click("#pad [data-wz508-park]"); pg.wait_for_selector("#pad-wz5")
    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-maschine='m-401']")
    pruefe("Zurück wieder im Park", True)
    pg.click("#pad [data-maschine='m-401']"); pg.wait_for_selector("#pad [data-padwz508]")
    pg.wait_for_timeout(1200); pg.screenshot(path=os.path.join(tmp, "dashboard.png"))
    pg.click("#pad [data-padwz508]"); pg.wait_for_selector("#pad-wz5")
    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-padwz508]")
    pruefe("Zurück wieder an der Macodel", True)
    for _ in range(4):
        if pg.is_visible("#pad [data-padwo='parks']"): break
        pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(500)
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click(f"#pad [data-park]:not([data-park='{mt}'])")
    pg.wait_for_timeout(800)
    if pg.is_visible("#pad [data-padtyp='__alle']"): pg.click("#pad [data-padtyp='__alle']")
    pg.wait_for_selector("#pad [data-maschine]")
    pruefe("Andere Parks ohne Kachel", not pg.is_visible("#pad [data-wz508-park]"))
    # Seite Maschinen: Knopf bei der Macodel, nicht bei anderen
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(1200)
    if pg.locator(f"[data-park='{mt}'], [data-mpark='{mt}']").count():
        pg.locator(f"[data-park='{mt}'], [data-mpark='{mt}']").first.click(); pg.wait_for_timeout(800)
    pg.click("[data-mmaschine='m-401']"); pg.wait_for_selector("#mseite-pad")
    pruefe("Seite Maschinen: Knopf 508 Werkzeuge", pg.is_visible("#mseite-wz508"))
    pg.screenshot(path=os.path.join(tmp, "seite.png"))
    pg.click("#mseite-wz508"); pg.wait_for_timeout(1500)
    pruefe("führt zu NC-PRO 508 Werkzeuge", "#/nc" in pg.url and pg.locator("#wz5").count() > 0)
    print("Bilder:", tmp)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
