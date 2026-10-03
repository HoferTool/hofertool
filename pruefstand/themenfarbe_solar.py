# Verbrauch auf der Solaranzeige und Häkchen folgen der Themenfarbe,
# hell und dunkel, in jedem Thema. Erzeugung und Netz bleiben fest.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ERWARTET = {"blau": "#7fb2ff", "rot": "#ff8a80", "gruen": "#5fd699", "gelb": "#f2c85a",
            "rosa": "#ff86c4", "violett": "#b98cf0", "orange": "#ffa45c"}
def rgb(h): return "rgb(%d, %d, %d)" % tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2500)
    pruefe("Solarkurve Verbrauch da", pg.locator(".sol-kurve--verb").count() >= 1)
    pg.evaluate("""() => { const d = document.createElement('div'); d.id = 'probe';
      d.innerHTML = '<input type=checkbox checked id=pk><div class="sol-zahl sol-zahl--verb"><span class=sol-zahl__wert>1</span></div>';
      document.body.appendChild(d); }""")
    for dunkel in (False, True):
        for t, farbe in ERWARTET.items():
            pg.evaluate(f"""() => {{ document.body.classList.toggle('dunkel', {str(dunkel).lower()});
              if ('{t}' === 'blau') document.body.removeAttribute('data-thema'); else document.body.setAttribute('data-thema', '{t}'); }}""")
            w = pg.evaluate("""() => ({
              kurve: getComputedStyle(document.querySelector('.sol-kurve--verb')).stroke,
              strich: getComputedStyle(document.querySelector('#probe .sol-zahl--verb')).borderLeftColor,
              erz: getComputedStyle(document.querySelector('.sol-kurve--prod')).stroke,
              haken: getComputedStyle(document.getElementById('pk')).accentColor,
              marke: getComputedStyle(document.body).getPropertyValue('--marke').trim() })""")
            n = ("dunkel " if dunkel else "hell ") + t
            pruefe(n + ": Verbrauch-Kurve", w["kurve"] == rgb(farbe))
            pruefe(n + ": Verbrauch-Strich", w["strich"] == rgb(farbe))
            pruefe(n + ": Häkchen = Themenfarbe", w["haken"] == rgb(w["marke"]))
            pruefe(n + ": Erzeugung fest", w["erz"] == rgb("#c6f135"))
    pg.evaluate("document.getElementById('probe').remove(); document.body.classList.add('dunkel'); document.body.setAttribute('data-thema','gruen')")
    pg.locator(".solar").first.screenshot(path="/tmp/claude-0/solar-gruen.png")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(800)
    pg.locator(".dialog--einstellungen").screenshot(path="/tmp/claude-0/einst-gruen.png")
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
