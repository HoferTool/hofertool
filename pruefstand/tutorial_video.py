# Nimmt das Erklärvideo für HOFER-NC-PRO auf (seit 1.376.0, Wunsch Patrick
# 3. November 2026). Läuft mit dem Prüfstand, also nur mit Beispieldaten.
# Ergebnis: public/hilfe/hofer-nc-pro.mp4 (braucht ffmpeg).
# Seit 1.377.0 mit Sprecher (Wunsch Patrick 3. November 2026: „etwas
# detaillierter und mit Ton“): tiefe deutsche Männerstimme aus Piper
# (pip install piper-tts, Stimme de-thorsten-low aus den Piper-Releases auf
# GitHub, Pfad in STIMME), mit etwas Trailer-Klang. Eine echte Person wird
# bewusst nicht nachgeahmt.
#   cd pruefstand && STIMME=/pfad/de-thorsten-low.onnx python tutorial_video.py
import os, sys, time, shutil, subprocess, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "public", "hilfe", "hofer-nc-pro.mp4")
B, H = 1280, 800
STIMME = os.environ.get("STIMME", "/tmp/claude-0/tts/de-thorsten-low.onnx")

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


# ---- Drehbuch: (gesprochen, Untertitel, Handlung) --------------------------
# Gesprochen ist so geschrieben, wie es klingen soll (Zahlen ausgeschrieben).
SCHRITTE = []
def schritt(sprechen, zeile):
    def deko(f):
        SCHRITTE.append((sprechen, zeile, f)); return f
    return deko

def ton_machen(ordner):
    """Jede Zeile einzeln sprechen lassen, tiefer und mit etwas Hall."""
    dauer = []
    for i, (sprechen, _, _) in enumerate(SCHRITTE):
        roh = os.path.join(ordner, f"r{i}.wav"); fertig = os.path.join(ordner, f"t{i}.wav")
        subprocess.run([sys.executable, "-m", "piper", "-m", STIMME, "-f", roh, "--length-scale", "1.08",
                        "--sentence-silence", "0.35"], input=sprechen.encode("utf-8"), check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", roh, "-af",
                        "asetrate=16000*0.9,aresample=44100,atempo=1.111,"
                        "equalizer=f=110:t=q:w=1:g=5,acompressor=threshold=-20dB:ratio=3:makeup=2,"
                        "aecho=0.8:0.45:38:0.12,loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-ac", "1", fertig], check=True)
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fertig],
                                 capture_output=True, text=True).stdout.strip())
        dauer.append(d)
    return dauer

# ---------------------------------------------------------------------------
@schritt("Willkommen bei Hofer N C Pro. In den nächsten Minuten zeige ich dir Schritt für Schritt, "
         "wie du eine Drehkontur aufbaust und daraus das fertige N C Programm für die Star bekommst.",
         "Willkommen bei <b>HOFER-NC-PRO</b>: Drehkontur aufbauen,<br>NC-Programm für die Star erhalten.")
def s_willkommen(pg, a): pg.wait_for_timeout(300)

@schritt("Links steht die Liste der Elemente. Rechts oben siehst du die Grafik deiner Kontur, "
         "und darunter das N C Programm, das sich bei jeder Änderung sofort mitrechnet.",
         "Links die <b>Elemente</b>, rechts die <b>Grafik</b> und darunter das <b>NC-Programm</b>.")
def s_ueberblick(pg, a):
    a.hin(".kt-liste", klick=False, ms=1500); a.hin("#kt-bild", klick=False, ms=1500); a.hin("#kt-code", klick=False, ms=800)

@schritt("Wir beginnen mit einer leeren Kontur. Tippe oben auf Neu und bestätige die Frage.",
         "<b>1.</b> <b>„Neu“</b> beginnt eine leere Kontur.")
def s_neu(pg, a):
    a.hin("#kt-neu", ms=700); a.hin(".dialog-huelle .knopf--haupt, .dialog-huelle .knopf--gefahr", ms=500)

@schritt("Zuerst der Startpunkt. X ist immer der Durchmesser, Z die Länge. "
         "Wir starten in der Mitte vorne, also X null und Z null.",
         "<b>2.</b> Startpunkt: <b>X</b> = Durchmesser, <b>Z</b> = Länge.")
def s_start(pg, a):
    a.tippen("[data-ktfeld='startX']", "0"); a.tippen("[data-ktfeld='startZ']", "0")

