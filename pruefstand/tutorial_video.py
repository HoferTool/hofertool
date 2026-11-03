# Nimmt das Erklärvideo für HOFER-NC-PRO auf (seit 1.376.0, Wunsch Patrick
# 3. November 2026). Läuft mit dem Prüfstand, also nur mit Beispieldaten.
# Ergebnis: public/hilfe/hofer-nc-pro.mp4 (braucht ffmpeg).
#   cd pruefstand && python tutorial_video.py
import os, time, shutil, subprocess, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "public", "hilfe", "hofer-nc-pro.mp4")
B, H = 1280, 800

# Schrift unten und ein sichtbarer Mauszeiger (headless zeigt keinen)
ZUSATZ = """
(() => {
  const los = () => {
    if (document.getElementById('tut-text')) return;
    const st = document.createElement('style');
    st.textContent = `#tut-text{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483647;
      background:rgba(10,30,60,.92);color:#fff!important;font:600 22px/1.35 system-ui,sans-serif;padding:14px 22px;
      border-radius:12px;max-width:1100px;text-align:center;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35);transition:opacity .25s}
      #tut-text b{color:#ffc24a!important}
      #tut-maus{position:fixed;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;
      background:no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M3 2l14 10-6.5 1.2L14 20l-3 1.2-3.4-6.8L3 18z' fill='%23fff' stroke='%23000' stroke-width='1.4'/%3E%3C/svg%3E")}
      .tut-klick{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #ffb300;border-radius:50%;
      z-index:2147483646;pointer-events:none;animation:tutk .5s ease-out forwards}
      @keyframes tutk{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
    document.head.appendChild(st);
    const t = document.createElement('div'); t.id = 'tut-text'; t.style.opacity = 0; document.body.appendChild(t);
    const m = document.createElement('div'); m.id = 'tut-maus'; m.style.left = '-50px'; document.body.appendChild(m);
    addEventListener('mousemove', (e) => { m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { const k = document.createElement('div'); k.className = 'tut-klick';
      k.style.left = e.clientX + 'px'; k.style.top = e.clientY + 'px'; document.body.appendChild(k); setTimeout(() => k.remove(), 600); }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', los); else los();
})();
"""

