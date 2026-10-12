# Stückzeit fehlt (1.26.0): Die Kachel Stückzeit im Pad pulsiert, solange
# keine Zeit eingetragen ist, und hört damit auf, sobald eine da ist.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FALSCH ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("(TEST.daten.hoco_type_data || []).forEach(z => z.stueckzeit_s = null)")
    # Ein Testbild als Profilfoto (ein rotes Pixel)
    pg.evaluate("""() => { const p = TEST.daten.profiles; const v = p[0];
      p.push(Object.assign({}, v, { id: 'mb', full_name: 'Michel Bolinger', email: 'mb@test',
        bild_url: 'data:image/gif;base64,R0lGODlhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs=' })); }""")
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0, i)).click(); pg.wait_for_timeout(2500)
    k = ".pad-karte2--zeit"
    pruefe("Kachel pulsiert ohne Stückzeit", pg.locator(k + ".pad-karte2--zeitfehlt").count() == 1)
    pruefe("Animation läuft", pg.evaluate(f"getComputedStyle(document.querySelector('{k}')).animationName") == "pad-zeit-nervt")
    werte = set()
    for _ in range(6):
        werte.add(pg.evaluate(f"getComputedStyle(document.querySelector('{k}'), '::after').opacity")[:3]); pg.wait_for_timeout(130)
    print("     Rot-Schicht:", sorted(werte))
    pruefe("rote Schicht wechselt", len(werte) > 2)
    pruefe("Foto steht in der Kachel", pg.locator(k + " .pad-zeit-foto").count() == 1)
    pg.wait_for_timeout(400); pg.screenshot(path="/tmp/zeit-pulsiert.png")
    # Zeit eintragen: Kachel antippen, Zahl, Eintragen
    pg.locator(k).click(force=True); pg.wait_for_timeout(600)
    pg.wait_for_selector(".zifferblock [data-zbja]")
    pg.keyboard.type("42"); pg.wait_for_timeout(200)
    pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1500)
    print("     Kachel:", pg.inner_text(k).replace("\n", " | "))
    pruefe("nach dem Eintragen ruhig", pg.locator(k + ".pad-karte2--zeitfehlt").count() == 0)
    pruefe("Foto wieder weg", pg.locator(k + " .pad-zeit-foto").count() == 0)
    br.close()
print("Fehler:", "keine" if not (fehler or f) else (fehler + f)[:12])
