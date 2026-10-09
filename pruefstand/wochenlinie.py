# Wochenübergang (111.120.0, Wunsch Patrick 9. Oktober 2026): zwischen
# Freitag und Montag eine etwas stärkere Linie als zwischen den Tagen,
# in Kopfzeile, Maschinenzeilen und Ferienblock, hell, dunkel und am Handy.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

MESSEN = """() => {
  const koepfe = [...document.querySelectorAll('.pw-zeile--kopf .pw-tag')];
  const montage = koepfe.filter(k => k.querySelector('.pw-tag__wt').textContent.trim() === 'Mo');
  const andere = koepfe.filter(k => k.querySelector('.pw-tag__wt').textContent.trim() !== 'Mo');
  const b = (el) => { const s = getComputedStyle(el); return s.borderLeftWidth + ' ' + s.borderLeftColor; };
  const zeile = document.querySelector('.pw-zeile[data-mzeile] .pw-spuren');
  const zellen = zeile ? [...zeile.querySelectorAll('.pw-zelle')] : [];
  const ferien = [...document.querySelectorAll('.pw-zelle--ferienblock')];
  return {
    tage: koepfe.length, montage: montage.length,
    montagKopf: [...new Set(montage.map(b))], tagKopf: [...new Set(andere.map(b))],
    montagKlassen: montage.every(k => k.classList.contains('pw-tag--woche')),
    andereKlassen: andere.every(k => !k.classList.contains('pw-tag--woche')),
    zellenWoche: zellen.filter(z => z.classList.contains('pw-zelle--woche')).length,
    zellenRand: [...new Set(zellen.filter(z => z.classList.contains('pw-zelle--woche')).map(b))],
    zellenNormal: [...new Set(zellen.filter(z => !z.classList.contains('pw-zelle--woche')).map(b))],
    ferienWoche: ferien.filter(z => z.classList.contains('pw-zelle--woche')).length,
    // Die Spalten bleiben gleich breit, die Linie schiebt nichts
    breiten: [...new Set(koepfe.map(k => Math.round(k.getBoundingClientRect().width)))].length <= 2,
  };
}"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, breite, hoehe, mobil, dunkel in (("hell", 1600, 950, False, False),
                                               ("dunkel", 1600, 950, False, True),
                                               ("handy", 430, 900, True, False)):
        ctx = br.new_context(viewport={"width": breite, "height": hoehe}, is_mobile=mobil, has_touch=mobil)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
        pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
        m = pg.evaluate(MESSEN)
        print("    ", name, m)
        pruefe(f"{name}: Tage und Montage da", m["tage"] >= 5 and m["montage"] >= 1)
        pruefe(f"{name}: jeder Montag hat die Wochenklasse, kein anderer Tag", m["montagKlassen"] and m["andereKlassen"])
        pruefe(f"{name}: Linie am Montag 2 px, an anderen Tagen 1 px",
               all(x.startswith("2px") for x in m["montagKopf"]) and all(x.startswith("1px") for x in m["tagKopf"]))
        pruefe(f"{name}: Linie am Montag anders gefärbt als sonst", not set(m["montagKopf"]) & set(m["tagKopf"]))
        pruefe(f"{name}: Maschinenzellen mit Wochenlinie wie der Kopf",
               m["zellenWoche"] == m["montage"] and m["zellenRand"] == m["montagKopf"] and all(x.startswith("1px") for x in m["zellenNormal"]))
        pruefe(f"{name}: Ferienblock mit Wochenlinie", m["ferienWoche"] == m["montage"])
        pruefe(f"{name}: Spalten gleich breit", m["breiten"])
        pg.screenshot(path=f"/tmp/claude-0/wochenlinie_{name}.png")
        ctx.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
