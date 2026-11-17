# Nimmt das ausführliche Erklärvideo für HOFERCAM auf: ein ganzes Teil von
# der STEP-Datei bis zur 3D-Simulation (Wunsch Patrick 17. November 2026:
# „neues Tutorial für das aktuelle HOFERCAM, sehr detailliert … ein Teil
# programmieren … für ElevenLabs … inkl. Kontur und Entgraten“).
# Läuft mit dem Prüfstand, also nur mit Beispieldaten in der App.
#
# Das 3D-Modell des Teils gehört einem Kunden und steht darum nicht im
# Repository: Pfad mit STEP=<datei> angeben.
#
#   python tutorial_hofercam.py --text <datei>     Sprechertext für ElevenLabs v3
#   STEP=<datei> ZIEL=<mp4> python tutorial_hofercam.py          stummes Probevideo
#   STEP=<datei> ZIEL=<mp4> TON=<ordner> python tutorial_hofercam.py
#       mit dem Ton aus ElevenLabs (teil01.mp3, teil02.mp3 …, wie in
#       tutorial_video.py)
#
# Aufbau, Mauszeiger, Untertitel und Ton wie in tutorial_video.py.
import os, re, sys, time, shutil, subprocess, tempfile, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.environ.get("ZIEL") or os.path.join(tempfile.gettempdir(), "hofercam-tutorial.mp4")
STEP = os.environ.get("STEP", "")
B, H = 1280, 800
TON = os.environ.get("TON", "")
TITEL = "HOFERCAM Erklärvideo"

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

# ---- Drehbuch ---------------------------------------------------------------
# Gesprochen ist so geschrieben, wie es klingen soll (Zahlen ausgeschrieben,
# „N C“ statt NC), mit Audio-Tags von ElevenLabs v3 in eckigen Klammern.
SCHRITTE = []
TEILE = []
def teil(name): TEILE.append(name)
def schritt(sprechen, zeile):
    def deko(f):
        SCHRITTE.append((len(TEILE), sprechen, zeile, f)); return f
    return deko

def bl(i, sel=""): return f"[data-block='{i}'] {sel}".strip()

def platz(pg, a, i, nr):
    a.hin(bl(i, "[data-camblock='platz'] .cam-wahl__knopf"), ms=500)
    if pg.locator(f"[data-platz='{nr}']").count(): a.hin(f"[data-platz='{nr}']", ms=600)

def werkzeug(pg, a, i, art, form, felder, lage=None):
    a.hin(f"[data-camwz-auf='{i}']", ms=600)
    if pg.locator(f"[data-camwz-art='{art}']").count(): a.hin(f"[data-camwz-art='{art}']", ms=300)
    a.hin(f"[data-camwz-form='{form}']", ms=600)
    for n, w in felder: a.tippen(f"[data-camwz='{n}']", w)
    if lage and pg.locator(f"[data-camwz-sl='{lage}']").count(): a.hin(f"[data-camwz-sl='{lage}']", ms=700)

def wz_zu(pg, a):
    if pg.locator("[data-camwz] .cam-vorlage__kopf button[title='Schliessen']").count():
        a.hin("[data-camwz] .cam-vorlage__kopf button[title='Schliessen']", ms=400)

def aus_modul(pg, a, i, modul):
    a.hin(bl(i, "[data-camblock='code']"), ms=200)
    a.hin(f"[data-cammodul-auf='{i}']", ms=600)
    a.hin("[data-cammodul-quelle='aktuell']", ms=500)
    a.hin(f"[data-cammodul-aktuell='{modul}']", ms=600)
    a.hin("[data-cammodul-vorschau]", klick=False, ms=900)
    a.hin("[data-cammodul-einfuegen]", ms=900)

# ===================== Teil 1: Das Teil und die Kontur =======================
teil("Das Teil und die Kontur")

@schritt("[excited] Hallo und willkommen zum grossen Hofer Cam Tutorial! [warmly] Heute programmieren wir zusammen ein echtes Teil, "
         "von der STEP Datei bis zur fertigen drei D Simulation, für die Star S B zwanzig R G.",
         "Ein ganzes Teil von der <b>STEP-Datei</b> bis zur <b>3D-Simulation</b>, für die <b>Star SB-20RG</b>.")
def s_start(pg, a):
    a.titel("HOFERCAM Schritt für Schritt", "Ein Teil von der STEP-Datei bis zur 3D-Simulation")
    pg.wait_for_timeout(4500); a.titel("")

@schritt("Unser Teil ist eine Welle aus Stangenmaterial Durchmesser zehn, zweiundsiebzig komma drei Millimeter lang. "
         "In der Mitte hat sie einen Bund mit sechs Längsnuten. Die drehen wir, fräsen die Nuten, entgraten die Kanten "
         "und bohren vorne und hinten die Zentrierung. [curious] Die Verzahnung rechts und die zwei kleinen Nuten an den Enden lassen wir heute weg.",
         "Welle <b>Ø10 × 72.3</b>: Kontur drehen, <b>6 Nuten</b> fräsen, <b>entgraten</b>, vorne und hinten <b>zentrieren</b>.")
def s_teil(pg, a):
    a.hin("[data-unter='nc/kontur']", klick=False, ms=500)
    a.hin("label:has(#kt-step)", klick=False, ms=600)

