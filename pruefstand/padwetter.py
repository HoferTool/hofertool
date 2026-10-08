# Pad Mode rechts: Wetter Stunde für Stunde nebeneinander mit Regen, „Als
# Nächstes“ ist weg, Skizze darunter mit allen Knöpfen auf einer Zeile und
# Farbwähler. Dazu Schriftgrösse der Info und Kacheln in der Themenfarbe.
import time, json, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
jetzt = datetime.datetime.now().replace(minute=0, second=0, microsecond=0)
zeiten = [(jetzt + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(-3, 45)]
WETTER = {"current": {"temperature_2m": 11.4, "weather_code": 2},
  "hourly": {"time": zeiten, "temperature_2m": [8 + (i % 7) for i in range(len(zeiten))],
             "weather_code": [[0, 2, 3, 61, 80][i % 5] for i in range(len(zeiten))],
             "precipitation_probability": [(i * 13) % 100 for i in range(len(zeiten))]},
  "daily": {"time": [(jetzt + datetime.timedelta(days=t)).strftime("%Y-%m-%d") for t in range(7)],
            "weather_code": [[0, 2, 3, 61, 80, 71, 95][t] for t in range(7)],
            "temperature_2m_max": [14.4 + t for t in range(7)],
            "temperature_2m_min": [3.6 + t for t in range(7)],
            "precipitation_probability_max": [t * 15 for t in range(7)],
            "sunset": [jetzt.strftime("%Y-%m-%d") + "T18:52"]}}
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.pad_skizzen = daten.pad_skizzen || [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("tablet", {"width":1180,"height":820}), ("tablet_hoch", {"width":820,"height":1180}), ("breit", {"width":2000,"height":1250})]:
        pg = br.new_context(viewport=vp).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        pg.route("**://api.open-meteo.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(WETTER)))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
        pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1800)
        pg.screenshot(path=f"s_padwetter_{name}.png")
        pruefe("Als Nächstes" not in pg.locator("#pad").inner_text(), name + ": „Als Nächstes“ ist weg")
        n = pg.locator("#pad .pad-wettertag").count()
        pruefe(n == 6, name + ": 6 Tage (" + str(n) + ")")
        ys = pg.evaluate("() => [...document.querySelectorAll('#pad .pad-stunde')].map(z => Math.round(z.getBoundingClientRect().top))")
        pruefe(len(set(ys)) == 1, name + ": Tage nebeneinander")
        erste = pg.locator("#pad .pad-wettertag b").first.inner_text()
        pruefe(erste == "Heute", name + ": beginnt mit Heute (" + erste + ")")
        zweite = pg.locator("#pad .pad-wettertag b").nth(1).inner_text()
        morgen = ["Mo","Di","Mi","Do","Fr","Sa","So"][(jetzt + datetime.timedelta(days=1)).weekday()]
        pruefe(zweite == morgen, name + ": dann Wochentag " + zweite)
        t0 = pg.locator("#pad .pad-wettertag").first.inner_text()
        pruefe("14°" in t0 and "4°" in t0, name + ": Höchst- und Tiefstwert " + t0.replace(chr(10), " "))
        pruefe("%" in pg.locator("#pad .pad-wettertag").nth(1).inner_text(), name + ": Regen in Prozent")
        # Uhr läuft live: Zeit des Browsers eine Minute vorstellen
        vor = pg.locator("#pad-uhr").inner_text()
        pg.evaluate("""() => { const D = Date, plus = 61000; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + plus])); } static now() { return D.now() + plus; } }; document.dispatchEvent(new Event('visibilitychange')); }""")
        pg.wait_for_timeout(1200)
        nach = pg.locator("#pad-uhr").inner_text()
        pruefe(vor != nach, name + ": Uhr läuft weiter " + vor.replace(chr(10), "") + " -> " + nach.replace(chr(10), ""))
        pg.evaluate("() => { window.Date = Object.getPrototypeOf(window.Date); }")
        ys = pg.evaluate("() => [...document.querySelectorAll('#pad .pad-skizze__leiste > *')].map(z => Math.round(z.getBoundingClientRect().top + z.getBoundingClientRect().height / 2))")
        pruefe(len(ys) == 6 and max(ys) - min(ys) <= 2, name + ": Zeichenknöpfe auf einer Zeile " + str(ys))
        lb = pg.locator("#pad .pad-skizze__leiste").bounding_box(); kb = pg.locator("#pad .pad-karte2--skizze").bounding_box()
        pruefe(lb["x"] + lb["width"] <= kb["x"] + kb["width"], name + ": Leiste passt in die Kachel")
        flb = pg.locator("#pad .pad-flaeche").bounding_box()
        pruefe(kb["height"] >= 200 and kb["y"] + kb["height"] <= flb["y"] + flb["height"] + 1, name + ": Skizze hat Platz (" + str(round(kb["height"])) + ")")
        pruefe(pg.locator("#pad-uhr").bounding_box()["height"] < 60, name + ": Uhr auf einer Zeile")
        pruefe(not pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"), name + ": nichts ragt seitlich heraus")
        # Farbe über den Farbwähler, dann zeichnen: Strich hat die Farbe
        pg.locator("[data-skizzefarbwahl]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#12ab34'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
        pg.wait_for_timeout(100)
        cv = pg.locator("#pad .pad-skizze__leinwand").bounding_box()
        pg.mouse.move(cv["x"] + 30, cv["y"] + 30); pg.mouse.down(); pg.mouse.move(cv["x"] + 90, cv["y"] + 60, steps=6); pg.mouse.up()
        pg.wait_for_timeout(1000)
        sk = pg.evaluate("() => (TEST.daten.pad_skizzen || []).map(x => (x.striche || []).map(s => s.f)).flat()")
        pruefe("#12ab34" in sk, name + ": Strich in gewählter Farbe " + str(sk[-1:]))
        pruefe(pg.locator("[data-skizzefarbe]").count() == 0, name + ": keine eigenen Knöpfe Weiss und Schwarz mehr")
        d0 = pg.locator("[data-skizzedicke]").get_attribute("data-skizzedicke")
        pg.locator("[data-skizzedicke]").click(); pg.wait_for_timeout(100)
        pruefe(d0 == "mittel" and pg.locator("[data-skizzedicke]").get_attribute("data-skizzedicke") == "dick", name + ": Stiftdicke wechselt, Start mittel")
        # Schriftgrösse der Info
        pg.locator("#pad .pad-info").click(); pg.wait_for_timeout(500)
        pg.locator(".dialog [data-stilfeld]").evaluate("e => { e.innerHTML = 'Masse 7 <b>jede Stunde</b>'; }")
        pg.locator(".dialog select").select_option("gross")
        pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
        pruefe(pg.locator("#pad .pad-info").get_attribute("data-schrift") == "gross", name + ": Schrift gross gespeichert")
        fs = pg.evaluate("() => getComputedStyle(document.querySelector('#pad .pad-info p') || document.body).fontSize")
        pruefe(fs == "33.6px", name + ": Info in grosser Schrift (" + fs + ")")
        pruefe("schrift" not in pg.locator("#pad .pad-info").inner_text(), name + ": Vermerk unsichtbar")
        pg.locator("#pad .pad-info").click(); pg.wait_for_timeout(500)
        pruefe(pg.locator(".dialog select").input_value() == "gross", name + ": Fenster zeigt gewählte Grösse")
        pg.locator(".dialog [data-nein]").click(); pg.wait_for_timeout(300)
        # Themenfarbe rosa: Dashboard-Kacheln bleiben bläulich (Wunsch 6. Oktober 2026)
        vor = pg.evaluate("() => getComputedStyle(document.querySelector('#pad .pad-karte2--hoco')).backgroundImage")
        pg.evaluate("() => document.body.setAttribute('data-thema', 'rosa')"); pg.wait_for_timeout(200)
        nach = pg.evaluate("() => getComputedStyle(document.querySelector('#pad .pad-karte2--hoco')).backgroundImage")
        pruefe(vor == nach, name + ": HOCO-Kachel bleibt bläulich")
        # Auf der Maschinenwahl: Rahmen beim Drüberfahren in der Themenfarbe
        pg.locator("#pad [data-padzurueck]").click(); pg.wait_for_timeout(900)
        k = pg.locator("#pad .pad-kachel").first
        k.hover(); pg.wait_for_timeout(400)
        rahmen = k.evaluate("e => getComputedStyle(e).borderTopColor")
        print("   Rahmen beim Drüberfahren:", rahmen)
        pruefe("107, 164, 255" not in rahmen and rahmen != "rgba(0, 0, 0, 0)", name + ": Rahmen beim Drüberfahren in Themenfarbe")
        pg.screenshot(path=f"s_padwetter_{name}_rosa.png")
        fehler += f
        pg.close()
    br.close()
print("Fehler:", fehler if fehler else "keine")
