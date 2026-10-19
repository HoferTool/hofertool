# Mit demselben Konto auf zwei Geräten (Wunsch Patrick 19. Oktober 2026):
# Ein Auftragsfenster, das offen ist, während das andere Gerät Notiz und
# Zustand ändert, schreibt beim Speichern nur seine eigene Änderung und
# setzt nichts zurück. Dazu persönliche Einstellungen einzeln.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(text, ok):
    print(("ok   " if ok else "FALSCH ") + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.jobs.filter(j => j.plan_status === 'geplant' && !j.ended_at).map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe("geplanter Auftrag gefunden", bool(jid))
    sel = f".pw-balken[data-auftrag='{jid}']"
    pg.locator(sel).first.scroll_into_view_if_needed()
    pg.locator(sel).first.dblclick(); pg.wait_for_selector("#pl-menge", timeout=5000); pg.wait_for_timeout(500)
    # Abrufinformation ist Pflicht bei neueren Aufträgen
    if pg.locator("#pl-abruf").count() and not pg.input_value("#pl-abruf").strip():
        pg.fill("#pl-abruf", "Test")
    # Das andere Gerät ändert inzwischen Notiz und Zustand
    pg.evaluate("""(id) => { const j = TEST.daten.jobs.find(x => x.id === id);
      j.plan_note = 'vom anderen Gerät'; j.plan_status = 'ruesten'; }""", jid)
    TEST_vorher = pg.evaluate("TEST.protokoll.length")
    pg.fill("#pl-menge", "4321")
    pg.click("#pl-ja"); pg.wait_for_timeout(2000)
    j = pg.evaluate("(id) => TEST.daten.jobs.find(x => x.id === id)", jid)
    pruefe("eigene Änderung gespeichert (Menge " + str(j.get("target_quantity")) + ")", j.get("target_quantity") == 4321)
    pruefe("Notiz vom anderen Gerät bleibt (" + str(j.get("plan_note")) + ")", j.get("plan_note") == "vom anderen Gerät")
    pruefe("Zustand vom anderen Gerät bleibt (" + str(j.get("plan_status")) + ")", j.get("plan_status") == "ruesten")
    # Einstellungen: nur der eine Wert, der Rest vom anderen Gerät bleibt
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("(() => { const p = TEST.daten.profiles.find(x => x.id === 'u1'); p.einstellungen = Object.assign({}, p.einstellungen, { vomAnderen: 'ja' }); })()")
    n = pg.evaluate("TEST.protokoll.length")
    pg.fill("#pw-zoomwert", "30"); pg.press("#pw-zoomwert", "Enter"); pg.wait_for_timeout(800)
    rpc = pg.evaluate("(n) => TEST.protokoll.slice(n).filter(x => x.art === 'rpc' && x.name === 'einstellung_setzen').map(x => x.args.p_name)", n)
    e = pg.evaluate("TEST.daten.profiles.find(x => x.id === 'u1').einstellungen")
    pruefe("Einstellung einzeln gespeichert " + str(rpc), len(rpc) > 0)
    pruefe("Einstellung vom anderen Gerät bleibt", e.get("vomAnderen") == "ja")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
