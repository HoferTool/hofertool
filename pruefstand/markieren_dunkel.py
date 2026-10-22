# Markieren im dunklen Modus (1.140.3): Die Textmarkierung muss sich
# deutlich von der Fläche abheben, in jeder Themenfarbe.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def hell(rgb):
    r, g, b = [int(x) for x in rgb.replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",")[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_page(viewport={"width": 1400, "height": 900})
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("document.body.classList.add('dunkel')")
    for thema in ["", "rot", "gruen", "gelb", "rosa", "violett", "orange"]:
        pg.evaluate(f"thema => thema ? document.body.dataset.thema = thema : delete document.body.dataset.thema", thema)
        pg.wait_for_timeout(100)
        sel = pg.evaluate("""() => { const s = getComputedStyle(document.querySelector('#inhalt'), '::selection');
            return [s.backgroundColor, s.color, getComputedStyle(document.body).getPropertyValue('--flaeche')]; }""")
        flaeche = pg.evaluate("getComputedStyle(document.body).backgroundColor")
        if hell(sel[0]) - hell(flaeche) < 80: fehler.append(f"{thema or 'blau'}: Markierung {sel[0]} zu nah an {flaeche}")
        if hell(sel[0]) - hell(sel[1]) < 80: fehler.append(f"{thema or 'blau'}: Schrift {sel[1]} auf {sel[0]} schlecht lesbar")
    delete = pg.evaluate("delete document.body.dataset.thema")
    pg.evaluate("""() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#inhalt'));
        getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/claude-0/markieren-dunkel.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
