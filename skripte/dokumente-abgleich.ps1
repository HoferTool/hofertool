# =================================================================
#  DOKUMENTE-ABGLEICH — Netzlaufwerk → Hofer Tool
#
#  Läuft auf einem Rechner, der dauernd an ist (etwa MGMT01), jede
#  Minute über die Aufgabenplanung. Holt sich aus der App den Ordner,
#  schaut nach neuen oder geänderten Dateien, lädt sie hoch und legt
#  sie nach denselben Regeln ab wie die App:
#
#     10844-0049.pdf            → Zeichnung der HOCO Nr.
#     10844-0049_WBG.pdf        → WBG an den offenen Aufträgen
#     10844-0049_EB_SW-20.pdf   → Einrichtblatt dieser Nummer auf SW-20
#     EB_SW-20.pdf              → Einrichtblatt-Vorlage des Typs
#     10844-0049 Foto.pdf       → Allgemein zur HOCO Nr.
#
#  Was an derselben Stelle lag, wird ersetzt. Die Dateien im Ordner
#  bleiben liegen, das Skript merkt sich nur, was es schon kennt.
#
#  Aufruf:
#     .\dokumente-abgleich.ps1            normaler Durchlauf
#     .\dokumente-abgleich.ps1 -Probe     zeigt nur, was es tun würde
#
#  Braucht daneben die Datei abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "abgleich-stand.json"
$protDatei  = Join-Path $ordnerHier "abgleich.log"
$hoechstensJeLauf = 100

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 2000) { $alle | Select-Object -Last 1500 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

$stand = @{ dateien = @{}; token = $null; ablauf = 0; auffrischen = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = $_.Value } }
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

# ---------- Anmelden ----------
function JetztSek { [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) }

function Anmelden {
  $jetzt = JetztSek
  if ($stand.token -and $stand.ablauf -gt ($jetzt + 120)) { return }
  $antw = $null
  if ($stand.auffrischen) {
    try {
      $antw = Invoke-RestMethod -Method Post -Uri "$U/auth/v1/token?grant_type=refresh_token" `
        -Headers @{ apikey = $KEY } -ContentType "application/json" `
        -Body (@{ refresh_token = $stand.auffrischen } | ConvertTo-Json)
    } catch { $antw = $null }
  }
  if (-not $antw) {
    $antw = Invoke-RestMethod -Method Post -Uri "$U/auth/v1/token?grant_type=password" `
      -Headers @{ apikey = $KEY } -ContentType "application/json" `
      -Body (@{ email = $E.email; password = $E.passwort } | ConvertTo-Json)
  }
  $stand.token = $antw.access_token
  $stand.auffrischen = $antw.refresh_token
  $stand.ablauf = $jetzt + [double]$antw.expires_in
  StandSichern
}

function Kopf { @{ apikey = $KEY; Authorization = "Bearer " + $stand.token } }

function Json($objekt) { [Text.Encoding]::UTF8.GetBytes(($objekt | ConvertTo-Json -Depth 5 -Compress)) }

