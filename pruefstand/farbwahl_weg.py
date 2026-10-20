# Farbwahl im Auftragsfenster ist weg (1.73.1, Wunsch Patrick 16. Oktober
# 2026): die Farbe kommt beim Speichern immer vom erkannten Werkstoff.



import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    # Ein Auftrag mit V4A, aber von Hand rosa (wie früher möglich)
    balken = pg.locator(".pw-balken[data-auftrag]").first
    jid = balken.get_attribute("data-auftrag")
    pg.evaluate(f"""() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}');
      j.material_bez = 'X2CrNiMo17-12-2 rd 12 mm h9'; j.color = 'rosa'; }}""")
    balken.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(600)
    if pg.locator(".dialog--auftrag [data-plfarbe], .dialog--auftrag .farbwahl").count():
        fehler.append("Farbwahl noch im Fenster")
    if "Farbe und Material" in pg.inner_text(".dialog--auftrag"): fehler.append("Überschrift Farbe und Material noch da")
    pg.screenshot(path="/tmp/claude-0/farbwahl_weg.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    for _ in range(2):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(800)
    c = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}').color")
    if c != "grau": fehler.append("Farbe nach Speichern nicht vom Material: " + str(c))
    br.close()
print("Fehler:", "keine" if not fehler else "\n" + "\n".join(fehler))
