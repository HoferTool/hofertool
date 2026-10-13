# Planwand öffnet ohne „Planung wird geladen …“ (1.46.1, Wunsch Patrick
# 13. Oktober 2026): beim zweiten Öffnen und nach dem Neuladen steht
# sofort die gemerkte Tafel, auch bei langsamem Netz.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
WACHE = """() => { window.__gesehen = []; new MutationObserver(() => {
  const t = document.querySelector('#pw-inhalt .laedt, #pw-seite > .laedt');
  if (t && +getComputedStyle(t).opacity > 0.05) window.__gesehen.push(t.textContent);
  const s = document.getElementById('pw-zeitschicht');
  if (s && !s.hidden && !document.querySelector('.pw-tafel')) window.__gesehen.push('Schieber ohne Tafel');
}).observe(document.body, {subtree: true, childList: true, attributes: true}); }"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1500,"height":950})
    pg = ctx.new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    # 1. Erstes Öffnen: der Schieber steht nicht ohne Tafel herum
    pg.evaluate(WACHE)
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(2500)
    erst = pg.evaluate("window.__gesehen")
    print("erstes Öffnen gesehen:", sorted(set(erst)))
    if "Schieber ohne Tafel" in erst: f.append("Schieber ohne Tafel beim ersten Öffnen")
    n_balken = pg.locator(".pw-balken").count()
    # 2. Wieder öffnen mit langsamem Netz: sofort die Tafel
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.verzoegerung = {planwand: 2500, machine_parks: 2500, machines: 2500}")
    pg.evaluate(WACHE)
    vorher = pg.evaluate("TEST.protokoll.filter(x => x.tabelle === 'planwand').length")
    t0 = time.time(); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel", timeout=1500)
    dt = time.time() - t0
    print(f"zweites Öffnen: Tafel nach {dt*1000:.0f} ms, Balken {pg.locator('.pw-balken').count()} von {n_balken}")
    if dt > 1.0: f.append("Tafel zu spät")
    pg.wait_for_timeout(3500)
    zweit = pg.evaluate("window.__gesehen")
    if zweit: f.append("beim zweiten Öffnen aufgeblitzt: " + str(set(zweit)))
    # Frisches kam still nach
    if pg.evaluate("TEST.protokoll.filter(x => x.tabelle === 'planwand').length") <= vorher:
        f.append("nicht frisch nachgeladen")
    # 3. Neu laden (gemerkter Stand im IndexedDB)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt")
    pg.evaluate("TEST.verzoegerung = {planwand: 2500, machine_parks: 2500, machines: 2500}")
    pg.evaluate(WACHE)
    if not pg.locator(".pw-tafel").count():
        pg.evaluate("location.hash='#planwand'")
    t0 = time.time()
    pg.wait_for_selector(".pw-tafel", timeout=1500)
    print(f"nach Neuladen: Tafel nach {(time.time()-t0)*1000:.0f} ms, Balken {pg.locator('.pw-balken').count()}")
    pg.wait_for_timeout(3500)
    dritt = pg.evaluate("window.__gesehen")
    if dritt: f.append("nach Neuladen aufgeblitzt: " + str(set(dritt)))
    if pg.locator(".pw-balken").count() != n_balken: f.append("Balkenzahl anders")
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/a88c6874-fbf2-57fd-81bb-08e5701f386b/scratchpad/pw.png")
    print("Fehler:", f[:5] if f else "keine")
    br.close()
