# =================================================================
#  DOKUMENTE — GEMEINSAME TEILE
#
#  Anmelden, Erkennen am Dateinamen und Hochladen, genau nach den
#  Regeln der App. Wird von dokumente-abgleich.ps1 (Netzlaufwerk) und
#  dokumente-pool.ps1 (Pool-Ordner) geladen, nicht selbst gestartet.
#  Das ladende Skript stellt $E, $U, $KEY, $stand, Schreibe und
#  StandSichern bereit.
# =================================================================

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

# Das Komma davor hält die Bytes zusammen. Ohne es zerlegt PowerShell die
# Rückgabe in einzelne Zahlen, und beim Server käme "123 34 …" an.
function Json($objekt) { return ,([Text.Encoding]::UTF8.GetBytes(($objekt | ConvertTo-Json -Depth 5 -Compress))) }

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

  # FA Nr.: eigene Zahl mit 7 bis 10 Ziffern, etwa "20268566 10007-0381". Steht nur auf WBGs.
  $fa = $null
  $mf = [regex]::Match($rest, '(?:^|\D)(\d{7,10})(?!\d)')
  if ($mf.Success) { $fa = $mf.Groups[1].Value }
  # Einrichtblätter sind immer Excel-Dateien
  $istExcel = $dateiname -match '\.(xlsx|xlsm|xls)$'

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
  if ($istExcel -and ($art -eq "zeichnung" -or $art -eq "wbg")) { $art = $null }
  if (-not $art -and $fa -and -not $istExcel) { $art = "wbg" }
  if (-not $art -and $istExcel -and ($hoco -or $typ)) { $art = "einrichtblatt" }
  $sonstNichts = -not ($ohneTyp -replace '\d', '')
  if (-not $art) {
    if ($hoco -and $sonstNichts) {
      if ($regeln.nurNummer -eq "allgemein") { $art = "sonstiges" } else { $art = "zeichnung" }
    } else { $art = "sonstiges" }
  }
  $titel = (($rest -replace '_+', ' ') -replace '\s+', ' ').Trim()
  if (-not $titel) { if ($hoco) { $titel = $hoco } else { $titel = $ohneEndung } }

  if ($art -ne "wbg") { $fa = $null }
  if ($fa) { $titel = "WBG FA " + $fa }
  return @{ hoco = $hoco; typ = $typ; art = $art; titel = $titel; fa = $fa; auftrag = $null; grund = "";
            passt = [bool]($hoco -or $typ -or $fa) }
}

# Offene Aufträge einer HOCO Nr., der nächste zuerst
function OffeneAuftraege([string]$hoco) {
  $l = @(Lesen ("jobs?select=id,job_number,fa_nr,machine_id,planned_from,wbg_url&ended_at=is.null&job_number=eq." + (W $hoco)))
  return @($l | Sort-Object @{ Expression = { if ($_.planned_from) { [string]$_.planned_from } else { "9999" } } })
}

# Was sich nur mit der Datenbank klären lässt, genau wie dokZielSuchen in der App:
#  - WBG mit FA Nr.: Steht die FA Nr. schon auf einem Auftrag, kommt die WBG
#    dorthin. Sonst an den nächsten offenen Auftrag der HOCO Nr. ohne FA Nr.,
#    und die FA Nr. wird dort eingetragen. Jede FA Nr. gibt es nur einmal.
#  - Einrichtblatt mit HOCO Nr., aber ohne Typ im Namen: Typ der Maschine
#    des nächsten offenen Auftrags dieser Nummer.
function ZielSuchen($z, $typen) {
  if ($z.art -eq "wbg" -and $z.fa) {
    $auftrag = $null
    $a = @(Lesen ("jobs?select=id,job_number,fa_nr,machine_id,planned_from,wbg_url&limit=1&fa_nr=eq." + (W $z.fa)))
    if ($a.Count -gt 0) { $auftrag = $a[0] }
    elseif ($z.hoco) {
      $auftrag = @(OffeneAuftraege $z.hoco | Where-Object { -not ([string]$_.fa_nr).Trim() }) | Select-Object -First 1
    }
    $z.auftrag = $auftrag
    if ($auftrag) { $z.hoco = $auftrag.job_number; $z.passt = $true }
    else {
      $z.passt = $false
      if ($z.hoco) { $z.grund = "kein offener Auftrag der HOCO Nr. " + $z.hoco + " ohne FA Nr." }
      else { $z.grund = "kein Auftrag mit der FA Nr. " + $z.fa + " und keine HOCO Nr. im Namen" }
    }
  }
  if ($z.art -eq "einrichtblatt" -and $z.hoco -and -not $z.typ) {
    foreach ($j in @(OffeneAuftraege $z.hoco)) {
      if (-not $j.machine_id) { continue }
      $m = @(Lesen ("machines?select=type_id&id=eq." + (W ([string]$j.machine_id))))
      if ($m.Count -gt 0 -and $m[0].type_id) {
        $tid = [string]$m[0].type_id
        $t = $typen | Where-Object { [string]$_.id -eq $tid } | Select-Object -First 1
        if (-not $t) { $t = @{ id = $m[0].type_id; name = "" } }
        $z.typ = $t
        break
      }
    }
  }
  return $z
}

