# Handy: Beim seitlichen Schieben der Planwand läuft die rote Heute-Linie
# unter den festen Maschinennamen durch, nicht darüber.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":430,"height":900}, is_mobile=True, has_touch=True).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-heutelinie"); pg.wait_for_timeout(1500)
    # So weit schieben, dass die Linie hinter der Namensspalte liegt
    r = pg.evaluate("""() => {
      const rolle = document.querySelector('.pw-rolle'), linie = document.querySelector('.pw-heutelinie');
      const name = document.querySelector('.pw-tafel > .pw-zeile > .pw-name:not(.pw-park)');
      const nr = name.getBoundingClientRect();
      rolle.scrollLeft += linie.getBoundingClientRect().left - (nr.left + nr.width / 2);
      const lr = linie.getBoundingClientRect(), nr2 = name.getBoundingClientRect();
      return { hinterName: lr.left > nr2.left && lr.right < nr2.right,
               zName: Number(getComputedStyle(name).zIndex), zLinie: Number(getComputedStyle(linie).zIndex) };
    }""")
    pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/heute_linie.png")
    print("Linie hinter der Namensspalte:", r["hinterName"])
    print("Name liegt darüber:", r["zName"] > r["zLinie"], r)
    if not (r["hinterName"] and r["zName"] > r["zLinie"]): f.append("Heute-Linie liegt über den Namen")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
