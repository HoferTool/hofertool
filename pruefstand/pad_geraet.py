# Konto Pad Mode: beim ersten Start fragt das iPad, welche Maschine es
# ist, merkt sie sich und geht danach immer gleich auf ihr Dashboard;
# „Ändern“ auf der Startseite des Pads (1.173.0, Wunsch Patrick 24. Oktober 2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {
  daten.profiles[0].email = 'pad.mode@hoferco.ch';
  daten.profiles[0].role = 'planwand';
  daten.profiles[0].andere_nutzer = true;
})();
"""
KOERPER = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
    zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1180,"height":820})
    pg = ctx.new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:220]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=KOERPER))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**",
              "**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#pad [data-geraetwahl]", timeout=15000); pg.wait_for_timeout(800)
    titel = lambda: pg.evaluate("(document.querySelector('#pad .pad__titel')||{}).textContent||'kein Pad'")
    print("Frage beim ersten Start:", titel(), "| Maschinen:", pg.locator("#pad [data-geraetwahl]").count())
    pg.screenshot(path="pad_geraet_frage.png")
    if "Welche Maschine" not in titel(): f.append("Frage fehlt")
    knopf = pg.locator("#pad [data-geraetwahl]").nth(1)
    name = knopf.inner_text().replace("\n", " ")
    knopf.click(); pg.wait_for_selector("#pad .pad__kopf--dash", timeout=15000); pg.wait_for_timeout(1000)
    dash = titel()
    print("Gewählt:", name, "| Dashboard:", dash, "| gemerkt:", pg.evaluate("localStorage.getItem('hofer.pad.geraet')"))
    # Neustart wie nach Akku leer: neuer Tab, nichts im Tab gespeichert
    pg.evaluate("sessionStorage.clear()")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#pad .pad__kopf--dash", timeout=15000); pg.wait_for_timeout(1000)
    print("Nach Neustart direkt:", titel())
    if titel() != dash: f.append("Nach Neustart nicht auf derselben Maschine")
    marke = pg.evaluate("(document.querySelector('#pad [data-geraetmarke]')||{}).textContent||''")
    print("Marke im Pad:", marke)
    if "K-2002" not in marke: f.append("Marke im Pad fehlt")
    pg.screenshot(path="pad_geraet_dash.png")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(1200)
    marke = pg.evaluate("(document.querySelector('.kopf [data-geraetmarke]')||{}).textContent||''")
    print("Marke in der Kopfzeile:", marke)
    if "K-2002" not in marke: f.append("Marke in der Kopfzeile fehlt")
    pg.screenshot(path="pad_geraet_kopf.png", clip={"x":0,"y":0,"width":1180,"height":120})
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_selector("#pad .pad__kopf--dash"); pg.wait_for_timeout(800)
    # Ändern über die Startseite des Pads
    pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(700)
    while pg.locator("#pad [data-padzurueck]").count() and not pg.locator("#pad [data-padgeraet]").count():
        pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(700)
    zeile = pg.locator("#pad .pad-geraet__zeile").inner_text().replace("\n", " ")
    print("Startseite:", zeile)
    pg.screenshot(path="pad_geraet_start.png")
    pg.click("#pad [data-padgeraet]"); pg.wait_for_selector("#pad [data-geraetwahl]"); pg.wait_for_timeout(500)
    if not pg.locator("#pad .pad-geraet__maschine--an").count(): f.append("Gewählte Maschine nicht markiert")
    pg.click("#pad [data-geraetkeine]"); pg.wait_for_timeout(900)
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(900)
    pg.evaluate("sessionStorage.clear()")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2500)
    print("Ohne feste Maschine: Pad offen?", pg.locator("#pad").count() > 0)
    if pg.locator("#pad").count(): f.append("Ohne feste Maschine ging das Pad trotzdem auf")
    # Andere Konten bekommen keine Frage
    pg2 = br.new_context(viewport={"width":1180,"height":820}).new_page()
    pg2.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg2.route(u, lambda r: r.abort())
    pg2.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg2.wait_for_selector("#inhalt"); pg2.wait_for_timeout(2000)
    pg2.evaluate("document.getElementById('pad-knopf').click()"); pg2.wait_for_timeout(900)
    andere = pg2.evaluate("!!document.querySelector('#pad [data-padwo=parks]') && !document.querySelector('#pad [data-padgeraet], #pad [data-geraetwahl]')")
    print("Anderes Konto: normaler Pad-Start ohne Frage:", andere)
    if not andere: f.append("Anderes Konto bekommt die Frage")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