@schritt("Wir starten im Hofer Contur. Mit drei D Modell wählst du die STEP Datei. Links siehst du das Modell als Drahtgitter. "
         "Ziehen dreht es, das Mausrad zoomt. Die strichpunktierte Linie ist die Drehachse, die das Programm selbst gefunden hat.",
         "<b>HOFERCONTUR</b> → <b>„3D-Modell“</b>: STEP-Datei wählen. Ziehen dreht, die Linie ist die <b>Drehachse</b>.")
def s_step(pg, a):
    pg.set_input_files("#kt-step", STEP)
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(800)
    m3 = pg.locator("#kt-modell-3d").bounding_box()
    if m3:
        pg.mouse.move(m3["x"] + m3["width"] * 0.35, m3["y"] + m3["height"] * 0.5, steps=12)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.6, m3["y"] + m3["height"] * 0.42, steps=40); pg.mouse.up()
        pg.wait_for_timeout(500)
        pg.mouse.move(m3["x"] + m3["width"] * 0.5, m3["y"] + m3["height"] * 0.5, steps=8)
        for _ in range(4): pg.mouse.wheel(0, -120); pg.wait_for_timeout(200)
    a.hin("#kt-modell-achse", klick=False, ms=900)

@schritt("Rechts steht die Seitenkontur, die daraus entsteht. Der rote Punkt ist der Start, die senkrechte Linie ist Z null. "
         "Wir nehmen die Aussenkontur, die dünne Seite liegt vorne, so wie das Teil aus der Führungsbüchse kommt. "
         "Mit Andere Seite vorne könntest du das Teil umdrehen. Passt alles, tippst du auf Kontur übernehmen.",
         "<b>Seitenkontur</b>: roter Punkt = Start, Linie = <b>Z0</b>. <b>Aussenkontur</b>, dann <b>„Kontur übernehmen“</b>.")
def s_step2(pg, a):
    a.hin(".kt-modell__bild", klick=False, ms=900)
    a.hin("[data-ktmodell='aussen']", ms=500)
    a.hin("[data-ktmodell='umdrehen']", klick=False, ms=700)
    a.hin("#kt-modell-ok", ms=1000)

@schritt("Jetzt steht die Kontur in der Liste, Element für Element. Jede Gerade, jeder Bogen und jede Schräge hat ihre Zeile mit X und Z. "
         "Oben siehst du die Grafik. [impressed] Und mit drei D wird daraus sofort das fertige Drehteil.",
         "Die Kontur steht in der <b>Liste</b>, oben die <b>Grafik</b>, mit <b>3D</b> das Drehteil.")
def s_liste(pg, a):
    a.hin(".kt-liste", klick=False, ms=700)
    if pg.locator(".kt-liste .kt-el").count() > 6: a.hin(".kt-liste .kt-el >> nth=6", klick=False, ms=600)
    a.hin("#kt-bild", klick=False, ms=500)
    if pg.locator("#kt-3d").count():
        a.hin("#kt-3d", ms=900)
        bb = pg.locator("#kt-k3d").first.bounding_box()
        if bb:
            pg.mouse.move(bb["x"] + bb["width"] * 0.4, bb["y"] + bb["height"] * 0.5, steps=8)
            pg.mouse.down(); pg.mouse.move(bb["x"] + bb["width"] * 0.6, bb["y"] + bb["height"] * 0.35, steps=35); pg.mouse.up()
        pg.wait_for_timeout(1200)
        if pg.locator("#kt-2d").count(): a.hin("#kt-2d", ms=400)

@schritt("Beim Werkzeug trägst du den Schneidenradius ein, hier null komma zwei, den Vorschub null komma null drei und die Schneidenlage. "
         "Der Radius ist im Programm schon eingerechnet, darum braucht es kein G einundvierzig oder zweiundvierzig.",
         "<b>Werkzeug</b>: Schneidenradius <b>0.2</b>, Vorschub <b>0.03</b>, <b>Schneidenlage</b>. Radius ist eingerechnet.")
def s_kt_wz(pg, a):
    a.hin(".kt-werkzeug", klick=False, ms=500)
    a.tippen("[data-ktfeld='rn']", "0.2"); a.tippen("[data-ktfeld='f']", "0.03")
    if pg.locator("[data-ktspitze='ur']").count(): a.hin("[data-ktspitze='ur']", ms=600)

@schritt("Darunter steht das fertige N C Programm. Schrägen schreibt es kurz mit Komma A und dem Winkel, Fasen mit Komma C "
         "und Rundungen mit Komma R. [warmly] Dieses Programm holen wir uns gleich ins Hofer Cam.",
         "Das <b>NC-Programm</b>: Schrägen mit <b>,A</b>, Fasen mit <b>,C</b>, Rundungen mit <b>,R</b>.")
def s_kt_code(pg, a):
    a.hin("#kt-code", klick=False, ms=1500)
    pg.evaluate("document.querySelector('#kt-code')?.scrollBy?.(0, 120)")
    pg.wait_for_timeout(1200)

# ===================== Teil 2: Nuten fräsen ===================================
teil("Nuten fräsen")

@schritt("[cheerfully] Weiter zu den Nuten. Im Reiter Bohren und Fräsen wählst du Nut Quer, eine Längsnut am Umfang, gefräst mit einem quer angetriebenen Werkzeug.",
         "<b>Bohren / Fräsen</b> → <b>„Nut Quer“</b>: Längsnut am Umfang mit einem Querwerkzeug.")
def s_bf(pg, a):
    a.reiter("bohren"); pg.wait_for_selector("#bf-code")
    a.hin("[data-bfart='nutQuer']", ms=900)

