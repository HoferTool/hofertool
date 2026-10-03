# Startseite: Hat jemand heute Geburtstag, steht er statt des Logos gross
# im blauen Band, mit Kuchen und Alter, Name, Geburtsdatum und Konfetti.
# Ohne Geburtstag bleibt das Logo. Am Handy steht die Person unter Uhr
# und Wetter.
import time, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
heute = datetime.date.today()
geboren = heute.replace(year=heute.year - 40).isoformat()
BILD = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10' fill='%23889'/></svg>"
def zusatz(mit):
    if not mit: return ""
    return f"""
daten.profiles[0].geburtstag = '{geboren}';
daten.profiles[0].bild_url = "{BILD}";
"""
f = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for mit, breite, hoehe, mobil in [(False, 1600, 1000, False), (True, 1600, 1000, False), (True, 430, 900, True)]:
        pg = br.new_context(viewport={"width":breite,"height":hoehe}, is_mobile=mobil, has_touch=mobil).new_page()
        pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        body = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                            zusatz(mit) + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
        pg.route("**/cdn.jsdelivr.net/**", (lambda b: lambda r: r.fulfill(status=200, content_type="application/javascript", body=b))(body))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector(".kopfkarte"); pg.wait_for_timeout(2500)
        r = pg.evaluate("""() => {
          const k = document.querySelector('.kopfkarte'), m = document.getElementById('geb-mitte');
          const rect = (e) => e && e.getBoundingClientRect();
          const bild = document.querySelector('.geb-bild'), uhr = document.querySelector('.kopfkarte__zeit'),
                wetter = document.querySelector('.kopfkarte__wetter');
          const ueber = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
          return { fest: k.classList.contains('kopfkarte--geburtstag'), logo: !!document.querySelector('.kopfkarte__logo'),
                   alter: (document.querySelector('.geb-alter') || {}).textContent || '',
                   name: (document.querySelector('.geb-name') || {}).textContent || '',
                   datum: (document.querySelector('.geb-datum') || {}).textContent || '',
                   bild: bild ? Math.round(rect(bild).width) : 0, band: Math.round(rect(k).height),
                   konfetti: !!document.querySelector('.geb-konfetti'),
                   ueberUhr: ueber(rect(m), rect(uhr)), ueberWetter: ueber(rect(m), rect(wetter)),
                   breiter: document.documentElement.scrollWidth > innerWidth + 1,
                   karte: !!document.querySelector('#db-geburtstage .gebtorte') };
        }""")
        art = ("mit" if mit else "ohne") + (" Handy" if mobil else " Desktop")
        print(art, r)
        pg.screenshot(path=f"/tmp/geb_{art.replace(' ', '_')}.png", clip={"x":0,"y":0,"width":breite,"height":min(hoehe, 520)})
        if not mit:
            if r["fest"] or not r["logo"]: f.append("ohne Geburtstag: Band falsch")
        else:
            if not (r["fest"] and r["alter"] == "40" and r["name"] and r["datum"] and r["konfetti"] and r["karte"]):
                f.append(art + ": Angaben fehlen")
            if r["bild"] < 150: f.append(art + ": Bild zu klein")
            if r["ueberUhr"] or r["ueberWetter"]: f.append(art + ": überdeckt Uhr oder Wetter")
            if r["breiter"]: f.append(art + ": Seite breiter als der Bildschirm")
        pg.context.close()
    print("Fehler:", f[:4] if f else "keine")
    br.close()
