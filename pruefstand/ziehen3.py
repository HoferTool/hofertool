import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":1000}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:170]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1600)
    sp = pg.query_selector_all(".pw-spuren:not(.pw-spuren--fein)")
    balken = sp[1].query_selector(".pw-balken")
    nr = balken.get_attribute("data-auftrag")
    b = balken.bounding_box()
    ziel = sp[4].query_selector_all(".pw-zelle")[9].bounding_box()
    vorher = pg.evaluate("(id) => { const j=TEST.daten.jobs.find(x=>x.id===id); return j.machine_id+' '+j.planned_from; }", nr)
    # So wie man es mit der Maus macht: drücken und sofort losfahren
    pg.mouse.move(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
    pg.mouse.down()
    pg.mouse.move(ziel["x"]+ziel["width"]/2, ziel["y"]+ziel["height"]/2, steps=12)
    pg.wait_for_timeout(150)
    pg.mouse.up(); pg.wait_for_timeout(1500)
    if pg.locator("[data-ja]").count(): pg.locator("[data-ja]").first.click(); pg.wait_for_timeout(1200)
    nachher = pg.evaluate("(id) => { const j=TEST.daten.jobs.find(x=>x.id===id); return j.machine_id+' '+j.planned_from; }", nr)
    print("sofort gezogen:", vorher, "→", nachher)
    print("Meldung:", pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"))
    # Ein einfacher Klick öffnet weiterhin den Auftrag
    b2 = pg.query_selector_all(".pw-spuren:not(.pw-spuren--fein)")[2].query_selector(".pw-balken").bounding_box()
    pg.mouse.click(b2["x"]+b2["width"]/2, b2["y"]+b2["height"]/2); pg.wait_for_timeout(900)
    print("Klick öffnet Auftrag:", pg.evaluate("!!document.querySelector('.dialog--auftrag')"))
    print("Fehler:", f[:2] if f else "keine")
    br.close()