@schritt("Teil Durchmesser zehn, die Stirn liegt bei Z null. Die Nut beginnt bei siebenundzwanzig komma fünf und geht bis vierzig komma fünf, "
         "so läuft der Fräser vorne und hinten frei aus dem Bund. Die Tiefe ist eins komma neun.",
         "Teil-Ø <b>10</b>, Stirn <b>Z0</b>, Nut von <b>27.5</b> bis <b>40.5</b>, Tiefe <b>1.9</b>.")
def s_bf_mass(pg, a):
    a.tippen("[data-bf='teilD']", "10"); a.tippen("[data-bf='zStirn']", "0")
    a.tippen("[data-bf='nutVon']", "27.5"); a.tippen("[data-bf='nutBis']", "40.5"); a.tippen("[data-bf='nutTiefe']", "1.9")

@schritt("[excited] Und jetzt neu: Anzahl über den Umfang. Wir tippen sechs, und schon verteilt das Programm sechs gleiche Nuten, alle sechzig Grad. "
         "Die erste liegt bei C null. Die Stirnansicht zeigt es sofort.",
         "Neu: <b>„Anzahl über den Umfang“</b> = <b>6</b>, gleichmässig alle 60°, die erste bei <b>C0</b>.")
def s_bf_anzahl(pg, a):
    a.tippen("[data-bf='startC']", "0"); a.tippen("[data-bf='nutAnzahl']", "6")
    a.hin("#bf-stirn", klick=False, ms=1200)

@schritt("Dann das Werkzeug: ein Fräser Durchmesser zwei, so breit wird die Nut. Zustellung null komma fünf pro Schnitt, "
         "Eintauchen mit vierzig, Fräsen mit hundert Millimeter pro Minute, Drehzahl achttausend.",
         "Fräser <b>Ø2</b> = Nutbreite, Zustellung <b>0.5</b>, Vorschübe <b>40</b> / <b>100</b> mm/min, Drehzahl <b>8'000</b>.")
def s_bf_wz(pg, a):
    a.tippen("[data-bf='fraeser']", "2"); a.tippen("[data-bf='zustellung']", "0.5")
    a.tippen("[data-bf='vorschubZ']", "40"); a.tippen("[data-bf='drehzahl']", "8000"); a.tippen("[data-bf='vorschub']", "100")
    a.hin("#bf-seite", klick=False, ms=800)

@schritt("Unten steht der N C Code, Nut für Nut mit ihrem C Winkel. Den Werkzeugantrieb musst du hier nicht eintragen: "
         "Im Hofer Cam schaltet die Bearbeitung das Werkzeug selbst ein und aus. Die Hinweise in Klammern stören die Maschine nicht.",
         "Der <b>NC-Code</b>, Nut für Nut. Den <b>Antrieb</b> schaltet HOFERCAM selbst, Hinweise in Klammern stören nicht.")
def s_bf_code(pg, a):
    a.hin("#bf-code", klick=False, ms=1600)

# ===================== Teil 3: Entgraten ======================================
teil("Entgraten")

@schritt("[curious] Beim Fräsen entsteht Grat an den Kanten der Nuten. Den nehmen wir im Reiter Entgraten weg. "
         "Die Kanten holen wir direkt aus der STEP Datei: Kanten aus STEP Datei, und die gleiche Datei wählen.",
         "<b>Entgraten</b>: Kanten aus <b>STEP-Datei</b>, dieselbe Datei wählen.")
def s_eg(pg, a):
    a.reiter("entgraten"); pg.wait_for_selector("#eg-code")
    a.hin("[data-egquelle='step']", ms=700)
    pg.set_input_files("#eg-step", STEP)
    pg.wait_for_function("() => /Kanten zum Entgraten/.test(document.querySelector('#eg-quelle')?.textContent || '')", timeout=60000)
    a.hin("#eg-quelle", klick=False, ms=900)

@schritt("Das Programm findet alle scharfen Kanten. Kanten, die der Drehmeissel macht, und Innenecken lässt es von selbst weg. "
         "Wichtig: Andere Seite vorne einschalten, damit vorne dieselbe Seite liegt wie bei der Kontur. Dann Querwerkzeug wählen.",
         "Drehkanten und Innenecken fallen weg. <b>„Andere Seite vorne“</b> wie bei der Kontur, dann <b>„Querwerkzeug“</b>.")
def s_eg_lage(pg, a):
    a.hin("#eg-step-um", ms=200)
    pg.wait_for_timeout(2500)
    a.hin("[data-egri='quer']", ms=600)
    a.hin("[data-egwz='kugel']", ms=500)

@schritt("Wir wollen nur die Kanten der sechs Nuten in der Mitte. Ansicht von der Seite, mit dem Mausrad hineinzoomen, "
         "dann Rechteck und ein Rechteck um den Bund ziehen. [impressed] Gewählt sind genau die Kanten, die ganz im Rechteck liegen, "
         "die Verzahnung und die Enden bleiben aussen vor.",
         "<b>„Von der Seite“</b>, zoomen, <b>„▭ Rechteck“</b> um den Bund: genau diese Kanten sind gewählt.")
