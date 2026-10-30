# Einrichtblatt in der App: freie Bilder (1.280.0). Bild einfügen (Knopf
# und Strg + V), frei verschieben, Grösse ändern, löschen; jede Änderung
# gleich gespeichert in kopf.bilder, auch beim Bearbeiten.
import time, json, base64, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnxEIGBgAHf4D/U8Qe3sAAAAASUVORK5CYII=")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => {
      const D = TEST.daten;
      D.einrichtblatt_app = [{ hoco_nr: '10000-0301', type_id: 't1', programme: { p1: 'O1234' }, kopf: { n1000: 'ja' }, seiten: [],
        plaetze: { T100: { taetigkeit: 'Abstechen' } }, bemerkung: 'Zange', gut_am: '2026-10-28T08:00:00Z' }];
      D.artikel_bild = []; D.eb_bilder = [];
    }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-neu='t1']").click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(600)
    kopf = lambda: pg.evaluate("TEST.daten.einrichtblatt_app[0].kopf")
    pruefe("Knopf Bild einfügen beim Ansehen", pg.locator("[data-eba-bild-neu]").count() == 1)
    pg.set_input_files("[data-eba-bild-datei]", files=[{"name": "foto.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector("[data-eba-fbild]"); pg.wait_for_timeout(500)
    k = kopf()
    print(json.dumps(k)[:300])
    pruefe("Gleich gespeichert in kopf.bilder", len(k.get("bilder", [])) == 1 and k.get("n1000") == "ja")
    pruefe("Hochgeladen unter einrichtblatt/frei/", pg.evaluate("TEST.protokoll.some(x => x.art === 'upload' && /^einrichtblatt\\/frei\\//.test(x.pfad))"))
    b0 = k["bilder"][0]
    el = pg.locator("[data-eba-fbild]")
    box = el.bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down(); pg.mouse.move(box["x"] + box["width"] / 2 - 200, box["y"] + box["height"] / 2 - 100, steps=8); pg.mouse.up()
    pg.wait_for_timeout(500)
    b1 = kopf()["bilder"][0]
    pruefe("Verschoben und gespeichert", b1["x"] < b0["x"] - 10 and b1["y"] < b0["y"] - 5)
    pruefe("Gewählt: Löschen und Grösse", pg.locator("[data-eba-fbild-weg]").count() == 1 and pg.locator("[data-eba-fbild-gross]").count() == 1)
    g = pg.locator("[data-eba-fbild-gross]").bounding_box()
    pg.mouse.move(g["x"] + 5, g["y"] + 5); pg.mouse.down(); pg.mouse.move(g["x"] + 160, g["y"] + 60, steps=8); pg.mouse.up()
    pg.wait_for_timeout(500)
    b2 = kopf()["bilder"][0]
    pruefe("Grösser und gespeichert", b2["w"] > b1["w"] + 8 and b2["x"] == b1["x"])
    pruefe("Rückgängig gemerkt", pg.evaluate("JSON.stringify(JSON.parse(sessionStorage.getItem('hofer.rueckgaengig') || '[]')).includes('Bild auf Einrichtblatt')"))
    # Strg + V
    pg.evaluate("""(b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([u], 'kopie.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }""", base64.b64encode(PNG).decode())
    pg.wait_for_timeout(800)
    pruefe("Strg + V fügt ein", len(kopf()["bilder"]) == 2 and pg.locator("[data-eba-fbild]").count() == 2)
    # Bearbeiten: Bilder bleiben, verschieben speichert auch dort gleich, Speichern behält sie
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(500)
    pruefe("Im Bearbeiten sichtbar", pg.locator("[data-eba-fbild]").count() == 2 and pg.locator("[data-eba-bild-neu]").count() == 1)
    e2 = pg.locator("[data-eba-fbild]").nth(1).bounding_box()
    pg.mouse.move(e2["x"] + e2["width"] / 2, e2["y"] + e2["height"] / 2)
    pg.mouse.down(); pg.mouse.move(e2["x"] + e2["width"] / 2 + 150, e2["y"] + e2["height"] / 2 + 80, steps=8); pg.mouse.up()
    pg.wait_for_timeout(500)
    pruefe("Im Bearbeiten gleich gespeichert", kopf()["bilder"][1]["x"] > 50)
    pruefe("Kein Platzfenster durch das Bild", pg.locator("[data-platzfenster]").count() == 0)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(800)
    pruefe("Nach Speichern noch beide", len(kopf()["bilder"]) == 2 and pg.locator("[data-eba-fbild]").count() == 2)
    pg.screenshot(path="eb_freie_bilder.png")
    # Löschen mit einer Rückfrage
    pg.locator("[data-eba-fbild]").nth(0).click(); pg.wait_for_timeout(200)
    pg.click("[data-eba-fbild-weg]"); pg.wait_for_selector(".dialog:has-text('Bild löschen')")
    pg.locator(".dialog:has-text('Bild löschen') [data-ja]").click(); pg.wait_for_timeout(500)
    pruefe("Gelöscht", len(kopf()["bilder"]) == 1 and pg.locator("[data-eba-fbild]").count() == 1)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
