# Pad Mode: Tipp aufs Wetter öffnet das Wetterfenster mit Jetzt, 24 Stunden
# und 7 Tagen (Wunsch Patrick 9. Oktober 2026). Escape schliesst es.
import time, json, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
jetzt = datetime.datetime.now().replace(minute=0, second=0, microsecond=0)
zeiten = [(jetzt + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(-3, 160)]
n = len(zeiten)
tage = [(jetzt + datetime.timedelta(days=t)).strftime("%Y-%m-%d") for t in range(7)]
WETTER = {"current": {"temperature_2m": 11.4, "apparent_temperature": 9.2, "relative_humidity_2m": 78,
                      "precipitation": 0, "weather_code": 2, "wind_speed_10m": 12.3, "wind_direction_10m": 250,
                      "wind_gusts_10m": 31, "is_day": 1},
  "hourly": {"time": zeiten, "temperature_2m": [8 + (i % 7) for i in range(n)],
             "weather_code": [[0, 2, 3, 61, 80][i % 5] for i in range(n)],
             "precipitation_probability": [(i * 13) % 100 for i in range(n)],
             "precipitation": [((i * 7) % 5) / 2 for i in range(n)],
             "wind_speed_10m": [5 + i % 20 for i in range(n)], "is_day": [1 if 7 <= (jetzt.hour + i - 3) % 24 <= 18 else 0 for i in range(n)],
             "uv_index": [2] * n},
  "daily": {"time": tage,
            "weather_code": [0, 2, 3, 61, 80, 71, 95],
            "temperature_2m_max": [14.4 + t for t in range(7)],
            "temperature_2m_min": [3.6 + t for t in range(7)],
            "precipitation_sum": [t * 1.3 for t in range(7)],
            "precipitation_probability_max": [t * 15 for t in range(7)],
            "wind_speed_10m_max": [10 + t for t in range(7)], "wind_gusts_10m_max": [30 + t for t in range(7)],
            "sunrise": [d + "T07:41" for d in tage], "sunset": [d + "T18:52" for d in tage],
            "uv_index_max": [3.2] * 7, "sunshine_duration": [3600 * (7 - t) for t in range(7)]}}
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.pad_skizzen = daten.pad_skizzen || [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("tablet", {"width":1180,"height":820}), ("tablet_hoch", {"width":820,"height":1180}), ("handy", {"width":390,"height":844})]:
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
        pg.locator("#pad [data-wetteroeffnen]").click(); pg.wait_for_timeout(900)
        d = pg.locator(".dialog--wetter")
        pruefe(d.count() == 1, name + ": Wetterfenster offen")
        txt = d.inner_text()
        pruefe("gefühlt" in txt.lower() and "9°" in txt, name + ": gefühlte Temperatur")
        pruefe("12 km/h W" in txt and "31 km/h" in txt, name + ": Wind und Böen")
        pruefe("78 %" in txt, name + ": Feuchte")
        pruefe("07:41" in txt and "18:52" in txt, name + ": Sonnenauf- und -untergang")
        ns = pg.locator(".wf-stunde").count()
        pruefe(ns == 24, name + ": 24 Stunden (" + str(ns) + ")")
        pruefe(pg.locator(".wf-stunde b").first.inner_text() == "Jetzt", name + ": beginnt mit Jetzt")
        pruefe(pg.locator(".wf-kurve circle").count() == 24, name + ": Temperaturkurve")
        nt = pg.locator(".wf-tag").count()
        pruefe(nt == 7, name + ": 7 Tage (" + str(nt) + ")")
        pruefe("Heute" in pg.locator(".wf-tag").first.inner_text(), name + ": erster Tag Heute")
        db = d.bounding_box()
        pruefe(db["x"] >= 0 and db["x"] + db["width"] <= vp["width"] + 1, name + ": Fenster passt in die Breite")
        ueber = pg.evaluate("() => [...document.querySelectorAll('.wf-tag')].some(t => t.scrollWidth > t.clientWidth + 1)")
        pruefe(not ueber, name + ": Tageszeilen ragen nicht heraus")
        pg.screenshot(path=f"s_wetterfenster_{name}.png")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pruefe(pg.locator(".dialog--wetter").count() == 0, name + ": Escape schliesst")
        pg.locator("#pad [data-padtage]").click(); pg.wait_for_timeout(600)
        pruefe(pg.locator(".dialog--wetter").count() == 1, name + ": Tipp auf die Tage öffnet auch")
        pg.locator(".wf-zu").click(); pg.wait_for_timeout(300)
        pruefe(pg.locator(".dialog--wetter").count() == 0 and pg.locator("#pad .pad-karte2--saeule").count() == 1, name + ": Schliessen, Pad bleibt")
        fehler += f
        pg.close()
    br.close()
print("Fehler:", fehler if fehler else "keine")
