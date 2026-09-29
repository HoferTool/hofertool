# Prüfstand

Damit wird jede Version getestet, bevor sie ausgeliefert wird.

- `fake-supabase.js` bildet Supabase im Speicher nach (Tabellen, Filter,
  Anmeldung, Speicher). Die App lädt es anstelle der echten Bibliothek;
  nach draussen geht nichts. Die Testdaten sind erfunden.
- `pruefstand.py` startet einen kleinen Webserver auf dem Repo-Ordner und
  findet Chrome selbst (oder über `PRUEF_CHROME`).
- Die übrigen Skripte prüfen einzelne Bereiche mit Playwright und enden
  mit „Fehler: keine", wenn alles stimmt.

## Aufruf

```
pip install playwright        # einmalig; Chromium muss vorhanden sein
python3 pruefstand/alle.py    # alle Prüfungen
python3 pruefstand/extern.py  # nur eine
```

Getestet wird direkt die `index.html` im Repo, keine Kopie.
Bildschirmfotos landen in `pruefstand/bilder/` (nicht im Repo).