# Braucht die Zuordnung einen Blick in die Aufträge?
function BrauchtZiel($z) {
  return (($z.art -eq "wbg" -and $z.fa) -or ($z.art -eq "einrichtblatt" -and $z.hoco -and -not $z.typ))
}

function ZielText($z) {
  $namen = @{ zeichnung = "Zeichnung"; wbg = "WBG"; einrichtblatt = "Einrichtblatt"; sonstiges = "Allgemein" }
  if (-not $z.passt) {
    if ($z.fa) { return "nicht zuzuordnen: " + $z.grund }
    return "keine HOCO Nr. und kein Typ erkannt"
  }
  if ($z.art -eq "wbg" -and $z.fa) {
    if ($z.auftrag) { return "WBG mit FA " + $z.fa + " an den Auftrag " + $z.auftrag.job_number + " vom " + $z.auftrag.planned_from }
    return "WBG mit FA " + $z.fa + " an den nächsten offenen Auftrag der HOCO Nr. " + $z.hoco
  }
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

function Hochladen($datei, $z, [string]$quelle) {
  if (-not $quelle) { $quelle = "pfad" }
  if ($z.art -eq "wbg" -and $z.fa -and -not $z.auftrag) { throw ("Nicht zuzuordnen: " + $z.grund) }
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
  # Allgemeines und WBG mit FA Nr. (je Auftrag eine) nur bei gleichem Titel ersetzen
  $nachTitel = ($art -eq "sonstiges") -or ($art -eq "wbg" -and $z.fa)
  $alte = @(Lesen $filter | Where-Object { -not $nachTitel -or (Glatt $_.titel) -eq (Glatt $z.titel) })
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
  if ($art -eq "wbg" -and $z.fa -and $z.auftrag) {
    # Nur dieser eine Auftrag bekommt WBG und FA Nr.
    if ($z.auftrag.wbg_url) { $alteAdressen += $z.auftrag.wbg_url }
    Aendern "Patch" ("jobs?id=eq." + (W ([string]$z.auftrag.id))) @{ wbg_url = $adresse; fa_nr = $z.fa } $null
  }
  elseif ($art -eq "wbg" -and $hoco) {
    $o = @(Lesen ("jobs?select=id,wbg_url&job_number=eq." + (W $hoco) + "&ended_at=is.null"))
    $o | ForEach-Object { if ($_.wbg_url) { $alteAdressen += $_.wbg_url } }
    Aendern "Patch" ("jobs?job_number=eq." + (W $hoco) + "&ended_at=is.null") @{ wbg_url = $adresse } $null
  }

  AblageLoeschen ($alteAdressen | Where-Object { $_ -and $_ -ne $adresse })

  try {
    Aendern "Post" "dokumente_verlauf" @{ dateiname = $datei.Name; art = $art; hoco_nr = $hoco;
      type_id = $typId; ziel = (ZielText $z); quelle = $quelle; ersetzt = ($alteAdressen.Count -gt 0) } $null
  } catch { }
}
