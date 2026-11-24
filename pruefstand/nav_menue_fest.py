# Seit 1.644.0 (1.717.0 mit ☰ ein/aus): Schalter „Menü immer zeigen“ hält die Menüpunkte in der Seitenleiste stehen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
DATEN = ";TEST.navTodos = true; TEST.ohneWechsel = true; TEST.todoMenueMs = 1500; if (!sessionStorage.mfTest) { sessionStorage.mfTest = 1; (TEST.daten.profiles || []).forEach(p => { p.einstellungen = Object.assign(p.einstellungen || {}, { navmenuefest: false }); }); }"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page(); pf = []
    pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DATEN))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#nav-todo", timeout=20000); pg.wait_for_timeout(600)
    cls = lambda: pg.evaluate("document.body.className")
    pruefe("nav--todos" in cls(), "ohne Schalter zuerst die Todos")
    pg.evaluate("alt => 0") if False else None
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,a')].find(x=>/Einstellungen/.test(x.title||x.textContent)); }""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard")
    pg.wait_for_selector("#nav-todo", timeout=20000)
    # Einstellungen öffnen
    pg.evaluate("window.location.hash = '#/einstellungen'")
    pg.wait_for_timeout(800)
    if not pg.query_selector("#e-menuefest"):
        el = pg.query_selector("[title*='Einstellungen'], #einstellungen, .kopf__einstellungen")
        if el: el.click(); pg.wait_for_timeout(800)
    pruefe(pg.query_selector("#e-menuefest") is not None, "Schalter Menü immer zeigen da")
    pg.click("#e-menuefest", force=True); pg.wait_for_timeout(400)
    pruefe("nav--zeigt-menue" in cls() and "nav--todos" not in cls(), "Menü sofort sichtbar")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(2500)
    pruefe("nav--zeigt-menue" in cls(), "nach Zeit immer noch Menü")
    pruefe(pg.is_visible("#nav-todo"), "Todos darunter sichtbar")
    pg.click("#nav-klapp"); pg.wait_for_timeout(400)
    pruefe("nav--todos" in cls() and "nav--zeigt-menue" not in cls(), "☰ fährt Menü ein")
    pg.wait_for_timeout(2500)
    pruefe("nav--todos" in cls(), "eingefahren bleibt ohne Zeit")
    pg.click("#nav-klapp"); pg.wait_for_timeout(400)
    pruefe("nav--zeigt-menue" in cls(), "☰ fährt Menü wieder aus")
    pg.wait_for_timeout(2500)
    pruefe("nav--zeigt-menue" in cls(), "ausgefahren bleibt ohne Zeit")
    pg.screenshot(path="/tmp/claude-0/-home-user/66e3e86a-6ace-5606-8417-1d3e688fcfb8/scratchpad/fest.png")
    pg.reload(); pg.wait_for_selector("#nav-todo", timeout=20000); pg.wait_for_timeout(600)
    pruefe("nav--zeigt-menue" in cls(), "nach Neuladen Menü")
    pruefe(not pf, "keine Fehler im Browser " + str(pf))
# Seit 1.770.0 ist „Menü immer zeigen“ die Vorgabe: ohne gespeicherte Wahl steht das Menü
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ";TEST.navTodos = true; TEST.ohneWechsel = true; TEST.todoMenueMs = 1500;"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#nav-todo", timeout=20000); pg.wait_for_timeout(2500)
    c = pg.evaluate("document.body.className")
    pruefe("nav--zeigt-menue" in c, "Vorgabe: Menü steht, auch nach Zeit")
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
