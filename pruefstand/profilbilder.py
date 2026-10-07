# Profilbilder: Alle erscheinen grau. Ein Bild mit viel Weiss bekommt
# data-hell und wird mässig umgekehrt, ein dunkles farbiges nicht.
# Das weisse Bild kommt von einer fremden Adresse (wie die Supabase-
# Ablage), damit auch das Messen über die Kopie mit Freigabe geprüft ist.
import time, datetime, base64, io
from PIL import Image, ImageDraw
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def png(farbe, punkt):
    im = Image.new("RGB", (64, 64), farbe); ImageDraw.Draw(im).ellipse((24, 24, 40, 40), fill=punkt)
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
WEISS = png((250, 250, 250), (30, 30, 30))
DUNKEL = "data:image/png;base64," + base64.b64encode(png((160, 20, 20), (20, 60, 200))).decode()
heute = datetime.date.today()
zusatz = f"""
daten.profiles[0].bild_url = "https://bilder.test/weiss.png";
daten.profiles[1].bild_url = "{DUNKEL}";
daten.profiles[1].geburtstag = '{heute.replace(year=heute.year - 30).isoformat()}';
"""
f = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":1000}).new_page()
    pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    body = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                        zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    pg.route("https://bilder.test/**", lambda r: r.fulfill(status=200, content_type="image/png", body=WEISS,
                                                          headers={"Access-Control-Allow-Origin": "*"}))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector(".kopfkarte"); pg.wait_for_timeout(2500)
    r = pg.evaluate("""() => {
      const info = (e) => e ? { hell: e.hasAttribute('data-hell'), filter: getComputedStyle(e).filter } : null;
      return { kopf: info(document.querySelector('img.kopf__bild[src*="bilder.test"]')),
               geb: info(document.querySelector('img.geb-bild')) };
    }""")
    print(r)
    pg.screenshot(path="/tmp/profilbilder.png", clip={"x":0,"y":0,"width":1600,"height":420})
    if not r["kopf"]: f.append("Bild in der Kopfzeile fehlt")
    elif not (r["kopf"]["hell"] and "invert" in r["kopf"]["filter"] and "grayscale" in r["kopf"]["filter"]):
        f.append("weisses Bild nicht umgekehrt")
    if not r["geb"]: f.append("Geburtstagsbild fehlt")
    elif r["geb"]["hell"] or "invert" in r["geb"]["filter"] or "grayscale" not in r["geb"]["filter"]:
        f.append("dunkles Bild falsch: " + r["geb"]["filter"])
    print("Fehler:", f[:4] if f else "keine")
    br.close()
