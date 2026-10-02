import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
KURZ = "Fatih muss gut schauen diese!"
LANG = " ".join(["Achtung: Spannzange nach 20'000 Stk wechseln, Kühlmittel prüfen, Masse 3 und 7 jede Stunde messen."] * 14)
def lauf(br, info, notiz, name):
    zusatz = """
    daten.hoco_type_data = daten.hoco_type_data || [];
    daten.jobs.forEach(j => { j.plan_note = %s; });
    daten.hoco_type_data.push(...daten.jobs.map(j => ({ hoco_nr: j.job_number, type_id: (daten.machines.find(m => m.id === j.machine_id) || {}).type_id, pad_info: %s })));
    """ % (repr(notiz), repr(info))
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width":1600,"height":900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const t = document.querySelector('#pad .pad-hocotext'); if (!t) return null;
      return { stufe: t.style.getPropertyValue('--pad-tg'), rollen: t.classList.contains('pad-hocotext--rollen'),
               schrift: getComputedStyle(t.querySelector('.pad-info p') || t).fontSize, passt: t.scrollHeight <= t.clientHeight + 1 }; }""")
    print(name, r)
    k = pg.locator("#pad .pad-karte2--hoco").bounding_box()
    pg.screenshot(path=f"s_pad_{name}.png", clip={"x": k["x"], "y": k["y"], "width": k["width"], "height": k["height"]})
    print("  Fehler:", f[:2] if f else "keine")
    pg.close()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    lauf(br, KURZ, "100'000 wöchentlich liefern ab KW08", "wenig")
    lauf(br, LANG, LANG[:600], "viel")
    br.close()