def s_eg_rechteck(pg, a):
    a.hin("text=Von der Seite", ms=500)
    box = lambda: pg.evaluate("""() => { let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
      document.querySelectorAll('[data-eg3d]').forEach(e => { const t = e.querySelector('title')?.textContent || '';
        const m = t.match(/Z-([\\d.]+)/); if (!m) return; const z = +m[1]; if (z < 27 || z > 41) return;
        const b = e.getBoundingClientRect(); x1=Math.min(x1,b.left); y1=Math.min(y1,b.top); x2=Math.max(x2,b.right); y2=Math.max(y2,b.bottom); });
      return {x1,y1,x2,y2}; }""")
    b = box()
    pg.mouse.move((b["x1"] + b["x2"]) / 2, (b["y1"] + b["y2"]) / 2, steps=15)
    for _ in range(5): pg.mouse.wheel(0, -120); pg.wait_for_timeout(220)
    pg.wait_for_timeout(400)
    a.hin("#eg-rechteck-knopf", ms=500)
    b = box()
    pg.mouse.move(b["x1"] - 8, b["y1"] - 8, steps=15); pg.mouse.down()
    pg.mouse.move(b["x2"] + 8, b["y2"] + 8, steps=45); pg.mouse.up(); pg.wait_for_timeout(900)
    a.hin("#eg-liste", klick=False, ms=800)

@schritt("Als Werkzeug ein Kugelfräser Durchmesser zwei, die Fase null komma eins. Rechts zeigt die Skizze, wie die Kugel an der Kante steht "
         "und welcher Punkt programmiert wird.",
         "<b>Kugelfräser Ø2</b>, Fase <b>0.1</b>. Rechts die <b>Skizze</b> mit dem programmierten Punkt.")
def s_eg_wz(pg, a):
    a.tippen("[data-eg='durchmesser']", "2"); a.tippen("[data-eg='fase']", "0.1")
    a.hin("#eg-skizze", klick=False, ms=1200)

@schritt("[excited] Und jetzt die Simulation: Abspielen, und das Werkzeug fährt jede Kante ab. Das Teil dreht dabei in C, das Werkzeug steht. "
         "Im Code ist Z wie an der Star: ins Teil grösser.",
         "<b>Simulation</b>: das Werkzeug fährt jede Kante ab, das Teil dreht in C. Z ins Teil <b>grösser</b> wie an der Star.")
def s_eg_sim(pg, a):
    if pg.locator("#eg-sim-tempo").count(): pg.select_option("#eg-sim-tempo", index=pg.locator("#eg-sim-tempo option").count() - 1)
    if pg.locator("#eg-sim-start").count(): a.hin("#eg-sim-start", ms=4500)
    if pg.locator("#eg-sim-halt").count(): a.hin("#eg-sim-halt", ms=300)
    a.hin("#eg-code", klick=False, ms=900)

# ===================== Teil 4: HOFERCAM, Kopf und Drehen ======================
teil("HOFERCAM: Kopfdaten und Drehen")

@schritt("[excited] Jetzt bauen wir alles zusammen, im Hofer Cam. Oben die Kopfdaten, darunter die Bearbeitungen, "
         "und unten die zwei Kanäle nebeneinander: links Kanal eins, rechts Kanal zwei.",
         "<b>HOFERCAM</b>: oben <b>Kopfdaten</b>, dann <b>Bearbeitungen</b>, unten <b>Kanal 1</b> und <b>Kanal 2</b>.")
def s_cam(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    a.hin("#cam-bearb", klick=False, ms=600)
    a.hin("#cam-kanaele", klick=False, ms=900)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)

@schritt("Zuerst das Programm: Nummer für Kanal eins, Kanal zwei bekommt automatisch tausend dazu. Dann die HOCO Nummer, das Datum und dein Kürzel. "
         "Alles landet im Kopf beider Programme.",
         "<b>Programm-Nr.</b> (Kanal 2 = Nr. + 1000), <b>HOCO Nr.</b>, <b>Datum</b>, <b>Kürzel</b>.")
def s_cam_prg(pg, a):
    a.tippen("[data-cam='nr']", "123"); a.tippen("[data-cam='hoco']", "12345-0001")
    a.tippen("[data-cam='datum']", "17.11.26"); a.tippen("[data-cam='kuerzel']", "PR")

@schritt("Dann die Grundvariablen für G zweihundertsechsundsechzig: Materialdurchmesser zehn, Teilelänge zweiundsiebzig komma drei, "
         "Abstechdrehzahl dreitausend, Abstechende minus null komma acht, Z Start hundertzwanzig, Vorschub null komma null drei "
         "und die Breite vom Abstechstahl eins komma fünf. Die Einheit steht immer gleich daneben.",
         "<b>G266</b>: A <b>10</b>, W <b>72.3</b>, S <b>3'000</b>, X <b>-0.8</b>, Z <b>120</b>, F <b>0.03</b>, B <b>1.5</b>. Einheit steht daneben.")
def s_cam_g266(pg, a):
    for n, w in [("A", "10"), ("W", "72.3"), ("S", "3000"), ("X", "-0.8"), ("Z", "120"), ("F", "0.03"), ("B", "1.5")]:
        a.tippen(f"[data-cam='{n}']", w)

@schritt("Für Kanal eins die Schlichtzugabe und die Zugabe zum Plandrehen hinten. Für Kanal zwei, wie die Gegenspindel das Teil abgreift: "
         "zehn Millimeter vor das Teil im Eilgang, dann sechs Millimeter darüber. Unter Bestückung wählst du, was auf Platz vierunddreissig sitzt, "
         "und ob der Abstecher normal oder versetzt ist.",
         "<b>Schlichtzugabe</b>, <b>Plan hinten</b>, Abgreifen <b>10</b> / <b>6</b>. <b>Bestückung</b>: Platz 34 und Abstecher.")
