# Bestellblatt: Bitte, Grüsse und Name sind gleich gross wie die Angaben
# oben (Unser Zeichen, Datum, Anschrift). Das iPhone darf nichts vergrössern.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1400,"height":950})
    pg = ctx.new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(1800)
    with ctx.expect_page() as neu:
        pg.locator("[data-bestellpdf]").first.click()
    blatt = neu.value
    blatt.wait_for_load_state(); blatt.wait_for_timeout(800)
    g = blatt.evaluate("""() => Object.fromEntries(['.angabe', '.an', '.bitte', '.gruss', '.gruss .name']
      .map(s => [s, getComputedStyle(document.querySelector(s)).fontSize]))""")
    anpassen = blatt.evaluate("getComputedStyle(document.body).webkitTextSizeAdjust")
    print("Schriftgrössen:", g, "| iPhone-Vergrösserung:", anpassen)
    if len(set(g.values())) != 1: f.append("Schrift ungleich: " + str(g))
    if anpassen not in ("100%",): f.append("text-size-adjust fehlt")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
