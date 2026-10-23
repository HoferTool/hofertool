# Zeigt den Aufbau eines Einrichtblatts (Excel), ohne Inhalte preiszugeben:
# Platz-Nummern, Beschriftungen mit Doppelpunkt und bekannte Wörter im
# Klartext, alles andere nur als Platzhalter.
import re, sys, zipfile
LABEL = re.compile(r"^(T\d{2,4}|.{1,40}:|HD|Werkzeugwechsel|Werkzeug.?Protokoll.*|Programm.*|Path.*|Geometrie.*|"
                   r"Haupt.*|Gegen.*|Spindel.*|Revolver.*|Rücken.*|Kamm.*|Station.*|Hauptspindel|Gegenspindel|"
                   r"Standzeit|Tätigkeit|Mass|Hersteller|Werkzeug|Bemerk.*|Index.*|Typ.*|Pos.*|Nr\.?)$", re.I)

def maske(t):
    t = str(t).strip()
    if LABEL.match(t) or re.fullmatch(r"T\d{1,4}", t): return t
    if re.fullmatch(r"[\d'.,]+", t): return "#"
    if not re.search(r"\d", t) and len(t) <= 40: return t
    return "~" + str(len(t))

def xlsx(pfad):
    import openpyxl
    wb = openpyxl.load_workbook(pfad)
    for ws in wb.worksheets:
        print("  BLATT", ws.title, ws.sheet_state, ws.dimensions)
        if ws.sheet_state != "visible": continue
        pass
        for row in ws.iter_rows():
            teile = []
            for c in row:
                if c.value is None: continue
                if isinstance(c.value, str) and c.value.startswith("="): v = "=f"
                else: v = maske(c.value)
                f = c.fill.fgColor.rgb if c.fill and c.fill.fill_type == "solid" else None
                teile.append(f"{c.coordinate}:{v}" + (f"[{str(f)[-6:]}]" if f and isinstance(f, str) and f not in ("00000000",) else ""))
            if teile: print("   ", " | ".join(teile))
    with zipfile.ZipFile(pfad) as z:
        for n in z.namelist():
            if n.startswith("xl/drawings/drawing") and n.endswith(".xml"):
                x = z.read(n).decode("utf8", "ignore")
                anker = re.findall(r"<xdr:from><xdr:col>(\d+)</xdr:col>.*?<xdr:row>(\d+)</xdr:row>", x)
                texte = re.findall(r"<a:t>([^<]*)</a:t>", x)
                print("  Zeichnung", n, "Anker", len(anker), "Bilder", x.count("<xdr:pic>"), "Textfelder", [maske(t) for t in texte][:40])

def xls(pfad):
    import xlrd
    wb = xlrd.open_workbook(pfad, formatting_info=False)
    for ws in wb.sheets():
        print("  BLATT", ws.name, ws.visibility, ws.nrows, ws.ncols)
        if ws.visibility: continue
        for r in range(ws.nrows):
            teile = []
            for s in range(ws.ncols):
                v = ws.cell_value(r, s)
                if v in ("", None): continue
                teile.append(f"{xlrd.colname(s)}{r+1}:{maske(v)}")
            if teile: print("   ", " | ".join(teile))

for p in sys.argv[1:]:
    print("=====", p)
    try:
        (xls if p.endswith(".xls") else xlsx)(p)
    except Exception as e:
        print("  FEHLER", e)
