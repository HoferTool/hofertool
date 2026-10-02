# =================================================================
#  HOFER TOOL — SICHERUNG
#
#  Sichert jede Nacht:
#   1. die ganze App-Datenbank: Tabellen, Daten, Regeln, Funktionen
#      (Datei  app-JJJJ-MM-TT.dump)
#   2. die Anmeldekonten, nur nötig beim Umzug in ein neues Projekt
#      (Datei  anmeldungen-JJJJ-MM-TT.sql)
#   3. alle hochgeladenen Dateien: Zeichnungen, WBGs, Bilder
#      (Ordner Dateien, nur neue werden geholt)
#
#  Sicherungen älter als 30 Tage werden gelöscht, die Dateien bleiben.
#
#  VORAUSSETZUNG: PostgreSQL 17 "Command Line Tools" installiert
#  (siehe Anleitung). Version 15 oder älter geht mit Supabase nicht.
#
#  ACHTUNG: Datenbank-Passwort und Dienstschlüssel stehen hier im
#  Klartext. Diese Datei bleibt auf diesem einen Rechner.
# =================================================================

# ---------- Einstellungen ----------

# Aus dem Supabase-Dashboard: Knopf "Connect" -> "Session pooler".
# [YOUR-PASSWORD] durch das Datenbank-Passwort ersetzen.
$Verbindung = "postgresql://postgres.yvbtgiqtndxqqxhjshnl:PASSWORT@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

$SupabaseUrl      = "https://yvbtgiqtndxqqxhjshnl.supabase.co"
$DienstSchluessel = "HIER-DEN-SERVICE-ROLE-KEY-EINSETZEN"   # derselbe wie im Solar-Log-Skript

$Ziel      = "C:\Hofer\Sicherungen"
$PgBin     = "C:\Program Files\PostgreSQL\17\bin"
$Behalten  = 30    # Tage

# ---------- Vorbereitung ----------

$ErrorActionPreference = "Stop"
$datum   = Get-Date -Format "yyyy-MM-dd"
$dateien = Join-Path $Ziel "Dateien"
$logbuch = Join-Path $Ziel "sicherung.log"
New-Item -ItemType Directory -Force -Path $Ziel, $dateien | Out-Null

function Notiz($text) {
    $zeile = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $text
    Write-Host $zeile
    Add-Content -Path $logbuch -Value $zeile
}

$pgDump = Join-Path $PgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    Notiz "FEHLER: pg_dump nicht gefunden unter $pgDump. PostgreSQL 17 Command Line Tools installieren."
    exit 1
}

$fehler = 0

# ---------- 1. App-Datenbank ----------
# Nur der Bereich "public": dort liegt alles, was die App ausmacht.
# Das Format "custom" ist gepackt und lässt sich gezielt zurückspielen.
$appDatei = Join-Path $Ziel "app-$datum.dump"
try {
    & $pgDump --dbname="$Verbindung" --schema=public --format=custom --no-owner --file="$appDatei"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump meldet Fehler $LASTEXITCODE" }
    $kb = [math]::Round((Get-Item $appDatei).Length / 1KB)
    Notiz "Datenbank gesichert: $appDatei ($kb KB)"
} catch {
    Notiz "FEHLER Datenbank: $($_.Exception.Message)"
    $fehler++
}

