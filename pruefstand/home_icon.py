# Symbol für den Home-Bildschirm: apple-touch-icon folgt Themenfarbe und dunklem Modus
import time, base64
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
PUNKT = """() => new Promise((ok) => {
  const l = document.querySelector('link[rel="apple-touch-icon"]');
  const i = new Image();
  i.onload = () => { const c = document.createElement('canvas'); c.width = 180; c.height = 180;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    ok({ href: l.getAttribute('href').slice(0, 22), groesse: i.naturalWidth, ecke: [...x.getImageData(3, 3, 1, 1).data] }); };
  i.src = l.getAttribute('href');
})"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    a = pg.evaluate(PUNKT)
    pruefe("Blau als Bild-Daten, 180 Punkte", a["href"] == "data:image/png;base64," and a["groesse"] == 180 and a["ecke"][:3] == [0, 56, 132])
    def schuss(name):
        h = pg.evaluate("document.querySelector('link[rel=\"apple-touch-icon\"]').getAttribute('href')")
        open(name, "wb").write(base64.b64decode(h.split(",", 1)[1]))
    schuss("icon-blau.png")
    pg.evaluate("document.body.setAttribute('data-thema', 'rot')"); pg.wait_for_timeout(500)
    pruefe("Rot", pg.evaluate(PUNKT)["ecke"][:3] == [0xa4, 0x23, 0x1c]); schuss("icon-rot.png")
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(500)
    pruefe("Dunkel", pg.evaluate(PUNKT)["ecke"][:3] == [0x14, 0x18, 0x1d]); schuss("icon-rot-dunkel.png")
    pg.evaluate("document.body.setAttribute('data-thema', 'gruen')"); pg.wait_for_timeout(500); schuss("icon-gruen-dunkel.png")
    pruefe("Nur ein Symbol-Link", pg.locator('link[rel="apple-touch-icon"]').count() == 1)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
