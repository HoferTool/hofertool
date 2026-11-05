# Einrichtblatt in der App: Schrift (Farbe, Dünn/Fett, Grösse) für alle
# Texte (1.402.0): Zeilen im Werkzeugfeld, Kopf, Bemerkung; Notiz heisst
# „Notiz Mitte“.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
def stil(pg, sel):
    return pg.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return [c.color, c.webkitTextFillColor, Number(c.fontWeight), parseFloat(c.fontSize)]; }", sel)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("() => { TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = []; }")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Schriftzeile mit Hinweis", pg.locator("[data-eba-schriftzeile='']").count() == 1)
    # Platz: Tätigkeit blau und dünn
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    pruefe("Notiz heisst Notiz Mitte", "Notiz Mitte" in pf.inner_text() and "Geo-Offset" not in pf.inner_text())
    pf.locator("[data-pf='taetigkeit']").fill("Abstechen")
    pf.locator("[data-pf='mass']").fill("Ø12")
    pf.locator("[data-pf='taetigkeit']").focus()
    pruefe("Ziel springt auf Tätigkeit", pf.locator("[data-pf-ziel='taetigkeit'].aktiv").count() == 1)
    pruefe("Tätigkeit standardmässig fett", pf.locator("[data-pf-geodicke='fett'].aktiv").count() == 1)
    pf.locator("[data-pf-geofarbe]").nth(2).click()
    farbe = pf.locator("[data-pf-geofarbe]").nth(2).get_attribute("data-pf-geofarbe")
    pf.locator("[data-pf-geodicke='duenn']").click()
    pf.locator("[data-pf-ziel='mass']").click()
    pf.locator("[data-pf-geogr='plus']").click()
    pruefe("Mass Grösse 13", pf.locator("[data-pf-geogr-wert]").inner_text() == "13")
    pf.screenshot(path=os.path.join(BILD, "eb_schrift_platz.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    s = stil(pg, "[data-platz='T100'] .eba-tat")
    print("Tätigkeit", s, farbe)
    pruefe("Tätigkeit auf dem Blatt dünn und farbig", s and s[2] == 400 and s[0] != "rgb(0, 0, 0)")
    m = stil(pg, "[data-platz='T100'] .eba-mass")
    pruefe("Mass 13 px", m and abs(m[3] - 13) < 0.01)
    # Kopf: HOCO-Feld bzw. erstes Eingabefeld rot und fett
    ein = pg.locator("[data-eba-kopf] input.eba-ein").first
    fid = ein.get_attribute("data-eba-feld")
    ein.click(); pg.wait_for_timeout(200)
    pruefe("Schriftzeile zeigt Feld", pg.locator(f"[data-eba-schriftzeile='{fid}']").count() == 1)
    z = pg.locator("[data-eba-schriftzeile]")
    z.locator("[data-pf-geofarbe='#e03030']").click()
    z.locator("[data-pf-geodicke='fett']").click()
    z.locator("[data-pf-geogr='plus']").click()
    k = stil(pg, f"[data-eba-kopf] [data-eba-feld='{fid}']")
    print("Kopf", fid, k)
    pruefe("Kopffeld rot, fett, 13", k and k[1] == "rgb(224, 48, 48)" and k[2] >= 700 and abs(k[3] - 13) < 0.01)
    # Bemerkung grün
    pg.locator("[data-eba-feld='blatt:bemerkung']").fill("Abgreifen mit Zange")
    pg.locator("[data-eba-feld='blatt:bemerkung']").click()
    pruefe("Schriftzeile Bemerkung", "Bemerkung" in z.inner_text())
    z.locator("[data-pf-geofarbe]").nth(3).click()
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_schrift_blatt.png"))
    pg.screenshot(path=os.path.join(BILD, "eb_schrift_ganz.png"))
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    t1 = b["plaetze"]["T100"]; sch = (b.get("kopf") or {}).get("schrift") or {}
    print(t1.get("stil"), sch)
    pruefe("Platzstil gespeichert", (t1.get("stil") or {}).get("taetigkeit", {}).get("fett") is False
           and (t1.get("stil") or {}).get("mass", {}).get("groesse") == 13)
    pruefe("Kopfschrift gespeichert", sch.get(fid, {}).get("farbe") == "#e03030" and sch.get(fid, {}).get("fett") is True
           and sch.get(fid, {}).get("groesse") == 13 and "farbe" in sch.get("blatt:bemerkung", {}))
    # nach dem Speichern auf dem Blatt (Ansicht)
    pg.wait_for_timeout(500)
    bem = stil(pg, "[data-eba-seite] .eba-bem")
    print("Bemerkung Ansicht", bem)
    pruefe("Bemerkung in der Ansicht farbig", bem and bem[1] not in ("rgb(0, 0, 0)",))
    # dunkler Modus: Farbe bleibt
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    s2 = stil(pg, "[data-platz='T100'] .eba-tat")
    pruefe("Dunkel: Farbe bleibt", s2 and s2[1] == s[1])
    br.close()
print("Fehler:", fehler or "keine")
