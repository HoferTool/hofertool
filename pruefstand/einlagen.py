# Einlagen Gen (created by Ecker) (1.306.0, Wunsch Patrick 30. Oktober 2026):
# Werkzeug-Konturscanner als eigener Reiter, im Rahmen aus public/einlagen/,
# Farben wie die App, earcut ohne Netz, Bedienung darin zählt gegen das
# Abmelden, nicht für Externe.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")

def seite(br, url, mit="\nTEST.daten.einlagen = [];", w=1440, h=900, mobil=False):
    ctx = br.new_context(viewport={"width": w, "height": h}, is_mobile=mobil, has_touch=mobil)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + mit))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html" + url, wait_until="domcontentloaded")
    return pg, pf

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, pf = seite(br, "#/einlagen")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pruefe(pg.locator("[data-nav='einlagen']").count() > 0, "Reiter im Menü")
    nav = pg.evaluate("() => { const t = document.querySelector(\"[data-nav='einlagen'] .nav__text\"); const u = t.querySelector('.nav__unter'); return [t.firstChild.textContent, u && u.textContent, u && +getComputedStyle(u).opacity, u && u.getBoundingClientRect().top > t.firstChild.parentElement.getBoundingClientRect().top + 5]; }")
    pruefe(nav[0] == "Einlagen Gen" and nav[1] == "created by Ecker" and nav[2] < 1 and nav[3], "Reiter zweizeilig, zweite Zeile blass: %s" % nav)
    fr = pg.frame_locator("iframe.einlagen-rahmen")
    fr.locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(1500)
    f = pg.frames[1]
    pruefe(f.evaluate("document.querySelector('h1').textContent") == "Einlagen Gen", "Werkzeug läuft im Rahmen")
    pruefe(f.evaluate("typeof earcut") == "function", "earcut ohne Netz geladen")
    pruefe(f.evaluate("document.documentElement.dataset.theme") == "light", "hell wie die App")
    pruefe(f.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == "#003884", "Firmenblau als Akzent")
    hoch = pg.evaluate("() => { const r = document.querySelector('iframe.einlagen-rahmen').getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; }")
    pruefe(hoch[1] <= hoch[2] and hoch[2] - hoch[1] < 40, "Rahmen bis an den unteren Rand: %s" % hoch)
    # Bedienung im Rahmen zählt gegen das Abmelden nach 5 Minuten
    pg.wait_for_timeout(1200)
    vorher = pg.evaluate("() => +(JSON.parse(localStorage.getItem('hofer.zuletztAktiv') || '{}')[Object.keys(JSON.parse(localStorage.getItem('hofer.zuletztAktiv') || '{}'))[0]] || 0)")
    # Ansicht 3 (Einlage) öffnen, wie ein Mensch
    f.click("#stepLayout"); pg.wait_for_timeout(800)
    pruefe(f.evaluate("!document.getElementById('scanMode') || document.getElementById('scanMode').hidden || getComputedStyle(document.getElementById('scanMode')).display === 'none'"), "Schritt Einlage geht auf")
    if BILD: pg.screenshot(path=BILD + "-pc-einlage.png")
    # Beispiel-Scan in die Einlage, dann STL speichern: Download aus dem Rahmen
    f.click("button:has-text('Aktuellen Scan einfügen')"); pg.wait_for_timeout(800)
    f.click("#pickAll"); f.click("#pickOk"); pg.wait_for_timeout(3000)
    # Von selbst in der App gespeichert (Tabelle einlagen)
    e = pg.evaluate("() => (TEST.daten.einlagen || []).map(x => [x.name, x.daten.items.length])")
    pruefe(len(e) == 1 and e[0][1] == 4, "Einlage von selbst gespeichert: %s" % e)
    pruefe("in der App gespeichert" in pg.inner_text("#einlagen-stand"), "Stand zeigt gespeichert: " + pg.inner_text("#einlagen-stand"))
    # Name ändern speichert auch
    f.fill("#layName", "Bohrer-Kiste"); f.dispatch_event("#layName", "change"); pg.wait_for_timeout(2500)
    e = pg.evaluate("() => (TEST.daten.einlagen || []).map(x => x.name)")
    pruefe(e == ["Bohrer-Kiste"], "Name gespeichert, keine zweite Zeile: %s" % e)
    # Neue Einlage, dann die gespeicherte wieder öffnen
    pg.click("#einlagen-neu"); pg.wait_for_timeout(2500)
    pruefe(f.evaluate("layData().items.length") == 0 and len(pg.evaluate("TEST.daten.einlagen")) == 1, "neue leere Einlage, nichts Leeres gespeichert")
    pg.click("#einlagen-liste"); pg.wait_for_selector("#einlagen-fenster .einlagen__oeffnen")
    if BILD: pg.screenshot(path=BILD + "-liste.png")
    pg.click("#einlagen-fenster .einlagen__oeffnen"); pg.wait_for_timeout(800)
    pruefe(f.evaluate("layData().items.length") == 4 and f.evaluate("layData().name") == "Bohrer-Kiste", "gespeicherte Einlage wieder geöffnet")
    if BILD: pg.screenshot(path=BILD + "-pc-einlage2.png")
    f.evaluate("document.getElementById('layExportStl').scrollIntoView()")
    with pg.expect_download(timeout=30000) as dl:
        f.click("#layExportStl")
    pruefe(dl.value.suggested_filename.endswith(".stl") and os.path.getsize(dl.value.path()) > 1000, "STL wird gespeichert: " + dl.value.suggested_filename)
    f.click("#stepContour"); pg.wait_for_timeout(800)
    if BILD: pg.screenshot(path=BILD + "-pc.png")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    pg.context.close()

    # Dunkel wie die App
    pg, pf = seite(br, "#/einlagen")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000); pg.wait_for_timeout(1500)
    pg.evaluate("document.body.classList.add('dunkel'); document.querySelector('iframe.einlagen-rahmen').contentWindow.location.reload()")
    pg.wait_for_timeout(1500)
    pruefe(pg.frames[1].evaluate("document.documentElement.dataset.theme") == "dark", "dunkel wie die App")
    if BILD: pg.screenshot(path=BILD + "-dunkel.png")
    pg.context.close()

    # Handy
    pg, pf = seite(br, "#/einlagen", w=390, h=844, mobil=True)
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000); pg.wait_for_timeout(2500)
    hoch = pg.evaluate("() => { const r = document.querySelector('iframe.einlagen-rahmen').getBoundingClientRect(); return [r.top, r.bottom, innerHeight, document.documentElement.scrollWidth]; }")
    pruefe(hoch[3] <= 390, "Handy ohne seitliches Rollen: %s" % hoch)
    if BILD: pg.screenshot(path=BILD + "-handy.png")
    pruefe(not pf, "Handy ohne Skriptfehler: %s" % pf[:2])
    pg.context.close()

    # Externe sehen den Reiter nicht
    pg, pf = seite(br, "#/einlagen", "\nTEST.daten.einlagen = []; TEST.daten.profiles[0].role = 'extern';")
    pg.wait_for_timeout(3000)
    pruefe(pg.locator("iframe.einlagen-rahmen").count() == 0 and pg.locator("[data-nav='einlagen']").count() == 0, "Externe sehen den Reiter nicht")
    pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
