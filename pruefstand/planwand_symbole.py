# Planwand (111.103.0, Wunsch Patrick 8. Oktober 2026):
#  - rotes M statt Geplant-Kreis, solange keine Materialmenge dasteht
#  - Plus-Knopf: ganz leerer Auftrag, die HOCO Nr. holt die Maschine
#    vom letzten Auftrag, ohne Datum ans Ende der Maschine
#  - Symbole aus Einstellungen → Symbole am Balken, mit Fenster beim
#    Darüberfahren; keine neue Farbe mehr im Auftragsfenster
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    # Wie nach sql/plan-symbole.sql, mit einem angelegten Symbol; ein
    # geplanter Auftrag ohne Materialmenge, einer mit
    pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
      TEST.daten.planwand.forEach(j => { if (!('symbole' in j)) j.symbole = null; });
      const g = TEST.daten.planwand.filter(j => j.plan_status === 'geplant' && !j.ended_at);
      g[0].material_menge = null; g[0].id_test = 'ohne';
      g[1].material_menge = '40 kg';
      TEST.daten.app_config.push({ schluessel: 'plan_symbole',
        wert: JSON.stringify([{ id: 'sKack', bild: '""" + PNG + """', text: 'Kack Teili' }]) });
      clearInterval(t); } }, 5); })();""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)

    # ---------- M statt Kreis ----------
    ohne, mit = pg.evaluate("""() => { const g = TEST.daten.planwand.filter(j => j.plan_status === 'geplant' && !j.ended_at);
      return [g[0].id, g[1].id]; }""")
    zeichen = lambda jid: pg.evaluate("""(id) => { const b = document.querySelector(`.pw-balken[data-auftrag='${id}'] .pw-balken__statusgross`);
      return b ? { m: !!b.querySelector('.pw-msymbol'), t: b.textContent.trim() } : null; }""", jid)
    z1, z2 = zeichen(ohne), zeichen(mit)
    print("     ohne Menge:", z1, " mit Menge:", z2)
    pruefe("Ohne Materialmenge rotes M", bool(z1) and z1["m"] and "●" not in z1["t"])
    pruefe("Mit Materialmenge normaler Kreis", bool(z2) and not z2["m"] and z2["t"] == "○")
    hg = pg.evaluate("""(id) => getComputedStyle(document.querySelector(`.pw-balken[data-auftrag='${id}'] .pw-msymbol rect`)).fill""", ohne)
    pruefe("M auf weissem Feld", "255, 255, 255" in hg or hg == "#fff" or hg == "rgb(255, 255, 255)")

    # ---------- Symbol vergeben: Smiley → Anwenden → Balken ----------
    el = pg.locator(f".pw-balken[data-auftrag='{mit}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Fenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Kein Plus für neue Farbe", pg.locator("#pl-farbneu").count() == 0)
    pruefe("Keine Späne im Fenster", "Späne" not in pg.inner_text(".dialog--auftrag"))
    pruefe("Nichts von Symbolen im Auftragsfenster", pg.locator("#pl-symbole").count() == 0
           and "Symbol" not in pg.inner_text(".dialog--auftrag"))
    pg.click("#pl-nein"); pg.wait_for_timeout(500)
    pruefe("Smiley-Knopf da", pg.locator("#pw-symbole").count() == 1)
    pg.click("#pw-symbole"); pg.wait_for_timeout(700)
    pruefe("Fenster Symbole offen", pg.locator(".dialog--symbole #sym-liste [data-symbol='sKack']").count() == 1)
    pruefe("Dort Symbol anlegen möglich", pg.locator(".dialog--symbole #sym-anlegen").count() == 1)
    pg.screenshot(path="/tmp/symbole_fenster.png")
    pg.click("[data-symanwenden='sKack']"); pg.wait_for_timeout(500)
    pruefe("Fenster zu, Leiste da", pg.locator(".dialog--symbole").count() == 0
           and pg.locator("#symbol-leiste").count() == 1 and "Kack Teili" in pg.inner_text("#symbol-leiste"))
    pg.screenshot(path="/tmp/symbol_anwenden.png")
    el = pg.locator(f".pw-balken[data-auftrag='{mit}']").first
    el.scroll_into_view_if_needed(); el.click(); pg.wait_for_timeout(1400)
    pruefe("Symbol gespeichert", pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).symbole", mit) == "sKack")
    pruefe("Leiste weg, kein Fenster offen", pg.locator("#symbol-leiste").count() == 0 and pg.locator(".dialog-huelle").count() == 0)
    pg.wait_for_selector(f".pw-balken[data-auftrag='{mit}'] .pw-balken__symbol", timeout=5000)
    sym = pg.locator(f".pw-balken[data-auftrag='{mit}'] .pw-balken__symbol").first
    pruefe("Symbol steht hinter der Nummer", pg.evaluate("""(id) => { const s = document.querySelector(`.pw-balken[data-auftrag='${id}'] .pw-balken__symbol`);
      return !!s && s.previousElementSibling && s.previousElementSibling.classList.contains('pw-balken__nr'); }""", mit))
    # Darüberfahren: Fenster mit Erklärung, keine Schnellvorschau
    bx = sym.bounding_box()
    pg.mouse.move(bx["x"] - 30, bx["y"] + bx["height"] / 2); pg.wait_for_timeout(200)
    pg.mouse.move(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2, steps=4); pg.wait_for_timeout(400)
    pruefe("Fenster des Symbols", pg.locator(".pw-symbolinfo").count() == 1
           and "Kack Teili" in pg.inner_text(".pw-symbolinfo"))
    pruefe("Schnellvorschau weg", pg.locator(".pw-info").count() == 0)
    pg.screenshot(path="/tmp/symbol_hover.png")
    # Ein Klick aufs Symbol öffnet nichts, Doppelklick nimmt es weg
    sym.click(); pg.wait_for_timeout(700)
    pruefe("Ein Klick aufs Symbol öffnet nichts", pg.locator(".dialog-huelle, .betrachter").count() == 0)
    pruefe("Symbol noch da", pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).symbole", mit) == "sKack")
    sym = pg.locator(f".pw-balken[data-auftrag='{mit}'] .pw-balken__symbol").first
    sym.click(); pg.wait_for_timeout(80); sym.click(); pg.wait_for_timeout(1400)
    pruefe("Doppelklick entfernt das Symbol", pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).symbole", mit) in (None, ""))
    pruefe("Kein Auftragsfenster aufgegangen", pg.locator(".dialog--auftrag").count() == 0)
    pruefe("Symbol vom Balken weg", pg.locator(f".pw-balken[data-auftrag='{mit}'] .pw-balken__symbol").count() == 0)
    pg.mouse.move(10, 10); pg.wait_for_timeout(300)

    # ---------- Plus-Knopf ist weg (Wunsch Patrick, 9. Oktober 2026) ----------
    pruefe("Kein Plus-Knopf für neuen Auftrag", pg.locator("#pw-neu").count() == 0)
    pruefe("Smiley-Knopf bleibt", pg.locator("#pw-symbole").count() == 1)

    # ---------- Einstellungen → Symbole ----------
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(600)
    pg.evaluate("window.einstellungenOeffnen ? einstellungenOeffnen() : null")
    if pg.locator(".dialog--einstellungen").count() == 0:
        pg.locator("[data-einstellungen], #einstellungen-knopf, [title='Einstellungen']").first.click()
    pg.wait_for_selector(".dialog--einstellungen"); pg.wait_for_timeout(300)
    pg.locator("[data-einst='symbole']").click(); pg.wait_for_timeout(700)
    pruefe("Reiter Symbole zeigt das Symbol", pg.locator("#sym-liste [data-symbol='sKack']").count() == 1)
    pruefe("Kein SQL-Hinweis mit Spalte", pg.locator("#sym-sql").count() == 0)
    feld = pg.locator("#sym-liste [data-symbol='sKack'] input")
    feld.fill("Kack Teili, vorsichtig"); feld.press("Enter"); pg.wait_for_timeout(700)
    gesp = pg.evaluate("JSON.parse(TEST.daten.app_config.find(z => z.schluessel === 'plan_symbole').wert)[0].text")
    pruefe("Erklärung geändert", gesp == "Kack Teili, vorsichtig")
    pg.screenshot(path="/tmp/symbole_einstellungen.png")
    pg.locator("[data-einst='farben']").click(); pg.wait_for_timeout(1200)
    pruefe("Keine Späne in Farben und Material", "Späne" not in pg.inner_text("#einst-inhalt"))
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
