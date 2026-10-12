# Kein roter Heute-Strich im Zeitregler unten (1.30.1, Wunsch Patrick 12. Oktober 2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
f = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const m = document.getElementById('pw-zeitmarke');
      return { da: !!m, sichtbar: !!m && getComputedStyle(m).display !== 'none',
               regler: !!document.querySelector('#pw-zeitschicht #pw-zeit') }; }""")
    gut = r["regler"] and not r["sichtbar"]
    print("ok " if gut else "FEHLT", "Zeitregler ohne roten Strich", r)
    if not gut: f.append("Strich")
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/244f0e72-e196-5748-be15-f019d8336085/scratchpad/unten.png", clip={"x": 0, "y": 820, "width": 1440, "height": 80})
    br.close()
print("Fehler:", "; ".join(f) or "keine")
