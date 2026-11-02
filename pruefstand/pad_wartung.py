# Pad Mode: Kachel „Wartung“ statt „Internet“ (1.337.0, Wunsch Patrick
# 2. November 2026). Bild ablegen, terminieren; ab dem Termin zeigt der
# Bildschirmschoner das Bild statt des Einrichtblatts (auch wenn eine
# Kachel mahnt), bis „Erledigt“ unten in der Mitte quittiert.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
AB = os.environ.get("BILDER_ORDNER", "/tmp")
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c63f8cf80000000030001a5f2bd6f0000000049454e44ae426082")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def warten(pg, ms):
    pg.clock.fast_forward(ms); pg.wait_for_timeout(1300)
SCHONER = "[data-wartung-schoner]"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)

    pruefe("keine Internet-Kachel mehr", pg.locator(".pad-karte2--browser").count() == 0)
    r = pg.evaluate("""() => { const a=document.querySelector('.pad-karte2--abend').getBoundingClientRect(),
       b=document.querySelector('.pad-karte2--wartung').getBoundingClientRect();
       return {zeile: Math.abs(a.top-b.top)<2, gleich: Math.abs(a.width-b.width)<3}; }""")
    pruefe("Wartung neben Stück am Abend, gleich breit", r["zeile"] and r["gleich"])
    pruefe("Kachel: keine geplant", "keine geplant" in pg.locator(".pad-karte2--wartung").inner_text())

    # Ablegen ohne Termin
    pg.locator(".pad-karte2--wartung").click(); pg.wait_for_selector("#wartung")
    pg.set_input_files("#wartung-datei", files=[{"name": "Filter wechseln.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:last-child [data-ja]"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle:last-child [data-ja]"); pg.wait_for_timeout(800)
    zeilen = pg.evaluate("TEST.daten.pad_wartungen || []")
    pruefe("eine Wartung gespeichert", len(zeilen) == 1 and zeilen[0]["titel"] == "Filter wechseln"
           and zeilen[0]["art"] == "bild" and not zeilen[0].get("termin"))
    pruefe("Zeile zeigt kein Termin", "Kein Termin" in pg.locator("#wartung").inner_text())

    # Terminieren: eine Minute in der Vergangenheit
    pg.locator("[data-wartung-termin]").first.click(); pg.wait_for_timeout(400)
    pg.evaluate("""() => { const d = new Date(Date.now() - 60000), z = (n) => String(n).padStart(2, '0');
      const el = document.querySelector('.dialog-huelle:last-child input[type=datetime-local]');
      el.value = d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes()); }""")
    pg.click(".dialog-huelle:last-child [data-ja]"); pg.wait_for_timeout(800)
    pruefe("Termin gesetzt", bool(pg.evaluate("TEST.daten.pad_wartungen[0].termin")))
    pruefe("Zeile fällig mit Erledigt", pg.locator(".wartung__zeile--faellig [data-wartung-erledigt]").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-fenster.png"))
    pg.click("#wartung [data-zu]"); pg.wait_for_timeout(500)
    pruefe("Kachel fällig", pg.locator(".pad-karte2--wartung-faellig").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-kachel.png"))

    # Die Kacheln mahnen (Stückzeit, Stückzahl) – Wartung kommt trotzdem
    warten(pg, 61000)
    pruefe("Schoner zeigt die Wartung", pg.locator(SCHONER).count() == 1)
    pruefe("Bild im Schoner", pg.locator(SCHONER + " .pad-schoner__bild").count() == 1)
    pruefe("Titel oben", "Filter wechseln" in pg.locator(".pad-schoner__wartung-titel").inner_text())
    b = pg.locator("[data-wartung-erledigt-schoner]").bounding_box()
    pruefe("Erledigt unten in der Mitte", b and abs(b["x"] + b["width"] / 2 - 590) < 3 and b["y"] > 820 - 140)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-schoner.png"))

    # Tipp daneben: nur zurück, sie kommt wieder
    pg.locator("[data-padschonerzu]").click(position={"x": 200, "y": 300}); pg.wait_for_timeout(500)
    pruefe("Tipp daneben schliesst", pg.locator(SCHONER).count() == 0)
    pruefe("noch nicht erledigt", bool(pg.evaluate("TEST.daten.pad_wartungen[0].termin")))
    warten(pg, 61000)
    pruefe("kommt nach einer Minute wieder", pg.locator(SCHONER).count() == 1)

    pg.click("[data-wartung-erledigt-schoner]"); pg.wait_for_timeout(900)
    w = pg.evaluate("TEST.daten.pad_wartungen[0]")
    pruefe("Erledigt quittiert", pg.locator(SCHONER).count() == 0 and not w.get("termin") and w.get("erledigt_am"))
    warten(pg, 61000)
    pruefe("danach keine Wartung mehr im Schoner", pg.locator(SCHONER).count() == 0)
    pruefe("Kachel wieder ruhig", pg.locator(".pad-karte2--wartung-faellig").count() == 0)
    # Einstellungen → Wartung: dieselbe Liste, Maschine wählen, gross
    pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#pad [data-padzu], #pad .pad-schliessen') && document.querySelector('#pad [data-padzu], #pad .pad-schliessen').click()")
    pg.wait_for_timeout(500)
    if pg.locator("#pad").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.evaluate("TEST.daten.pad_wartungen[0].url = location.origin + '/icon-512.png'")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(700)
    pruefe("Reiter Wartung da", pg.locator("[data-einst='wartung']").count() == 1)
    pg.click("[data-einst='wartung']"); pg.wait_for_timeout(700)
    pg.click("[data-wartung-maschine='m-l1']"); pg.wait_for_timeout(800)
    pruefe("Wartung der Maschine in den Einstellungen", pg.locator(".es-wartung [data-wartung]").count() == 1)
    vb = pg.locator(".es-wartung .wartung__vorschau").first.bounding_box()
    print("Vorschau:", vb)
    pruefe("Vorschau gross", vb and vb["height"] >= 320 and vb["width"] >= 400)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-einstellungen.png"))
    pruefe("keine Seitenfehler", not f)
    if f: print(f[:3])
    br.close()
print("Fehler:", fehler[:5] if fehler else "keine")
