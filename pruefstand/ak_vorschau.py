# QS Check (früher Anlagen Check) 1.62.0: alle Maschinen zusammen über die ganze Fläche,
# Material in Werkstofffarbe und Stückzahl „von“ (Wunsch Patrick,
# 15. Oktober 2026). Bilder für iPad quer, PC, Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("AK_BILDER", "")

DATEN = """() => {
  const D = TEST.daten;
  if (!D.machine_parks.find(x => x.id === 'p-ext'))
    D.machine_parks.push({ id: 'p-ext', name: 'Extern', is_active: true });
  const zahl = (pk) => D.machines.filter(x => x.park_id === pk && x.is_active !== false).length;
  const MAT = ['1.4305 Ø12', '1.4404 Ø8', 'CuZn39Pb3 Ø16', 'AlCuMgPb Ø20', '11SMnPb30 Ø10',
    'Ecobrass Ø14', 'TiAl6V4 Ø6', '1.4104 Ø18', 'CuNi18Zn20 Ø5'];
  for (const [pk, soll, typ] of [['p-lang', 20, 'Citizen L20'], ['p-kurz', 6, 'Index C100'], ['p-ext', 2, 'Star SR-20']]) {
    for (let i = zahl(pk); i < soll; i++) {
      const id = 'mx-' + pk + i;
      D.machines.push({ id, park_id: pk, name: typ, is_active: true, sort_order: 100 + i, type_id: null });
    }
  }
  D.machines.forEach((x, i) => { x.machine_number = String(101 + i); });
  D.jobs = D.jobs.filter(j => !j.ended_at || j.ended_at);  // alles behalten
  const ohne = new Set(D.jobs.filter(j => !j.ended_at).map(j => j.machine_id));
  let k = 0;
  D.machines.forEach((m, i) => {
    if (ohne.has(m.id) || i === 9) return;
    const ziel = [5000, 1200, 800, 20000, 3500, 10000][i % 6];
    const st = ['laeuft', 'laeuft', 'ruesten', 'laeuft', 'ruesten', 'geplant', 'laeuft'][i % 7];
    D.jobs.push({ id: 'jk' + i, machine_id: m.id, job_number: (10000 + i * 37) + '-0' + (300 + i),
      plan_status: st, ended_at: null, planned_from: '2026-10-0' + (1 + i % 9),
      started_at: '2026-10-01T04:00:00Z', target_quantity: ziel, material_bez: i === 4 ? '' : MAT[i % MAT.length],
      wbg_url: i % 3 ? null : 'x', drawing_url: i % 2 ? 'x' : null });
    if (st !== 'geplant') D.production_records.push({ id: 'pr' + i, machine_id: m.id, job_id: 'jk' + i,
      record_date: '2026-10-14', quantity: Math.round(ziel * ((i * 0.137) % 1)), updated_at: '2026-10-14T12:00:00Z' });
  });
}"""

def seite(br, b, h, mobil=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, timezone_id="Europe/Zurich",
                         has_touch=mobil, is_mobile=mobil, device_scale_factor=2 if mobil else 1)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-10-15T10:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate(DATEN)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.evaluate("document.getElementById('pad-knopf').click()")
    pg.wait_for_selector("#pad [data-padwo='qs']")
    pg.click("#pad [data-padwo='qs']")
    pg.wait_for_selector("#pad .pad-ak__karte"); pg.wait_for_timeout(700)
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, b, h, mobil in [("ipad-quer", 1180, 820, False), ("pc", 1920, 1080, False),
                              ("ipad-hoch", 820, 1180, False), ("handy", 390, 844, True)]:
        pg = seite(br, b, h, mobil)
        n = pg.locator("#pad .pad-ak__karte").count()
        nm = pg.evaluate("TEST.daten.machines.filter(m => m.is_active !== false).length")
        if n != nm: fehler.append(f"{name}: {n} Karten statt {nm}")
        if pg.locator("#pad [data-qspark]").count(): fehler.append(name + ": Parkwahl noch da")
        # Ganze Fläche: Karten füllen die Höhe (ausser am Handy, dort rollt es)
        r = pg.evaluate("""() => { const a = document.querySelector('#pad .pad-ak').getBoundingClientRect();
          const k = [...document.querySelectorAll('#pad .pad-ak__karte')].map(x => x.getBoundingClientRect());
          return { unten: Math.max(...k.map(x => x.bottom)), ende: a.bottom, rechts: Math.max(...k.map(x => x.right)), breite: a.right,
            ueber: [...document.querySelectorAll('#pad .pad-ak__innen')].filter(x => x.scrollWidth > x.clientWidth + 1).length,
            wer: [...document.querySelectorAll('#pad .pad-ak__innen > *')].filter(x => x.getBoundingClientRect().right > x.parentElement.getBoundingClientRect().right + 1 || x.scrollWidth > x.clientWidth + 1).map(x => x.className + ' ' + Math.round(x.scrollWidth) + '/' + Math.round(x.clientWidth)).slice(0, 3) }; }""")
        if not mobil and (r["ende"] - r["unten"] > 20): fehler.append(f"{name}: unten frei {r}")
        if r["breite"] - r["rechts"] > 20: fehler.append(f"{name}: rechts frei {r}")
        if r["ueber"]: fehler.append(f"{name}: {r['ueber']} Karten zu eng {r['wer']}")
        t = pg.inner_text("#pad .pad-ak")
        if "QS Check" not in pg.inner_text("#pad"): fehler.append(name + ": Titel nicht QS Check")
        # HOCO Nr. ganz lesbar, nicht abgeschnitten
        ab = pg.evaluate("[...document.querySelectorAll('#pad .pad-ak__hoco')].filter(e => e.scrollWidth > e.clientWidth + 1).length")
        if ab: fehler.append(f"{name}: {ab} HOCO Nr. abgeschnitten")
        if "von " not in t: fehler.append(name + ": kein „von“")
        # Karte in der Werkstofffarbe (V2A rot), keine Bezeichnung mehr
        hg = pg.evaluate("getComputedStyle(document.querySelector('#pad [data-qsmaschine] [data-qsauftrag]').closest('.pad-ak__karte')).backgroundColor")
        if hg in ("rgba(0, 0, 0, 0)", ""): fehler.append(name + ": Karte ohne Farbe " + hg)
        if "X10CrNiS" in t or "1.4305" in t: fehler.append(name + ": Materialbezeichnung noch da")
        if BILDER: pg.screenshot(path=f"{BILDER}/anlagen-check-{name}.png", full_page=False)
        # HOCO Nr. öffnet das Auftragsfenster
        knopf = pg.locator("#pad [data-qsauftrag]").first
        nr = knopf.inner_text(); knopf.click()
        try:
            pg.wait_for_selector(".dialog--auftrag", timeout=5000)
            if nr not in pg.inner_text(".dialog--auftrag"): fehler.append(name + ": falscher Auftrag im Fenster")
            # Quer und gross wie auf der Planwand, nicht schmal wie die Pad-Fenster
            bw = pg.evaluate("(() => { const r = document.querySelector('.dialog--auftrag').getBoundingClientRect(); return [r.width, r.height, innerWidth]; })()")
            if not mobil and ((bw[0] < bw[1] and bw[2] > 1000) or bw[0] < 0.8 * min(bw[2], 1180)): fehler.append(f"{name}: Auftragsfenster nicht quer und gross {bw}")
            pg.wait_for_timeout(800)
            if BILDER and name == "ipad-quer": pg.screenshot(path=f"{BILDER}/anlagen-check-fenster.png")
        except Exception:
            fehler.append(name + ": Auftragsfenster ging nicht auf")
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
