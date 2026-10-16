# Pad: „Laufen lassen“ bei Stück am Abend (1.73.0, Wunsch Patrick
# 16. Oktober 2026). Der Knopf speichert -1 in abend_stk, die Kachel
# zeigt „Laufen lassen“; eine Zahl ersetzt es wieder.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("AL_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 820}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0, i)).click(); pg.wait_for_timeout(2500)
    kachel = pg.locator("[data-padfeld='abend']")
    pruefe(kachel.count() == 1, "Kachel Stück am Abend da")
    kachel.click(); pg.wait_for_timeout(600)
    knopf = pg.locator(".zifferblock [data-zbextra]")
    pruefe(knopf.count() == 1 and knopf.inner_text() == "Laufen lassen", "Knopf „Laufen lassen“ im Zifferblock")
    pg.screenshot(path=os.path.join(BILD, "abend-laufen-zifferblock.png"))
    knopf.click(); pg.wait_for_timeout(1200)
    d = pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.abend_stk)")
    pruefe(-1 in d, "gespeichert als -1: %s" % d)
    t = kachel.inner_text()
    pruefe("Laufen lassen" in t and "-1" not in t, "Kachel zeigt „Laufen lassen“: %r" % t)
    pg.screenshot(path=os.path.join(BILD, "abend-laufen-kachel.png"))
    # Wieder eine Zahl: Feld startet leer, nicht mit -1
    kachel.click(); pg.wait_for_timeout(600)
    pruefe(pg.locator("#zb-anzeige").inner_text() == "0", "Zifferblock startet leer")
    for z in "120": pg.locator(f".zifferblock [data-zb='{z}']").click()
    pg.locator(".zifferblock [data-zbja]").click(); pg.wait_for_timeout(1200)
    pruefe("120 Stk" in kachel.inner_text(), "Zahl ersetzt Laufen lassen: %r" % kachel.inner_text())
    pruefe(not pf, "keine Seitenfehler %s" % pf)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
