# Pad Mode auf dem Handy (111.77.0): hochkant und quer geht alles auf,
# nichts ragt seitlich heraus, das Dashboard rollt, alle Knöpfe sind
# erreichbar, die Skizze bleibt ein Blatt 16:10. Am iPad unverändert.
import time, json, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.pad_skizzen = daten.pad_skizzen || [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
RAUS = """() => { const r = [];
  document.querySelectorAll('#pad *').forEach(e => { const b = e.getBoundingClientRect();
    if (b.width && !e.closest('.pad-skizze__textblatt') && (b.right > innerWidth + 1 || b.left < -1)) r.push(e.className); });
  return r.slice(0, 5).concat(document.documentElement.scrollWidth > innerWidth ? ['seite'] : []); }"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, w, h, handy in [("hochkant", 390, 844, True), ("klein", 360, 740, True), ("quer", 844, 390, True), ("ipad", 1180, 820, False)]:
        pg = br.new_context(viewport={"width":w,"height":h}, is_mobile=handy, has_touch=True).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(900)
        pruefe(not pg.evaluate(RAUS), name + ": Start passt in die Breite")
        pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(800)
        pruefe(not pg.evaluate(RAUS), name + ": Parks passen in die Breite")
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(800)
        pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
        pruefe(pg.locator("#pad .pad-flaeche").count() == 1, name + ": Dashboard offen")
        pruefe(not pg.evaluate(RAUS), name + ": Dashboard passt in die Breite " + str(pg.evaluate(RAUS)))
        kh = pg.locator("#pad .pad__titel").bounding_box()["height"]
        pruefe(kh < 40, name + ": Maschinenname einzeilig (" + str(round(kh)) + ")")
        fl = pg.locator("#pad .pad-skizze__flaeche").bounding_box()
        pruefe(abs(fl["height"] / fl["width"] - 0.625) < 0.02 and fl["width"] > 150, name + ": Skizze 16:10 (" + str(round(fl["width"])) + ")")
        if handy:
            pruefe(pg.evaluate("() => { const p = document.getElementById('pad'); return p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY === 'auto'; }"), name + ": Pad rollt")
            pg.locator("#pad [data-padstatus]").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            b = pg.locator("#pad [data-padstatus]").bounding_box()
            pruefe(b["y"] >= 0 and b["y"] + b["height"] <= h + 1 and b["height"] >= 44, name + ": Zustandsknopf erreichbar und gross genug")
            pg.locator("#pad [data-padfeld='stand']").scroll_into_view_if_needed()
            pg.locator("#pad [data-padfeld='stand']").click(); pg.wait_for_timeout(600)
            ja = pg.locator("[data-zbja]").bounding_box()
            pruefe(ja["y"] + ja["height"] <= h + 1, name + ": Zifferblock „Eintragen“ sichtbar")
            pg.locator("[data-zbnein]").click(); pg.wait_for_timeout(400)
        else:
            pruefe(pg.evaluate("() => document.getElementById('pad').scrollHeight <= innerHeight + 1"), name + ": iPad passt ohne Rollen wie bisher")
            pruefe("Schliessen" in pg.locator("#pad .pad__zu").inner_text(), name + ": „Schliessen“ ausgeschrieben")
        pruefe(not f, name + ": keine Seitenfehler " + str(f[:1]))
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
