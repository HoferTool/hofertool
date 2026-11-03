# Visitenkarten wie echte Handyfotos (1.373.1, Patrick 3. November 2026:
# „die Erkennung der Visitenkarte funktioniert nicht“): Karte auf dem
# Tisch mit Schatten und Glanz, schräg, hochkant (Handy gedreht), unscharf,
# kopfüber, dazu eine dunkle Karte mit heller Schrift. Jede muss Name,
# Telefon, Mobil und Mail liefern. Seit 1.377.0 liegt die Texterkennung
# in der eigenen Website (dist/tesseract/): der Test sperrt jsdelivr
# ganz, so wie es Brave oder ein Werbeblocker tun.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

HIER = os.path.dirname(os.path.abspath(__file__))
NM = os.path.join(HIER, "..", "node_modules")
DEU = os.environ.get("TESS_DEU", "")
mit_ocr = os.path.exists(os.path.join(HIER, "..", "dist", "tesseract", "sprache", "deu.traineddata.gz"))

def cdn(route):
    u = route.request.url
    # Texterkennung nie von jsdelivr: so wie Brave, das fremde Adressen sperrt
    if "tesseract" in u:
        fehler.append("Texterkennung von jsdelivr: " + u[:120])
        return route.abort()
    for stueck, ordner in (("/tesseract.js@v7.0.0/dist/", os.path.join(NM, "tesseract.js", "dist")),
                           ("/tesseract.js-core@v7.0.0/", os.path.join(NM, "tesseract.js-core")),
                           ("/@tesseract.js-data/deu/4.0.0_best_int/", DEU)):
        if stueck in u:
            pfad = os.path.join(ordner, u.split(stueck, 1)[1].split("?")[0])
            if os.path.exists(pfad):
                typ = "application/wasm" if pfad.endswith(".wasm") else "application/javascript" if pfad.endswith(".js") else "application/octet-stream"
                return route.fulfill(status=200, body=open(pfad, "rb").read(), content_type=typ)
            return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/javascript", body=FAKE)

KARTEN = {
 "einfach": ("""<div style="font-family:Arial;width:850px;height:500px;padding:50px;box-sizing:border-box;background:#fff">
<div style="font-size:34px;font-weight:bold;color:#0a3d7a">VISCHER &amp; BOLLI AG</div>
<div style="font-size:20px;color:#555;margin-bottom:40px">Spannsysteme</div>
<div style="font-size:30px;font-weight:bold">Thomas Brunner</div>
<div style="font-size:22px;margin-bottom:30px">Verkaufsberater Aussendienst</div>
<div style="font-size:22px">Tel. +41 44 802 15 15</div>
<div style="font-size:22px">Mobil +41 79 412 33 21</div>
<div style="font-size:22px">thomas.brunner@vb.ch</div></div>""", {"name":"Thomas Brunner","telefon":"+41448021515","mobil":"+41794123321","email":"thomas.brunner@vb.ch"}),
 "zweispaltig": ("""<div style="font-family:Helvetica,Arial;width:850px;height:500px;box-sizing:border-box;background:#fff;display:flex">
<div style="width:300px;background:#c8102e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:900">UTILIS</div>
<div style="padding:40px;font-size:19px;color:#333;line-height:1.35">
<div style="font-size:28px;font-weight:bold;color:#000">Marco Bianchi</div>
<div>Key Account Manager</div><div style="height:28px"></div>
<div>Utilis AG · Präzisionswerkzeuge</div><div>Kreuzlingerstrasse 22</div><div>CH-8555 Müllheim</div><div style="height:18px"></div>
<div>T +41 52 762 62 62</div><div>M +41 78 655 21 09</div><div>marco.bianchi@utilis.com</div><div>www.utilis.com</div></div></div>""",
  {"name":"Marco Bianchi","telefon":"+41527626262","mobil":"+41786552109","email":"marco.bianchi@utilis.com"}),
 "dunkel": ("""<div style="font-family:Verdana;width:850px;height:500px;padding:55px;box-sizing:border-box;background:#14213d;color:#f0f0f0">
<div style="font-size:30px;letter-spacing:4px;color:#fca311">SM TOOLS</div><div style="height:60px"></div>
<div style="font-size:28px">SANDRA KELLER</div>
<div style="font-size:18px;color:#ccc">Technische Beratung</div><div style="height:30px"></div>
<div style="font-size:18px">Telefon 032 653 77 40</div>
<div style="font-size:18px">Natel 076 391 05 88</div>
<div style="font-size:18px">s.keller@smtools.ch</div></div>""",
  {"name":"Sandra Keller","telefon":"0326537740","mobil":"0763910588","email":"s.keller@smtools.ch"}),
}
# Fotos: Karte auf einem Tisch, schräg, Schatten, Handy hochkant
def foto_html(karte, drehung, schief, blur=0):
    return f"""<html><body style="margin:0;filter:blur({blur}px);width:1500px;height:2000px;background:radial-gradient(circle at 30% 20%,#b08a62,#5c4128 70%,#3a2817);overflow:hidden">
<div style="position:absolute;left:150px;top:500px;transform:rotate({drehung+schief}deg) scale(1.3);transform-origin:center;box-shadow:12px 18px 30px rgba(0,0,0,.55)">
<div style="position:relative">{karte}<div style="position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.35),rgba(0,0,0,0) 35%,rgba(0,0,0,.22))"></div></div></div></body></html>"""

