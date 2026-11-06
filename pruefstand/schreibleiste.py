# Schreibleiste (1.434.0): Knopf Ø über jedem Textfeld, in Feldern mit
# Format (Info an der Maschine) dazu Farben, Fett und Grösse.
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
    leiste = pg.locator(".schreibleiste")
    # 1) Planwand-Auftragsfenster: Notiz (mehrzeilig), Ø einfügen
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    pg.locator(".pw-balken").first.dblclick(); pg.wait_for_timeout(1200)
    ta = pg.locator(".dialog textarea").first
    ta.click(); pg.keyboard.press("End"); pg.keyboard.type(" Bohrung ")
    pg.wait_for_timeout(200)
    pruefe(leiste.is_visible(), "Leiste erscheint bei Textfeld")
    lb = leiste.bounding_box(); tb = ta.bounding_box()
    pruefe(lb["y"] + lb["height"] <= tb["y"] + 1, "Leiste steht über dem Feld")
    pruefe(not pg.locator(".schreibleiste__format").is_visible(), "reines Textfeld: nur Ø, keine Farben")
    pg.locator(".schreibleiste__zeichen").tap(); pg.keyboard.type("12")
    v = ta.input_value()
    pruefe(v.endswith(" Bohrung Ø12"), "Ø an der Schreibmarke: " + repr(v[-20:]))
    pruefe(pg.evaluate("document.activeElement.tagName") == "TEXTAREA", "Fokus bleibt im Feld")
    pg.screenshot(path="s_schreibleiste_auftrag.png")
    # Zahlenfeld: keine Leiste
    zahl = pg.locator(".dialog input[type=number]").first
    if zahl.count():
        zahl.click(); pg.wait_for_timeout(150)
        pruefe(not leiste.is_visible(), "Zahlenfeld ohne Leiste")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    # 2) Pad: Info an der Maschine mit Format
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    pg.locator("#pad .pad-info").tap(); pg.wait_for_timeout(600)
    fe = pg.locator(".dialog [data-stilfeld]")
    fe.evaluate("""e => { e.focus(); const t = e.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 10);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.wait_for_timeout(200)
    pruefe(pg.locator(".schreibleiste__format").is_visible(), "Feld mit Format: Farben sichtbar")
    pg.locator(".schreibleiste__farbe[title=Rot]").tap(); pg.wait_for_timeout(100)
    pg.locator(".schreibleiste__knopf[title=Grösser]").tap(); pg.wait_for_timeout(100)
    pg.locator(".schreibleiste__fett").tap(); pg.wait_for_timeout(100)
    print("  html:", fe.inner_html())
    # ans Ende und Ø
    fe.evaluate("""e => { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator(".schreibleiste__zeichen").tap(); pg.keyboard.type("8")
    pg.screenshot(path="s_schreibleiste_pad.png")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    gesp = [x for x in pg.evaluate("() => TEST.daten.hoco_type_data.map(x => x.pad_info)") if x and "Ø8" in x]
    print("  gespeichert:", gesp[:1])
    g = gesp[0] if gesp else ""
    pruefe("color:#e03030" in g.replace(" ", "") or "rgb(224,48,48)" in g.replace(" ", ""), "Farbe gespeichert")
    pruefe("font-size" in g and "<b>" in g, "Grösse und Fett gespeichert")
    pruefe(g.endswith("Ø8"), "Ø gespeichert")
    sp = pg.locator("#pad .pad-info span[style]")
    pruefe(sp.count() > 0 and "Spannzange" in sp.first.inner_text(), "Pad zeigt Farbe")
    pruefe(pg.locator("#pad .pad-info strong").count() > 0, "Pad zeigt Fett")
    pg.screenshot(path="s_schreibleiste_pad2.png")
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