# ---------- 2. Anmeldekonten ----------
# Nur für den Fall, dass alles in ein NEUES Supabase-Projekt umzieht.
# Im selben Projekt bleiben die Konten erhalten und werden nicht
# zurückgespielt.
$authDatei = Join-Path $Ziel "anmeldungen-$datum.sql"
try {
    & $pgDump --dbname="$Verbindung" --data-only --table=auth.users --table=auth.identities `
              --column-inserts --file="$authDatei"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump meldet Fehler $LASTEXITCODE" }
    Notiz "Anmeldekonten gesichert: $authDatei"
} catch {
    Notiz "HINWEIS Anmeldekonten: $($_.Exception.Message)"
}

# ---------- 2b. Live-Aktualisierung ----------
# Welche Tabellen Supabase für die Live-Aktualisierung überwacht. Nach
# dem Zurückspielen müssen sie wieder in diese Liste — sonst zieht die
# Planwand fremde Änderungen nicht mehr von selbst nach.
try {
    $psql = Join-Path $PgBin "psql.exe"
    $liste = & $psql "$Verbindung" -At -c "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1"
    if ($LASTEXITCODE -ne 0) { throw "psql meldet Fehler $LASTEXITCODE" }
    $liste | Set-Content (Join-Path $Ziel "live-$datum.txt")
    Notiz ("Live-Tabellen gemerkt: " + (($liste | Where-Object { $_ }) -join ", "))
} catch {
    Notiz "HINWEIS Live-Tabellen: $($_.Exception.Message)"
}

# ---------- 3. Hochgeladene Dateien ----------
$kopf = @{ "apikey" = $DienstSchluessel; "Authorization" = "Bearer $DienstSchluessel" }

function Liste-Ordner($bucket, $praefix) {
    # Liefert alle Dateien eines Speicherbereichs, auch in Unterordnern
    $raus = @()
    $versatz = 0
    do {
        $koerper = @{ prefix = $praefix; limit = 1000; offset = $versatz;
                      sortBy = @{ column = "name"; order = "asc" } } | ConvertTo-Json -Compress
        $teil = Invoke-RestMethod -Method Post -Headers $kopf -ContentType "application/json" `
                  -Uri "$SupabaseUrl/storage/v1/object/list/$bucket" -Body $koerper
        foreach ($e in $teil) {
            $pfad = if ($praefix) { "$praefix/$($e.name)" } else { $e.name }
            if ($null -eq $e.id) { $raus += Liste-Ordner $bucket $pfad }   # Ordner
            else { $raus += $pfad }
        }
        $versatz += 1000
    } while ($teil.Count -eq 1000)
    return $raus
}

try {
    $buckets = Invoke-RestMethod -Headers $kopf -Uri "$SupabaseUrl/storage/v1/bucket"
    # Welche Speicherbereiche es gibt und ob sie öffentlich sind — fürs Zurückspielen
    $buckets | Select-Object id, public | ConvertTo-Json | Set-Content (Join-Path $dateien "speicherbereiche.json")

    $neu = 0; $gesamt = 0
    foreach ($b in $buckets) {
        foreach ($pfad in (Liste-Ordner $b.id "")) {
            $gesamt++
            $lokal = Join-Path (Join-Path $dateien $b.id) ($pfad -replace "/", "\")
            if (Test-Path $lokal) { continue }          # schon gesichert
            New-Item -ItemType Directory -Force -Path (Split-Path $lokal) | Out-Null
            $teile = ($pfad -split "/") | ForEach-Object { [uri]::EscapeDataString($_) }
            Invoke-WebRequest -Headers $kopf -OutFile $lokal -UseBasicParsing `
              -Uri ("$SupabaseUrl/storage/v1/object/{0}/{1}" -f $b.id, ($teile -join "/"))
            $neu++
        }
    }
    Notiz "Dateien: $gesamt vorhanden, $neu neu gesichert"
} catch {
    Notiz "FEHLER Dateien: $($_.Exception.Message)"
    $fehler++
}

# ---------- 4. Alte Sicherungen aufräumen ----------
Get-ChildItem $Ziel -File | Where-Object {
    ($_.Name -like "app-*.dump" -or $_.Name -like "anmeldungen-*.sql" -or $_.Name -like "live-*.txt") -and
    $_.LastWriteTime -lt (Get-Date).AddDays(-$Behalten)
} | ForEach-Object { Remove-Item $_.FullName; Notiz "Alt, gelöscht: $($_.Name)" }

if ($fehler -gt 0) { Notiz "Sicherung mit $fehler Fehler beendet."; exit 1 }
Notiz "Sicherung vollständig."
