# Pad Mode: Notiz zum Auftrag ist weg, Info an der Maschine zeigt **fett**,
# und im Fenster macht der Knopf „Fett“ per Antippen ein Wort fett.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
INFO = "Spannzange **nach 20'000 Stk** wechseln\nKühlmittel prüfen"
zusatz = """
daten.hoco_type_data = daten.hoco_type_data || [];
daten.jobs.forEach(j => { j.plan_note = "GEHEIME NOTIZ ZUM AUFTRAG"; });
daten.hoco_type_data.push(...daten.jobs.map(j => ({ hoco_nr: j.job_number, type_id: (daten.machines.find(m => m.id === j.machine_id) || {}).type_id, pad_info: %s })));
""" % repr(INFO)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1180,"height":820}, has_touch=True).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    karte = pg.locator("#pad .pad-karte2--hoco")
    pruefe("GEHEIME NOTIZ" not in karte.inner_text(), "Notiz zum Auftrag steht nicht mehr im Pad")
    pruefe(pg.locator("#pad .pad-notiz").count() == 0, "kein Notizkasten")
    pruefe(pg.locator("#pad .pad-info strong").inner_text() == "nach 20'000 Stk", "fettes Stück wird fett gezeigt")
    pruefe("**" not in pg.locator("#pad .pad-info").inner_text(), "keine Sternchen sichtbar")
    hk = karte.bounding_box(); ik = pg.locator("#pad .pad-info").bounding_box()
    print("  Kachel", round(hk["height"]), "Info", round(ik["height"]))
    pruefe(ik["y"] + ik["height"] > hk["y"] + hk["height"] - 30, "Info füllt die Kachel bis unten")
    pg.screenshot(path="s_padfett_kachel.png")
    # Fenster öffnen, ein Wort antippen und fett machen
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(600)
    ta = pg.locator(".dialog textarea")
    ta.fill("Achtung Spannzange wechseln")
    ta.evaluate("t => { t.focus(); t.setSelectionRange(10, 10); }")  # Cursor in „Spannzange“
    pg.locator("[data-fett]").tap(); pg.wait_for_timeout(200)
    pruefe(ta.input_value() == "Achtung **Spannzange** wechseln", "Antippen macht das Wort fett: " + ta.input_value())
    pruefe(pg.locator("[data-fettvorschau] strong").inner_text() == "Spannzange", "Vorschau zeigt fett")
    pg.screenshot(path="s_padfett_fenster.png")
    pg.locator("[data-fett]").tap(); pg.wait_for_timeout(200)
    pruefe(ta.input_value() == "Achtung Spannzange wechseln", "nochmals antippen macht es wieder normal")
    ta.evaluate("t => { t.focus(); t.setSelectionRange(0, 18); }")
    pg.locator("[data-fett]").tap(); pg.wait_for_timeout(200)
    pruefe(ta.input_value() == "**Achtung Spannzange** wechseln", "Markierung wird fett: " + ta.input_value())
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    gesp = pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.pad_info)")
    pruefe(any(x == "**Achtung Spannzange** wechseln" for x in gesp), "gespeichert mit **")
    pruefe(pg.locator("#pad .pad-info strong").inner_text() == "Achtung Spannzange", "nach Speichern fett im Pad")
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
