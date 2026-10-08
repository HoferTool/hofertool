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

    # ---------- Symbol vergeben ----------
    el = pg.locator(f".pw-balken[data-auftrag='{mit}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Fenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Kein Plus für neue Farbe", pg.locator("#pl-farbneu").count() == 0)
    pruefe("Keine Späne im Fenster", "Späne" not in pg.inner_text(".dialog--auftrag"))
    pruefe("Symbol zur Wahl", pg.locator("[data-plsymbolwahl='sKack']").count() == 1)
    pg.click("[data-plsymbolwahl='sKack']")
    if pg.locator("#pl-abruf").count() and not pg.input_value("#pl-abruf"): pg.fill("#pl-abruf", "je 1000 Stk KW 44")
    pg.screenshot(path="/tmp/symbol_fenster.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1400)
    pruefe("Symbol gespeichert", pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).symbole", mit) == "sKack")
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
    pg.mouse.move(10, 10); pg.wait_for_timeout(300)
    pruefe("Fenster des Symbols wieder weg", pg.locator(".pw-symbolinfo").count() == 0)

    # ---------- Plus-Knopf ----------
    vorlage = pg.evaluate("""() => { const j = TEST.daten.planwand.find(j => j.job_number && !j.ended_at && j.planned_days > 2);
      return { nr: j.job_number, m: j.machine_id, tage: j.planned_days }; }""")
    pruefe("Plus-Knopf da", pg.locator("#pw-neu").count() == 1)
    pg.click("#pw-neu"); pg.wait_for_timeout(700)
    pruefe("Neuer Auftrag offen", "Neuer Auftrag" in pg.inner_text(".dialog--auftrag h2"))
    pruefe("Maschine leer", pg.input_value("#pl-maschine") == "")
    pruefe("Ab leer", pg.input_value("#pl-von") == "")
    pruefe("Hinweis Ende der Maschine", pg.locator("#pl-ans-ende").count() == 1)
    pg.click("#pl-ja"); pg.wait_for_timeout(400)
    pruefe("Ohne Maschine nicht gespeichert", pg.locator(".dialog--auftrag").count() == 1)
    pg.fill("#pl-nr", vorlage["nr"]); pg.wait_for_timeout(1500)
    print("     übernommen:", pg.inner_text("#pl-hoco-info"))
    pruefe("Maschine vom letzten Auftrag", pg.input_value("#pl-maschine") == vorlage["m"])
    pruefe("Dauer vom letzten Auftrag", pg.input_value("#pl-tage") == str(vorlage["tage"]))
    if pg.locator("#pl-abruf").count(): pg.fill("#pl-abruf", "je 1000 Stk KW 44, 45")
    pg.screenshot(path="/tmp/plus_auftrag.png")
    anzahl = pg.evaluate("TEST.daten.planwand.length")
    ende = pg.evaluate("""(m) => { let e = ''; TEST.daten.planwand.filter(j => j.machine_id === m && j.planned_from && j.plan_status !== 'fertig')
      .forEach(j => { if (j.planned_from > e) e = j.planned_from; }); return e; }""", vorlage["m"])
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    neu = pg.evaluate("(n) => TEST.daten.planwand.slice(n)", anzahl)
    pruefe("Auftrag angelegt", len(neu) == 1 and neu[0]["job_number"] == vorlage["nr"])
    if neu:
        print("     eingeplant ab", neu[0].get("planned_from"), "letzter Beginn bisher", ende)
        pruefe("Ans Ende der Maschine", (neu[0].get("planned_from") or "") > ende)

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
