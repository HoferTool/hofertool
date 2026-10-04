import sys, time
sys.path.insert(0, "/home/claude/hofertool/pruefstand")
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox"])
    pg = br.new_context(viewport={"width":1600,"height":900}, device_scale_factor=1.5).new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]: pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    pg.evaluate("""(() => { const n = new Date().toISOString(); const L = [
      ['Schneidöl 20 l', 1], ['Wendeplatten DCMT 070204', 1], ['Messschieber-Batterien', 2], ['Putzlappen', 2],
      ['Kaffee für die Halle', 2], ['Bohrer HSS 4,2 mm', 3], ['Handschuhe Grösse 9', 3], ['Etiketten für Kisten', 4]];
      L.forEach(([t, p], i) => TEST.daten.shopping_items.push({ id: 'v' + i, text: t, prio: p, is_done: false, created_at: n })); })()""")
    for s in ["einkauf", "bestellungen", "rechner"]:
        pg.evaluate(f"location.hash='#/{s}'"); pg.wait_for_timeout(1800); pg.screenshot(path=f"/tmp/claude-0/hf/rec/{s}.png")
    br.close()
