# Pad Mode: Notiz zum Auftrag ist weg, Info an der Maschine zeigt **fett**,
# Knöpfe B, I, U: auf Markiertes umschalten, ohne Markierung fürs Weiterschreiben.
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
    # Fenster öffnen: alter Text mit ** erscheint fett im Feld
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(600)
    fe = pg.locator(".dialog [data-stilfeld]")
    pruefe(fe.locator("b").inner_text() == "nach 20'000 Stk", "alter **-Text ist im Feld fett")
    # alles leeren und neu schreiben
    fe.evaluate("e => { e.innerHTML = ''; e.focus(); }")
    pg.keyboard.type("Achtung Spannzange wechseln")
    # Wort „Spannzange“ markieren und B antippen
    fe.evaluate("""e => { const t = e.firstChild; const r = document.createRange(); r.setStart(t, 8); r.setEnd(t, 18);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator("[data-stil=bold]").tap(); pg.wait_for_timeout(150)
    pruefe(fe.locator("b").inner_text() == "Spannzange", "Markierung wird fett: " + fe.inner_html())
    pruefe(pg.locator("[data-stil=bold]").get_attribute("aria-pressed") == "true", "Knopf B zeigt an")
    pg.locator("[data-stil=bold]").tap(); pg.wait_for_timeout(150)
    pruefe(fe.locator("b").count() == 0, "nochmals B macht es wieder normal: " + fe.inner_html())
    # Ohne Markierung: Cursor ans Ende, I an, schreiben, I aus, schreiben
    fe.evaluate("""e => { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator("[data-stil=italic]").tap(); pg.wait_for_timeout(100)
    pg.keyboard.type(" sofort")
    pg.locator("[data-stil=italic]").tap(); pg.wait_for_timeout(100)
    pg.keyboard.type(" normal")
    pruefe(fe.locator("i").inner_text().strip() == "sofort", "I an: Geschriebenes kursiv: " + fe.inner_html())
    pruefe("normal" not in fe.locator("i").inner_text(), "I aus: wieder normal")
    # Unterstrichen, neue Zeile
    pg.keyboard.press("Enter")
    pg.locator("[data-stil=underline]").tap(); pg.wait_for_timeout(100)
    pg.keyboard.type("Masse 7")
    pruefe(fe.locator("u").inner_text() == "Masse 7", "U unterstreicht: " + fe.inner_html())
    pg.screenshot(path="s_padfett_fenster.png")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    gesp = [x for x in pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.pad_info)") if x and "Achtung" in x]
    print("  gespeichert:", gesp)
    pruefe(bool(gesp) and gesp[0] == "Achtung Spannzange wechseln<i> sofort</i> normal<br><u>Masse 7</u>", "sauber gespeichert")
    pruefe(pg.locator("#pad .pad-info em").inner_text().strip() == "sofort", "kursiv im Pad")
    pruefe(pg.locator("#pad .pad-info u").inner_text() == "Masse 7", "unterstrichen im Pad")
    pruefe(pg.locator("#pad .pad-info br").count() == 1, "Zeilenumbruch im Pad")
    pg.screenshot(path="s_padfett_kachel2.png")
    # Gefährliches HTML wird nicht ausgeführt
    pg.evaluate("""() => { TEST.daten.hoco_type_data.forEach(x => x.pad_info = '<b>x</b><img src=x onerror="window.boese=1">'); }""")
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(500)
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    pruefe(not pg.evaluate("() => window.boese"), "kein fremdes HTML ausgeführt")
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
