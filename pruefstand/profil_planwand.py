import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {
  for (let k = 0; k < 2300; k++) {
    const m = daten.machines[k % daten.machines.length];
    const d = new Date(Date.now() - (700 - Math.floor(k / daten.machines.length) * 4) * 86400000);
    daten.jobs.push({ id: 'alt' + k, job_number: '10500-' + String(k).padStart(4, '0'), machine_id: m.id,
      planned_from: iso(d), planned_days: 3, plan_status: k % 9 ? 'fertig' : 'geplant', ended_at: k % 9 ? d.toISOString() : null,
      target_quantity: 100, color: 'blau', material_bez: 'X10CrNiS18-9 rd 011 mm h8' });
  }
  for (let k = 0; k < 600; k++) daten.vacations.push({ id: 'v' + k, person: 'P' + (k % 40), zeile: 1,
    von: iso(new Date(Date.now() - (600 - k) * 86400000)), tage: 5, genehmigt: true });
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":1000}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(2500)
    cdp = pg.context.new_cdp_session(pg)
    cdp.send("Performance.enable")
    vorher = {m["name"]: m["value"] for m in cdp.send("Performance.getMetrics")["metrics"]}
    cdp.send("Profiler.enable"); cdp.send("Profiler.setSamplingInterval", {"interval": 200}); cdp.send("Profiler.start")
    t0 = pg.evaluate("performance.now()")
    # 40 Schritte am Zeitregler, wie beim Ziehen
    dauer = pg.evaluate("""async () => { const e = document.getElementById('pw-zeit'); const v0 = Number(e.value); const zeiten = [];
      for (let i = 1; i <= 40; i++) { const t = performance.now(); e.value = v0 - i * 3; e.dispatchEvent(new Event('input', {bubbles:true}));
        await new Promise(r => requestAnimationFrame(() => r())); zeiten.push(performance.now() - t); }
      return zeiten; }""")
    prof = cdp.send("Profiler.stop")["profile"]
    nachher = {m["name"]: m["value"] for m in cdp.send("Performance.getMetrics")["metrics"]}
    for k in ("ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"):
        print(f"  {k}: {round((nachher[k] - vorher[k]) * 1000)} ms")
    print("  Layouts:", nachher["LayoutCount"] - vorher["LayoutCount"], "| Stilberechnungen:", nachher["RecalcStyleCount"] - vorher["RecalcStyleCount"],
          "| Elemente im Dokument:", pg.evaluate("document.getElementsByTagName('*').length"))
    print("je Schritt ms: Mittel", round(sum(dauer) / len(dauer)), "| Max", round(max(dauer)), "| Balken auf der Tafel:", pg.evaluate("document.querySelectorAll('.pw-balken').length"),
          "| Zellen:", pg.evaluate("document.querySelectorAll('.pw-zelle').length"))
    # eigene Zeit je Funktion
    nodes = {n["id"]: n for n in prof["nodes"]}
    zeit = {}
    deltas = prof["timeDeltas"]; samples = prof["samples"]
    for s, dt in zip(samples, deltas):
        n = nodes[s]; name = n["callFrame"]["functionName"] or "(anonym)"; ln = n["callFrame"]["lineNumber"]
        key = f"{name}:{ln}"
        zeit[key] = zeit.get(key, 0) + dt
    tot = sum(zeit.values())
    for k, v in sorted(zeit.items(), key=lambda kv: -kv[1])[:18]:
        print(f"  {v/1000:7.0f} ms  {100*v/tot:5.1f}%  {k}")
    print("Umfang Tafel:", pg.evaluate("document.querySelector('.pw-rolle').innerHTML.length"), "Zeichen",
          "| je Balken:", pg.evaluate("Math.round([...document.querySelectorAll('.pw-balken')].reduce((n, b) => n + b.outerHTML.length, 0) / document.querySelectorAll('.pw-balken').length)"),
          "| Elemente in der Tafel:", pg.evaluate("document.querySelector('.pw-rolle').getElementsByTagName('*').length"))
    print("ein Balken:", pg.evaluate("document.querySelector('.pw-balken').outerHTML.slice(0, 900)"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