@schritt("Mit plus Gerade hängst du ein Element an. Der Cursor springt gleich ins Feld X. "
         "Wir fahren plan hoch auf Durchmesser zehn. Z bleibt leer, das heisst: Z bleibt gleich.",
         "<b>3.</b> <b>„+ Gerade“</b>: X oder Z eintippen. Leer = bleibt gleich.")
def s_gerade1(pg, a):
    a.dazu("gerade", ms=500); a.tippen("[data-ktel='0'] [data-ktfeld='x']", "10")

@schritt("Das nächste Element ist der Zylinder. Nochmals plus Gerade, dann Z zwölf eintippen. X bleibt leer.",
         "Zylinder: <b>Z 12</b> eintippen, X bleibt leer.")
def s_gerade2(pg, a):
    a.dazu("gerade", ms=400); a.tippen("[data-ktel='1'] [data-ktfeld='z']", "12")

@schritt("Dann wieder plan hoch auf Durchmesser sechzehn.",
         "Plan hoch auf <b>X 16</b>.")
def s_gerade3(pg, a):
    a.dazu("gerade", ms=400); a.tippen("[data-ktel='2'] [data-ktfeld='x']", "16")

@schritt("Eine schräge Linie gibst du mit dem Winkel an. Null Grad ist nach rechts, neunzig Grad nach oben. "
         "Mit einem Winkel reicht dann X oder Z, den Rest rechnet das Programm.",
         "Schräg: <b>Winkel °</b> eintragen, dann reicht X <i>oder</i> Z.")
def s_winkel(pg, a):
    a.hin("[data-ktel='2'] [data-ktfeld='w']", klick=False, ms=2500)

@schritt("Jetzt die Ecken. Beim ersten Element wählst du als Übergang eine Fase und trägst null komma drei ein. "
         "Der Übergang gilt immer für die Ecke am Ende des Elements.",
         "<b>4.</b> Ecke brechen: <b>Übergang „Fase“</b> und Mass. Gilt am <b>Ende</b> des Elements.")
def s_fase(pg, a):
    a.hin("[data-ktel='0'] [data-ktfeld='ueb']", ms=300)
    pg.select_option("[data-ktel='0'] [data-ktfeld='ueb']", "F"); pg.wait_for_timeout(300)
    a.tippen("[data-ktel='0'] [data-ktfeld='uw']", "0.3")

@schritt("In der Ecke vom Zylinder zur Planfläche brauchen wir einen Freistich. "
         "Wähle Freistich D I N fünfhundertneun E. Die Masse kommen aus der Tabelle und lassen sich von Hand ändern.",
         "<b>5.</b> <b>Freistich</b> DIN 509 E, F oder DIN 76: Masse aus der Tabelle, änderbar.")
def s_freistich(pg, a):
    a.hin("[data-ktel='1'] [data-ktfeld='ueb']", ms=300)
    pg.select_option("[data-ktel='1'] [data-ktfeld='ueb']", "FE"); pg.wait_for_timeout(2200)

@schritt("Für einen Radius wählst du einfach Radius und trägst das Mass ein, zum Beispiel null komma fünf.",
         "Radius: <b>Übergang „Radius“</b>, Mass eintragen.")
def s_radius(pg, a):
    a.dazu("gerade", ms=300); a.tippen("[data-ktel='3'] [data-ktfeld='z']", "16")
    a.hin("[data-ktel='2'] [data-ktfeld='ueb']", ms=300)
    pg.select_option("[data-ktel='2'] [data-ktfeld='ueb']", "R"); pg.wait_for_timeout(300)
    a.tippen("[data-ktel='2'] [data-ktfeld='uw']", "0.5")

@schritt("Ein Bogen geht mit plus Bogen. Du gibst den Endpunkt und den Radius ein. "
         "Der Pfeil daneben wechselt die Drehrichtung, im Uhrzeigersinn der Grafik ist G zwei.",
         "<b>6.</b> <b>„+ Bogen“</b>: Endpunkt und <b>R</b>, der <b>Pfeil</b> wechselt die Drehrichtung.")
def s_bogen(pg, a):
    a.dazu("bogen", ms=400)
    a.tippen("[data-ktel='4'] [data-ktfeld='x']", "24"); a.tippen("[data-ktel='4'] [data-ktfeld='z']", "20")
    a.tippen("[data-ktel='4'] [data-ktfeld='r']", "4")
    a.hin("[data-ktel='4'] [data-ktfeld='dreh']", ms=1200); a.hin("[data-ktel='4'] [data-ktfeld='dreh']", ms=600)

