# Gemeldete Probleme im Pad statt Wetter (1.352.0, Wunsch Patrick
# 3. November 2026): Probleme der Aufträge der Maschine stehen mit den
# QS-Meldungen anstelle des Wetters; bei mehreren steht „N Meldungen“
# und „Weitere unten ↓“; „Erledigt“ entfernt das Problem; ohne
# Meldung kommt das Wetter zurück.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("QS_BILDER", "")

def seite(br, b, h, mobil=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, has_touch=mobil, is_mobile=mobil)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return pg

def zumPad(pg):
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(700)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)
    return pg.evaluate("""() => { const nr = document.querySelector('#pad .pad-wert--gross').textContent;
        const j = TEST.daten.jobs.find(x => x.job_number === nr && !x.ended_at); return j && j.machine_id; }""")


with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = seite(br, 1180, 820, True)
    mid = zumPad(pg)
    if pg.locator("#pad-qsmeldung").count(): fehler.append("Meldung ohne Problem")
    if "WETTER" not in pg.inner_text("#pad .pad-karte2--saeule").upper(): fehler.append("Wetter fehlt ohne Problem")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(500)
    # zwei Probleme an Aufträgen dieser Maschine, eine QS-Meldung
    pg.evaluate("""(mid) => {
        const js = TEST.daten.jobs.filter(j => j.machine_id === mid).slice(0, 2);
        js.forEach((j, i) => { j.problem = i ? "Zange klemmt, Material rutscht" : "Kühlmittel läuft aus, bitte Schlauch prüfen";
          j.problem_at = new Date().toISOString(); });
        (TEST.daten.qs_meldungen = TEST.daten.qs_meldungen || []).push({ id: "qsx1", machine_id: mid, stueck: 40,
          notiz: "Grat am Einstich", hoco_nr: js[0].job_number, erstellt_am: new Date().toISOString(), erstellt_name: "Test" });
        return js.length; }""", mid)
    zumPad(pg)
    pg.wait_for_selector("#pad-qsmeldung [data-padproblem]", timeout=8000)
    s = pg.inner_text("#pad .pad-karte2--saeule")
    if "Kühlmittel" not in s or "Zange" not in s or "Grat" not in s: fehler.append("Nicht alles da: " + s)
    if "WETTER" in s.upper(): fehler.append("Wetter trotz Problem")
    if "3 Meldungen" not in s or "wischen" in s: fehler.append("Anzahl fehlt")
    if not pg.locator("#pad .pad-qsm__weiter").count(): fehler.append("Kein Hinweis zum Wischen")
    pg.screenshot(path=os.environ.get("BILD", "/tmp/pad-probleme.png"))
    pg.locator("#pad .pad-qsm__weiter").click(force=True); pg.wait_for_timeout(900)
    pg.locator("#pad [data-padproblemweg]").first.click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle button:has-text('Meldung entfernen')").click(); pg.wait_for_timeout(1200)
    if pg.locator("#pad [data-padproblem]").count() != 1: fehler.append("Erledigt hat nicht entfernt")
    pg.locator("#pad [data-padproblemweg]").first.click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle button:has-text('Meldung entfernen')").click(); pg.wait_for_timeout(1200)
    pg.click("#pad [data-padqsquittieren]"); pg.wait_for_timeout(1200)
    if pg.locator("#pad-qsmeldung").count(): fehler.append("Nach allem Erledigen noch da")
    if "WETTER" not in pg.inner_text("#pad .pad-karte2--saeule").upper(): fehler.append("Wetter nicht zurück")
    br.close()
print("Pad-Probleme | Fehler:", "; ".join(fehler) if fehler else "keine")
