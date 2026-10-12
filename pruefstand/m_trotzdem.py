# Häkchen „M trotzdem zeigen“ im Auftragsfenster (1.24.0, Wunsch Patrick
# 12. Oktober 2026): Ist es gesetzt, steht auf dem Balken das rote M,
# auch wenn bei „Menge vorhanden oder bestellt“ etwas steht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    # Spalte wie nach dem SQL; geplante Aufträge mit Menge
    pg.evaluate("""() => TEST.daten.planwand.forEach(j => { j.material_m_trotzdem = false;
      if (!j.abruf_info) j.abruf_info = 'je 100'; })""")
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    jid = pg.evaluate("""() => { const ids = new Map(TEST.daten.planwand.map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => { const j = ids.get(b.dataset.auftrag);
        const r = b.getBoundingClientRect();
        return j && j.plan_status === 'geplant' && String(j.material_menge || '').trim()
          && r.width > 30 && r.left > 0 && r.right < innerWidth; });
      return b ? b.dataset.auftrag : null; }""")
    pruefe("geplanter Auftrag mit Menge gefunden", bool(jid))
    sel = f".pw-balken[data-auftrag='{jid}']"
    pruefe("vorher kein M", pg.locator(sel + " .pw-msymbol").count() == 0)
    el = pg.locator(sel).first
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(1000)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    h = pg.locator("#pl-m-trotzdem")
    pruefe("Häkchen da und frei", h.count() == 1 and h.is_enabled() and not h.is_checked())
    pg.click("label.auf-mtrotzdem span"); pg.wait_for_timeout(100)
    pruefe("Klick auf den Text setzt das Häkchen", h.is_checked())
    pg.screenshot(path="/tmp/m_trotzdem_fenster.png", clip=pg.locator("#pl-menge-mat").locator("xpath=../..").bounding_box())
    pg.click(".dialog--auftrag button:has-text('Speichern')"); pg.wait_for_timeout(1500)
    wert = pg.evaluate(f"TEST.daten.planwand.find(j => j.id === '{jid}').material_m_trotzdem")
    pruefe("gespeichert", wert is True)
    pruefe("Balken zeigt jetzt das rote M", pg.locator(sel + " .pw-msymbol").count() == 1)
    pruefe("Menge bleibt", bool(pg.evaluate(f"TEST.daten.planwand.find(j => j.id === '{jid}').material_menge")))
    # Häkchen wieder weg: M verschwindet
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(1000)
    pruefe("Häkchen bleibt gesetzt beim Öffnen", pg.locator("#pl-m-trotzdem").is_checked())
    pg.click("#pl-m-trotzdem"); pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    pruefe("Häkchen weg: kein M mehr", pg.locator(sel + " .pw-msymbol").count() == 0
           and pg.evaluate(f"TEST.daten.planwand.find(j => j.id === '{jid}').material_m_trotzdem") is False)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
