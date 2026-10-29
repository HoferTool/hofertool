# Startseite „Heute noch offen“ (1.186.0): Maschinen, deren laufender
# Auftrag heute noch keine Stückzahl hat, und solche ohne Stückzeit.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Zwei Aufträge laufen fest: m-k1 ohne Zählerstand heute, m-l1 mit
# Stand von heute. Stückzeit nur für den Auftrag auf m-l1.
K = """(() => {
  const heute = new Date(); const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  daten.jobs.forEach((j) => { if (j.plan_status === "laeuft") j.plan_status = "geplant"; });
  const a = daten.jobs.find((j) => j.machine_id === "m-k1");
  const b = daten.jobs.find((j) => j.machine_id === "m-l1");
  daten.production_records = daten.production_records.filter((r) => r.machine_id !== "m-k1");
  a.plan_status = "laeuft"; b.plan_status = "laeuft";
  daten.machines.forEach((m) => { if (m.id === "m-k1" || m.id === "m-l1") m.type_id = "t1"; });
  daten.production_records.push({ id: "prh", machine_id: "m-l1", job_id: b.id, record_date: iso(heute), quantity: 5, updated_at: new Date().toISOString() });
  daten.hoco_type_data.push({ hoco_nr: b.job_number, type_id: "t1", stueckzeit_s: 42 });
  const bild = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#4a7"/></svg>');
  daten.app_config.push({ schluessel: "pad_mahnbilder", wert: JSON.stringify({ stueckzahl: { bild }, stueckzeit: { bild } }) });
  // m-k2 steht in einem externen Park und läuft ohne Stand und Stückzeit:
  // die Karte nennt sie trotzdem nicht (1.192.0)
  daten.machine_parks.push({ id: "p-ext", name: "Extern", is_active: true });
  const x = daten.jobs.find((j) => j.machine_id === "m-k2");
  daten.machines.forEach((m) => { if (m.id === "m-k2") { m.park_id = "p-ext"; m.type_id = "t1"; } });
  x.plan_status = "laeuft";
  daten.production_records = daten.production_records.filter((r) => r.machine_id !== "m-k2");
  // Wird an der Maschine gerüstet, mahnt nichts (1.265.0): Rüsten weg
  daten.jobs.forEach((j) => { if (j.plan_status === "ruesten") j.plan_status = "geplant"; });
  window.A = a.job_number; window.B = b.job_number;
})();
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, name in [(1440, 900, "pc"), (390, 844, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = false;")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
        werktag = pg.evaluate("[1,2,3,4,5].includes(new Date().getDay())")
        stk = pg.evaluate("[...document.querySelectorAll('[data-heuteoffen=stk]')].map(b => b.dataset.maschine)")
        zeit = pg.evaluate("[...document.querySelectorAll('[data-heuteoffen=zeit]')].map(b => b.dataset.maschine)")
        print(name, "Stückzahl fehlt:", stk, "Stückzeit fehlt:", zeit)
        if werktag and ("m-k1" not in stk or "m-l1" in stk): fehler.append(f"{name}: Stückzahl {stk}")
        if "m-k2" in stk or "m-k2" in zeit: fehler.append(f"{name}: externe Maschine m-k2 steht da")
        if "m-k1" not in zeit or "m-l1" in zeit: fehler.append(f"{name}: Stückzeit {zeit}")
        n = pg.evaluate("document.querySelectorAll('#db-heuteoffen [data-mahnbild]').length")
        blinkt = pg.evaluate("getComputedStyle(document.querySelector('#db-heuteoffen'), '::after').animationName")
        print(name, "Bilder:", n, "Blinken:", blinkt)
        if n != 2: fehler.append(f"{name}: {n} Bilder statt 2")
        if blinkt != "pad-zeit-rot": fehler.append(f"{name}: blinkt nicht")
        pg.locator("#db-heuteoffen").screenshot(path=f"/tmp/heuteoffen-{name}.png")
        if name == "pc":
            # Antippen öffnet das Pad dieser Maschine
            pg.click("[data-heuteoffen=zeit][data-maschine=m-k1]"); pg.wait_for_timeout(1500)
            if not pg.evaluate("!!document.querySelector('[data-padfeld]')"): fehler.append("Pad geht nicht auf")
            pg.screenshot(path="/tmp/heuteoffen-pad.png")
        fehler += f; pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
