# Nimmt das ausführliche Erklärvideo für HOFERCAM auf der Star SW-20 auf
# (Wunsch Patrick 22. November 2026: „ein neues ausführliches Tutorial …
# ein geeignetes 3D-Modell mit vielen Bearbeitungen inkl. Rückseite …
# für ElevenLabs … nicht zu schnell erzählen … Aktionen passend zum Text …
# nichts von eingeblendeten Bildern verdeckt … im Vollbild … das Werkstück
# einblenden, wenn du davon sprichst“, „nimm die SW-20 dafür“).
#
# Das Beispielteil „Anschlussnippel“ ist von uns erfunden und liegt darum im
# Repository (werkzeuge/tutorial-teil/, gebaut mit teil.py). Läuft mit dem
# Prüfstand, also nur mit Beispieldaten.
#
#   python tutorial_sw20.py --text <datei>          Sprechertext für ElevenLabs v3
#   ZIEL=<mp4> python tutorial_sw20.py              stummes Probevideo
#   ZIEL=<mp4> TON=<ordner> python tutorial_sw20.py mit teil01.mp3, teil02.mp3 …
#
# Anders als tutorial_hofercam.py:
# - Die App läuft auf 1920 × 960, die Untertitel kommen in ein eigenes Band
#   darunter (Video 1920 × 1080), so verdecken sie nie etwas.
# - Jeder Schritt ist kurz (ein, zwei Sätze, eine Handlung), damit Bild und
#   Ton zusammen bleiben.
# - Spricht der Text vom Werkstück, liegt das 3D-Bild des Teils über dem
#   ganzen Bildschirm (tutorial_teil.html); dann wird nichts bedient.
import os, re, sys, time, shutil, subprocess, tempfile, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HIER)
TEILORDNER = os.path.join(REPO, "werkzeuge", "tutorial-teil")
STEP = os.path.join(TEILORDNER, "anschlussnippel.step")
ZIEL = os.environ.get("ZIEL") or os.path.join(tempfile.gettempdir(), "hofercam-sw20-tutorial.mp4")
TON = os.environ.get("TON", "")
B, H, BAND = 1920, 960, 120
# Ohne Ton: so viele Zeichen je Sekunde, wie ElevenLabs mit Tempo 0.9 etwa spricht
ZEICHEN_JE_S = 12.5

ZUSATZ = """
(() => {
  const los = () => {
    if (document.getElementById('tut-titel')) return;
    const st = document.createElement('style');
    st.textContent = `#tut-titel{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;flex-direction:column;
      background:radial-gradient(circle at 50% 45%,#0b4aa8 0,#003884 55%,#00265c 100%);color:#fff!important;font:700 64px/1.2 system-ui,sans-serif;
      pointer-events:none;transition:opacity .5s;opacity:0;text-align:center}
      #tut-titel small{display:block;font-size:28px;font-weight:500;margin-top:18px;color:#cfe2ff!important}
      #tut-titel img{height:70px;margin-bottom:40px}
      #tut-teil{position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483645;opacity:0;pointer-events:none;transition:opacity .5s;background:#003884}
      #tut-maus{position:fixed;width:26px;height:26px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;
      background:no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M3 2l14 10-6.5 1.2L14 20l-3 1.2-3.4-6.8L3 18z' fill='%23fff' stroke='%23000' stroke-width='1.4'/%3E%3C/svg%3E")}
      .tut-klick{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border:3px solid #ffb300;border-radius:50%;
      z-index:2147483646;pointer-events:none;animation:tutk .5s ease-out forwards}
      @keyframes tutk{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
    document.head.appendChild(st);
    const g = document.createElement('div'); g.id = 'tut-titel'; document.body.appendChild(g);
    const m = document.createElement('div'); m.id = 'tut-maus'; m.style.left = '-50px'; document.body.appendChild(m);
    addEventListener('mousemove', (e) => { m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { const k = document.createElement('div'); k.className = 'tut-klick';
      k.style.left = e.clientX + 'px'; k.style.top = e.clientY + 'px'; document.body.appendChild(k); setTimeout(() => k.remove(), 600); }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', los); else los();
})();
"""

# Dateien für das 3D-Bild des Teils (eigene Adresse, nur im Prüfstand)
TEIL_URL = "http://teil.local/tutorial-teil/"
TEIL_DATEIEN = {"index.html": os.path.join(HIER, "tutorial_teil.html"),
                "three.module.js": os.path.join(REPO, "node_modules/three/build/three.module.js"),
                "STLLoader.js": os.path.join(REPO, "node_modules/three/examples/jsm/loaders/STLLoader.js"),
                "RoomEnvironment.js": os.path.join(REPO, "node_modules/three/examples/jsm/environments/RoomEnvironment.js"),
                "anschlussnippel.stl": os.path.join(TEILORDNER, "anschlussnippel.stl"),
                "logo-weiss.svg": os.path.join(REPO, "public/logo-weiss.svg")}

# ---- Drehbuch ---------------------------------------------------------------
# Gesprochen so, wie es klingen soll (Zahlen ausgeschrieben, „S W zwanzig“),
# Audio-Tags von ElevenLabs v3 in eckigen Klammern. Die Zeile darunter ist der
# Untertitel im Band.
SCHRITTE, TEILE = [], []
def teil(name): TEILE.append(name)
def schritt(sprechen, zeile):
    def deko(f):
        SCHRITTE.append((len(TEILE), sprechen, zeile, f)); return f
    return deko

def bl(i, sel=""): return f"[data-block='{i}'] {sel}".strip()

def platz(pg, a, i, nr):
    a.hin(bl(i, "[data-camblock='platz'] .cam-wahl__knopf"), ms=700)
    if pg.locator(f"[data-platz='{nr}']").count(): a.hin(f"[data-platz='{nr}']", ms=700)

def werkzeug(pg, a, i, art, form, felder, lage=None):
    a.hin(f"[data-camwz-auf='{i}']", ms=700)
    if pg.locator(f"[data-camwz-art='{art}']").count(): a.hin(f"[data-camwz-art='{art}']", ms=400)
    a.hin(f"[data-camwz-form='{form}']", ms=700)
    for n, w in felder: a.tippen(f"[data-camwz='{n}']", w)
    if lage and pg.locator(f"[data-camwz-sl='{lage}']").count(): a.hin(f"[data-camwz-sl='{lage}']", ms=800)

def wz_zu(pg, a):
    if pg.locator("[data-camwz] .cam-vorlage__kopf button[title='Schliessen']").count():
        a.hin("[data-camwz] .cam-vorlage__kopf button[title='Schliessen']", ms=500)

def code_ende(pg, a, i):
    a.hin(bl(i, "[data-camblock='code']"), ms=200)
    pg.keyboard.press("Control+End"); pg.wait_for_timeout(150)

def vorlage_auf(pg, a, i, art):
    code_ende(pg, a, i)
    a.hin(f"[data-camvorlage-auf='{i}']", ms=900)
    a.hin(f"[data-camvorlage-bild='{art}']", ms=900)

def vorlage_felder(pg, a, art, werte):
    for n, w in werte:
        a.tippen(f"[data-camein='{n}']" if art == "einstich" else f"[data-camvorlage-feld='{n}']", w)

def vorlage_rein(pg, a):
    a.hin("[data-camvorlage-vorschau]", klick=False, ms=1200)
    a.hin("[data-camvorlage-einfuegen]", ms=900)

def aus_modul(pg, a, i, modul):
    code_ende(pg, a, i)
    a.hin(f"[data-cammodul-auf='{i}']", ms=800)
    a.hin("[data-cammodul-quelle='aktuell']", ms=600)
    a.hin(f"[data-cammodul-aktuell='{modul}']", ms=800)
    a.hin("[data-cammodul-vorschau]", klick=False, ms=1200)
    a.hin("[data-cammodul-einfuegen]", ms=900)

def neu(pg, a, knopf, i, bez):
    a.hin(knopf, ms=800)
    a.tippen(bl(i, "[data-camblock='bez']"), bez)

def zu_kanaelen(pg, a, ms=1200):
    a.hin("#cam-kanaele", klick=False, ms=ms)

