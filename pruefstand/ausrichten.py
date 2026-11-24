# Ausrichtung links / Mitte / rechts (1.576.0, Wunsch Patrick 16. November
# 2026): in der Leiste des Einrichtblatts (ganzes Feld) und in der
# Schreibleiste der Felder mit Format (je Zeile).
import time, os
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
    pg = p.new_context(**kw).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    return pg
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    # 1) Einrichtblatt: Tätigkeit rechtsbündig, Bemerkung zentriert
    pg = seite(br, viewport={"width": 1600, "height": 950})
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    L = pg.locator("[data-eba-schriftzeile] [data-markierleiste]")
    pruefe("Leiste hat drei Knöpfe zum Ausrichten", L.locator("[data-pf-ausr-knopf]").count() == 3)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    T = "[data-platzfenster='T100'] [data-pf='taetigkeit']"
    pg.locator(T).click(); pg.keyboard.type("Plandrehen")
    L.locator("[data-pf-ausr-knopf='right']").click(); pg.wait_for_timeout(150)
    pruefe("Feld im Fenster rechtsbündig", pg.locator(T).evaluate("e => getComputedStyle(e).textAlign") == "right")
    pg.locator("[data-platzfenster='T100'] [data-pf-ok]").click(); pg.wait_for_timeout(300)
    ta = pg.locator("[data-platz='T100'] .eba-tat .eba-fmt")
    pruefe("Blatt: Tätigkeit rechtsbündig", ta.count() == 1 and ta.evaluate("e => getComputedStyle(e).textAlign") == "right")
    # Ohne Feld: Hinweis statt nichts
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    fm = (b["plaetze"]["T100"].get("fmt") or {}).get("taetigkeit") or ""
    print("  fmt:", fm, "| text:", b["plaetze"]["T100"].get("taetigkeit"))
    pruefe("gespeichert mit Vermerk rechts", fm.startswith("<!--ausr:right-->") and b["plaetze"]["T100"].get("taetigkeit") == "Plandrehen")
    ta = pg.locator("[data-platz='T100'] .eba-tat .eba-fmt")
    pruefe("Ansicht nach Speichern rechtsbündig", ta.count() == 1 and ta.evaluate("e => getComputedStyle(e).textAlign") == "right")
    pg.screenshot(path="s_ausrichten_eb.png")
    pg.close()
    # 2) Pad: Info an der Maschine, zweite Zeile zentriert
    pg = seite(br, viewport={"width": 1180, "height": 820}, has_touch=True)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1200)
    pg.locator("button:has-text('Pad Mode'):visible").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(600)
    fe = pg.locator(".dialog [data-stilfeld]")
    fe.evaluate("""e => { e.focus(); const r = document.createRange(); r.selectNodeContents(e); r.collapse(false);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.keyboard.press("Shift+Enter"); pg.keyboard.type("Mitte")
    pg.wait_for_timeout(150)
    pruefe("Schreibleiste hat Knöpfe zum Ausrichten", pg.locator(".schreibleiste__ausr").count() == 3)
    pg.locator(".schreibleiste__ausr[title=Zentriert]").tap(); pg.wait_for_timeout(150)
    print("  html:", fe.inner_html())
    pg.screenshot(path="s_ausrichten_pad.png")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    gesp = [x for x in pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.pad_info)") if x and "Mitte" in x]
    print("  gespeichert:", gesp[:1])
    g = gesp[0] if gesp else ""
    pruefe("gespeichert: erste Zeile normal, zweite zentriert", g.startswith("Spannzange wechseln") and '<div style="text-align:center">Mitte</div>' in g)
    z = pg.locator("#pad .pad-info span[style*='text-align']")
    pruefe("Pad zeigt die Zeile zentriert", z.count() == 1 and z.first.inner_text().strip() == "Mitte"
      and z.first.evaluate("e => getComputedStyle(e).textAlign") == "center")
    pg.screenshot(path="s_ausrichten_pad2.png")
    br.close()
print("Fehler:", fehler or "keine")