@schritt("Jedes Element kann einen eigenen Vorschub F haben. Leer heisst Grundvorschub. "
         "Und unter Pause trägst du Sekunden ein, dann kommt am Ende des Elements ein G vier.",
         "Je Element eigener <b>Vorschub F</b> und <b>Pause</b> in Sekunden (G4).")
def s_vorschub(pg, a):
    a.tippen("[data-ktel='1'] [data-ktfeld='f']", "0.02"); a.hin("[data-ktel='1'] [data-ktfeld='pause']", klick=False, ms=1500)

@schritt("Ein Element löschst du mit dem roten Kreuz am Ende der Zeile.",
         "Löschen: rotes <b>✕</b> am Ende der Zeile.")
def s_loeschen(pg, a):
    a.hin("[data-ktel='4'] .kt-weg, [data-ktel='4'] button[title*='öschen']", klick=False, ms=1500)

@schritt("Du kannst auch mit der Maus zeichnen. Tippe auf Zeichnen und klicke in die Grafik. "
         "In der Nähe der Waagrechten oder Senkrechten rastet der Punkt ein. "
         "Dann wird die Linie grün und am Ende steht ein Winkelzeichen.",
         "<b>7.</b> <b>„Zeichnen“</b>: in die Grafik klicken. Waagrecht und senkrecht <b>rasten ein</b>.")
def s_zeichnen(pg, a):
    pg.locator(".kt-liste .kt-el").last.locator(".kt-nr").click(); pg.wait_for_timeout(150)
    a.hin("#kt-zeichnen", ms=500)
    l = pg.evaluate("""() => { const r = document.querySelector('.kt-bild').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }""")
    pg.mouse.move(l[0] + l[2] * 0.6, l[1] + l[3] * 0.5, steps=15); pg.wait_for_timeout(400)
    e2 = pg.evaluate("""() => { const l = document.querySelector('.kt-gummi'); const m = l.ownerSVGElement.getScreenCTM();
      const p = new DOMPoint(+l.getAttribute('x1'), +l.getAttribute('y1')).matrixTransform(m); return [p.x, p.y]; }""")
    a.e2 = e2
    pg.mouse.move(e2[0] + 70, e2[1] - 30, steps=15); pg.wait_for_timeout(700)
    pg.mouse.move(e2[0] + 90, e2[1] + 3, steps=20); pg.wait_for_timeout(1500)
    pg.mouse.click(e2[0] + 90, e2[1] + 3); pg.wait_for_timeout(600)

@schritt("Genau eintippen geht auch beim Zeichnen: Drücke Tab, dann stehen die Felder X und Z direkt bei der Maus. "
         "Zahl eintippen, Tab, nächste Zahl, und mit Enter setzt du den Punkt.",
         "<b>Tab</b>: X und Z direkt bei der Maus eintippen, <b>Enter</b> setzt den Punkt.")
def s_tab(pg, a):
    e2 = a.e2
    pg.mouse.move(e2[0] + 150, e2[1] - 40, steps=15); pg.wait_for_timeout(300)
    pg.keyboard.press("Tab"); pg.wait_for_timeout(400)
    pg.keyboard.type("30", delay=150); pg.keyboard.press("Tab"); pg.keyboard.type("26", delay=150); pg.wait_for_timeout(500)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    a.hin("#kt-zeichnen", ms=300)

@schritt("Vertippt? Rückgängig nimmt die letzte Änderung zurück, auch mehrmals hintereinander.",
         "<b>„↶ Rückgängig“</b> nimmt die letzte Änderung zurück.")
def s_rueck(pg, a):
    a.hin("#kt-zurueck", ms=900); a.hin("#kt-zurueck", ms=300)

@schritt("Klickst du in der Grafik auf eine Linie, ist dieses Element in der Liste gewählt, "
         "und seine Zeilen im N C Programm leuchten orange. Das geht auch umgekehrt: Zeile antippen wählt das Element.",
         "<b>8.</b> Linie anklicken: Element in der Liste gewählt, NC-Zeilen <b>orange</b>.")
def s_markieren(pg, a):
    if pg.locator("#kt-bild [data-kttreffer='2']").count(): a.hin("#kt-bild [data-kttreffer='2']", ms=2000)
    a.hin("#kt-code [data-ktnc]", ms=1500)

@schritt("Zoomen kannst du mit dem Mausrad, genau dort, wo die Maus steht. Ziehen verschiebt das Bild, "
         "und Alles zeigt wieder die ganze Kontur.",
         "<b>9.</b> <b>Mausrad</b> zoomt, <b>Ziehen</b> verschiebt, <b>„Alles“</b> zeigt alles.")
