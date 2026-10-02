# Hofer Tool mit Claude Code weiterentwickeln

Dieses Paket gibt Claude Code alles mit, was es über das Hofer Tool wissen muss:

| Datei / Ordner | Inhalt |
|---|---|
| `VERLAUF.md` | Was bisher gebaut wurde, Version für Version |
| `CLAUDE.md` | Die Projektbeschreibung. Claude Code liest sie bei jedem Start selbst: Aufbau der App, Regeln, Entscheidungen, offene Punkte. |
| `DATENBANK.md` | Alle Tabellen, Sichten, Zugriffsregeln und Funktionen der Datenbank |
| `index.html`, `sw.js` | Die App, Version 111.9.2 |
| `pruefstand/` | Der Prüfstand: eine nachgebaute Datenbank und 24 automatische Prüfungen |
| `sql/` | Alle bisherigen SQL-Dateien und `steckbrief.sql` |
| `skripte/` | Die PowerShell-Programme: Abgleich, Sicherung, Verknüpfung, Weiterleitung |
| `anleitungen/` | Die Anleitungen: Netzlaufwerk, Mail, Sicherung, Umzug |
| `bilder/` | Logo, Symbol, Bildschirmfotos der Kurzanleitung |

Es sind **keine Passwörter oder geheimen Schlüssel** darin.

---

## Einrichten — einmalig, ohne etwas auf dem PC zu speichern

### 1. Die Dateien ins GitHub-Repository legen

1. Das ZIP öffnen (Doppelklick) — darin ist der Ordner `hofer-tool`.
2. Bei GitHub mit **HoferTool** anmelden, Repository **hofertool** öffnen.
3. **Add file → Upload files**.
4. **Den Inhalt** des Ordners `hofer-tool` (alle Dateien **und** Ordner, nicht den Ordner selbst) ins Fenster ziehen. Die vorhandene `index.html` und `sw.js` werden dabei ersetzt — es ist dieselbe Fassung, die schon online ist.
5. Unten **Commit changes**.

Danach kannst du das ZIP und den entpackten Ordner wieder löschen.

### 2. Claude Code im Web öffnen

1. **https://claude.ai/code** öffnen (oder in der Claude-App auf dem Handy: Claude Code) und mit deinem Claude-Konto anmelden.
2. Wenn es fragt: **GitHub verbinden** und die Claude GitHub App für das Repository **hofertool** erlauben.
3. Das Repository **HoferTool/hofertool** wählen.

Claude Code braucht ein bezahltes Claude-Abo, mit dem Gratis-Plan geht es nicht.

### 3. Der erste Auftrag

> Lies CLAUDE.md, VERLAUF.md und DATENBANK.md und fasse mir kurz zusammen, was das Hofer Tool ist und was noch offen ist.

Ab dann ganz normal beschreiben, was du willst. Claude Code arbeitet in einer eigenen Umgebung, testet dort mit dem Prüfstand und legt seine Änderungen ins Repository. Sag ihm, ob es direkt auf `main` speichern soll — dann ist die Änderung nach ein bis zwei Minuten online — oder ob es zuerst einen eigenen Zweig zum Anschauen machen soll.

## Im Alltag

- **Änderungen online stellen:** Was auf `main` landet, ist nach ein bis zwei Minuten unter https://hofertool.github.io/hofertool/ — im Browser einmal **Strg + F5** drücken.
- **SQL:** Claude Code legt neue SQL-Dateien in `sql/` ab. Die führst du wie bisher im Supabase SQL-Editor aus.
- **Datenbank-Beschreibung auffrischen:** `sql/steckbrief.sql` im SQL-Editor ausführen und das Ergebnis Claude Code geben.

## Wichtig

Das Repository ist **öffentlich**. Gib Claude Code keine Passwörter oder Secret Keys, damit sie nicht aus Versehen dort landen. Braucht ein Programm einen Schlüssel, trägst du ihn selbst ein — nur auf deinem Rechner, nicht im Repository.
