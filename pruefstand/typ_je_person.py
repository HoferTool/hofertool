# Maschinentyp je Person (1.445.0): Probleme des eigenen Typs oben, andere
# eingeklappt; Produktion und Pad wählen den Typ vor; alle Parks sichtbar
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.profiles[0].role = 'langdreher'; daten.profiles[0].typen = ['t2']; daten.profiles[0].parks = ['p-lang'];
const kj = daten.jobs.find(j => j.machine_id === 'm-k2'); kj.problem = 'Zange klemmt';
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2000)
    karte = pg.locator("#db-probleme")
    oben = pg.evaluate("[...document.querySelectorAll('#db-probleme section > .problemzeile')].map(e => e.innerText).join('|')")
    andere = pg.evaluate("(document.querySelector('[data-andere-probleme]') || {}).innerText || ''")
    zu = pg.evaluate("!!document.querySelector('[data-andere-probleme]') && !document.querySelector('[data-andere-probleme]').open")
    pruefe("Eigenes Problem oben", "Zange klemmt" in oben and "Material fehlt" not in oben)
    pruefe("Anderes Problem eingeklappt", zu and "Andere Probleme" in andere)
    pg.click("[data-andere-probleme] summary"); pg.wait_for_timeout(300)
    pruefe("Aufgeklappt lesbar", "Material fehlt" in pg.inner_text("[data-andere-probleme]"))
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/a30e2330-ad3e-5d4f-a5a4-2ba1137e5925/scratchpad/start.png")

    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/produktion", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    parks = pg.evaluate("[...document.querySelectorAll('[data-park]')].map(e => e.dataset.park)")
    aktiv = pg.evaluate("(document.querySelector('.parkwahl__knopf.aktiv') || {}).dataset?.park")
    pruefe("Produktion zeigt alle Parks", "p-lang" in parks and "p-kurz" in parks)
    pruefe("Park des eigenen Typs vorgewählt", aktiv == "p-kurz")

    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(1200)
    nrs = pg.evaluate("[...document.querySelectorAll('#pad .pad-kachel--maschine')].map(e => e.innerText).join('|')")
    pruefe("Pad direkt bei den Maschinen des Typs", "K-200" in nrs and "L-100" not in nrs)
    pg.click("[data-padzurueck]"); pg.wait_for_timeout(900)
    pg.click("[data-padzurueck]"); pg.wait_for_timeout(900)
    pruefe("Zurück führt zu allen Parks", pg.locator("#pad [data-park]").count() == 2)
    fehler += f
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
