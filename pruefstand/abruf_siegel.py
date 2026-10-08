# Abrufinformation und Siegel (111.100.0, Wunsch Patrick 8. Oktober 2026):
# Feld "Abrufinformation" unter Zustand/FA/Menge, Pflicht für neue
# Aufträge (mit SQL), ältere dürfen leer bleiben. Siegel (Kürzel von
# geplant_von) neben der HOCO Nr. in Schnellvorschau und Fenster, nicht
# auf dem Balken. Schnellvorschau in der gewünschten Reihenfolge.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def balken_finden(pg):
    return pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 60 && b.getBoundingClientRect().y > 200); return b && b.dataset.auftrag; }""")

def oeffnen(pg, jid):
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)

def neu_oeffnen(pg):
    ziel = pg.evaluate("""() => { for (const z of document.querySelectorAll('[data-zelle]')) {
        const r = z.getBoundingClientRect(); const x = r.x + r.width/2, y = r.y + r.height/2;
        if (document.elementFromPoint(x, y) === z && r.y > 260 && r.y < innerHeight - 80)
          return { x, y }; } return null; }""")
    pg.mouse.click(ziel["x"], ziel["y"]); pg.wait_for_selector("#pl-nr")

def lauf(br, spalte, titel):
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    if spalte:
        # So sieht die Datenbank aus, nachdem sql/abruf-siegel.sql lief
        pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
          TEST.daten.planwand.forEach(j => { if (!('abruf_info' in j)) j.abruf_info = null;
            if (!('created_at' in j)) j.created_at = '2025-03-01T08:00:00Z';
            if (!('geplant_von' in j)) j.geplant_von = null; });
          clearInterval(t); } }, 5); })();""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = balken_finden(pg)
    pruefe(titel + ": Balken gefunden", bool(jid))
    pg.evaluate("""(id) => { const j = TEST.daten.planwand.find(x => x.id === id);
      j.geplant_von = 'S.H'; if ('abruf_info' in j) j.abruf_info = 'je 1000 Stk KW 44, 45, 46';
      j.geaendert_am = '2026-10-08T13:05:00Z'; }""", jid)
    # Neu zeichnen, damit die Wand die geänderten Daten kennt
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)

    pruefe(titel + ": kein Kürzel auf dem Balken", pg.locator(".pw-balken__planer").count() == 0)

    # ---- Schnellvorschau ----
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed(); el.hover(); pg.wait_for_timeout(400)
    pruefe(titel + ": Schnellvorschau offen", pg.locator(".pw-info").count() == 1)
    nr = pg.evaluate(f"TEST.daten.planwand.find(x => x.id === '{jid}').job_number")
    pruefe(titel + ": HOCO Nr. oben", pg.locator(".pw-info .pw-info__kopf .pw-info__nr").inner_text() == nr)
    pruefe(titel + ": Siegel neben HOCO Nr.", pg.locator(".pw-info .pw-info__kopf .siegel").inner_text() == "S.H")
    zeilen = pg.evaluate("[...document.querySelectorAll('.pw-info > div')].map(d => d.className + '|' + d.textContent)")
    pruefe(titel + ": zweite Zeile Fertigungsmenge", "Stück" in zeilen[1] or "Fertigungsmenge" in zeilen[1])
    if spalte:
        pruefe(titel + ": dritte Zeile Abruf", "KW 44" in zeilen[2])
        pruefe(titel + ": dann Lücke", "luecke" in zeilen[3])
    pruefe(titel + ": zuletzt die Änderung", "Letzte Änderung" in zeilen[-1])
    if spalte: pg.screenshot(path="/tmp/schnellvorschau.png", clip={"x": 0, "y": 0, "width": 1600, "height": 950})
    pg.mouse.move(5, 5); pg.wait_for_timeout(200)

    # ---- Fenster: Siegel und Feld ----
    oeffnen(pg, jid)
    pruefe(titel + ": Feld Abrufinformation da", pg.locator("#pl-abruf").count() == 1)
    pruefe(titel + ": Siegel im Kopf", pg.locator("#pl-siegel .siegel").count() == 1)
    if spalte:
        pruefe(titel + ": Abruf geladen", "KW 44" in pg.input_value("#pl-abruf"))
        pg.screenshot(path="/tmp/auftragsfenster-abruf.png")
    pg.click("#pl-nein"); pg.wait_for_timeout(500)

    # ---- Älterer Auftrag ohne Abruf lässt sich speichern ----
    if spalte:
        pg.evaluate("""(id) => { const j = TEST.daten.planwand.find(x => x.id === id);
          j.abruf_info = null; j.created_at = '2025-03-01T08:00:00Z'; }""", jid)
        pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(400)
        pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
        oeffnen(pg, jid)
        pg.click("#pl-ja"); pg.wait_for_timeout(1200)
        pruefe(titel + ": alter Auftrag ohne Abruf gespeichert", pg.locator(".dialog--auftrag").count() == 0)
        pruefe(titel + ": Siegel bleibt erhalten",
               pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}').geplant_von") == "S.H")

    # ---- Neuer Auftrag ----
    vorher = pg.evaluate("TEST.daten.jobs.length")
    neu_oeffnen(pg)
    pg.fill("#pl-nr", "10000-0777"); pg.wait_for_timeout(700)
    pruefe(titel + ": eigenes Siegel eingeschaltet", pg.locator(".planerknopf.aktiv[data-planer='S.H']").count() == 1)
    pg.click("#pl-ja"); pg.wait_for_timeout(1000)
    if spalte:
        pruefe(titel + ": ohne Abruf nicht gespeichert", pg.evaluate("TEST.daten.jobs.length") == vorher
               and pg.locator(".dialog--auftrag").count() == 1)
        pruefe(titel + ": Feld rot markiert", pg.locator("#pl-abruf.fehlt").count() == 1)
        pg.fill("#pl-abruf", "je 500 Stk KW 45")
        pg.click("#pl-ja"); pg.wait_for_timeout(1300)
    j = pg.evaluate("JSON.parse(JSON.stringify(TEST.daten.jobs.find(x => x.job_number === '10000-0777') || null))")
    pruefe(titel + ": neuer Auftrag gespeichert", bool(j))
    if j:
        pruefe(titel + ": Siegel gespeichert", j.get("geplant_von") == "S.H")
        if spalte: pruefe(titel + ": Abruf gespeichert", j.get("abruf_info") == "je 500 Stk KW 45")
        else: pruefe(titel + ": ohne SQL kein Abruf geschrieben", "abruf_info" not in j)
    pg.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    lauf(br, True, "mit SQL")
    lauf(br, False, "ohne SQL")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
