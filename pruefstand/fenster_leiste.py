# 1.819.0: Fenster am Titel verschieben, mehrere offen, Fensterleiste oben
# mit Knopf je Fenster und „Alle schliessen“ (Wunsch Patrick 25. November 2026).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    # Zwei Fenster wie fensterOeffnen sie baut
    pg.evaluate("""() => { for (const [i, t] of [[1, 'Erstes Fenster'], [2, 'Zweites Fenster']]) {
      const h = document.createElement('div'); h.className = 'dialog-huelle'; h.id = 'test-f' + i;
      h.innerHTML = `<div class="dialog" style="width:420px;height:260px"><h2>${t}</h2><p>Inhalt ${i}</p><input id="feld${i}"></div>`;
      h.__hoferZu = () => h.remove(); document.body.appendChild(h); } }""")
    pg.wait_for_timeout(1300)
    chips = pg.locator(".fensterleiste__chip")
    if chips.count() != 2: fehler.append(f"Leiste zeigt {chips.count()} statt 2 Fenster")
    texte = [chips.nth(i).inner_text() for i in range(chips.count())]
    if texte != ["Erstes Fenster", "Zweites Fenster"]: fehler.append(f"Titel: {texte}")
    # Zweites ziehen
    r = pg.locator("#test-f2 h2").bounding_box()
    pg.mouse.move(r["x"] + 20, r["y"] + 8); pg.mouse.down()
    pg.mouse.move(r["x"] + 120, r["y"] + 60, steps=8); pg.mouse.move(r["x"] + 320, r["y"] + 108, steps=8); pg.mouse.up()
    pg.wait_for_timeout(300)
    s = pg.evaluate("() => ({ frei: document.getElementById('test-f2').classList.contains('dialog-huelle--frei'), v: document.querySelector('#test-f2 .dialog').dataset.verschoben })")
    print("nach Ziehen", s)
    if not s["frei"]: fehler.append("Gezogenes Fenster nicht frei")
    if s["v"] != "300,100": fehler.append(f"Verschiebung {s['v']}")
    # Erstes ebenso ziehen, dann sind beide frei und beide bedienbar
    r = pg.locator("#test-f1 h2").bounding_box()
    pg.mouse.move(r["x"] + 20, r["y"] + 8); pg.mouse.down(); pg.mouse.move(r["x"] - 300, r["y"] - 100, steps=10); pg.mouse.up()
    pg.wait_for_timeout(300)
    z = lambda: pg.evaluate("() => [1,2].map(i => +document.getElementById('test-f' + i).style.zIndex)")
    print("z", z())
    if not z()[0] > z()[1]: fehler.append("Zuletzt gezogenes nicht vorne")
    # Klick in Fenster 2 holt es nach vorne, tippen geht
    pg.click("#feld2"); pg.keyboard.type("abc"); pg.wait_for_timeout(200)
    if not z()[1] > z()[0]: fehler.append("Klick holt Fenster nicht nach vorne")
    if pg.input_value("#feld2") != "abc": fehler.append("Feld im freien Fenster nicht bedienbar")
    # Chip 1 holt Fenster 1 nach vorne
    pg.wait_for_timeout(300)
    pg.locator(".fensterleiste__chip", has_text="Erstes").click(); pg.wait_for_timeout(300)
    if not z()[0] > z()[1]: fehler.append("Chip holt Fenster nicht nach vorne")
    if "fensterleiste__chip--vorne" not in pg.locator(".fensterleiste__chip", has_text="Erstes").get_attribute("class"): fehler.append("Chip nicht als vorne markiert")
    # Escape schliesst das vordere zuerst
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    offen = pg.evaluate("() => [1,2].filter(i => document.getElementById('test-f' + i))")
    print("nach Escape offen", offen)
    if offen != [2]: fehler.append(f"Escape schloss nicht das vordere: {offen}")
    # Alle schliessen
    pg.evaluate("""() => { const h = document.createElement('div'); h.className = 'dialog-huelle'; h.id = 'test-f3';
      h.innerHTML = '<div class="dialog"><h2>Drittes</h2></div>'; h.__hoferZu = () => h.remove(); document.body.appendChild(h); }""")
    pg.wait_for_timeout(500)
    pg.screenshot(path="/tmp/fensterleiste.png")
    pg.click("[data-fenster-alle]"); pg.wait_for_timeout(600)
    n = pg.evaluate("document.querySelectorAll('body > .dialog-huelle').length")
    if n: fehler.append(f"Alle schliessen: noch {n} offen")
    if pg.locator(".fensterleiste").count(): fehler.append("Leiste bleibt ohne Fenster")
    # 1.883.0: grosses Fenster (.gf) geht gleich im eigenen Fenster auf
    pg.evaluate("() => document.querySelectorAll('body > .dialog-huelle').forEach(h => h.remove())")
    pg.evaluate("() => { window.TEST = window.TEST || {}; window.TEST.eigenesFenster = true; }")
    with ctx.expect_page(timeout=5000) as neuSeite:
        pg.evaluate("""() => { const h = document.createElement('div'); h.className = 'dialog-huelle'; h.id = 'test-gross';
          h.innerHTML = '<div class="dialog gf"><div class="gf-titel">Grosses Fenster</div></div>'; h.__hoferZu = () => h.remove(); document.body.appendChild(h); }""")
    pop = neuSeite.value; pop.wait_for_timeout(600)
    if not pop.locator(".gf").count(): fehler.append("Grosses Fenster nicht im eigenen Fenster")
    pg.wait_for_timeout(500)
    if pg.locator(".fensterleiste__chip--aussen").count() != 1: fehler.append("Eigenes Fenster fehlt in der Leiste")
    # Kleines bleibt in der App (zuletzt in der App geklickt)
    pg.bring_to_front(); pg.mouse.click(5, 300); pg.wait_for_timeout(200)
    pg.evaluate("""() => { const h = document.createElement('div'); h.className = 'dialog-huelle'; h.id = 'test-klein';
      h.innerHTML = '<div class="dialog"><h2>Klein</h2></div>'; h.__hoferZu = () => h.remove(); document.body.appendChild(h); }""")
    pg.wait_for_timeout(500)
    if not pg.locator("body > #test-klein").count(): fehler.append("Kleines Fenster nicht in der App")
    pg.click("[data-fenster-alle]"); pg.wait_for_timeout(800)
    if not pop.is_closed(): fehler.append("Alle schliessen schliesst eigenes Fenster nicht")
    pg.evaluate("() => { window.TEST.eigenesFenster = false; }")
    # Handy: keine Leiste
    pg.set_viewport_size({"width": 400, "height": 800})
    pg.evaluate("""() => { const h = document.createElement('div'); h.className = 'dialog-huelle';
      h.innerHTML = '<div class="dialog"><h2>Handy</h2></div>'; document.body.appendChild(h); }""")
    pg.wait_for_timeout(500)
    if pg.locator(".fensterleiste").count(): fehler.append("Leiste am Handy")
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler)
