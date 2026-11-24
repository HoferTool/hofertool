# 1.787.0: Schriftgrösse als Zahl in der Leiste mit Farben (Einrichtblatt und Schreibleiste)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
daten.hoco_type_data = daten.hoco_type_data || [];
daten.hoco_type_data.push(...daten.jobs.map(j => ({ hoco_nr: j.job_number, type_id: (daten.machines.find(m => m.id === j.machine_id) || {}).type_id, pad_info: "Spannzange wechseln" })));
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
def seite(p, **kw):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(**kw).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    return br, pg
with sync_playwright() as p:
    # 1) Einrichtblatt: MarkierLeiste
    br, pg = seite(p, viewport={"width": 1600, "height": 950})
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    z = pg.locator("[data-eba-schriftzeile] [data-pf-geozahl]")
    pruefe("Zahlenfeld in der Leiste", z.count() == 1)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    f = pg.locator("[data-platzfenster='T100'] [data-pf='taetigkeit']")
    f.click(); pg.keyboard.type("Bohren tief")
    f.evaluate("""e => { const t = e.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.wait_for_timeout(200)
    z.click(); z.fill("20"); z.press("Enter"); pg.wait_for_timeout(200)
    h = f.inner_html().replace(" ", "")
    print("  html:", f.inner_html())
    pruefe("Grösse 20 auf Markiertes", "font-size:20px" in h)
    pruefe("Text bleibt", f.inner_text().strip() == "Bohren tief")
    pg.screenshot(path="/tmp/claude-0/groesse_eb.png")
    br.close()
    # 2) Pad: Info an der Maschine mit Schreibleiste
    br, pg = seite(p, viewport={"width": 1180, "height": 820}, has_touch=True)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1200)
    pg.locator("button:has-text('Pad Mode'):visible").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(600)
    fe = pg.locator(".dialog [data-stilfeld]")
    fe.evaluate("""e => { e.focus(); const t = e.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 10);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.wait_for_timeout(200)
    zz = pg.locator(".schreibleiste__zahl")
    pruefe("Zahlenfeld in der Schreibleiste", zz.is_visible())
    zz.click(); pg.wait_for_timeout(150)
    pruefe("Antippen ändert nichts", "font-size" not in fe.inner_html())
    zz.fill("24"); zz.press("Enter"); pg.wait_for_timeout(200)
    print("  html:", fe.inner_html())
    pruefe("nur eine Grösse", fe.inner_html().count("font-size") == 1)
    pg.screenshot(path="/tmp/claude-0/groesse_pad.png")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    gesp = [x for x in pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.pad_info)") if x and "24px" in x]
    pruefe("Grösse 24 gespeichert", len(gesp) > 0)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
