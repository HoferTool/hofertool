# Umzug auf neues GitHub- und Supabase-Konto

Alles zieht mit: Aufträge, HOCO Nummern, Bestellungen, Ferien, Notizen,
Chat, Einstellungen, alle Logins samt Passwörtern und alle Dateien —
Zeichnungen, WBG, Einrichtblätter, Profilbilder.

Das alte Projekt wird dabei nur gelesen, nie verändert. Geht etwas
schief, läuft die App einfach weiter wie bisher.

**Zeitbedarf:** Vorbereitung etwa eine Stunde, der eigentliche Umzug
eine bis zwei Stunden — am besten an einem Abend, wenn niemand in der
App arbeitet.

---

## Teil A — Vorbereitung (an einem beliebigen Tag)

### A1. Neues Supabase-Projekt anlegen

1. Im **neuen** Supabase-Konto: **New project**
2. Name: `hofer-tool`
3. **Datenbank-Passwort:** ein langes, gut aufbewahren
4. **Region:** dieselbe wie beim alten Projekt. Im alten Projekt steht
   sie unter Project Settings → General. Ist es Frankfurt, wieder
   Frankfurt; Zürich wäre auch möglich, dann liegen die Daten in der Schweiz.
5. Plan: wie besprochen **Pro** — dann gibt es tägliche Sicherungen
   und keine Pause nach einer Woche ohne Zugriff

Sonst nichts anlegen. Das Projekt muss für den Umzug leer sein.

### A2. Anmeldung im neuen Projekt einstellen

Im **alten** Projekt nachschauen und im **neuen** gleich einstellen:

- **Authentication → Sign In / Providers → Email:** dieselben Haken,
  vor allem bei „Confirm email"
- **Authentication → URL Configuration → Site URL:** die neue Adresse
  der App, also `https://NEUER-BENUTZER.github.io/NEUES-REPO/`

### A3. Mir vier Angaben schicken

Damit baue ich dir die App für das neue Konto und die Weiterleitung:

1. die **Project URL** des neuen Projekts — Project Settings → API Keys,
   sieht aus wie `https://abcdefgh.supabase.co`
2. den **Publishable key** des neuen Projekts — gleiche Seite,
   beginnt mit `sb_publishable_`
3. den **Benutzernamen** des neuen GitHub-Kontos
4. den gewünschten **Namen des Repositorys**, zum Beispiel `hofer`

Diese vier sind nicht geheim, die stehen ohnehin in der App.
**Nicht schicken:** Datenbank-Passwörter und die service_role-Schlüssel.

### A4. Werkzeug bereitlegen

Auf dem Rechner, auf dem du den Umzug machst:

1. **PostgreSQL 17 Kommandozeilen-Werkzeuge.** Hast du für die Sicherung
   schon installiert, sonst: postgresql.org → Download → Windows →
   Installer, dabei nur „Command Line Tools" anhaken.
2. Ordner `C:\Hofer\Umzug` anlegen und `umzug.ps1` hineinlegen.
3. `umzug.ps1` mit dem Editor öffnen und oben unter **HIER EINTRAGEN**
   ausfüllen:

| Feld | woher |
|---|---|
| `ALT_HOST`, `ALT_USER` | altes Projekt → oben **Connect** → **Session pooler**: Host und User |
| `ALT_PASS` | Datenbank-Passwort des alten Projekts |
| `ALT_SERVICE` | altes Projekt → Project Settings → API Keys → **Legacy API keys** → `service_role` |
| `NEU_…` | dasselbe aus dem neuen Projekt |

Falls du das alte Datenbank-Passwort nicht mehr weisst: Project Settings
→ Database → **Reset database password**. Danach in `sicherung.ps1`
ebenfalls das neue eintragen.

---

## Teil B — Umzug (an einem Abend)

### B1. Alle aus der App

Allen Bescheid geben, dass die App für zwei Stunden nicht benutzt
wird. Pads an den Maschinen auf dem Startbildschirm lassen. Was
während des Umzugs in der alten App eingetragen wird, kommt nicht mit.

### B2. Umzugsprogramm laufen lassen

PowerShell öffnen:

```
cd C:\Hofer\Umzug
powershell -ExecutionPolicy Bypass -File .\umzug.ps1 -Schritt 1
```

Jeder Schritt sagt am Ende, wie es weitergeht. Der Reihe nach:

| Schritt | was passiert | Dauer |
|---|---|---|
| **1** | liest das alte Projekt aus: Aufbau, Daten, Logins, Regeln | 1–3 Minuten |
| **2** | spielt alles ins neue Projekt ein | 2–5 Minuten |
| **3** | kopiert alle Dateien | je nach Menge 5–30 Minuten |
| **4** | stellt gespeicherte Datei-Adressen aufs neue Projekt um | unter 1 Minute |
| **5** | vergleicht Tabelle für Tabelle alt gegen neu | unter 1 Minute |

Bei Schritt 5 muss vor jeder Tabelle **ok** stehen und am Schluss
**„Alles angekommen."**

**Bricht ein Schritt ab:** Er sagt, woran es liegt. Schick mir die
letzten Zeilen und die Datei `umzug-daten\umzug.log`. Schritt 2 lässt
sich nur in ein leeres Projekt einspielen; bricht er ab, wird nichts
halb übernommen. Schritt 3 lässt sich jederzeit neu starten und
überspringt, was schon kopiert ist.

### B3. App ins neue GitHub-Konto

1. Im **neuen** GitHub-Konto: **github.com/new/import**
2. Bei „Your old repository's clone URL":
   `https://github.com/syshen69/hofer`
3. Name: wie unter A3 angegeben, **Public**, **Begin import**
4. Danach im neuen Repository die `index.html` durch die ersetzen, die
   ich dir schicke: Datei anklicken → Stift → alles ersetzen, oder
   **Add file → Upload files**
5. **Settings → Pages → Branch: main, Ordner: / (root) → Save**
6. Nach ein bis zwei Minuten läuft die App unter
   `https://NEUER-BENUTZER.github.io/NEUES-REPO/`

### B4. Neue App prüfen

Mit deinem gewohnten Login anmelden — Passwort wie bisher — und kurz
durchklicken:

- Planwand: Aufträge da, eine Zeichnung öffnen
- Bestellungen und Einkauf: Einträge da
- Einstellungen → Nutzer: alle Personen da
- eine Testdatei hochladen und wieder löschen
- auf einem zweiten Gerät einen Auftrag verschieben — das erste Gerät
  zieht innert Sekunden nach

---

## Teil C — Umstellen

### C1. Alte Adresse weiterleiten

Im **alten** GitHub-Repository die `index.html` durch
`weiterleitung.html` ersetzen — die Datei hochladen und **index.html**
nennen. Ich schicke sie dir mit der neuen Adresse schon eingetragen.

Ab dann landet jeder, der die alte Adresse öffnet, bei der neuen:
Lesezeichen, die Pads an den Maschinen und auch Zurbrügg, dessen Gerät
dabei als externes erkannt bleibt.

### C2. Was sonst noch mit der Datenbank spricht

Überall die neue Adresse und den neuen Schlüssel eintragen:

- **Sicherung** — `sicherung.ps1`: Verbindung zum neuen Projekt
- **Dokumente-Abgleich** — `abgleich-einstellungen.json`:
  `supabase_url` und `anon_key` (der neue Publishable key). Das
  Dienstkonto ist mitgezogen, E-Mail und Passwort bleiben.
- **Solaranlage** — was auch immer die Werte in die Datenbank schreibt,
  braucht die neue Adresse und den neuen Schlüssel
- **Zurbrügg** — muss nichts tun, die Weiterleitung erledigt das

### C3. Einmal neu anmelden

Jeder meldet sich einmal neu an — mit derselben Kachel oder demselben
Passwort wie bisher. Was jedes Gerät nur für sich gespeichert hatte,
fängt an der neuen Adresse frisch an: die Einstellungen des Pad Mode an
den Maschinen, das Fehlerprotokoll und die gemerkte Anmeldung.

---

## Teil D — Aufräumen, nach einer Woche

- **Altes Supabase-Projekt pausieren:** Project Settings → General →
  Pause project. Nicht gleich löschen — es ist eure Sicherheitskopie.
  Nach einem Monat ohne Probleme löschen.
- **Altes GitHub-Repository** mit der Weiterleitung ein paar Monate
  stehen lassen, bis alle die neue Adresse haben.
- **Den Ordner `C:\Hofer\Umzug\umzug-daten` löschen.** Darin liegt die
  ganze Datenbank im Klartext, samt verschlüsselten Passwörtern.
- **In `umzug.ps1` die beiden service_role-Schlüssel löschen.** Mit
  denen kann man alles in der Datenbank lesen und ändern.
