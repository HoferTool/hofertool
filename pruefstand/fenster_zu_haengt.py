# Eigenes Fenster mit dem Kreuz des Browsers schliessen statt mit
# „Schliessen“ (Patrick 10. November 2026: „wenn der Bug kommt, geht nix
# mehr“): danach muss die App normal bedienbar bleiben.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    ctx.on("page", lambda pg: pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160])))
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    pg.evaluate("""(jid) => { const D = TEST.daten; const j = D.planwand.find(x => x.id === jid);
      const m = (D.machines || []).find(x => x.id === (j.machine_id || j.maschine_id));
      D.einrichtblatt_app = [{ hoco_nr: j.job_number, type_id: m.type_id, programme: { p1: 'O1234' }, kopf: {}, seiten: [],
        plaetze: { T100: { taetigkeit: 'Abstechen' } }, gut_am: '2026-10-28T08:00:00Z' }]; }""", jid)
    for runde, mitBlatt in enumerate([False, True, True]):
        pg.evaluate("TEST.eigenesFenster = true")
        with ctx.expect_page() as neu: pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick()
        w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(400)
        if mitBlatt:
            w.click("#pl-blattreihe button"); w.wait_for_timeout(1500)
            if runde == 2 and w.locator("[data-eba-bearbeiten]").count():
                w.click("[data-eba-bearbeiten]"); w.wait_for_timeout(600)
                w.locator("[data-eba-seite] :text('T100')").first.click(); w.wait_for_timeout(600)
        w.close(); pg.wait_for_timeout(1200)
        z = pg.evaluate("""() => ({ huellen: [...document.querySelectorAll('.dialog-huelle')].map(h => h.className),
          oben: (document.elementFromPoint(800, 500) || {}).className, body: document.body.className, ov: getComputedStyle(document.body).overflow })""")
        print("Runde", runde, z)
        if z["huellen"]:
            # Zurückgeholtes Blatt muss auf Klicks reagieren
            for _ in range(4):
                if not pg.evaluate("document.querySelectorAll('.dialog-huelle').length"): break
                k = pg.locator(".dialog-huelle button:has-text('Schliessen'), .dialog-huelle button:has-text('Abbrechen'), .dialog-huelle button:has-text('Verwerfen')")
                print("  Knöpfe:", pg.evaluate("[...document.querySelectorAll('.dialog-huelle button')].map(b=>b.textContent.trim().slice(0,14)).slice(0,30)"))
                k.last.click(timeout=3000); pg.wait_for_timeout(600)
            if pg.evaluate("document.querySelectorAll('.dialog-huelle').length"): fehler.append(f"Runde {runde}: Schliessen im zurückgeholten Fenster geht nicht")
        # Bedienbar? Einfacher Klick auf einen Balken markiert ihn
        try:
            pg.locator(".pw-balken[data-auftrag]").nth(2).click(timeout=3000)
        except Exception as e:
            fehler.append(f"Runde {runde}: Klick geht nicht: " + str(e)[:120])
        if any("dialog-huelle--eigen" in h for h in z["huellen"]): fehler.append(f"Runde {runde}: Hülle des eigenen Fensters bleibt")
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
