# Vorschau beim Darüberfahren (1.96.0, Wunsch Patrick 19. Oktober 2026):
# Ferien zeigen den ganzen Namen, die Notiz und von wann bis wann,
# Aufträge zusätzlich von wann bis wann.
import time
from pruefstand import server_starten, FAKE, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    import os
    br = p.chromium.launch(executable_path=os.environ.get("CHROME_PFAD") or None)
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
      TEST.daten.vacations[0].person = 'Ramona Langername-Beispiel'; TEST.daten.vacations[0].note = 'Hochzeit in Italien';
      clearInterval(t); } }, 5); })();""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)

    fe = pg.locator(".pw-ferien[data-ferien='f1']").first
    fe.scroll_into_view_if_needed(); fe.hover(); pg.wait_for_timeout(300)
    info = pg.locator(".pw-info--ferien")
    txt = info.inner_text() if info.count() else ""
    print(txt)
    pruefe("Ferien: Fenster erscheint", info.count() == 1)
    pruefe("Ferien: ganzer Name", "Ramona Langername-Beispiel" in txt)
    pruefe("Ferien: Notiz", "Hochzeit in Italien" in txt)
    pruefe("Ferien: von bis", "–" in txt and "5 Arbeitstage" in txt)
    pg.mouse.move(5, 5); pg.wait_for_timeout(200)
    pruefe("Ferien: Fenster geht weg", pg.locator(".pw-info--ferien").count() == 0)

    jid = pg.evaluate("""() => { const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b =>
        b.getBoundingClientRect().width > 60 && b.getBoundingClientRect().y > 200 && b.getBoundingClientRect().bottom < innerHeight - 40);
        return b && b.dataset.auftrag; }""")
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.hover(); pg.wait_for_timeout(300)
    t2 = pg.locator(".pw-info").first.inner_text() if pg.locator(".pw-info").count() else ""
    print(t2)
    pruefe("Auftrag: Zeitraum in der Vorschau", "📅" in t2 and "Arbeitstag" in t2)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
