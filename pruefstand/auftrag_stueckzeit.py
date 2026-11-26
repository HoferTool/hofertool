# Auftragsfenster zeigt die Stückzeit je HOCO Nr. und Typ der Maschine
# (Wunsch Patrick 26. November 2026), ohne Eintrag „fehlt“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    balken = pg.locator(".pw-balken[data-auftrag]").first
    jid = balken.get_attribute("data-auftrag")
    info = pg.evaluate(f"""(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}');
      const m = TEST.daten.machines.find(x => x.id === j.machine_id);
      return {{ hoco: j.job_number, typ: m && m.type_id }}; }})()""")
    balken.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(800)
    t = pg.inner_text("#pl-stueckzeit") if pg.locator("#pl-stueckzeit").count() else ""
    if "Stückzeit" not in t: fehler.append("Stückzeit fehlt im Fenster: " + t)
    pg.click("#pl-nein"); pg.wait_for_timeout(400)
    pg.evaluate(f"""(() => {{ const d = TEST.daten.hoco_type_data = TEST.daten.hoco_type_data || [];
      const z = d.find(x => x.hoco_nr === '{info['hoco']}' && x.type_id === '{info['typ']}');
      if (z) z.stueckzeit_s = 42.5; else d.push({{ hoco_nr: '{info['hoco']}', type_id: '{info['typ']}', stueckzeit_s: 42.5 }}); }})()""")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick()
    pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(800)
    t = pg.inner_text("#pl-stueckzeit") if pg.locator("#pl-stueckzeit").count() else ""
    if "42,5 s" not in t: fehler.append("Stückzeit nicht gezeigt: " + t)
    pg.screenshot(path="/tmp/claude-0/stueckzeit.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
