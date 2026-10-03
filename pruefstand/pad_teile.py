# Pad: Zifferblock (Tasten, Tastatur, Escape), Werkzeugwechsel (antippen,
# Stückzahl, Eintrag) mit Historie, Betrachter (Ansehen, Schliessen, Escape)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.dokumente = [{ id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Probe',
  dateiname: 'probe.pdf', datei_url: 'https://x.invalid/probe.pdf', erstellt_am: '2026-09-30T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 830}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://x.invalid/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    # Langdreher: Deren Typ hat Werkzeugplätze
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")

    # Zifferblock: Tasten, Tastatur, Rücktaste
    pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector("[data-zbja]")
    pg.click("[data-zb='C']")
    pruefe("Leer zeigt 0", pg.inner_text("#zb-anzeige") == "0" and pg.locator(".zb-anzeige--leer").count() == 1)
    for t in "12": pg.click(f"[data-zb='{t}']")
    pg.keyboard.type("345"); pg.keyboard.press("Backspace")
    pruefe("Tasten und Tastatur zusammen", pg.inner_text("#zb-anzeige").replace("’", "'") == "1'234")
    # Escape schliesst nur den Zifferblock, das Pad bleibt auf der Maschine
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape schliesst den Zifferblock", pg.locator("[data-zbja]").count() == 0)
    pruefe("Pad bleibt auf der Maschine", pg.locator("#pad .pad-stk-zahl").count() == 1)
    pruefe("Nichts gespeichert", not pg.evaluate("TEST.daten.production_records.some(z => z.quantity === 1234)"))
    # Enter trägt ein
    pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector("[data-zbja]")
    pg.click("[data-zb='C']"); pg.keyboard.type("777"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pruefe("Enter trägt ein", pg.locator("[data-zbja]").count() == 0
           and pg.evaluate("TEST.daten.production_records.some(z => z.quantity === 777)"))

    # Werkzeugwechsel
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-tool]")
    werkzeuge = pg.locator("[data-tool]")
    pruefe("Werkzeugplätze da", werkzeuge.count() >= 2)
    weiter = pg.locator("[data-wzweiter]")
    pruefe("Weiter erst nach Auswahl", weiter.is_disabled())
    werkzeuge.nth(0).click(); werkzeuge.nth(1).click(); werkzeuge.nth(1).click(); werkzeuge.nth(1).click()
    pruefe("Auswahl zählt", weiter.inner_text() == "Weiter · 2" and pg.locator(".wz-platz--an").count() == 2)
    tools = [werkzeuge.nth(0).get_attribute("data-tool"), werkzeuge.nth(1).get_attribute("data-tool")]
    weiter.click(); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").first.fill("5000"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    zeilen = pg.evaluate("(TEST.daten.tool_changes || []).map(z => z.tool_nr + ':' + z.stueckzahl)")
    print("Wechsel:", zeilen)
    pruefe("Wechsel eingetragen", sorted(zeilen) == sorted([t + ":5000" for t in tools]))
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-wzhistorie]")
    pg.click("[data-wzhistorie]"); pg.wait_for_timeout(900)
    pruefe("Historie offen", "Werkzeugwechsel ·" in pg.inner_text(".dialog-huelle"))
    pg.click(".dialog-huelle [data-zu]"); pg.wait_for_timeout(300)
    pruefe("Historie zu, Pad noch da", pg.locator(".dialog-huelle").count() == 0 and pg.locator("#pad .pad-stk-zahl").count() == 1)

    # Betrachter (über Einstellungen → Dokumente → Ansehen)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")
    pg.locator("[data-dokauf]").first.click(); pg.wait_for_selector(".betrachter-huelle")
    # Die Datei ist hier nicht erreichbar: Rückfall auf die Anzeige des Browsers
    pg.wait_for_selector(".betrachter iframe")
    pruefe("Betrachter mit PDF in voller Breite", "view=FitH" in pg.get_attribute(".betrachter iframe", "src"))
    pruefe("Neuer Tab zeigt auf die Datei", pg.get_attribute(".betrachter a", "href") == "https://x.invalid/probe.pdf")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst nur den Betrachter", pg.locator(".betrachter-huelle").count() == 0
           and pg.locator(".dialog--einstellungen").count() == 1)
    pg.locator("[data-dokauf]").first.click(); pg.wait_for_selector(".betrachter-huelle")
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(300)
    pruefe("Schliessen-Knopf", pg.locator(".betrachter-huelle").count() == 0)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
