# =================================================================
#  HOFER TOOL — WIEDERHERSTELLEN
#
#  Spielt eine Sicherung ins SELBE Supabase-Projekt zurück:
#   1. die App-Datenbank aus  app-JJJJ-MM-TT.dump
#   2. die Live-Aktualisierung aus  live-JJJJ-MM-TT.txt
#   3. auf Wunsch die hochgeladenen Dateien aus dem Ordner Dateien
#
#  ACHTUNG: Schritt 1 ersetzt ALLE Daten der App durch den Stand der
#  Sicherung. Was seither eingetragen wurde, ist danach weg. Deshalb
#  fragt das Skript zweimal nach.
#
#  Die Anmeldekonten werden NICHT angefasst — im selben Projekt sind
#  sie noch da. Beim Umzug in ein neues Projekt bitte melden, dafür
#  braucht es zusätzliche Schritte.
# =================================================================

# ---------- Einstellungen: dieselben wie in sicherung.ps1 ----------

$Verbindung = "postgresql://postgres.lzhqwbxfwqamauntehof:PASSWORT@aws-0-eu-central-2.pooler.supabase.com:5432/postgres"
$SupabaseUrl      = "https://lzhqwbxfwqamauntehof.supabase.co"
$DienstSchluessel = "HIER-DEN-SERVICE-ROLE-KEY-EINSETZEN"
$Ziel  = "C:\Hofer\Sicherungen"
$PgBin = "C:\Program Files\PostgreSQL\17\bin"

$pgRestore = Join-Path $PgBin "pg_restore.exe"
$psql      = Join-Path $PgBin "psql.exe"

# ---------- Welche Sicherung? ----------

$staende = Get-ChildItem $Ziel -Filter "app-*.dump" | Sort-Object Name -Descending
if (-not $staende) { Write-Host "Keine Sicherung gefunden in $Ziel."; exit 1 }

Write-Host ""
Write-Host "Vorhandene Sicherungen (neueste zuerst):"
for ($i = 0; $i -lt [math]::Min(10, $staende.Count); $i++) {
    Write-Host ("  [{0}]  {1}   {2} KB" -f $i, $staende[$i].Name, [math]::Round($staende[$i].Length / 1KB))
}
$wahl = Read-Host "Nummer waehlen (Enter = neueste)"
if ($wahl -eq "") { $wahl = 0 }
$datei = $staende[[int]$wahl]
$datum = $datei.BaseName.Substring(4)

Write-Host ""
Write-Host "Zurueckgespielt wird: $($datei.Name)" -ForegroundColor Yellow
Write-Host "ALLE heutigen Daten der App werden durch diesen Stand ersetzt." -ForegroundColor Yellow
$ok = Read-Host "Zum Fortfahren WIEDERHERSTELLEN eintippen"
if ($ok -ne "WIEDERHERSTELLEN") { Write-Host "Abgebrochen, nichts veraendert."; exit 0 }

# ---------- 1. Datenbank ----------
# --clean entfernt die heutigen Tabellen, bevor die gesicherten
# angelegt werden. Einzelne Meldungen über Dinge, die Supabase selbst
# verwaltet, sind normal — entscheidend ist die Probe am Ende.
Write-Host ""
Write-Host "Spiele Datenbank zurueck ..."
& $pgRestore --dbname="$Verbindung" --clean --if-exists --no-owner --schema=public "$($datei.FullName)"
Write-Host "pg_restore beendet mit Code $LASTEXITCODE (Meldungen oben pruefen)."

# ---------- 2. Live-Aktualisierung ----------
$live = Join-Path $Ziel "live-$datum.txt"
if (Test-Path $live) {
    foreach ($t in (Get-Content $live | Where-Object { $_ })) {
        & $psql "$Verbindung" -q -c "alter publication supabase_realtime add table public.$t" 2>$null
        Write-Host "  Live-Aktualisierung: $t"
    }
}
& $psql "$Verbindung" -q -c "notify pgrst, 'reload schema'"

# ---------- 3. Dateien, nur wenn gewünscht ----------
$antwort = Read-Host "Auch die hochgeladenen Dateien zurueckspielen? (j/n)"
if ($antwort -eq "j") {
    $kopf = @{ "apikey" = $DienstSchluessel; "Authorization" = "Bearer $DienstSchluessel" }
    $dateien = Join-Path $Ziel "Dateien"
    $bereiche = Get-Content (Join-Path $dateien "speicherbereiche.json") -Raw | ConvertFrom-Json
    $typen = @{ ".pdf" = "application/pdf"; ".png" = "image/png"; ".jpg" = "image/jpeg";
                ".jpeg" = "image/jpeg"; ".webp" = "image/webp" }

    foreach ($b in $bereiche) {
        # Speicherbereich anlegen, falls er fehlt
        try {
            $neu = @{ id = $b.id; name = $b.id; public = [bool]$b.public } | ConvertTo-Json -Compress
            Invoke-RestMethod -Method Post -Headers $kopf -ContentType "application/json" `
              -Uri "$SupabaseUrl/storage/v1/bucket" -Body $neu | Out-Null
        } catch { }   # gibt es schon

        $ordner = Join-Path $dateien $b.id
        if (-not (Test-Path $ordner)) { continue }
        $n = 0
        Get-ChildItem $ordner -Recurse -File | ForEach-Object {
            $pfad = $_.FullName.Substring($ordner.Length + 1) -replace "\\", "/"
            $teile = ($pfad -split "/") | ForEach-Object { [uri]::EscapeDataString($_) }
            $art = $typen[$_.Extension.ToLower()]; if (-not $art) { $art = "application/octet-stream" }
            $h = $kopf.Clone(); $h["x-upsert"] = "true"
            Invoke-RestMethod -Method Post -Headers $h -ContentType $art -InFile $_.FullName `
              -Uri ("$SupabaseUrl/storage/v1/object/{0}/{1}" -f $b.id, ($teile -join "/")) | Out-Null
            $n++
        }
        Write-Host "  $($b.id): $n Dateien hochgeladen"
    }
}

# ---------- Probe ----------
Write-Host ""
Write-Host "Probe — Anzahl Zeilen in den wichtigsten Tabellen:"
& $psql "$Verbindung" -c "select 'jobs' as tabelle, count(*) from public.jobs union all select 'machines', count(*) from public.machines union all select 'hoco_parts', count(*) from public.hoco_parts union all select 'order_items', count(*) from public.order_items union all select 'production_records', count(*) from public.production_records"
Write-Host ""
Write-Host "Fertig. Jetzt die App oeffnen und pruefen — und zur Sicherheit"
Write-Host "pruefung.sql im SQL-Editor laufen lassen."