# Bearbeitungen in der Reihenfolge, in der sie entstehen (Kanal 2 steht immer zuletzt)
K3_BOHREN, KONTUR, FREISTICH, GEWINDE, FLAECHE, QUER, FASE, HBOHR, LOCHKREIS = range(9)

# ===================== Teil 1: Das Werkstück ===================================
teil("Das Werkstück und die Maschine")

@schritt("[warmly] Hallo und herzlich willkommen zum grossen Hofer Cam Tutorial für die Star S W zwanzig! "
         "Heute programmieren wir zusammen ein ganzes Teil, Schritt für Schritt, mit allen drei Kanälen.",
         "<b>HOFERCAM</b> auf der <b>Star SW-20</b>: ein ganzes Teil, Schritt für Schritt, mit allen <b>drei Kanälen</b>.")
def s_hallo(pg, a):
    a.titel("HOFERCAM auf der Star SW-20", "Ein ganzes Teil mit drei Kanälen")

@schritt("Das ist unser Beispielteil: ein Anschlussnippel, sechzehn Millimeter Durchmesser und achtunddreissig Millimeter lang. "
         "[curious] Schau es dir in Ruhe an, wir bauen es gleich Stück für Stück zusammen.",
         "Unser Beispiel: ein <b>Anschlussnippel</b>, <b>Ø16 × 38</b> mm.")
def s_teil(pg, a):
    a.titel(""); a.teil("ganz")

@schritt("Wir starten mit einer Stange Durchmesser sechzehn aus eins komma vier drei null fünf, also rostfreiem V zwei A.",
         "Rohmaterial: Stange <b>Ø16</b>, <b>1.4305</b> (V2A).")
def s_roh(pg, a): a.teil("roh")

@schritt("Vorne bekommt das Teil eine tiefe Bohrung, eine Kontur mit Gewinde und Freistich, zwei Schlüsselflächen und eine Querbohrung. "
         "Das alles machen Kanal eins und Kanal drei an der Hauptspindel.",
         "<b>Vorne</b>: Bohrung, Kontur, Gewinde, Freistich, Schlüsselflächen, Querbohrung. <b>Kanal 1</b> und <b>Kanal 3</b>.")
def s_vorne(pg, a): a.teil("vorne")

@schritt("Hinten, auf der Rückseite, eine Fase, eine Bohrung und drei kleine Bohrungen auf einem Lochkreis. "
         "Das macht Kanal zwei, nachdem die Gegenspindel das Teil übernommen hat.",
         "<b>Hinten</b>: Fase, Bohrung, Lochkreis mit drei Bohrungen. <b>Kanal 2</b> in der Gegenspindel.")
def s_hinten(pg, a): a.teil("hinten")

@schritt("Kurz zur Maschine. Die S W zwanzig hat drei Kanäle. [serious] Kanal eins ist der Werkzeugträger vorne an der Hauptspindel. "
         "Kanal drei ist ein zweiter Werkzeugträger, der ebenfalls an der Hauptspindel arbeitet. "
         "Und Kanal zwei arbeitet in der Gegenspindel an der Rückseite.",
         "<b>Kanal 1</b>: Träger an der Hauptspindel. <b>Kanal 3</b>: zweiter Träger, auch an der Hauptspindel. <b>Kanal 2</b>: Gegenspindel, Rückseite.")
def s_kanaele(pg, a):
    a.teil(None); a.titel("Drei Kanäle", "Kanal 1 und Kanal 3 an der Hauptspindel · Kanal 2 an der Gegenspindel")

@schritt("Und die wichtigste Regel beim Langdrehen: Das Material wird in der Führungsbüchse am Rohdurchmesser geführt. "
         "Was aussen schon bearbeitet ist, darf nie mehr zurück in die Büchse. Darum arbeiten wir von vorne nach hinten.",
         "Regel: Bearbeitetes <b>nie zurück in die Führungsbüchse</b>. Darum <b>von vorne nach hinten</b>.")
def s_regel(pg, a):
    a.titel("Von vorne nach hinten", "Was bearbeitet ist, geht nie mehr zurück in die Führungsbüchse")

# ===================== Teil 2: Kopfdaten ======================================
teil("Maschinentyp und Kopfdaten")

@schritt("Los geht's. Wir sind in N C Pro im Reiter Hofer Cam. Ganz oben wählen wir den Maschinentyp: Star S W zwanzig.",
         "<b>NC-PRO</b> → <b>HOFERCAM</b>. Oben <b>Maschinentyp</b>: <b>Star SW-20</b>.")
def s_typ(pg, a):
    a.titel("")
    pg.wait_for_timeout(500)
    a.hin("#cam-typwahl", klick=False, ms=900)
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(900)

@schritt("Schau nach unten: Jetzt stehen drei Kanäle nebeneinander. Links Kanal eins, in der Mitte Kanal drei und rechts Kanal zwei. "
         "Kopf und Ende jedes Kanals schreibt Hofer Cam selbst.",
         "Unten jetzt <b>drei Kanäle</b>: <b>1</b>, <b>3</b>, <b>2</b>. Kopf und Ende schreibt HOFERCAM selbst.")
def s_drei(pg, a):
    n = pg.locator(".cam-spalte").count()
    for k in range(n): a.hin(f".cam-spalte >> nth={k}", klick=False, ms=1300)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(300)

@schritt("Zuerst die Programmnummer zweihundertvierunddreissig. Kanal zwei und drei bekommen ihre Nummern automatisch. "
         "Dann die HOCO Nummer, das Datum und dein Kürzel.",
         "<b>Programm-Nr.</b> 234, Kanal 2 und 3 automatisch. <b>HOCO Nr.</b>, <b>Datum</b>, <b>Kürzel</b>.")
def s_nr(pg, a):
    a.tippen("[data-cam='nr']", "234"); a.tippen("[data-cam='hoco']", "10000-0001")
    a.tippen("[data-cam='datum']", "22.11.26"); a.tippen("[data-cam='kuerzel']", "PR")

@schritt("Dann das Material: Durchmesser sechzehn, Teilelänge achtunddreissig, und die Abstechdrehzahl dreitausend.",
         "Material-Ø <b>16</b>, Teilelänge <b>38</b>, Abstechdrehzahl <b>3'000</b>.")
def s_mat(pg, a):
    for n, w in [("A", "16"), ("W", "38"), ("S", "3000")]: a.tippen(f"[data-cam='{n}']", w)

@schritt("Abstechende minus null komma fünf, Z Start sechzig, Vorschub beim Abstechen null komma null drei und die Breite vom Abstechstahl zwei. "
         "Die Einheit steht immer gleich daneben.",
         "Abstechende <b>-0.5</b>, Z Start <b>60</b>, F <b>0.03</b>, Stahlbreite <b>2</b>. Die <b>Einheit</b> steht daneben.")
def s_ab(pg, a):
    for n, w in [("X", "-0.5"), ("Z", "60"), ("F", "0.03"), ("B", "2")]: a.tippen(f"[data-cam='{n}']", w)

@schritt("Die Plandrehzugabe vorne null komma eins, ohne Minus, das setzt Hofer Cam selbst. Und die Schlichtzugabe für die Gegenspindel null komma zwei.",
         "Plandrehzugabe Hauptspindel <b>0.1</b> (ohne Minus), Schlichtzugabe Gegenspindel <b>0.2</b>.")
def s_zugabe(pg, a):
    a.tippen("[data-cam='schlicht']", "0.1"); a.tippen("[data-cam='plan']", "0.2")

@schritt("Für die Übergabe: Die Gegenspindel fährt im Eilgang zehn Millimeter vor das Teil und dann im Vorschub sechs Millimeter darüber.",
         "Übergabe: <b>10</b> mm vor das Teil, dann <b>6</b> mm darüber.")
def s_abgreifen(pg, a):
    a.tippen("[data-cam='annaehern']", "10"); a.tippen("[data-cam='ueber']", "6")

@schritt("Unter Bestückung stellst du ein, ob auf einem Platz ein Frontbohrapparat oder der Schlitzapparat sitzt. "
         "Heute brauchen wir das nicht, unsere Plätze sind alle querangetrieben.",
         "<b>Bestückung</b>: Frontbohrapparat oder Schlitzapparat je Platz. Heute alle <b>querangetrieben</b>.")