def s_zoom(pg, a):
    b = pg.locator("#kt-bild").bounding_box()
    pg.mouse.move(b["x"] + b["width"] * 0.45, b["y"] + b["height"] * 0.5, steps=12)
    for i in range(5): pg.mouse.wheel(0, -120); pg.wait_for_timeout(250)
    pg.mouse.down(); pg.mouse.move(b["x"] + b["width"] * 0.6, b["y"] + b["height"] * 0.55, steps=15); pg.mouse.up()
    pg.wait_for_timeout(600); a.hin("#kt-zoom-alles", ms=500)

@schritt("Beim Werkzeug wählst du Aussen oder Innen, den Plattenradius, den Grundvorschub und die Schneidenlage. "
         "Für die Star aussen ist das unten rechts. Der Radius ist im Programm schon eingerechnet, ohne G einundvierzig oder zweiundvierzig.",
         "<b>10.</b> Werkzeug: <b>Plattenradius</b>, Vorschub, <b>Schneidenlage</b>. Radius eingerechnet, ohne G41/G42.")
def s_werkzeug(pg, a):
    a.tippen("[data-ktfeld='rn']", "0.4"); a.hin("[data-ktspitze='ur']", ms=1200)

@schritt("Jetzt zum Import aus einem drei D Modell. Tippe oben auf drei D Modell und wähle eine STEP Datei. "
         "Das Programm liest daraus die Seitenkontur, ganz ohne C A D Programm.",
         "<b>11.</b> <b>„3D-Modell“</b>: STEP-Datei wählen, die Seitenkontur wird gelesen.")
def s_step(pg, a):
    a.hin("label:has(#kt-step)", klick=False, ms=600)
    pg.set_input_files("#kt-step", os.path.join(HIER, "kontur-test.step"))
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(800)

@schritt("Oben steht die gefundene Drehachse. Links siehst du das Modell als Drahtgitter: Ziehen dreht es, "
         "das Mausrad zoomt, und ein angetippter Kreis wählt eine andere Achse. Die Knöpfe darunter zeigen es von vorne, oben oder von der Seite.",
         "Links das Modell: <b>Ziehen dreht</b>, ein <b>Kreis</b> wählt eine andere Drehachse.")
def s_step3d(pg, a):
    a.hin("#kt-modell-achse", klick=False, ms=800)
    m3 = pg.locator("#kt-modell-3d").bounding_box()
    if m3:
        pg.mouse.move(m3["x"] + m3["width"] * 0.4, m3["y"] + m3["height"] * 0.5, steps=10)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.65, m3["y"] + m3["height"] * 0.4, steps=35); pg.mouse.up()
        pg.wait_for_timeout(800)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.45, m3["y"] + m3["height"] * 0.55, steps=30); pg.mouse.up()

@schritt("Rechts die Seitenkontur. Ein Element, das du nicht willst, tippst du an. Es wird rot gestrichelt weggelassen, "
         "und die Kontur geht dort gerade durch. Nochmals antippen holt es zurück.",
         "Rechts: Linie antippen = <b>weglassen</b> (rot gestrichelt), nochmals = zurück.")
def s_stepweg(pg, a):
    n = pg.locator("[data-ktstueck]").count()
    if n:
        st = pg.locator("[data-ktstueck]").nth(min(2, n - 1)); bb = st.bounding_box()
        if bb:
            pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=15); pg.wait_for_timeout(300)
            st.dispatch_event("click"); pg.wait_for_timeout(2500); st.dispatch_event("click"); pg.wait_for_timeout(500)

@schritt("Wähle Aussen oder Innenkontur. Andere Seite vorne dreht das Teil um, und mit Z null verschiebst du den Nullpunkt. "
         "Zum Schluss Kontur übernehmen.",
         "<b>Aussen/Innen</b>, <b>„Andere Seite vorne“</b>, <b>Z0</b>, dann <b>„Übernehmen“</b>.")
def s_stepok(pg, a):
    a.hin("[data-ktmodell='innen']", ms=1000); a.hin("[data-ktmodell='aussen']", ms=600)
    a.hin("[data-ktmodell='umdrehen']", ms=1100); a.hin("[data-ktmodell='umdrehen']", ms=500)
    a.hin("#kt-modell-ok", ms=800)

