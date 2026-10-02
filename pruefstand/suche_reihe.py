import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1440,"height":900}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    folgen = {}
    for reihe in ("neu", "alt"):
        pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
        pg.locator(f"[data-sureihe='{reihe}']").click()
        pg.fill("#su-text", "Star SR3"); pg.locator("#su-ja").click(); pg.wait_for_timeout(1200)
        anzahl = int(pg.evaluate("document.querySelector('.su-leiste__text').textContent").split(" von ")[1].split(" ")[0])
        folge = []
        for i in range(anzahl):
            folge.append(pg.evaluate("(document.querySelector('.su-leiste__text')||{}).textContent").split(" · ")[-1])
            pg.locator("#su-weiter").click(); pg.wait_for_timeout(350)
        folgen[reihe] = folge
        pg.locator("#su-ende").click(); pg.wait_for_timeout(400)
    print("Treffer:", len(folgen["neu"]))
    print("neuester zuerst:", folgen["neu"][:5], "…")
    print("ältester zuerst:", folgen["alt"][:5], "…")
    datum = lambda nr: pg.evaluate(f"(TEST.daten.jobs.filter(j => j.job_number === '{nr}').map(j => j.planned_from).sort().pop())")
    print("Datum erster/letzter (neu):", datum(folgen["neu"][0]), "/", datum(folgen["neu"][-1]))
    frueh = lambda nr: pg.evaluate(f"(TEST.daten.jobs.filter(j => j.job_number === '{nr}').map(j => j.planned_from).sort()[0])")
    print("Datum erster/letzter (alt):", frueh(folgen["alt"][0]), "/", datum(folgen["alt"][-1]))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