def s_cam_k(pg, a):
    a.tippen("[data-cam='schlicht']", "0.1"); a.tippen("[data-cam='plan']", "0.2")
    a.tippen("[data-cam='annaehern']", "10"); a.tippen("[data-cam='ueber']", "6")
    a.hin("[data-cam='t34']", klick=False, ms=700); a.hin("[data-cam='abArt']", klick=False, ms=700)

@schritt("Mit dem Pfeil bei Kopfdaten klappst du alles ein, dann bleibt eine Zeile mit den Werten und mehr Platz für die Arbeit. "
         "Schau unten in die Kanäle: Kopf und Ende sind schon fertig, mit allen Werten, die du eben eingetippt hast.",
         "<b>„▾ Kopfdaten“</b> klappt ein. Unten: <b>Kopf</b> und <b>Ende</b> beider Kanäle sind schon fertig.")
def s_cam_zu(pg, a):
    a.hin("#cam-kopf-zu", ms=900)
    a.hin("[data-kanal='1'][data-nr='6'] .cam-text, #cam-kanaele", klick=False, ms=1200)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)

@schritt("Jetzt die erste Bearbeitung: plus Drehwerkzeug. Ganz vorne die Bezeichnung, wir schreiben Aussenkontur. Gleich daneben der Platz. "
         "Fährst du mit der Maus über die Liste, zeigt das Bild oben rechts, wo das Werkzeug an der Maschine sitzt. Wir nehmen T zweihundert.",
         "<b>„+ Drehwerkzeug“</b>, <b>Bezeichnung</b> zuvorderst, dann <b>Platz T200</b>. Das <b>Bild</b> zeigt, wo er sitzt.")
def s_cam_dreh(pg, a):
    a.hin("#cam-neu-dreh", ms=700)
    a.tippen(bl(0, "[data-camblock='bez']"), "AUSSENKONTUR")
    a.hin(bl(0, "[data-camblock='platz'] .cam-wahl__knopf"), ms=500)
    for p in ["100", "300", "200"]:
        if pg.locator(f"[data-platz='{p}']").count(): a.hin(f"[data-platz='{p}']", klick=(p == "200"), ms=700)

@schritt("Hochdruck Stufe drei, Drehrichtung M drei. Statt der Drehzahl kannst du auch die Schnittgeschwindigkeit eingeben: "
         "Eingabe auf V C, achtzig Meter pro Minute, und das Programm rechnet die Drehzahl aus dem Materialdurchmesser. "
         "Anfahren Z, und beim Wegfahren ein Winkel.",
         "<b>Hochdruck</b>, <b>M3</b>, <b>Vc 80</b> m/min → Drehzahl aus dem Ø. <b>Anfahren Z</b>, <b>Wegfahren</b> mit Winkel.")
def s_cam_dreh2(pg, a):
    a.hin(bl(0, "[data-camblock='hd']"), klick=False, ms=500)
    if pg.locator(bl(0, "[data-camblock='sArt']")).count():
        pg.select_option(bl(0, "[data-camblock='sArt']"), index=1); a.hin(bl(0, "[data-camblock='sArt']"), klick=False, ms=400)
        if pg.locator(bl(0, "[data-camblock='vc']")).count(): a.tippen(bl(0, "[data-camblock='vc']"), "80")
    a.hin(bl(0, "[data-camblock='anZ']"), klick=False, ms=500)
    a.hin(bl(0, "[data-camblock='wegA']"), klick=False, ms=600)

@schritt("[curious] Und wo kommt die Kontur her? Plus Aus Modul, dann Aktueller Code aus dem Reiter und Hofer Contur. "
         "Die Vorschau zeigt, was kommt, ohne Vor- und Nachspann. Einfügen, [impressed] und schon steht die Kontur in der Bearbeitung "
         "und in Kanal eins orange hervorgehoben.",
         "<b>„+ Aus Modul“</b> → <b>„Aktueller Code aus dem Reiter“</b> → <b>HOFERCONTUR</b> → <b>„Einfügen“</b>.")
def s_cam_modul(pg, a):
    aus_modul(pg, a, 0, "kontur")
    a.hin(".cam-zeile--bereich, #cam-kanaele", klick=False, ms=1200)
    pg.evaluate("scrollTo(0,0)")

@schritt("Mit dem Knopf Werkzeug legst du fest, wie das Werkzeug aussieht. Das braucht die Simulation. Drehwerkzeug, Platte V fünfunddreissig Grad, "
         "Radius null komma zwei, und die Schneidenlage wie an der Maschine. Das Bild darunter zeigt die Platte an der Büchse und am Rohteil.",
         "<b>„🔧 Werkzeug“</b>: Platte <b>V 35°</b>, Radius <b>0.2</b>, <b>Schneidenlage</b>. Das Bild zeigt die Platte am Rohteil.")
def s_cam_wz(pg, a):
    werkzeug(pg, a, 0, "dreh", "V", [("r", "0.2")], lage="ur")
    a.hin("[data-camwz]", klick=False, ms=900)
    wz_zu(pg, a)

# ===================== Teil 5: HOFERCAM, Bohren, Nuten, Entgraten =============
teil("HOFERCAM: Bohren, Nuten und Entgraten")

