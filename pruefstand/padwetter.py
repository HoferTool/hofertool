# Pad Mode: rechts Wetter Stunde für Stunde mit Regen, „Als Nächstes“ ist weg,
# die Skizze bleibt darunter.
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
  "daily": {"sunset": [jetzt.strftime("%Y-%m-%d") + "T18:52"]}}
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("tablet", {"width":1180,"height":820}), ("tablet_hoch", {"width":820,"height":1180})]:
        pg = br.new_context(viewport=vp, has_touch=True).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        pg.route("**://api.open-meteo.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(WETTER)))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
        pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1800)
        txt = pg.locator("#pad").inner_text()
        pruefe("Als Nächstes" not in txt, name + ": „Als Nächstes“ ist weg")
        n = pg.evaluate("() => [...document.querySelectorAll('#pad .pad-stunde')].filter(z => getComputedStyle(z).visibility !== 'hidden').length")
        pruefe(n >= 5, name + ": mindestens 5 Stunden sichtbar (" + str(n) + ")")
        # keine Stunde halb abgeschnitten, und Skizze über den Knöpfen
        halb = pg.evaluate("""() => { const l = document.querySelector('#pad .pad-stunden2'); const r = l.getBoundingClientRect();
          return [...l.children].filter(z => getComputedStyle(z).visibility !== 'hidden' && z.getBoundingClientRect().bottom > r.bottom + 1).length; }""")
        pruefe(halb == 0, name + ": keine Stunde abgeschnitten")
        knopf = pg.locator("#pad .pad-fuss, #pad [data-padknoepfe]").first
        skb = pg.locator("#pad .pad-karte2--skizze").bounding_box()
        flb = pg.locator("#pad .pad-flaeche").bounding_box()
        pruefe(skb["y"] + skb["height"] <= flb["y"] + flb["height"] + 1, name + ": Skizze bleibt in der Fläche")
        erste = pg.locator("#pad .pad-stunde b").first.inner_text()
        pruefe(erste == jetzt.strftime("%H") + ".00", name + ": beginnt mit laufender Stunde " + erste)
        pruefe("%" in pg.locator("#pad .pad-stunde").first.inner_text(), name + ": Regen in Prozent")
        pruefe(pg.locator("#pad .pad-karte2--skizze").count() == 1, name + ": Skizze ist noch da")
        sk = pg.locator("#pad .pad-karte2--skizze").bounding_box()
        pruefe(sk and sk["height"] >= 150, name + ": Skizze hat Platz (" + str(round(sk["height"])) + ")")
        uhr = pg.locator("#pad-uhr").bounding_box()
        pruefe(uhr["height"] < 60, name + ": Uhr auf einer Zeile")
        ueber = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth")
        pruefe(not ueber, name + ": nichts ragt seitlich heraus")
        pg.screenshot(path=f"s_padwetter_{name}.png")
        fehler += f
        pg.close()
    br.close()
print("Fehler:", fehler if fehler else "keine")