def foto_html(karte, drehung, schief, blur=0):
    return f"""<html><body style="margin:0;width:1500px;height:2000px;filter:blur({blur}px);background:radial-gradient(circle at 30% 20%,#b08a62,#5c4128 70%,#3a2817);overflow:hidden">
<div style="position:absolute;left:150px;top:500px;transform:rotate({drehung+schief}deg) scale(1.3);transform-origin:center;box-shadow:12px 18px 30px rgba(0,0,0,.55)">
<div style="position:relative">{karte}<div style="position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.35),rgba(0,0,0,0) 35%,rgba(0,0,0,.22))"></div></div></div></body></html>"""

FAELLE = []
for name, (k, soll) in KARTEN.items():
    FAELLE.append((name + " quer", foto_html(k, 0, -4), soll))
    FAELLE.append((name + " hochkant", foto_html(k, 90, 3), soll))
    FAELLE.append((name + " hochkant links", foto_html(k, -90, -2), soll))
    FAELLE.append((name + " unscharf", foto_html(k, 90, 6, 1.6), soll))
    FAELLE.append((name + " kopfüber", foto_html(k, 180, 2, 0.8), soll))

if not mit_ocr:
    print("Hinweis: erst npm run build, sonst wird die Erkennung nicht geprüft")
    print("Fehler: keine"); raise SystemExit

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1500, "height": 2000}, timezone_id="Europe/Zurich")
    bs = ctx.new_page(); bilder = []
    for n, html, soll in FAELLE:
        bs.set_content(html); bilder.append(bs.screenshot(type="jpeg", quality=85))
    bs.close()
    pg = ctx.new_page()
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", cdn)
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("TEST.daten.lieferant_kontakte = []; TEST.daten.lieferant_besuche = [];")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("[data-unter='bestellungen/lieferanten']", timeout=8000)
    pg.click("[data-unter='bestellungen/lieferanten']")
    pg.wait_for_selector("[data-lfkontakte='s1']", timeout=8000)
    pg.click("[data-lfkontakte='s1']"); pg.wait_for_selector("#lk-fenster #lk-foto", state="attached")
    for (n, html, soll), bild in zip(FAELLE, bilder):
        pg.set_input_files("#lk-foto", files=[{"name": "karte.jpg", "mimeType": "image/jpeg", "buffer": bild}])
        pg.wait_for_selector("#lk-dialog #lk-gelesen", timeout=180000)
        werte = {f: pg.input_value("#lk-f-" + f) for f in ["name", "telefon", "mobil", "email"]}
        ok = all((werte[f] == v) if f == "name" else (werte[f].replace(" ", "") == v) for f, v in soll.items())
        pruefe(n + " " + str(werte), ok)
        pg.keyboard.press("Escape"); pg.wait_for_selector("#lk-dialog", state="detached", timeout=5000)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