def s_best(pg, a):
    a.hin("#cam-sw-bestueckung", klick=False, ms=1500)
    if pg.locator("[data-cam-swkanal]").count(): a.hin("[data-cam-swkanal] >> nth=0", klick=False, ms=1800)

@schritt("Mit dem Pfeil bei Kopfdaten klappst du alles ein. Dann bleibt nur eine Zeile mit den Werten, und wir haben Platz für die Bearbeitungen.",
         "<b>„▾ Kopfdaten“</b> klappt ein, eine Zeile mit den Werten bleibt.")
def s_kopfzu(pg, a):
    a.hin("#cam-kopf-zu", ms=1200)
    a.hin("#cam-kopf-werte", klick=False, ms=900)

# ===================== Teil 3: Kanal 3, Bohren vorne ===========================
teil("Kanal 3: Bohren vorne")

@schritt("Als Erstes die tiefe Bohrung vorne: Durchmesser sechs, fünfundzwanzig Millimeter tief. Die machen wir mit Kanal drei, "
         "solange vorne noch alles roh ist.",
         "Zuerst die <b>Bohrung Ø6</b>, <b>25</b> tief, mit <b>Kanal 3</b>.")
def s_b_teil(pg, a): a.teil("bohrung")

@schritt("In der Zeile Bearbeitungen Kanal drei: plus Feste Werkzeuge T sechzehnhundert bis neunzehnhundert. "
         "Ganz vorne die Bezeichnung: Bohren sechs vorne. Der Platz T sechzehnhundert ist schon gewählt.",
         "<b>„+ Feste Werkzeuge T1600–T1900“</b>: <b>BOHREN 6 VORNE</b>, Platz <b>T1600</b>.")
def s_b_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-k3d", K3_BOHREN, "BOHREN 6 VORNE")
    a.hin(bl(K3_BOHREN, "[data-camblock='platz'] .cam-wahl__knopf"), klick=False, ms=1200)

@schritt("Fährst du mit der Maus über den Platz, zeigt das Maschinenbild oben rechts, wo das Werkzeug an der Maschine sitzt.",
         "Maus über den <b>Platz</b>: das <b>Maschinenbild</b> zeigt, wo das Werkzeug sitzt.")
def s_b_bild(pg, a):
    a.hin(bl(K3_BOHREN, "[data-camblock='platz']"), klick=False, ms=2500)
    a.hin("#cam-bild", klick=False, ms=500)

@schritt("[serious] Jetzt etwas Besonderes: Kanal drei arbeitet an der gleichen Spindel wie Kanal eins. Damit sie sich nicht in die Quere kommen, "
         "schreiben wir zuerst die Wartemarken M hunderteinunddreissig und M hundertdreiunddreissig in den Code. "
         "Hofer Cam setzt sie selbst auch in Kanal eins.",
         "Wartemarken <b>M131</b> und <b>M133</b>: Kanal 1 und 3 warten aufeinander. HOFERCAM setzt sie auch in Kanal 1.")
def s_b_marken(pg, a):
    a.hin(bl(K3_BOHREN, "[data-camblock='code']"), ms=200)
    pg.keyboard.type("M131", delay=90); pg.keyboard.press("Enter"); pg.keyboard.type("M133", delay=90)
    pg.wait_for_timeout(600)
    zu_kanaelen(pg, a, ms=1500)

@schritt("Den Bohrzyklus holen wir aus den Vorlagen: plus Vorlage. Jede Vorlage hat ein Bild, das zeigt, was sie macht. "
         "Wir nehmen Tieflochbohren G dreiundachtzig.",
         "<b>„+ Vorlage“</b>: Auswahl mit Bildern. <b>Tieflochbohren G83</b>.")
def s_b_vorlage(pg, a):
    pg.evaluate("scrollTo(0,0)")
    vorlage_auf(pg, a, K3_BOHREN, "g83")

@schritt("Tiefe fünfundzwanzig komma fünf, weil das Werkzeug einen halben Millimeter vor dem Teil steht. "
         "Zustellung zwei, Vorschub null komma null acht. Die Vorschau zeigt den Zyklus, Einfügen setzt ihn ein.",
         "Tiefe W <b>25.5</b> (0.5 Luft), Zustellung Q <b>2</b>, F <b>0.08</b>. <b>Vorschau</b>, dann <b>Einfügen</b>.")
def s_b_felder(pg, a):
    vorlage_felder(pg, a, "g83", [("W", "25.5"), ("Q", "2"), ("F", "0.08")])
    vorlage_rein(pg, a)

@schritt("Mit dem Knopf Werkzeug legst du fest, wie das Werkzeug aussieht. Das braucht die Simulation. "
         "Ein Bohrer, Durchmesser sechs, Spitzenwinkel hundertvierzig Grad, vierzig lang.",
         "<b>„🔧 Werkzeug“</b>: <b>Bohrer Ø6</b>, 140°, Länge 40. Das braucht die <b>Simulation</b>.")
def s_b_wz(pg, a):
    werkzeug(pg, a, K3_BOHREN, "fraes", "bohrer", [("d", "6"), ("winkel", "140"), ("laenge", "40")])
    a.hin("[data-camwz]", klick=False, ms=1000)
    wz_zu(pg, a)

# ===================== Teil 4: Kontur aus dem 3D-Modell ========================
teil("Die Kontur aus dem 3D-Modell")

@schritt("Jetzt die Aussenkontur vorne: die Fase, der Durchmesser zwölf fürs Gewinde, die Stufe auf vierzehn und die Fase am Bund.",
         "Die <b>Aussenkontur</b>: Fase, Ø12 fürs Gewinde, Stufe auf Ø14, Fase am Bund.")
def s_k_teil(pg, a): a.teil("kontur")

@schritt("Plus Drehwerkzeug, Bezeichnung Kontur, Platz T zweihundert. Anfahren Z null, dann beginnt der Schnitt gleich an der Stirn.",
         "<b>„+ Drehwerkzeug T100–T400“</b>: <b>KONTUR</b>, <b>T200</b>, Anfahren Z <b>0</b>.")
def s_k_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-dreh", KONTUR, "KONTUR")
    platz(pg, a, KONTUR, "200")
    a.tippen(bl(KONTUR, "[data-camblock='anZ']"), "0")

@schritt("[curious] Und woher kommt die Kontur? Wir springen in den Reiter Hofer Contur und laden mit drei D Modell die STEP Datei vom Teil.",
         "Sprung nach <b>HOFERCONTUR</b> → <b>„3D-Modell“</b>: die <b>STEP-Datei</b> laden.")
def s_k_step(pg, a):
    a.reiter("kontur"); pg.wait_for_selector("#kt-code")
    a.hin("label:has(#kt-step)", klick=False, ms=600)
    pg.set_input_files("#kt-step", STEP)
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(1200)

@schritt("Links das Modell als Drahtgitter, ziehen dreht es. Die strichpunktierte Linie ist die Drehachse, die das Programm selbst gefunden hat. "
         "Rechts die Seitenkontur. Wir nehmen die Aussenkontur und übernehmen sie.",
         "Links das <b>Modell</b>, die <b>Drehachse</b> findet das Programm. Rechts die Kontur. <b>Aussenkontur</b>, <b>übernehmen</b>.")
def s_k_modell(pg, a):
    m3 = pg.locator("#kt-modell-3d").bounding_box()
    if m3:
        pg.mouse.move(m3["x"] + m3["width"] * 0.35, m3["y"] + m3["height"] * 0.5, steps=15)
        pg.mouse.down(); pg.mouse.move(m3["x"] + m3["width"] * 0.62, m3["y"] + m3["height"] * 0.4, steps=50); pg.mouse.up()
        pg.wait_for_timeout(600)
    a.hin("#kt-modell-achse", klick=False, ms=1000)
    a.hin(".kt-modell__bild", klick=False, ms=900)
    a.hin("[data-ktmodell='aussen']", ms=600)
    a.hin("#kt-modell-ok", ms=1000)

@schritt("Jetzt steht die ganze Kontur in der Liste, Element für Element. Hinten bleibt der Durchmesser sechzehn roh, und die Fase hinten macht Kanal zwei. "
         "Darum löschen wir die letzten drei Elemente mit dem Kreuz.",
         "Die Kontur in der <b>Liste</b>. Ø16 bleibt roh, die Fase hinten macht Kanal 2: die letzten drei weg mit <b>✕</b>.")
