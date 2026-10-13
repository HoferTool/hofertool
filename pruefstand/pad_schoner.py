# Pad Mode: Nach einer Minute ohne Berührung zeigt das Dashboard der
# Maschine das Einrichtblatt über den ganzen Bildschirm, ein Tipp führt
# zurück (1.43.0). Ohne Auftrag und bei offenem Fenster kein Schoner.
# Die Uhr läuft mit der Uhr von Playwright vor, statt eine Minute zu warten.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
HIER = os.path.dirname(os.path.abspath(__file__))
XLSX = open(os.path.join(HIER, "einrichtblatt-beispiel.xlsx"), "rb").read()
F = FAKE.replace("blatt_url: null", "blatt_url: 'https://x.invalid/eb.xlsx'")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1
AB = os.environ.get("BILDER_ORDNER", "/tmp")
abrufe = []

def datei_route(r):
    abrufe.append(r.request.url)
    r.fulfill(status=200, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              body=XLSX, headers={"Access-Control-Allow-Origin": "*"})

SCHONER = "[data-padschoner]"
def schoner(pg): return pg.locator(SCHONER).count() == 1
def warten(pg, ms):
    pg.clock.fast_forward(ms); pg.wait_for_timeout(1300)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", datei_route)
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)

    # Auf der Liste der Maschinen: kein Schoner
    warten(pg, 61000)
    pruefe("Maschinenliste: kein Schoner", not schoner(pg))

    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(600)
    warten(pg, 30000)
    pruefe("nach 30 Sekunden noch kein Schoner", not schoner(pg))
    warten(pg, 31000)
    pruefe("nach einer Minute: Schoner da", schoner(pg))
    pg.wait_for_selector(SCHONER + " [data-excelblatt]", timeout=20000); pg.wait_for_timeout(400)
    s = pg.evaluate("""() => {
      const r = document.querySelector('[data-padschoner]').getBoundingClientRect();
      const blatt = document.querySelector('[data-padschoner] [data-excelblatt]');
      const seite = document.querySelector('[data-padschoner] [data-excelseite]').getBoundingClientRect();
      const oben = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { b: r.width, h: r.height, text: blatt.innerText,
        leiste: !!document.querySelector('[data-padschoner] .excelansicht__leiste') &&
          getComputedStyle(document.querySelector('[data-padschoner] .excelansicht__leiste')).display,
        seiteH: seite.height, seiteB: seite.width, deckel: oben && oben.hasAttribute('data-padschonerzu') };
    }""")
    print(s["b"], s["h"], s["seiteB"], s["seiteH"], s["leiste"])
    pruefe("Schoner über den ganzen Bildschirm", s["b"] == 1180 and s["h"] == 820)
    pruefe("Einrichtblatt im Schoner", "Einrichtblatt 10844-0049" in s["text"])
    pruefe("Blatt füllt die Höhe", s["seiteH"] > 760)
    pruefe("ohne Reiter und Zoom", s["leiste"] == "none")
    pruefe("Tipp landet auf dem Deckel", s["deckel"] is True)
    if bilder: pg.screenshot(path=f"{AB}/pad-schoner.png")

    # Tipp genau über dem Knopf „Zeichnung“: zurück, aber nichts öffnet sich
    pos = pg.evaluate("() => { const r = document.querySelector(\"#pad [data-padreiter='zeichnung']\").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
    pg.touchscreen.tap(pos[0], pos[1]); pg.wait_for_timeout(500)
    pruefe("Tipp: Schoner weg", not schoner(pg))
    pruefe("Tipp: wieder auf dem Dashboard, nichts geöffnet",
           pg.locator("#pad .pad-stk-zahl").count() == 1 and pg.locator(".betrachter, .dialog-huelle").count() == 0)

    # Berührung zwischendurch schiebt den Schoner hinaus
    warten(pg, 45000)
    t = pg.locator("#pad .pad__titel").bounding_box()
    pg.touchscreen.tap(t["x"] + 5, t["y"] + t["height"] / 2); pg.wait_for_timeout(300)
    warten(pg, 30000)
    pruefe("Berührung startet die Minute neu", not schoner(pg))
    warten(pg, 31000)
    pruefe("danach wieder Schoner", schoner(pg))
    n = len(abrufe)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst den Schoner, Dashboard bleibt", not schoner(pg) and pg.locator("#pad .pad-stk-zahl").count() == 1)
    warten(pg, 61000)
    pg.wait_for_selector(SCHONER + " [data-excelblatt]", timeout=20000)
    pruefe("Datei nur einmal geholt", len(abrufe) == n)
    pg.locator(SCHONER).click(); pg.wait_for_timeout(300)

    # Offenes Fenster (Zifferblock der Stückzahl): kein Schoner darüber
    pg.locator("#pad .pad-stk-zahl").click(force=True); pg.wait_for_selector(".dialog-huelle")
    warten(pg, 61000)
    pruefe("Fenster offen: kein Schoner", not schoner(pg))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    fehler += ["seite: " + x for x in f]
    ctx.close()

    # Ohne Einrichtblatt (weder an der HOCO Nr. noch am Typ): kein Schoner
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(600)
    warten(pg, 61000)
    pruefe("ohne Einrichtblatt kein Schoner", not schoner(pg))
    fehler += ["ohne: " + x for x in f]
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