function Lesen([string]$pfad) {
  $r = Invoke-RestMethod -Method Get -Uri "$U/rest/v1/$pfad" -Headers (Kopf)
  # Eine leere Antwort ist eine leere Liste, nicht eine Liste mit "nichts" darin
  return @($r | Where-Object { $null -ne $_ })
}
function Aendern([string]$methode, [string]$pfad, $objekt, [string]$prefer) {
  $h = Kopf
  if ($prefer) { $h["Prefer"] = $prefer }
  if ($objekt -ne $null) {
    Invoke-RestMethod -Method $methode -Uri "$U/rest/v1/$pfad" -Headers $h `
      -ContentType "application/json; charset=utf-8" -Body (Json $objekt) | Out-Null
  } else {
    Invoke-RestMethod -Method $methode -Uri "$U/rest/v1/$pfad" -Headers $h | Out-Null
  }
}
function W([string]$t) { [Uri]::EscapeDataString($t) }

# ---------- Regeln — genau wie in der App ----------
$VORGABE = @{
  zeichnung = @("zeichnung", "zng", "drawing", "zchn")
  wbg = @("wbg", "werkbegleitschein", "begleitschein")
  einrichtblatt = @("eb", "einrichtblatt", "einrichteblatt", "einrichten", "setup")
  allgemein = @()
  nurNummer = "zeichnung"
}

function Glatt([string]$t) { if (-not $t) { return "" }; return ($t.ToLower() -replace '[^a-z0-9äöü]', '') }

function Abstand([string]$a, [string]$b) {
  if ([Math]::Abs($a.Length - $b.Length) -gt 2) { return 3 }
  $d = New-Object 'int[,]' ($a.Length + 1), ($b.Length + 1)
  for ($i = 0; $i -le $a.Length; $i++) { $d[$i, 0] = $i }
  for ($j = 0; $j -le $b.Length; $j++) { $d[0, $j] = $j }
  for ($i = 1; $i -le $a.Length; $i++) {
    for ($j = 1; $j -le $b.Length; $j++) {
      $k = 1; if ($a[$i - 1] -eq $b[$j - 1]) { $k = 0 }
      $d[$i, $j] = [Math]::Min([Math]::Min($d[($i - 1), $j] + 1, $d[$i, ($j - 1)] + 1), $d[($i - 1), ($j - 1)] + $k)
    }
  }
  return $d[$a.Length, $b.Length]
}

function StichwortPasst($woerter, [string]$glattGanz, [string]$stichwort) {
  $s = Glatt $stichwort
  if (-not $s) { return $false }
  if ($s.Length -le 3) { return ($woerter -contains $s) }
  if ($glattGanz.Contains($s)) { return $true }
  foreach ($w in $woerter) { if ($w.Length -ge 4 -and (Abstand $w $s) -le 1) { return $true } }
  return $false
}

function Erkennen([string]$dateiname, $typen, $regeln) {
  $ohneEndung = [IO.Path]::GetFileNameWithoutExtension($dateiname)
  $hoco = $null; $rest = $ohneEndung
  $m = [regex]::Match($ohneEndung, '(\d{4,6})\s?-\s?(\d{3,5})')
  if ($m.Success) { $hoco = $m.Groups[1].Value + "-" + $m.Groups[2].Value; $rest = $ohneEndung.Replace($m.Value, " ") }

  $woerter = @(($rest -split '[^A-Za-z0-9ÄÖÜäöü]+') | ForEach-Object { Glatt $_ } | Where-Object { $_ })
  $glattGanz = Glatt $rest

  $typ = $null
  foreach ($t in $typen) {
    $n = Glatt $t.name
    if ($n.Length -ge 3 -and $glattGanz.Contains($n)) {
      if (-not $typ -or $n.Length -gt (Glatt $typ.name).Length) { $typ = $t }
    }
  }
  $ohneTyp = $glattGanz
  if ($typ) { $ohneTyp = ([regex]([regex]::Escape((Glatt $typ.name)))).Replace($glattGanz, "", 1) }

  $art = $null
  foreach ($k in @("wbg", "einrichtblatt", "zeichnung", "allgemein")) {
    foreach ($sw in @($regeln[$k])) {
      if (StichwortPasst $woerter $ohneTyp $sw) {
        if ($k -eq "allgemein") { $art = "sonstiges" } else { $art = $k }
        break
      }
    }
    if ($art) { break }
  }
  $sonstNichts = -not ($ohneTyp -replace '\d', '')
  if (-not $art) {
    if ($hoco -and $sonstNichts) {
      if ($regeln.nurNummer -eq "allgemein") { $art = "sonstiges" } else { $art = "zeichnung" }
    } else { $art = "sonstiges" }
  }
  $titel = (($rest -replace '_+', ' ') -replace '\s+', ' ').Trim()
  if (-not $titel) { if ($hoco) { $titel = $hoco } else { $titel = $ohneEndung } }

  return @{ hoco = $hoco; typ = $typ; art = $art; titel = $titel; passt = [bool]($hoco -or $typ) }
}

function ZielText($z) {
  $namen = @{ zeichnung = "Zeichnung"; wbg = "WBG"; einrichtblatt = "Einrichtblatt"; sonstiges = "Allgemein" }
  if (-not $z.passt) { return "keine HOCO Nr. und kein Typ erkannt" }
  if ($z.art -eq "einrichtblatt" -and $z.typ -and -not $z.hoco) { return "Einrichtblatt-Vorlage des Typs " + $z.typ.name }
  $t = $namen[$z.art]
  if ($z.hoco) { $t += " der HOCO Nr. " + $z.hoco }
  if ($z.typ) { $t += " auf dem Typ " + $z.typ.name }
  return $t
}

# ---------- Ablage ----------
function AblagePfad([string]$adresse) {
  $m = [regex]::Match([string]$adresse, '/object/public/zeichnungen/(.+)$')
  if ($m.Success) { return [Uri]::UnescapeDataString($m.Groups[1].Value.Split("?")[0]) }
  return $null
}

function NochVerwendet([string]$adresse) {
  $a = W $adresse
  foreach ($q in @("jobs?select=id&drawing_url=eq.$a&limit=1", "jobs?select=id&wbg_url=eq.$a&limit=1",
                   "hoco_parts?select=hoco_nr&zeichnung_url=eq.$a&limit=1",
                   "dokumente?select=id&datei_url=eq.$a&limit=1",
                   "machine_types?select=id&blatt_url=eq.$a&limit=1",
                   "hoco_type_data?select=hoco_nr&blatt_url=eq.$a&limit=1")) {
    try { if ((Lesen $q).Count -gt 0) { return $true } } catch { return $true }
  }
  return $false
}

function AblageLoeschen($adressen) {
  $frei = @()
  foreach ($u in ($adressen | Where-Object { $_ } | Select-Object -Unique)) {
    $p = AblagePfad $u
    if (-not $p) { continue }
    if (NochVerwendet $u) { continue }
    $frei += $p
  }
  if ($frei.Count -eq 0) { return }
  try {
    Invoke-RestMethod -Method Delete -Uri "$U/storage/v1/object/zeichnungen" -Headers (Kopf) `
      -ContentType "application/json" -Body (Json @{ prefixes = $frei }) | Out-Null
  } catch { Schreibe ("Alte Datei nicht gelöscht: " + $_.Exception.Message) }
}

