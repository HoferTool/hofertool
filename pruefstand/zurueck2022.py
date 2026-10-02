import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Der Nachbau lernt den Oder-Filter, wie ihn die echte Datenbank anwendet
F = FAKE.replace("    or() { return b; },", "    or(t) { zustand.oder = t; return b; },")
F = F.replace("        if (zustand.von !== undefined) treffer = treffer.slice(zustand.von, zustand.bis + 1);",
"""        if (zustand.oder) {
          const teile = zustand.oder.split(',').map(x => x.split('.'));
          treffer = treffer.filter(z => teile.some(([feld, op, ...w]) => {
            const wert = w.join('.');
            if (op === 'is') return z[feld] === null || z[feld] === undefined;
            if (op === 'gte') return z[feld] && String(z[feld]) >= wert;
            return false; }));
        }
        if (zustand.von !== undefined) treffer = treffer.slice(zustand.von, zustand.bis + 1);""")
zusatz = """
(() => {   // abgeschlossene Aufträge aus dem Jahr 2022
  for (let k = 0; k < 60; k++) {
    const m = daten.machines[k % daten.machines.length];
    const d = new Date(2022, 2, 1 + k * 3);
    daten.jobs.push({ id: 'h' + k, job_number: '10022-' + String(k).padStart(4, '0'), machine_id: m.id,
      planned_from: iso(d), planned_days: 2, plan_status: 'fertig', ended_at: d.toISOString(), target_quantity: 100, color: 'blau' });
  }
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=F.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1800)
    balken2022 = "[...document.querySelectorAll('.pw-balken')].filter(b => (b.textContent || '').includes('10022-')).length"
    # Zeitregler auf März 2022 ziehen — wie ein Mensch mit der Maus, in Schritten
    r = pg.locator("#pw-zeit").bounding_box()
    w = pg.evaluate("(() => { const e = document.getElementById('pw-zeit'); return [Number(e.min), Number(e.max), Number(e.value)]; })()")
    x0 = r["x"] + 8 + (r["width"] - 16) * (w[2] - w[0]) / (w[1] - w[0]); y = r["y"] + r["height"] / 2
    pg.mouse.move(x0, y); pg.mouse.down()
    ziel = r["x"] + 10
    pg.mouse.move(ziel, y, steps=15); pg.mouse.up()
    pg.wait_for_timeout(300)
    print("gleich nach dem Ziehen, erster Tag:", pg.evaluate("(document.querySelector('.pw-zeile--kopf .pw-tag')||{}).textContent"),
          "| Monat:", pg.evaluate("(document.querySelector('.pw-zeile--monat .pw-monat, .pw-monat')||{}).textContent"))
    # Den Regler gezielt auf den 1. März 2022 stellen
    pg.evaluate("""() => { const e = document.getElementById('pw-zeit');
      for (let v = Number(e.min); v <= Number(e.max); v++) { e.value = v; e.dispatchEvent(new Event('input', {bubbles:true}));
        const m = (document.querySelector('.pw-monat') || {}).textContent || '';
        if (/März 2022/.test(m)) break; } }""")
    pg.wait_for_timeout(2500)
    print("März 2022 — Balken aus 2022 sichtbar:", pg.evaluate(balken2022),
          "| Monat:", pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