def s_k_hinten(pg, a):
    a.hin(".kt-liste", klick=False, ms=800)
    n = pg.locator(".kt-liste [data-ktel]").count()
    for k in range(n - 1, n - 4, -1): a.hin(f"[data-ktweg='{k}']", ms=600)
    a.hin("#kt-bild", klick=False, ms=900)

@schritt("Den Freistich stechen wir nachher mit einer Einstechplatte. Darum fahren wir hier den Durchmesser zwölf einfach bis Z dreizehn durch "
         "und löschen die zwei Elemente vom Freistich.",
         "Den <b>Freistich</b> macht nachher T300. Ø12 bis <b>Z13</b> durchfahren, die zwei Freistich-Elemente weg.")
def s_k_frei(pg, a):
    a.tippen("[data-ktel='2'] [data-ktfeld='z']", "13")
    a.hin("[data-ktweg='4']", ms=700); a.hin("[data-ktweg='3']", ms=700)
    a.hin("#kt-bild", klick=False, ms=1000)

@schritt("Beim Werkzeug der Schneidenradius null komma zwei, Vorschub null komma null acht und die Schneidenlage unten. "
         "Das N C Programm rechnet den Radius selbst ein, ohne G einundvierzig oder zweiundvierzig.",
         "Radius <b>0.2</b>, F <b>0.08</b>, Schneidenlage <b>unten</b>. Der Radius ist im Code schon eingerechnet.")
def s_k_wz(pg, a):
    a.hin(".kt-werkzeug", klick=False, ms=500)
    a.tippen("[data-ktfeld='rn']", "0.2"); a.tippen("[data-ktfeld='f']", "0.08")
    a.hin("[data-ktspitze='u']", ms=900)
    a.hin("#kt-code", klick=False, ms=1500)

@schritt("Zurück im Hofer Cam: plus Aus Modul, Aktueller Code aus dem Reiter, Hofer Contur. Die Vorschau zeigt, was kommt, Einfügen. "
         "[impressed] Und schon steht die Kontur in der Bearbeitung.",
         "Zurück in <b>HOFERCAM</b>: <b>„+ Aus Modul“</b> → <b>„Aktueller Code“</b> → <b>HOFERCONTUR</b> → <b>Einfügen</b>.")
