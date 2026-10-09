# Planwand flüssiger (1.1.0, Wunsch Patrick 9. Oktober 2026): Beim Ziehen
# am Zeitregler wird die Tafel nicht mehr bei jedem Schritt neu aufgebaut,
# sondern einmal mit Vorrat gezeichnet und dann nur seitlich gerollt.
# Nach dem Loslassen steht die normale Tafel genau am gewählten Beginn.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1000)

    tage_normal = pg.evaluate("document.querySelectorAll('.pw-tafel .pw-tag').length")
    # Erster sichtbarer Tag: die Spalte direkt rechts der Maschinennamen
    erster = """(() => { const n = document.querySelector('.pw-zeile[data-mzeile] .pw-name').getBoundingClientRect();
      const t = [...document.querySelectorAll('.pw-tafel .pw-tag')].find(x => Math.abs(x.getBoundingClientRect().left - n.right) < 2);
      return t ? t.textContent : null; })()"""
    pg.evaluate("window._neu = 0; new MutationObserver(() => window._neu++).observe(document.querySelector('.pw-rolle'), {childList: true})")

    # Daumen des Reglers fassen und langsam ein paar Pixel nach links ziehen
    r = pg.evaluate("(() => { const e = document.getElementById('pw-zeit'); const q = e.getBoundingClientRect(); return [q.x, q.y + q.height / 2, q.width, Number(e.max), Number(e.value)]; })()")
    x0 = r[0] + 8 + (r[2] - 16) * r[4] / r[3]; y = r[1]
    pg.mouse.move(x0, y); pg.mouse.down()
    for k in range(1, 11):
        pg.mouse.move(x0 - k, y); pg.wait_for_timeout(30)
    pg.wait_for_timeout(200)
    pruefe("beim Ziehen liegt der Vorrat an", pg.evaluate("!!document.querySelector('.pw-tafel--vorrat')"))
    pruefe("Vorrat ist breiter als die normale Tafel", pg.evaluate("document.querySelectorAll('.pw-tafel .pw-tag').length") > tage_normal)
    pruefe("Tafel rollt seitlich", pg.evaluate("document.querySelector('.pw-rolle').scrollLeft") > 0)
    beim_ziehen = pg.evaluate(erster)
    neu_beim_ziehen = pg.evaluate("window._neu")
    pruefe("10 Schritte, höchstens 2 Neuaufbauten (%s)" % neu_beim_ziehen, neu_beim_ziehen <= 2)
    pg.mouse.up(); pg.wait_for_timeout(500)

    pruefe("nach dem Loslassen kein Vorrat mehr", pg.evaluate("!document.querySelector('.pw-tafel--vorrat')"))
    pruefe("normale Anzahl Tage", pg.evaluate("document.querySelectorAll('.pw-tafel .pw-tag').length") == tage_normal)
    pruefe("Tafel steht wieder ganz links", pg.evaluate("document.querySelector('.pw-rolle').scrollLeft") == 0)
    danach = pg.evaluate(erster)
    pruefe("derselbe erste Tag wie beim Ziehen (%s / %s)" % (beim_ziehen, danach), beim_ziehen and beim_ziehen == danach)
    pruefe("nach dem Loslassen nur ein Neuaufbau (%s)" % (pg.evaluate("window._neu") - neu_beim_ziehen), pg.evaluate("window._neu") - neu_beim_ziehen <= 1)

    # Ohne Ziehen, nur mit der Tastatur: wie bisher, ohne Vorrat
    pg.focus("#pw-zeit"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(300)
    pruefe("Tastatur ohne Vorrat", pg.evaluate("!document.querySelector('.pw-tafel--vorrat')"))
    print("Fehler:", fehler if fehler else "keine")
    br.close()
