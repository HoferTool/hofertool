# Bildschirme holen neue Fassungen von selbst (1.212.1, Patrick 26. Oktober
# 2026: „das Infoboard-Display aktualisiert sich nicht automatisch“): alle
# zwei Minuten schaut die Anzeige nach, lädt bei neuer Fassung gleich neu,
# holt vorher die Seite frisch und probiert es höchstens alle zehn Minuten.
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
    ctx = br.new_context(viewport={"width": 1080, "height": 1920})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.clock.install()
    # Wie das Konto „Infoboard“: ein Gerätekonto, das nie abgemeldet wird
    FAKE_IB = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).andere_nutzer = true;\n"
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE_IB))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    import re, os
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist", "index.html"), encoding="utf-8") as f:
        NEU_HTML = re.sub(r"assets/index-[^\"'\s]+\.js", "assets/index-NEU123.js", f.read())
    neu = {"an": False}
    frisch = []
    def seite(route):
        req = route.request
        if req.headers.get("cache-control") == "no-cache" or "stand=" not in req.url:
            frisch.append(req.url)
        if neu["an"] and "stand=" in req.url:
            route.fulfill(status=200, content_type="text/html", body=NEU_HTML)
        else:
            route.continue_()
    pg.route("**/index.html*", seite)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html?bildschirm=infoboard", wait_until="domcontentloaded")
    pg.clock.run_for(3000)
    pg.wait_for_selector("#infoboard", timeout=15000)
    pruefe(True, "Infoboard-Anzeige geht auf")
    pg.evaluate("window.__alt = 1")
    # Ein vergessenes Fenster hinter der Anzeige hält nichts auf (1.242.3)
    pg.evaluate("""() => { const d = document.createElement('div'); d.className = 'dialog-huelle'; document.body.appendChild(d); }""")
    # Gleiche Fassung: nichts passiert
    pg.clock.run_for(130000); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("window.__alt === 1"), "gleiche Fassung: kein Neuladen")
    # Neue Fassung: innert zwei Minuten neu geladen
    neu["an"] = True; frisch.clear()
    pg.clock.run_for(130000)
    pg.wait_for_function("window.__alt === undefined", timeout=20000)
    pruefe(True, "neue Fassung: Anzeige lädt neu")
    pruefe(len(frisch) > 0, "Seite vorher frisch geholt: %d" % len(frisch))
    pg.clock.run_for(3000)
    pg.wait_for_selector("#infoboard", timeout=15000)
    pruefe(True, "nach dem Neuladen wieder die Anzeige")
    pruefe(any("fassung=NEU123" in u for u in frisch), "neu geladen mit ?fassung= in der Adresse")
    pruefe("fassung=" not in pg.url and "bildschirm=infoboard" in pg.url, "Zusatz danach wieder weg: " + pg.url)
    # Kam doch die alte Seite: nicht im Kreis, erst nach zehn Minuten wieder
    pg.evaluate("window.__alt = 2")
    pg.clock.run_for(90000); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("window.__alt === 2"), "nicht gleich wieder neu geladen")
    pruefe(pg.locator("#infoboard").count() == 1, "Anzeige bleibt offen, keine Abmeldung")
    # Zehn Minuten nach dem letzten Versuch: noch einmal
    pg.evaluate("""() => { const [f] = sessionStorage.getItem('hofer.fassung.bildschirm').split('|');
      sessionStorage.setItem('hofer.fassung.bildschirm', f + '|' + (Date.now() - 4 * 60000)); }""")
    for _ in range(12):
        if pg.evaluate("window.__alt === undefined"): break
        pg.clock.run_for(20000); pg.wait_for_timeout(1000)
    pg.wait_for_function("window.__alt === undefined", timeout=20000)
    pruefe(True, "nach drei Minuten noch ein Versuch")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:3])
    br.close()
print("Fehler: " + ("keine" if not fehler else "; ".join(fehler)))
