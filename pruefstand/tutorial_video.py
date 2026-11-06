# Nimmt das Erklärvideo für NC-PRO auf. Läuft mit dem Prüfstand, also nur mit
# Beispieldaten. Ergebnis: public/hilfe/hofer-nc-pro.mp4 (braucht ffmpeg).
#
# Seit 1.439.0 (Wunsch Patrick 6. November 2026: „ausführliches Tutorial-Video
# für das ganze NC-PRO, für die neuste ElevenLabs-Version, mit Emotionen“):
# alle Reiter in einem Video, der Sprecher kommt aus ElevenLabs v3. Der
# Sprechertext steht unten in SCHRITTE, mit den Audio-Tags von v3 in eckigen
# Klammern ([excited], [warmly] …), gruppiert in Teile, die je für sich in
# ElevenLabs passen (höchstens rund 2'800 Zeichen).
#
#   python tutorial_video.py --text <datei>   Sprechertext für ElevenLabs schreiben
#   TON=<ordner> python tutorial_video.py     Video mit dem Ton aus ElevenLabs:
#       im Ordner teil01.mp3, teil02.mp3 … (je ein Teil, so wie aus ElevenLabs
#       heruntergeladen). Die Stellen zwischen den Schritten findet das Skript
#       an den Pausen, sonst verteilt es nach Textlänge.
#   python tutorial_video.py                  ohne Ton, Zeit je Schritt geschätzt
#       (zum Prüfen der Bilder)
#
# Eine echte Person wird nicht nachgeahmt, die Stimme wählt Patrick in ElevenLabs.
import os, re, sys, time, shutil, subprocess, tempfile, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.environ.get("ZIEL") or os.path.join(HIER, "..", "public", "hilfe", "hofer-nc-pro.mp4")
B, H = 1280, 800
TON = os.environ.get("TON", "")

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
      #tut-titel{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;flex-direction:column;
      background:rgba(8,24,52,.9);color:#fff!important;font:700 54px/1.2 system-ui,sans-serif;pointer-events:none;transition:opacity .4s;opacity:0}
      #tut-titel small{display:block;font-size:24px;font-weight:500;margin-top:14px;color:#cfe2ff!important}
      #tut-maus{position:fixed;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;
      background:no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M3 2l14 10-6.5 1.2L14 20l-3 1.2-3.4-6.8L3 18z' fill='%23fff' stroke='%23000' stroke-width='1.4'/%3E%3C/svg%3E")}
      .tut-klick{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #ffb300;border-radius:50%;
      z-index:2147483646;pointer-events:none;animation:tutk .5s ease-out forwards}
      @keyframes tutk{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
    document.head.appendChild(st);
    const t = document.createElement('div'); t.id = 'tut-text'; t.style.opacity = 0; document.body.appendChild(t);
    const g = document.createElement('div'); g.id = 'tut-titel'; document.body.appendChild(g);
    const m = document.createElement('div'); m.id = 'tut-maus'; m.style.left = '-50px'; document.body.appendChild(m);
    addEventListener('mousemove', (e) => { m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { const k = document.createElement('div'); k.className = 'tut-klick';
      k.style.left = e.clientX + 'px'; k.style.top = e.clientY + 'px'; document.body.appendChild(k); setTimeout(() => k.remove(), 600); }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', los); else los();
})();
"""

# ---- Drehbuch: (Teil, gesprochen, Untertitel, Handlung) --------------------
# Gesprochen ist so geschrieben, wie es klingen soll (Zahlen ausgeschrieben,
# „N C“ statt NC), mit Audio-Tags von ElevenLabs v3 in eckigen Klammern.
SCHRITTE = []
TEILE = []
def teil(name): TEILE.append(name)
def schritt(sprechen, zeile):
    def deko(f):
        SCHRITTE.append((len(TEILE), sprechen, zeile, f)); return f
    return deko

# ===================== Teil 1: Willkommen und HOFERCONTUR ===================
teil("Willkommen und HOFERCONTUR")

@schritt("[excited] Hallo und herzlich willkommen bei N C Pro! [warmly] In den nächsten Minuten zeige ich dir alles, "
         "was in N C Pro steckt: Konturen zeichnen, bohren, fräsen, entgraten, gravieren, und am Schluss das ganze Programm "
         "für die Star im Hofer Cam zusammenbauen. [confident] Lehn dich zurück, los geht's.",
         "Willkommen bei <b>NC-PRO</b>: alles für das NC-Programm<br>der Star an einem Ort.")
def s_willkommen(pg, a):
    a.titel("NC-PRO", "Das ganze Programm Schritt für Schritt"); pg.wait_for_timeout(2500); a.titel("")
    a.hin("[data-unter='nc/kontur']", klick=False, ms=800)

@schritt("Oben siehst du die Reiter. Jeder Reiter ist ein eigenes Werkzeug. Wir starten ganz links mit Hofer Contur, "
         "dem Konturenrechner für Drehteile.",
         "Oben die <b>Reiter</b>. Wir starten mit <b>HOFERCONTUR</b>.")
def s_reiter(pg, a):
    for r in ["cam", "bohren", "entgraten", "cachse", "gravur", "dxf", "rechner"]:
        a.hin(f"[data-unter='nc/{r}']", klick=False, ms=250)
    a.reiter("kontur")

@schritt("Links steht die Liste der Elemente. Rechts oben die Grafik deiner Kontur, und darunter das N C Programm, "
         "das sich bei jeder Änderung sofort mitrechnet.",
         "Links die <b>Elemente</b>, rechts die <b>Grafik</b> und darunter das <b>NC-Programm</b>.")
def s_ueberblick(pg, a):
    a.hin(".kt-liste", klick=False, ms=1200); a.hin("#kt-bild", klick=False, ms=1200); a.hin("#kt-code", klick=False, ms=800)

@schritt("Wir beginnen mit einer leeren Kontur. Tippe auf Neu und bestätige. Dann der Startpunkt: "
         "X ist immer der Durchmesser, Z die Länge. Wir starten in der Mitte vorne, also X null und Z null.",
         "<b>„Neu“</b>, dann Startpunkt: <b>X</b> = Durchmesser, <b>Z</b> = Länge.")
def s_neu(pg, a):
    a.hin("#kt-neu", ms=700); a.hin(".dialog-huelle .knopf--haupt, .dialog-huelle .knopf--gefahr", ms=500)
    a.tippen("[data-ktfeld='startX']", "0"); a.tippen("[data-ktfeld='startZ']", "0")

@schritt("Mit plus Gerade hängst du ein Element an, und der Cursor springt gleich ins Feld X. "
         "Plan hoch auf Durchmesser zehn, dann der Zylinder mit Z zwölf, und wieder plan hoch auf sechzehn. "
         "[cheerfully] Ein leeres Feld heisst einfach: bleibt gleich.",
         "<b>„+ Gerade“</b>: X oder Z eintippen. Leer = bleibt gleich.")
def s_geraden(pg, a):
    a.dazu("gerade", ms=300); a.tippen("[data-ktel='0'] [data-ktfeld='x']", "10")
    a.dazu("gerade", ms=300); a.tippen("[data-ktel='1'] [data-ktfeld='z']", "12")
    a.dazu("gerade", ms=300); a.tippen("[data-ktel='2'] [data-ktfeld='x']", "16")

@schritt("Jetzt die Ecken. Der Übergang gilt immer für die Ecke am Ende des Elements: hier eine Fase null komma drei, "
         "in der Ecke vom Zylinder ein Freistich nach D I N fünfhundertneun mit den Massen aus der Tabelle, "
         "und weiter oben ein Radius null komma fünf.",
         "Übergang am <b>Ende</b> des Elements: <b>Fase</b>, <b>Freistich</b> DIN 509 / DIN 76, <b>Radius</b>.")
def s_ecken(pg, a):
    a.hin("[data-ktel='0'] [data-ktfeld='ueb']", ms=200)
    pg.select_option("[data-ktel='0'] [data-ktfeld='ueb']", "F"); pg.wait_for_timeout(200)
    a.tippen("[data-ktel='0'] [data-ktfeld='uw']", "0.3")
    a.hin("[data-ktel='1'] [data-ktfeld='ueb']", ms=200)
    pg.select_option("[data-ktel='1'] [data-ktfeld='ueb']", "FE"); pg.wait_for_timeout(1200)
    a.dazu("gerade", ms=300); a.tippen("[data-ktel='3'] [data-ktfeld='z']", "16")
    a.hin("[data-ktel='2'] [data-ktfeld='ueb']", ms=200)
    pg.select_option("[data-ktel='2'] [data-ktfeld='ueb']", "R"); pg.wait_for_timeout(200)
    a.tippen("[data-ktel='2'] [data-ktfeld='uw']", "0.5")

@schritt("Ein Bogen geht mit plus Bogen: Endpunkt und Radius eintippen, der Pfeil daneben wechselt die Drehrichtung. "
         "Und jedes Element kann einen eigenen Vorschub und eine Pause haben.",
         "<b>„+ Bogen“</b>: Endpunkt und <b>R</b>, der <b>Pfeil</b> wechselt die Richtung. Je Element <b>F</b> und <b>Pause</b>.")
def s_bogen(pg, a):
    a.dazu("bogen", ms=300)
    a.tippen("[data-ktel='4'] [data-ktfeld='x']", "24"); a.tippen("[data-ktel='4'] [data-ktfeld='z']", "20")
    a.tippen("[data-ktel='4'] [data-ktfeld='r']", "4")
    a.hin("[data-ktel='4'] [data-ktfeld='dreh']", ms=900); a.hin("[data-ktel='4'] [data-ktfeld='dreh']", ms=400)
    a.tippen("[data-ktel='1'] [data-ktfeld='f']", "0.02")

@schritt("[curious] Lieber mit der Maus? Tippe auf Zeichnen und klicke in die Grafik. Waagrecht und senkrecht rastet der Punkt ein, "
         "die Linie wird grün. Mit Tab tippst du X und Z direkt bei der Maus ein, Enter setzt den Punkt. "
         "Und vertippt? Rückgängig nimmt es zurück.",
         "<b>„Zeichnen“</b>: klicken, <b>Tab</b> für genaue Werte, <b>„↶ Rückgängig“</b>.")
def s_zeichnen(pg, a):
    pg.locator(".kt-liste .kt-el").last.locator(".kt-nr").click(); pg.wait_for_timeout(150)
    a.hin("#kt-zeichnen", ms=500)
    l = pg.evaluate("""() => { const r = document.querySelector('.kt-bild').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }""")
    pg.mouse.move(l[0] + l[2] * 0.6, l[1] + l[3] * 0.5, steps=15); pg.wait_for_timeout(300)
    e2 = pg.evaluate("""() => { const l = document.querySelector('.kt-gummi'); const m = l.ownerSVGElement.getScreenCTM();
      const p = new DOMPoint(+l.getAttribute('x1'), +l.getAttribute('y1')).matrixTransform(m); return [p.x, p.y]; }""")
    pg.mouse.move(e2[0] + 90, e2[1] + 3, steps=20); pg.wait_for_timeout(900)
    pg.mouse.click(e2[0] + 90, e2[1] + 3); pg.wait_for_timeout(400)
    pg.mouse.move(e2[0] + 150, e2[1] - 40, steps=15); pg.wait_for_timeout(200)
    pg.keyboard.press("Tab"); pg.wait_for_timeout(300)
    pg.keyboard.type("30", delay=120); pg.keyboard.press("Tab"); pg.keyboard.type("26", delay=120); pg.wait_for_timeout(300)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    a.hin("#kt-zeichnen", ms=300)
    a.hin("#kt-zurueck", ms=600)

@schritt("Klickst du auf eine Linie, leuchten ihre Zeilen im N C Programm orange. Das Mausrad zoomt genau dort, wo die Maus steht, "
         "und Alles zeigt wieder die ganze Kontur.",
         "Linie anklicken: NC-Zeilen <b>orange</b>. <b>Mausrad</b> zoomt, <b>„Alles“</b> zeigt alles.")
def s_markieren(pg, a):
    if pg.locator("#kt-bild [data-kttreffer='2']").count(): a.hin("#kt-bild [data-kttreffer='2']", ms=1200)
    b = pg.locator("#kt-bild").bounding_box()
    pg.mouse.move(b["x"] + b["width"] * 0.45, b["y"] + b["height"] * 0.5, steps=12)
    for i in range(4): pg.mouse.wheel(0, -120); pg.wait_for_timeout(220)
    pg.wait_for_timeout(400); a.hin("#kt-zoom-alles", ms=400)

@schritt("[impressed] Und jetzt wird's schön: Drei D zeigt deine Kontur als fertiges Drehteil. Ziehen dreht es, "
         "Aufgeschnitten zeigt auch das Innere.",
         "<b>„3D“</b>: Kontur als Drehteil, Ziehen dreht, <b>„Aufgeschnitten“</b> zeigt innen.")
def s_dreid(pg, a):
    a.hin("#kt-3d", ms=700)
    pg.wait_for_selector("#kt-k3d")
    b = pg.locator("#kt-k3d").bounding_box()
    mx, my = b["x"] + b["width"] * 0.5, b["y"] + b["height"] * 0.5
    pg.mouse.move(mx, my, steps=10); pg.mouse.down()
    pg.mouse.move(mx + 160, my + 30, steps=40); pg.mouse.move(mx - 60, my - 10, steps=40); pg.mouse.up()
    a.hin("#kt-k3d-schnitt", ms=1200)
    pg.mouse.move(mx, my, steps=10); pg.mouse.down(); pg.mouse.move(mx - 120, my + 40, steps=40); pg.mouse.up()
    pg.wait_for_timeout(500); a.hin("#kt-2d", ms=400)

@schritt("Beim Werkzeug wählst du Plattenradius, Vorschub und Schneidenlage. Der Radius ist im Programm schon eingerechnet, "
         "ohne G einundvierzig oder zweiundvierzig. [excited] Neu kannst du die Kontur auch rückwärts abfahren: "
         "Häkchen setzen, und der rote Pfeil zeigt, wo es losgeht.",
         "Werkzeug: <b>Radius</b>, <b>Schneidenlage</b>. Neu: <b>„Kontur rückwärts abfahren“</b>, roter Pfeil = Richtung.")
def s_werkzeug(pg, a):
    a.tippen("[data-ktfeld='rn']", "0.4"); a.hin("[data-ktspitze='ur']", ms=700)
    a.hin("#kt-rueck", ms=1500); a.hin(".kt-richtung", klick=False, ms=1200); a.hin("#kt-rueck", ms=500)

@schritt("Hast du ein drei D Modell? Drei D Modell liest eine STEP Datei und macht daraus die Seitenkontur, "
         "ganz ohne C A D. Ein Kreis im Drahtgitter wählt die Drehachse, angetippte Elemente lässt du weg, "
         "und Übernehmen setzt die Kontur ein.",
         "<b>„3D-Modell“</b>: STEP-Datei → Seitenkontur. Achse wählen, Elemente weglassen, <b>„Übernehmen“</b>.")
def s_step(pg, a):
    a.hin("label:has(#kt-step)", klick=False, ms=400)
    pg.set_input_files("#kt-step", os.path.join(HIER, "kontur-test.step"))
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(600)
    m3 = pg.locator("#kt-modell-3d").bounding_box()
    if m3:
        pg.mouse.move(m3["x"] + m3["width"] * 0.4, m3["y"] + m3["height"] * 0.5, steps=10)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.65, m3["y"] + m3["height"] * 0.4, steps=35); pg.mouse.up()
    n = pg.locator("[data-ktstueck]").count()
    if n:
        st = pg.locator("[data-ktstueck]").nth(min(2, n - 1)); bb = st.bounding_box()
        if bb:
            pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=15)
            st.dispatch_event("click"); pg.wait_for_timeout(1500); st.dispatch_event("click"); pg.wait_for_timeout(300)
    a.hin("#kt-modell-ok", ms=700)

@schritt("Speichern legt Kontur und Programm für alle ab, Öffnen holt sie wieder, und mit Als Datei oder Kopieren "
         "kommt das Programm an die Maschine.",
         "<b>„Speichern“</b> für alle, <b>„Öffnen“</b>, <b>„Als Datei“</b> / <b>„Kopieren“</b>.")
def s_speichern(pg, a):
    a.hin("#kt-speichern", klick=False, ms=700); a.hin("#kt-oeffnen", klick=False, ms=700)
    a.hin("#kt-datei", klick=False, ms=700); a.hin("#kt-kopieren", klick=False, ms=500)

# ===================== Teil 2: Bohren / Fräsen und Entgraten ================
teil("Bohren / Fräsen und Entgraten")

@schritt("[cheerfully] Weiter zu Bohren und Fräsen, für angetriebene Werkzeuge an der Front und quer. "
         "Oben wählst du, was du machen willst: Bohren auf einem Lochkreis an der Front, quer bohren, "
         "eine Nut an der Front oder quer, oder eine Fläche.",
         "<b>Bohren / Fräsen</b>: Front und Quer, Bohrungen, Nuten, Flächen.")
def s_bf(pg, a):
    a.reiter("bohren"); pg.wait_for_selector("#bf-code")
    for w in ["bohrenQuer", "nutFront", "nutQuer", "flaeche", "bohrenFront"]:
        if pg.locator(f"[data-bfart='{w}']").count(): a.hin(f"[data-bfart='{w}']", ms=450)

@schritt("Beim Bohren wählst du den Zyklus: Tieflochbohren, normal bohren, Gewinde mit M neunundzwanzig oder reiben. "
         "Lochkreis, Anzahl und Tiefe eintippen, die Skizze daneben zeigt sofort, wo die Bohrungen sitzen.",
         "<b>Zyklus</b> wählen, <b>Lochkreis</b>, <b>Anzahl</b>, <b>Tiefe</b>. Die Skizze zeigt es sofort.")
def s_bf_werte(pg, a):
    for w in ["gewinde", "reiben", "tief"]:
        if pg.locator(f"[data-bfzyklus='{w}']").count(): a.hin(f"[data-bfzyklus='{w}']", ms=400)
    a.tippen("[data-bf='lochkreis']", "14"); a.tippen("[data-bf='anzahl']", "6"); a.tippen("[data-bf='tiefe']", "6")
    a.hin("#bf-stirn, #bf-seite", klick=False, ms=900)

@schritt("Wichtig: Unter Werkzeugantrieb trägst du einmal ein, wie deine Maschine das Werkzeug ein- und ausschaltet. "
         "Geschweifte Klammer S steht dabei für die Drehzahl. [warmly] Das merkt sich das Programm für dich.",
         "<b>Werkzeugantrieb</b> einmal eintragen, <b>{S}</b> = Drehzahl. Bleibt gemerkt.")
def s_bf_antrieb(pg, a):
    a.hin("#bf-antrieb", klick=False, ms=900)
    if pg.locator("#bf-antrieb summary").count(): a.hin("#bf-antrieb summary", ms=400)
    if pg.locator("[data-bfantrieb='frontEin']").count():
        a.tippen("[data-bfantrieb='frontEin']", "M80 S{S}"); a.tippen("[data-bfantrieb='frontAus']", "M81")
    a.hin("#bf-code", klick=False, ms=900)

@schritt("Entgraten nimmt die Kanten direkt aus Bohren und Fräsen, oder aus einer STEP Datei. "
         "Im drei D Drahtbild oder in der Liste tippst du an, welche Kanten entgratet werden.",
         "<b>Entgraten</b>: Kanten aus Bohren / Fräsen oder STEP, im <b>3D</b> oder in der <b>Liste</b> wählen.")
def s_eg(pg, a):
    a.reiter("entgraten"); pg.wait_for_selector("#eg-code")
    a.hin("#eg-3d", klick=False, ms=700)
    if pg.locator("[data-egkante]").count() > 1: a.hin("[data-egkante] >> nth=1", ms=600)
    a.hin("#eg-alle", ms=500)

@schritt("Dann das Werkzeug: Kugel, Kopier oder Zentrierfräser, und die Fase in Breite oder Tiefe. "
         "Rechts siehst du die Skizze im Schnitt mit allen Massen.",
         "<b>Kugel-</b>, <b>Kopier-</b> oder <b>Zentrierfräser</b>, Fase in Breite oder Tiefe, rechts die <b>Skizze</b>.")
def s_eg_wz(pg, a):
    a.hin("[data-egwz='kugel']", ms=500); a.hin("[data-egwz='zentrier']", ms=700)
    a.hin("#eg-skizze", klick=False, ms=1200)

@schritt("[excited] Und das Beste: die Simulation. Tippe auf Start und schau zu, wie das Werkzeug die Bahn abfährt, "
         "das Teil dreht dabei in C. [laughs softly] Besser als jeder Trockenlauf.",
         "<b>Simulation</b>: das Werkzeug fährt die Bahn ab, das Teil dreht in C.")
def s_eg_sim(pg, a):
    a.hin("#eg-sim", klick=False, ms=400)
    if pg.locator("#eg-sim-start").count(): a.hin("#eg-sim-start", ms=3500)
    if pg.locator("#eg-sim-halt").count(): a.hin("#eg-sim-halt", ms=400)

# ===================== Teil 3: C-Achse, Gravur, DXF, Rechner ================
teil("C-Achse, Gravur, DXF und Rechner")

@schritt("C-Achse G zwölf komma eins fräst Formen auf der Stirnseite: Vierkant, Sechskant, Rechteck, Torx und mehr. "
         "Schlüsselweite, Fräser und Tiefe eintragen, und mit Abspielen siehst du die Bahn.",
         "<b>C-Achse G12.1</b>: Vierkant, Sechskant, Rechteck, Torx … mit <b>Abspielen</b>.")
def s_cax(pg, a):
    a.reiter("cachse"); pg.wait_for_selector("#cax-bild")
    for f in ["sechskant", "rechteck", "torx", "vierkant"]:
        if pg.locator(f"[data-caxform='{f}']").count(): a.hin(f"[data-caxform='{f}']", ms=450)
    a.tippen("[data-cax='sw']", "12")
    if pg.locator("#cax-los").count(): a.hin("#cax-los", ms=1800)

@schritt("Gravur schreibt deinen Text auf die Stirn oder auf den Mantel. Text eintippen, Schrift und Höhe wählen, "
         "[cheerfully] und schon steht das Programm.",
         "<b>Gravur</b>: Text, Schrift und Höhe, auf der Stirn oder dem Mantel.")
def s_grav(pg, a):
    a.reiter("gravur"); pg.wait_for_selector("[data-grav='text']")
    a.tippen("[data-grav='text']", "HOFER"); pg.wait_for_timeout(700)
    a.hin("#grav-bild", klick=False, ms=900)
    if pg.locator("#grav-los").count(): a.hin("#grav-los", ms=1500)

@schritt("Bei D X F lädst du eine Zeichnung, wählst die Kontur und ob innen oder aussen gefräst wird. "
         "Das Programm rechnet die Bahn mit dem Fräserradius.",
         "<b>DXF</b>: Zeichnung laden, Kontur wählen, innen oder aussen.")
def s_dxf(pg, a):
    a.reiter("dxf"); pg.wait_for_selector("#dxf-datei", state="attached")
    a.hin("label:has(#dxf-datei), #dxf-datei", klick=False, ms=400)
    pg.set_input_files("#dxf-datei", files=[{"name": "teil.dxf", "mimeType": "text/plain", "buffer": DXF.encode()}])
    pg.wait_for_timeout(700)
    if pg.locator("[data-dxfk='0']").count(): pg.locator("[data-dxfk='0']").dispatch_event("click"); pg.wait_for_timeout(500)
    a.hin("#dxf-bild", klick=False, ms=900)
    if pg.locator("#dxf-los").count(): a.hin("#dxf-los", ms=1300)

@schritt("Und ganz rechts der Rechner: Drehzahl und Vorschub aus Schnittgeschwindigkeit und Durchmesser, "
         "dazu Winkel und Fasen.",
         "<b>Rechner</b>: Drehzahl, Vorschub, Winkel und Fase.")
def s_rechner(pg, a):
    a.reiter("rechner"); pg.wait_for_timeout(400)
    if pg.locator("[data-rech='drehzahl']").count(): a.hin("[data-rech='drehzahl']", ms=400)
    if pg.locator("#r-d").count(): a.tippen("#r-d", "12")
    if pg.locator("[data-rech='winkel']").count(): a.hin("[data-rech='winkel']", ms=900)

# ===================== Teil 4: HOFERCAM =====================================
teil("HOFERCAM")

@schritt("[excited] Jetzt bauen wir alles zusammen, im Hofer Cam. Hier entsteht das ganze Programm für die Star S B zwanzig R G, "
         "Kanal eins und Kanal zwei nebeneinander.",
         "<b>HOFERCAM</b>: das ganze Programm für die <b>Star SB-20RG</b>, beide Kanäle nebeneinander.")
def s_cam(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    a.hin("#cam-kanaele", klick=False, ms=1200)

@schritt("Oben trägst du die Programmnummer, die HOCO Nummer und die Grundwerte für G zweihundertsechsundsechzig ein: "
         "Materialdurchmesser, Teilelänge, Drehzahl und so weiter. Kopf und Ende schreibt das Programm selbst.",
         "Oben <b>Programm-Nr.</b>, <b>HOCO Nr.</b> und die Werte für <b>G266</b>. Kopf und Ende kommen von selbst.")
def s_cam_kopf(pg, a):
    a.tippen("[data-cam='nr']", "458"); a.tippen("[data-cam='hoco']", "10870-0002"); a.tippen("[data-cam='A']", "20")

@schritt("Gleiche Wartemarken stehen in beiden Kanälen auf derselben Zeile. [serious] Fehlt eine Gegenmarke, wird sie rot. "
         "So siehst du sofort, ob die Kanäle zusammenpassen.",
         "Gleiche <b>Wartemarken</b> auf derselben Zeile, eine Marke ohne Gegenstück ist <b>rot</b>.")
def s_cam_marken(pg, a):
    a.hin(".cam-zeile--sync[data-kanal='1'] >> nth=1", klick=False, ms=900)
    a.hin(".cam-zeile--sync[data-kanal='2'] >> nth=1", klick=False, ms=900)

@schritt("Mit den Knöpfen unten fügst du Bearbeitungen ein: Drehwerkzeug, Frontwerkzeug, quer und front angetrieben, "
         "und für Kanal zwei die stehenden Werkzeuge. Oben rechts zeigt das Bild der Maschine, wo das Werkzeug sitzt.",
         "<b>Bearbeitungen</b> einfügen: Dreh-, Front-, angetriebene und stehende Werkzeuge. Das <b>Bild</b> zeigt den Platz.")
def s_cam_bearb(pg, a):
    for k in ["#cam-neu-front", "#cam-neu-quer", "#cam-neu-seite", "#cam-neu-k2"]:
        if pg.locator(k).count(): a.hin(k, klick=False, ms=350)
    a.hin("#cam-neu-dreh", ms=600)
    a.tippen("[data-block='0'] [data-camblock='bez']", "AUSSEN SCHLICHTEN")
    a.hin("[data-block='0']", klick=False, ms=900)

@schritt("[curious] Und woher kommt der N C Code? Mit plus Aus Modul übernimmst du den aktuellen Code aus Bohren, Entgraten, "
         "C-Achse, Gravur oder D X F. Mit plus Vorlage fügst du Tieflochbohren oder Gewindestrählen ein.",
         "<b>„+ Aus Modul“</b> übernimmt den Code der anderen Reiter, <b>„+ Vorlage“</b> fügt Zyklen ein.")
def s_cam_modul(pg, a):
    a.hin("[data-block='0'] [data-camblock='code']", ms=200)
    a.hin("[data-cammodul-auf='0']", ms=700)
    if pg.locator("[data-cammodul-wahl]").count():
        pg.select_option("[data-cammodul-wahl]", "bohren"); pg.wait_for_timeout(900)
        a.hin("[data-cammodul-einfuegen]", ms=900)
    a.hin("[data-camvorlage-auf='0']", ms=900)
    if pg.locator("[data-camvorlage] .cam-vorlage__kopf .knopf").count(): a.hin("[data-camvorlage] .cam-vorlage__kopf .knopf", ms=300)

@schritt("Im Programmfenster kannst du jede Zeile direkt ändern. Was du von Hand geändert hast, wird gelb, "
         "und es bleibt, auch wenn du oben weiterrechnest.",
         "Jede Zeile im Programm <b>bearbeitbar</b>, von Hand Geändertes wird <b>gelb</b> und bleibt.")
def s_cam_hand(pg, a):
    z = pg.locator("[data-kanal='1'][data-nr='3'] .cam-text")
    if z.count():
        a.hin("[data-kanal='1'][data-nr='3'] .cam-text", ms=300)
        pg.keyboard.press("End"); pg.keyboard.type("(PRUEFEN)", delay=90); pg.keyboard.press("Tab"); pg.wait_for_timeout(1200)

@schritt("Speichern und Öffnen findest du oben rechts. [warmly] Und das Programmfenster ziehst du mit Eigenes Fenster "
         "auf einen zweiten Bildschirm.",
         "<b>„Speichern“</b> / <b>„Öffnen“</b> oben rechts, Programm im <b>eigenen Fenster</b>.")
def s_cam_ende(pg, a):
    pg.evaluate("scrollTo(0,0)")
    for k in ["[data-ncablage='speichern'], .nc-ablage button >> nth=1", "#cam-fenster"]:
        if pg.locator(k).count(): a.hin(k, klick=False, ms=900)

# ===================== Teil 5: Abschluss ====================================
teil("Abschluss")

@schritt("Übrigens: Jeden Reiter kannst du am Computer mit Eigenes Fenster in ein eigenes Browserfenster holen, "
         "zum Beispiel neben die Planwand. Zurückholen bringt ihn wieder zurück.",
         "Jeder Reiter: <b>„⧉ Eigenes Fenster“</b>, <b>„Zurückholen“</b> bringt ihn zurück.")
def s_fenster(pg, a):
    if pg.locator("#nc-eigen").count(): a.hin("#nc-eigen", klick=False, ms=1800)

@schritt("[serious] Und ganz wichtig: Prüfe jedes Programm vor dem ersten Lauf am Simulator. "
         "[warmly] Dieses Video findest du jederzeit wieder unter Anleitung. [excited] Viel Erfolg, und viel Spass mit N C Pro!",
         "Vor dem ersten Lauf immer <b>am Simulator prüfen</b>.<br>Das Video gibt es wieder unter <b>„▶ Anleitung“</b>.")
def s_ende(pg, a):
    a.reiter("kontur")
    if pg.locator("#kt-anleitung").count(): a.hin("#kt-anleitung", klick=False, ms=900)
    a.titel("Viel Erfolg mit NC-PRO", "Hofer + Co. Präzisionsdrehteile")

# Beispielzeichnung für DXF (wie im Prüfstand dxf.py)
def paar(c, w): return f"{c}\n{w}\n"
def linie(x1, y1, x2, y2): return paar(0, "LINE") + paar(10, x1) + paar(20, y1) + paar(11, x2) + paar(21, y2)
DXF = (paar(0, "SECTION") + paar(2, "HEADER") + paar(0, "ENDSEC") + paar(0, "SECTION") + paar(2, "ENTITIES")
       + linie(0, 0, 40, 0) + linie(40, 0, 40, 15) + linie(35, 20, 0, 20) + linie(0, 20, 0, 0)
       + paar(0, "ARC") + paar(10, 35) + paar(20, 15) + paar(40, 5) + paar(50, 0) + paar(51, 90)
       + paar(0, "CIRCLE") + paar(10, 12) + paar(20, 10) + paar(40, 4)
       + paar(0, "ENDSEC") + paar(0, "EOF"))

# ---- Text und Ton -----------------------------------------------------------
ohne_tags = lambda t: re.sub(r"\s*\[[^\]]+\]\s*", " ", t).strip()

def text_schreiben(datei):
    z = ["# NC-PRO Erklärvideo: Sprechertext für ElevenLabs v3", "",
         "Je Teil einmal in ElevenLabs (Modell Eleven v3) einfügen, Stimme wählen, erzeugen und als MP3 herunterladen.",
         "Dateien so nennen: teil01.mp3, teil02.mp3 … Die Wörter in eckigen Klammern sind Gefühle für die Stimme,",
         "die spricht ElevenLabs nicht aus. Die drei Punkte zwischen den Absätzen sind kurze Pausen, bitte stehen lassen.", ""]
    for n, name in enumerate(TEILE, 1):
        txt = "\n\n... \n\n".join(s for (t, s, _, _) in SCHRITTE if t == n)
        z += [f"## Teil {n}: {name}  ({len(txt)} Zeichen, Datei teil{n:02d}.mp3)", "", txt, ""]
    with open(datei, "w", encoding="utf-8") as f: f.write("\n".join(z))
    print("Text:", datei)

def dauer_von(datei):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", datei],
                                capture_output=True, text=True).stdout.strip())

def ton_laden(ordner):
    """Je Teil eine Datei aus ElevenLabs. Zerlegt an den Pausen in die Schritte; liefert je Schritt (Datei, Anfang, Länge)."""
    stuecke = []
    for n in range(1, len(TEILE) + 1):
        schritte = [s for (t, s, _, _) in SCHRITTE if t == n]
        datei = next((os.path.join(ordner, x) for x in sorted(os.listdir(ordner))
                      if re.match(rf"teil0?{n}\.(mp3|wav|m4a|ogg)$", x, re.I)), None)
        if not datei: raise SystemExit(f"Ton fehlt: teil{n:02d}.mp3 in {ordner}")
        ganz = dauer_von(datei)
        aus = subprocess.run(["ffmpeg", "-i", datei, "-af", "silencedetect=noise=-38dB:d=0.45", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        stille = [(float(a), float(b)) for a, b in zip(re.findall(r"silence_start: ([\d.]+)", aus), re.findall(r"silence_end: ([\d.]+)", aus))]
        mitten = [(a + b) / 2 for a, b in stille if a > 0.3 and b < ganz - 0.3]
        laengen = [len(ohne_tags(s)) for s in schritte]
        gesamt = sum(laengen); grenzen, summe = [], 0
        for l in laengen[:-1]:
            summe += l; soll = ganz * summe / gesamt
            frei = [m for m in mitten if not grenzen or m > grenzen[-1] + 1]
            nah = min(frei, key=lambda m: abs(m - soll)) if frei else None
            grenzen.append(nah if nah is not None and abs(nah - soll) < ganz * 0.12 else soll)
        punkte = [0] + grenzen + [ganz]
        print(f"Teil {n}: {round(ganz)} s, {len(schritte)} Schritte, Pausen gefunden: {len(mitten)}")
        for i in range(len(schritte)): stuecke.append((datei, punkte[i], punkte[i + 1] - punkte[i]))
    return stuecke

if "--text" in sys.argv:
    text_schreiben(sys.argv[sys.argv.index("--text") + 1]); sys.exit(0)

stuecke = ton_laden(TON) if TON else [(None, 0, len(ohne_tags(s)) / 14.5 + 0.8) for (_, s, _, _) in SCHRITTE]
dauern = [d for (_, _, d) in stuecke]
print("Ton:", round(sum(dauern)), "s", "(geschätzt, ohne Ton)" if not TON else "")

# ---- Aufnahme ---------------------------------------------------------------
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
    pg.mouse.move(640, 400)
    pg.wait_for_timeout(800)
    start = time.time() - t0

    class A: pass
    a = A()
    def text(t):
        pg.evaluate("(t) => { const e = document.getElementById('tut-text'); e.innerHTML = t; e.style.opacity = t ? 1 : 0; }", t)
    def titel(t, unter=""):
        pg.evaluate("([t, u]) => { const e = document.getElementById('tut-titel'); e.innerHTML = t ? t + '<small>' + u + '</small>' : ''; e.style.opacity = t ? 1 : 0; }", [t, unter])
    def hin(sel, klick=True, ms=500):
        loc = pg.locator(sel)
        if not loc.count(): print("  fehlt:", sel); return
        el = loc.first
        try: el.scroll_into_view_if_needed(timeout=2000)
        except Exception: pass
        b = el.bounding_box()
        if not b: print("  unsichtbar:", sel); return
        pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=18)
        pg.wait_for_timeout(250)
        if klick: pg.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        pg.wait_for_timeout(ms)
    def tippen(sel, wert):
        if not pg.locator(sel).count(): print("  fehlt:", sel); return
        hin(sel, ms=150)
        # Nur in einem Feld alles markieren, sonst markiert Strg + A die ganze Seite
        if not pg.evaluate("() => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')"):
            pg.locator(sel).first.focus()
        pg.keyboard.press("Control+a"); pg.keyboard.type(wert, delay=110); pg.wait_for_timeout(300)
        pg.keyboard.press("Tab"); pg.wait_for_timeout(200)
    def dazu(art, ms=400):
        # Neues Element kommt hinter das gewählte: darum zuerst das letzte wählen
        n = pg.locator(".kt-liste .kt-el").count()
        if n: pg.locator(".kt-liste .kt-el").last.locator(".kt-nr").click(); pg.wait_for_timeout(150)
        hin(f"[data-kt='{art}']", ms=ms)
    def reiter(art):
        pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
        # Am Computer stehen die Reiter in der Seitenleiste, die obere Leiste ist ausgeblendet
        sel = f"[data-unter='nc/{art}']"
        if not pg.locator(sel).count() or not pg.locator(sel).first.is_visible(): sel = f".reiter [data-rech='{art}']"
        hin(sel, ms=700)
        pg.evaluate("getSelection().removeAllRanges()")
    a.hin, a.tippen, a.dazu, a.reiter, a.titel = hin, tippen, dazu, reiter, titel

    for i, (_, sprechen, zeile, f) in enumerate(SCHRITTE):
        beginn = time.time()
        zeiten.append(beginn - t0)
        text(zeile)
        try:
            f(pg, a)
        except Exception:
            pg.screenshot(path=os.path.join(tempfile.gettempdir(), "tutorial-fehler.png"))
            print("Fehler bei Schritt", i, f.__name__)
            raise
        rest = dauern[i] - (time.time() - beginn)
        if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        else: print(f"  Schritt {i} {f.__name__}: Bild {round(-rest, 1)} s länger als Ton")
    pg.wait_for_timeout(1500)
    video = pg.video.path()
    kx.close(); br.close()

# ---- Ton an die Stellen legen, an denen sein Schritt begann -----------------
os.makedirs(os.path.dirname(os.path.abspath(ZIEL)), exist_ok=True)
if TON:
    eingaben, filter_ = ["-ss", f"{start:.2f}", "-i", video], []
    for i, ((datei, ab, lang), t) in enumerate(zip(stuecke, zeiten)):
        eingaben += ["-ss", f"{ab:.3f}", "-t", f"{lang:.3f}", "-i", datei]
        filter_.append(f"[{i + 1}:a]aresample=44100,adelay={int((t - start) * 1000)}:all=1[a{i}]")
    filter_.append("".join(f"[a{i}]" for i in range(len(zeiten))) + f"amix=inputs={len(zeiten)}:normalize=0,loudnorm=I=-15:TP=-1.5[ton]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *eingaben, "-filter_complex", ";".join(filter_),
                    "-map", "0:v", "-map", "[ton]", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                    "-r", "25", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", ZIEL], check=True)
else:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", video, "-c:v", "libx264", "-preset", "fast",
                    "-crf", "30", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", ZIEL], check=True)
shutil.rmtree(ordner, ignore_errors=True)
print("Video:", os.path.abspath(ZIEL), round(os.path.getsize(ZIEL) / 1e6, 2), "MB")
