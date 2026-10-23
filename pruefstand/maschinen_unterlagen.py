# Unterlagen zu den Maschinen (1.105.0, Wunsch Patrick 19. Oktober 2026):
# Produktion → Maschinen → „Unterlagen“: Admin lädt ein Handbuch für alle
# Maschinen des Typs und ein Schema nur für die Maschine hoch; im Pad
# Mode an der Maschine zeigt „Unterlagen“ dasselbe; Ändern, Löschen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("MU_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"

def hochladen(pg, name, fuer):
    with pg.expect_file_chooser() as fc:
        pg.click("#unterlagen-neu")
    fc.value.set_files(files=[{"name": name, "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_selector(".dialog-huelle select"); pg.wait_for_timeout(200)
    sel = pg.locator(".dialog-huelle select")
    if fuer and sel.count() > 1: sel.nth(1).select_option(fuer)
    pg.locator(".dialog-huelle button:has-text('Hochladen')").last.click(); pg.wait_for_timeout(1000)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1280, "height": 860}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(700); pg.click("[data-unter='maschinen/verwalten']"); pg.wait_for_selector("#park-reiter")
    knopf = pg.locator("[data-masch-unterlagen]")
    pruefe(knopf.count() > 0, "Knopf Unterlagen bei den Maschinen")
    mid = knopf.first.get_attribute("data-masch-unterlagen")
    knopf.first.click(); pg.wait_for_selector("#unterlagen"); pg.wait_for_timeout(500)
    pruefe("Noch keine Unterlagen" in pg.locator("#unterlagen").inner_text(), "leer am Anfang")

    hochladen(pg, "SR20_Bedienungsanleitung.pdf", "typ")
    hochladen(pg, "Elektroschema_K2001.pdf", None)
    d = pg.evaluate("() => TEST.daten.maschinen_unterlagen")
    pruefe(len(d) == 2, "zwei Einträge gespeichert: %d" % len(d))
    hb = [x for x in d if x["art"] == "handbuch"]
    el = [x for x in d if x["art"] == "elektro"]
    pruefe(hb and hb[0]["type_id"] and not hb[0]["machine_id"], "Handbuch gilt für den Typ, Art erraten")
    pruefe(el and el[0]["machine_id"] == mid and not el[0]["type_id"], "Schema nur für diese Maschine, Art erraten")
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload').map(x => x.pfad)")
    pruefe(len(up) == 2 and all(x.startswith("maschinen/") for x in up), "Dateien in maschinen/: %s" % up)
    t = pg.locator("#unterlagen").inner_text().lower()
    pruefe("handbuch" in t and "elektroschema" in t and "nur diese maschine" in t, "Liste nach Art gruppiert")
    pg.screenshot(path=os.path.join(BILD, "unterlagen-produktion.png"))

    # Ändern
    pg.locator(f"[data-unterlage-aendern='{el[0]['id']}']").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle").last.locator("input").first.fill("Schaltplan K-2001")
    pg.locator(".dialog-huelle").last.locator(".dialog__knoepfe button").last.click(); pg.wait_for_timeout(800)
    pruefe("Schaltplan K-2001" in pg.locator("#unterlagen").inner_text(), "umbenannt")
    # Gilt für ändern: von „nur diese Maschine“ auf „alle vom Typ“ und zurück
    pg.locator(f"[data-unterlage-aendern='{el[0]['id']}']").click(); pg.wait_for_timeout(400)
    sel = pg.locator(".dialog-huelle").last.locator("select")
    pruefe(sel.count() == 2 and sel.nth(1).input_value() == "maschine", "Ändern zeigt „Gilt für“")
    sel.nth(1).select_option("typ")
    pg.locator(".dialog-huelle").last.locator(".dialog__knoepfe button").last.click(); pg.wait_for_timeout(800)
    u = pg.evaluate("(id) => TEST.daten.maschinen_unterlagen.find(x => x.id === id)", el[0]["id"])
    pruefe(u["type_id"] and not u["machine_id"], "jetzt für alle vom Typ")
    pg.locator(f"[data-unterlage-aendern='{el[0]['id']}']").click(); pg.wait_for_timeout(400)
    sel = pg.locator(".dialog-huelle").last.locator("select")
    pruefe(sel.nth(1).input_value() == "typ", "Ändern zeigt „alle vom Typ“")
    sel.nth(1).select_option("maschine")
    pg.locator(".dialog-huelle").last.locator(".dialog__knoepfe button").last.click(); pg.wait_for_timeout(800)
    u = pg.evaluate("(id) => TEST.daten.maschinen_unterlagen.find(x => x.id === id)", el[0]["id"])
    pruefe(u["machine_id"] == mid and not u["type_id"], "wieder nur diese Maschine")

    # Öffnen im Betrachter
    pg.locator(".unterlagen__oeffnen").first.click(); pg.wait_for_timeout(1000)
    pruefe(pg.locator(".betrachter-huelle").count() == 1, "öffnet im Betrachter")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Pad Mode an derselben Maschine
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.evaluate("(id) => { const m = (window.TEST.daten.machines || []).find(x => x.id === id); return m; }", mid)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for elp in pg.query_selector_all("#pad [data-park]"):
        if "Kurz" in (elp.inner_text() or ""): elp.click(); break
    pg.wait_for_timeout(1200)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)
    pk = pg.locator("[data-padunterlagen]")
    pruefe(pk.count() == 1, "Knopf Unterlagen im Pad")
    if pk.count():
        pk.click(); pg.wait_for_selector("#unterlagen"); pg.wait_for_timeout(600)
        t2 = pg.locator("#unterlagen").inner_text()
        pruefe("Bedienungsanleitung" in t2, "Pad zeigt Handbuch des Typs: %r" % t2[:200])
        pg.screenshot(path=os.path.join(BILD, "unterlagen-pad.png"))
        # Löschen mit einer Rückfrage
        pg.locator("[data-unterlage-weg]").first.click(); pg.wait_for_timeout(300)
        pg.locator(".dialog-huelle button:has-text('Löschen')").last.click(); pg.wait_for_timeout(800)
        pruefe(len(pg.evaluate("() => TEST.daten.maschinen_unterlagen")) == 1, "gelöscht")
    pruefe(not pf, "keine Seitenfehler %s" % pf)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
