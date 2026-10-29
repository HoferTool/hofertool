# Auftragsfenster verschieben (seit 1.190.0, seit 1.193.0 geht es auf der
# Planwand gleich im eigenen Fenster auf): Am Kopf ziehen verschiebt
# es in der App, über den Rand hinaus und mit dem Knopf ⧉ wird es ein
# eigenes Browserfenster. Dort geht alles wie vorher (Eingaben,
# Speichern, Rückfragen, Escape), die Planwand dahinter bleibt frei.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILDER", "")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    def einrichten(pg):
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.on("console", lambda m: fehler.append(m.text[:160])
              if m.type == "error" and "Failed to load resource" not in m.text else None)
    ctx.on("page", einrichten)
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.eigenesFenster = true")  # sonst bleibt es im Prüfstand in der App
    jid = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    sel = f".pw-balken[data-auftrag='{jid}']"
    def oeffnen():
        # Ohne eigenes Fenster (wie bei gesperrten Pop-ups): bleibt in der App
        pg.evaluate("window.__open = window.open; window.open = () => null")
        pg.locator(sel).first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500)
        pg.evaluate("window.open = window.__open")

    # 0) Doppelklick öffnet gleich das eigene Fenster
    with ctx.expect_page() as neu: pg.locator(sel).first.dblclick()
    w = neu.value; w.wait_for_selector(".dialog--auftrag")
    print("Doppelklick: eigenes Fenster", w.title(), "| in der App:", pg.locator(".dialog--auftrag").count())
    if pg.evaluate("document.querySelectorAll('.dialog-huelle').length"): fehler.append("Doppelklick: Fenster bleibt in der App")
    # Ein anderer Auftrag ersetzt es
    andere = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].filter(b => b.getBoundingClientRect().width > 40).map(b => b.dataset.auftrag).find(i => i !== %r)" % jid)
    with ctx.expect_page() as neu2: pg.locator(f".pw-balken[data-auftrag='{andere}']").first.dblclick()
    w2 = neu2.value; w2.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(600)
    print("zweiter Auftrag: altes zu", w.is_closed(), "| neues", w2.title())
    if not w.is_closed(): fehler.append("altes eigenes Fenster bleibt offen")
    w2.close(); pg.wait_for_timeout(700)
    if pg.evaluate("document.querySelectorAll('.dialog-huelle').length"): fehler.append("nach Schliessen bleibt etwas in der App")
    # Gesperrte Pop-ups: in der App, ohne Warnung
    oeffnen()
    if "blockiert" in pg.evaluate("[...document.querySelectorAll('.toast')].map(m => m.innerText).join(' ')"):
        fehler.append("Warnung beim stillen Versuch")
    # Tasten kommen im Prüfstand nach einem geschlossenen Fenster nicht mehr an,
    # darum hier mit dem X
    pg.click("#pl-nein"); pg.wait_for_timeout(600)

    # 1) In der App ziehen
    oeffnen()
    k = pg.locator(".auf-kopf").bounding_box()
    vorher = pg.locator(".dialog--auftrag").bounding_box()
    pg.mouse.move(k["x"] + 300, k["y"] + 10); pg.mouse.down()
    pg.mouse.move(k["x"] + 200, k["y"] + 60, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    nachher = pg.locator(".dialog--auftrag").bounding_box()
    d = (round(nachher["x"] - vorher["x"]), round(nachher["y"] - vorher["y"]))
    print("in der App verschoben um", d)
    if abs(d[0] + 100) > 20 or abs(d[1] - 50) > 20: fehler.append(f"Ziehen in der App: {d}")
    if not pg.locator(".dialog--auftrag").count(): fehler.append("Ziehen schliesst das Fenster")

    # 2) Knopf ⧉ → eigenes Fenster, darin eintippen und speichern
    with ctx.expect_page() as neu: pg.click("#pl-eigen")
    w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(400)
    farbe = w.evaluate("getComputedStyle(document.querySelector('.dialog--auftrag')).backgroundColor")
    if farbe in ("rgba(0, 0, 0, 0)", ""): fehler.append("Gestaltung fehlt im eigenen Fenster")
    w.fill("#pl-fa-nr", "FA-EIGEN-77"); w.wait_for_timeout(150)
    if w.input_value("#pl-fa-nr") != "FA-EIGEN-77": fehler.append("Eingabe geht nicht")
    if BILD: w.screenshot(path=BILD + "/eigenes-fenster.png")
    # Planwand dahinter bedienbar: ein Klick auf einen Balken markiert
    pg.locator(".pw-balken[data-auftrag]").nth(2).click(); pg.wait_for_timeout(300)
    if w.is_closed(): fehler.append("Klick auf die Planwand schliesst das eigene Fenster")
    w.click("#pl-ja"); pg.wait_for_timeout(1500)
    gespeichert = pg.evaluate("TEST.daten.planwand.find(j => j.id === %r).fa_nr" % jid)
    print("gespeichert:", gespeichert, "| eigenes Fenster zu:", w.is_closed())
    if gespeichert != "FA-EIGEN-77": fehler.append("Speichern aus dem eigenen Fenster: " + str(gespeichert))
    if not w.is_closed(): fehler.append("eigenes Fenster bleibt nach Speichern offen")

    # 3) Escape im eigenen Fenster schliesst; Browserfenster zu → App-Fenster zu
    with ctx.expect_page() as neu: pg.locator(sel).first.dblclick()
    w = neu.value; w.wait_for_selector(".dialog--auftrag")
    w.evaluate("setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})), 0)")
    pg.wait_for_timeout(800)
    if not w.is_closed(): fehler.append("Escape schliesst das eigene Fenster nicht")
    with ctx.expect_page() as neu: pg.locator(sel).first.dblclick()
    w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.close(); pg.wait_for_timeout(900)
    offen = pg.evaluate("document.querySelectorAll('.dialog-huelle').length")
    if offen: fehler.append("nach Schliessen des Browserfensters bleibt etwas offen")
    oeffnen()
    if not pg.locator(".dialog--auftrag").count(): fehler.append("danach geht kein Auftragsfenster mehr auf")

    # 4) Über den Rand hinaus ziehen
    k = pg.locator(".auf-kopf").bounding_box()
    pg.mouse.move(k["x"] + 300, k["y"] + 10); pg.mouse.down()
    with ctx.expect_page(timeout=4000) as neu:
        pg.mouse.move(800, 300, steps=3); pg.mouse.move(1599.5, 300); pg.mouse.move(1700, 300)
    pg.mouse.up()
    w = neu.value; w.wait_for_selector(".dialog--auftrag")
    print("über den Rand: eigenes Fenster da")
    # Rückfrage aus dem eigenen Fenster kommt dorthin, Escape schliesst nur sie
    w.click("#pl-loeschen"); w.wait_for_timeout(600)
    n = w.evaluate("document.querySelectorAll('.dialog-huelle').length")
    print("Rückfrage im eigenen Fenster:", n, "| in der App:", pg.evaluate("document.querySelectorAll('.dialog-huelle').length"))
    if BILD: w.screenshot(path=BILD + "/eigenes-fenster-rueckfrage.png")
    # Die Rückfrage ist „Lücke schliessen?“: Escape heisst Nein, gelöscht
    # wird trotzdem, danach geht das Fenster zu, genau wie in der App
    if n != 2: fehler.append("Rückfrage geht nicht im eigenen Fenster auf")
    else:
        w.evaluate("setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})), 0)")
        pg.wait_for_timeout(1200)
        weg = pg.evaluate("!TEST.daten.planwand.some(j => j.id === %r)" % jid)
        print("nach Escape: gelöscht", weg, "| eigenes Fenster zu", w.is_closed())
        if not weg or not w.is_closed(): fehler.append("Escape auf der Rückfrage tut nicht dasselbe wie in der App")
        if pg.evaluate("document.querySelectorAll('.dialog-huelle').length"): fehler.append("danach bleibt ein Fenster in der App")
    if not w.is_closed(): w.close()
    pg.wait_for_timeout(600)

    # 5) Einrichtblatt aus dem eigenen Fenster geht dort auf, auch wenn der
    # Browser den Fokus nicht meldet (Patrick 29. Oktober 2026: am PC
    # „versteckt“ hinter dem Auftragsfenster im Hauptfenster)
    jid2 = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    with ctx.expect_page() as neu: pg.locator(f".pw-balken[data-auftrag='{jid2}']").first.dblclick()
    w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(400)
    w.evaluate("Document.prototype.hasFocus = () => false")
    pg.evaluate("Document.prototype.hasFocus = () => false")
    w.click("#pl-blattreihe button"); w.wait_for_timeout(1200)
    hier = w.evaluate("document.querySelectorAll('.betrachter-huelle').length")
    dort = pg.evaluate("document.querySelectorAll('.betrachter-huelle').length")
    print("Einrichtblatt: im eigenen Fenster", hier, "| in der App", dort)
    if hier != 1 or dort: fehler.append("Einrichtblatt geht nicht im eigenen Fenster auf")
    # Ein Klick auf die Planwand danach: neue Fenster bleiben wieder in der App
    w.click(".betrachter-huelle button:has-text('Schliessen')"); w.wait_for_timeout(300)
    pg.locator(".pw-balken[data-auftrag]").nth(2).click(); pg.wait_for_timeout(200)
    pg.evaluate("TEST.eigenesFenster = false; window.open = () => null")
    if not w.is_closed(): w.close()
    pg.wait_for_timeout(600)
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
