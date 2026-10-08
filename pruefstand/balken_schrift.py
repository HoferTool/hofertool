# Balkenanschrift (111.104.0, Wunsch Patrick 8. Oktober 2026): dünner,
# immer schwarz (auch im dunklen Modus und auf dunklen Farben) und so
# gross, dass zwei Zeilen die Höhe des Balkens bis auf ein paar Pixel nutzen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

MESSEN = """() => [...document.querySelectorAll('.pw-balken[data-auftrag]')].filter(b => b.getBoundingClientRect().width > 120 && b.querySelector('.pw-zeile2').textContent.trim()).slice(0, 12).map(b => {
  const z1 = b.querySelector('.pw-zeile1'), z2 = b.querySelector('.pw-zeile2'), r = b.getBoundingClientRect();
  const a = z1.getBoundingClientRect(), c = z2.getBoundingClientRect();
  return { h: r.height, oben: a.top - r.top, unten: r.bottom - (z2.textContent.trim() ? c.bottom : a.bottom),
    farbe1: getComputedStyle(b.querySelector('.pw-balken__nr')).color, farbe2: getComputedStyle(z2).color,
    dicke: getComputedStyle(b.querySelector('.pw-balken__nr')).fontWeight, gross: parseFloat(getComputedStyle(z1).fontSize) }; })"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for dunkel in (False, True):
        pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
        pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
        name = "dunkel" if dunkel else "hell"
        for hoehe in (100, 60, 160):
            pg.evaluate("(w) => { const r = document.getElementById('pw-hoehe'); r.value = w; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }", hoehe)
            pg.wait_for_timeout(500)
            m = pg.evaluate(MESSEN)
            print(f"     {name} {hoehe}%:", m[0])
            pruefe(f"{name} {hoehe}%: Balken gemessen", len(m) > 3)
            pruefe(f"{name} {hoehe}%: Schrift schwarz", all(x["farbe1"] == "rgb(0, 0, 0)" and x["farbe2"] == "rgb(0, 0, 0)" for x in m))
            pruefe(f"{name} {hoehe}%: dünner (500)", all(int(x["dicke"]) <= 500 for x in m))
            pruefe(f"{name} {hoehe}%: Text bleibt im Balken", all(x["oben"] >= 0 and x["unten"] >= -1 for x in m))
            if hoehe >= 100:
                pruefe(f"{name} {hoehe}%: Höhe genutzt (oben und unten höchstens 8 px)",
                       all(x["oben"] <= 8 and x["unten"] <= 8 for x in m))
            pg.screenshot(path=f"/tmp/balken_{name}_{hoehe}.png")
        pg.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
