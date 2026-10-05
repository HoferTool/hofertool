# Vorschau beim Verschieben und Einfügen ist so lang wie der Auftrag (111.43.0)
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
    # Einen Auftrag mit mehreren Tagen suchen, ganz sichtbar
    info = pg.evaluate("""() => { for (const el of document.querySelectorAll('.pw-balken[data-auftrag]')) {
        const r = el.getBoundingClientRect(); if (r.y < 250 || r.y > innerHeight - 150) continue;
        if (+el.dataset.dauer >= 2 && el.dataset.angeschnitten === '0') return { id: el.dataset.auftrag,
          x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, dauer: +el.dataset.dauer }; } return null; }""")
    print("Daten:", pg.evaluate("(id) => { const j=TEST.daten.jobs.find(x=>x.id===id); return [j.planned_days, j.planned_from]; }", info["id"]))
    print("Auftrag:", info["dauer"], "Tage, Balkenbreite", round(info["w"]))
    sp = pg.query_selector_all(".pw-spuren:not(.pw-spuren--fein)")
    ziel = sp[4].query_selector_all(".pw-zelle")[3].bounding_box()
    pg.mouse.move(info["x"], info["y"]); pg.mouse.down()
    pg.mouse.move(ziel["x"]+ziel["width"]/2, ziel["y"]+ziel["height"]/2, steps=12)
    pg.wait_for_timeout(200)
    v = pg.evaluate("(() => { const v = document.querySelector('.pw-vorschau'); if (!v) return null; const r = v.getBoundingClientRect(); return { w: r.width, x: r.x, t: v.textContent }; })()")
    print("Vorschau beim Ziehen:", v and round(v["w"]), "| Text:", v and v["t"],
          "| gleich lang wie Balken:", bool(v) and abs(v["w"] - info["w"]) < 4,
          "| beginnt an Zielzelle:", bool(v) and abs(v["x"] - ziel["x"]) < 3)
    pg.mouse.up(); pg.wait_for_timeout(1200)
    if pg.locator("[data-ja]").count(): pg.locator("[data-ja]").first.click(); pg.wait_for_timeout(1000)
    print("Vorschau nach Loslassen weg:", pg.evaluate("!document.querySelector('.pw-vorschau')"))
    # Einfügen: kopierten Auftrag setzen, über eine freie Zelle fahren
    pg.evaluate("(id) => { document.body.classList.add('einfuegemodus'); }", info["id"])
    pg.locator('.pw-balken[data-auftrag="%s"]' % info["id"]).dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(400)
    pg.locator("#pl-kopieren-eigen").click(); pg.wait_for_timeout(900)
    zelle = pg.evaluate("""() => { for (const z of document.querySelectorAll('[data-zelle]')) {
        const r = z.getBoundingClientRect(); const x = r.x + r.width/2, y = r.y + r.height/2;
        if (document.elementFromPoint(x, y) === z && r.y > 260 && r.y < innerHeight - 80)
          return { x, y, l: r.x }; } return null; }""")
    pg.mouse.move(zelle["x"], zelle["y"]); pg.wait_for_timeout(200)
    v = pg.evaluate("(() => { const v = document.querySelector('.pw-vorschau'); if (!v) return null; const r = v.getBoundingClientRect(); return { w: r.width, x: r.x }; })()")
    print("Vorschau beim Einfügen:", v and round(v["w"]), "| gleich lang:", bool(v) and abs(v["w"] - info["w"]) < 4,
          "| an Zelle:", bool(v) and abs(v["x"] - zelle["l"]) < 3)
    pg.mouse.click(zelle["x"], zelle["y"]); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(300)
    print("Klick öffnet Fenster:", True, "| Vorschau weg:", pg.evaluate("!document.querySelector('.pw-vorschau')"))
    print("Fehler:", f[:2] if f else "keine")
    br.close()
