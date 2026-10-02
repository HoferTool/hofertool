# Dokumente vom Netzlaufwerk automatisch in die App

Ein kleines Hilfsprogramm auf dem Server schaut jede Minute in einen
Ordner auf dem Netzlaufwerk. Neue oder geänderte Dateien lädt es hoch
und legt sie nach den Regeln ab, die ihr in der App unter
**Einstellungen → Dokumente** festlegt. Die Dateien im Ordner bleiben
liegen.

Rechne mit etwa zwanzig Minuten. Nichts muss installiert werden.

---

## 1. Datenbank vorbereiten

Im Supabase SQL-Editor `dienstkonto.sql` ausführen. Damit gibt es die
Rolle „Dienstkonto", die auf keiner Kachelwand erscheint.

## 2. Dienstkonto anlegen

1. Supabase → **Authentication → Users → Add user → Create new user**
2. E-Mail zum Beispiel `abgleich@hoferco.ch` — die Adresse muss es nicht
   wirklich geben
3. Ein langes Passwort, notieren
4. **Auto Confirm User** anhaken
5. In der App unter **Einstellungen → Nutzer** bei diesem Konto die
   Rolle **Dienstkonto** wählen

## 3. Pfad in der App eintragen

In der App unter **Einstellungen → Dokumente → Ordner auf dem
Netzlaufwerk** den Pfad eintragen, etwa `\\FS01\Daten\Zeichnungen`, bei
Bedarf „Unterordner einbeziehen" anhaken, **Pfad speichern**.

## 4. Hilfsprogramm ablegen

Auf dem Rechner, der dauernd läuft — etwa **MGMT01** — einen Ordner
`C:\Hofer\Abgleich` anlegen und hineinlegen:

- `dokumente-abgleich.ps1`
- `abgleich-einstellungen.json`

In `abgleich-einstellungen.json` eintragen:

- `supabase_url` — in Supabase unter **Project Settings → API**, „Project URL"
- `anon_key` — auf derselben Seite, „anon public"
- `email` und `passwort` — vom Dienstkonto aus Schritt 2

Die Datei enthält ein Passwort: Rechtsklick → Eigenschaften →
Sicherheit, und nur Administratoren und dem Konto aus Schritt 6 Zugriff
lassen.

## 5. Probelauf — lädt nichts hoch

PowerShell öffnen und:

```
cd C:\Hofer\Abgleich
powershell -ExecutionPolicy Bypass -File .\dokumente-abgleich.ps1 -Probe
```

Es listet jede Datei im Ordner mit dem Ziel, wohin sie ginge, etwa

```
10844-0049_WBG.pdf  →  WBG der HOCO Nr. 10844-0049
```

Stimmt das, weiter. Stimmt es nicht, die Regeln in der App anpassen
und den Probelauf wiederholen.

## 6. Jede Minute laufen lassen

**Aufgabenplanung → Aufgabe erstellen**

- **Allgemein:** Name `Hofer Dokumente-Abgleich`. „Unabhängig von der
  Benutzeranmeldung ausführen". Als Benutzer ein **Domänenkonto mit
  Leserecht auf den Ordner** wählen — nicht SYSTEM, das kommt nicht
  auf Netzlaufwerke.
- **Trigger:** Neu → Einmal, jetzt → „Wiederholen jede: 1 Minute",
  „für die Dauer von: Unbegrenzt"
- **Aktion:** Programm starten
  - Programm: `powershell.exe`
  - Argumente: `-NoProfile -ExecutionPolicy Bypass -File "C:\Hofer\Abgleich\dokumente-abgleich.ps1"`
  - Starten in: `C:\Hofer\Abgleich`
- **Einstellungen:** „Wenn die Aufgabe bereits ausgeführt wird: Keine
  neue Instanz starten"

## 7. Prüfen

In der App unter **Einstellungen → Dokumente** steht jetzt:

> ● Letzter Abgleich 29.09. 14:32 auf MGMT01 · 1'240 Dateien im Ordner · 3 neu abgelegt

Der Punkt ist grün, wenn die letzte Meldung weniger als fünf Minuten
alt ist, sonst orange. Darunter stehen Dateien, die das Programm nicht
zuordnen konnte. Im **Verlauf** darunter steht jede abgelegte Datei
mit „Netzlaufwerk" als Herkunft.

---

## Gut zu wissen

- **Beim ersten Mal** lädt es höchstens 100 Dateien pro Minute hoch,
  den Rest in den folgenden Minuten. Bei tausend Zeichnungen ist es
  nach etwa zehn Minuten durch.
- **Geänderte Dateien** — gleicher Name, neuer Inhalt — werden erneut
  hochgeladen und ersetzen die alte Fassung.
- **Gelöschte Dateien** im Ordner bleiben in der App. Das Programm
  nimmt nur auf, es räumt nicht ab.
- **Protokoll:** `C:\Hofer\Abgleich\abgleich.log`, die letzten
  rund 1'500 Zeilen.
- **Alles von vorn:** `abgleich-stand.json` löschen. Dann gilt jede
  Datei als neu, und alles wird ein weiteres Mal hochgeladen.

## Wenn etwas nicht geht

**„Der Pfad ist nicht erreichbar"** — Das Konto der Aufgabe hat kein
Recht auf den Ordner, oder der Pfad ist falsch geschrieben. Den Pfad
im Explorer unter demselben Konto öffnen.

**Kein Stand in der App** — Anmeldung fehlgeschlagen oder das
Dienstkonto darf die Einstellungen nicht schreiben. Im Protokoll steht,
woran es liegt. Schick mir die letzten Zeilen.

**Dateien werden falsch zugeordnet** — Regeln in der App anpassen.
Das Programm liest sie bei jedem Durchlauf neu.
