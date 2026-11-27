# Folgebelege aus einem Auftrag im eigenen Browserfenster öffnen (1.944.1):
# das neue Fenster blieb leer, weil das Auftragsfenster den Lieferschein
# wieder zu sich holte (Patrick 27. November 2026: „ein leeres Fenster“).
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
exec(open("erp_test.py").read().split("def oben(pg)")[0])
SAAT2 = SAAT + """
TEST.daten.erp_belege = [
 { id:'au', typ:'auftrag', nr:'2026007002', partner_id:'k1', art:'einzel', status:'abgeschlossen', datum:'2026-09-18', daten:{ bestellung:'65260784' } },
 { id:'ls', typ:'lieferschein', nr:'2026015399', partner_id:'k1', art:'einzel', status:'abgeschlossen', datum:'2026-11-19', bezug_id:'au',
   daten:{ gewatec:{ Export:'0', Auftrag:'7135' }, gewicht:33.1659, verlauf:true, verpackung:'5 Geb. Gysin' } } ];
TEST.eigenesFenster = true;
TEST.daten.erp_positionen = [
 { id:'p1', beleg_id:'au', pos:1, artikel_id:'a1', menge:4550, preis:3.65, einheit:'Stk', daten:{ pe:1, idx:'B' } },
 { id:'p2', beleg_id:'ls', pos:1, artikel_id:'a1', menge:1290, einheit:'Stk', bezug_id:'p1', daten:{ pe:1, idx:'B', gewatec:{ Menge:'1290.0000' } } } ];
"""
SAAT = SAAT2
with sync_playwright() as p:
    br, pg, pf = start(p, True)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/erp"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash='#/erp'"); pg.wait_for_timeout(1000)
    pg.click("[data-erp-reiter='auftrag']"); pg.wait_for_timeout(500)
    with pg.expect_popup() as po: pg.locator("text=2026007002").first.click()
    w1 = po.value; pg.wait_for_timeout(800)
    print("popup1:", w1.locator("body").inner_text()[:120].replace(chr(10)," | "))
    w1.locator(".erp-folge button").first.click(); pg.wait_for_timeout(1500)
    seiten = pg.context.pages
    pruefe(len(seiten) == 3, "drittes Browserfenster für den Lieferschein: %d" % len(seiten))
    pruefe("Lieferschein 2026015399" in seiten[-1].locator("body").inner_text(), "Lieferschein steht im neuen Fenster, nicht leer")
    pruefe(w1.locator("[data-erp-beleg]").count() == 1, "Auftragsfenster behält nur den Auftrag")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler: " + ("; ".join(fehler) if fehler else "keine"))
