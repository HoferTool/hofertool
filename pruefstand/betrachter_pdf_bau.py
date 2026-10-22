# Kleinstes gültiges PDF für die Tests: je Seite ein Rahmen und ein Kreuz
def pdf_bauen(b, h, seiten):
    # Kleinstes gültiges PDF: je Seite ein Rahmen und ein Kreuz
    obj = []
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(seiten))
    obj.append("<< /Type /Catalog /Pages 2 0 R >>")
    obj.append(f"<< /Type /Pages /Kids [{kids}] /Count {seiten} >>")
    for i in range(seiten):
        inhalt = f"4 w 0 0 1 RG 10 10 {b - 20} {h - 20} re S 1 0 0 RG 10 10 m {b - 10} {h - 10} l S"
        obj.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {b} {h}] /Contents {4 + 2 * i} 0 R >>")
        obj.append(f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream")
    aus = "%PDF-1.4\n"; pos = []
    for n, o in enumerate(obj, 1):
        pos.append(len(aus)); aus += f"{n} 0 obj\n{o}\nendobj\n"
    xref = len(aus)
    aus += f"xref\n0 {len(obj) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    aus += f"trailer\n<< /Size {len(obj) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return aus.encode("latin-1")