@schritt("Als Nächstes die Zentrierung vorne: plus Frontwerkzeug, Bezeichnung Zentrieren vorne, Platz T elfhundert, Spindel Hauptspindel. "
         "Drehzahl viertausend, Anfahren Z fünf.",
         "<b>„+ Frontwerkzeug“</b>: <b>ZENTRIEREN VORNE</b>, <b>T1100</b>, Hauptspindel, S <b>4'000</b>, Anfahren Z <b>5</b>.")
def s_front(pg, a):
    a.hin("#cam-neu-front", ms=700)
    a.tippen(bl(1, "[data-camblock='bez']"), "ZENTRIEREN VORNE")
    platz(pg, a, 1, "1100")
    a.tippen(bl(1, "[data-camblock='S']"), "4000"); a.tippen(bl(1, "[data-camblock='anZ']"), "5")

@schritt("Den Code holen wir aus den Vorlagen: plus Vorlage, Tieflochbohren G dreiundachtzig. Tiefe vier komma fünf, Zustellung eins, "
         "Vorschub null komma null zwei. Die Vorschau zeigt den Zyklus, Einfügen setzt ihn ein. Als Werkzeug ein Bohrer Durchmesser eins komma acht.",
         "<b>„+ Vorlage“</b> → <b>Tieflochbohren G83</b>: W <b>4.5</b>, Q <b>1</b>, F <b>0.02</b>. Werkzeug: <b>Bohrer Ø1.8</b>.")
def s_front2(pg, a):
    a.hin(bl(1, "[data-camblock='code']"), ms=200)
    a.hin("[data-camvorlage-auf='1']", ms=700)
    for n, w in [("W", "4.5"), ("Q", "1"), ("F", "0.02")]: a.tippen(f"[data-camvorlage-feld='{n}']", w)
    a.hin("[data-camvorlage-vorschau]", klick=False, ms=800)
    a.hin("[data-camvorlage-einfuegen]", ms=700)
    werkzeug(pg, a, 1, "fraes", "bohrer", [("d", "1.8"), ("winkel", "118"), ("laenge", "8")])
    wz_zu(pg, a)

@schritt("Jetzt die Nuten: plus Querangetrieben, Bezeichnung Nuten fräsen, Platz T einunddreissighundert. Drehrichtung M sechsunddreissig, "
         "Drehzahl achttausend, und Vorschub G achtundneunzig in Millimeter pro Minute, weil der Code aus Bohren und Fräsen so rechnet.",
         "<b>„+ Querangetrieben“</b>: <b>NUTEN FRAESEN</b>, <b>T3100</b>, M36, S <b>8'000</b>, Vorschub <b>G98</b> mm/min.")
def s_quer(pg, a):
    a.hin("#cam-neu-seite", ms=700)
    a.tippen(bl(2, "[data-camblock='bez']"), "NUTEN FRAESEN")
    platz(pg, a, 2, "3100")
    a.tippen(bl(2, "[data-camblock='S']"), "8000")
    if pg.locator(bl(2, "[data-camblock='vor']")).count():
        pg.select_option(bl(2, "[data-camblock='vor']"), index=1); a.hin(bl(2, "[data-camblock='vor']"), klick=False, ms=600)

@schritt("Aus Modul, aktueller Code, Bohren und Fräsen, Einfügen. Alle sechs Nuten stehen drin. Das Werkzeug ist ein Schaftfräser Durchmesser zwei.",
         "<b>„+ Aus Modul“</b> → <b>Bohren / Fräsen</b>. Werkzeug: <b>Schaftfräser Ø2</b>.")
def s_quer2(pg, a):
    aus_modul(pg, a, 2, "bohren")
    werkzeug(pg, a, 2, "fraes", "schaft", [("d", "2"), ("laenge", "6")])
    wz_zu(pg, a)

@schritt("Und das Entgraten genauso: noch einmal plus Querangetrieben, Bezeichnung Entgraten, Platz T zweiunddreissighundert, "
         "Code aus dem Modul Entgraten, Werkzeug Kugelfräser Durchmesser zwei.",
         "Noch einmal <b>„+ Querangetrieben“</b>: <b>ENTGRATEN</b>, <b>T3200</b>, Code aus <b>Entgraten</b>, <b>Kugelfräser Ø2</b>.")
def s_quer3(pg, a):
    a.hin("#cam-neu-seite", ms=700)
    a.tippen(bl(3, "[data-camblock='bez']"), "ENTGRATEN")
    platz(pg, a, 3, "3200")
    a.tippen(bl(3, "[data-camblock='S']"), "8000")
    if pg.locator(bl(3, "[data-camblock='vor']")).count(): pg.select_option(bl(3, "[data-camblock='vor']"), index=1)
    aus_modul(pg, a, 3, "entgraten")
    werkzeug(pg, a, 3, "fraes", "kugel", [("d", "2"), ("laenge", "4")])
    wz_zu(pg, a)

@schritt("Bleibt die Zentrierung hinten, an der Gegenspindel: plus Frontwerkzeug, Bezeichnung Zentrieren hinten, Platz T zwölfhundert, "
         "und bei Spindel Gegenspindel. [impressed] Jetzt verteilt das Programm die Arbeit auf beide Kanäle: Kanal eins ruft das Werkzeug, "
         "Kanal zwei fährt die Gegenspindel, und Wartemarken halten beide zusammen.",
         "<b>„+ Frontwerkzeug“</b> an der <b>Gegenspindel</b>: <b>T1200</b>. Beide Kanäle mit <b>Wartemarken</b> verbunden.")
