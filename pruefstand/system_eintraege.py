# Einträge ohne Person (geschrieben von Claude über die Datenbank, Server-
# Funktionen, Aufgabe am Pool-Rechner) zeigen „System“ statt „unbekannt“
# oder nichts (1.444.6, Wunsch Patrick 7. November 2026).
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
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => { TEST.daten.maschinen_info = [];
      TEST.daten.maschinen_wartung = [{ id: 'w-sys', machine_id: 'm-l1', datum: '2026-11-07',
        text: 'Von Claude eingetragen', anhaenge: [], erstellt_von: null, erstellt_am: new Date().toISOString() }]; }""")
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    pg.click("[data-mpark='p1']" if pg.locator("[data-mpark='p1']").count() else "[data-mpark]:has-text('Langdreher')")
    pg.wait_for_timeout(600)
    pg.click("[data-mmaschine='m-l1']"); pg.wait_for_timeout(1200)
    t = pg.locator("[data-wartung='w-sys']").inner_text() if pg.locator("[data-wartung='w-sys']").count() else ""
    pruefe("System" in t and "unbekannt" not in t, "Wartung ohne Person zeigt System: %r" % t[:80])
    pruefe(not pf, "keine Skriptfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
