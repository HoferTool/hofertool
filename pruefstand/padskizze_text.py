# Pad Mode Skizze: Textfeld mit Knopf "T" einfügen, Fett/Kursiv/
# Unterstrichen und Grösse, mit dem Finger verschieben, antippen zum
# Bearbeiten, Rückgängig, Radierer, gross geöffnet (111.70.0).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.pad_skizzen = [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def finger(pg, cdp, punkte):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": punkte[0][0], "y": punkte[0][1]}]})
    for x, y in punkte[1:]:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(200)

def gespeichert(pg):
    pg.wait_for_timeout(900)
    return pg.evaluate("() => (TEST.daten.pad_skizzen[0] || {}).striche || []")

def texte(liste): return [s for s in liste if s.get("t")]

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1180,"height":820}, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    cdp = ctx.new_cdp_session(pg)

    # Knopf steht direkt nach dem Farbwähler, wo Weiss und Schwarz waren
    reihe = pg.evaluate("() => [...document.querySelector('.pad-skizze__leiste').children].map(e => e.dataset.skizze || (e.querySelector('[data-skizzefarbwahl]') ? 'farbe' : e.dataset.skizzedicke ? 'dicke' : '?'))")
    print("  Leiste:", reihe)
    pruefe(reihe[:2] == ["farbe", "text"], "Text-Knopf gleich nach der Farbe")
    lb = pg.locator(".pad-skizze__leiste").bounding_box()
    pruefe(lb["height"] < 45, "Leiste bleibt auf einer Zeile")

    # Ein Strich, dann Text
    fl = pg.locator("#pad .pad-skizze__flaeche").bounding_box()
    x0, y0 = fl["x"] + 40, fl["y"] + fl["height"] - 60
    finger(pg, cdp, [(x0 + i * 9, y0) for i in range(20)])
    pg.locator("[data-skizzefarbwahl]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#ffd54f'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.locator("[data-skizze='text']").tap(); pg.wait_for_timeout(400)
    pruefe(pg.locator(".dialog [data-stilfeld]").count() == 1, "Fenster mit Textfeld geht auf")
    pruefe(pg.locator(".dialog [data-stil='bold']").count() == 1 and pg.locator(".dialog [data-stil='italic']").count() == 1
           and pg.locator(".dialog [data-stil='underline']").count() == 1, "Knöpfe B, I, U da")
    pruefe(pg.locator(".dialog select").count() == 1, "Schriftgrösse wählbar")
    feld = pg.locator(".dialog [data-stilfeld]")
    feld.evaluate("e => e.focus()"); pg.keyboard.type("Achtung Spannzange neu")
    feld.evaluate("""e => { const t = e.firstChild; const r = document.createRange(); r.setStart(t, 8); r.setEnd(t, 18);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator(".dialog [data-stil='bold']").tap(); pg.wait_for_timeout(150)
    feld.evaluate("""e => { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator(".dialog [data-stil='underline']").tap(); pg.wait_for_timeout(100)
    pg.keyboard.type(" sofort")
    pg.locator(".dialog select").select_option("gross")
    pg.screenshot(path="s_padtext_dialog.png")
    pg.locator(".dialog [data-ja], .dialog button[type=submit], .dialog .knopf--haupt").first.click()
    s = gespeichert(pg)
    t = texte(s)
    pruefe(len(s) == 2 and len(t) == 1, "Strich und Text gespeichert")
    if t:
        print("  Text:", t[0])
        pruefe("<b>Spannzange</b>" in t[0]["h"] and "<u> sofort</u>" in t[0]["h"], "fett und unterstrichen gespeichert")
        pruefe(t[0]["g"] == "gross" and t[0]["f"] == "#ffd54f" and t[0]["p"] == [], "Grösse, Farbe, leeres p")
    el = pg.locator("[data-skizzetext]")
    pruefe(el.count() == 1 and el.locator("strong").count() == 1 and el.locator("u").count() == 1, "Text mit Auszeichnung zu sehen")
    fs1 = el.evaluate("e => parseFloat(getComputedStyle(e).fontSize)")
    pg.screenshot(path="s_padtext_klein.png")

    # Verschieben mit dem Finger
    b = el.bounding_box()
    sx, sy = b["x"] + 15, b["y"] + b["height"] / 2
    finger(pg, cdp, [(sx + i * 12, sy + i * 8) for i in range(12)])
    pruefe(pg.locator(".dialog").count() == 0, "Ziehen öffnet kein Fenster")
    t2 = texte(gespeichert(pg))[0]
    pruefe(t2["x"] > t[0]["x"] + 0.1 and t2["y"] > t[0]["y"] + 0.1, "Text verschoben und gespeichert")

    # Antippen bearbeitet: Fenster bleibt offen
    b = el.bounding_box()
    el.tap(position={"x": 10, "y": b["height"] / 2}); pg.wait_for_timeout(500)
    pruefe(pg.locator(".dialog [data-stilfeld]").count() == 1, "Antippen öffnet Bearbeiten und bleibt offen")
    if pg.locator(".dialog select").count():
        pg.locator(".dialog select").select_option("klein")
        pg.locator(".dialog .knopf--haupt").first.click()
    t3 = texte(gespeichert(pg))[0]
    pruefe(t3["g"] == "klein" and "Spannzange" in t3["h"], "Grösse geändert")

    # Rückgängig: erst Grösse, dann Verschieben zurück
    pg.locator("[data-skizze='zurueck']").tap()
    t4 = texte(gespeichert(pg))[0]
    pruefe(t4["g"] == "gross", "Rückgängig nimmt Grösse zurück")
    pg.locator("[data-skizze='zurueck']").tap()
    t5 = texte(gespeichert(pg))[0]
    pruefe(abs(t5["x"] - t[0]["x"]) < 1e-6, "Rückgängig nimmt Verschieben zurück")

    # Radierer: Antippen nimmt den Text weg, Rückgängig holt ihn zurück
    pg.locator("[data-skizze='radierer']").tap()
    el.tap(); s = gespeichert(pg)
    pruefe(len(texte(s)) == 0 and len(s) == 1, "Radierer nimmt Text weg, Strich bleibt")
    pg.locator("[data-skizze='zurueck']").tap()
    pruefe(len(texte(gespeichert(pg))) == 1, "Rückgängig holt Text zurück")
    pg.locator("[data-skizze='radierer']").tap()

    # Gross: Text grösser, bearbeiten geht auch dort
    pg.locator("[data-skizze='gross']").tap(); pg.wait_for_timeout(700)
    el = pg.locator(".pad-skizze-gross [data-skizzetext]")
    pruefe(el.count() == 1, "Text auch gross zu sehen")
    fs2 = el.evaluate("e => parseFloat(getComputedStyle(e).fontSize)") if el.count() else 0
    print("  Schrift klein / gross:", fs1, fs2)
    pruefe(fs2 > fs1 * 1.5, "Schrift wächst mit")
    pg.locator(".pad-skizze-gross [data-skizze='text']").tap(); pg.wait_for_timeout(400)
    d = pg.locator(".dialog").bounding_box()
    oben = pg.evaluate("([x, y]) => !!document.elementFromPoint(x, y).closest('.dialog')", [d["x"] + d["width"]/2, d["y"] + 20])
    pruefe(oben, "Fenster liegt über der grossen Skizze")
    pg.locator(".dialog [data-stilfeld]").click(); pg.keyboard.type("Zweiter Text")
    pg.locator(".dialog .knopf--haupt").first.click()
    pruefe(len(texte(gespeichert(pg))) == 2, "zweiter Text im Grossmodus")
    pg.screenshot(path="s_padtext_gross.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe(pg.locator(".pad-skizze-gross").count() == 0, "Escape verkleinert")

    # Löschen nimmt auch Texte weg, Rückgängig holt alles zurück
    pg.locator("[data-skizze='loeschen']").tap(); pg.wait_for_timeout(400)
    pg.locator(".dialog [data-ja]").click()
    pruefe(len(gespeichert(pg)) == 0, "Löschen leert Striche und Texte")
    pg.locator("[data-skizze='zurueck']").tap()
    pruefe(len(gespeichert(pg)) == 3, "Rückgängig nach Löschen holt alles zurück")
    pg.screenshot(path="s_padtext_ende.png")
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