def s_gegen(pg, a):
    a.hin("#cam-neu-front", ms=700)
    a.tippen(bl(4, "[data-camblock='bez']"), "ZENTRIEREN HINTEN")
    platz(pg, a, 4, "1200")
    if pg.locator(bl(4, "[data-camblock='spindel']")).count():
        pg.select_option(bl(4, "[data-camblock='spindel']"), "gegen"); a.hin(bl(4, "[data-camblock='spindel']"), klick=False, ms=700)
    a.tippen(bl(4, "[data-camblock='S']"), "4000")
    a.hin(bl(4, "[data-camblock='m1']"), klick=False, ms=500); a.hin(bl(4, "[data-camblock='m2']"), klick=False, ms=500)

@schritt("Auch hier die Vorlage Tieflochbohren und ein Bohrer eins komma acht. Die Marken Start und Ende kannst du leer lassen, "
         "dann nimmt das Programm freie Marken ab M dreihundert, immer in Zehnerschritten.",
         "Vorlage <b>G83</b>, <b>Bohrer Ø1.8</b>. Marken leer lassen: frei ab <b>M300</b> in Zehnerschritten.")
def s_gegen2(pg, a):
    a.hin(bl(4, "[data-camblock='code']"), ms=200)
    a.hin("[data-camvorlage-auf='4']", ms=600)
    for n, w in [("W", "4.5"), ("Q", "1"), ("F", "0.02")]: a.tippen(f"[data-camvorlage-feld='{n}']", w)
    a.hin("[data-camvorlage-einfuegen]", ms=600)
    werkzeug(pg, a, 4, "fraes", "bohrer", [("d", "1.8"), ("winkel", "118"), ("laenge", "8")])
    wz_zu(pg, a)

@schritt("In den Kanälen stehen gleiche Wartemarken immer auf derselben Zeile. [serious] Fehlt eine Gegenmarke, wird sie rot. "
         "Brauchst du in einer Bearbeitung zusätzlich zwei Marken, setzt plus Wartemarken sie an der Schreibmarke ein, "
         "und für den anderen Kanal erscheint ein Feld für den Code dazwischen.",
         "Gleiche <b>Wartemarken</b> auf derselben Zeile, ohne Gegenstück <b>rot</b>. <b>„+ Wartemarken“</b> setzt zwei freie ein.")
def s_marken(pg, a):
    if pg.locator(".cam-zeile--sync").count(): a.hin(".cam-zeile--sync >> nth=0", klick=False, ms=900)
    if pg.locator(".cam-zeile--sync").count() > 1: a.hin(".cam-zeile--sync >> nth=-1", klick=False, ms=900)
    pg.evaluate("scrollTo(0,0)")
    a.hin("[data-cammarken-auf='2']", klick=False, ms=1000)

@schritt("Die Reihenfolge änderst du am Griff links: einfach ziehen, oder mit den Pfeilen hoch und runter. Danach nummeriert das Programm "
         "alle Marken der Bearbeitungen neu, Kopf und Ende bleiben, wie sie sind.",
         "Reihenfolge am <b>Griff ⠿</b> ziehen oder mit <b>↑ ↓</b>. Die Marken werden <b>neu nummeriert</b>.")
def s_reihe(pg, a):
    if pg.locator(bl(1, ".ziehliste__griff, .cam-zieh__griff")).count(): a.hin(bl(1, ".ziehliste__griff, .cam-zieh__griff"), klick=False, ms=800)
    if pg.locator("[data-camblock-pfeil='1']").count(): a.hin("[data-camblock-pfeil='1']", klick=False, ms=800)

# ===================== Teil 6: 3D-Simulation und Abschluss ===================
teil("3D-Simulation und Abschluss")

@schritt("[excited] Jetzt der beste Teil: drei D Simulation. Links die Bearbeitungen der Reihe nach, rechts das Teil. "
         "Das Rohmaterial ist erdig gefärbt, alles Bearbeitete hell und metallisch.",
         "<b>„🧊 3D-Simulation“</b>: links die Bearbeitungen, rechts das Teil. <b>Rohmaterial</b> erdig, <b>bearbeitet</b> hell.")
def s_sim(pg, a):
    a.hin("[data-cam-sim]", ms=300)
    pg.wait_for_selector("#cam-sim", timeout=30000); pg.wait_for_timeout(1500)
    a.hin("#cam-sim-titel", klick=False, ms=700)

@schritt("Mit Einzeln hält die Simulation nach jeder Bearbeitung an. Abspielen, und wir schauen der Aussenkontur zu: "
         "das Material fährt in Z aus der Führungsbüchse, das Werkzeug fährt in X.",
         "<b>„Einzeln“</b>: hält nach jeder Bearbeitung. Das <b>Material</b> fährt in Z, das <b>Werkzeug</b> in X.")
def s_sim2(pg, a):
    if pg.locator("#cam-sim-einzeln").count(): a.hin("#cam-sim-einzeln", ms=400)
    a.hin("#cam-sim-start", ms=6500)

@schritt("Mit Maschine fährt der ganze Werkzeugträger mit, mit allen Haltern und der Führungsbüchse. Und Aufgeschnitten zeigt das Innere, "
         "zum Beispiel die Zentrierbohrung.",
         "<b>„Maschine“</b>: Werkzeugträger und Büchse fahren mit. <b>„Aufgeschnitten“</b> zeigt das Innere.")
