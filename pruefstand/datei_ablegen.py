# Dateien ablegen (1.189.0): eine Datei auf die Seite ziehen füllt das
# nächste Dateifeld, Knöpfe mit data-ablegen bekommen sie statt des
# Auswahlfensters, unpassende Dateien geben eine Meldung.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
DXF = "0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\n0\n10\n0\n20\n0\n40\n5\n0\nENDSEC\n0\nEOF\n"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    pg.wait_for_selector("[data-rech='dxf']"); pg.click("[data-rech='dxf']")
    pg.wait_for_selector("pre.gcode")

    def ziehen(sel, name, art, inhalt, ablegen=True):
        return pg.evaluate("""([sel, name, art, inhalt, ablegen]) => {
          const el = document.querySelector(sel);
          const dt = new DataTransfer();
          dt.items.add(new File([inhalt], name, { type: art }));
          const r = el.getBoundingClientRect();
          const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + 5, clientY: r.y + 5 };
          const ueber = new DragEvent("dragover", o);
          el.dispatchEvent(ueber);
          const markiert = !!document.querySelector(".datei-ablegen-ziel");
          if (ablegen) el.dispatchEvent(new DragEvent("drop", o));
          return { erlaubt: ueber.defaultPrevented, markiert,
                   nachher: !!document.querySelector(".datei-ablegen-ziel") };
        }""", [sel, name, art, inhalt, ablegen])

    r = ziehen("#rech-inhalt svg", "teil.dxf", "", DXF)
    pruefe("Beim Ziehen hervorgehoben", r["erlaubt"] and r["markiert"] and not r["nachher"])
    pg.wait_for_timeout(500)
    pruefe("DXF abgelegt und gelesen", "1 Kontur" in pg.inner_text("body"))

    r = ziehen("#rech-inhalt svg", "bild.png", "image/png", "x")
    pg.wait_for_timeout(300)
    pruefe("Unpassende Datei: Meldung", "passt hier nicht" in pg.inner_text("body"))

    # Knopf, der sein Feld erst beim Antippen baut
    pg.evaluate("""() => {
      const k = document.createElement("button"); k.id = "probe-knopf"; k.dataset.ablegen = ""; k.textContent = "Bild wählen";
      k.onclick = () => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*";
        f.onchange = () => { window.probeName = f.files[0].name; }; f.click(); };
      document.body.appendChild(k);
    }""")
    ziehen("#probe-knopf", "foto.jpg", "image/jpeg", "x")
    pg.wait_for_timeout(200)
    pruefe("Knopf mit data-ablegen bekommt die Datei", pg.evaluate("window.probeName") == "foto.jpg")

    # Ohne Ziel: nichts passiert, Seite bleibt
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_timeout(800)
    r = ziehen("#inhalt", "x.pdf", "application/pdf", "x", ablegen=False)
    pruefe("Ohne Dateifeld: Browser öffnet die Datei nicht, keine Markierung",
           r["erlaubt"] and not r["markiert"])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