@schritt("Speichern legt Kontur und N C Programm für alle ab, mit Öffnen holst du sie wieder. "
         "Als Datei oder Kopieren bringt das Programm an die Maschine.",
         "<b>12.</b> <b>„Speichern“</b> für alle, <b>„Öffnen“</b> holt sie wieder. <b>„Als Datei“</b> / <b>„Kopieren“</b> für die Maschine.")
def s_speichern(pg, a):
    a.hin("#kt-speichern", klick=False, ms=1000); a.hin("#kt-oeffnen", klick=False, ms=1000)
    a.hin("#kt-datei", klick=False, ms=1000); a.hin("#kt-kopieren", klick=False, ms=600)

@schritt("Am Computer holst du den Rechner mit Eigenes Fenster in ein eigenes Browserfenster, zum Beispiel auf den zweiten Bildschirm.",
         "<b>„⧉ Eigenes Fenster“</b>: auf einen zweiten Bildschirm ziehen.")
def s_fenster(pg, a):
    pg.evaluate("scrollTo(0,0)"); a.hin("#kt-eigen", klick=False, ms=1500)

@schritt("Ganz wichtig: Prüfe jedes Programm vor dem ersten Lauf am Simulator. "
         "Dieses Video findest du jederzeit wieder oben unter Anleitung. Viel Erfolg!",
         "Vor dem ersten Lauf immer <b>am Simulator prüfen</b>.<br>Das Video gibt es wieder unter <b>„▶ Anleitung“</b>.")
def s_ende(pg, a):
    a.hin("#kt-anleitung", klick=False, ms=800)

# ---------------------------------------------------------------------------
tonordner = tempfile.mkdtemp()
dauern = ton_machen(tonordner)
print("Ton:", round(sum(dauern)), "s gesprochen")

server_starten(); time.sleep(0.4)
ordner = tempfile.mkdtemp()
zeiten = []
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
    pg.add_style_tag(content="#pablo-zeichen, .pablo-zeichen { display: none !important; }")
    pg.mouse.move(640, 400)
    pg.wait_for_timeout(800)
    start = time.time() - t0

    class A: pass
    a = A()
    def text(t):
        pg.evaluate("(t) => { const e = document.getElementById('tut-text'); e.innerHTML = t; e.style.opacity = t ? 1 : 0; }", t)
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
        pg.keyboard.press("Control+a"); pg.keyboard.type(wert, delay=130); pg.wait_for_timeout(400)
    def dazu(art, ms=400):
        # Neues Element kommt hinter das gewählte: darum zuerst das letzte wählen
        n = pg.locator(".kt-liste .kt-el").count()
        if n: pg.locator(".kt-liste .kt-el").last.locator(".kt-nr").click(); pg.wait_for_timeout(150)
        hin(f"[data-kt='{art}']", ms=ms)
    a.hin, a.tippen, a.dazu = hin, tippen, dazu

    for i, (sprechen, zeile, f) in enumerate(SCHRITTE):
        beginn = time.time()
        zeiten.append(beginn - t0)
        text(zeile)
        try:
            f(pg, a)
        except Exception:
            pg.screenshot(path=os.path.join(tempfile.gettempdir(), "tutorial-fehler.png"))
            print("Fehler bei Schritt", i, f.__name__, "| Fehlertext:", pg.evaluate("document.getElementById('kt-fehler')?.innerText || ''"))
            raise
        rest = dauern[i] + 0.6 - (time.time() - beginn)
        if rest > 0: pg.wait_for_timeout(int(rest * 1000))
    pg.wait_for_timeout(1200)
    video = pg.video.path()
    kx.close(); br.close()

# Ton an die Stellen legen, an denen sein Schritt begann
os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
eingaben, filter_ = ["-ss", f"{start:.2f}", "-i", video], []
for i, t in enumerate(zeiten):
    eingaben += ["-i", os.path.join(tonordner, f"t{i}.wav")]
    filter_.append(f"[{i + 1}:a]adelay={int((t - start) * 1000)}:all=1[a{i}]")
filter_.append("".join(f"[a{i}]" for i in range(len(zeiten))) + f"amix=inputs={len(zeiten)}:normalize=0[ton]")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *eingaben, "-filter_complex", ";".join(filter_),
                "-map", "0:v", "-map", "[ton]", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                "-r", "25", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-shortest", ZIEL], check=True)
shutil.rmtree(ordner, ignore_errors=True); shutil.rmtree(tonordner, ignore_errors=True)
print("Video:", os.path.abspath(ZIEL), round(os.path.getsize(ZIEL) / 1e6, 2), "MB")
