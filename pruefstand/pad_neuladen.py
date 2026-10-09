# Logo im Pad-Dashboard: Tippen lädt die App neu, danach ist man
# wieder auf dem Dashboard derselben Maschine (111.72.0)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1180,"height":830}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:220]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**",
              "**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)
    titel = lambda: pg.evaluate("(document.querySelector('#pad .pad__titel')||{}).textContent||'kein Pad'")
    vorher = titel()
    print("Dashboard vorher:", vorher, "| Logo-Knopf:", pg.locator("[data-padneu]").count())
    pg.evaluate("window.__alteSeite = true")
    with pg.expect_navigation():
        pg.click("[data-padneu]")
    pg.wait_for_selector("#pad .pad__kopf--dash", timeout=15000); pg.wait_for_timeout(1200)
    nachher = titel()
    neu = pg.evaluate("window.__alteSeite !== true")
    print("Neu geladen:", neu, "| Dashboard nachher:", nachher,
          "| Inhalt darunter leer:", pg.evaluate("document.getElementById('inhalt').innerHTML === ''"),
          "| Merker weg:", pg.evaluate("sessionStorage.getItem('hofer.pad.neuladen') === null"))
    pg.screenshot(path="pad_neuladen.png")
    ok = neu and nachher == vorher and vorher != "kein Pad"
    # Seit 1.7.0 bleibt auch ein normales Neuladen im Pad (Wunsch
    # 9. Oktober 2026); erst nach dem Schliessen des Pads nicht mehr
    pg.reload(); pg.wait_for_selector("#pad .pad__kopf--dash", timeout=15000); pg.wait_for_timeout(1200)
    bleibt = titel() == vorher
    print("Normales Neuladen bleibt im Pad:", bleibt)
    if not bleibt: f.append("Pad nach normalem Neuladen nicht mehr da")
    pg.evaluate("document.querySelector('#pad [data-padzu], #pad .pad__schliessen') ? document.querySelector('#pad [data-padzu], #pad .pad__schliessen').click() : null")
    pg.wait_for_timeout(800)
    pg.reload(); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1800)
    zu = pg.locator("#pad").count() == 0
    print("Nach dem Schliessen kein Pad:", zu)
    if not ok: f.append("Dashboard nach Neuladen nicht dasselbe")
    if not zu: f.append("Pad ging nach dem Schliessen wieder auf")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