def s_k_modul(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    aus_modul(pg, a, KONTUR, "kontur")

@schritt("Und das Werkzeug für die Simulation: eine V Platte fünfunddreissig Grad, Radius null komma zwei, Schneidenlage unten, wie in Hofer Contur.",
         "Werkzeug: <b>V-Platte 35°</b>, R <b>0.2</b>, Lage <b>unten</b>.")
def s_k_wz2(pg, a):
    werkzeug(pg, a, KONTUR, "dreh", "V", [("r", "0.2")], lage="u")
    a.hin("[data-camwz]", klick=False, ms=900)
    wz_zu(pg, a)

# ===================== Teil 5: Freistich und Gewinde ===========================
teil("Freistich und Gewinde")

@schritt("Nach der Kontur der Freistich: hinter dem Gewinde, zwei Millimeter breit, auf Durchmesser zehn komma vier.",
         "Der <b>Freistich</b>: 2 mm breit, auf <b>Ø10.4</b>.")
def s_f_teil(pg, a): a.teil("freistich")

@schritt("Plus Drehwerkzeug, Bezeichnung Freistich, Platz T dreihundert. Dann plus Vorlage, und diesmal die Vorlage Einstich.",
         "<b>„+ Drehwerkzeug“</b>: <b>FREISTICH</b>, <b>T300</b>. <b>„+ Vorlage“</b> → <b>Einstich</b>.")
def s_f_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-dreh", FREISTICH, "FREISTICH")
    platz(pg, a, FREISTICH, "300")
    vorlage_auf(pg, a, FREISTICH, "einstich")

@schritt("Hier tippst du alles direkt in die Skizze: Durchmesser zwölf, die Lage Z elf, Breite zwei und Tiefe null komma acht.",
         "Alles in der <b>Skizze</b>: D <b>12</b>, Z <b>11</b>, Breite <b>2</b>, Tiefe <b>0.8</b>.")
def s_f_felder(pg, a):
    vorlage_felder(pg, a, "einstich", [("D", "12"), ("Z", "11"), ("B", "2"), ("T", "0.8")])

@schritt("Dazu die Platte: Breite eins komma fünf, Länge drei und Eckradius null komma eins. Hofer Cam rechnet alle Wege aus und schreibt sie ohne Zyklus.",
         "Platte: Breite <b>1.5</b>, Länge <b>3</b>, Eck-R <b>0.1</b>. Alle Wege ausgeschrieben.")
def s_f_platte(pg, a):
    vorlage_felder(pg, a, "einstich", [("PB", "1.5"), ("PL", "3"), ("PR", "0.1")])
    vorlage_rein(pg, a)

@schritt("Das Werkzeug: eine Einstechplatte, eins komma fünf breit, Radius null komma eins.",
         "Werkzeug: <b>Einstechplatte</b> 1.5 breit, R 0.1.")
def s_f_wz(pg, a):
    werkzeug(pg, a, FREISTICH, "dreh", "E", [("breite", "1.5"), ("r", "0.1")], lage="u")
    wz_zu(pg, a)

@schritt("Jetzt das Gewinde: M zwölf mal eins, bis zum Freistich.",
         "Das <b>Gewinde M12 × 1</b>.")
def s_g_teil(pg, a): a.teil("gewinde")

@schritt("Plus Drehwerkzeug, Gewinde M zwölf mal eins, Platz T vierhundert. Anfahren Z minus zwei, damit die Platte Anlauf hat.",
         "<b>„+ Drehwerkzeug“</b>: <b>GEWINDE M12X1</b>, <b>T400</b>, Anfahren Z <b>-2</b> für den Anlauf.")
def s_g_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-dreh", GEWINDE, "GEWINDE M12X1")
    platz(pg, a, GEWINDE, "400")
    a.tippen(bl(GEWINDE, "[data-camblock='anZ']"), "-2")

@schritt("Vorlage Gewindestrählen G sechsundsiebzig: Durchmesser zwölf, Steigung eins und Länge bis Z elf. "
         "Kerndurchmesser und Gewindetiefe schlägt die Vorlage selbst vor.",
         "<b>Gewindestrählen G76</b>: D <b>12</b>, Steigung <b>1</b>, bis Z <b>11</b>. Kern-Ø und Tiefe schlägt sie vor.")
def s_g_vorlage(pg, a):
    vorlage_auf(pg, a, GEWINDE, "g76")
    vorlage_felder(pg, a, "g76", [("D", "12"), ("F", "1"), ("Z", "11")])
    vorlage_rein(pg, a)

@schritt("Und als Werkzeug die Gewindeplatte, Schneidenlage unten.",
         "Werkzeug: <b>Gewindeplatte</b>, Lage unten.")
def s_g_wz(pg, a):
    werkzeug(pg, a, GEWINDE, "dreh", "G", [], lage="u")
    wz_zu(pg, a)

# ===================== Teil 6: Schlüsselflächen und Querbohrung ================
teil("Schlüsselflächen und Querbohrung")

@schritt("Auf dem Bund kommen zwei Schlüsselflächen, Schlüsselweite dreizehn. Die fräsen wir zuerst, damit die Querbohrung nachher auf eine ebene Fläche trifft.",
         "Zwei <b>Schlüsselflächen SW13</b>, zuerst, damit die Querbohrung auf eine <b>ebene Fläche</b> trifft.")
def s_fl_teil(pg, a): a.teil("flaeche")

@schritt("Den Code dafür macht das Modul Bohren und Fräsen. Wir springen hinein und wählen Fläche quer.",
         "Sprung nach <b>Bohren / Fräsen</b> → <b>Fläche quer</b>.")
def s_fl_bf(pg, a):
    a.teil(None)
    a.reiter("bohren"); pg.wait_for_selector("#bf-code")
    a.hin("[data-bfart='flaeche']", ms=1000)

@schritt("Teildurchmesser sechzehn, Schlüsselweite dreizehn, zwei Flächen ab C null. Von Z achtundzwanzig bis sechsunddreissig.",
         "Teil-Ø <b>16</b>, SW <b>13</b>, <b>2</b> Flächen ab C0, von Z <b>28</b> bis <b>36</b>.")
def s_fl_f1(pg, a):
    for k, v in [("teilD", "16"), ("sw", "13"), ("flaechen", "2"), ("startC", "0"), ("flVon", "28"), ("flBis", "36")]:
        a.tippen(f"[data-bf='{k}']", v)

@schritt("Fräser Durchmesser sechs, Zustellung eins komma fünf, Vorschub vierzig, Drehzahl sechstausend, und gefräst wird mit der Y Achse.",
         "Fräser <b>Ø6</b>, Zustellung <b>1.5</b>, F <b>40</b>, S <b>6'000</b>, mit <b>Y-Achse</b>.")
def s_fl_f2(pg, a):
    for k, v in [("fraeser", "6"), ("zustellung", "1.5"), ("vorschubZ", "40"), ("drehzahl", "6000")]:
        a.tippen(f"[data-bf='{k}']", v)
    a.hin("select[data-bf='yAchse']", klick=False, ms=400)
    pg.select_option("select[data-bf='yAchse']", "ja"); pg.wait_for_timeout(600)
    a.hin("#bf-code", klick=False, ms=1500)

@schritt("Zurück im Hofer Cam: plus Querangetrieben, Bezeichnung Schlüsselfläche, Platz T sechshundert.",
         "<b>„+ Querangetrieben T500–T700“</b>: <b>SCHLUESSELFLAECHE</b>, <b>T600</b>.")
def s_fl_neu(pg, a):
    a.reiter("cam"); pg.wait_for_selector("#cam-kanaele")
    neu(pg, a, "#cam-neu-seite", FLAECHE, "SCHLUESSELFLAECHE")
    platz(pg, a, FLAECHE, "600")

@schritt("Plus Aus Modul, Aktueller Code, Bohren und Fräsen, Einfügen. Dazu das Werkzeug: ein Schaftfräser Durchmesser sechs.",
         "<b>„+ Aus Modul“</b> → <b>Bohren / Fräsen</b>. Werkzeug: <b>Schaftfräser Ø6</b>.")
def s_fl_modul(pg, a):
    aus_modul(pg, a, FLAECHE, "bohren")
    werkzeug(pg, a, FLAECHE, "fraes", "schaft", [("d", "6"), ("laenge", "12")])
    wz_zu(pg, a)

@schritt("Jetzt die Querbohrung Durchmesser vier, genau durch die Mitte der Schlüsselflächen.",
         "Die <b>Querbohrung Ø4</b> durch die Schlüsselflächen.")
def s_q_teil(pg, a): a.teil("quer")

@schritt("Wieder plus Querangetrieben, Bezeichnung Querbohren vier, Platz T fünfhundert und Anfahren Z einunddreissig komma fünf.",
         "<b>„+ Querangetrieben“</b>: <b>QUERBOHREN 4</b>, <b>T500</b>, Anfahren Z <b>31.5</b>.")
def s_q_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-seite", QUER, "QUERBOHREN 4")
    platz(pg, a, QUER, "500")
    a.tippen(bl(QUER, "[data-camblock='anZ']"), "31.5")

@schritt("Vorlage Querbohren G siebenundachtzig: eine Bohrung bei C null, auf Z einunddreissig komma fünf, "
         "von X achtzehn bis X minus vierzehn ganz durch, Zustellung eins, Vorschub null komma null drei.",
         "<b>Querbohren G87</b>: <b>1</b> Bohrung, C <b>0</b>, Z <b>31.5</b>, X <b>18</b> bis <b>-14</b>, Q <b>1</b>, F <b>0.03</b>.")
def s_q_vorlage(pg, a):
    vorlage_auf(pg, a, QUER, "g87")
    vorlage_felder(pg, a, "g87", [("N", "1"), ("C", "0"), ("ZL", "31.5"), ("XA", "18"), ("X", "-14"), ("Q", "1"), ("F", "0.03")])
    vorlage_rein(pg, a)

@schritt("Werkzeug: Bohrer Durchmesser vier.", "Werkzeug: <b>Bohrer Ø4</b>.")
def s_q_wz(pg, a):
    werkzeug(pg, a, QUER, "fraes", "bohrer", [("d", "4"), ("winkel", "140"), ("laenge", "20")])
    wz_zu(pg, a)

# ===================== Teil 7: Rückseite Kanal 2 ===============================
teil("Rückseite mit Kanal 2")

@schritt("Vorne ist alles fertig. [warmly] Jetzt kommt die Rückseite. Nach dem Abstechen hält die Gegenspindel das Teil, und Kanal zwei bearbeitet hinten.",
         "Jetzt die <b>Rückseite</b>: die Gegenspindel hält das Teil, <b>Kanal 2</b> bearbeitet.")
def s_r_teil(pg, a): a.teil("hinten")

@schritt("Zuerst die Fase hinten, null komma fünf mal fünfundvierzig Grad.", "Die <b>Fase hinten</b> 0.5 × 45°.")
def s_r_fase(pg, a): a.teil("fase")

@schritt("In der Zeile Bearbeitungen Kanal zwei: plus Drehen T einundzwanzighundert, Bezeichnung Fase hinten. "
         "Die zwei Zeilen tippen wir direkt ins Feld, in Kanal zwei mit Schrägstrich davor.",
         "<b>„+ Drehen T2100–T2400“</b>: <b>FASE HINTEN</b>. Zwei Zeilen von Hand, mit <b>/</b> davor.")
def s_r_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-k2", FASE, "FASE HINTEN")
    a.hin(bl(FASE, "[data-camblock='code']"), ms=200)
    pg.keyboard.type("/G1X14.Z-0.5F0.05", delay=80); pg.keyboard.press("Enter"); pg.keyboard.type("/G1X16.Z0.5", delay=80)
    pg.wait_for_timeout(500)

@schritt("Werkzeug: eine D Platte mit Radius null komma zwei.", "Werkzeug: <b>D-Platte</b>, R <b>0.2</b>.")
def s_r_wz(pg, a):
    werkzeug(pg, a, FASE, "dreh", "D", [("r", "0.2")])
    wz_zu(pg, a)

@schritt("Dann die Bohrung hinten: Durchmesser fünf, vierzehn Millimeter tief.", "Die <b>Bohrung hinten Ø5</b>, 14 tief.")
def s_h_teil(pg, a): a.teil("hbohrung")

@schritt("Plus Bohren stehend T siebenundzwanzighundert, Bezeichnung Bohren fünf hinten, und wieder die Vorlage Tieflochbohren: "
         "Tiefe vierzehn komma fünf, Zustellung zwei, Vorschub null komma null sechs.",
         "<b>„+ Bohren stehend T2700/T2800“</b>: <b>BOHREN 5 HINTEN</b>, <b>G83</b> W <b>14.5</b>, Q <b>2</b>, F <b>0.06</b>.")
def s_h_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-k2b", HBOHR, "BOHREN 5 HINTEN")
    vorlage_auf(pg, a, HBOHR, "g83")
    vorlage_felder(pg, a, "g83", [("W", "14.5"), ("Q", "2"), ("F", "0.06")])
    vorlage_rein(pg, a)

@schritt("Werkzeug: Bohrer Durchmesser fünf.", "Werkzeug: <b>Bohrer Ø5</b>.")
def s_h_wz(pg, a):
    werkzeug(pg, a, HBOHR, "fraes", "bohrer", [("d", "5"), ("winkel", "140"), ("laenge", "25")])
    wz_zu(pg, a)

@schritt("Und zum Schluss drei kleine Bohrungen Durchmesser zwei komma fünf auf einem Lochkreis Durchmesser zehn.",
         "Drei Bohrungen <b>Ø2.5</b> auf dem <b>Lochkreis Ø10</b>.")
def s_l_teil(pg, a): a.teil("lochkreis")

@schritt("Plus Angetrieben, Bezeichnung Lochkreis, Platz T sechsundzwanzighundert. "
         "[curious] Die Vorlage Tieflochbohren weiss schon, dass das Werkzeug angetrieben ist, und fragt nach dem Lochkreis.",
         "<b>„+ Angetrieben T2500/T2600“</b>: <b>LOCHKREIS 3X2.5</b>, <b>T2600</b>. Die Vorlage erkennt <b>angetrieben</b>.")
def s_l_neu(pg, a):
    a.teil(None)
    neu(pg, a, "#cam-neu-k2a", LOCHKREIS, "LOCHKREIS 3X2.5")
    platz(pg, a, LOCHKREIS, "2600")
    vorlage_auf(pg, a, LOCHKREIS, "g83")

@schritt("Lochkreis zehn, drei Bohrungen ab C neunzig Grad, Tiefe vier komma fünf, Zustellung eins, Vorschub null komma null vier. "
         "Die Vorschau zeigt jede Lage mit der C Achse.",
         "Lochkreis <b>10</b>, <b>3</b> Bohrungen ab C <b>90</b>, W <b>4.5</b>, Q <b>1</b>, F <b>0.04</b>. Jede Lage mit der <b>C-Achse</b>.")
def s_l_felder(pg, a):
    vorlage_felder(pg, a, "g83", [("D", "10"), ("N", "3"), ("C", "90"), ("W", "4.5"), ("Q", "1"), ("F", "0.04")])
    vorlage_rein(pg, a)

@schritt("Werkzeug: Bohrer Durchmesser zwei komma fünf mit hundertachtzehn Grad.", "Werkzeug: <b>Bohrer Ø2.5</b>, 118°.")
def s_l_wz(pg, a):
    werkzeug(pg, a, LOCHKREIS, "fraes", "bohrer", [("d", "2.5"), ("winkel", "118"), ("laenge", "10")])
    wz_zu(pg, a)

@schritt("Mit Alle Bearbeitungen einklappen siehst du die ganze Liste auf einen Blick. Vorne an jeder steht der Kanal: "
         "K eins blau, K drei violett, K zwei türkis. Kanal zwei steht immer am Schluss.",
         "<b>„▸ Alle einklappen“</b>: die ganze Liste. Schild je Kanal: <b>K1</b> blau, <b>K3</b> violett, <b>K2</b> türkis.")
def s_liste(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("#cam-alle-zu", ms=1200)
    a.hin("#cam-bearb", klick=False, ms=1200)
    a.hin(".cam-block__kanal >> nth=0", klick=False, ms=900)

# ===================== Teil 8: Das Programmfenster ===========================
teil("Das Programmfenster")

@schritt("Unten steht das fertige Programm, alle drei Kanäle nebeneinander. Die Marken, auf die die Kanäle aufeinander warten, stehen auf der gleichen Zeile.",
         "Das fertige <b>Programm</b>: drei Kanäle. <b>Wartemarken</b> stehen auf der gleichen Zeile.")
def s_p_kanaele(pg, a):
    zu_kanaelen(pg, a, ms=1500)
    n = pg.locator(".cam-spalte").count()
    for k in range(n): a.hin(f".cam-spalte >> nth={k}", klick=False, ms=1200)

@schritt("Tippst du eine Bearbeitung an, ist sie orange umrandet, und ihre Zeilen im Programm sind orange hervorgehoben. Das Fenster springt gleich dorthin.",
         "Bearbeitung antippen: ihre Zeilen sind im Programm <b>orange</b>.")
def s_p_orange(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin(bl(KONTUR, ".cam-block__kopf, [data-camblock='bez']"), ms=1500)
    zu_kanaelen(pg, a, ms=1500)
    pg.evaluate("scrollTo(0,0)")
    a.hin(bl(HBOHR, ".cam-block__kopf, [data-camblock='bez']"), ms=1500)
    zu_kanaelen(pg, a, ms=1200)

@schritt("Der Strich an der Zeilennummer zeigt, woher jede Zeile kommt: grün ist dein N C Code, blau Kopf und Ende der Bearbeitung aus der Vorlage.",
         "Strich an der Zeilennummer: <b>grün</b> dein Code, <b>blau</b> Kopf und Ende der Bearbeitung.")
def s_p_herkunft(pg, a):
    a.hin("#cam-herkunft", klick=False, ms=2000)
    zu_kanaelen(pg, a, ms=1000)

@schritt("Und jede Zeile im Programm kannst du auch direkt ändern. Was im Code einer Bearbeitung liegt, geht gleich zurück in die Bearbeitung.",
         "Jede Zeile ist <b>direkt änderbar</b>, Code geht zurück in die Bearbeitung.")
def s_p_hand(pg, a):
    a.hin(".cam-spalte >> nth=0", klick=False, ms=1500)

# ===================== Teil 9: 3D-Simulation ==================================
teil("Die 3D-Simulation")

@schritt("[excited] Jetzt das Beste: die drei D Simulation. Sie beginnt immer beim Rohteil. Links die Bearbeitungen der Reihe nach, rechts das Teil.",
         "<b>„🧊 3D-Simulation“</b>: beginnt beim <b>Rohteil</b>. Links die Bearbeitungen, rechts das Teil.")
def s_s_auf(pg, a):
    pg.evaluate("scrollTo(0,0)")
    a.hin("[data-cam-sim]", ms=300)
    pg.wait_for_selector("#cam-sim", timeout=30000); pg.wait_for_timeout(1500)
    print("  Schritte:", pg.evaluate("""() => document.querySelector('#cam-sim-bild').__sim.schritte
      .map((x) => [x.kanal, x.platz, x.art, x.status || '', x.punkte.length])"""))
    a.hin("[data-cam-sim-schritt] >> nth=0", klick=False, ms=900)

@schritt("Mit Maschine siehst du die S W zwanzig wie im Maschinenbild: Kanal eins blau, Kanal drei kupfern, die Gegenspindel gelb.",
         "<b>„Maschine“</b>: <b>Kanal 1</b> blau, <b>Kanal 3</b> kupfern, <b>Gegenspindel</b> gelb.")
def s_s_maschine(pg, a):
    if not pg.is_checked("#cam-sim-maschine"): a.hin("#cam-sim-maschine", ms=1500)
    a.hin("#cam-sim-bild", klick=False, ms=800)

@schritt("Mit Einzeln hält die Simulation nach jeder Bearbeitung an. Abspielen, und Kanal drei bohrt vorne. "
         "Mit M hundertdreiunddreissig steht das Material, und der ganze Träger von Kanal drei fährt in Z.",
         "<b>„Einzeln“</b>, <b>Abspielen</b>: Kanal 3 bohrt, der <b>Träger</b> fährt in Z.")
def s_s_k3(pg, a):
    if not pg.is_checked("#cam-sim-einzeln"): a.hin("#cam-sim-einzeln", ms=500)
    a.spielen(14000)

@schritt("Weiter: Kanal eins dreht die Kontur. Hier fährt das Material in Z aus der Führungsbüchse, und das Werkzeug nur in X.",
         "<b>Kontur</b>: das <b>Material</b> fährt in Z aus der Büchse, das Werkzeug in X.")
def s_s_kontur(pg, a): a.spielen(14000)

@schritt("Mit Bearbeitung vor springst du gleich ans Ende der nächsten Bearbeitung: Freistich und Gewinde.",
         "<b>„Bearbeitung ▶“</b> springt zur nächsten: <b>Freistich</b>, <b>Gewinde</b>.")
def s_s_vor(pg, a):
    a.hin("#cam-sim-vor", ms=2500); a.hin("#cam-sim-vor", ms=2500)

@schritt("Jetzt die Schlüsselflächen. Das Teil dreht in C, und der Fräser fährt mit Y quer darüber. Danach die Querbohrung.",
         "<b>Schlüsselflächen</b> mit C und Y, dann die <b>Querbohrung</b>.")
def s_s_flaeche(pg, a):
    a.spielen(12000)
    a.hin("#cam-sim-vor", ms=2500)

@schritt("Mit Einzelsatz geht es sogar Zeile für Zeile, und unten steht immer, was als Nächstes kommt.",
         "<b>„Einzelsatz“</b>: Zeile für Zeile, unten <b>„als Nächstes“</b>.")
def s_s_satz(pg, a):
    a.hin("#cam-sim-satz", ms=500)
    for _ in range(3): a.hin("#cam-sim-start", ms=1300)
    a.hin("#cam-sim-naechst", klick=False, ms=1200)
    a.hin("#cam-sim-satz", ms=400)

@schritt("Dann Abstechen und Übergabe: Die Gegenspindel fährt vor, greift das Teil, und der Abstecher trennt es von der Stange.",
         "<b>Abstechen und Übergabe</b>: die Gegenspindel greift, der Abstecher trennt.")
def s_s_ab(pg, a):
    a.spielen(16000)

@schritt("In Kanal zwei steht das Teil gedreht in der Gegenspindel und fährt zu den Werkzeugen: Fase, Bohrung und der Lochkreis.",
         "<b>Kanal 2</b>: das Teil fährt in der Gegenspindel zu den Werkzeugen.")
def s_s_k2(pg, a):
    a.spielen(9000)
    a.hin("#cam-sim-vor", ms=2000); a.hin("#cam-sim-vor", ms=2000)

@schritt("[impressed] Fertig! Die Gegenspindel steht wieder in der Grundstellung, und das Teil liegt in der Schale daneben.",
         "Fertig: das Teil liegt in der <b>Schale</b>.")
def s_s_fertig(pg, a):
    a.hin("#cam-sim-ende", ms=3500)

@schritt("Mit Simultan rechnet die Simulation wie die Maschine: Kanal zwei bearbeitet hinten das vorige Teil, während Kanal eins und drei vorne schon am nächsten arbeiten.",
         "<b>„Simultan“</b>: vorne und hinten gleichzeitig, wie an der Maschine.")
def s_s_simultan(pg, a):
    a.hin("#cam-sim-simultan", klick=False, ms=2500)

@schritt("Und mit Fertigteil ansehen siehst du nur das Teil. Ziehen dreht und schwenkt es, das Mausrad zoomt.",
         "<b>„🔍 Fertigteil ansehen“</b>: ziehen dreht, Mausrad zoomt.")
def s_s_teil(pg, a):
    a.hin("#cam-sim-teil", ms=2500)
    b = pg.locator("#cam-sim-bild").bounding_box()
    if b:
        x, y = b["x"] + b["width"] * 0.45, b["y"] + b["height"] * 0.5
        pg.mouse.move(x, y, steps=12); pg.mouse.down()
        pg.mouse.move(x + 260, y - 60, steps=60); pg.mouse.up(); pg.wait_for_timeout(1800)

@schritt("Mit aufgeschnitten schaust du hinein: die Bohrung vorne, die Querbohrung, die Bohrung hinten und der Lochkreis. "
         "[warmly] Genau wie unser Modell vom Anfang.",
         "<b>„Aufgeschnitten“</b>: alle Bohrungen innen. Genau wie das <b>Modell</b>.")
def s_s_schnitt(pg, a):
    a.hin("#cam-sim-schnitt", ms=1500)
    if pg.locator("text=Von der Seite").count(): a.hin("text=Von der Seite", ms=2500)
    if pg.locator("text=Schräg").count(): a.hin("text=Schräg", ms=1500)

# ===================== Teil 10: Optimierung und Abschluss =====================
teil("Optimierung und Abschluss")

@schritt("Wir schliessen die Simulation. Daneben der Knopf Optimierung: Er fragt zuerst nach dem Material, wir nehmen rostfrei V zwei A.",
         "<b>„💡 Optimierung“</b>: zuerst das <b>Material</b>, hier <b>V2A</b>.")
def s_o_auf(pg, a):
    z = pg.locator("#cam-sim button[title='Schliessen']")
    if z.count(): a.hin("#cam-sim button[title='Schliessen']", ms=800)
    pg.evaluate("scrollTo(0,0)")
    a.hin("[data-cam-opt-auf]", ms=1000)
    a.hin("[data-cam-opt-werkstoff='v2a']", ms=800)
    if pg.locator("[data-cam-opt-los]").count(): a.hin("[data-cam-opt-los]", ms=1200)

@schritt("Dann kommt eine Liste je Bearbeitung: wichtig, Empfehlung oder Tipp, mit der N C Zeile. [serious] Das Programm ändert sich dabei nicht, es sind nur Hinweise.",
         "Liste je Bearbeitung: <b>Wichtig</b>, <b>Empfehlung</b>, <b>Tipp</b>. Nur Hinweise, das Programm bleibt.")
def s_o_liste(pg, a):
    if pg.locator("[data-cam-opt-block]").count():
        for k in range(min(3, pg.locator("[data-cam-opt-block]").count())):
            a.hin(f"[data-cam-opt-block] >> nth={k}", klick=False, ms=1300)

@schritt("Zum Schluss oben rechts Speichern, dann ist das Programm für alle da. In jedem Kanal kopierst du das Programm oder lädst es als Datei für die Maschine herunter.",
         "<b>„Speichern“</b> oben rechts. Je Kanal <b>Kopieren</b> und <b>Herunterladen</b>.")
def s_o_speichern(pg, a):
    z = pg.locator(".cam-opt-huelle [aria-label='Schliessen']")
    if z.count(): a.hin(".cam-opt-huelle [aria-label='Schliessen']", ms=700)
    pg.evaluate("scrollTo(0,0)")
    a.hin("#camab-speichern", klick=False, ms=1500)
    for k in ["[data-cam-kopieren='1']", "[data-cam-laden='1']"]:
        if pg.locator(k).count(): a.hin(k, klick=False, ms=1200)

@schritt("[serious] Und ganz wichtig: Jedes Programm vor dem ersten Lauf an der Maschine im Einzelsatz prüfen. "
         "[warmly] Viel Erfolg mit Hofer Cam!",
         "Vor dem ersten Lauf immer <b>im Einzelsatz prüfen</b>. Viel Erfolg!")
def s_ende(pg, a):
    a.teil("ganz")
    pg.wait_for_timeout(3500)
    a.teil(None); a.titel("Viel Erfolg mit HOFERCAM", "Hofer + Co. Präzisionsdrehteile")

# ---- Text und Ton -----------------------------------------------------------
ohne_tags = lambda t: re.sub(r"\s*\[[^\]]+\]\s*", " ", t).strip()

def text_schreiben(datei):
    z = ["# HOFERCAM auf der Star SW-20: Sprechertext für ElevenLabs v3", "",
         "Je Teil einmal in ElevenLabs (Modell Eleven v3) einfügen, Stimme wählen, Tempo (Speed) auf 0.9 stellen,",
         "erzeugen und als MP3 herunterladen. Dateien so nennen: teil01.mp3, teil02.mp3 … bis teil"
         f"{len(TEILE):02d}.mp3.",
         "Die Wörter in eckigen Klammern sind Gefühle für die Stimme, die spricht ElevenLabs nicht aus.",
         "Die drei Punkte zwischen den Absätzen sind kurze Pausen, bitte stehen lassen: daran teilt das Video den Ton auf die Schritte auf.", ""]
    for n, name in enumerate(TEILE, 1):
        txt = "\n\n... \n\n".join(s for (t, s, _, _) in SCHRITTE if t == n)
        z += [f"## Teil {n}: {name}  ({len(txt)} Zeichen, Datei teil{n:02d}.mp3)", "", txt, ""]
    with open(datei, "w", encoding="utf-8") as f: f.write("\n".join(z))
    print("Text:", datei, "·", len(SCHRITTE), "Schritte in", len(TEILE), "Teilen")

def dauer_von(datei):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", datei],
                                capture_output=True, text=True).stdout.strip())

def ton_laden(ordner):
    """Je Teil eine Datei aus ElevenLabs, an den Pausen in die Schritte zerlegt: je Schritt (Datei, Anfang, Länge)."""
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

def ass_zeit(s):
    s = max(0, s); return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"

def untertitel(datei, zeiten, ende):
    """Untertitel für das Band unter der App (ASS, gezeichnet von ffmpeg)."""
    kopf = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
            "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Band,DejaVu Sans,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,90,90,40,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    zeilen = []
    for i, (_, _, zeile, _) in enumerate(SCHRITTE[:len(zeiten)]):
        von, bis = zeiten[i], (zeiten[i + 1] if i + 1 < len(zeiten) else ende)
        t = re.sub(r"<b>", r"{\\b1\\c&H4AC2FF&}", zeile); t = re.sub(r"</b>", r"{\\b0\\c&HFFFFFF&}", t)
        t = re.sub(r"<[^>]+>", "", t)
        zeilen.append(f"Dialogue: 0,{ass_zeit(von)},{ass_zeit(bis - 0.05)},Band,,0,0,0,,{t}")
    with open(datei, "w", encoding="utf-8") as f: f.write(kopf + "\n".join(zeilen) + "\n")

if "--text" in sys.argv:
    text_schreiben(sys.argv[sys.argv.index("--text") + 1]); sys.exit(0)

stuecke = ton_laden(TON) if TON else [(None, 0, len(ohne_tags(s)) / ZEICHEN_JE_S + 0.8) for (_, s, _, _) in SCHRITTE]
dauern = [d for (_, _, d) in stuecke]
print("Ton:", round(sum(dauern)), "s", "(geschätzt, ohne Ton)" if not TON else "")

# ---- Aufnahme ---------------------------------------------------------------
server_starten(); time.sleep(0.4)
ordner = tempfile.mkdtemp()
zeiten, fehler, zu_lang = [], [], []

def teil_bedienen(route):
    n = route.request.url.split("/tutorial-teil/")[1].split("?")[0] or "index.html"
    if n not in TEIL_DATEIEN: return route.fulfill(status=404, body="")
    ct = {"html": "text/html", "js": "application/javascript", "svg": "image/svg+xml"}.get(n.rsplit(".", 1)[1], "application/octet-stream")
    route.fulfill(status=200, content_type=ct, body=open(TEIL_DATEIEN[n], "rb").read())

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"])
    kx = br.new_context(viewport={"width": B, "height": H}, record_video_dir=ordner, record_video_size={"width": B, "height": H})
    kx.add_init_script(ZUSATZ)
    kx.route(TEIL_URL + "**", teil_bedienen)
    pg = kx.new_page()
    pg.on("pageerror", lambda e: print("  Seitenfehler:", str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    t0 = time.time()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    # Das 3D-Bild des Teils liegt unsichtbar bereit
    pg.evaluate("(u) => { const f = document.createElement('iframe'); f.id = 'tut-teil'; f.src = u; document.body.appendChild(f); }", TEIL_URL + "index.html")
    for _ in range(50):
        fr = next((f for f in pg.frames if "teil.local" in f.url), None)
        if fr and fr.evaluate("typeof window.zeige === 'function'"): break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(2500)
    if fr: fr.evaluate("window.ruhe = true")
    pg.mouse.move(B / 2, H / 2)
    pg.evaluate("() => { const e = document.getElementById('tut-titel'); e.style.transition = 'none'; e.innerHTML = 'HOFERCAM'; e.style.opacity = 1; }")
    pg.wait_for_timeout(600)
    start = time.time() - t0
    pg.set_default_timeout(6000)

    class A: pass
    a = A()
    def titel(t, unter=""):
        pg.evaluate("""([t, u]) => { const e = document.getElementById('tut-titel'); e.style.transition = '';
          e.innerHTML = t ? '<img src="./logo-weiss.svg" alt="">' + t + '<small>' + u + '</small>' : ''; e.style.opacity = t ? 1 : 0; }""", [t, unter])
        if t: pg.mouse.move(B + 40, H / 2)
    def teil3d(name):
        fr = next((f for f in pg.frames if "teil.local" in f.url), None)
        if name and fr:
            fr.evaluate("(n) => { window.ruhe = false; zeige(n); }", name)
            pg.evaluate("document.getElementById('tut-teil').style.opacity = 1")
            pg.mouse.move(B + 40, H / 2)
        else:
            pg.evaluate("document.getElementById('tut-teil').style.opacity = 0")
            pg.wait_for_timeout(550)
            if fr: fr.evaluate("window.ruhe = true")
    def hin(sel, klick=True, ms=500):
        loc = pg.locator(sel)
        if not loc.count(): print("  fehlt:", sel); return
        el = loc.first
        try: el.scroll_into_view_if_needed(timeout=2000)
        except Exception: pass
        b = el.bounding_box()
        if not b: print("  unsichtbar:", sel); return
        pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=22)
        pg.wait_for_timeout(300)
        if klick: pg.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        pg.wait_for_timeout(ms)
    def tippen(sel, wert):
        if not pg.locator(sel).count(): print("  fehlt:", sel); return
        hin(sel, ms=150)
        if not pg.evaluate("() => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')"):
            pg.locator(sel).first.focus()
        pg.keyboard.press("Control+a"); pg.keyboard.type(wert, delay=90); pg.wait_for_timeout(350)
        pg.keyboard.press("Tab"); pg.wait_for_timeout(200)
    def reiter(art):
        pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
        sel = f"[data-unter='nc/{art}']"
        if not pg.locator(sel).count() or not pg.locator(sel).first.is_visible(): sel = f".reiter [data-rech='{art}']"
        hin(sel, ms=900)
        pg.evaluate("getSelection().removeAllRanges()")
    def spielen(hoechstens):
        # Abspielen bis zum Halt am Ende der Bearbeitung, höchstens so lange
        hin("#cam-sim-start", ms=300)
        bis = time.time() + hoechstens / 1000
        while time.time() < bis and "Pause" in (pg.text_content("#cam-sim-start") or ""):
            pg.wait_for_timeout(250)
        if "Pause" in (pg.text_content("#cam-sim-start") or ""):
            pg.click("#cam-sim-start"); print("  Simulation nach", hoechstens, "ms angehalten")
        pg.wait_for_timeout(500)
    a.hin, a.tippen, a.reiter, a.titel, a.teil, a.spielen = hin, tippen, reiter, titel, teil3d, spielen

    BIS = int(os.environ.get("BIS", "0") or 0)
    for i, (_, sprechen, zeile, f) in enumerate(SCHRITTE):
        if BIS and i >= BIS: break
        beginn = time.time()
        zeiten.append(beginn - t0 - start)
        try:
            f(pg, a)
        except Exception as e:
            pg.screenshot(path=os.path.join(tempfile.gettempdir(), f"sw20-fehler-{i}.png"))
            print("Fehler bei Schritt", i, f.__name__, (str(e) or repr(e)).splitlines()[0])
            fehler.append(f.__name__)
            pg.keyboard.press("Escape")
        rest = dauern[i] - (time.time() - beginn)
        if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        else:
            zu_lang.append((f.__name__, round(-rest, 1)))
            print(f"  Schritt {i} {f.__name__}: Bild {round(-rest, 1)} s länger als Ton")
    pg.wait_for_timeout(2500)
    ende = time.time() - t0 - start
    video = pg.video.path()
    kx.close(); br.close()

# ---- Band mit Untertiteln, Ton an die Stellen seiner Schritte ---------------
os.makedirs(os.path.dirname(os.path.abspath(ZIEL)), exist_ok=True)
ass = os.path.join(ordner, "band.ass")
untertitel(ass, zeiten, ende)
bild = f"[0:v]pad={B}:{H + BAND}:0:0:color=0x0a1e3c,ass={ass}[v]"
if TON:
    eingaben, filter_ = ["-ss", f"{start:.2f}", "-i", video], [bild]
    for i, ((datei, ab, lang), t) in enumerate(zip(stuecke, zeiten)):
        eingaben += ["-ss", f"{ab:.3f}", "-t", f"{lang:.3f}", "-i", datei]
        filter_.append(f"[{i + 1}:a]aresample=44100,adelay={int(t * 1000)}:all=1[a{i}]")
    filter_.append("".join(f"[a{i}]" for i in range(len(zeiten))) + f"amix=inputs={len(zeiten)}:normalize=0,loudnorm=I=-15:TP=-1.5[ton]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *eingaben, "-filter_complex", ";".join(filter_),
                    "-map", "[v]", "-map", "[ton]", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
                    "-r", "25", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", ZIEL], check=True)
else:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", video, "-filter_complex", bild, "-map", "[v]",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "30", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", ZIEL], check=True)
shutil.rmtree(ordner, ignore_errors=True)
print("Schritte mit Fehler:", fehler or "keine")
print("Bild länger als Ton:", zu_lang or "nirgends")
print("Video:", os.path.abspath(ZIEL), round(os.path.getsize(ZIEL) / 1e6, 2), "MB")