def s_sim3(pg, a):
    if pg.locator("#cam-sim-maschine").count(): a.hin("#cam-sim-maschine", ms=900)
    a.hin("#cam-sim-start", ms=6000)
    if pg.locator("#cam-sim-schnitt").count(): a.hin("#cam-sim-schnitt", ms=1500); a.hin("#cam-sim-schnitt", ms=400)

@schritt("Weiter mit Abspielen: Jetzt die sechs Nuten. Das Teil dreht in C unter das Werkzeug, die Maschine steht. "
         "Und danach entgratet der Kugelfräser jede Kante.",
         "Die <b>Nuten</b>: das Teil dreht in <b>C</b>, die Maschine steht. Danach das <b>Entgraten</b>.")
def s_sim4(pg, a):
    a.hin("#cam-sim-start", ms=7000)
    a.hin("#cam-sim-start", ms=6000)

@schritt("Mit Einzelsatz geht es sogar Zeile für Zeile, unten steht immer, was als Nächstes kommt. Und mit dem Regler springst du an jede Stelle.",
         "<b>„Einzelsatz“</b>: Zeile für Zeile, unten <b>„als Nächstes“</b>. Der <b>Regler</b> springt an jede Stelle.")
def s_sim5(pg, a):
    if pg.locator("#cam-sim-satz").count():
        a.hin("#cam-sim-satz", ms=400)
        for _ in range(3): a.hin("#cam-sim-start", ms=900)
        a.hin("#cam-sim-naechst, #cam-sim-zeile", klick=False, ms=900)
        a.hin("#cam-sim-satz", ms=300)
    a.hin("#cam-sim-regler", klick=False, ms=500)
    if pg.locator("#cam-sim-ende").count(): a.hin("#cam-sim-ende", ms=1500)

@schritt("Am Ende kommt Abstechen und Übergabe: Die Gegenspindel fährt vor, greift das Teil, der Abstecher trennt es von der Stange, "
         "und in Kanal zwei wird hinten zentriert. [laughs softly] Fertig ist das Teil, ganz ohne Maschine.",
         "<b>Abstechen und Übergabe</b>, dann <b>Kanal 2</b> hinten zentrieren. Fertig, ganz ohne Maschine.")
def s_sim6(pg, a):
    n = pg.locator("[data-cam-sim-schritt]").count()
    if n: a.hin(f"[data-cam-sim-schritt] >> nth={n - 1}", ms=2500)
    if n > 1: a.hin(f"[data-cam-sim-schritt] >> nth={n - 2}", ms=2500)

@schritt("Schliessen, und oben rechts speicherst du das Programm mit Speichern für alle. Öffnen holt es wieder. "
         "In jedem Kanal kopierst du das Programm oder lädst es als Datei für die Maschine herunter. "
         "Und mit Eigenes Fenster ziehst du die Kanäle auf einen zweiten Bildschirm.",
         "<b>„Speichern“</b> / <b>„Öffnen“</b> oben rechts. Je Kanal <b>Kopieren</b> und <b>Herunterladen</b>. <b>„⧉ Eigenes Fenster“</b>.")
def s_ende1(pg, a):
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    if pg.locator("#cam-sim").count():
        z = pg.locator("#cam-sim button[title='Schliessen'], #cam-sim .dialog__zu")
        if z.count(): z.first.click()
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)
    for k in ["#camab-speichern, .nc-ablage button >> nth=1", "#camab-oeffnen, .nc-ablage button >> nth=0"]:
        if pg.locator(k).count(): a.hin(k, klick=False, ms=800)
    for k in ["[data-cam-kopieren='1']", "[data-cam-laden='1']", "#cam-fenster"]:
        if pg.locator(k).count(): a.hin(k, klick=False, ms=800)

@schritt("[serious] Und ganz wichtig: Jedes Programm vor dem ersten Lauf an der Maschine im Einzelsatz prüfen. "
         "[warmly] Viel Erfolg mit Hofer Cam!",
         "Vor dem ersten Lauf immer <b>im Einzelsatz prüfen</b>.")
def s_ende2(pg, a):
    a.titel("Viel Erfolg mit HOFERCAM", "Hofer + Co. Präzisionsdrehteile")
    pg.wait_for_timeout(3000)

# ---- Text und Ton -----------------------------------------------------------
ohne_tags = lambda t: re.sub(r"\s*\[[^\]]+\]\s*", " ", t).strip()

def text_schreiben(datei):
    z = ["# HOFERCAM Erklärvideo: Sprechertext für ElevenLabs v3", "",
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
if not STEP or not os.path.isfile(STEP):
    raise SystemExit("STEP=<datei> fehlt: das 3D-Modell steht bewusst nicht im Repository")

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
    fehler = []
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
    pg.set_default_timeout(6000)

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
        except Exception as e:
            # Weiterfahren, damit eine Probeaufnahme alle Stolpersteine auf einmal zeigt
            pg.screenshot(path=os.path.join(tempfile.gettempdir(), f"tutorial-fehler-{i}.png"))
            print("Fehler bei Schritt", i, f.__name__, str(e).splitlines()[0])
            fehler.append(f.__name__)
            pg.keyboard.press("Escape")
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
print("Schritte mit Fehler:", fehler or "keine")
print("Video:", os.path.abspath(ZIEL), round(os.path.getsize(ZIEL) / 1e6, 2), "MB")
