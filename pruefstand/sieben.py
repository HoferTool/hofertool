import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
def seite(br, w=1440, h=900):
    pg = br.new_context(viewport={"width":w,"height":h}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg, f = seite(br)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    print("Regler breit:", pg.evaluate("[...document.querySelectorAll('#pw-regler, #pw-hoehe')].map(e => Math.round(e.getBoundingClientRect().width))"), "px")
    # Vorschau
    pg.evaluate("TEST.daten.jobs.forEach((j, i) => { if (i % 2) j.fa_nr = null; })")
    b = pg.locator(".pw-balken").first.bounding_box(); pg.mouse.move(b["x"] + 20, b["y"] + b["height"] / 2); pg.wait_for_timeout(900)
    print("Vorschau:", pg.evaluate("[...document.querySelectorAll('.pw-info .pw-info__zeile--klein')].map(x => x.textContent).slice(-1)"))
    pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    # Verschieben: kein Materialfenster
    sp = pg.query_selector_all(".pw-spuren:not(.pw-spuren--fein)")
    bal = sp[1].query_selector(".pw-balken"); bb = bal.bounding_box()
    ziel = sp[1].query_selector_all(".pw-zelle")[12].bounding_box()
    pg.mouse.move(bb["x"] + bb["width"]/2, bb["y"] + bb["height"]/2); pg.mouse.down()
    pg.mouse.move(bb["x"] + bb["width"]/2 + 30, bb["y"] + bb["height"]/2 + 5, steps=4)
    pg.mouse.move(ziel["x"] + ziel["width"]/2, ziel["y"] + ziel["height"]/2, steps=12); pg.wait_for_timeout(150); pg.mouse.up()
    pg.wait_for_timeout(1500)
    if pg.locator(".dialog-huelle [data-nein]").count(): pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(1200)
    print("Materialfenster nach dem Verschieben:", pg.locator(".dialog--material").count())
    # Auftragsfenster: keine Vorbereitung, Materialhinweis sichtbar
    pg.locator(".pw-balken").nth(4).click(); pg.wait_for_timeout(900)
    print("Fenster — Vorbereitung:", pg.evaluate("document.querySelector('.dialog').innerText.includes('Vorbereitung')"),
          "| Materialhinweis sichtbar:", pg.evaluate("!document.getElementById('pl-ortfeld').hidden"))
    # Löschen: höchstens die Frage nach der Lücke
    pg.locator("#pl-loeschen").click(); pg.wait_for_timeout(700)
    print("Nach Löschen gefragt:", pg.evaluate("[...document.querySelectorAll('.dialog h2')].map(h => h.textContent)"))
    if pg.locator(".dialog-huelle [data-nein]").count(): pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(1000)
    print("Fehler Planwand:", f[:3] if f else "keine")
    # Woche
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1500)
    pg.locator("[data-modus='woche']").click(); pg.wait_for_timeout(1300)
    r = pg.locator(".raster--woche tbody tr").first.bounding_box()
    pg.screenshot(path="s_woche3.png", clip={"x": r["x"], "y": r["y"], "width": 700, "height": r["height"]})
    pg.close()
    # Pad: alle Bereiche
    pg, f2 = seite(br, 1180, 820)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1300)
    print("Pad-Kacheln:", pg.evaluate("[...document.querySelectorAll('#pad .pad-kachel')].map(k => k.innerText.trim())"),
          "| Seite darunter leer:", pg.evaluate("document.getElementById('inhalt').innerHTML === ''"))
    # Seit 111.8.2 zeigt die Pad-Startseite nur noch "Maschinen":
    # hinein zu den Parks und einen Schritt zurück
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(1500)
    print("Parks im Pad:", pg.evaluate("(document.querySelector('#pad .pad__titel')||{}).textContent"),
          "|", pg.evaluate("document.querySelectorAll('#pad [data-park]').length"), "Parks")
    pg.locator("#pad [data-padzurueck]").click(); pg.wait_for_timeout(900)
    print("Zurück:", pg.evaluate("document.querySelectorAll('#pad .pad-kachel').length"), "Kacheln")
    pg.locator("#pad [data-padzu]").click(); pg.wait_for_timeout(1500)
    print("Nach Schliessen, Seite wieder da:", pg.evaluate("document.getElementById('inhalt').innerHTML.length > 100"))
    print("Fehler Pad:", f2[:3] if f2 else "keine")
    br.close()
