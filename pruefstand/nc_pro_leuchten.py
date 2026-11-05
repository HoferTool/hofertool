# NC-PRO leuchtet in der Themenfarbe (seit 1.428.0).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector(".ncpro-titel")
    farben = {}
    for dunkel in (False, True):
        for th in ("blau", "rot", "gruen", "violett"):
            pg.evaluate("""([th, d]) => { const b = document.body;
                if (th === 'blau') b.removeAttribute('data-thema'); else b.setAttribute('data-thema', th);
                b.classList.toggle('dunkel', d); }""", [th, dunkel])
            time.sleep(0.1)
            bg = pg.eval_on_selector(".ncpro-text b", "e => getComputedStyle(e).backgroundImage")
            fi = pg.eval_on_selector(".ncpro-titel", "e => getComputedStyle(e).filter")
            farben[(th, dunkel)] = bg
            pg.locator(".ncpro-kopf").screenshot(path=f"/tmp/claude-0/-home-user-hofertool/3a0baaf2-73b4-5aed-802b-6143bf220098/scratchpad/nc-{th}-{int(dunkel)}.png")
            pruefe(f"Schein {th} {'dunkel' if dunkel else 'hell'}", "drop-shadow" in fi)
    pruefe("Jedes Thema eigener Verlauf", len(set(farben.values())) == len(farben))
    pruefe("Blau hell wie vorher", "rgb(31, 111, 224)" in farben[("blau", False)])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
