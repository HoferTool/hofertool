# Nimmt das ausführliche Erklärvideo für HOFERCAM auf: ein ganzes Teil von
# den Kopfdaten bis zur 3D-Simulation, die Module dazwischen (Wunsch Patrick 17. November 2026:
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
import json, os, re, sys, time, shutil, subprocess, tempfile, json
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

# Seit 17. November 2026 beginnt das Video in HOFERCAM und springt beim
# Programmieren in die Module (Patrick: „starte im Tutorial mit dem HOFERCAM
# und nicht mit den Modulen, springe in die Module während dem
# Programmieren“). Bearbeitungsfolge nach der Regel der Führungsbüchse:
# was aussen schon bearbeitet ist, darf nie mehr zurück in die Büchse
# (Patrick: „du musst also die Bearbeitungsstrategie ändern“). Darum die
# Kontur in zwei Stücken: vorne bis ans Ende des Bunds (Ø10 = Rohmass,
# Z36.75), dann Nuten und Entgraten, dann der Rest nach hinten. Platte
# V 35° neutral (Lage Mitte unten), damit ihre Rückseite beim
# Hinunterdrehen in X− die Kontur nicht verletzt.
BUND_ENDE = 36.75

def kontur_elemente(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.kt-liste [data-ktel]')].map((e) => ({
      x: parseFloat((e.querySelector("[data-ktfeld='x']")?.value || "").replace(",", ".")), z: parseFloat((e.querySelector("[data-ktfeld='z']")?.value || "").replace(",", ".")) }))""")

def kontur_aus_step(pg, a, zeigen=True):
    pg.set_input_files("#kt-step", STEP)
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(800)
    if zeigen:
        m3 = pg.locator("#kt-modell-3d").bounding_box()
        if m3:
            pg.mouse.move(m3["x"] + m3["width"] * 0.35, m3["y"] + m3["height"] * 0.5, steps=12)
            pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.6, m3["y"] + m3["height"] * 0.42, steps=40); pg.mouse.up()
            pg.wait_for_timeout(500)
        a.hin("#kt-modell-achse", klick=False, ms=900)
        a.hin(".kt-modell__bild", klick=False, ms=700)
    a.hin("[data-ktmodell='aussen']", ms=400)
    a.hin("#kt-modell-ok", ms=900)

def bund_index(pg):
    el = kontur_elemente(pg)
    for i, e in enumerate(el):
        if abs(abs(e["z"]) - BUND_ENDE) < 0.02:  # leeres X = bleibt gleich (hier Ø10)
            return i, len(el)
    raise RuntimeError("Bund nicht gefunden: " + repr(el))

def element_weg(pg, a, i, ms=250):
    a.hin(f"[data-ktweg='{i}']", ms=ms)

# ===================== Teil 1: HOFERCAM und die Strategie =====================
teil("HOFERCAM, Kopfdaten und Strategie")

@schritt("[excited] Hallo und willkommen zum grossen Hofer Cam Tutorial! [warmly] Heute programmieren wir zusammen ein echtes Teil "
         "für die Star S B zwanzig R G, von den Kopfdaten bis zur fertigen drei D Simulation. Wir arbeiten im Hofer Cam "
         "und holen uns den Code aus den Modulen genau dann, wenn wir ihn brauchen.",
         "Ein ganzes Teil in <b>HOFERCAM</b>, für die <b>Star SB-20RG</b>. Den Code holen wir aus den <b>Modulen</b>, wenn wir ihn brauchen.")
def s_start(pg, a):
    a.titel("HOFERCAM Schritt für Schritt", "Ein ganzes Teil von den Kopfdaten bis zur 3D-Simulation")
    pg.wait_for_timeout(4500); a.titel("")

@schritt("Das ist Hofer Cam. Oben die Kopfdaten, darunter die Bearbeitungen, und unten die zwei Kanäle nebeneinander: "
         "links Kanal eins, rechts Kanal zwei. Hofer Cam ist der erste Reiter in N C Pro.",
         "<b>HOFERCAM</b>: oben <b>Kopfdaten</b>, dann <b>Bearbeitungen</b>, unten <b>Kanal 1</b> und <b>Kanal 2</b>.")
def s_cam(pg, a):
    a.hin("[data-unter='nc/cam'], .reiter [data-rech='cam']", klick=False, ms=600)
    a.hin("#cam-bearb", klick=False, ms=600)
    a.hin("#cam-kanaele", klick=False, ms=900)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)

@schritt("Unser Teil ist eine Welle aus Stangenmaterial Durchmesser zehn, zweiundsiebzig komma drei Millimeter lang. "
         "In der Mitte hat sie einen Bund mit sechs Längsnuten. [curious] Die Verzahnung hinten und die zwei kleinen Nuten an den Enden lassen wir heute weg. "
         "Zuerst das Programm: Nummer für Kanal eins, Kanal zwei bekommt automatisch tausend dazu. Dann die HOCO Nummer, das Datum und dein Kürzel.",
         "Welle <b>Ø10 × 72.3</b> mit <b>6 Nuten</b>. <b>Programm-Nr.</b> (Kanal 2 = Nr. + 1000), <b>HOCO Nr.</b>, <b>Datum</b>, <b>Kürzel</b>.")
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
    a.hin("#cam-kanaele", klick=False, ms=1200)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)

@schritt("[serious] Bevor wir loslegen, die wichtigste Regel beim Langdrehen: Das Material wird in der Führungsbüchse am Rohdurchmesser geführt. "
         "Was aussen schon bearbeitet ist, darf nie mehr zurück in die Büchse, sonst ist es nicht mehr geführt. "
         "Darum arbeiten wir von vorne nach hinten: zuerst zentrieren, dann die Kontur vorne bis ans Ende vom Bund, der noch Rohdurchmesser hat. "
         "Dann die Nuten fräsen und entgraten, und erst danach die Kontur hinten fertig drehen.",
         "Regel: Bearbeitetes <b>nie zurück in die Führungsbüchse</b>. Reihenfolge: <b>zentrieren</b>, <b>Kontur vorne</b> bis zum Bund, "
         "<b>Nuten</b>, <b>entgraten</b>, <b>Kontur hinten</b>.")
def s_strategie(pg, a):
    a.titel("Von vorne nach hinten", "Zentrieren · Kontur vorne · Nuten · Entgraten · Kontur hinten · Abstechen")
    pg.wait_for_timeout(5500); a.titel("")

# ===================== Teil 2: Zentrieren und Kontur vorne ====================
teil("Zentrieren und Kontur vorne")

@schritt("Die erste Bearbeitung ist die Zentrierung vorne: plus Frontwerkzeug. Ganz vorne die Bezeichnung, Zentrieren vorne. "
         "Gleich daneben der Platz. Fährst du mit der Maus über die Liste, zeigt das Bild oben rechts, wo das Werkzeug an der Maschine sitzt. "
         "Wir nehmen T elfhundert, Spindel Hauptspindel, Drehzahl viertausend, Anfahren Z fünf.",
         "<b>„+ Frontwerkzeug“</b>: <b>ZENTRIEREN VORNE</b>, <b>T1100</b>. Das <b>Bild</b> zeigt den Platz. S <b>4'000</b>, Anfahren Z <b>5</b>.")
def s_front(pg, a):
    a.hin("#cam-neu-front", ms=700)
    a.tippen(bl(0, "[data-camblock='bez']"), "ZENTRIEREN VORNE")
    a.hin(bl(0, "[data-camblock='platz'] .cam-wahl__knopf"), ms=500)
    for p in ["1200", "1300", "1100"]:
        if pg.locator(f"[data-platz='{p}']").count(): a.hin(f"[data-platz='{p}']", klick=(p == "1100"), ms=700)
    a.tippen(bl(0, "[data-camblock='S']"), "4000"); a.tippen(bl(0, "[data-camblock='anZ']"), "5")

@schritt("Den Code holen wir aus den Vorlagen: plus Vorlage, Tieflochbohren G dreiundachtzig. Tiefe vier komma fünf, Zustellung eins, "
         "Vorschub null komma null zwei. Die Vorschau zeigt den Zyklus, Einfügen setzt ihn ein. Mit dem Knopf Werkzeug legst du fest, "
         "wie das Werkzeug aussieht, das braucht die Simulation: ein Bohrer Durchmesser eins komma acht.",
         "<b>„+ Vorlage“</b> → <b>Tieflochbohren G83</b>: W <b>4.5</b>, Q <b>1</b>, F <b>0.02</b>. <b>„🔧 Werkzeug“</b>: <b>Bohrer Ø1.8</b>.")
def s_front2(pg, a):
    a.hin(bl(0, "[data-camblock='code']"), ms=200)
    a.hin("[data-camvorlage-auf='0']", ms=700)
    a.hin("[data-camvorlage-bild='g83']", ms=700)
    for n, w in [("W", "4.5"), ("Q", "1"), ("F", "0.02")]: a.tippen(f"[data-camvorlage-feld='{n}']", w)
    a.hin("[data-camvorlage-vorschau]", klick=False, ms=800)
    a.hin("[data-camvorlage-einfuegen]", ms=700)
    werkzeug(pg, a, 0, "fraes", "bohrer", [("d", "1.8"), ("winkel", "118"), ("laenge", "8")])
    wz_zu(pg, a)

@schritt("Jetzt die Kontur vorne: plus Drehwerkzeug, Bezeichnung Kontur vorne, Platz T zweihundert. Hochdruck Stufe drei, Drehrichtung M drei. "
         "Statt der Drehzahl geben wir die Schnittgeschwindigkeit ein: Eingabe auf V C, achtzig Meter pro Minute, "
         "das Programm rechnet die Drehzahl aus dem Materialdurchmesser.",
         "<b>„+ Drehwerkzeug“</b>: <b>KONTUR VORNE</b>, <b>T200</b>, Hochdruck, <b>M3</b>, <b>Vc 80</b> m/min → Drehzahl aus dem Ø.")
def s_dreh(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-neu-dreh", ms=700)
    a.tippen(bl(1, "[data-camblock='bez']"), "KONTUR VORNE")
    platz(pg, a, 1, "200")
    a.hin(bl(1, "[data-camblock='hd']"), klick=False, ms=400)
    if pg.locator(bl(1, "[data-camblock='sArt']")).count():
        pg.select_option(bl(1, "[data-camblock='sArt']"), index=1); a.hin(bl(1, "[data-camblock='sArt']"), klick=False, ms=400)
        if pg.locator(bl(1, "[data-camblock='vc']")).count(): a.tippen(bl(1, "[data-camblock='vc']"), "80")

@schritt("[curious] Und woher kommt die Kontur? Dafür springen wir jetzt in Hofer Contur. Mit drei D Modell wählst du die STEP Datei. "
         "Links das Modell als Drahtgitter, ziehen dreht es, die strichpunktierte Linie ist die Drehachse, die das Programm selbst gefunden hat. "
         "Rechts die Seitenkontur. Aussenkontur, und Kontur übernehmen.",
         "Sprung nach <b>HOFERCONTUR</b> → <b>„3D-Modell“</b>: STEP-Datei, <b>Drehachse</b>, <b>Aussenkontur</b>, <b>„Kontur übernehmen“</b>.")
def s_kt1(pg, a):
    a.reiter("kontur"); pg.wait_for_selector("#kt-code")
    a.hin("label:has(#kt-step)", klick=False, ms=500)
    kontur_aus_step(pg, a)

@schritt("Jetzt steht die ganze Kontur in der Liste, Element für Element. Für diese Bearbeitung brauchen wir aber nur den vorderen Teil, "
         "bis ans Ende vom Bund bei Z sechsunddreissig komma fünfundsiebzig. Alles dahinter löschen wir mit dem Kreuz, die Grafik zeigt sofort, was bleibt.",
         "Die Kontur in der <b>Liste</b>. Wir brauchen nur den Teil <b>bis zum Bund-Ende Z36.75</b>, der Rest weg mit <b>✕</b>.")
def s_kt2(pg, a):
    a.hin(".kt-liste", klick=False, ms=600)
    i, n = bund_index(pg)
    a.hin(f"[data-ktel='{i}']", klick=False, ms=900)
    for k in range(n - 1, i, -1): element_weg(pg, a, k)
    a.hin("#kt-bild", klick=False, ms=900)

@schritt("Beim Werkzeug der Schneidenradius null komma zwei und der Vorschub null komma null drei. [serious] Wichtig ist die Schneidenlage: "
         "Wir nehmen eine V Platte fünfunddreissig Grad, neutral, also Mitte unten. Sie hat auf beiden Seiten Luft. "
         "So verletzt die Rückseite der Platte die Kontur nicht, wenn sie an einer Schräge oder einem Absatz nach unten dreht.",
         "Radius <b>0.2</b>, F <b>0.03</b>. Schneidenlage <b>Mitte unten</b>: neutrale <b>V-Platte 35°</b>, Luft auf beiden Seiten.")
def s_kt3(pg, a):
    a.hin(".kt-werkzeug", klick=False, ms=400)
    a.tippen("[data-ktfeld='rn']", "0.2"); a.tippen("[data-ktfeld='f']", "0.03")
    a.hin("[data-ktspitze='u']", ms=900)
    a.hin("#kt-code", klick=False, ms=1200)

@schritt("Zurück im Hofer Cam: plus Aus Modul, Aktueller Code aus dem Reiter, Hofer Contur. Die Vorschau zeigt, was kommt. "
         "Einfügen, [impressed] und die Kontur steht in der Bearbeitung und in Kanal eins orange hervorgehoben. "
         "Dazu das Werkzeug: Platte V fünfunddreissig Grad, Radius null komma zwei, Schneidenlage Mitte unten, genau wie in Hofer Contur.",
         "Zurück in <b>HOFERCAM</b>: <b>„+ Aus Modul“</b> → <b>„Aktueller Code“</b> → <b>HOFERCONTUR</b>. Werkzeug <b>V 35°</b>, R <b>0.2</b>, <b>Mitte unten</b>.")
def s_kt4(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    aus_modul(pg, a, 1, "kontur")
    werkzeug(pg, a, 1, "dreh", "V", [("r", "0.2")], lage="u")
    a.hin("[data-camwz]", klick=False, ms=900)
    wz_zu(pg, a)

# ===================== Teil 3: Nuten und Entgraten ============================
teil("Nuten und Entgraten")

@schritt("Jetzt die Nuten: plus Querangetrieben, Bezeichnung Nuten fräsen, Platz T einunddreissighundert, Drehzahl achttausend "
         "und Vorschub G achtundneunzig in Millimeter pro Minute. [serious] Ganz wichtig: Anfahren Z achtundzwanzig. "
         "So fährt das Werkzeug direkt zur Nut, und die gedrehte Kontur vorne bleibt draussen vor der Büchse.",
         "<b>„+ Querangetrieben“</b>: <b>NUTEN FRAESEN</b>, <b>T3100</b>, S <b>8'000</b>, <b>G98</b>. <b>Anfahren Z 28</b>: die gedrehte Kontur vorne bleibt draussen.")
def s_quer(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-neu-seite", ms=700)
    a.tippen(bl(2, "[data-camblock='bez']"), "NUTEN FRAESEN")
    platz(pg, a, 2, "3100")
    a.tippen(bl(2, "[data-camblock='S']"), "8000")
    if pg.locator(bl(2, "[data-camblock='vor']")).count():
        pg.select_option(bl(2, "[data-camblock='vor']"), index=1); a.hin(bl(2, "[data-camblock='vor']"), klick=False, ms=500)
    a.tippen(bl(2, "[data-camblock='anZ']"), "28")

@schritt("[cheerfully] Den Code holen wir im Reiter Bohren und Fräsen: Nut Quer. Teil Durchmesser zehn, Stirn bei Z null, "
         "die Nut von siebenundzwanzig komma fünf bis vierzig komma fünf, Tiefe eins komma neun. "
         "Und neu: Anzahl über den Umfang. Sechs, und das Programm verteilt sechs gleiche Nuten, alle sechzig Grad.",
         "Sprung nach <b>Bohren / Fräsen</b> → <b>„Nut Quer“</b>: Ø<b>10</b>, <b>27.5</b> bis <b>40.5</b>, Tiefe <b>1.9</b>, <b>Anzahl 6</b>.")
def s_bf(pg, a):
    a.reiter("bohren"); pg.wait_for_selector("#bf-code")
    a.hin("[data-bfart='nutQuer']", ms=700)
    a.tippen("[data-bf='teilD']", "10"); a.tippen("[data-bf='zStirn']", "0")
    a.tippen("[data-bf='nutVon']", "27.5"); a.tippen("[data-bf='nutBis']", "40.5"); a.tippen("[data-bf='nutTiefe']", "1.9")
    a.tippen("[data-bf='startC']", "0"); a.tippen("[data-bf='nutAnzahl']", "6")
    a.hin("#bf-stirn", klick=False, ms=900)

@schritt("Ein Fräser Durchmesser zwei, so breit wird die Nut. Zustellung eins komma neun, also jede Nut in einem Zug auf volle Tiefe. "
         "[serious] So fährt die genutete Partie nicht mehrmals zurück in die Führungsbüchse, vom Mantel bleibt dort ja nicht mehr viel. "
         "Eintauchen mit vierzig, Fräsen mit hundert. "
         "Unten steht der Code, Nut für Nut mit ihrem C Winkel. Zurück im Hofer Cam: Aus Modul, Bohren und Fräsen, Einfügen, "
         "und als Werkzeug ein Schaftfräser Durchmesser zwei.",
         "Fräser <b>Ø2</b>, Zustellung <b>1.9</b> = volle Tiefe in einem Zug, <b>40</b> / <b>100</b> mm/min. Zurück: <b>„+ Aus Modul“</b> → <b>Bohren / Fräsen</b>, <b>Schaftfräser Ø2</b>.")
def s_bf2(pg, a):
    a.tippen("[data-bf='fraeser']", "2"); a.tippen("[data-bf='zustellung']", "1.9")
    a.tippen("[data-bf='vorschubZ']", "40"); a.tippen("[data-bf='drehzahl']", "8000"); a.tippen("[data-bf='vorschub']", "100")
    a.hin("#bf-code", klick=False, ms=1000)
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    aus_modul(pg, a, 2, "bohren")
    werkzeug(pg, a, 2, "fraes", "schaft", [("d", "2"), ("laenge", "6")])
    wz_zu(pg, a)

@schritt("Beim Fräsen entsteht Grat an den Kanten der Nuten. Darum noch einmal plus Querangetrieben: Bezeichnung Entgraten, "
         "Platz T zweiunddreissighundert, Drehzahl achttausend, G achtundneunzig, und wieder Anfahren Z achtundzwanzig.",
         "Noch einmal <b>„+ Querangetrieben“</b>: <b>ENTGRATEN</b>, <b>T3200</b>, S <b>8'000</b>, <b>G98</b>, <b>Anfahren Z 28</b>.")
def s_eg0(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-neu-seite", ms=700)
    a.tippen(bl(3, "[data-camblock='bez']"), "ENTGRATEN")
    platz(pg, a, 3, "3200")
    a.tippen(bl(3, "[data-camblock='S']"), "8000")
    if pg.locator(bl(3, "[data-camblock='vor']")).count(): pg.select_option(bl(3, "[data-camblock='vor']"), index=1)
    a.tippen(bl(3, "[data-camblock='anZ']"), "28")

@schritt("Der Code kommt aus dem Reiter Entgraten. Die Kanten holen wir direkt aus der STEP Datei. Das Programm findet alle scharfen Kanten, "
         "Drehkanten und Innenecken lässt es von selbst weg. Andere Seite vorne einschalten, damit vorne dieselbe Seite liegt wie bei der Kontur, "
         "dann Querwerkzeug und Kugelfräser.",
         "Sprung nach <b>Entgraten</b>: Kanten aus der <b>STEP-Datei</b>, <b>„Andere Seite vorne“</b>, <b>Querwerkzeug</b>, <b>Kugelfräser</b>.")
def s_eg(pg, a):
    a.reiter("entgraten"); pg.wait_for_selector("#eg-code")
    a.hin("[data-egquelle='step']", ms=600)
    pg.set_input_files("#eg-step", STEP)
    pg.wait_for_function("() => /Kanten zum Entgraten/.test(document.querySelector('#eg-quelle')?.textContent || '')", timeout=60000)
    a.hin("#eg-quelle", klick=False, ms=700)
    a.hin("#eg-step-um", ms=200)
    pg.wait_for_timeout(2500)
    a.hin("[data-egri='quer']", ms=500)
    a.hin("[data-egwz='kugel']", ms=500)

@schritt("Wir entgraten die Kanten der Nuten am Bund, also bis Z sechsunddreissig komma fünfundsiebzig. Ansicht von der Seite, hineinzoomen, "
         "dann Rechteck und ein Rechteck um den Bund ziehen. [impressed] Gewählt sind genau die Kanten, die ganz im Rechteck liegen. "
         "Die Kanten dahinter entstehen erst mit der Kontur hinten, dort nimmt der Drehmeissel den Grat mit.",
         "<b>„Von der Seite“</b>, zoomen, <b>„▭ Rechteck“</b> um den <b>Bund</b>. Die Kanten dahinter macht erst die <b>Kontur hinten</b>.")
def s_eg_rechteck(pg, a):
    a.hin("text=Von der Seite", ms=500)
    box = lambda: pg.evaluate("""() => { let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
      document.querySelectorAll('[data-eg3d]').forEach(e => { const t = e.querySelector('title')?.textContent || '';
        const m = t.match(/Z-([\\d.]+)/); if (!m) return; const z = +m[1]; if (z < 28.5 || z > 36.6) return;
        const b = e.getBoundingClientRect(); x1=Math.min(x1,b.left); y1=Math.min(y1,b.top); x2=Math.max(x2,b.right); y2=Math.max(y2,b.bottom); });
      return {x1,y1,x2,y2}; }""")
    b = box()
    pg.mouse.move((b["x1"] + b["x2"]) / 2, (b["y1"] + b["y2"]) / 2, steps=15)
    for _ in range(5): pg.mouse.wheel(0, -120); pg.wait_for_timeout(220)
    pg.wait_for_timeout(400)
    a.hin("#eg-rechteck-knopf", ms=500)
    b = box()
    pg.mouse.move(b["x1"] - 4, b["y1"] - 8, steps=15); pg.mouse.down()
    pg.mouse.move(b["x2"] + 4, b["y2"] + 8, steps=45); pg.mouse.up(); pg.wait_for_timeout(900)
    a.hin("#eg-liste", klick=False, ms=800)
    print("  Entgraten gewählt:", pg.evaluate("() => (document.querySelector('#eg-liste')?.textContent || '').slice(0, 300)"))

@schritt("Kugelfräser Durchmesser zwei, Fase null komma eins. Die Skizze zeigt, wie die Kugel an der Kante steht. "
         "[excited] Und die Simulation: Das Teil dreht in C, das Werkzeug fährt jede Kante ab.",
         "<b>Kugelfräser Ø2</b>, Fase <b>0.1</b>, <b>Skizze</b>. <b>Simulation</b>: das Teil dreht in C.")
def s_eg_wz(pg, a):
    a.tippen("[data-eg='durchmesser']", "2"); a.tippen("[data-eg='fase']", "0.1")
    a.hin("#eg-skizze", klick=False, ms=900)
    if pg.locator("#eg-sim-tempo").count(): pg.select_option("#eg-sim-tempo", index=pg.locator("#eg-sim-tempo option").count() - 1)
    if pg.locator("#eg-sim-start").count(): a.hin("#eg-sim-start", ms=4000)
    if pg.locator("#eg-sim-halt").count(): a.hin("#eg-sim-halt", ms=300)

@schritt("Zurück im Hofer Cam: Aus Modul, Entgraten, Einfügen, und als Werkzeug der Kugelfräser Durchmesser zwei.",
         "Zurück: <b>„+ Aus Modul“</b> → <b>Entgraten</b>, Werkzeug <b>Kugelfräser Ø2</b>.")
def s_eg2(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    aus_modul(pg, a, 3, "entgraten")
    werkzeug(pg, a, 3, "fraes", "kugel", [("d", "2"), ("laenge", "4")])
    wz_zu(pg, a)

# ===================== Teil 4: Kontur hinten und Gegenspindel =================
teil("Kontur hinten und Gegenspindel")

@schritt("Jetzt die Kontur hinten: plus Drehwerkzeug, Bezeichnung Kontur hinten, wieder T zweihundert mit V C achtzig. "
         "[serious] Und Anfahren Z sechsunddreissig komma fünf: Das Werkzeug setzt am Bund an und dreht von dort nach hinten. "
         "Das Teil fährt nur noch aus der Büchse heraus, nie mehr zurück.",
         "<b>„+ Drehwerkzeug“</b>: <b>KONTUR HINTEN</b>, <b>T200</b>, <b>Vc 80</b>, <b>Anfahren Z 36.5</b>: das Teil fährt nur noch heraus.")
def s_dreh2(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-neu-dreh", ms=700)
    a.tippen(bl(4, "[data-camblock='bez']"), "KONTUR HINTEN")
    platz(pg, a, 4, "200")
    if pg.locator(bl(4, "[data-camblock='sArt']")).count():
        pg.select_option(bl(4, "[data-camblock='sArt']"), index=1)
        if pg.locator(bl(4, "[data-camblock='vc']")).count(): a.tippen(bl(4, "[data-camblock='vc']"), "80")
    a.tippen(bl(4, "[data-camblock='anZ']"), "36.5")

@schritt("In Hofer Contur holen wir die Kontur noch einmal aus dem Modell und löschen diesmal alles vor dem Bund. "
         "Als Startpunkt das Ende vom Bund: X zehn, Z sechsunddreissig komma fünfundsiebzig. Die Stirn hinten nehmen wir auch weg, "
         "die macht der Abstecher. Werkzeug und Schneidenlage bleiben gleich.",
         "<b>HOFERCONTUR</b>: Modell neu, alles <b>vor dem Bund</b> weg, Start <b>X10 Z36.75</b>, hintere <b>Stirn</b> weg (macht der Abstecher).")
def s_kt5(pg, a):
    a.reiter("kontur"); pg.wait_for_selector("#kt-code")
    a.hin("label:has(#kt-step)", klick=False, ms=400)
    kontur_aus_step(pg, a, zeigen=False)
    i, n = bund_index(pg)
    el = kontur_elemente(pg)
    if el and el[-1]["x"] < 4: element_weg(pg, a, n - 1, ms=400)
    for _ in range(i + 1): element_weg(pg, a, 0)
    a.tippen("[data-ktfeld='startX']", "10"); a.tippen("[data-ktfeld='startZ']", str(BUND_ENDE))
    if pg.locator("[data-ktspitze='u']").count(): a.hin("[data-ktspitze='u']", ms=300)
    a.hin("#kt-bild", klick=False, ms=1000)
    a.hin("#kt-code", klick=False, ms=900)

@schritt("Zurück im Hofer Cam: Aus Modul, Hofer Contur, Einfügen, und dasselbe Werkzeug, V fünfunddreissig Grad, Radius null komma zwei, Mitte unten.",
         "Zurück: <b>„+ Aus Modul“</b> → <b>HOFERCONTUR</b>, Werkzeug <b>V 35°</b>, R <b>0.2</b>, <b>Mitte unten</b>.")
def s_kt6(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    aus_modul(pg, a, 4, "kontur")
    werkzeug(pg, a, 4, "dreh", "V", [("r", "0.2")], lage="u")
    wz_zu(pg, a)

@schritt("Bleibt die Zentrierung hinten, an der Gegenspindel: plus Frontwerkzeug, Bezeichnung Zentrieren hinten, Platz T zwölfhundert, "
         "und bei Spindel Gegenspindel. [impressed] Jetzt verteilt das Programm die Arbeit auf beide Kanäle: Kanal eins ruft das Werkzeug, "
         "Kanal zwei fährt die Gegenspindel, und Wartemarken halten beide zusammen.",
         "<b>„+ Frontwerkzeug“</b> an der <b>Gegenspindel</b>: <b>T1200</b>. Beide Kanäle mit <b>Wartemarken</b> verbunden.")
def s_gegen(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-neu-front", ms=700)
    a.tippen(bl(5, "[data-camblock='bez']"), "ZENTRIEREN HINTEN")
    platz(pg, a, 5, "1200")
    if pg.locator(bl(5, "[data-camblock='spindel']")).count():
        pg.select_option(bl(5, "[data-camblock='spindel']"), "gegen"); a.hin(bl(5, "[data-camblock='spindel']"), klick=False, ms=700)
    a.tippen(bl(5, "[data-camblock='S']"), "4000")
    a.hin(bl(5, "[data-camblock='m1']"), klick=False, ms=500); a.hin(bl(5, "[data-camblock='m2']"), klick=False, ms=500)

@schritt("Auch hier die Vorlage Tieflochbohren und ein Bohrer eins komma acht. Die Marken Start und Ende kannst du leer lassen, "
         "dann nimmt das Programm freie Marken ab M dreihundert, immer in Zehnerschritten.",
         "Vorlage <b>G83</b>, <b>Bohrer Ø1.8</b>. Marken leer lassen: frei ab <b>M300</b> in Zehnerschritten.")
def s_gegen2(pg, a):
    a.hin(bl(5, "[data-camblock='code']"), ms=200)
    a.hin("[data-camvorlage-auf='5']", ms=600)
    a.hin("[data-camvorlage-bild='g83']", ms=700)
    for n, w in [("W", "4.5"), ("Q", "1"), ("F", "0.02")]: a.tippen(f"[data-camvorlage-feld='{n}']", w)
    a.hin("[data-camvorlage-einfuegen]", ms=600)
    werkzeug(pg, a, 5, "fraes", "bohrer", [("d", "1.8"), ("winkel", "118"), ("laenge", "8")])
    wz_zu(pg, a)

@schritt("In den Kanälen stehen gleiche Wartemarken immer auf derselben Zeile. [serious] Fehlt eine Gegenmarke, wird sie rot. "
         "Brauchst du zusätzlich zwei Marken, setzt plus Wartemarken sie an der Schreibmarke ein. Die Reihenfolge änderst du am Griff links, "
         "aber denk an die Büchse: von vorne nach hinten.",
         "Gleiche <b>Wartemarken</b> auf derselben Zeile, ohne Gegenstück <b>rot</b>. Reihenfolge am <b>Griff ⠿</b>, immer <b>von vorne nach hinten</b>.")
def s_marken(pg, a):
    if pg.locator(".cam-zeile--sync").count(): a.hin(".cam-zeile--sync >> nth=0", klick=False, ms=900)
    if pg.locator(".cam-zeile--sync").count() > 1: a.hin(".cam-zeile--sync >> nth=-1", klick=False, ms=900)
    pg.evaluate("scrollTo(0,0)")
    a.hin("[data-cammarken-auf='2']", klick=False, ms=900)
    if pg.locator(bl(1, ".ziehliste__griff, .cam-zieh__griff")).count(): a.hin(bl(1, ".ziehliste__griff, .cam-zieh__griff"), klick=False, ms=700)

# ===================== Teil 5: 3D-Simulation und Abschluss ===================
teil("3D-Simulation und Abschluss")

@schritt("[excited] Jetzt der beste Teil: drei D Simulation. Sie beginnt immer beim Rohteil. Links die Bearbeitungen der Reihe nach, rechts das Teil. "
         "Das Rohmaterial ist erdig gefärbt, alles Bearbeitete hell und metallisch.",
         "<b>„🧊 3D-Simulation“</b> beginnt beim <b>Rohteil</b>. Links die Bearbeitungen, rechts das Teil. Roh <b>erdig</b>, bearbeitet <b>hell</b>.")
def s_sim(pg, a):
    a.hin("[data-cam-sim]", ms=300)
    pg.wait_for_selector("#cam-sim", timeout=30000); pg.wait_for_timeout(1500)
    # Kontrolle für die Probeaufnahme: wie weit fährt jede Bearbeitung zurück
    print("  Bearbeitungen (Z von–bis im Teil):", pg.evaluate("""() => document.querySelector('#cam-sim-bild').__sim.schritte
      .filter((x) => x.kanal === 1 && x.punkte.length).map((x) => [x.platz, x.art, x.status || '',
        Math.min(...x.punkte.map((q) => q.z)).toFixed(2), Math.max(...x.punkte.map((q) => q.z)).toFixed(2)])"""))
    a.hin("#cam-sim-titel", klick=False, ms=700)

@schritt("Mit Einzeln hält die Simulation nach jeder Bearbeitung an. Abspielen: zuerst die Zentrierung, dann die Kontur vorne. "
         "Das Material fährt in Z aus der Führungsbüchse, das Werkzeug fährt nur in X.",
         "<b>„Einzeln“</b>: hält nach jeder Bearbeitung. Das <b>Material</b> fährt in Z aus der Büchse, das <b>Werkzeug</b> in X.")
def s_sim2(pg, a):
    if pg.locator("#cam-sim-einzeln").count(): a.hin("#cam-sim-einzeln", ms=400)
    a.hin("#cam-sim-start", ms=3500)
    a.hin("#cam-sim-start", ms=6000)

@schritt("Mit Maschine siehst du den ganzen Werkzeugträger mit allen Haltern und die Führungsbüchse. [impressed] Jetzt die Nuten: "
         "Die Büchse steht, das Teil fährt in Z und dreht in C unter das Werkzeug. Die gedrehte Kontur vorne kommt nie mehr in die Büchse.",
         "<b>„Maschine“</b>: Träger und <b>Büchse stehen</b>, das <b>Teil</b> fährt in Z und dreht in <b>C</b>.")
def s_sim3(pg, a):
    if pg.locator("#cam-sim-maschine").count() and not pg.is_checked("#cam-sim-maschine"): a.hin("#cam-sim-maschine", ms=900)
    a.hin("#cam-sim-start", ms=7000)

@schritt("Weiter: Der Kugelfräser entgratet die Kanten am Bund, und dann dreht T zweihundert die Kontur hinten fertig, "
         "vom Bund nach hinten, immer aus der Büchse heraus.",
         "<b>Entgraten</b> am Bund, dann die <b>Kontur hinten</b>, immer aus der Büchse heraus.")
def s_sim4(pg, a):
    a.hin("#cam-sim-start", ms=6000)
    a.hin("#cam-sim-start", ms=6500)
    if pg.locator("#cam-sim-schnitt").count(): a.hin("#cam-sim-schnitt", ms=1500); a.hin("#cam-sim-schnitt", ms=400)

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
    if n > 1: a.hin(f"[data-cam-sim-schritt] >> nth={n - 2}", ms=2500)
    if n: a.hin(f"[data-cam-sim-schritt] >> nth={n - 1}", ms=2500)

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
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
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
            print("Fehler bei Schritt", i, f.__name__, (str(e) or repr(e)).splitlines()[0])
            fehler.append(f.__name__)
            pg.keyboard.press("Escape")
        rest = dauern[i] - (time.time() - beginn)
        if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        else: print(f"  Schritt {i} {f.__name__}: Bild {round(-rest, 1)} s länger als Ton")
    pg.wait_for_timeout(1500)
    if os.environ.get("SPEICHERN"):
        # Nur für eine Kopie des Programms: HOCO Nr. setzen, speichern und
        # die Zeile aus dem Nachbau in eine Datei schreiben (SPEICHERN=<name>:<datei>)
        name, datei = os.environ["SPEICHERN"].split(":", 1)
        if pg.locator("#cam-sim").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pg.evaluate("scrollTo(0,0)")
        if pg.locator("[data-cam='hoco']").count(): pg.fill("[data-cam='hoco']", name); pg.wait_for_timeout(600)
        pg.click("#camab-speichern"); pg.wait_for_timeout(600)
        pg.locator(".dialog-huelle input").first.fill(name)
        pg.locator(".dialog-huelle button", has_text="Speichern").last.click(); pg.wait_for_timeout(1500)
        zeilen = pg.evaluate("() => (TEST.daten.nc_programme || []).filter((z) => z.art === 'cam')")
        with open(datei, "w") as f: json.dump(zeilen, f, ensure_ascii=False)
        print("Gespeichert:", [z.get("name") for z in zeilen])
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
