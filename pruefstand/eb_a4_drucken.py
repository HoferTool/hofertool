# Einrichtblatt in der App vom iPad aus auf A4 über den Pool-Rechner
# (1.309.0, Wunsch Patrick 30. Oktober 2026): „Drucken“ fragt am
# Tippgerät „Im Büro drucken (A4)“ oder „Auf diesem Gerät“; A4 zeichnet
# die gezeigte Seite als JPG und legt einen Auftrag mit a4 ab.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FALSCH ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => { const D = TEST.daten;
      D.app_config.push({ schluessel: 'druck', wert: JSON.stringify({ drucker: 'SHARP WBG', drucker_a4: 'SHARP A4' }) },
        { schluessel: 'druck_status', wert: JSON.stringify({ gesehen: new Date().toISOString(), drucker: ['SHARP WBG', 'SHARP A4'], standard: 'SHARP WBG', excel: true }) });
      D.einrichtblatt_app = [{ id: 'eb1', hoco_nr: '10000-0301', type_id: 't1', programme: {}, kopf: {},
        plaetze: { T100: { taetigkeit: 'Drucktest' } }, seiten: [], gut_am: new Date().toISOString() }];
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: 'https://x.invalid/eb.xlsx', stueckzeit_s: null });
      D.druckauftraege = []; }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.protokoll.length = 0")
    pg.click("[data-eba-drucken]"); pg.wait_for_selector(".dialog [data-w='a4']")
    pruefe("Auswahl: Im Büro drucken (A4) und Auf diesem Gerät",
           pg.locator(".dialog [data-w='a4']").inner_text().strip() == "Im Büro drucken (A4)" and pg.locator(".dialog [data-w='hier']").count() == 1)
    pg.click(".dialog [data-w='a4']")
    pg.wait_for_function("TEST.daten.druckauftraege.length === 1", timeout=30000)
    a = pg.evaluate("TEST.daten.druckauftraege[0]")
    ups = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload')")
    print(a, ups)
    pruefe("Auftrag: a4, A4-Drucker, eine Seite", a.get("a4") is True and a["drucker"] == "SHARP A4" and a["seiten"] == 1 and a["titel"].startswith("Einrichtblatt 10000-0301"))
    pruefe("Seite als JPG hochgeladen", len(ups) == 1 and ups[0]["typ"] == "image/jpeg" and ups[0]["groesse"] > 20000)
    pg.wait_for_function("document.querySelector('[data-eba-drucken]').textContent === 'Drucken'", timeout=10000)
    pruefe("Knopf wieder normal", True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
