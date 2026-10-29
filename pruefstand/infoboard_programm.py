# Programmfenster auf dem Infoboard (1.264.0, Wunsch Patrick 29. Oktober 2026:
# Tapo-Livebild mit BlueStacks). Das Feld meldet Titel, Verknüpfung, Ränder und Lage.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ib='neu-programm']").count() == 1, "Knopf „Programmfenster“")
    pg.click("[data-ib='neu-programm']"); pg.wait_for_selector(".dialog input")
    ein = pg.locator(".dialog input")
    pruefe(ein.nth(0).input_value() == "BlueStacks" and ein.nth(1).input_value() == "Tapo", "Vorgabe BlueStacks und Tapo")
    ein.nth(2).fill("40"); ein.nth(3).fill("50")
    pg.locator(".dialog button.knopf--haupt").click(); pg.wait_for_timeout(1000)
    t = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'haupt').aufbau.teile.find(t => t.art === 'programm')")
    pruefe(t and t["titel"] == "BlueStacks" and t["schnitt"] == {"oben": 40, "rechts": 50, "unten": 0, "links": 0}, "gespeichert: %s" % t)
    pruefe(pg.locator(f".ib-gestalten [data-ibteil='{t['id']}'] [data-programm='BlueStacks']").count() == 1, "Platzhalter auf der Tafel")
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/8662a76a-6ae6-5d08-85c5-a65c75ae8cd4/scratchpad/programm.png")
    pg.evaluate("localStorage.setItem('hofer.infoboard.geraet', '1')")
    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(2500)
    m = pg.evaluate("() => TEST.protokoll.filter(p => p.art === 'rpc' && p.name === 'infoboard_fenster_melden').map(p => p.args)")
    f = m[-1]["p_fenster"][0] if m and m[-1]["p_fenster"] else None
    pruefe(f and f["programm"] == "BlueStacks" and f["verknuepfung"] == "Tapo" and f["schnitt"]["oben"] == 40 and f["w"] > 100,
           "Lage gemeldet: %s" % f)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