server_starten(); time.sleep(0.4)
ordner = tempfile.mkdtemp()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    kx = br.new_context(viewport={"width": B, "height": H}, record_video_dir=ordner, record_video_size={"width": B, "height": H})
    kx.add_init_script(ZUSATZ)
    pg = kx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    t0 = time.time()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/kontur']"); pg.click("[data-unter='nc/kontur']")
    pg.wait_for_selector("#kt-code")
    # Pablo und Seitenleiste stören im Bild nicht, aber die Seite soll oben stehen
    pg.add_style_tag(content="#pablo-zeichen, .pablo-zeichen { display: none !important; }")
    pg.mouse.move(640, 400)
    pg.wait_for_timeout(800)
    start = time.time() - t0

    def text(t, ms=2600):
        pg.evaluate("(t) => { const e = document.getElementById('tut-text'); e.innerHTML = t; e.style.opacity = t ? 1 : 0; }", t)
        if ms: pg.wait_for_timeout(ms)

    def hin(sel, klick=True, ms=500):
        el = pg.locator(sel).first
        el.scroll_into_view_if_needed()
        b = el.bounding_box()
        pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=18)
        pg.wait_for_timeout(250)
        if klick: pg.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        pg.wait_for_timeout(ms)

    def tippen(sel, wert):
        hin(sel, ms=150)
        pg.keyboard.press("Control+a"); pg.keyboard.type(wert, delay=110); pg.wait_for_timeout(350)

    text("Willkommen bei <b>HOFER-NC-PRO</b>: Drehkontur Element für Element aufbauen<br>und das fertige NC-Programm für die Star erhalten.", 4200)
    text("Links die <b>Liste der Elemente</b>, rechts die <b>Grafik</b> und darunter das <b>NC-Programm</b>.", 3800)

    text("<b>1.</b> Mit <b>„Neu“</b> beginnst du eine leere Kontur.", 1200)
    hin("#kt-neu", ms=700)
    hin(".dialog-huelle .knopf--haupt, .dialog-huelle .knopf--gefahr", ms=700)

    text("<b>2.</b> Startpunkt eintragen: <b>X</b> ist der Durchmesser, <b>Z</b> die Länge.", 900)
    tippen("[data-ktfeld='startX']", "0")
    tippen("[data-ktfeld='startZ']", "0")
    pg.wait_for_timeout(600)

    text("<b>3.</b> <b>„+ Gerade“</b> hängt ein Element an. X und Z eintippen,<br>ein leeres Feld heisst: bleibt gleich.", 1400)
    hin("[data-kt='gerade']", ms=500)
    tippen("[data-ktel='0'] [data-ktfeld='x']", "10")
    pg.wait_for_timeout(700)
    hin("[data-kt='gerade']", ms=400)
    tippen("[data-ktel='1'] [data-ktfeld='z']", "12")
    pg.wait_for_timeout(700)

    text("<b>4.</b> Ecke verrunden: beim Element <b>Übergang „Radius“</b> wählen und das Mass eintragen.", 1200)
    hin("[data-kt='gerade']", ms=400)
    tippen("[data-ktel='2'] [data-ktfeld='x']", "16")
    hin("[data-ktel='1'] [data-ktfeld='ueb']", ms=300)
    pg.select_option("[data-ktel='1'] [data-ktfeld='ueb']", "R"); pg.wait_for_timeout(300)
    tippen("[data-ktel='1'] [data-ktfeld='uw']", "0.5")
    pg.wait_for_timeout(1200)

    text("<b>5.</b> <b>„+ Bogen“</b>: Endpunkt und Radius eintragen, die Drehrichtung wechselt der <b>Pfeil</b>.", 1200)
    hin("[data-ktel='2'] [data-ktfeld='z']", ms=300)
    hin("[data-kt='bogen']", ms=400)
    tippen("[data-ktel='3'] [data-ktfeld='x']", "20")
    tippen("[data-ktel='3'] [data-ktfeld='z']", "16")
    tippen("[data-ktel='3'] [data-ktfeld='r']", "4")
    pg.wait_for_timeout(600)
    hin("[data-ktel='3'] [data-ktfeld='dreh']", ms=900)
    hin("[data-ktel='3'] [data-ktfeld='dreh']", ms=900)

    text("<b>6.</b> Oder mit der Maus: <b>„Zeichnen“</b> und in die Grafik klicken.<br>Waagrecht und senkrecht <b>rasten ein</b> (grüne Linie mit Winkelzeichen).", 1500)
    hin("#kt-zeichnen", ms=500)
    ende = pg.evaluate("""() => { const l = document.querySelector('.kt-bild'); const r = l.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }""")
    pg.mouse.move(ende[0] + ende[2] * 0.6, ende[1] + ende[3] * 0.5, steps=15); pg.wait_for_timeout(400)
    e2 = pg.evaluate("""() => { const l = document.querySelector('.kt-gummi'); const m = l.ownerSVGElement.getScreenCTM();
      const p = new DOMPoint(+l.getAttribute('x1'), +l.getAttribute('y1')).matrixTransform(m); return [p.x, p.y]; }""")
    pg.mouse.move(e2[0] + 70, e2[1] - 30, steps=15); pg.wait_for_timeout(500)
    pg.mouse.move(e2[0] + 90, e2[1] + 3, steps=20); pg.wait_for_timeout(900)
    pg.mouse.click(e2[0] + 90, e2[1] + 3); pg.wait_for_timeout(900)
    text("Mit <b>Tab</b> springst du in die Felder X und Z direkt bei der Maus und tippst den Punkt genau ein.", 1000)
    pg.mouse.move(e2[0] + 140, e2[1] - 40, steps=15); pg.wait_for_timeout(300)
    pg.keyboard.press("Tab"); pg.wait_for_timeout(300)
    pg.keyboard.type("30", delay=120); pg.keyboard.press("Tab"); pg.keyboard.type("25", delay=120); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    hin("#kt-zeichnen", ms=600)
    hin("#kt-zurueck", klick=False, ms=200)
    text("Vertippt? <b>„↶ Rückgängig“</b> nimmt die letzte Änderung zurück.", 2600)

    text("<b>7.</b> Klick auf eine Linie in der Grafik: das Element ist in der Liste gewählt<br>und seine Zeilen im NC-Programm leuchten <b>orange</b>.", 900)
    hin("#kt-bild [data-kttreffer='3']", ms=2200) if pg.locator("#kt-bild [data-kttreffer='3']").count() else None
    hin("#kt-code [data-ktnc]", ms=1800)

    text("<b>8.</b> Zoomen mit dem <b>Mausrad</b>, ziehen verschiebt, <b>„Alles“</b> zeigt wieder die ganze Kontur.", 600)
    b = pg.locator("#kt-bild").bounding_box()
    pg.mouse.move(b["x"] + b["width"] * 0.45, b["y"] + b["height"] * 0.5, steps=12)
    for i in range(5): pg.mouse.wheel(0, -120); pg.wait_for_timeout(220)
    pg.mouse.down(); pg.mouse.move(b["x"] + b["width"] * 0.6, b["y"] + b["height"] * 0.55, steps=15); pg.mouse.up()
    pg.wait_for_timeout(600)
    hin("#kt-zoom-alles", ms=1200)

    text("<b>9.</b> Werkzeug: <b>Plattenradius</b>, Vorschub und <b>Schneidenlage</b> (Star aussen: unten rechts).<br>Der Radius ist im Programm schon eingerechnet, ohne G41/G42.", 900)
    tippen("[data-ktfeld='rn']", "0.4")
    hin("[data-ktspitze='ur']", ms=2600)

    text("<b>10.</b> <b>3D-Modell</b>: eine STEP-Datei wählen, die Seitenkontur wird daraus gelesen.", 900)
    hin("label:has(#kt-step)", klick=False, ms=600)
    pg.set_input_files("#kt-step", os.path.join(HIER, "kontur-test.step"))
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(1500)
    text("Oben steht die erkannte <b>Drehachse</b>. In der 3D-Ansicht dreht Ziehen das Modell,<br>ein angetippter <b>Kreis</b> wählt eine andere Achse.", 1000)
    m3 = pg.locator("#kt-modell-3d").bounding_box()
    if m3:
        pg.mouse.move(m3["x"] + m3["width"] * 0.4, m3["y"] + m3["height"] * 0.5, steps=10)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.6, m3["y"] + m3["height"] * 0.45, steps=25); pg.mouse.up()
    pg.wait_for_timeout(1800)
    text("Ein Element der Vorschau antippen lässt es <b>weg</b> (rot gestrichelt), die Kontur geht dort gerade durch.", 900)
    if pg.locator("[data-ktstueck]").count():
        st = pg.locator("[data-ktstueck]").nth(min(2, pg.locator("[data-ktstueck]").count() - 1))
        bb = st.bounding_box()
        if bb:
            pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=15); pg.wait_for_timeout(300)
            st.dispatch_event("click"); pg.wait_for_timeout(1600)
            st.dispatch_event("click"); pg.wait_for_timeout(600)
    text("<b>Aussen- oder Innenkontur</b>, <b>„Andere Seite vorne“</b> und <b>Z0</b> verschieben, dann <b>„Übernehmen“</b>.", 900)
    hin("[data-ktmodell='umdrehen']", ms=1000)
    hin("[data-ktmodell='umdrehen']", ms=700)
    hin("#kt-modell-ok", ms=1500)

    text("<b>11.</b> <b>„Speichern“</b> legt Kontur und NC-Programm für alle ab, <b>„Öffnen“</b> holt sie wieder.<br><b>„Als Datei“</b> oder <b>„Kopieren“</b> bringt das Programm an die Maschine.", 900)
    hin("#kt-speichern", klick=False, ms=1300)
    hin("#kt-datei", klick=False, ms=2400)
    text("Vor dem ersten Lauf das Programm immer <b>am Simulator prüfen</b>.<br>Dieses Video gibt es jederzeit wieder über <b>„▶ Anleitung“</b>. Viel Erfolg!", 400)
    hin("#kt-anleitung", klick=False, ms=4200)
    dauer = time.time() - t0
    video = pg.video.path()
    kx.close(); br.close()

os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", video,
                "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                "-r", "25", "-movflags", "+faststart", "-an", ZIEL], check=True)
shutil.rmtree(ordner, ignore_errors=True)
print("Video:", os.path.abspath(ZIEL), round(os.path.getsize(ZIEL) / 1e6, 2), "MB")
