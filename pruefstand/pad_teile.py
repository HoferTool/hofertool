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
    pg.click("#pad [data-padfeld='stand']", force=True); pg.wait_for_selector("[data-zbja]")
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
    pg.click("#pad [data-padfeld='stand']", force=True); pg.wait_for_selector("[data-zbja]")
    pg.click("[data-zb='C']"); pg.keyboard.type("777"); pg.keyboard.press("Enter"); pg.wait_for_timeout(600); pg.locator(".dialog-huelle [data-w='ja']").click() if pg.locator(".dialog-huelle [data-w='ja']").count() else None; pg.wait_for_timeout(1500)
    pruefe("Enter trägt ein", pg.locator("[data-zbja]").count() == 0
           and pg.evaluate("TEST.daten.production_records.some(z => z.quantity === 777)"))

    # Werkzeugwechsel: dieselbe Nummer auf zwei Paths (wie bei Index)
    pg.evaluate("TEST.daten.type_slots.push({ id: 'sl9', path_id: 'pa2', bezeichnung: 'Drehstahl R2', kind_id: 'k1', platz_nr: 2, tool_nr: 'T100', werkzeuge: 1, sortierung: 2 })")
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-tool]")
    werkzeuge = pg.locator("[data-tool]")
    pruefe("Werkzeugplätze da", werkzeuge.count() >= 2)
    reihe = pg.evaluate("[...document.querySelectorAll('[data-tool]')].map(b => b.dataset.tool)")
    print("Reihenfolge:", reihe)
    pruefe("Nach Path, darin Nummer klein zu gross", reihe == ["T100", "T200", "T100", "T3100"])
    weiter = pg.locator("[data-wzweiter]")
    pruefe("Weiter erst nach Auswahl", weiter.is_disabled())
    werkzeuge.nth(0).click(); werkzeuge.nth(1).click(); werkzeuge.nth(1).click(); werkzeuge.nth(1).click()
    pruefe("Auswahl zählt", weiter.inner_text() == "Weiter · 2" and pg.locator(".wz-platz--an").count() == 2)
    pruefe("T100 nur auf einem Path an", pg.locator("[data-tool='T100']").count() == 2
           and pg.locator("[data-tool='T100'].wz-platz--an").count() == 1)
    tools = [werkzeuge.nth(0).get_attribute("data-tool"), werkzeuge.nth(1).get_attribute("data-tool")]
    weiter.click(); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").first.fill("5000"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    zeilen = pg.evaluate("(TEST.daten.tool_changes || []).map(z => z.tool_nr + ':' + z.stueckzahl)")
    print("Wechsel:", zeilen)
    pruefe("Wechsel eingetragen", sorted(zeilen) == sorted([t + ":5000" for t in tools]))
    pruefe("Path mitgespeichert", pg.evaluate("TEST.daten.tool_changes.find(z => z.tool_nr === 'T100').bezeichnung") == "Path 1")
    pg.evaluate("TEST.daten.type_slots = TEST.daten.type_slots.filter(s => s.id !== 'sl9')")
    # PDF der Historie: Je Werkzeug nach Path, darin Nummern klein zu gross
    pg.evaluate("""(() => { const v = TEST.daten.tool_changes[0];
      [['T10', 'Path 3'], ['T2', 'Path 3'], ['T20', 'Path 1']].forEach(([nr, p], i) =>
        TEST.daten.tool_changes.push(Object.assign({}, v, { id: 'extra' + i, tool_nr: nr, bezeichnung: p,
          gewechselt_am: '2026-10-01T08:00:00Z', stueckzahl: 100 }))); })()""")
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-wzhistorie]")
    pg.click("[data-wzhistorie]"); pg.wait_for_timeout(900)
    with pg.context.expect_page() as neu_info:
        pg.click("[data-wzpdf]")
    blatt = neu_info.value; blatt.wait_for_timeout(500)
    blatt.wait_for_selector(".wzblatt")
    kopf = blatt.evaluate("[...document.querySelectorAll('.wzblatt thead th.wz')].map(t => t.textContent)")
    print("PDF Spalten:", kopf)
    pruefe("PDF wie Plattenwechsel: Spalten nach Path und Nummer", kopf == ["T20", "T100", "T200", "T2", "T10"])
    pruefe("PDF: Datum, Stück, Bemerkung, Visum", blatt.evaluate(
        "[...document.querySelectorAll('.wzblatt thead th:not(.wz)')].map(t => t.textContent).join('|')")
        == "Datum:|Stück:|Bemerkung:|Visum:")
    xe = blatt.evaluate("[...document.querySelectorAll('.wzblatt tbody tr')].map(r => [...r.querySelectorAll('td.wz')].map(t => t.textContent).join(''))")
    pruefe("PDF: Wechsel als X", xe[0] == "XXX" and xe[1] == "XX")
    pruefe("PDF: leere Zeilen zum Ausfüllen", len(xe) == 36 and xe[-1] == "")
    pruefe("PDF: HOCO Nr. oben", blatt.locator(".hoco").count() == 1)
    import os
    if os.environ.get("WZ_BLATT_PDF"): blatt.pdf(path=os.environ["WZ_BLATT_PDF"], prefer_css_page_size=True, print_background=True)
    blatt.close(); pg.wait_for_timeout(600)
    pg.evaluate("TEST.daten.tool_changes = TEST.daten.tool_changes.filter(z => !String(z.id).startsWith('extra'))")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-wzhistorie]")
    pg.click("[data-wzhistorie]"); pg.wait_for_timeout(900)
    pruefe("Historie offen", "Werkzeugwechsel ·" in pg.inner_text(".dialog-huelle"))
    # Beim Star steht die Historie als Blatt da; seit 1.273.0 ohne Liste,
    # gelöscht wird direkt im Blatt
    pruefe("keine Liste mehr", pg.locator("[data-wzliste], [data-wzweg]").count() == 0)
    pruefe("Löschknopf im Blatt", pg.locator("[data-wzbweg]").count() >= 1)
    # Ein Werkzeug einer Runde mit zwei Werkzeugen herausnehmen: X antippen
    pg.locator("[data-wzbx]").first.click(); pg.wait_for_timeout(900)
    rest = pg.evaluate("(TEST.daten.tool_changes || []).map(z => z.tool_nr)")
    pruefe("Nur ein Werkzeug gelöscht", len(rest) == 1)
    pruefe("Blatt zeigt noch eins", pg.locator("[data-wzbx]").count() == 1)
    # Ganzen Wechsel: eine Nachfrage, Abbrechen lässt ihn stehen
    pg.locator("[data-wzbweg]").first.click(); pg.wait_for_selector("[data-ja]")
    pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(400)
    pruefe("Abbrechen löscht nicht", pg.evaluate("TEST.daten.tool_changes.length") == 1)
    pg.locator("[data-wzbweg]").first.click(); pg.wait_for_selector("[data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    pruefe("Letzter Eintrag gelöscht", pg.evaluate("TEST.daten.tool_changes.length") == 0
           and pg.locator("[data-wzbx]").count() == 0)
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