function Hochladen($datei, $z) {
  $endung = $datei.Extension.TrimStart(".").ToLower()
  if (-not $endung) { $endung = "pdf" }
  $mime = @{ pdf = "application/pdf"; png = "image/png"; jpg = "image/jpeg"; jpeg = "image/jpeg";
             webp = "image/webp"; tif = "image/tiff"; tiff = "image/tiff";
             xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
             xlsm = "application/vnd.ms-excel.sheet.macroEnabled.12"; xls = "application/vnd.ms-excel" }[$endung]
  if (-not $mime) { $mime = "application/octet-stream" }
  $pfad = "dok/" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "-" + ([Guid]::NewGuid().ToString("N").Substring(0, 6)) + "." + $endung
  $h = Kopf; $h["x-upsert"] = "true"
  Invoke-RestMethod -Method Post -Uri "$U/storage/v1/object/zeichnungen/$pfad" -Headers $h `
    -ContentType $mime -InFile $datei.FullName | Out-Null
  $adresse = "$U/storage/v1/object/public/zeichnungen/$pfad"

  $art = $z.art; $hoco = $z.hoco; $typId = $null
  if ($z.typ) { $typId = $z.typ.id }

  # Was an derselben Stelle liegt
  $filter = "dokumente?select=id,datei_url,titel&art=eq." + (W $art)
  if ($hoco) { $filter += "&hoco_nr=eq." + (W $hoco) } else { $filter += "&hoco_nr=is.null" }
  if ($typId) { $filter += "&type_id=eq." + $typId } else { $filter += "&type_id=is.null" }
  $alte = @(Lesen $filter | Where-Object { $art -ne "sonstiges" -or (Glatt $_.titel) -eq (Glatt $z.titel) })
  $alteAdressen = @($alte | ForEach-Object { $_.datei_url })
  if ($alte.Count -gt 0) {
    Aendern "Delete" ("dokumente?id=in.(" + (($alte | ForEach-Object { $_.id }) -join ",") + ")") $null $null
  }
  Aendern "Post" "dokumente" @{ art = $art; hoco_nr = $hoco; type_id = $typId; titel = $z.titel;
                                dateiname = $datei.Name; datei_url = $adresse; groesse = $datei.Length } $null

  if ($art -eq "zeichnung" -and $hoco) {
    $t = @(Lesen ("hoco_parts?select=zeichnung_url&hoco_nr=eq." + (W $hoco)))
    if ($t.Count -gt 0 -and $t[0].zeichnung_url) { $alteAdressen += $t[0].zeichnung_url }
    Aendern "Patch" ("hoco_parts?hoco_nr=eq." + (W $hoco)) @{ zeichnung_url = $adresse } $null
    Aendern "Patch" ("jobs?job_number=eq." + (W $hoco)) @{ drawing_url = $adresse } $null
  }
  if ($art -eq "einrichtblatt" -and $typId -and -not $hoco) {
    $t = @(Lesen ("machine_types?select=blatt_url&id=eq." + $typId))
    if ($t.Count -gt 0 -and $t[0].blatt_url) { $alteAdressen += $t[0].blatt_url }
    Aendern "Patch" ("machine_types?id=eq." + $typId) @{ blatt_url = $adresse } $null
  }
  if ($art -eq "einrichtblatt" -and $typId -and $hoco) {
    $t = @(Lesen ("hoco_type_data?select=blatt_url&hoco_nr=eq." + (W $hoco) + "&type_id=eq." + $typId))
    if ($t.Count -gt 0 -and $t[0].blatt_url) { $alteAdressen += $t[0].blatt_url }
    Aendern "Post" "hoco_type_data?on_conflict=hoco_nr,type_id" @{ hoco_nr = $hoco; type_id = $typId; blatt_url = $adresse } "resolution=merge-duplicates"
  }
  if ($art -eq "wbg" -and $hoco) {
    $o = @(Lesen ("jobs?select=id,wbg_url&job_number=eq." + (W $hoco) + "&ended_at=is.null"))
    $o | ForEach-Object { if ($_.wbg_url) { $alteAdressen += $_.wbg_url } }
    Aendern "Patch" ("jobs?job_number=eq." + (W $hoco) + "&ended_at=is.null") @{ wbg_url = $adresse } $null
  }

  AblageLoeschen ($alteAdressen | Where-Object { $_ -and $_ -ne $adresse })

  try {
    Aendern "Post" "dokumente_verlauf" @{ dateiname = $datei.Name; art = $art; hoco_nr = $hoco;
      type_id = $typId; ziel = (ZielText $z); quelle = "pfad"; ersetzt = ($alteAdressen.Count -gt 0) } $null
  } catch { }
}

# ---------- Durchlauf ----------
$status = @{ zeit = (Get-Date).ToUniversalTime().ToString("o"); rechner = $env:COMPUTERNAME;
             dateien = 0; neu = 0; fehler = $null; ohne = @() }
try {
  Anmelden

  $konf = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(dok_pfad,dok_pfad_unterordner,dok_regeln)" |
    ForEach-Object { $konf[$_.schluessel] = $_.wert }
  $pfad = [string]$konf["dok_pfad"]
  if (-not $pfad) { throw "In der App ist noch kein Pfad eingetragen." }
  if (-not (Test-Path -LiteralPath $pfad)) { throw "Der Pfad $pfad ist von $env:COMPUTERNAME aus nicht erreichbar." }

  $regeln = @{}
  $VORGABE.Keys | ForEach-Object { $regeln[$_] = $VORGABE[$_] }
  if ($konf["dok_regeln"]) {
    $g = $konf["dok_regeln"] | ConvertFrom-Json
    $g.PSObject.Properties | ForEach-Object { $regeln[$_.Name] = $_.Value }
  }
  $typen = @(Lesen "machine_types?select=id,name")

  $rek = ($konf["dok_pfad_unterordner"] -eq "ja")
  $dateien = @(Get-ChildItem -LiteralPath $pfad -File -Recurse:$rek |
    Where-Object { $_.Extension -match '^\.(pdf|png|jpe?g|webp|tiff?|xlsx|xlsm|xls)$' })
  $status.dateien = $dateien.Count

  $erledigt = 0
  foreach ($d in $dateien) {
    $kennung = $d.LastWriteTimeUtc.Ticks.ToString() + "|" + $d.Length
    if ($stand.dateien[$d.FullName] -eq $kennung) { continue }       # schon bekannt
    if ($erledigt -ge $hoechstensJeLauf) { break }                    # den Rest beim nächsten Mal

    $z = Erkennen $d.Name $typen $regeln
    if (-not $z.passt) {
      $status.ohne += $d.Name
      if (-not $Probe) { $stand.dateien[$d.FullName] = $kennung }    # nicht jede Minute neu melden
      Schreibe ("übersprungen, nicht zuzuordnen: " + $d.Name)
      continue
    }
    if ($Probe) { Schreibe ($d.Name + "  →  " + (ZielText $z)); continue }

    try {
      Hochladen $d $z
      $stand.dateien[$d.FullName] = $kennung
      $status.neu++; $erledigt++
      Schreibe ($d.Name + "  →  " + (ZielText $z))
    } catch {
      Schreibe ("Fehler bei " + $d.Name + ": " + $_.Exception.Message)
      $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
    }
    StandSichern
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if (-not $Probe) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pfad_status";
      wert = ($status | ConvertTo-Json -Compress -Depth 3) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht gemeldet: " + $_.Exception.Message) }
  StandSichern
} else {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.dateien + " Dateien im Ordner, nichts hochgeladen.")
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
