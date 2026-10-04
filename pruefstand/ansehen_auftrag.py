# Planwand ohne Planungsrecht (Wunsch 4. Oktober 2026): Doppelklick öffnet
# das Auftragsfenster zum Ansehen. Ändern geht nur, was vorher schon ging:
# Zustand und Problem melden. Alles andere ist gesperrt, Löschen und
# Kopieren fehlen, Speichern ändert nur den Zustand.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

ROLLE = '''role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: true,'''
assert ROLLE in FAKE
F = FAKE.replace(ROLLE, '''role: "langdreher", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: false,''')

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe("Balken gefunden", bool(jid))
    vorher = pg.evaluate("(id) => JSON.parse(JSON.stringify(TEST.daten.planwand.find(j => j.id === id)))", jid)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    # Doppelklick über zwei schnelle Klicks, wie in doppelklick.py
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Doppelklick öffnet Auftragsfenster", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Kein Betrachter dazu", pg.locator(".betrachter").count() == 0)
    pruefe("Hinweis 'Nur zum Ansehen'", pg.locator("#pl-nurlesen").count() == 1)

    for f in ["#pl-fa-nr","#pl-von","#pl-tage","#pl-bis","#pl-menge","#pl-matort","#pl-mat-bez","#pl-menge-mat","#pl-liefer","#pl-notiz"]:
        pruefe("gesperrt " + f, pg.evaluate("(s) => { const e = document.querySelector(s); return !!e && (e.readOnly || e.disabled); }", f))
    pruefe("Maschine gesperrt", pg.locator("#pl-maschine").is_disabled())
    pruefe("Farbknöpfe gesperrt", pg.evaluate("[...document.querySelectorAll('[data-plfarbe]')].every(b => b.disabled)"))
    pruefe("Planerknöpfe gesperrt", pg.evaluate("[...document.querySelectorAll('[data-planer]')].every(b => b.disabled)"))
    pruefe("Kein PDF wählen", pg.locator(".dialog--auftrag .bildknopf").count() == 0)
    pruefe("Kein Löschen", pg.locator("#pl-loeschen").count() == 0)
    pruefe("Kein Kopieren", pg.locator("#pl-kopieren-eigen").count() == 0)
    pruefe("Problem-Knopf da", pg.locator("#pl-problem-eigen").count() == 1)
    pruefe("Zustand wählbar", pg.evaluate("[...document.querySelectorAll('[data-plstatus]')].every(b => !b.disabled)"))

    # Tippen in ein gesperrtes Feld ändert nichts
    pg.locator("#pl-menge").click(); pg.keyboard.type("999"); pg.wait_for_timeout(100)
    pruefe("Menge bleibt", pg.input_value("#pl-menge") == ("" if vorher.get("target_quantity") is None else str(vorher["target_quantity"])))

    neu = "qs" if vorher.get("plan_status") != "qs" else "ruesten"
    pg.click(f"[data-plstatus='{neu}']"); pg.click("#pl-ja"); pg.wait_for_timeout(1200)
    nachher = pg.evaluate("(id) => JSON.parse(JSON.stringify(TEST.daten.planwand.find(j => j.id === id)))", jid)
    pruefe("Zustand gespeichert", nachher.get("plan_status") == neu)
    for k in ["planned_from","planned_days","target_quantity","color","plan_note","fa_nr","material_bez","machine_id","drawing_url"]:
        pruefe("unverändert " + k, nachher.get(k) == vorher.get(k))
    pg.screenshot(path="/tmp/ansehen_leer.png")

    # Problem melden aus dem Fenster
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pg.screenshot(path="/tmp/ansehen_fenster.png")
    pg.click("#pl-problem-eigen"); pg.wait_for_timeout(500)
    pruefe("Problemauswahl erscheint", pg.locator(".dialog-huelle").count() >= 1)
    ersteWahl = pg.locator(".dialog-huelle button").first
    ersteWahl.click(); pg.wait_for_timeout(900)
    nachher = pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).problem", jid)
    pruefe("Problem gemeldet", bool(nachher))
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
