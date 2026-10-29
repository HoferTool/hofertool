# Webseite als Teil auf dem Infoboard (1.261.0, Wunsch Patrick 29. Oktober
# 2026: „im Infoboard auch Webseiten anzeigen“). Eine einbettbare Seite
# steht als Rahmen da, eine gesperrte als Hinweis statt grauem Feld.
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
    pg.route("**://beispiel.ch/**", lambda r: r.fulfill(status=200, content_type="text/html",
        body="<html><body style='background:#ffd'><h1 id='hallo'>Hallo Infoboard</h1></body></html>"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""TEST.funktionen = { 'webseite-pruefen': (b) => b.adresse.includes('google')
        ? { erreichbar: true, status: 200, einbettbar: false, grund: 'X-Frame-Options: sameorigin' }
        : { erreichbar: true, status: 200, einbettbar: true, grund: null } }""")
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ib='neu-web']").count() == 1, "Knopf „Webseite hinzufügen“")
    pg.click("[data-ib='neu-web']"); pg.wait_for_selector(".dialog input"); 
    pg.fill(".dialog input", "beispiel.ch/seite"); pg.locator(".dialog button.knopf--haupt").click(); pg.wait_for_timeout(1200)
    t = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'haupt').aufbau.teile.find(t => t.art === 'web')")
    pruefe(t and t["adresse"] == "https://beispiel.ch/seite", "gespeichert mit https: %s" % (t and t.get("adresse")))
    pruefe(t and t["zoom"] == 50 and t["neuLaden"] == 15, "Vorgabe 50 %% und alle 15 Minuten: %s" % t)
    fr = pg.frame_locator(f".ib-gestalten [data-ibteil='{t['id']}'] iframe")
    pruefe(fr.locator("#hallo").inner_text(timeout=5000) == "Hallo Infoboard", "Seite im Rahmen geladen")
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/200b2cf0-6212-519e-8d78-d9236840c41e/scratchpad/web-ok.png")
    # Gesperrte Seite: Rückfrage, dann Hinweis statt Rahmen
    pg.click("[data-ib='neu-web']"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "https://www.google.ch"); pg.locator(".dialog button.knopf--haupt").click()
    pg.wait_for_selector("text=Seite lässt sich nicht einbetten"); pg.locator(".dialog button.knopf--haupt, .dialog button.knopf--gefahr").last.click()
    pg.wait_for_timeout(1000)
    g = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'haupt').aufbau.teile.filter(t => t.art === 'web')")
    pruefe(len(g) == 2 and g[1].get("gesperrt"), "gesperrt vermerkt: %s" % (g[-1].get("gesperrt") if g else None))
    pruefe(pg.locator(f"[data-ibteil='{g[-1]['id']}'] [data-ibweb='gesperrt']").count() == 1, "Hinweis statt grauem Feld")
    pruefe(pg.locator("[data-ib='web-gesperrt']").count() == 1, "Hinweis rechts beim gewählten Teil")
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/200b2cf0-6212-519e-8d78-d9236840c41e/scratchpad/web-gesperrt.png")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
